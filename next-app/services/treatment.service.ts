/**
 * Clinical service — medical treatments, health records, doctor patient
 * lists and visit history (port of treatments/views.py +
 * treatments/views_health_records.py). Strict server-side authorization:
 * patients only ever see their own records; doctors only their own uploads.
 */
import { forbidden, notFound, ValidationError } from "@/lib/errors";
import { healthRecordDto, patientDto, treatmentDto } from "@/lib/serializers";
import {
  healthRecordCreateSchema,
  treatmentCreateSchema,
  treatmentPatchSchema,
} from "@/validators/misc";
import { MISSING, parse } from "@/validators/base";
import * as clinical from "@/repositories/clinical.repo";
import * as doctors from "@/repositories/doctors.repo";
import * as appointments from "@/repositories/appointments.repo";
import { findPatientsByUserIds, getPatientProfile } from "@/repositories/users.repo";
import type { AuthUser } from "@/lib/auth";

/* ------------------------------ Treatments -------------------------------- */

const ownDoctor = (user: AuthUser) => doctors.findDoctorByUserId(user.id);

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
  const row = await clinical.createTreatment({
    doctor_id: doctor.id,
    patient_id: input.patient,
    appointment_id: input.appointment ?? null,
    diagnosis: input.diagnosis,
    treatment_notes: input.treatment_notes,
    prescription: input.prescription,
    follow_up_date: input.follow_up_date ?? null,
    follow_up_notes: input.follow_up_notes,
  });
  return { data: treatmentDto(row), message: "Treatment record created." };
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
  const row = doctor ? await clinical.findTreatmentOwned(id, doctor.id) : null;
  if (!row) return { data: null, message: "Treatment not found." };
  const input = parse(treatmentPatchSchema, body);
  const data: Record<string, unknown> = {};
  for (const key of ["diagnosis", "treatment_notes", "prescription", "follow_up_notes"] as const) {
    if (input[key] !== undefined) data[key] = input[key];
  }
  if (input.follow_up_date !== undefined) {
    data.follow_up_date = input.follow_up_date ? new Date(`${input.follow_up_date}T00:00:00Z`) : null;
  }
  if (input.patient !== undefined) data.patient_id = input.patient;
  if (input.appointment !== undefined) data.appointment_id = input.appointment;
  if (input.doctor !== undefined) data.doctor_id = input.doctor;
  const updated = await clinical.updateTreatment(id, data);
  return { data: treatmentDto(updated), message: "Treatment updated." };
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
    doctor.id,
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
  const doctor = user.role === "doctor" ? await ownDoctor(user) : null;
  return clinical.healthRecordWhere(user.role, user.id, doctor?.id ?? null, patientFilter);
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

