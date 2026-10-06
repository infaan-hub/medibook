/**
 * Queue service — waiting-room positions (phase 11).
 *
 * A patient checks in on the day of their appointment and joins the waiting
 * line for that doctor; the doctor sees the line, starts the first
 * consultation and closes the visit (`done`) through the existing appointment
 * actions.
 * Everything about the line itself is pure (`buildQueue`) so the ordering
 * rules are unit-testable without a database.
 */
import { forbidden, notFound, ValidationError } from "@/lib/errors";
import { appointmentDto, queueSlotDto } from "@/lib/serializers";
import { broadcastAppointmentEvent, notify } from "@/lib/notify";
import { queueCheckInSchema } from "@/validators/misc";
import { parse } from "@/validators/base";
import * as appointments from "@/repositories/appointments.repo";
import * as doctors from "@/repositories/doctors.repo";
import { getPatientProfile } from "@/repositories/users.repo";
import type { AuthUser } from "@/lib/auth";

/* ------------------------------- Pure helpers ------------------------------ */

/** Statuses that keep an appointment in the waiting room. */
export const QUEUE_STATUSES = ["pending", "accepted"] as const;

/** The fields `buildQueue` needs — a plain projection of an Appointment row. */
export interface QueueRow {
  id: number;
  status: string;
  start_time: string;
  checked_in_at: Date | null;
  consultation_started_at: Date | null;
}

export interface QueueSlot {
  appointment: number;
  /** 1-based place in the waiting line; null = not waiting. */
  position: number | null;
  /** This patient is with the doctor right now. */
  being_seen: boolean;
  checked_in: boolean;
  /** Whole minutes waited so far (waiting entries only). */
  waited_minutes: number | null;
  /** How many patients are in the waiting line. */
  waiting_count: number;
}

/**
 * Turn a doctor's appointments for one day into waiting-line positions:
 *
 *  - only live appointments (pending/accepted) take part; done and
 *    cancelled ones have already left the room
 *  - a checked-in appointment whose consultation has not started is "waiting",
 *    ordered by check-in time (ties: earlier slot first, then id)
 *  - a checked-in appointment with a started consultation is "being seen"
 *    and is not part of the numbered line
 *  - nobody checked in yet simply has no position
 */
export function buildQueue(rows: QueueRow[], now: Date): QueueSlot[] {
  const live = rows.filter((row) => (QUEUE_STATUSES as readonly string[]).includes(row.status));
  const waiting = live
    .filter((row) => row.checked_in_at !== null && row.consultation_started_at === null)
    .sort((a, b) => {
      const byCheckIn = (a.checked_in_at as Date).getTime() - (b.checked_in_at as Date).getTime();
      if (byCheckIn !== 0) return byCheckIn;
      const bySlot = a.start_time.localeCompare(b.start_time);
      if (bySlot !== 0) return bySlot;
      return a.id - b.id;
    });
  const positionOf = new Map(waiting.map((row, index) => [row.id, index + 1]));

  return live.map((row) => {
    const checkedIn = row.checked_in_at !== null;
    const position = positionOf.get(row.id) ?? null;
    return {
      appointment: row.id,
      position,
      being_seen: checkedIn && row.consultation_started_at !== null,
      checked_in: checkedIn,
      waited_minutes:
        position !== null
          ? Math.max(
              0,
              Math.floor((now.getTime() - (row.checked_in_at as Date).getTime()) / 60_000)
            )
          : null,
      waiting_count: waiting.length,
    };
  });
}

/** "YYYY-MM-DD" as `timeZone` sees it (e.g. Dar es Salaam is UTC+3). */
export function localDateString(value: Date, timeZone: string): string {
  try {
    return new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(value);
  } catch {
    return value.toISOString().slice(0, 10);
  }
}

/** `YYYY-MM-DD` today, UTC (default when no date query param is supplied). */
function todayUtc(): string {
  return new Date().toISOString().slice(0, 10);
}

/* --------------------------------- Reads ---------------------------------- */

/**
 * GET /api/queue/?date=YYYY-MM-DD — the waiting room for one day:
 * doctors see their whole line, patients see their own appointments with
 * their place in it.
 */
