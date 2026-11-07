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
import { todayIso, secondsToTime, timeToSeconds } from "@/lib/dates";
import { broadcastAppointmentEvent, broadcastAvailabilityUpdated, notify } from "@/lib/notify";
import {
  healthRecordCreateSchema,
  treatmentCreateSchema,
  treatmentPatchSchema,
} from "@/validators/misc";
import { MISSING, parse } from "@/validators/base";
import * as clinical from "@/repositories/clinical.repo";
import * as doctors from "@/repositories/doctors.repo";
import * as appointments from "@/repositories/appointments.repo";
import { availableSlots, type Slot } from "@/services/schedule.service";
import { findPatientsByUserIds, getPatientProfile } from "@/repositories/users.repo";
import {
  normalizePrescriptionItems,
  prescriptionText,
  type PrescriptionItemInput,
} from "@/services/prescription.service";
import type { AuthUser } from "@/lib/auth";

/* ------------------------------ Treatments -------------------------------- */

const ownDoctor = (user: AuthUser) => doctors.findDoctorByUserId(user.id);

/* ----------------------- Follow-up appointment helpers ---------------------- */

const FOLLOW_UP_SLOT_SECONDS = 30 * 60;

type DoctorProfile = NonNullable<Awaited<ReturnType<typeof doctors.findDoctorByUserId>>>;

const isSlotConflict = (error: unknown): boolean =>
  error instanceof Prisma.PrismaClientKnownRequestError &&
  (error.code === "P2002" || error.meta?.constraint === "uniq_live_doctor_slot");

/**
 * Candidate times for an automatically-booked follow-up. Real open slots are
 * preferred; when the doctor has no availability window that day (or every
 * slot is taken) we still honour the doctor's follow-up date with the first
 * free half-hour in working hours, so the appointment the clinician promised
 * the patient actually exists in the system.
 */
async function followUpSlotCandidates(doctor: DoctorProfile, date: string): Promise<Slot[]> {
  const open = await availableSlots(doctor.id, doctor.is_available, date);
  if (open.length > 0) return open.slice(0, 5);

  const booked = await appointments.bookedSlotKeysForDate(doctor.id, date);
  const ranges = [...booked].map((key) => {
    const [start = "00:00:00", end = "00:00:00"] = key.split("|");
    return { start: timeToSeconds(start), end: timeToSeconds(end) };
  });
  const fallback: Slot[] = [];
  for (
    let seconds = 9 * 3600;
    seconds + FOLLOW_UP_SLOT_SECONDS <= 17 * 3600;
    seconds += FOLLOW_UP_SLOT_SECONDS
  ) {
    const overlaps = ranges.some(
      (range) => seconds < range.end && seconds + FOLLOW_UP_SLOT_SECONDS > range.start
    );
    if (!overlaps) {
      fallback.push({
        start_time: secondsToTime(seconds),
        end_time: secondsToTime(seconds + FOLLOW_UP_SLOT_SECONDS),
      });
    }
    if (fallback.length >= 5) break;
  }
  return fallback;
}

/**
 * Create the real, normal appointment behind a treatment's Follow-up Date.
 * Duplicate-safe: if the doctor already has a live appointment with the
 * patient that day we keep that one instead of booking a second. Returns null
 * when the date is in the past, the doctor is suspended, or no time is free —
 * the treatment itself is still saved in every case.
 */
async function createFollowUpAppointment(
  doctor: DoctorProfile,
  patientId: number,
  date: string,
  diagnosis: string,
  time?: string | null
) {
  if (date < todayIso() || !doctor.is_available) return null;

  const existing = await appointments.findLiveAppointmentForPatientOnDate(
    doctor.id,
    patientId,
    date
  );
  if (existing) return null;

  const reason = diagnosis.trim()
    ? `Follow-up: ${diagnosis.trim()}`.slice(0, 255)
    : "Follow-up visit";

  const normalizedTime = time && /^\d{1,2}:\d{2}(:\d{2})?$/.test(time.trim())
    ? time.trim().length === 5
      ? `${time.trim()}:00`
      : time.trim()
    : null;
  const candidates: Slot[] = [];
  if (normalizedTime) {
    const [h = "0", m = "0", s = "0"] = normalizedTime.split(":");
    const startSeconds = Number(h) * 3600 + Number(m) * 60 + Number(s);
    const endSeconds = startSeconds + FOLLOW_UP_SLOT_SECONDS;
    candidates.push({
      start_time: secondsToTime(startSeconds),
      end_time: secondsToTime(endSeconds),
    });
  }
  candidates.push(...(await followUpSlotCandidates(doctor, date)));

  for (const slot of candidates) {
    try {
      return await appointments.createAppointment({
        patient_id: patientId,
        doctor_id: doctor.id,
        hospital_id: null,
        appointment_date: date,
        start_time: slot.start_time,
        end_time: slot.end_time,
        reason,
        status: "accepted",
        appointment_type: "NORMAL",
      });
    } catch (error) {
      if (isSlotConflict(error)) continue;
      // Schedule failures must never discard a treatment the doctor just saved.
      return null;
    }
  }
  return null;
}

