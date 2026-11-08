/** Platform-wide, least-privilege tools for System Coordinators. */
import { prisma } from "@/lib/db";
import { badRequest, conflict, notFound } from "@/lib/errors";
import { notify, broadcastAppointmentEvent, broadcastAvailabilityUpdated } from "@/lib/notify";
import { appointmentDto } from "@/lib/serializers";
import { isSlotAvailable } from "@/services/schedule.service";
import { coordinatorVisitHistory } from "@/services/treatment.service";
import * as appointments from "@/repositories/appointments.repo";
import * as admin from "@/repositories/admin.repo";
import type { AuthUser } from "@/lib/auth";

const liveStatuses = ["pending", "accepted", "in_progress"] as const;

export const canReassignAppointment = (status: string, consultationStartedAt: Date | null) =>
  (status === "pending" || status === "accepted") && consultationStartedAt === null;

export const canReassignEmergency = (status: string, consultationStartedAt: Date | null, emergencyStartedAt: Date | null) =>
  canReassignAppointment(status, consultationStartedAt) && emergencyStartedAt === null;

export async function overview() {
  const now = new Date();
  const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const weekStart = new Date(today);
  weekStart.setUTCDate(today.getUTCDate() - 6);

  const [
    totalUsers,
    patients,
    doctors,
    coordinators,
    appointmentCount,
    byStatus,
    byType,
    todayCount,
    availableDoctors,
    todayByStatus,
    weekRows,
    activeEmergencies,
  ] = await Promise.all([
    prisma.user.count(),
    prisma.user.count({ where: { role: "patient" } }),
    prisma.doctor.count(),
    prisma.user.count({ where: { role: "coordinator" } }),
    prisma.appointment.count({ where: { deleted_at: null } }),
    prisma.appointment.groupBy({ by: ["status"], _count: { _all: true }, where: { deleted_at: null } }),
    prisma.appointment.groupBy({ by: ["appointment_type"], _count: { _all: true }, where: { deleted_at: null } }),
    prisma.appointment.count({ where: { deleted_at: null, appointment_date: today } }),
    prisma.doctor.count({ where: { is_available: true } }),
    prisma.appointment.groupBy({ by: ["status"], _count: { _all: true }, where: { deleted_at: null, appointment_date: today } }),
    prisma.appointment.findMany({
      where: { deleted_at: null, appointment_date: { gte: weekStart, lte: today } },
      select: { appointment_date: true },
    }),
    prisma.appointment.count({
      where: {
        deleted_at: null,
        appointment_type: "EMERGENCY",
        status: { in: ["pending", "accepted", "in_progress"] },
      },
    }),
  ]);

  const dailyCounts = new Map<string, number>();
  for (const row of weekRows) {
    const key = row.appointment_date.toISOString().slice(0, 10);
    dailyCounts.set(key, (dailyCounts.get(key) ?? 0) + 1);
  }
  const last7Days = Array.from({ length: 7 }, (_, index) => {
    const day = new Date(weekStart);
    day.setUTCDate(weekStart.getUTCDate() + index);
    const key = day.toISOString().slice(0, 10);
    return {
      date: key,
      label: day.toLocaleDateString("en-US", { weekday: "short", timeZone: "UTC" }),
      count: dailyCounts.get(key) ?? 0,
    };
  });

  return {
    users: { total: totalUsers, patients, doctors, coordinators },
    availability: { total_doctors: doctors, available_doctors: availableDoctors },
    emergency: { active: activeEmergencies },
    appointments: {
      total: appointmentCount,
      today: todayCount,
      by_status: Object.fromEntries(byStatus.map((r) => [r.status, r._count._all])),
      by_service: Object.fromEntries(byType.map((r) => [r.appointment_type, r._count._all])),
      today_by_status: Object.fromEntries(todayByStatus.map((r) => [r.status, r._count._all])),
      last_7_days: last7Days,
    },
    services: [
      { key: "NORMAL", label: "Hospital appointments", count: byType.find((r) => r.appointment_type === "NORMAL")?._count._all ?? 0 },
      { key: "EMERGENCY", label: "Emergency", count: byType.find((r) => r.appointment_type === "EMERGENCY")?._count._all ?? 0 },
      { key: "HOME_SERVICE", label: "Home service", count: byType.find((r) => r.appointment_type === "HOME_SERVICE")?._count._all ?? 0 },
    ],
  };
}

