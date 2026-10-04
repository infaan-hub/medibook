/**
 * Vital service — vitals tracking (phase 2).
 *
 * Doctors record readings (blood pressure, pulse, temperature, glucose,
 * weight/height → derived BMI, SpO₂) for a patient, optionally tied to the
 * appointment they are sitting in. Patients read their own history; they can
 * never write it.
 */
import { forbidden, notFound, ValidationError } from "@/lib/errors";
import { vitalDto } from "@/lib/serializers";
import { vitalsCreateSchema } from "@/validators/clinical";
import { parse } from "@/validators/base";
import * as vitals from "@/repositories/vitals.repo";
import * as appointments from "@/repositories/appointments.repo";
import * as doctors from "@/repositories/doctors.repo";
import { getPatientProfile } from "@/repositories/users.repo";
import type { AuthUser } from "@/lib/auth";

/* ------------------------------- Pure helpers ------------------------------ */

/**
 * BMI = kg / m², rounded to one decimal. Returns null unless BOTH measurements
 * exist and the height is usable — a missing half never invents a number.
 */
export function computeBmi(
  weightKg: number | null | undefined,
  heightCm: number | null | undefined
): number | null {
  if (weightKg === null || weightKg === undefined) return null;
  if (heightCm === null || heightCm === undefined) return null;
  if (weightKg <= 0 || heightCm <= 0) return null;
  const metres = heightCm / 100;
  return Math.round((weightKg / (metres * metres)) * 10) / 10;
}

/**
 * DRF DateTimeField accepts "YYYY-MM-DD", "YYYY-MM-DDTHH:mm" and full ISO —
 * normalise all three into a real Date, or undefined when absent/blank.
 */
export function parseRecordedAt(value?: string | null): Date | undefined {
  if (value === undefined || value === null || value.trim() === "") return undefined;
  const raw = value.trim();
  const iso =
    raw.length === 10
      ? `${raw}T00:00:00`
      : raw.length === 16
        ? `${raw}:00`
        : raw;
  const parsed = new Date(iso);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed;
}

/**
 * Whom a reading belongs to (pure POST gate, mirroring
 * resolvePrescriptionTarget): only a doctor may record vitals, and they must
 * name the patient the reading is for.
 */
export type VitalTarget =
  | { ok: true; role: "doctor"; patientId: number }
  | { ok: false; field: string; message: string };

export function resolveVitalTarget(
  role: string,
  input: { patient?: number | null }
): VitalTarget {
  if (role === "doctor") {
    if (input.patient === undefined || input.patient === null) {
      return { ok: false, field: "patient", message: "This field is required." };
    }
    return { ok: true, role: "doctor", patientId: Number(input.patient) };
  }
  return {
    ok: false,
    field: "non_field_errors",
    message: "Only doctors can record vitals.",
  };
}

/* --------------------------------- Reads ---------------------------------- */

const ownDoctor = (user: AuthUser) => doctors.findDoctorByUserId(user.id);

/** GET /api/vitals/ — readings this doctor took (optionally one patient). */
export async function listVitals(user: AuthUser, patientFilter?: string) {
  const doctor = await ownDoctor(user);
  if (!doctor) return { data: [] as unknown[], message: "Doctor profile not found." };
  const where = vitals.vitalWhere("doctor", user.id, doctor.id, patientFilter);
  const rows = await vitals.listVitals(where);
  return { data: rows.map(vitalDto), message: "" };
}

/** GET /api/vitals/mine/ — the signed-in patient's own readings. */
export async function myVitals(user: AuthUser) {
  const where = vitals.vitalWhere("patient", user.id, null);
  const rows = await vitals.listVitals(where);
  return { data: rows.map(vitalDto), message: "" };
}

/** GET /api/vitals/{id}/ — the doctor who recorded it or the patient it is for. */
export async function retrieveVital(user: AuthUser, id: number) {
  const row = await loadReadable(user, id);
  if (!row) return { data: null, message: "Vital reading not found." };
  return { data: vitalDto(row), message: "" };
}

/** Readability rule shared by GET/DELETE: doctor owns it, patient is it. */
async function loadReadable(user: AuthUser, id: number) {
  if (user.role === "doctor") {
    const doctor = await ownDoctor(user);
    return doctor ? vitals.findVitalOwned(id, doctor.id) : null;
  }
  if (user.role === "patient") {
    const rows = await vitals.listVitals({ id, patient_id: user.id });
    return rows[0] ?? null;
  }
  return null;
}

/* -------------------------------- Writes ---------------------------------- */

/** POST /api/vitals/ — doctor records a reading (BMI derived here). */
export async function createVital(user: AuthUser, body: unknown) {
  const doctor = await ownDoctor(user);
  if (!doctor) throw notFound("Doctor profile not found.");
  const input = parse(vitalsCreateSchema, body);
  const target = resolveVitalTarget(user.role, input);
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

  const recordedAt = parseRecordedAt(input.recorded_at);
  const row = await vitals.createVital({
    doctor_id: doctor.id,
    patient_id: target.patientId,
    appointment_id: appointmentId,
    ...(recordedAt ? { recorded_at: recordedAt } : {}),
    systolic_bp: input.systolic_bp ?? null,
    diastolic_bp: input.diastolic_bp ?? null,
    pulse_bpm: input.pulse_bpm ?? null,
    temperature_c: input.temperature_c ?? null,
    glucose_mg_dl: input.glucose_mg_dl ?? null,
    weight_kg: input.weight_kg ?? null,
    height_cm: input.height_cm ?? null,
    bmi: computeBmi(input.weight_kg, input.height_cm),
    spo2_percent: input.spo2_percent ?? null,
    notes: input.notes ?? "",
  });
  return { data: vitalDto(row), message: "Vitals recorded." };
}

/** DELETE /api/vitals/{id}/ — the doctor who took it (204). */
export async function destroyVital(user: AuthUser, id: number) {
  const doctor = await ownDoctor(user);
  const row = doctor ? await vitals.findVitalOwned(id, doctor.id) : null;
  if (!row) return { data: null, message: "Vital reading not found." };
  await vitals.deleteVital(id);
  return { data: null as null, message: "Vital reading deleted." };
}

export { vitalDto };
