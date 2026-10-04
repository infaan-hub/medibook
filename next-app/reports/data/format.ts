/**
 * Report formatting helpers — one place that decides how a date, a time, a
 * name or a missing value is written into a MediBook PDF.
 *
 * Timezone policy (requirement §8 / §20 / §38):
 *  - the reporting timezone is the APPLICATION's configured timezone, read
 *    server-side (`REPORT_TIMEZONE`, defaulting to the MediBook Zanzibar
 *    operating timezone Africa/Dar_es_Salaam, UTC+3);
 *  - the browser clock/timezone is never consulted;
 *  - calendar-date columns (`@db.Date`: appointment_date, follow_up_date, …)
 *    are rendered as the plain calendar date they store, so a stored
 *    "2026-09-15" always reads 15 September 2026;
 *  - timestamp columns (created_at, recorded_at, …) are rendered in the
 *    reporting timezone with an explicit time.
 */
import { branding } from "../design/tokens";

function resolveTimezone(): string {
  const configured = (process.env.REPORT_TIMEZONE ?? "").trim();
  const candidate = configured || "Africa/Dar_es_Salaam";
  try {
    new Intl.DateTimeFormat("en-GB", { timeZone: candidate });
    return candidate;
  } catch {
    return "UTC";
  }
}

/** The application timezone every report is filtered and rendered in. */
export const APP_TIMEZONE = resolveTimezone();

const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
] as const;

export const monthName = (month: number): string => MONTHS[Math.min(11, Math.max(0, month - 1))];

/**
 * Timestamp → `YYYY-MM-DD` calendar day in the reporting timezone.
 * Used for per-day grouping of timestamp columns (registrations, recorded_at)
 * so a day boundary never shifts because of the server or browser clock.
 */
export function isoDayInTimezone(value: Date | string, timeZone: string = APP_TIMEZONE): string {
  const date = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(date.valueOf())) return "";
  return new Intl.DateTimeFormat("en-CA", { timeZone }).format(date);
}

/** `value` when it has content, otherwise the standard "Not provided". */
export function notProvided(value: unknown): string {
  if (value === null || value === undefined) return branding.notProvided;
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed === "" ? branding.notProvided : trimmed;
  }
  if (typeof value === "number") return String(value);
  if (typeof value === "boolean") return value ? "Yes" : "No";
  return String(value);
}

/** "2026-09-15" (or a Date) → "15 September 2026". */
export function formatIsoDate(value: string | Date | null | undefined): string {
  if (!value) return branding.notProvided;
  const iso = typeof value === "string" ? value.slice(0, 10) : value.toISOString().slice(0, 10);
  const [year, month, day] = iso.split("-");
  if (!year || !month || !day) return branding.notProvided;
  return `${Number(day)} ${monthName(Number(month))} ${year}`;
}

/**
 * Timestamp → "15 September 2026" in the REPORTING timezone.
 *
 * `formatIsoDate` reads a Date's UTC calendar day (correct for `@db.Date`
 * columns, which are pure calendar dates). A real timestamp such as an account
 * creation at 00:30 East Africa Time on 1 September is 31 August in UTC, so
 * dates born from a timestamp must be projected into `APP_TIMEZONE` first.
 */
export function formatTimestampDate(value: Date | string | null | undefined): string {
  if (!value) return branding.notProvided;
  const iso = isoDayInTimezone(value);
  return iso ? formatIsoDate(iso) : branding.notProvided;
}

/** Timestamp → "15 September 2026, 10:42 AM". */
export function formatDateTime(value: Date | string | null | undefined): string {
  if (!value) return branding.notProvided;
  const date = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(date.valueOf())) return branding.notProvided;
  const datePart = new Intl.DateTimeFormat("en-GB", {
    timeZone: APP_TIMEZONE,
    day: "2-digit",
    month: "long",
    year: "numeric",
  }).format(date);
  return `${datePart.replace(/^0/, "")}, ${formatTime(date)}`;
}

/** Timestamp → "10:42 AM" (reporting timezone). */
export function formatTime(value: Date | string | null | undefined): string {
  if (!value) return "";
  const date = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(date.valueOf())) return "";
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: APP_TIMEZONE,
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  })
    .format(date)
    .toUpperCase();
}

