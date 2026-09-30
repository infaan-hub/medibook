/**
 * Appointment repository — bookings, lifecycle updates, reminders.
 */
import { prisma } from "@/lib/db";
import type { AppointmentStatus, Prisma } from "@prisma/client";

export const APPOINTMENT_INCLUDE = {
  patient: true,
  doctor: { include: { user: true } },
} satisfies Prisma.AppointmentInclude;

export const findAppointmentById = (id: number) =>
  prisma.appointment.findUnique({ where: { id }, include: APPOINTMENT_INCLUDE });

/** Live (non-cancelled/non-rejected) slot occupancy for a doctor/date. */
export const liveSlotExists = async (
  doctorId: number,
  date: string,
  startTime: string,
  excludeId?: number
) =>
  (await prisma.appointment.findFirst({
    where: {
      doctor_id: doctorId,
      appointment_date: new Date(`${date}T00:00:00Z`),
      start_time: startTime,
      status: { notIn: ["cancelled", "rejected"] },
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
] as const;

/**
 * Statuses that mean the patient still HOLDS the appointment: the doctor has
 * not closed the visit yet. A patient may only have one such appointment at a
 * time — the booking gate in appointment.service reads this list.
 */
export const OPEN_APPOINTMENT_STATUSES = ["pending", "accepted"] as const;

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
  } else if (scope.role !== "admin") {
    where.patient_id = scope.userId;
  }
  if (scope.status) where.status = scope.status as AppointmentStatus;
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

export const listAppointmentsUnpaginated = (
  where: Prisma.AppointmentWhereInput,
  opts?: { status?: string }
) =>
  prisma.appointment.findMany({
    where,
    include: APPOINTMENT_INCLUDE,
    orderBy: [{ appointment_date: "desc" }, { start_time: "desc" }],
  });

export const createAppointment = (data: {
  patient_id: number;
  doctor_id: number;
  hospital_id: number | null;
  appointment_date: string;
  start_time: string;
  end_time: string;
  reason?: string;
}) =>
  prisma.appointment.create({
    data: {
      patient_id: data.patient_id,
      doctor_id: data.doctor_id,
      hospital_id: data.hospital_id,
      appointment_date: new Date(`${data.appointment_date}T00:00:00Z`),
      start_time: data.start_time,
      end_time: data.end_time,
      reason: data.reason ?? "",
    },
    include: APPOINTMENT_INCLUDE,
  });

export const updateAppointment = (
  id: number,
  data: Prisma.AppointmentUncheckedUpdateInput
) => prisma.appointment.update({ where: { id }, data, include: APPOINTMENT_INCLUDE });

export const deleteAppointment = (id: number) => prisma.appointment.delete({ where: { id } });

export const hasAppointmentsWithPatient = async (doctorId: number, patientUserId: number) =>
  (await prisma.appointment.findFirst({ where: { doctor_id: doctorId, patient_id: patientUserId } })) !== null;

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

export const findPatientEmergencyAppointment = (patientId: number) =>
  prisma.appointment.findFirst({
    where: {
      patient_id: patientId,
      appointment_type: "EMERGENCY",
      status: { in: ["pending", "accepted"] },
    },
    include: APPOINTMENT_INCLUDE,
  });

export const createEmergencyAppointment = (data: {
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
}) =>
  prisma.appointment.create({
    data: {
      patient_id: data.patient_id,
      doctor_id: data.doctor_id,
      hospital_id: data.hospital_id,
      appointment_date: new Date(`${data.appointment_date}T00:00:00Z`),
      start_time: data.start_time,
      end_time: data.end_time,
      reason: data.reason ?? "",
      notes: data.notes ?? "",
      appointment_type: "EMERGENCY",
      status: data.status ?? "pending",
      emergency_reason: data.emergency_reason,
      emergency_description: data.emergency_description ?? "",
      emergency_latitude: data.emergency_latitude,
      emergency_longitude: data.emergency_longitude,
      emergency_location_accuracy: data.emergency_location_accuracy ?? null,
      emergency_requested_at: data.emergency_requested_at,
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
