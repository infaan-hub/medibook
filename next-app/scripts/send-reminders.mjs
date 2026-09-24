// CLI wrapper: send due appointment reminders (npm run reminders).
// Prefers POST /api/cron/reminders/ when the server is up (shared TS engine);
// otherwise runs a local idempotent engine that mirrors lib/reminders.ts.

const BASE = process.env.REMINDERS_HTTP_URL || `http://127.0.0.1:${process.env.PORT || 8000}`;
const secret = process.env.CRON_SECRET || "";

async function tryHttp() {
  try {
    const res = await fetch(`${BASE}/api/cron/reminders/`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(secret ? { "x-cron-secret": secret } : {}),
      },
      body: "{}",
      signal: AbortSignal.timeout(15_000),
    });
    if (res.ok) {
      const body = await res.json().catch(() => null);
      const data = body?.data ?? body;
      console.log(
        `Sent ${data?.sent ?? "?"} reminder(s) (skipped=${data?.skipped ?? "?"} failed=${data?.failed ?? "?"}) via HTTP.`
      );
      return true;
    }
    if (res.status === 400 || res.status === 401 || res.status === 403) {
      console.warn("HTTP reminders rejected (check CRON_SECRET); falling back to local engine.");
      return false;
    }
  } catch {
    // Server not running — fall through to local engine.
  }
  return false;
}

// Local fallback: same logic as lib/reminders.ts (atomic claim + preferences).
async function localRun() {
  const { PrismaClient } = await import("@prisma/client");
  const prisma = new PrismaClient();

  const TITLES = {
    appointment_reminder: "Appointment reminder",
    system: "MediBook update",
  };

  function reminderEnabled(prefs, type) {
    if (prefs === null || prefs === undefined || typeof prefs !== "object") return true;
    if (prefs.appointment_reminders === false || prefs.all === false) return false;
    return prefs[type] !== false;
  }

  function isValidTz(tz) {
    if (typeof tz !== "string" || !tz) return false;
    try {
      new Intl.DateTimeFormat("en-US", { timeZone: tz });
      return true;
    } catch {
      return false;
    }
  }

  function formatTimeInTz(date, timeZone) {
    try {
      return new Intl.DateTimeFormat("en-GB", {
        timeZone,
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      }).format(date);
    } catch {
      return String(date.toISOString().slice(11, 16));
    }
  }

  function formatDateInTz(date, timeZone) {
    try {
      return new Intl.DateTimeFormat("en-CA", {
        timeZone,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }).format(date);
    } catch {
      return date.toISOString().slice(0, 10);
    }
  }

  const now = new Date();
  const due = await prisma.appointmentReminder.findMany({
    where: { sent: false, scheduled_for: { lte: now } },
    include: {
      appointment: {
        include: { patient: true, doctor: { include: { user: true } } },
      },
    },
  });

  let sent = 0;
  let skipped = 0;
  let failed = 0;

  for (const reminder of due) {
    const claimed = await prisma.appointmentReminder.updateMany({
      where: { id: reminder.id, sent: false },
      data: { sent: true },
    });
    if (claimed.count === 0) continue;

    const appt = reminder.appointment;
    if (["cancelled", "rejected", "completed"].includes(appt.status)) {
      skipped += 1;
      continue;
    }
    if (!reminderEnabled(appt.patient.reminder_preferences, reminder.reminder_type)) {
      skipped += 1;
      continue;
    }

    try {
      const doctorUser = appt.doctor.user;
      const doctorName =
        `Dr. ${doctorUser.first_name} ${doctorUser.last_name}`.trim() ||
        `Dr. ${doctorUser.username}`;
      const tz =
        isValidTz(appt.patient.timezone) ? appt.patient.timezone : "UTC";
      const startsAt = new Date(
        `${appt.appointment_date.toISOString().slice(0, 10)}T${appt.start_time}Z`
      );
      const localTime = formatTimeInTz(startsAt, tz);
      const localDate = formatDateInTz(startsAt, tz);

      const messages = {
        "1h": `Reminder: Your appointment with ${doctorName} is in 1 hour at ${localTime} (${tz}).`,
        "24h": `Reminder: You have an appointment with ${doctorName} on ${localDate} at ${localTime} (${tz}).`,
        "1w": `Reminder: You have an appointment with ${doctorName} on ${localDate} at ${localTime} (${tz}).`,
      };

      const message =
        messages[reminder.reminder_type] ?? "Appointment reminder.";
      await prisma.notification.create({
        data: {
          recipient_id: appt.patient_id,
          notification_type: "appointment_reminder",
          title: TITLES.appointment_reminder,
          message,
          related_appointment_id: appt.id,
        },
      });
      sent += 1;
    } catch (error) {
      failed += 1;
      await prisma.appointmentReminder
        .update({ where: { id: reminder.id }, data: { sent: false } })
        .catch(() => {});
      console.error(`[reminders] failed id=${reminder.id}:`, error);
    }
  }

  await prisma.$disconnect();
  console.log(`Sent ${sent} reminder(s) (skipped=${skipped} failed=${failed}) via local engine.`);
}

const viaHttp = await tryHttp();
if (!viaHttp) {
  await localRun();
}