/** Calendar date + stored "HH:MM:SS" time → "15 September 2026, 09:30 AM". */
export function formatDateWithClock(
  dateValue: string | Date | null | undefined,
  clock: string | null | undefined
): string {
  const day = formatIsoDate(dateValue);
  if (!clock) return day;
  const [hours, minutes] = clock.split(":");
  const hour24 = Number(hours);
  if (!Number.isFinite(hour24)) return day;
  const suffix = hour24 < 12 ? "AM" : "PM";
  const hour12 = hour24 % 12 || 12;
  return `${day}, ${hour12}:${minutes ?? "00"} ${suffix}`;
}

/** "09:30:00" → "09:30 AM" (no calendar date). */
export function formatClock(clock: string | null | undefined): string {
  if (!clock) return "";
  const [hours, minutes] = clock.split(":");
  const hour24 = Number(hours);
  if (!Number.isFinite(hour24)) return clock;
  const suffix = hour24 < 12 ? "AM" : "PM";
  return `${hour24 % 12 || 12}:${minutes ?? "00"} ${suffix}`;
}

/** "09:30:00" – "10:00:00" → "09:30 AM – 10:00 AM" (en dash). */
export function formatClockRange(start: string | null, end: string | null): string {
  const from = formatClock(start);
  const to = formatClock(end);
  if (!from) return "";
  if (!to) return from;
  return `${from} – ${to}`;
}

/** Person name from split fields, falling back to a username/email. */
export function personName(
  person:
    | { first_name?: string | null; last_name?: string | null; username?: string | null; email?: string | null }
    | null
    | undefined
): string {
  if (!person) return branding.notProvided;
  const name = `${person.first_name ?? ""} ${person.last_name ?? ""}`.trim();
  if (name) return name;
  if (person.username) return person.username;
  if (person.email) return person.email;
  return branding.notProvided;
}

/** "Dr. Amina Hassan" — the app addresses doctors with the Dr. prefix. */
export function doctorName(person: Parameters<typeof personName>[0]): string {
  const name = personName(person);
  if (name === branding.notProvided) return name;
  return /^dr\.?\s/i.test(name) ? name : `Dr. ${name}`;
}

/** Whole years between a stored birth date and now (calendar arithmetic). */
export function ageFrom(dateOfBirth: string | Date | null | undefined, now: Date = new Date()): string {
  if (!dateOfBirth) return branding.notProvided;
  const iso =
    typeof dateOfBirth === "string" ? dateOfBirth.slice(0, 10) : dateOfBirth.toISOString().slice(0, 10);
  const [year, month, day] = iso.split("-").map(Number);
  if (!year || !month || !day) return branding.notProvided;
  let age = now.getUTCFullYear() - year;
  const monthDelta = now.getUTCMonth() + 1 - month;
  if (monthDelta < 0 || (monthDelta === 0 && now.getUTCDate() < day)) age -= 1;
  if (age < 0 || age > 130) return branding.notProvided;
  return `${age} years`;
}

/** Whole-years age as a number (null when unknown) — for compact chips. */
export function ageNumber(
  dateOfBirth: string | Date | null | undefined,
  now: Date = new Date()
): number | null {
  const label = ageFrom(dateOfBirth, now);
  if (label === branding.notProvided) return null;
  const parsed = Number.parseInt(label, 10);
  return Number.isFinite(parsed) ? parsed : null;
}

/** "Accepted" — statuses read as words in a table. */
export function titleCase(value: string | null | undefined): string {
  if (!value) return branding.notProvided;
  return value
    .split(/[\s_]+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

/** "in_progress" → "In Progress". */
export const statusLabel = titleCase;

/** Thousands separators for counts (3,480). */
export const formatCount = (value: number): string => Number(value ?? 0).toLocaleString("en-GB");

/** "01 September 2026 — 30 September 2026" for the reporting period. */
export function periodLabel(startIso: string, endIso: string): string {
  return `${formatIsoDate(startIso)} — ${formatIsoDate(endIso)}`;
}

/** Initials used by the small avatar tiles. */
export function initials(name: string): string {
  const parts = name.replace(/^dr\.?\s+/i, "").split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "MB";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}

/** Gender label, "Not provided" when empty (app: "Not specified"). */
export function genderLabel(gender: string | null | undefined): string {
  const value = (gender ?? "").trim();
  if (!value) return branding.notProvided;
  return value.charAt(0).toUpperCase() + value.slice(1);
}

