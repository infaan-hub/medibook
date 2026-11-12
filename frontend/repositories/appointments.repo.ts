/**
 * Appointment repository — bookings, lifecycle updates, reminders.
 */
import { prisma } from "@/lib/db";
import type { AppointmentStatus, Prisma, PrismaClient } from "@prisma/client";

export const APPOINTMENT_INCLUDE = {
  patient: true,
  doctor: { include: { user: true } },
  hospital: true,
} satisfies Prisma.AppointmentInclude;

export const findAppointmentById = (id: number) =>
  prisma.appointment.findUnique({ where: { id }, include: APPOINTMENT_INCLUDE });

/** Live appointment overlap for a doctor/date (cancelled/rejected rows release time). */
export const liveAppointmentOverlapExists = async (
  doctorId: number,
  date: string,
  startTime: string,
  endTime: string,
  excludeId?: number
) =>
  (await prisma.appointment.findFirst({
    where: {
      doctor_id: doctorId,
      appointment_date: new Date(`${date}T00:00:00Z`),
      start_time: { lt: endTime },
      end_time: { gt: startTime },
      status: { notIn: ["cancelled", "rejected"] },
      deleted_at: null,
      ...(excludeId ? { NOT: { id: excludeId } } : {}),
    },
    select: { id: true },
  })) !== null;

/**
 * Every appointment status the API accepts (mirrors the AppointmentStatus enum).
 * Used to validate the `?status=` filter instead of letting an unknown value
 * reach Prisma and blow up as a 500.
 */
export const APPOINTMENT_STATUSES = [
  "pending",
  "accepted",
  "done",
  "cancelled",
  "rejected",
  "in_progress",
  "expired",
] as const;

/**
 * Statuses that mean the patient still HOLDS the appointment: the doctor has
 * not closed the visit yet. A patient may only have one such appointment at a
 * time — the booking gate in appointment.service reads this list.
 * `in_progress` counts: the patient is literally being seen right now.
 */
export const OPEN_APPOINTMENT_STATUSES = ["pending", "accepted", "in_progress"] as const;

export const isAppointmentStatus = (value: string): boolean =>
  (APPOINTMENT_STATUSES as readonly string[]).includes(value);

/**
 * Where-clause for "the patient already has an appointment the doctor has not
 * finished". Pure, so the one-appointment-at-a-time rule stays unit-testable.
 */
export const openAppointmentWhere = (
  patientUserId: number
): Prisma.AppointmentWhereInput => ({
  patient_id: patientUserId,
  deleted_at: null,
  status: { in: [...OPEN_APPOINTMENT_STATUSES] },
});

/** Oldest open appointment (pending/accepted) — the one blocking a new booking. */
export const findOpenAppointmentForPatient = (patientUserId: number) =>
  prisma.appointment.findFirst({
    where: openAppointmentWhere(patientUserId),
    orderBy: [{ appointment_date: "asc" }, { start_time: "asc" }],
  });

/** Accepted-set membership for available_slots() (excludes cancelled/rejected). */
export const bookedSlotKeysForDate = async (doctorId: number, date: string): Promise<Set<string>> => {
  const rows = await prisma.appointment.findMany({
    where: {
      doctor_id: doctorId,
      appointment_date: new Date(`${date}T00:00:00Z`),
      status: { notIn: ["cancelled", "rejected"] },
      deleted_at: null,
    },
    select: { start_time: true, end_time: true },
  });
  return new Set(rows.map((row) => `${row.start_time}|${row.end_time}`));
};

export interface AppointmentListScope {
  role: string;
  userId: number;
  doctorProfileId?: number | null;
  status?: string;
  skip: number;
  take: number;
}

/** Port of AppointmentViewSet.get_queryset() role scoping + ordering. */
export function appointmentListWhere(scope: Pick<AppointmentListScope, "role" | "userId" | "doctorProfileId" | "status">): Prisma.AppointmentWhereInput {
  const where: Prisma.AppointmentWhereInput = {};
  if (scope.role === "doctor") {
    where.doctor_id = scope.doctorProfileId ?? -1;
  } else if (scope.role !== "admin" && scope.role !== "coordinator") {
    where.patient_id = scope.userId;
  }
  if (scope.status) where.status = scope.status as AppointmentStatus;
  where.deleted_at = null;
  return where;
}

export const countAppointments = (where: Prisma.AppointmentWhereInput) =>
  prisma.appointment.count({ where });

export const listAppointments = (where: Prisma.AppointmentWhereInput, skip: number, take: number) =>
  prisma.appointment.findMany({
    where,
    include: APPOINTMENT_INCLUDE,
    orderBy: [{ appointment_date: "desc" }, { start_time: "desc" }],
    skip,
    take,
  });

