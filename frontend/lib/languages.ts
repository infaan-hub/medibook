/**
 * Supported UI languages — the single server-side source of truth.
 *
 * Keep in sync with `src/i18n.ts` (the client catalog). Values are stored in
 * `accounts_user.language` and returned in every session payload so the UI can
 * follow the account across devices.
 */
export const APP_LANGUAGES = ["en", "sw", "fr", "es", "de"] as const;
export type AppLanguage = (typeof APP_LANGUAGES)[number];

export function isAppLanguage(value: unknown): value is AppLanguage {
  return typeof value === "string" && (APP_LANGUAGES as readonly string[]).includes(value);
}

/** Accept "fr-FR", "sw_TZ", "EN" … and return the short supported code. */
export function normalizeLanguage(value: unknown): AppLanguage | null {
  if (typeof value !== "string") return null;
  const normalized = value.toLowerCase().split(/[-_]/)[0];
  return isAppLanguage(normalized) ? normalized : null;
}
