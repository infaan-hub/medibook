/**
 * Appointment reminders — port of the Django management command
 * `manage.py send_reminders` (appointments/management/commands/).
 * Dispatched in-process on an interval by instrumentation.ts, or on demand
 * via `npm run reminders` from cron.
 */
import { prisma } from "./db";
import { dateStr } from "./serialize";
import { notify } from "./notify";
import { combineDateTime, hhmm } from "./dates";

export async function sendDueReminders(): Promise<number> {
  const now = new Date();
  const due = await prisma.appointmentReminder.findMany({
    where: { sent: false, scheduled_for: { lte: now } },
    include: {
      appointment: { include: { patient: true, doctor: { include: { user: true } } } },
    },
  });

  let sent = 0;
  for (const reminder of due) {
    const appointment = reminder.appointment;
    if (["cancelled", "rejected", "completed"].includes(appointment.status)) {
      await prisma.appointmentReminder.update({
        where: { id: reminder.id },
        data: { sent: true },
      });
      continue;
    }

    const doctorUser = appointment.doctor.user;
    const doctorName =
      `Dr. ${doctorUser.first_name} ${doctorUser.last_name}`.trim() ||
      `Dr. ${doctorUser.username}`;

    const messages: Record<string, string> = {
      "1h": `Reminder: Your appointment with ${doctorName} is in 1 hour at ${hhmm(appointment.start_time)}.`,
      "24h": `Reminder: You have an appointment with ${doctorName} tomorrow at ${hhmm(appointment.start_time)}.`,
      "1w": `Reminder: You have an appointment with ${doctorName} on ${dateStr(appointment.appointment_date)} at ${hhmm(appointment.start_time)}.`,
    };

    await notify(
      appointment.patient_id,
      "appointment_reminder",
      messages[reminder.reminder_type] ?? "Appointment reminder.",
      appointment.id
    );
    await prisma.appointmentReminder.update({
      where: { id: reminder.id },
      data: { sent: true },
    });
    sent += 1;
  }
  return sent;
}

export { combineDateTime };