/**
 * Full (unpaginated) appointment list. `opts.status` is applied — it used to be
 * accepted and then dropped, so `?status=` on both /api/appointments/ (fetch_all)
 * and /api/doctor/appointments/ silently returned every status instead.
 */
export const listAppointmentsUnpaginated = (
  where: Prisma.AppointmentWhereInput,
  opts?: { status?: string }
) =>
  prisma.appointment.findMany({
    where: {
      ...where,
      ...(opts?.status ? { status: opts.status as AppointmentStatus } : {}),
    },
    include: APPOINTMENT_INCLUDE,
    orderBy: [{ appointment_date: "desc" }, { start_time: "desc" }],
  });

export const createAppointment = (
  data: {
    patient_id: number;
    doctor_id: number;
    hospital_id: number | null;
    appointment_date: string;
    start_time: string;
    end_time: string;
    reason?: string;
    status?: "pending" | "accepted";
    appointment_type?: "NORMAL" | "EMERGENCY" | "HOME_SERVICE";
    home_service_latitude?: number | null;
    home_service_longitude?: number | null;
    home_service_location_accuracy?: number | null;
    patient_snapshot?: Prisma.InputJsonValue;
  },
  db: AppointmentDb = prisma
) =>
  db.appointment.create({
    data: {
      patient_id: data.patient_id,
      doctor_id: data.doctor_id,
      hospital_id: data.hospital_id,
      appointment_date: new Date(`${data.appointment_date}T00:00:00Z`),
      start_time: data.start_time,
      end_time: data.end_time,
      reason: data.reason ?? "",
      ...(data.patient_snapshot ? { patient_snapshot: data.patient_snapshot } : {}),
      ...(data.status ? { status: data.status } : {}),
      ...(data.appointment_type ? { appointment_type: data.appointment_type } : {}),
      ...(data.appointment_type === "HOME_SERVICE" ? {
        home_service_latitude: data.home_service_latitude ?? null,
        home_service_longitude: data.home_service_longitude ?? null,
        home_service_location_accuracy: data.home_service_location_accuracy ?? null,
      } : {}),
    },
    include: APPOINTMENT_INCLUDE,
  });

/** Existing normal booking at the exact follow-up date and start time. */
export const findLiveAppointmentForPatientOnDate = (
  doctorId: number,
  patientId: number,
  date: string,
  startTime: string
) =>
  prisma.appointment.findFirst({
    where: {
      doctor_id: doctorId,
      patient_id: patientId,
      appointment_date: new Date(`${date}T00:00:00Z`),
      start_time: startTime,
      appointment_type: "NORMAL",
      status: { in: ["pending", "accepted"] },
    },
    include: APPOINTMENT_INCLUDE,
  });

export const updateAppointment = async (
  id: number,
  data: Prisma.AppointmentUncheckedUpdateInput,
  expected?: { doctorId: number; status: AppointmentStatus; consultationStartedAt: Date | null }
) => {
  if (!expected) return prisma.appointment.update({ where: { id }, data, include: APPOINTMENT_INCLUDE });
  const changed = await prisma.appointment.updateMany({
    where: { id, doctor_id: expected.doctorId, status: expected.status, consultation_started_at: expected.consultationStartedAt, deleted_at: null },
    data,
  });
  if (changed.count !== 1) throw new (await import("@/lib/errors")).ApiError(409, "This appointment changed while you were updating it. Refresh and try again.");
  return prisma.appointment.findUniqueOrThrow({ where: { id }, include: APPOINTMENT_INCLUDE });
};

export const deleteAppointment = (id: number) => prisma.appointment.delete({ where: { id } });

export const hasAppointmentsWithPatient = async (doctorId: number, patientUserId: number) =>
  (await prisma.appointment.findFirst({
    where: { doctor_id: doctorId, patient_id: patientUserId },
    select: { id: true },
  })) !== null;

/** A confirmed care relationship grants access to the patient's full chart. */
export const PATIENT_HISTORY_ACCESS_STATUSES = ["accepted", "in_progress", "done"] as const;

export const patientHistoryAppointmentWhere = (doctorId: number, patientUserId: number) => ({
  doctor_id: doctorId,
  patient_id: patientUserId,
  status: { in: [...PATIENT_HISTORY_ACCESS_STATUSES] },
});

export const hasAcceptedAppointmentWithPatient = async (doctorId: number, patientUserId: number) =>
  (await prisma.appointment.findFirst({
    where: patientHistoryAppointmentWhere(doctorId, patientUserId),
    select: { id: true },
  })) !== null;

