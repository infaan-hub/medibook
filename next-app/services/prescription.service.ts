/**
 * Prescription service — structured e-prescriptions (phase 1).
 *
 * A prescription is an ordered list of medication lines owned by the issuing
 * doctor and readable by the patient it belongs to. The legacy free-text
 * `MedicalTreatment.prescription` column is kept in sync as a plain-text
 * rendering of the same items, so every older screen (visit history, patient
 * chart, printed summaries) still shows the medication.
 */
import { forbidden, notFound, ValidationError } from "@/lib/errors";
import { prescriptionDto } from "@/lib/serializers";
import {
  prescriptionCreateSchema,
  prescriptionPatchSchema,
} from "@/validators/clinical";
import { MISSING, parse } from "@/validators/base";
import * as clinical from "@/repositories/clinical.repo";
import * as appointments from "@/repositories/appointments.repo";
import * as doctors from "@/repositories/doctors.repo";
import { getPatientProfile } from "@/repositories/users.repo";
import type { AuthUser } from "@/lib/auth";

export interface PrescriptionItemInput {
  medication: string;
  dosage?: string;
  frequency?: string;
  route?: string;
  duration_days?: number | null;
  refills?: number;
  instructions?: string;
}

/* ------------------------------- Pure helpers ------------------------------ */

/**
 * Trims every field and drops blank optional values, so "500 mg " never
 * reaches the database and an all-space medication line is rejected upstream
 * by the schema (min 1 non-blank char).
 */
export function normalizePrescriptionItems(
  items: PrescriptionItemInput[]
): Required<PrescriptionItemInput>[] {
  return items.map((item) => ({
    medication: item.medication.trim(),
    dosage: (item.dosage ?? "").trim(),
    frequency: (item.frequency ?? "").trim(),
    route: (item.route ?? "").trim(),
    duration_days: item.duration_days ?? null,
    refills: item.refills ?? 0,
    instructions: (item.instructions ?? "").trim(),
  }));
}

/**
 * Plain-text rendering stored in `MedicalTreatment.prescription`:
 *
 *   Amoxicillin 500 mg — 3 times daily, oral, 7 days
 *     Take with food.
 *   Paracetamol 500 mg — as needed, 3 days
 *
 *   Notes…
 */
export function prescriptionText(
  items: PrescriptionItemInput[],
  notes = ""
): string {
  const lines = items.map((item) => {
    const drug = item.dosage ? `${item.medication} ${item.dosage}` : item.medication;
    const tail = [
      item.frequency,
      item.route,
      item.duration_days ? `${item.duration_days} days` : "",
      item.refills ? `${item.refills} refill${item.refills === 1 ? "" : "s"}` : "",
    ].filter(Boolean);
    const head = tail.length > 0 ? `${drug} — ${tail.join(", ")}` : drug;
    return item.instructions ? `${head}\n  ${item.instructions}` : head;
  });
  const body = lines.join("\n");
  if (!notes) return body;
  return body ? `${body}\n\n${notes}` : notes;
}

/**
 * Whom a prescription belongs to / whom it is readable by (pure — the POST
 * gate for /api/prescriptions/, mirroring resolveHealthRecordTarget):
 *
 *   doctor  → may issue one FOR a named patient (`patient` required)
 *   patient → may never issue one; reading is gated by prescriptionWhere()
 */
export type PrescriptionTarget =
  | { ok: true; role: "doctor"; patientId: number }
  | { ok: false; field: string; message: string };

export function resolvePrescriptionTarget(
  role: string,
  input: { patient?: number | null }
): PrescriptionTarget {
  if (role === "doctor") {
    if (input.patient === undefined || input.patient === null) {
      return { ok: false, field: "patient", message: MISSING };
    }
    return { ok: true, role: "doctor", patientId: Number(input.patient) };
  }
  return {
    ok: false,
    field: "non_field_errors",
    message: "Only doctors can issue prescriptions.",
  };
}

/* --------------------------------- Reads ---------------------------------- */

const ownDoctor = (user: AuthUser) => doctors.findDoctorByUserId(user.id);

/** GET /api/prescriptions/ — a doctor's issued prescriptions. */
export async function listPrescriptions(user: AuthUser, patientFilter?: string) {
  const doctor = await ownDoctor(user);
  if (!doctor) return { data: [] as unknown[], message: "Doctor profile not found." };
  const where = clinical.prescriptionWhere("doctor", user.id, doctor.id, patientFilter);
  const rows = await clinical.listPrescriptions(where);
  return { data: rows.map(prescriptionDto), message: "" };
}

