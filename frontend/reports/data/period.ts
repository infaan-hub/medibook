/**
 * Reporting periods.
 *
 * Every report is scoped to an inclusive calendar-date range resolved on the
 * SERVER in the reporting timezone (`REPORT_TIMEZONE`, §8 / §38) — the browser
 * clock is never consulted, so two people pressing "This month" at the same
 * moment get the same document.
 */
import { addDaysIso, daysInMonth, isoWeekday } from "@/lib/dates";
import { APP_TIMEZONE, isoDayInTimezone, periodLabel } from "./format";

export type ReportPreset = "month" | "week" | "custom";

/** An inclusive calendar-date range plus the copy the PDF prints. */
export interface ReportPeriod {
  preset: ReportPreset;
  /** Inclusive first calendar date, `YYYY-MM-DD`. */
  start: string;
  /** Inclusive last calendar date, `YYYY-MM-DD`. */
  end: string;
  /** Pre-formatted range, e.g. "1 October 2026 — 31 October 2026". */
  label: string;
  /** Short preset name for the cover metadata, e.g. "This month". */
  name: string;
}

export interface PeriodQuery {
  preset?: string | null | undefined;
  /** Custom range start, `YYYY-MM-DD`. */
  from?: string | null | undefined;
  /** Custom range end, `YYYY-MM-DD`. */
  to?: string | null | undefined;
  /** Month preset, `YYYY-MM`. */
  month?: string | null | undefined;
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const ISO_MONTH = /^\d{4}-\d{2}$/;

/** Today's calendar date in the reporting timezone (never the server's). */
export function todayInReportingTimezone(now: Date = new Date()): string {
  return isoDayInTimezone(now);
}

/** Monday (ISO weekday 0) of the week containing `iso`. */
export function weekStart(iso: string): string {
  return addDaysIso(iso, -isoWeekday(iso));
}

const isDate = (value: unknown): value is string =>
  typeof value === "string" && ISO_DATE.test(value);

function monthRange(month: string): { start: string; end: string } | null {
  if (!ISO_MONTH.test(month)) return null;
  const [year, monthNumber] = month.split("-").map(Number);
  if (!year || !monthNumber || monthNumber < 1 || monthNumber > 12) return null;
  return {
    start: `${month}-01`,
    end: `${month}-${String(daysInMonth(year, monthNumber)).padStart(2, "0")}`,
  };
}

/** Resolve the requested scope into a concrete, validated period. */
export function resolvePeriod(query: PeriodQuery = {}, now: Date = new Date()): ReportPeriod {
  const today = todayInReportingTimezone(now);
  const preset = (query.preset ?? "").trim().toLowerCase();

  if (preset === "week") {
    const start = weekStart(today);
    const end = addDaysIso(start, 6);
    return { preset: "week", start, end, label: periodLabel(start, end), name: "This week" };
  }

  if (preset === "custom") {
    const from = isDate(query.from) ? query.from : null;
    const to = isDate(query.to) ? query.to : null;
    if (from && to) {
      // Never emit an inverted range: swap rather than fail the whole report.
      const start = from <= to ? from : to;
      const end = from <= to ? to : from;
      return { preset: "custom", start, end, label: periodLabel(start, end), name: "Custom range" };
    }
    if (from) {
      const start = from <= today ? from : today;
      return {
        preset: "custom",
        start,
        end: today,
        label: periodLabel(start, today),
        name: "Custom range",
      };
    }
    if (to) {
      const start = to <= today ? to : today;
      return {
        preset: "custom",
        start,
        end: start,
        label: periodLabel(start, start),
        name: "Custom range",
      };
    }
    // No usable dates — fall through to the default month scope.
  }

  const requested = typeof query.month === "string" ? query.month.trim() : "";
  const explicit = requested ? monthRange(requested) : null;
  if (explicit) {
    return {
      preset: "month",
      ...explicit,
      label: periodLabel(explicit.start, explicit.end),
      name: "Monthly",
    };
  }

  const current = monthRange(today.slice(0, 7))!;
  return {
    preset: "month",
    ...current,
    label: periodLabel(current.start, current.end),
    name: "This month",
  };
}

/* --------------------------- Prisma range filters ------------------------- */

const startOfDay = (iso: string): Date => new Date(`${iso}T00:00:00.000Z`);

/** Filter for `@db.Date` columns (appointment_date, follow_up_date, …). */
export function dateColumnRange(period: ReportPeriod) {
  return { gte: startOfDay(period.start), lte: startOfDay(period.end) };
}

/**
 * Filter for timestamp columns (`created_at`, `recorded_at`, …): the window is
 * the reporting timezone's local midnight-to-midnight, expressed in UTC.
 */
export function timestampRange(period: ReportPeriod) {
  return {
    gte: zonedInstant(period.start, 0),
    lte: zonedInstant(period.end, 23, 59, 59, 999),
  };
}

/** UTC instant of a wall-clock time on `iso` in the reporting timezone. */
function zonedInstant(iso: string, hour: number, minute = 0, second = 0, ms = 0): Date {
  const [year, month, day] = iso.split("-").map(Number);
  const naive = Date.UTC(year, month - 1, day, hour, minute, second, ms);
  // Two passes converge across DST shifts (Africa/Dar_es_Salaam has none).
  let instant = naive - tzOffset(new Date(naive), APP_TIMEZONE);
  instant = naive - tzOffset(new Date(instant), APP_TIMEZONE);
  return new Date(instant);
}

/** Offset (localWallClock read as UTC − actual UTC) of `date` in `timeZone`. */
function tzOffset(date: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(date);
  const get = (type: Intl.DateTimeFormatPartTypes): number =>
    Number(parts.find((part) => part.type === type)?.value ?? "0");
  const asUtc = Date.UTC(
    get("year"),
    get("month") - 1,
    get("day"),
    get("hour") % 24,
    get("minute"),
    get("second")
  );
  // `formatToParts` has no millisecond field, so compare against the
  // second-truncated instant — otherwise sub-second remainders leak into the
  // offset and shift the boundary by up to 999ms.
  return asUtc - Math.floor(date.getTime() / 1000) * 1000;
}

/* --------------------------- Clinical reports ---------------------------- */

/**
 * "Everything on record" — used by the doctor and patient medical reports when
 * no explicit period is requested, so a patient's report is never silently
 * truncated to the current calendar month.
 *
 * `sinceIso` is the earliest date the report could possibly contain (the
 * patient's registration date, or today when unknown).
 */
export function fullRecordPeriod(sinceIso?: string | null, now: Date = new Date()): ReportPeriod {
  const today = todayInReportingTimezone(now);
  const candidate = typeof sinceIso === "string" && ISO_DATE.test(sinceIso) ? sinceIso : today;
  const start = candidate <= today ? candidate : today;
  return {
    preset: "custom",
    start,
    end: today,
    label: periodLabel(start, today),
    name: "Full record",
  };
}

/** True when the query actually asked for a bounded period. */
export function hasExplicitPeriod(query: PeriodQuery): boolean {
  return Boolean(
    (query.preset ?? "").trim() ||
      (query.month ?? "").trim() ||
      (query.from ?? "").trim() ||
      (query.to ?? "").trim()
  );
}


