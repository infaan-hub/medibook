"""Single source of truth for generating bookable doctor slots."""

from datetime import date, datetime, time, timedelta

from appointments.models import Appointment
from doctors.models import Availability, Doctor, ScheduleException


def available_slots(doctor: Doctor, target: date) -> list[tuple[time, time]]:
    """Return slots that are inside working windows and outside every closure."""
    if not doctor.is_available:
        return []
    exceptions = list(
        ScheduleException.objects.filter(doctor=doctor, date=target).only(
            "start_time", "end_time"
        )
    )
    if any(item.start_time is None for item in exceptions):
        return []
    booked = set(
        Appointment.objects.filter(doctor=doctor, appointment_date=target)
        .exclude(status__in=("cancelled", "rejected"))
        .values_list("start_time", "end_time")
    )
    windows = Availability.objects.filter(
        doctor=doctor, weekday=target.weekday(), is_active=True
    ).prefetch_related("breaks").order_by("start_time")
    slots: list[tuple[time, time]] = []
    for window in windows:
        cursor = datetime.combine(target, window.start_time)
        window_end = datetime.combine(target, window.end_time)
        step = timedelta(minutes=window.slot_duration_minutes)
        breaks = [(item.start_time, item.end_time) for item in window.breaks.all()]
        while cursor + step <= window_end:
            start, end = cursor.time(), (cursor + step).time()
            overlaps_break = any(start < break_end and end > break_start for break_start, break_end in breaks)
            overlaps_exception = any(
                start < item.end_time and end > item.start_time for item in exceptions
            )
            if not overlaps_break and not overlaps_exception and (start, end) not in booked:
                slots.append((start, end))
            cursor += step
    return slots
