/**
 * Scheduling service — the exact TypeScript port of
 * backend/doctors/scheduling.py::available_slots() plus the schedule
 * window / break / exception management views.
 *
 * Behaviour preserved (§14):
 *   • doctor.is_available=false → no slots
 *   • a full-day exception (times null) closes the date entirely
 *   • windows iterate from start in slot_duration steps while cursor+step ≤ end
 *   • slots overlapping any break or exception are skipped
 *   • slots already booked (any status except cancelled/rejected) are skipped
 *   • times are compared as zero-padded strings (identical to HH:MM:SS order)
 */
import { ValidationError, notFound } from "@/lib/errors";
import { secondsToTime, timeToSeconds, normalizeTime, isoWeekday, daysInMonth } from "@/lib/dates";
import * as doctors from "@/repositories/doctors.repo";
import { bookedSlotKeysForDate } from "@/repositories/appointments.repo";
import type { AuthUser } from "@/lib/auth";

export interface Slot {
  start_time: string;
  end_time: string;
}

/** Port of doctors/scheduling.py::available_slots(). */
export async function availableSlots(
  doctorId: number,
  isAvailable: boolean,
  target: string
): Promise<Slot[]> {
  if (!isAvailable) return [];

  const exceptions = await doctors.listExceptionsForDate(doctorId, target);
  // Full-day closure (start_time null) → no slots at all.
  if (exceptions.some((item) => item.start_time === null)) return [];

  const booked = await bookedSlotKeysForDate(doctorId, target);
  const windows = await doctors.listActiveWindowsForWeekday(doctorId, isoWeekday(target));
  const slots: Slot[] = [];

  for (const window of windows) {
    const windowStart = timeToSeconds(window.start_time);
    const windowEnd = timeToSeconds(window.end_time);
    const step = window.slot_duration_minutes * 60;
    const breaks = window.breaks.map((item) => ({
      start: timeToSeconds(item.start_time),
      end: timeToSeconds(item.end_time),
    }));
    const exceptionRanges = exceptions
      .filter((item) => item.start_time && item.end_time)
      .map((item) => ({
        start: timeToSeconds(item.start_time as string),
        end: timeToSeconds(item.end_time as string),
      }));

    for (let cursor = windowStart; cursor + step <= windowEnd; cursor += step) {
      const startSec = cursor;
      const endSec = cursor + step;
      const overlapsBreak = breaks.some((b) => startSec < b.end && endSec > b.start);
      const overlapsException = exceptionRanges.some((e) => startSec < e.end && endSec > e.start);
      const start = secondsToTime(startSec);
      const end = secondsToTime(endSec);
      if (!overlapsBreak && !overlapsException && !booked.has(`${start}|${end}`)) {
        slots.push({ start_time: start, end_time: end });
      }
    }
  }
  return slots;
}

/** GET /api/doctors/{id}/available-days/ — days in a month with ≥1 slot. */
export async function availableDays(
  doctorId: number,
  isAvailable: boolean,
  year: number,
  month: number,
  today: string
): Promise<string[]> {
  const windows = await doctors.listWindows(doctorId);
  const activeWeekdays = new Set(windows.filter((w) => w.is_active).map((w) => w.weekday));
  const total = daysInMonth(year, month);
  const available: string[] = [];

  for (let day = 1; day <= total; day += 1) {
    const iso = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    if (iso < today) continue;
    if (!activeWeekdays.has(isoWeekday(iso))) continue;
    const exceptions = await doctors.listExceptionsForDate(doctorId, iso);
    if (exceptions.some((item) => item.start_time === null)) continue;
    if ((await availableSlots(doctorId, isAvailable, iso)).length > 0) available.push(iso);
  }
  return available;
}

/* -------------------- Schedule management (doctor's own) -------------------- */

/** Window must belong to the requesting doctor (else 404, Django parity). */
async function ownedWindow(user: AuthUser, id: number) {
  const window = await doctors.findWindow(id);
  const doctor = await doctors.findDoctorByUserId(user.id);
  if (!window || !doctor || window.doctor_id !== doctor.id) throw notFound();
  return { window, doctor };
}

export async function getOwnWindows(user: AuthUser) {
  const doctor = await doctors.findDoctorByUserId(user.id);
  if (!doctor) throw notFound("Create your doctor profile first.");
  return doctors.listWindows(doctor.id);
}

export async function createOwnWindow(user: AuthUser, body: unknown) {
  const { availabilitySchema } = await import("@/validators/doctor");
  const { parse } = await import("@/validators/base");
  const input = parse(availabilitySchema, body);
  const doctor = await doctors.findDoctorByUserId(user.id);
  if (!doctor) throw notFound("Create your doctor profile first.");
  return doctors.createWindow(doctor.id, {
    weekday: input.weekday,
    start_time: normalizeTime(input.start_time),
    end_time: normalizeTime(input.end_time),
    ...(input.slot_duration_minutes !== undefined
      ? { slot_duration_minutes: input.slot_duration_minutes }
      : {}),
    ...(input.is_active !== undefined ? { is_active: input.is_active } : {}),
  });
}

export async function updateOwnWindow(user: AuthUser, id: number, body: unknown) {
  const { availabilitySchema } = await import("@/validators/doctor");
  const { parse } = await import("@/validators/base");
  const { window } = await ownedWindow(user, id);
  const input = parse(availabilitySchema.innerType().partial(), body);
  // Partial merge validation mirrors AvailabilitySerializer(instance, partial).
  const start = input.start_time ? normalizeTime(input.start_time) : window.start_time;
  const end = input.end_time ? normalizeTime(input.end_time) : window.end_time;
  if (end <= start) {
    throw new ValidationError({ end_time: ["End time must be after start time."] });
  }
  return doctors.updateWindow(id, {
    ...(input.weekday !== undefined ? { weekday: input.weekday } : {}),
    start_time: start,
    end_time: end,
    ...(input.slot_duration_minutes !== undefined ? { slot_duration_minutes: input.slot_duration_minutes } : {}),
    ...(input.is_active !== undefined ? { is_active: input.is_active } : {}),
  });
}