/** Tell the patient (and live clients) about a follow-up the doctor booked. */
async function announceFollowUpAppointment(
  doctor: DoctorProfile,
  patientId: number,
  appointment: NonNullable<Awaited<ReturnType<typeof createFollowUpAppointment>>>
): Promise<void> {
  const date = appointment.appointment_date.toISOString().slice(0, 10);
  const time = appointment.start_time.slice(0, 5);
  const doctorName =
    [doctor.user.first_name, doctor.user.last_name].filter(Boolean).join(" ") ||
    doctor.user.username;
  await notify(
    patientId,
    "appointment_confirmed",
    `Dr. ${doctorName} scheduled your follow-up appointment on ${date} at ${time}.`,
    appointment.id
  ).catch(() => undefined);
  broadcastAppointmentEvent(appointment, "appointment.created", [patientId, doctor.user_id]);
  broadcastAvailabilityUpdated(doctor.id, date);
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
  const followUpAppointment = input.follow_up_date
    ? await createFollowUpAppointment(
        doctor,
        input.patient,
        input.follow_up_date,
        input.diagnosis ?? "",
        input.follow_up_time
      )
    : null;
  if (followUpAppointment) {
    await announceFollowUpAppointment(doctor, input.patient, followUpAppointment);
  }

  return {
    data: {
      ...treatmentDto(row),
      follow_up_appointment: followUpAppointment ? appointmentDto(followUpAppointment) : null,
    },
    message: followUpAppointment
      ? "Treatment record created and follow-up appointment scheduled."
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
  const data: Record<string, unknown> = {};
  for (const key of ["diagnosis", "treatment_notes", "doctor_description", "prescription", "follow_up_notes"] as const) {
    if (input[key] !== undefined) data[key] = input[key];
  }
  if (input.follow_up_date !== undefined) {
    data.follow_up_date = input.follow_up_date ? new Date(`${input.follow_up_date}T00:00:00Z`) : null;
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
  const newFollowUp =
    input.follow_up_date !== undefined &&
    input.follow_up_date !== null &&
    input.follow_up_date !== previousFollowUp
      ? input.follow_up_date
      : null;

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

  // Moving a Follow-up Date books the new visit automatically, exactly like
  // creating a treatment does.
  const followUpAppointment = newFollowUp
    ? await createFollowUpAppointment(
        doctor,
        input.patient ?? row.patient_id,
        newFollowUp,
        input.diagnosis ?? row.diagnosis,
        input.follow_up_time
      )
    : null;
  if (followUpAppointment) {
    await announceFollowUpAppointment(
      doctor,
      input.patient ?? row.patient_id,
      followUpAppointment
    );
  }

  return {
    data: {
      ...treatmentDto(updated),
      follow_up_appointment: followUpAppointment ? appointmentDto(followUpAppointment) : null,
    },
    message: followUpAppointment
      ? "Treatment updated and follow-up appointment scheduled."
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
  const linked = await appointments.hasAppointmentsWithPatient(doctor.id, Number(patientId));
  if (!linked) return { data: [] as unknown[], message: "No appointments with this patient." };

  const { appointments: rows, treatments } = await clinical.listVisitHistory(
    Number(patientId)
  );
  const byAppointment = new Map<number, (typeof treatments)[number]>();
  for (const treatment of treatments) {
    if (treatment.appointment_id && !byAppointment.has(treatment.appointment_id)) {
      byAppointment.set(treatment.appointment_id, treatment);
    }
  }
  const data = rows.map((appointment) => {
    const treatment = byAppointment.get(appointment.id);
    return {
      appointment_id: appointment.id,
      appointment_date: appointment.appointment_date.toISOString().slice(0, 10),
      start_time: appointment.start_time,
      end_time: appointment.end_time,
      status: appointment.status,
      reason: appointment.reason,
      notes: appointment.notes,
      diagnosis: treatment?.diagnosis ?? null,
      treatment_notes: treatment?.treatment_notes ?? null,
      doctor_description: treatment?.doctor_description ?? null,
      prescription: treatment?.prescription ?? null,
      follow_up_date: treatment?.follow_up_date
        ? treatment.follow_up_date.toISOString().slice(0, 10)
        : null,
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

