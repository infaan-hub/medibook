/**
 * Locale-aware formatting.
 *
 * Dates and numbers always follow the UI language that is currently active —
 * not the browser's own locale — so a user who switched MediBook to Français
 * sees French dates even on an English-configured device. User-entered content
 * (names, notes, article text) is never translated; only presentation changes.
 */
import i18n, { normalizeLanguage, type AppLanguage } from "../i18n";

/** A concrete BCP-47 locale for Intl (the app language is only a short code). */
const INTL_LOCALES: Record<AppLanguage, string> = {
  en: "en-US",
  sw: "sw-TZ",
  fr: "fr-FR",
  es: "es-ES",
  de: "de-DE",
};

export function activeAppLanguage(): AppLanguage {
  return normalizeLanguage(i18n.resolvedLanguage ?? i18n.language) ?? "en";
}

/** The locale string to pass to Intl.DateTimeFormat / Intl.NumberFormat. */
export function intlLocale(): string {
  return INTL_LOCALES[activeAppLanguage()];
}

function asDate(value: Date | string | number | null | undefined): Date | null {
  if (value === null || value === undefined || value === "") return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

const DEFAULT_DATE: Intl.DateTimeFormatOptions = {
  year: "numeric",
  month: "short",
  day: "numeric",
};

/** Format a date (or ISO string) in the active UI language. */
export function formatDate(
  value: Date | string | number | null | undefined,
  options: Intl.DateTimeFormatOptions = DEFAULT_DATE
): string {
  const date = asDate(value);
  if (!date) return "—";
  try {
    return new Intl.DateTimeFormat(intlLocale(), options).format(date);
  } catch {
    return date.toLocaleDateString("en-US", options);
  }
}

/** Format a time (or ISO string) in the active UI language. */
export function formatTime(
  value: Date | string | number | null | undefined,
  options: Intl.DateTimeFormatOptions = { hour: "2-digit", minute: "2-digit" }
): string {
  const date = asDate(value);
  if (!date) return "—";
  try {
    return new Intl.DateTimeFormat(intlLocale(), options).format(date);
  } catch {
    return date.toLocaleTimeString("en-US", options);
  }
}

/** Format a combined date + time in the active UI language. */
export function formatDateTime(
  value: Date | string | number | null | undefined,
  options: Intl.DateTimeFormatOptions = {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }
): string {
  const date = asDate(value);
  if (!date) return "—";
  try {
    return new Intl.DateTimeFormat(intlLocale(), options).format(date);
  } catch {
    return date.toLocaleString("en-US", options);
  }
}

/** Format a number (including counts and currency-like values) in the active UI language. */
export function formatNumber(
  value: number | bigint | null | undefined,
  options?: Intl.NumberFormatOptions
): string {
  if (value === null || value === undefined) return "—";
  try {
    return new Intl.NumberFormat(intlLocale(), options).format(value);
  } catch {
    return new Intl.NumberFormat("en-US", options).format(value);
  }
}