export async function getQueue(user: AuthUser, dateParam?: string) {
  const date =
    dateParam !== undefined && /^\d{4}-\d{2}-\d{2}$/.test(dateParam) ? dateParam : todayUtc();
  const day = new Date(`${date}T00:00:00Z`);

  let where;
  if (user.role === "doctor") {
    const doctor = await doctors.findDoctorByUserId(user.id);
    if (!doctor) return { data: [] as unknown[], message: "Doctor profile not found." };
    where = { doctor_id: doctor.id, appointment_date: day };
  } else if (user.role === "patient") {
    where = { patient_id: user.id, appointment_date: day };
  } else {
    throw forbidden("The waiting room is available to doctors and patients.");
  }

  const rows = (await appointments.listAppointmentsUnpaginated(where)).sort((a, b) =>
    a.start_time.localeCompare(b.start_time)
  );
  const slots = new Map(
    buildQueue(rows, new Date()).map((slot) => [slot.appointment, slot] as const)
  );
  const data = rows.map((row) => ({
    ...appointmentDto(row),
    queue: slots.has(row.id) ? queueSlotDto(slots.get(row.id)!) : null,
  }));
  return { data, message: "" };
}

/* -------------------------------- Writes ---------------------------------- */

/**
 * POST /api/queue/check-in/ — the patient joins today's line (a doctor at the
 * desk can check them in too). Re-checking in is a no-op, not an error.
 */
export async function checkIn(user: AuthUser, body: unknown) {
  const input = parse(queueCheckInSchema, body);
  const appointment = await appointments.findAppointmentById(input.appointment);
  if (!appointment) throw notFound("Appointment not found.");

  const isOwnerPatient = appointment.patient_id === user.id;
  const isOwnerDoctor =
    user.role === "doctor" &&
    (await doctors.findDoctorByUserId(user.id))?.id === appointment.doctor_id;
  if (!isOwnerPatient && !isOwnerDoctor) {
    throw forbidden("You do not have permission to check in for this appointment.");
  }

  if (appointment.status !== "pending" && appointment.status !== "accepted") {
    throw new ValidationError({
      non_field_errors: ["Only upcoming appointments can be checked in."],
    });
  }
  if (appointment.checked_in_at) {
    return { data: appointmentDto(appointment), message: "Already checked in." };
  }

  // Check-in opens on the patient's own day — a booking made for next week
  // cannot jump the line today.
  const profile = await getPatientProfile(appointment.patient_id).catch(() => null);
  const today = localDateString(new Date(), profile?.timezone || "UTC");
  const appointmentDay = appointment.appointment_date.toISOString().slice(0, 10);
  if (appointmentDay !== today) {
    throw new ValidationError({
      non_field_errors: ["You can only check in on the day of your appointment."],
    });
  }

  const updated = await appointments.updateAppointment(appointment.id, {
    checked_in_at: new Date(),
  });
  return { data: appointmentDto(updated), message: "Checked in." };
}

/**
 * POST /api/queue/{id}/start/ — the ordering doctor calls the next patient.
 * The patient must be checked in, and only one consultation may run at a time.
 */
export async function startConsultation(user: AuthUser, id: number) {
  if (user.role !== "doctor") {
    throw forbidden("Only doctors can start a consultation.");
  }
  const doctor = await doctors.findDoctorByUserId(user.id);
  if (!doctor) throw notFound("Doctor profile not found.");

  const appointment = await appointments.findAppointmentById(id);
  if (!appointment || appointment.doctor_id !== doctor.id) {
    throw notFound("Appointment not found.");
  }
  if (appointment.status !== "pending" && appointment.status !== "accepted") {
    throw new ValidationError({
      non_field_errors: ["Only upcoming appointments can be started."],
    });
  }
  if (!appointment.checked_in_at) {
    throw new ValidationError({ non_field_errors: ["Check the patient in first."] });
  }
  if (appointment.consultation_started_at) {
    return { data: appointmentDto(appointment), message: "Consultation already started." };
  }

  const other = await appointments.findLiveConsultation(
    doctor.id,
    appointment.appointment_date,
    appointment.id
  );
  if (other) {
    throw new ValidationError({
      non_field_errors: ["Finish the current consultation first."],
    });
  }

  const updated = await appointments.updateAppointment(id, {
    consultation_started_at: new Date(),
  });
  await notify(
    updated.patient_id,
    "system",
    `Your consultation has started: ${updated.appointment_date.toISOString().slice(0, 10)} ${updated.start_time}.`,
    updated.id,
    "Consultation started"
  );
  broadcastAppointmentEvent(updated, "appointment.updated", [
    updated.patient_id,
    doctor.user_id,
  ]);
  return { data: appointmentDto(updated), message: "Consultation started." };
}
