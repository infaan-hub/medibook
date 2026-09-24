/**
 * Appointment reminder engine.
 *
 * Pipeline: due query → atomic claim (idempotency) → status check →
 * preference check → timezone-aware message → in-app notify → web push.
 *
 * Safe under concurrent runners (instrumentation interval + npm run reminders +
 * HTTP cron): only one worker can claim each reminder row.
 */
import { prisma } from "./db";
import { dateStr } from "./serialize";
import { notify } from "./notify";
import { combineDateTime, hhmm } from "./dates";

export interface ReminderRunResult {
  sent: number;
  skipped: number;
  failed: number;
}

type DueReminder = {
  id: number;
  reminder_type: string;
  appointment: {
    id: number;
    status: string;
    appointment_date: Date;
    start_time: string;
    patient_id: number;
    patient: {
      reminder_preferences: unknown;
      timezone: string | null;
    };
    doctor: {
      user: { first_name: string; last_name: string; username: string };
    };
  };
};

function isValidTimeZone(tz: unknown): tz is string {
  if (typeof tz !== "string" || !tz) return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

function resolveTimeZone(patient: { timezone?: string | null } | null | undefined): string {
  const tz = patient?.timezone;
  return isValidTimeZone(tz) ? tz : "UTC";
}

function formatTimeInTz(date: Date, timeZone: string): string {
  try {
    return new Intl.DateTimeFormat("en-GB", {
      timeZone,
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).format(date);
  } catch {
    return hhmm(date.toISOString().slice(11, 19));
  }
}

function formatDateInTz(date: Date, timeZone: string): string {
  try {
    return new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(date);
  } catch {
    return dateStr(date) ?? date.toISOString().slice(0, 10);
  }
}

/** Preference key matches reminder_type ("1h" | "24h" | "1w"). Missing = enabled. */
export function reminderEnabled(prefs: unknown, reminderType: string): boolean {
  if (prefs === null || prefs === undefined || typeof prefs !== "object") return true;
  const record = prefs as Record<string, unknown>;
  if (record.appointment_reminders === false) return false;
  if (record.all === false) return false;
  return record[reminderType] !== false;
}

function buildMessage(reminder: DueReminder): string {
  const appt = appointmentBase(reminder);
  const doctorUser = reminder.appointment.doctor.user;
  const doctorName =
    `Dr. ${doctorUser.first_name} ${doctorUser.last_name}`.trim() ||
    `Dr. ${doctorUser.username}`;
  const tz = resolveTimeZone(reminder.appointment.patient as { timezone?: string | null });
  const startsAt = combineDateTime(
    dateStr(appt.appointment_date) ?? appt.appointment_date.toISOString().slice(0, 10),
    appt.start_time
  );
  const localTime = formatTimeInTz(startsAt, tz);
  const localDate = formatDateInTz(startsAt, tz);
  const localDay = formatDateInTz(new Date(), tz);

  switch (reminder.reminder_type) {
    case "1h":
      return `Reminder: Your appointment with ${doctorName} is in 1 hour at ${localTime} (${tz}).`;
    case "24h":
      return `Reminder: You have an appointment with ${doctorName} on ${localDate} at ${localTime} (${tz}).`;
    case "1w":
      return `Reminder: You have an appointment with ${doctorName} on ${localDate} at ${localTime} (${tz}).`;
    default:
      void localDay;
      return `Reminder: You have an appointment with ${doctorName} on ${localDate} at ${localTime} (${tz}).`;
  }
}

function appointmentBase(reminder: DueReminder) {
  return reminder.appointment;
}

/**
 * Send all due reminders. Idempotent: each row is claimed atomically with
 * `sent: false → true` before side effects run.
 */
export async function sendDueReminders(): Promise<ReminderRunResult> {
  const now = new Date();
  const result: ReminderRunResult = { sent: 0, skipped: 0, failed: 0 };

  const due = (await prisma.appointmentReminder.findMany({
    where: { sent: false, scheduled_for: { lte: now } },
    include: {
      appointment: {
        include: {
          patient: true,
          doctor: { include: { user: true } },
        },
      },
    },
  })) as unknown as DueReminder[];

  for (const reminder of due) {
    // Atomic claim — only one concurrent runner wins.
    const claimed = await prisma.appointmentReminder.updateMany({
      where: { id: reminder.id, sent: false },
      data: { sent: true },
    });
    if (claimed.count === 0) {
      continue; // another worker already processed this row
    }

    const appointment = appointmentBase(reminder);
    if (["cancelled", "rejected", "completed"].includes(appointment.status)) {
      result.skipped += 1;
      continue;
    }

    if (!reminderEnabled(appointment.patient.reminder_preferences, reminder.reminder_type)) {
      result.skipped += 1;
      continue;
    }

    try {
      const message = buildMessage(reminder);
      // notify() creates the inbox row, emits notification.created, and sends web push.
      await notify(
        appointment.patient_id,
        "appointment_reminder",
        message,
        appointment.id
      );
      result.sent += 1;
      console.log(
        `[reminders] sent type=${reminder.reminder_type} appt=${appointment.id} user=${appointment.patient_id}`
      );
    } catch (error) {
      // Release the claim so the next run can retry a transient failure.
      result.failed += 1;
      await prisma.appointmentReminder
        .update({ where: { id: reminder.id }, data: { sent: false } })
        .catch(() => undefined);
      console.error(`[reminders] failed id=${reminder.id}:`, error);
    }
  }

  return result;
}

export { combineDateTime };
