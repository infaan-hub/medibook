/**
 * Clinical service — medical treatments, health records, doctor patient
 * lists and visit history (port of treatments/views.py +
 * treatments/views_health_records.py). Strict server-side authorization:
 * patients only ever see their own records; doctors only their own uploads.
 */
import { Prisma } from "@prisma/client";
import { forbidden, notFound, ValidationError } from "@/lib/errors";
import { prisma } from "@/lib/db";
import { appointmentDto, healthRecordDto, patientDto, treatmentDto } from "@/lib/serializers";
import { todayIso, normalizeTime, secondsToTime, timeToSeconds } from "@/lib/dates";
import {
  broadcastAppointmentEvent,
  broadcastAvailabilityUpdated,
  broadcastTreatmentUpdated,
  notify,
} from "@/lib/notify";
import {
  healthRecordCreateSchema,
  treatmentCreateSchema,
  treatmentPatchSchema,
} from "@/validators/misc";
import { healthRecordAppointmentPatchSchema } from "@/validators/clinical";
import { MISSING, parse } from "@/validators/base";
import * as clinical from "@/repositories/clinical.repo";
import * as doctors from "@/repositories/doctors.repo";
import * as appointments from "@/repositories/appointments.repo";
import { findPatientsByUserIds, getPatientProfile } from "@/repositories/users.repo";
import {
  normalizePrescriptionItems,
  prescriptionText,
  type PrescriptionItemInput,
} from "@/services/prescription.service";
import type { AuthUser } from "@/lib/auth";
import { createReminders } from "@/services/appointment.service";
import { after } from "next/server";
import { patientSnapshotForAppointment } from "@/lib/appointment-history";

/* ------------------------------ Treatments -------------------------------- */

const ownDoctor = (user: AuthUser) => doctors.findDoctorByUserId(user.id);

/* ----------------------- Follow-up appointment helpers ---------------------- */

// Appointment length only; start times are free-form minute values.
const FOLLOW_UP_DURATION_SECONDS = 30 * 60;
const FOLLOW_UP_RETRY_LIMIT = 2;
const FOLLOW_UP_STALE_PROCESSING_MS = 5 * 60 * 1000;

type DoctorProfile = NonNullable<Awaited<ReturnType<typeof doctors.findDoctorByUserId>>>;

const isSlotConflict = (error: unknown): boolean =>
  error instanceof Prisma.PrismaClientKnownRequestError &&
  (error.code === "P2002" || error.meta?.constraint === "uniq_live_doctor_slot");

class FollowUpSlotUnavailableError extends Error {}

/**
 * Create the real, normal appointment behind a treatment's Follow-up Date.
 * Duplicate-safe: only an appointment for this same patient, doctor, date,
 * and exact start time can be reused. The appointment is never moved to a
 * different slot than the doctor entered.
 */
async function createFollowUpAppointment(
  doctor: DoctorProfile,
  patientId: number,
  date: string,
  diagnosis: string,
  time: string
) {
  const startTime = normalizeTime(time);
  const startSeconds = timeToSeconds(startTime);
  if (
    date < todayIso() ||
    !/^\d{2}:\d{2}:\d{2}$/.test(startTime) ||
    startSeconds < 0 ||
    startSeconds + FOLLOW_UP_DURATION_SECONDS >= 24 * 60 * 60 ||
    new Date(`${date}T${startTime}Z`).getTime() <= Date.now()
  ) {
    throw new FollowUpSlotUnavailableError("Choose a valid future follow-up date and time.");
  }
  const endTime = secondsToTime(startSeconds + FOLLOW_UP_DURATION_SECONDS);
  const reason = diagnosis.trim()
    ? `Follow-up: ${diagnosis.trim()}`.slice(0, 255)
    : "Follow-up visit";

  const existing = await appointments.findLiveAppointmentForPatientOnDate(
    doctor.id,
    patientId,
    date,
    startTime
  );
  if (existing) {
    const updated = await appointments.updateAppointment(existing.id, {
      status: "accepted",
      reason,
    });
    return { appointment: updated, isNew: false };
  }

  const booked = await appointments.bookedSlotKeysForDate(doctor.id, date);
  const overlaps = [...booked].some((key) => {
    const [bookedStart = "00:00:00", bookedEnd = "00:00:00"] = key.split("|");
    return (
      startSeconds < timeToSeconds(bookedEnd) &&
      startSeconds + FOLLOW_UP_DURATION_SECONDS > timeToSeconds(bookedStart)
    );
  });
  if (overlaps) {
    throw new FollowUpSlotUnavailableError(
      "That follow-up time overlaps another appointment. Choose a different time."
    );
  }

  try {
    const created = await appointments.createAppointment({
      patient_id: patientId,
      doctor_id: doctor.id,
      hospital_id: null,
      appointment_date: date,
      start_time: startTime,
      end_time: endTime,
      reason,
      status: "accepted",
      appointment_type: "NORMAL",
      patient_snapshot: await patientSnapshotForAppointment(patientId),
    });
    return { appointment: created, isNew: true };
  } catch (error) {
    if (!isSlotConflict(error)) throw error;
    const raced = await appointments.findLiveAppointmentForPatientOnDate(
      doctor.id,
      patientId,
      date,
      startTime
    );
    if (!raced) {
      throw new FollowUpSlotUnavailableError(
        "That follow-up time was just booked. Choose a different time."
      );
    }
    const updated = await appointments.updateAppointment(raced.id, {
      status: "accepted",
      reason,
    });
    return { appointment: updated, isNew: false };
  }
}