export async function doctorSchedule(date: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(`${date}T00:00:00Z`))) throw badRequest("Enter a valid date.");
  const weekday = (new Date(`${date}T00:00:00Z`).getUTCDay() + 6) % 7;
  const [rows, bookings] = await Promise.all([
    prisma.doctor.findMany({ include: { user: { select: { id: true, first_name: true, last_name: true, email: true } }, availabilities: { where: { is_active: true, weekday }, include: { breaks: true }, orderBy: { start_time: "asc" } }, schedule_exceptions: { where: { date: new Date(`${date}T00:00:00Z`) } } }, orderBy: [{ is_available: "desc" }, { id: "asc" }] }),
    prisma.appointment.findMany({ where: { appointment_date: new Date(`${date}T00:00:00Z`), deleted_at: null, status: { in: [...liveStatuses] } }, include: { patient: { select: { id: true, first_name: true, last_name: true } }, doctor: { select: { id: true } } }, orderBy: [{ start_time: "asc" }] }),
  ]);
  return rows.map((doctor) => ({
    id: doctor.id, user_id: doctor.user.id, name: `${doctor.user.first_name} ${doctor.user.last_name}`.trim() || doctor.user.email,
    email: doctor.user.email, is_available: doctor.is_available,
    windows: doctor.availabilities.map((w) => ({ start_time: w.start_time, end_time: w.end_time, breaks: w.breaks.map((b) => ({ start_time: b.start_time, end_time: b.end_time })) })),
    exceptions: doctor.schedule_exceptions.map((x) => ({ start_time: x.start_time, end_time: x.end_time, reason: x.reason })),
    appointments: bookings.filter((a) => a.doctor_id === doctor.id).map((a) => ({ id: a.id, patient_id: a.patient.id, patient_name: `${a.patient.first_name} ${a.patient.last_name}`.trim(), date, start_time: a.start_time, end_time: a.end_time, status: a.status, type: a.appointment_type })),
  }));
}

export async function listAppointments(type?: string) {
  // The coordinator queue only needs card fields. Loading each patient's and
  // doctor's full profile for up to 250 rows made this endpoint unnecessarily
  // slow and could exceed the serverless request deadline.
  const rows = await prisma.appointment.findMany({
    where: { deleted_at: null, ...(type ? { appointment_type: type as "NORMAL" | "EMERGENCY" | "HOME_SERVICE" } : {}) },
    select: {
      id: true,
      patient_id: true,
      doctor_id: true,
      hospital_id: true,
      appointment_date: true,
      start_time: true,
      end_time: true,
      status: true,
      appointment_type: true,
      reason: true,
      notes: true,
      cancel_reason: true,
      deleted_at: true,
      checked_in_at: true,
      consultation_started_at: true,
      emergency_reason: true,
      emergency_description: true,
      emergency_requested_at: true,
      emergency_accepted_at: true,
      emergency_in_progress_at: true,
      emergency_completed_at: true,
      emergency_expired_at: true,
      patient: { select: { email: true } },
    },
    orderBy: [{ appointment_date: "desc" }, { start_time: "desc" }],
    take: 250,
  });
  return rows.map((row) => ({
    id: row.id,
    patient: row.patient_id,
    patient_email: row.patient.email,
    doctor: row.doctor_id,
    hospital: row.hospital_id,
    appointment_date: row.appointment_date.toISOString().slice(0, 10),
    start_time: row.start_time,
    end_time: row.end_time,
    status: row.status,
    appointment_type: row.appointment_type,
    reason: row.reason,
    notes: row.notes,
    cancel_reason: row.cancel_reason,
    deleted_at: row.deleted_at?.toISOString() ?? null,
    checked_in_at: row.checked_in_at?.toISOString() ?? null,
    consultation_started_at: row.consultation_started_at?.toISOString() ?? null,
    emergency_reason: row.emergency_reason,
    emergency_description: row.emergency_description,
    emergency_requested_at: row.emergency_requested_at?.toISOString() ?? null,
    emergency_accepted_at: row.emergency_accepted_at?.toISOString() ?? null,
    emergency_in_progress_at: row.emergency_in_progress_at?.toISOString() ?? null,
    emergency_completed_at: row.emergency_completed_at?.toISOString() ?? null,
    emergency_expired_at: row.emergency_expired_at?.toISOString() ?? null,
  }));
}