/** Unique patients whose histories this doctor may access. */
export const listPatientHistoryAccessIdsForDoctor = (doctorId: number) =>
  prisma.appointment.findMany({
    where: {
      doctor_id: doctorId,
      status: { in: [...PATIENT_HISTORY_ACCESS_STATUSES] },
    },
    distinct: ["patient_id"],
    select: { patient_id: true },
  });

/* -------------------------------- Reminders -------------------------------- */

export const createReminderIfAbsent = (
  appointmentId: number,
  reminderType: string,
  scheduledFor: Date
) =>
  prisma.appointmentReminder.upsert({
    where: { appointment_id_reminder_type: { appointment_id: appointmentId, reminder_type: reminderType } },
    update: {},
    create: { appointment_id: appointmentId, reminder_type: reminderType, scheduled_for: scheduledFor },
  });

export const listDueReminders = (now: Date) =>
  prisma.appointmentReminder.findMany({
    where: { sent: false, scheduled_for: { lte: now } },
    include: {
      appointment: { include: { patient: true, doctor: { include: { user: true } } } },
    },
  });

export const markReminderSent = (id: number) =>
  prisma.appointmentReminder.update({ where: { id }, data: { sent: true } });

/* ---------------------------- Emergency Appointments -------------------------- */

/**
 * Database handle a repository call may run against — either the shared client
 * or the client Prisma hands to an interactive transaction. Emergency creation
 * does its eligibility check + insert inside one transaction, so every helper
 * it calls must accept the transaction handle.
 */
export type AppointmentDb = PrismaClient | Prisma.TransactionClient;

/**
 * Serialize writes that occupy the same doctor's calendar date. Every booking,
 * reschedule, and coordinator transfer uses this transaction lock, then checks
 * interval overlap while holding it, closing the stale-availability race.
 */