/** Tell both sides about an accepted follow-up appointment. */
async function announceFollowUpAppointment(
  doctor: DoctorProfile,
  patientId: number,
  appointment: NonNullable<Awaited<ReturnType<typeof appointments.createAppointment>>>,
  isNew: boolean
): Promise<void> {
  const date = appointment.appointment_date.toISOString().slice(0, 10);
  const time = appointment.start_time.slice(0, 5);
  const doctorName =
    [doctor.user.first_name, doctor.user.last_name].filter(Boolean).join(" ") ||
    doctor.user.username;
  broadcastAppointmentEvent(
    appointment,
    isNew ? "appointment.created" : "appointment.updated",
    [patientId, doctor.user_id]
  );
  await notify(
    patientId,
    "appointment_confirmed",
    `Dr. ${doctorName} scheduled your follow-up appointment on ${date} at ${time}.`,
    appointment.id
  );
  broadcastAvailabilityUpdated(doctor.id, date);
}

/** Claim, book, notify, and persist a follow-up job. Safe to rerun from cron. */
export async function processFollowUpBooking(treatmentId: number): Promise<boolean> {
  const staleBefore = new Date(Date.now() - FOLLOW_UP_STALE_PROCESSING_MS);
  const claimed = await prisma.medicalTreatment.updateMany({
    where: {
      id: treatmentId,
      follow_up_date: { not: null },
      follow_up_booking_status: { in: ["pending", "processing"] },
      OR: [
        { follow_up_booking_status: "pending" },
        { follow_up_booking_status: "processing", updated_at: { lte: staleBefore } },
      ],
    },
    data: { follow_up_booking_status: "processing" },
  });
  if (claimed.count === 0) return false;

  const treatment = await prisma.medicalTreatment.findUnique({ where: { id: treatmentId } });
  const doctor = treatment ? await doctors.findDoctorById(treatment.doctor_id) : null;
  if (!treatment || !doctor || !treatment.follow_up_date || !treatment.follow_up_time) {
    if (treatment) {
      await prisma.medicalTreatment.update({
        where: { id: treatmentId },
        data: { follow_up_booking_status: "failed" },
      });
      broadcastTreatmentUpdated(treatmentId, [treatment.patient_id, doctor?.user_id], "failed");
      if (doctor) {
        await notify(
          doctor.user_id,
          "system",
          "The follow-up appointment could not be scheduled. Add a valid follow-up time and save the treatment again."
        ).catch(() => undefined);
      }
    }
    return false;
  }

  const date = treatment.follow_up_date.toISOString().slice(0, 10);
  const diagnosis = treatment.diagnosis;
  const patientId = treatment.patient_id;
  let result: Awaited<ReturnType<typeof createFollowUpAppointment>> | null = null;
  let failure: unknown = null;

  for (let attempt = 0; attempt < FOLLOW_UP_RETRY_LIMIT; attempt++) {
    try {
      result = await createFollowUpAppointment(
        doctor,
        patientId,
        date,
        diagnosis,
        treatment.follow_up_time
      );
      break;
    } catch (error) {
      failure = error;
      if (error instanceof FollowUpSlotUnavailableError) break;
      if (attempt + 1 < FOLLOW_UP_RETRY_LIMIT) {
        await new Promise((resolve) => setTimeout(resolve, 500 * (attempt + 1)));
      }
    }
  }

  if (!result) {
    const message =
      failure instanceof FollowUpSlotUnavailableError
        ? failure.message
        : "The appointment service is temporarily unavailable. Try saving the follow-up again.";
    await prisma.medicalTreatment.update({
      where: { id: treatmentId },
      data: { follow_up_booking_status: "failed" },
    });
    broadcastTreatmentUpdated(treatmentId, [patientId, doctor.user_id], "failed");
    await notify(doctor.user_id, "system", message).catch(() => undefined);
    return false;
  }

  const previousAppointmentId = treatment.follow_up_appointment_id;
  if (previousAppointmentId && previousAppointmentId !== result.appointment.id) {
    const previous = await appointments.findAppointmentById(previousAppointmentId);
    if (previous && (previous.status === "pending" || previous.status === "accepted")) {
      const cancelled = await appointments.updateAppointment(previous.id, {
        status: "cancelled",
        cancel_reason: "Follow-up appointment rescheduled by doctor.",
      });
      broadcastAppointmentEvent(cancelled, "appointment.updated", [patientId, doctor.user_id]);
      broadcastAvailabilityUpdated(
        doctor.id,
        previous.appointment_date.toISOString().slice(0, 10)
      );
    }
  }

  await createReminders(result.appointment);
  await prisma.medicalTreatment.update({
    where: { id: treatmentId },
    data: {
      follow_up_appointment_id: result.appointment.id,
    },
  });
  await announceFollowUpAppointment(doctor, patientId, result.appointment, result.isNew);
  await prisma.medicalTreatment.update({
    where: { id: treatmentId },
    data: { follow_up_booking_status: "scheduled" },
  });
  broadcastTreatmentUpdated(treatmentId, [patientId, doctor.user_id], "scheduled");
  return true;
}