export async function listPatients(search = "") {
  const q = search.trim();
  const users = await prisma.user.findMany({ where: { role: "patient", ...(q ? { OR: [ { first_name: { contains: q, mode: "insensitive" } }, { last_name: { contains: q, mode: "insensitive" } }, { username: { contains: q, mode: "insensitive" } }, { email: { contains: q, mode: "insensitive" } } ] } : {}) }, select: { id: true, username: true, email: true, first_name: true, last_name: true, phone: true, patient: { select: { date_of_birth: true, gender: true, blood_group: true, allergies: true, medical_history: true } }, _count: { select: { patient_appointments: true } } }, orderBy: [{ first_name: "asc" }, { last_name: "asc" }], take: 100 });
  return users.map((u) => ({ id: u.id, username: u.username, email: u.email, first_name: u.first_name, last_name: u.last_name, phone: u.phone, profile: u.patient, appointment_count: u._count.patient_appointments }));
}

export async function patientHistory(actor: AuthUser, patientId: number) {
  if (!Number.isInteger(patientId) || patientId < 1) throw badRequest("Enter a valid patient id.");
  const patient = await prisma.user.findFirst({ where: { id: patientId, role: "patient" }, select: { id: true, username: true, email: true, first_name: true, last_name: true, phone: true, patient: true } });
  if (!patient) throw notFound("Patient not found.");
  const history = await coordinatorVisitHistory(patientId);
  const { patient: profile, ...user } = patient;
  await admin.recordAudit(actor.id, "coordinator.patient_history_viewed", String(patientId), "System coordinator viewed patient visit history.");
  return { patient: { ...user, profile, appointment_count: history.data.length }, visits: history.data };
}

function doctorName(doctor: { user: { first_name: string; last_name: string; username: string } } | null) {
  return doctor ? `Dr. ${doctor.user.first_name} ${doctor.user.last_name}`.trim() || `Dr. ${doctor.user.username}` : "the doctor";
}

export async function reassignAppointment(actor: AuthUser, appointmentId: number, doctorId: number) {
  if (!Number.isInteger(doctorId) || doctorId < 1) throw badRequest("Select a valid doctor.");
  const current = await appointments.findAppointmentById(appointmentId);
  if (!current || current.deleted_at) throw notFound("Appointment not found.");
  if (current.appointment_type === "EMERGENCY") throw badRequest("Use emergency reassignment for emergency appointments.");
  if (!canReassignAppointment(current.status, current.consultation_started_at)) throw conflict("Only pending or accepted appointments before consultation can be reassigned.");
  const next = await prisma.doctor.findUnique({ where: { id: doctorId }, include: { user: true } });
  if (!next || !next.is_available) throw badRequest("Choose an active, available doctor.");
  if (doctorId === current.doctor_id) throw badRequest("Choose a different doctor.");
  const date = current.appointment_date.toISOString().slice(0, 10);
  if (!(await isSlotAvailable(doctorId, date, current.start_time, current.end_time))) {
    throw conflict("The selected doctor is not available for this appointment date and time. Choose another doctor.");
  }
  const oldDoctor = current.doctor;
  let updated;
  try {
    updated = await appointments.withDoctorDateLocks([{ doctorId: current.doctor_id, date }, { doctorId, date }], async (tx) => {
      // Recheck competing bookings under the calendar lock; the date-specific
      // hours, breaks and exceptions were validated immediately before lock.
      const overlap = await tx.appointment.findFirst({ where: { doctor_id: doctorId, appointment_date: new Date(`${date}T00:00:00Z`), start_time: { lt: current.end_time }, end_time: { gt: current.start_time }, status: { notIn: ["cancelled", "rejected"] }, deleted_at: null }, select: { id: true } });
      if (overlap) throw conflict("The selected doctor is not free at this appointment time. Choose another doctor.");
      const changed = await tx.appointment.updateMany({ where: { id: appointmentId, doctor_id: current.doctor_id, status: { in: ["pending", "accepted"] }, consultation_started_at: null, deleted_at: null }, data: { doctor_id: doctorId, status: "pending", checked_in_at: null } });
      if (changed.count !== 1) throw conflict("The appointment changed while it was being reassigned. Refresh and try again.");
      await tx.appointmentReminder.deleteMany({ where: { appointment_id: appointmentId } });
      return tx.appointment.findUniqueOrThrow({ where: { id: appointmentId }, include: appointments.APPOINTMENT_INCLUDE });
    });
  } catch (error) { if ((error as { code?: string })?.code === "P2002") throw conflict("The selected doctor was just booked at this time."); throw error; }
  // The reassignment is already committed. Push delivery and audit storage are
  // secondary effects; a failure there must not report a false 500 and prompt
  // the coordinator to submit the transfer again.
  broadcastAppointmentEvent(updated, "appointment.updated", [updated.patient_id, oldDoctor.user_id, next.user_id]);
  broadcastAvailabilityUpdated(current.doctor_id, date);
  broadcastAvailabilityUpdated(doctorId, date);
  const sideEffects = await Promise.allSettled([
    notify(next.user_id, "appointment_request", `Appointment #${updated.id} has been assigned to you by a system coordinator. Please review and accept or reject it.`, updated.id, "Appointment reassigned"),
    notify(updated.patient_id, "appointment_request", `Your appointment has been reassigned from ${doctorName(oldDoctor)} to ${doctorName(next)}. It is waiting for the new doctor's acceptance.`, updated.id, "Doctor changed"),
    admin.recordAudit(actor.id, "appointment.reassigned", String(updated.id), `Doctor ${current.doctor_id} → ${doctorId}; new doctor approval required.`),
  ]);
  sideEffects.forEach((result) => {
    if (result.status === "rejected") console.error("[coordinator] reassignment side effect failed", result.reason);
  });
  return appointmentDto(updated);
}