export async function deleteOwnWindow(user: AuthUser, id: number): Promise<void> {
  await ownedWindow(user, id);
  await doctors.deleteWindow(id);
}

/* --------------------------------- Breaks ---------------------------------- */

export async function listOwnBreaks(user: AuthUser, windowId: number) {
  await ownedWindow(user, windowId);
  return doctors.listBreaks(windowId);
}

async function ownedBreak(user: AuthUser, id: number) {
  const doctor = await doctors.findDoctorByUserId(user.id);
  if (!doctor) throw notFound();
  const item = await doctors.findBreakOwned(id, doctor.id);
  if (!item) throw notFound();
  return { item, doctor };
}

export async function createOwnBreak(user: AuthUser, windowId: number, body: unknown) {
  const { breakSchema } = await import("@/validators/doctor");
  const { parse } = await import("@/validators/base");
  const { window } = await ownedWindow(user, windowId);
  const input = parse(breakSchema, body);
  const start = normalizeTime(input.start_time);
  const end = normalizeTime(input.end_time);
  if (start >= end) throw new ValidationError({ end_time: ["End time must be after start time."] });
  if (start < window.start_time || end > window.end_time) {
    throw new ValidationError({ start_time: ["A break must stay within its availability window."] });
  }
  if (await doctors.overlappingBreakExists(windowId, start, end)) {
    throw new ValidationError({ start_time: ["Breaks cannot overlap."] });
  }
  return doctors.createBreak(windowId, start, end);
}

export async function updateOwnBreak(user: AuthUser, id: number, body: unknown) {
  const { breakSchema } = await import("@/validators/doctor");
  const { parse } = await import("@/validators/base");
  const { item } = await ownedBreak(user, id);
  const input = parse(breakSchema.innerType().partial(), body);
  const start = input.start_time ? normalizeTime(input.start_time) : item.start_time;
  const end = input.end_time ? normalizeTime(input.end_time) : item.end_time;
  if (start >= end) throw new ValidationError({ end_time: ["End time must be after start time."] });
  if (start < item.availability.start_time || end > item.availability.end_time) {
    throw new ValidationError({ start_time: ["A break must stay within its availability window."] });
  }
  if (await doctors.overlappingBreakExists(item.availability_id, start, end, id)) {
    throw new ValidationError({ start_time: ["Breaks cannot overlap."] });
  }
  return doctors.updateBreak(id, { start_time: start, end_time: end });
}

export async function deleteOwnBreak(user: AuthUser, id: number): Promise<void> {
  await ownedBreak(user, id);
  await doctors.deleteBreak(id);
}

/* -------------------------- Schedule exceptions ---------------------------- */

/** Django ScheduleExceptionListView._doctor(): get_or_create semantics. */
async function exceptionDoctor(user: AuthUser) {
  const { doctorProfileOrCreate } = await import("@/lib/auth");
  return doctorProfileOrCreate(user.id);
}

export async function listOwnExceptions(user: AuthUser) {
  const doctor = await exceptionDoctor(user);
  return doctors.listExceptions(doctor.id);
}

export async function createOwnException(user: AuthUser, body: unknown) {
  const { scheduleExceptionSchema } = await import("@/validators/doctor");
  const { parse } = await import("@/validators/base");
  const input = parse(scheduleExceptionSchema, body);
  const doctor = await exceptionDoctor(user);
  const start = input.start_time ? normalizeTime(String(input.start_time)) : null;
  const end = input.end_time ? normalizeTime(String(input.end_time)) : null;
  if (start && end && end <= start) {
    throw new ValidationError({ end_time: ["End time must be after start time."] });
  }
  return doctors.createException(doctor.id, {
    date: input.date,
    start_time: start,
    end_time: end,
    reason: input.reason ?? "",
  });
}

async function ownedException(user: AuthUser, id: number) {
  const doctor = await doctors.findDoctorByUserId(user.id);
  if (!doctor) throw notFound();
  const item = await doctors.findExceptionOwned(id, doctor.id);
  if (!item) throw notFound();
  return item;
}

export async function updateOwnException(user: AuthUser, id: number, body: unknown) {
  const { scheduleExceptionSchema } = await import("@/validators/doctor");
  const { parse } = await import("@/validators/base");
  const item = await ownedException(user, id);
  const input = parse(scheduleExceptionSchema.innerType().partial(), body);
  const start =
    input.start_time !== undefined
      ? input.start_time
        ? normalizeTime(String(input.start_time))
        : null
      : item.start_time;
  const end =
    input.end_time !== undefined
      ? input.end_time
        ? normalizeTime(String(input.end_time))
        : null
      : item.end_time;
  if ((start === null) !== (end === null)) {
    throw new ValidationError({
      non_field_errors: ["Provide both start_time and end_time, or neither for a full-day closure."],
    });
  }
  if (start && end && end <= start) {
    throw new ValidationError({ end_time: ["End time must be after start time."] });
  }
  return doctors.updateException(id, {
    ...(input.date !== undefined ? { date: new Date(`${input.date}T00:00:00Z`) } : {}),
    start_time: start,
    end_time: end,
    ...(input.reason !== undefined ? { reason: input.reason } : {}),
  });
}

export async function deleteOwnException(user: AuthUser, id: number): Promise<void> {
  await ownedException(user, id);
  await doctors.deleteException(id);
}