/** Schedule work after the response; cron retries jobs interrupted by a cold shutdown. */
function scheduleFollowUpBooking(treatmentId: number): void {
  after(() => processFollowUpBooking(treatmentId));
}

/** Reconcile queued or abandoned follow-up jobs from the Vercel cron route. */
export async function processPendingFollowUpBookings(): Promise<number> {
  const staleBefore = new Date(Date.now() - FOLLOW_UP_STALE_PROCESSING_MS);
  const rows = await prisma.medicalTreatment.findMany({
    where: {
      follow_up_date: { not: null },
      follow_up_booking_status: { in: ["pending", "processing"] },
      OR: [
        { follow_up_booking_status: "pending" },
        { follow_up_booking_status: "processing", updated_at: { lte: staleBefore } },
      ],
    },
    select: { id: true },
    orderBy: { id: "asc" },
    take: 10,
  });
  for (const row of rows) {
    await processFollowUpBooking(row.id).catch((error) => {
      console.error(`Follow-up job ${row.id} will be retried by cron.`, error);
    });
  }
  return rows.length;
}

/**
 * Structured prescription payload on a treatment write: when the client sends
 * `items` / `prescription_notes` the legacy `prescription` column is re-rendered
 * from them and the row is stored/updated in the same transaction. Clients that
 * omit both keys keep the old free-text behaviour untouched.
 */
async function writePrescription(
  tx: Prisma.TransactionClient,
  treatment: { id: number; doctor_id: number; patient_id: number; appointment_id: number | null },
  options: { items: Required<PrescriptionItemInput>[]; notes: string; existingId: number | null }
) {
  const { items, notes, existingId } = options;
  if (items.length === 0) {
    if (existingId !== null) await tx.prescription.delete({ where: { id: existingId } });
    return;
  }
  const lines = items.map((item, index) => ({ ...item, sort_order: index }));
  if (existingId !== null) {
    await tx.prescriptionItem.deleteMany({ where: { prescription_id: existingId } });
    await tx.prescription.update({
      where: { id: existingId },
      data: { notes, items: { create: lines } },
    });
    return;
  }
  await clinical.createPrescription(
    {
      doctor_id: treatment.doctor_id,
      patient_id: treatment.patient_id,
      appointment_id: treatment.appointment_id,
      treatment_id: treatment.id,
      notes,
      items,
    },
    tx
  );
}