export async function withDoctorDateLocks<T>(
  keys: Array<{ doctorId: number; date: string }>,
  work: (tx: Prisma.TransactionClient) => Promise<T>
): Promise<T> {
  const uniqueKeys = [...new Set(keys.map(({ doctorId, date }) => `${doctorId}:${date}`))].sort();
  return prisma.$transaction(async (tx) => {
    for (const key of uniqueKeys) {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`medibook:doctor-date:${key}`}))`;
    }
    return work(tx);
  }, { isolationLevel: "ReadCommitted", timeout: 30000 });
}


/**
 * Statuses that count as an ACTIVE emergency: the patient is still waiting for
 * (or receiving) care and therefore may not file another request.
 *
 *   pending / accepted → blocked only for the first 30 minutes
 *   in_progress        → blocked until the doctor marks it `done`
 */
export const EMERGENCY_ACTIVE_STATUSES = ["pending", "accepted", "in_progress"] as const;

/**
 * The patient's current emergency, newest first. `null` means they hold no
 * active emergency and are free to request another.
 *
 * `COALESCE(emergency_requested_at, created_at)` rules are applied by the
 * service — this row carries both stamps so it can decide.
 */
export const findPatientEmergencyAppointment = (patientId: number, db: AppointmentDb = prisma) =>
  db.appointment.findFirst({
    where: {
      patient_id: patientId,
      appointment_type: "EMERGENCY",
      status: { in: [...EMERGENCY_ACTIVE_STATUSES] },
    },
    include: APPOINTMENT_INCLUDE,
    orderBy: [{ emergency_requested_at: "desc" }, { id: "desc" }],
  });

/**
 * Lazily stamp EXPIRED on emergencies whose 30-minute window closed before the
 * doctor reached `in_progress`. Idempotent, always server-time based, and run
 * from every eligibility read — so it works even when the patient's browser
 * was closed the whole time (§18). The rows are kept: only the status changes,
 * which is what drops them out of `EMERGENCY_ACTIVE_STATUSES` (and out of the
 * `uniq_active_patient_emergency` predicate) so a new request can be filed.
 *
 * `cutoff` is "requested at or before this instant is timed out" — computed by
 * the service from the 30-minute rule so the business rule stays in one place.
 * Returns the rows that were just expired.
 */
export const expireTimedOutEmergencies = async (
  cutoff: Date,
  patientId?: number,
  db: AppointmentDb = prisma,
  doctorId?: number
) => {
  const stale = await db.appointment.findMany({
    where: {
      ...(patientId !== undefined ? { patient_id: patientId } : {}),
      ...(doctorId !== undefined ? { doctor_id: doctorId } : {}),
      appointment_type: "EMERGENCY",
      status: { in: ["pending", "accepted"] },
      // COALESCE: rows written before emergency_requested_at existed still time out.
      OR: [
        { emergency_requested_at: { lte: cutoff } },
        { emergency_requested_at: null, created_at: { lte: cutoff } },
      ],
    },
    include: APPOINTMENT_INCLUDE,
  });
  if (stale.length === 0) return stale;

  await db.appointment.updateMany({
    where: { id: { in: stale.map((row) => row.id) }, status: { in: ["pending", "accepted"] } },
    // The window closed AT the cutoff, not whenever this sweep happened to run.
    data: { status: "expired", emergency_expired_at: cutoff },
  });
  return stale;
};

/**
 * 24-hour retention for the emergency history: delete every appointment whose
 * status is `expired` AND whose expiry moment passed at or before `cutoff`,
 * returning the removed rows (id + parties) so the caller can broadcast
 * `appointment.deleted`. Every other status is untouched, however old it is.
 *
 * Expiry moment is `emergency_expired_at` (stamped by expireTimedOutEmergencies);
 * a row written without one falls back to its scheduled end, and an unparseable
 * date keeps the row — never delete on uncertainty.
 */
export const purgeExpiredEmergencies = async (
  cutoff: Date,
  db: AppointmentDb = prisma
) => {
  const stale = await db.appointment.findMany({
    where: { status: "expired", appointment_type: "EMERGENCY" },
    select: {
      id: true,
      emergency_expired_at: true,
      appointment_date: true,
      end_time: true,
      patient_id: true,
      doctor: { select: { user_id: true } },
    },
  });
  const due = stale.filter((row) => {
    const end =
      row.emergency_expired_at ??
      new Date(
        `${row.appointment_date.toISOString().slice(0, 10)}T${row.end_time.length === 5 ? `${row.end_time}:00` : row.end_time}Z`
      );
    return end.getTime() <= cutoff.getTime();
  });
  if (due.length === 0) return due;

  await db.appointment.updateMany({
    where: { id: { in: due.map((row) => row.id) }, status: "expired" },
    data: { deleted_at: cutoff },
  });
  return due;
};

export const createEmergencyAppointment = (
  data: {
    patient_id: number;
    doctor_id: number;
    hospital_id: number | null;
    appointment_date: string;
    start_time: string;
    end_time: string;
    reason?: string;
    notes?: string;
    appointment_type: "EMERGENCY";
    /** Auto-dispatched emergencies start `accepted`; explicit picks stay `pending`. */
    status?: AppointmentStatus;
    emergency_reason: string;
    emergency_description?: string;
    emergency_latitude: number;
    emergency_longitude: number;
    emergency_location_accuracy?: number | null;
    emergency_requested_at: Date;
    /** Stamped when the row starts life already `accepted` (auto-dispatch). */
    emergency_accepted_at?: Date | null;
    patient_snapshot?: Prisma.InputJsonValue;
  },
  db: AppointmentDb = prisma
) =>
  db.appointment.create({
    data: {
      patient_id: data.patient_id,
      doctor_id: data.doctor_id,
      hospital_id: data.hospital_id,
      appointment_date: new Date(`${data.appointment_date}T00:00:00Z`),
      start_time: data.start_time,
      end_time: data.end_time,
      reason: data.reason ?? "",
      notes: data.notes ?? "",
      ...(data.patient_snapshot ? { patient_snapshot: data.patient_snapshot } : {}),
      appointment_type: "EMERGENCY",
      status: data.status ?? "pending",
      emergency_reason: data.emergency_reason,
      emergency_description: data.emergency_description ?? "",
      emergency_latitude: data.emergency_latitude,
      emergency_longitude: data.emergency_longitude,
      emergency_location_accuracy: data.emergency_location_accuracy ?? null,
      emergency_requested_at: data.emergency_requested_at,
      ...(data.emergency_accepted_at ? { emergency_accepted_at: data.emergency_accepted_at } : {}),
    },
    include: APPOINTMENT_INCLUDE,
  });

/**
 * Another appointment of the same doctor that day whose consultation is
 * already running (phase 11 waiting room) — the "one patient at a time" guard.
 */
export const findLiveConsultation = (
  doctorId: number,
  appointmentDate: Date,
  excludeId: number
) =>
  prisma.appointment.findFirst({
    where: {
      doctor_id: doctorId,
      appointment_date: appointmentDate,
      id: { not: excludeId },
      consultation_started_at: { not: null },
      status: { in: ["pending", "accepted"] },
    },
    select: { id: true },
  });
