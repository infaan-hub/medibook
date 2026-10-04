/**
 * Date / time primitives.
 *
 * All calendar dates are handled as UTC "YYYY-MM-DD" strings — matching
 * Django's USE_TZ=True configuration, whose slot times live in UTC. Time-only
 * values are zero-padded "HH:MM:SS" strings (Django TimeField's exact
 * serialization), so ordering and comparison are plain string operations.
 */

export const pad2 = (value: number): string => String(value).padStart(2, "0");

/** Current UTC calendar date (Django timezone.localdate() with TIME_ZONE=UTC). */
export const todayIso = (): string => new Date().toISOString().slice(0, 10);

/** "09:30" → "09:30:00"; "09:30:15" unchanged. */
export function normalizeTime(value: string): string {
  const trimmed = value.trim();
  if (/^\d{1,2}:\d{2}$/.test(trimmed)) {
    const [h, m] = trimmed.split(":");
    return `${pad2(Number(h))}:${m}:00`;
  }
  if (/^\d{1,2}:\d{2}:\d{2}$/.test(trimmed)) {
    const [h, m, s] = trimmed.split(":");
    return `${pad2(Number(h))}:${m}:${s}`;
  }
  return trimmed;
}

/** "HH:MM:SS" → seconds since midnight. */
export function timeToSeconds(time: string): number {
  const [h = "0", m = "0", s = "0"] = time.split(":");
  return Number(h) * 3600 + Number(m) * 60 + Number(s);
}

/** Seconds since midnight → "HH:MM:SS". */
export function secondsToTime(total: number): string {
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return `${pad2(h)}:${pad2(m)}:${pad2(s)}`;
}

/** "HH:MM" display form (Django strftime("%H:%M") used in availability). */
export const hhmm = (time: string): string => time.slice(0, 5);

/** ISO date ± n days (pure calendar arithmetic, no local-time shifts). */
export function addDaysIso(date: string, days: number): string {
  const [y, m, d] = date.split("-").map(Number);
  const next = new Date(Date.UTC(y, m - 1, d + days));
  return `${next.getUTCFullYear()}-${pad2(next.getUTCMonth() + 1)}-${pad2(next.getUTCDate())}`;
}

/** Weekday of an ISO date with Django/Python semantics: 0=Monday … 6=Sunday. */
export function isoWeekday(date: string): number {
  const [y, m, d] = date.split("-").map(Number);
  const jsDay = new Date(Date.UTC(y, m - 1, d)).getUTCDay(); // 0=Sunday
  return (jsDay + 6) % 7;
}

/** Days in a given year/month (calendar.monthrange equivalent). */
export function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/** Full English weekday (Django strftime("%A")). */
export const EN_WEEKDAYS = [
  "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday",
];

/** Combines "YYYY-MM-DD" + "HH:MM:SS" into a Date (UTC), like datetime.combine. */
export function combineDateTime(date: string, time: string): Date {
  return new Date(`${date}T${normalizeTime(time)}Z`);
}