/** GET /api/treatments/?patient= — doctor's own treatment records. */
export async function listTreatments(user: AuthUser, patientId?: string) {
  const doctor = await ownDoctor(user);
  if (!doctor) return { data: [] as unknown[], message: "Doctor profile not found." };
  const rows = await clinical.listTreatments({
    doctor_id: doctor.id,
    ...(patientId ? { patient_id: Number(patientId) } : {}),
  });
  return { data: rows.map(treatmentDto), message: "" };
}

/** POST /api/treatments/ — doctor creates a treatment record. */
export async function createTreatment(user: AuthUser, body: unknown) {
  const doctor = await ownDoctor(user);
  if (!doctor) return { data: null, message: "Doctor profile not found." };
  const input = parse(treatmentCreateSchema, body);
  const patient = await getPatientProfile(input.patient).catch(() => null);
  if (!patient) {
    throw new ValidationError({ patient: [`Invalid pk "${input.patient}" - object does not exist.`] });
  }
  if (input.appointment !== undefined && input.appointment !== null) {
    const appointment = await appointments.findAppointmentById(input.appointment);
    if (!appointment) {
      throw new ValidationError({
        appointment: [`Invalid pk "${input.appointment}" - object does not exist.`],
      });
    }
    if (appointment.patient_id !== input.patient || appointment.doctor_id !== doctor.id) {
      throw forbidden("Treatments can only be attached to your appointment with this patient.");
    }
  }
  const structured = input.items !== undefined || input.prescription_notes !== undefined;
  const items = structured ? normalizePrescriptionItems(input.items ?? []) : [];
  const rxNotes = input.prescription_notes ?? "";
  const row = await prisma.$transaction(async (tx) => {
    const treatment = await clinical.createTreatment(
      {
        doctor_id: doctor.id,
        patient_id: input.patient,
        appointment_id: input.appointment ?? null,
        diagnosis: input.diagnosis,
        treatment_notes: input.treatment_notes,
        doctor_description: input.doctor_description,
        prescription: structured ? prescriptionText(items, rxNotes) : input.prescription,
        follow_up_date: input.follow_up_date ?? null,
        follow_up_time: input.follow_up_time ?? "",
        follow_up_booking_status: input.follow_up_date ? "pending" : null,
        follow_up_notes: input.follow_up_notes,
      },
      tx
    );
    if (structured) {
      await writePrescription(tx, treatment, {
        items,
        notes: rxNotes,
        existingId: null,
      });
    }
    return treatment;
  });

  // Follow-up Date is a real booking, not just a printed note: the patient
  // receives a normal appointment with this doctor on that date.
  // Runs in the background so saving the treatment never blocks on slot
  // lookup, booking, notifications, or realtime broadcasts.
  const bookingStatus = input.follow_up_date ? "pending" : null;

  if (input.follow_up_date) {
    scheduleFollowUpBooking(row.id);
  }

  return {
    data: {
      ...treatmentDto(row),
      follow_up_appointment: null,
      follow_up_booking_status: bookingStatus,
    },
    message: input.follow_up_date
      ? "Treatment record created. Follow-up appointment is being scheduled."
      : "Treatment record created.",
  };
}

/** GET/PATCH/DELETE /api/treatments/{id}/ — doctor's own records only. */
export async function retrieveTreatment(user: AuthUser, id: number) {
  const doctor = await ownDoctor(user);
  const row = doctor ? await clinical.findTreatmentOwned(id, doctor.id) : null;
  if (!row) return { data: null, message: "Treatment not found." }; // 200 + null (Django parity)
  return { data: treatmentDto(row), message: "" };
}

