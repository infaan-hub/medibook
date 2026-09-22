"""Send appointment reminders that are due.

Usage: python manage.py send_reminders

Run via cron every 15 minutes. Queries unsent reminders where scheduled_for <= now,
creates notifications for the patient, and marks them as sent.
"""

from django.core.management.base import BaseCommand
from django.utils import timezone

from appointments.models import AppointmentReminder
from notifications.helpers import notify
from notifications.models import NotificationType


class Command(BaseCommand):
    help = "Send due appointment reminders"

    def handle(self, *args, **options):
        now = timezone.now()
        due = AppointmentReminder.objects.filter(
            sent=False, scheduled_for__lte=now
        ).select_related("appointment__patient", "appointment__doctor__user")

        sent_count = 0
        for reminder in due:
            appt = reminder.appointment
            if appt.status in ("cancelled", "rejected", "completed"):
                reminder.sent = True
                reminder.save(update_fields=["sent"])
                continue

            doctor_user = appt.doctor.user
            doctor_name = (
                f"Dr. {doctor_user.first_name} {doctor_user.last_name}".strip()
                or f"Dr. {doctor_user.username}"
            )

            _MESSAGES = {
                "1h": f"Reminder: Your appointment with {doctor_name} is in 1 hour at {appt.start_time.strftime('%H:%M')}.",
                "24h": f"Reminder: You have an appointment with {doctor_name} tomorrow at {appt.start_time.strftime('%H:%M')}.",
                "1w": f"Reminder: You have an appointment with {doctor_name} on {appt.appointment_date} at {appt.start_time.strftime('%H:%M')}.",
            }

            notify(
                appt.patient,
                NotificationType.APPOINTMENT_REMINDER,
                _MESSAGES.get(reminder.reminder_type, "Appointment reminder."),
                appointment=appt,
            )
            reminder.sent = True
            reminder.save(update_fields=["sent"])
            sent_count += 1

        self.stdout.write(self.style.SUCCESS(f"Sent {sent_count} reminder(s)."))
