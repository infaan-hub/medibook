/**
 * Review service — submit a review for a completed visit, public doctor
 * reviews, own-review listing and deletion with rating recalculation
 * (port of reviews/views.py).
 */
import { ValidationError, notFound } from "@/lib/errors";
import { reviewDto } from "@/lib/serializers";
import { notify } from "@/lib/notify";
import { reviewCreateSchema } from "@/validators/misc";
import { parse } from "@/validators/base";
import * as notifications from "@/repositories/notifications.repo";
import * as doctors from "@/repositories/doctors.repo";
import * as appointments from "@/repositories/appointments.repo";
import type { AuthUser } from "@/lib/auth";

async function refreshDoctorRating(doctorId: number): Promise<void> {
  const aggregate = await doctors.ratingAggregate(doctorId);
  await doctors.saveDoctorRating(
    doctorId,
    aggregate._avg.rating ?? 0,
    aggregate._count.id
  );
}

/** POST /api/appointments/{id}/review/ — patient reviews a completed visit. */
export async function submitReview(req: Request, user: AuthUser, appointmentId: number, body: unknown) {
  const appointment = await appointments.findAppointmentById(appointmentId);
  if (!appointment) throw notFound(); // "The requested resource was not found."

  const input = parse(reviewCreateSchema, body);
  // ReviewSerializer.validate_appointment field checks (in order).
  if (appointment.status !== "completed") {
    throw new ValidationError({ appointment: ["Only completed appointments can be reviewed."] });
  }
  if (appointment.patient_id !== user.id) {
    throw new ValidationError({ appointment: ["You can only review your own appointments."] });
  }
  if (await notifications.reviewExistsForAppointment(appointmentId)) {
    throw new ValidationError({ appointment: ["This appointment already has a review."] });
  }

  const review = await notifications.createReview({
    appointment_id: appointmentId,
    patient_id: user.id,
    doctor_id: appointment.doctor_id,
    rating: input.rating,
    comment: input.comment ?? "",
  });
  await refreshDoctorRating(appointment.doctor_id);

  const doctor = await doctors.findDoctorById(appointment.doctor_id);
  if (doctor) {
    await notify(
      doctor.user_id,
      "review",
      `New ${review.rating}-star review received.`,
      appointment.id
    );
  }
  return reviewDto(review);
}

/** GET /api/doctors/{id}/reviews/ — public visible reviews (unpaginated). */
export async function publicDoctorReviews(req: Request, doctorId: number) {
  const doctor = await doctors.findDoctorById(doctorId);
  if (!doctor) throw notFound();
  const rows = await notifications.listVisibleReviews(doctorId);
  return rows.map((row) => reviewDto(row));
}

/** GET /api/reviews/{id}/ — own review (admin sees any); mirrors ReviewViewSet.retrieve. */
export async function retrieveReview(user: AuthUser, id: number) {
  const review = await notifications.findReviewById(id);
  const isAdmin = user.role === "admin" || user.is_superuser;
  if (!review || (!isAdmin && review.patient_id !== user.id)) throw notFound();
  return reviewDto(review);
}

/** DELETE /api/reviews/{id}/ — owner or admin; recalculates cached rating. */
export async function destroyReview(user: AuthUser, id: number): Promise<void> {
  const review = await notifications.findReviewById(id);
  const isAdmin = user.role === "admin" || user.is_superuser;
  if (!review || (!isAdmin && review.patient_id !== user.id)) throw notFound();
  const doctorId = review.doctor_id;
  await notifications.deleteReview(id);
  await refreshDoctorRating(doctorId);
}