export async function patchTreatment(user: AuthUser, id: number, body: unknown) {
  const doctor = await ownDoctor(user);
  if (!doctor) return { data: null, message: "Treatment not found." };
  const row = await clinical.findTreatmentOwned(id, doctor.id);
  if (!row) return { data: null, message: "Treatment not found." };
  const input = parse(treatmentPatchSchema, body);
  if (input.appointment !== undefined && input.appointment !== null) {
    const appointment = await appointments.findAppointmentById(input.appointment);
    if (!appointment || appointment.doctor_id !== doctor.id || appointment.patient_id !== row.patient_id) {
      throw new ValidationError({ appointment: ["Choose an appointment for this patient with you."] });
    }
  }
  const data: Record<string, unknown> = {};
  for (const key of ["diagnosis", "treatment_notes", "doctor_description", "prescription", "follow_up_notes"] as const) {
    if (input[key] !== undefined) data[key] = input[key];
  }
  if (input.follow_up_date !== undefined) {
    data.follow_up_date = input.follow_up_date ? new Date(`${input.follow_up_date}T00:00:00Z`) : null;
  }
  if (input.follow_up_time !== undefined) {
    data.follow_up_time = input.follow_up_time ?? "";
  }
  if (input.patient !== undefined) data.patient_id = input.patient;
  if (input.appointment !== undefined) data.appointment_id = input.appointment;
  if (input.doctor !== undefined) data.doctor_id = input.doctor;

  const structured = input.items !== undefined || input.prescription_notes !== undefined;
  const existingRx = row.prescriptions?.[0] ?? null;
  let items: Required<PrescriptionItemInput>[] = [];
  let rxNotes = existingRx?.notes ?? "";
  if (structured) {
    items = normalizePrescriptionItems(input.items ?? []);
    if (input.prescription_notes !== undefined) rxNotes = input.prescription_notes;
    data.prescription = prescriptionText(items, rxNotes);
  }

  const previousFollowUp = row.follow_up_date
    ? row.follow_up_date.toISOString().slice(0, 10)
    : null;
  const targetDate =
    input.follow_up_date !== undefined
      ? (input.follow_up_date || null)
      : previousFollowUp;
  const previousFollowUpTime = row.follow_up_time ?? "";
  const timeChanged =
    input.follow_up_time !== undefined && input.follow_up_time !== previousFollowUpTime;
  const dateChanged =
    input.follow_up_date !== undefined && (input.follow_up_date || null) !== previousFollowUp;
  const followUpCleared =
    input.follow_up_date === null && previousFollowUp !== null;
  const shouldHandleFollowUp =
    (targetDate !== null && (dateChanged || timeChanged)) || followUpCleared;
  if (shouldHandleFollowUp) {
    data.follow_up_booking_status = targetDate ? "pending" : null;
  }

  const updated = await prisma.$transaction(async (tx) => {
    const treatment = await tx.medicalTreatment.update({
      where: { id },
      data,
      include: clinical.RX_INCLUDE,
    });
    if (structured) {
      await writePrescription(tx, treatment, {
        items,
        notes: rxNotes,
        existingId: existingRx?.id ?? null,
      });
    }
    return treatment;
  });

  // Follow-up schedule changes use the same exact-time booking worker as new
  // treatments. It creates the replacement first, then cancels the old slot.
  if (shouldHandleFollowUp) {
    if (targetDate) {
      scheduleFollowUpBooking(id);
    } else if (followUpCleared && row.follow_up_appointment_id) {
      after(async () => {
        const oldAppointment = await appointments
          .findAppointmentById(row.follow_up_appointment_id!)
          .catch(() => null);
        if (oldAppointment && (oldAppointment.status === "pending" || oldAppointment.status === "accepted")) {
          const cancelled = await appointments.updateAppointment(oldAppointment.id, {
            status: "cancelled",
            cancel_reason: "Follow-up appointment cancelled by doctor.",
          });
          broadcastAppointmentEvent(cancelled, "appointment.updated", [
            row.patient_id,
            doctor.user_id,
          ]);
          broadcastAvailabilityUpdated(
            doctor.id,
            oldAppointment.appointment_date.toISOString().slice(0, 10)
          );
          await notify(
            row.patient_id,
            "appointment_cancelled",
            `Dr. ${[doctor.user.first_name, doctor.user.last_name].filter(Boolean).join(" ") || doctor.user.username} cancelled your follow-up appointment.`,
            oldAppointment.id
          ).catch(() => undefined);
        }
        await prisma.medicalTreatment.update({
          where: { id },
          data: { follow_up_appointment_id: null },
        });
        broadcastTreatmentUpdated(id, [row.patient_id, doctor.user_id], null);
      });
    }
  }

  return {
    data: {
      ...treatmentDto(updated),
      follow_up_appointment: null,
    },
    message: shouldHandleFollowUp
      ? "Treatment updated. Follow-up appointment is being scheduled."
      : "Treatment updated.",
  };
}

export async function destroyTreatment(user: AuthUser, id: number) {
  const doctor = await ownDoctor(user);
  const row = doctor ? await clinical.findTreatmentOwned(id, doctor.id) : null;
  if (!row) return { data: null, message: "Treatment not found." };
  await clinical.deleteTreatment(id);
  return { data: null as null, message: "Treatment deleted." };
}