export async function reassignEmergency(actor: AuthUser, appointmentId: number, doctorId: number) {
  if (!Number.isInteger(doctorId) || doctorId < 1) throw badRequest("Select a valid doctor.");
  const current = await appointments.findAppointmentById(appointmentId);
  if (!current || current.deleted_at) throw notFound("Emergency appointment not found.");
  if (current.appointment_type !== "EMERGENCY") throw badRequest("This is not an emergency appointment.");
  if (!canReassignEmergency(current.status, current.consultation_started_at, current.emergency_in_progress_at)) throw conflict("Only an emergency that has not started can be reassigned.");
  const next = await prisma.doctor.findUnique({ where: { id: doctorId }, include: { user: true } });
  if (!next || !next.is_available) throw badRequest("Choose an active, available doctor.");
  if (doctorId === current.doctor_id) throw badRequest("Choose a different doctor.");
  const oldDoctor = current.doctor;
  const result = await prisma.$transaction(async (tx) => {
    const changed = await tx.appointment.updateMany({ where: { id: appointmentId, doctor_id: current.doctor_id, appointment_type: "EMERGENCY", status: { in: ["pending", "accepted"] }, emergency_in_progress_at: null, consultation_started_at: null, deleted_at: null }, data: { doctor_id: doctorId, status: "pending", emergency_accepted_at: null } });
    if (changed.count === 1) await tx.appointmentReminder.deleteMany({ where: { appointment_id: appointmentId } });
    return changed;
  });
  if (result.count !== 1) throw conflict("This emergency has started or changed. Refresh and try again.");
  const updated = await appointments.findAppointmentById(appointmentId);
  if (!updated) throw notFound("Emergency appointment not found.");
  await notify(next.user_id, "appointment_request", `Emergency request #${updated.id} has been assigned to you by a system coordinator. Review it immediately.`, updated.id, "Emergency reassigned");
  await notify(updated.patient_id, "appointment_request", `Your emergency request has been transferred to ${doctorName(next)} and is waiting for their response.`, updated.id, "Emergency doctor changed");
  await admin.recordAudit(actor.id, "emergency.reassigned", String(updated.id), `Doctor ${current.doctor_id} → ${doctorId}; emergency acceptance reset.`);
  broadcastAppointmentEvent(updated, "appointment.updated", [updated.patient_id, oldDoctor.user_id, next.user_id]);
  return appointmentDto(updated);
}

