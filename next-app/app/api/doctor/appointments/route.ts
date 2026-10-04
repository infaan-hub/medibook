/** GET /api/doctor/appointments/ — doctor's own schedule (unpaginated). */
import { handler, ok } from "@/lib/route";
import { requireDoctor } from "@/lib/auth";
import { appointmentDto } from "@/lib/serializers";
import { notFound, badRequest } from "@/lib/errors";
import { findDoctorByUserId } from "@/repositories/doctors.repo";
import { isAppointmentStatus, listAppointmentsUnpaginated } from "@/repositories/appointments.repo";
import { sweepTimedOutEmergencies } from "@/services/emergency.service";

export const GET = handler(async (ctx) => {
  const user = await requireDoctor(ctx.req);
  const doctor = await findDoctorByUserId(user.id);
  if (!doctor) throw notFound("Create your doctor profile first.");

  // This list mixes normal bookings with EMERGENCY rows, so it must run the
  // 30-minute sweep first — otherwise a request the doctor never started keeps
  // showing here as `accepted` long after the patient was released and their
  // slot was re-dispatched to someone else.
  await sweepTimedOutEmergencies();

  const raw = new URL(ctx.req.url).searchParams.get("status") ?? undefined;
  if (raw !== undefined && !isAppointmentStatus(raw)) {
    throw badRequest(`Unknown status "${raw}".`);
  }
  const rows = await listAppointmentsUnpaginated({ doctor_id: doctor.id }, { status: raw });
  return ok(rows.map(appointmentDto));
});