/** GET /api/treatments/patients/ — patients with appointments for me. */
export async function listDoctorPatients(user: AuthUser) {
  const doctor = await ownDoctor(user);
  if (!doctor) return { data: [] as unknown[], message: "Doctor profile not found." };
  const links = await clinical.listPatientUserIdsForDoctor(doctor.id);
  const ids = links.map((row) => row.patient_id);
  const patients = ids.length > 0 ? await findPatientsByUserIds(ids) : [];
  return { data: patients.map(patientDto), message: "" };
}

/**
 * GET /api/patients/linked-doctors/ — the doctors a patient can share health
 * records with (every doctor they have an appointment with). The same set is
 * re-checked server-side on upload, so the picker is never the only gate.
 */
export async function listLinkedDoctors(user: AuthUser) {
  const rows = await doctors.listDoctorsForPatient(user.id);
  return rows.map((doctor) => ({
    id: doctor.id,
    first_name: doctor.user.first_name,
    last_name: doctor.user.last_name,
    email: doctor.user.email,
    specialties: doctor.specialties.map((row) => row.specialty.name),
  }));
}

/** GET /api/treatments/visit-history/?patient= — timeline with treatments. */
export async function visitHistory(user: AuthUser, patientId?: string) {
  const doctor = await ownDoctor(user);
  if (!doctor) return { data: [] as unknown[], message: "Doctor profile not found." };
  if (!patientId) return { data: [] as unknown[], message: "Patient ID is required." };
  const rows = await clinical.listVisitHistory(doctor.id, Number(patientId));
  if (rows.length === 0) return { data: [] as unknown[], message: "No appointments with this patient." };
  const data = rows.map((appointment) => {
    const visitTreatments = appointment.treatments;
    const treatment = visitTreatments[0];
    return {
      appointment_id: appointment.id,
      appointment_date: appointment.appointment_date.toISOString().slice(0, 10),
      start_time: appointment.start_time,
      end_time: appointment.end_time,
      status: appointment.status,
      checked_in_at: appointment.checked_in_at?.toISOString() ?? null,
      consultation_started_at: appointment.consultation_started_at?.toISOString() ?? null,
      deleted_at: appointment.deleted_at?.toISOString() ?? null,
      booked_at: appointment.created_at.toISOString(),
      updated_at: appointment.updated_at.toISOString(),
      appointment_type: appointment.appointment_type,
      hospital_name: appointment.hospital?.name ?? null,
      emergency_reason: appointment.emergency_reason,
      emergency_description: appointment.emergency_description,
      emergency_location: appointment.emergency_latitude !== null && appointment.emergency_longitude !== null
        ? { latitude: appointment.emergency_latitude, longitude: appointment.emergency_longitude, accuracy: appointment.emergency_location_accuracy }
        : null,
      emergency_requested_at: appointment.emergency_requested_at?.toISOString() ?? null,
      emergency_accepted_at: appointment.emergency_accepted_at?.toISOString() ?? null,
      emergency_in_progress_at: appointment.emergency_in_progress_at?.toISOString() ?? null,
      emergency_completed_at: appointment.emergency_completed_at?.toISOString() ?? null,
      emergency_expired_at: appointment.emergency_expired_at?.toISOString() ?? null,
      reason: appointment.reason,
      notes: appointment.notes,
      cancel_reason: appointment.cancel_reason,
      patient: appointment.patient_snapshot ?? {
        patient_id: appointment.patient_id,
        first_name: appointment.patient.first_name,
        last_name: appointment.patient.last_name,
        email: appointment.patient.email,
        phone: appointment.patient.phone,
      },
      treatments: visitTreatments.map((row) => ({
        id: row.id,
        created_at: row.created_at.toISOString(),
        diagnosis: row.diagnosis,
        treatment_notes: row.treatment_notes,
        doctor_description: row.doctor_description,
        prescription: row.prescription,
        prescriptions: row.prescriptions.map((rx) => ({
          id: rx.id,
          notes: rx.notes,
          created_at: rx.created_at.toISOString(),
          items: rx.items.map((item) => ({
            medication: item.medication,
            dosage: item.dosage,
            frequency: item.frequency,
            route: item.route,
            duration_days: item.duration_days,
            instructions: item.instructions,
          })),
        })),
        follow_up_date: row.follow_up_date?.toISOString().slice(0, 10) ?? null,
        follow_up_time: row.follow_up_time,
      })),
      vitals: appointment.vitals.map((row) => ({
        id: row.id,
        recorded_at: row.recorded_at.toISOString(),
        blood_pressure: row.systolic_bp != null || row.diastolic_bp != null
          ? `${row.systolic_bp ?? "—"}/${row.diastolic_bp ?? "—"}`
          : null,
        pulse_bpm: row.pulse_bpm,
        temperature_c: row.temperature_c,
        glucose_mg_dl: row.glucose_mg_dl,
        weight_kg: row.weight_kg,
        height_cm: row.height_cm,
        bmi: row.bmi,
        spo2_percent: row.spo2_percent,
        notes: row.notes,
      })),
      lab_orders: appointment.lab_orders.map((row) => ({
        id: row.id,
        status: row.status,
        test_name: row.test_name,
        result_due_date: row.result_due_date?.toISOString().slice(0, 10) ?? null,
        unit: row.unit,
        reference_min: row.reference_min,
        reference_max: row.reference_max,
        result_value: row.result_value,
        result_notes: row.result_notes,
        notes: row.notes,
        ordered_at: row.ordered_at.toISOString(),
        resulted_at: row.resulted_at?.toISOString() ?? null,
      })),
      patient_reports: appointment.health_records.map((row) => ({
        id: row.id,
        record_type: row.record_type,
        title: row.title,
        description: row.description,
        created_at: row.created_at.toISOString(),
        file_name: row.file?.filename ?? null,
        file_content_type: row.file?.contentType ?? null,
      })),
      diagnosis: treatment?.diagnosis ?? null,
      treatment_notes: treatment?.treatment_notes ?? null,
      doctor_description: treatment?.doctor_description ?? null,
      prescription: treatment?.prescription ?? null,
      follow_up_date: treatment?.follow_up_date
        ? treatment.follow_up_date.toISOString().slice(0, 10)
        : null,
      follow_up_time: treatment?.follow_up_time ?? null,
      doctor_first_name: appointment.doctor.user.first_name,
      doctor_last_name: appointment.doctor.user.last_name,
    };
  });
  return { data: data as unknown[], message: "" };
}