/** GET /api/prescriptions/mine/ — the signed-in patient's own prescriptions. */
export async function myPrescriptions(user: AuthUser) {
  const where = clinical.prescriptionWhere("patient", user.id, null);
  const rows = await clinical.listPrescriptions(where);
  return { data: rows.map(prescriptionDto), message: "" };
}

/** GET /api/prescriptions/{id}/ — issuing doctor or the patient it belongs to. */
export async function retrievePrescription(user: AuthUser, id: number) {
  const row = await loadReadable(user, id);
  if (!row) return { data: null, message: "Prescription not found." };
  return { data: prescriptionDto(row), message: "" };
}

/** Readability rule shared by GET/PATCH/DELETE: doctor owns it, patient is it. */
async function loadReadable(user: AuthUser, id: number) {
  if (user.role === "doctor") {
    const doctor = await ownDoctor(user);
    return doctor ? clinical.findPrescriptionOwned(id, doctor.id) : null;
  }
  if (user.role === "patient") {
    const rows = await clinical.listPrescriptions({ id, patient_id: user.id });
    return rows[0] ?? null;
  }
  return null;
}

/* -------------------------------- Writes ---------------------------------- */

/** POST /api/prescriptions/ — doctor issues a structured prescription. */
export async function createPrescription(user: AuthUser, body: unknown) {
  const doctor = await ownDoctor(user);
  if (!doctor) throw notFound("Doctor profile not found.");
  const input = parse(prescriptionCreateSchema, body);
  const target = resolvePrescriptionTarget(user.role, input);
  if (!target.ok) {
    if (target.field === "non_field_errors") throw forbidden(target.message);
    throw new ValidationError({ [target.field]: [target.message] });
  }

  const patient = await getPatientProfile(target.patientId).catch(() => null);
  if (!patient) {
    throw new ValidationError({
      patient: [`Invalid pk "${target.patientId}" - object does not exist.`],
    });
  }

  let appointmentId: number | null = null;
  if (input.appointment !== undefined && input.appointment !== null) {
    const appointment = await appointments.findAppointmentById(input.appointment);
    if (
      !appointment ||
      appointment.doctor_id !== doctor.id ||
      appointment.patient_id !== target.patientId
    ) {
      throw new ValidationError({
        appointment: [`Invalid pk "${input.appointment}" - object does not exist.`],
      });
    }
    appointmentId = appointment.id;
  }

  let treatmentId: number | null = null;
  if (input.treatment !== undefined && input.treatment !== null) {
    const treatment = await clinical.findTreatmentOwned(input.treatment, doctor.id);
    if (!treatment || treatment.patient_id !== target.patientId) {
      throw new ValidationError({
        treatment: [`Invalid pk "${input.treatment}" - object does not exist.`],
      });
    }
    treatmentId = treatment.id;
  }

  const items = normalizePrescriptionItems(input.items);
  const row = await clinical.createPrescription({
    doctor_id: doctor.id,
    patient_id: target.patientId,
    appointment_id: appointmentId,
    treatment_id: treatmentId,
    notes: input.notes ?? "",
    items,
  });
  return { data: prescriptionDto(row), message: "Prescription issued." };
}

/** PATCH /api/prescriptions/{id}/ — issuing doctor only. */
export async function patchPrescription(user: AuthUser, id: number, body: unknown) {
  const doctor = await ownDoctor(user);
  const row = doctor ? await clinical.findPrescriptionOwned(id, doctor.id) : null;
  if (!row) return { data: null, message: "Prescription not found." };
  const input = parse(prescriptionPatchSchema, body);
  const updated = await clinical.updatePrescription(id, {
    ...(input.notes !== undefined ? { notes: input.notes } : {}),
    ...(input.items !== undefined ? { items: normalizePrescriptionItems(input.items) } : {}),
  });
  return { data: prescriptionDto(updated), message: "Prescription updated." };
}

/** DELETE /api/prescriptions/{id}/ — issuing doctor only (204). */
export async function destroyPrescription(user: AuthUser, id: number) {
  const doctor = await ownDoctor(user);
  const row = doctor ? await clinical.findPrescriptionOwned(id, doctor.id) : null;
  if (!row) return { data: null, message: "Prescription not found." };
  await clinical.deletePrescription(id);
  return { data: null as null, message: "Prescription deleted." };
}

export { prescriptionDto };
