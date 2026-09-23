// CLI wrapper: send due appointment reminders (npm run reminders).
// Plain ESM — no TS imports.
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const TITLES = {
  appointment_request: "New appointment request",
  appointment_confirmed: "Appointment confirmed",
  appointment_cancelled: "Appointment cancelled",
  appointment_rejected: "Appointment rejected",
  appointment_reminder: "Appointment reminder",
  review: "New review",
  system: "MediBook update",
};

async function notify(recipientId, notificationType, message, appointmentId) {
  return prisma.notification.create({
    data: {
      recipient_id: recipientId,
      notification_type: notificationType,
      title: TITLES[notificationType] ?? "MediBook update",
      message,
      ...(appointmentId != null ? { related_appointment_id: appointmentId } : {}),
    },
  });
}

function hhmm(time) {
  return String(time).slice(0, 5);
}

function dateStr(d) {
  const dt = d instanceof Date ? d : new Date(d);
  return dt.toISOString().slice(0, 10);
}

async function sendDueReminders() {
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

    const messages = {
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

const count = await sendDueReminders();
console.log(`Sent ${count} reminder(s).`);
await prisma.$disconnect();