/* ----------------------------- Health records ------------------------------ */

/** Role-scoped where-builder for GET /api/health-records/. */
export async function healthRecordScope(user: AuthUser, patientFilter?: string) {
  if (user.role !== "doctor") {
    return clinical.healthRecordWhere(user.role, user.id, null, patientFilter);
  }
  const doctor = await ownDoctor(user);
  if (!doctor) return clinical.healthRecordWhere("doctor", user.id, null, patientFilter);
  // Every patient this doctor treats: their own uploads plus anything shared
  // with another doctor for the same chart must still show up for them.
  const links = await clinical.listPatientUserIdsForDoctor(doctor.id);
  return clinical.healthRecordWhere(
    "doctor",
    user.id,
    doctor.id,
    patientFilter,
    links.map((row) => row.patient_id)
  );
}

/**
 * Who a health record belongs to / who it is shared with (pure — no I/O, so
 * tests/health-records.test.ts can cover the role rules directly):
 *
 *   doctor  → uploads FOR a patient (`patient` is required)
 *   patient → shares WITH a doctor (`doctor` is required); the subject is
 *             always the signed-in patient, so a client can never post
 *             clinical documents into someone else's chart.
 */
export type HealthRecordTarget =
  | { ok: true; role: "doctor"; patientId: number }
  | { ok: true; role: "patient"; doctorId: number }
  | { ok: false; field: string; message: string };

export function resolveHealthRecordTarget(
  role: string,
  userId: number,
  input: { patient?: number | null; doctor?: number | null }
): HealthRecordTarget {
  if (role === "doctor") {
    if (input.patient === undefined || input.patient === null) {
      return { ok: false, field: "patient", message: MISSING };
    }
    return { ok: true, role: "doctor", patientId: Number(input.patient) };
  }
  if (role === "patient") {
    if (input.doctor === undefined || input.doctor === null) {
      return {
        ok: false,
        field: "doctor",
        message: "Select the doctor you want to share this record with.",
      };
    }
    return { ok: true, role: "patient", doctorId: Number(input.doctor) };
  }
  return {
    ok: false,
    field: "non_field_errors",
    message: "Only doctors and patients can upload health records.",
  };
}

