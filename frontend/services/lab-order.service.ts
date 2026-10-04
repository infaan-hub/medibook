/**
 * Lab order service — lab orders and results (phase 3).
 *
 * A doctor orders a test (with the reference range the lab uses), the lab
 * runs it, and the doctor records the result. Patients read their own orders
 * and results but can never place or change them.
 */
import { forbidden, notFound, ValidationError } from "@/lib/errors";
import { labOrderDto } from "@/lib/serializers";
import { labOrderCreateSchema, labOrderPatchSchema } from "@/validators/clinical";
import { parse } from "@/validators/base";
import * as labs from "@/repositories/lab-orders.repo";
import * as appointments from "@/repositories/appointments.repo";
import * as doctors from "@/repositories/doctors.repo";
import { getPatientProfile } from "@/repositories/users.repo";
import type { AuthUser } from "@/lib/auth";
import type { LabOrderStatus } from "@prisma/client";

/* ------------------------------- Pure helpers ------------------------------ */

/**
 * Whom an order belongs to (pure POST gate, mirroring
 * resolvePrescriptionTarget): only a doctor may order a test, and they must
 * name the patient it is for.
 */
export type LabOrderTarget =
  | { ok: true; role: "doctor"; patientId: number }
  | { ok: false; field: string; message: string };

export function resolveLabOrderTarget(
  role: string,
  input: { patient?: number | null }
): LabOrderTarget {
  if (role === "doctor") {
    if (input.patient === undefined || input.patient === null) {
      return { ok: false, field: "patient", message: "This field is required." };
    }
    return { ok: true, role: "doctor", patientId: Number(input.patient) };
  }
  return {
    ok: false,
    field: "non_field_errors",
    message: "Only doctors can order lab tests.",
  };
}

/**
 * When to keep/set/clear `resulted_at` for a status change (pure — the clock
 * is injected so tests do not depend on wall time):
 *
 *   → resulted   stamp it, unless it was already stamped by an earlier save
 *   → anything else  clear it: the result is no longer the current state
 */
export function stampResultedAt(
  status: LabOrderStatus | string,
  current: Date | null,
  now: Date
): Date | null {
  if (status === "resulted") return current ?? now;
  return null;
}

/* --------------------------------- Reads ---------------------------------- */

const ownDoctor = (user: AuthUser) => doctors.findDoctorByUserId(user.id);

/** GET /api/lab-orders/ — orders this doctor placed (optionally one patient). */
export async function listLabOrders(user: AuthUser, patientFilter?: string) {
  const doctor = await ownDoctor(user);
  if (!doctor) return { data: [] as unknown[], message: "Doctor profile not found." };
  const where = labs.labOrderWhere("doctor", user.id, doctor.id, patientFilter);
  const rows = await labs.listLabOrders(where);
  return { data: rows.map(labOrderDto), message: "" };
}

/** GET /api/lab-orders/mine/ — the signed-in patient's own orders + results. */
export async function myLabOrders(user: AuthUser) {
  const where = labs.labOrderWhere("patient", user.id, null);
  const rows = await labs.listLabOrders(where);
  return { data: rows.map(labOrderDto), message: "" };
}

/** GET /api/lab-orders/{id}/ — the ordering doctor or the patient it is for. */
export async function retrieveLabOrder(user: AuthUser, id: number) {
  const row = await loadReadable(user, id);
  if (!row) return { data: null, message: "Lab order not found." };
  return { data: labOrderDto(row), message: "" };
}

/** Readability rule shared by GET: doctor owns it, patient is it. */
async function loadReadable(user: AuthUser, id: number) {
  if (user.role === "doctor") {
    const doctor = await ownDoctor(user);
    return doctor ? labs.findLabOrderOwned(id, doctor.id) : null;
  }
  if (user.role === "patient") {
    const rows = await labs.listLabOrders({ id, patient_id: user.id });
    return rows[0] ?? null;
  }
  return null;
}

/* -------------------------------- Writes ---------------------------------- */

/** POST /api/lab-orders/ — doctor orders a test. */
export async function createLabOrder(user: AuthUser, body: unknown) {
  const doctor = await ownDoctor(user);
  if (!doctor) throw notFound("Doctor profile not found.");
  const input = parse(labOrderCreateSchema, body);
  const target = resolveLabOrderTarget(user.role, input);
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

  const row = await labs.createLabOrder({
    doctor_id: doctor.id,
    patient_id: target.patientId,
    appointment_id: appointmentId,
    test_name: input.test_name,
    result_due_date: new Date(`${input.result_due_date}T00:00:00Z`),
    unit: input.unit ?? "",
    reference_min: input.reference_min ?? null,
    reference_max: input.reference_max ?? null,
    notes: input.notes ?? "",
  });
  return { data: labOrderDto(row), message: "Lab order placed." };
}

/**
 * PATCH /api/lab-orders/{id}/ — ordering doctor only: move it through the
 * workflow (ordered → in_progress → resulted / cancelled) and record the
 * result when the lab reports back.
 */
export async function patchLabOrder(user: AuthUser, id: number, body: unknown) {
  const doctor = await ownDoctor(user);
  const row = doctor ? await labs.findLabOrderOwned(id, doctor.id) : null;
  if (!row) return { data: null, message: "Lab order not found." };

  const input = parse(labOrderPatchSchema, body);
  const status = (input.status ?? row.status) as LabOrderStatus;
  const updated = await labs.updateLabOrder(id, {
    ...(input.status !== undefined ? { status } : {}),
    ...(input.result_value !== undefined ? { result_value: input.result_value } : {}),
    ...(input.result_notes !== undefined ? { result_notes: input.result_notes } : {}),
    ...(input.notes !== undefined ? { notes: input.notes } : {}),
    resulted_at: stampResultedAt(status, row.resulted_at, new Date()),
  });
  return { data: labOrderDto(updated), message: "Lab order updated." };
}

/** DELETE /api/lab-orders/{id}/ — ordering doctor only (204). */
export async function destroyLabOrder(user: AuthUser, id: number) {
  const doctor = await ownDoctor(user);
  const row = doctor ? await labs.findLabOrderOwned(id, doctor.id) : null;
  if (!row) return { data: null, message: "Lab order not found." };
  await labs.deleteLabOrder(id);
  return { data: null as null, message: "Lab order deleted." };
}

export { labOrderDto };
