/**
 * Rate limiting — port of the Django REST Framework throttle configuration
 * (config/settings.py REST_FRAMEWORK["DEFAULT_THROTTLE_RATES"]):
 *
 *   anon 60/min (per client), user 120/min (per user id),
 *   auth 10/min (register/login/social/refresh), password_reset 5/min.
 *
 * Fixed-window counters kept in process memory — same single-process
 * semantics as DRF's LocMemCache-based throttling in development.
 * THROTTLE_DISABLED=true disables everything (mirrors Django's test mode).
 */
import { ApiError, throttled } from "./errors";

type Bucket = { count: number; resetAt: number };
const buckets = new Map<string, Bucket>();

const RATES: Record<string, number> = {
  anon: 60,
  user: 120,
  auth: 10,
  password_reset: 5,
};

const WINDOW_MS = 60_000;

export const throttleDisabled = (): boolean =>
  process.env.THROTTLE_DISABLED === "true";

/** Client identity: forwarded IP first (production), else loopback marker. */
export function clientKey(req: Request): string {
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  return "local";
}

function hit(key: string, limit: number): void {
  const now = Date.now();
  const bucket = buckets.get(key);
  if (!bucket || bucket.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + WINDOW_MS });
    return;
  }
  bucket.count += 1;
  if (bucket.count > limit) throw throttled();
}

/** Default AnonRateThrottle/UserRateThrottle behaviour. */
export function throttleIdentity(req: Request, userId: number | null): void {
  if (throttleDisabled()) return;
  if (userId !== null) hit(`user:${userId}`, RATES.user);
  else hit(`anon:${clientKey(req)}`, RATES.anon);
}

/** ScopedRateThrottle for the "auth" and "password_reset" views. */
export function throttleScope(req: Request, scope: "auth" | "password_reset"): void {
  if (throttleDisabled()) return;
  hit(`${scope}:${clientKey(req)}`, RATES[scope]);
}

/** Test helper: clear all counters. */
export function resetThrottle(): void {
  buckets.clear();
}

export { ApiError };