/**
 * POST /api/health-records/ — doctors upload FOR a patient, patients upload
 * and share WITH a specific doctor they already have an appointment with.
 * Optional file upload (documents and images) for both roles.
 */
export async function createHealthRecord(user: AuthUser, body: unknown, file?: File | null) {
  const input = parse(healthRecordCreateSchema, body);
  const target = resolveHealthRecordTarget(user.role, user.id, input);
  if (!target.ok) {
    if (target.field === "non_field_errors") throw forbidden(target.message);
    throw new ValidationError({ [target.field]: [target.message] });
  }

  let patientId: number;
  let doctorId: number;

  if (target.role === "doctor") {
    const doctor = await ownDoctor(user);
    if (!doctor) throw notFound("Doctor profile not found.");
    const patient = await getPatientProfile(target.patientId).catch(() => null);
    if (!patient) {
      throw new ValidationError({
        patient: [`Invalid pk "${target.patientId}" - object does not exist.`],
      });
    }
    patientId = target.patientId;
    doctorId = doctor.id;
  } else {
    const doctor = await doctors.findDoctorById(target.doctorId);
    if (!doctor) {
      throw new ValidationError({
        doctor: [`Invalid pk "${target.doctorId}" - object does not exist.`],
      });
    }
    // The record only ever reaches a doctor this patient has a booking with.
    const linked = await appointments.hasAppointmentsWithPatient(doctor.id, user.id);
    if (!linked) {
      throw forbidden("You can only share health records with a doctor you have an appointment with.");
    }
    patientId = user.id;
    doctorId = doctor.id;
  }

  if (input.appointment !== undefined && input.appointment !== null) {
    const appointment = await appointments.findAppointmentById(input.appointment);
    if (
      !appointment ||
      appointment.patient_id !== patientId ||
      appointment.doctor_id !== doctorId
    ) {
      throw new ValidationError({
        appointment: [`Invalid pk "${input.appointment}" - object does not exist.`],
      });
    }
  }

  let fileId: number | null = null;
  if (file && file.size > 0) {
    const { uploadImage } = await import("@/lib/media/uploadImage");
    const media = await uploadImage(file, {
      subdir: "health_records",
      ownerId: user.id,
      kind: "file", // documents as well as images (bytes still sniffed)
    });
    fileId = media.id;
  }
  return clinical.createHealthRecord({
    patient_id: patientId,
    doctor_id: doctorId,
    appointment_id: input.appointment ?? null,
    file_id: fileId,
    record_type: input.record_type ?? "other",
    title: input.title,
    description: input.description ?? "",
  });
}

/** Attach a doctor-owned report to the visit explicitly selected in the chart. */
export async function attachHealthRecordToAppointment(user: AuthUser, id: number, body: unknown, req: Request) {
  const doctor = await ownDoctor(user);
  if (!doctor) throw notFound("Record not found.");
  const row = await clinical.findHealthRecord(id, doctor.id);
  if (!row) throw notFound("Record not found.");
  const { appointment: appointmentId } = parse(healthRecordAppointmentPatchSchema, body);
  const appointment = await appointments.findAppointmentById(appointmentId);
  if (!appointment || appointment.doctor_id !== doctor.id || appointment.patient_id !== row.patient_id) {
    throw new ValidationError({ appointment: ["Choose an appointment for this patient with you."] });
  }
  const updated = await clinical.updateHealthRecord(id, { appointment_id: appointment.id });
  return { data: healthRecordDto(updated, req), message: "Report attached to appointment." };
}

/** DELETE /api/health-records/{id}/ — owning doctor only (204). */
export async function destroyHealthRecord(user: AuthUser, id: number): Promise<void> {
  const doctor = await ownDoctor(user);
  if (!doctor) throw notFound("Record not found.");
  const row = await clinical.findHealthRecord(id, doctor.id);
  if (!row) throw notFound("Record not found.");
  // Record + its uploaded file go away together (one transaction): the file
  // row is only removed once nothing references it anymore.
  const { deleteMediaIfUnreferenced } = await import("@/lib/media/uploadImage");
  const { prisma } = await import("@/lib/db");
  await prisma.$transaction(async (tx) => {
    await clinical.deleteHealthRecord(id, tx);
    await deleteMediaIfUnreferenced(row.file_id, tx);
  });
}

export { healthRecordDto };

