/**
 * Rate limiting — port of the Django REST Framework throttle configuration
 * (config/settings.py REST_FRAMEWORK["DEFAULT_THROTTLE_RATES"]):
 *
 *   anon 60/min (per client), user 120/min (per user id),
 *   auth 10/min (register/login/social/refresh), password_reset 5/min.
 *
 * Auth counters are shared through PostgreSQL so serverless instances honor
 * one common limit. Other scopes and default identity limits remain in-memory.
 * THROTTLE_DISABLED=true disables everything (mirrors Django's test mode).
 */
import { ApiError, throttled } from "./errors";
import { createHash } from "node:crypto";
import { prisma } from "./db";

type Bucket = { count: number; resetAt: number };
const buckets = new Map<string, Bucket>();

const RATES: Record<string, number> = {
  anon: 60,
  user: 120,
  auth: 10,
  password_reset: 5,
  // Dedicated asset bucket for /media/* — generous so avatar/document-heavy
  // pages never 429, but still bounded against hammering the BYTEA store.
  media: 600,
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

/**
 * Cross-instance fixed-window counter for auth endpoints. Hash the scope/IP
 * key before storing it so raw client addresses are never written to this
 * table. The upsert is atomic across Vercel instances sharing PostgreSQL.
 */
async function hitShared(key: string, limit: number): Promise<void> {
  const rateKey = createHash("sha256").update(key).digest("hex");
  let rows: Array<{ hits: number; reset_at: Date }>;
  try {
    rows = await prisma.$queryRaw<Array<{ hits: number; reset_at: Date }>>`
      INSERT INTO "api_rate_limit_bucket" ("key", "hits", "reset_at", "updated_at")
      VALUES (${rateKey}, 1, NOW() + INTERVAL '1 minute', NOW())
      ON CONFLICT ("key") DO UPDATE SET
        "hits" = CASE
          WHEN "api_rate_limit_bucket"."reset_at" <= NOW() THEN 1
          ELSE "api_rate_limit_bucket"."hits" + 1
        END,
        "reset_at" = CASE
          WHEN "api_rate_limit_bucket"."reset_at" <= NOW() THEN NOW() + INTERVAL '1 minute'
          ELSE "api_rate_limit_bucket"."reset_at"
        END,
        "updated_at" = NOW()
      RETURNING "hits", "reset_at"
    `;
  } catch (error) {
    // Don't silently fall back to per-instance limits in production: they can
    // be bypassed by hitting another serverless instance.
    console.error("[throttle] shared rate-limit counter unavailable", error);
    if (process.env.NODE_ENV === "production") {
      throw new ApiError(503, "Sign-in is temporarily unavailable. Please try again shortly.");
    }
    hit(key, limit);
    return;
  }

  const bucket = rows[0];
  if (!bucket) throw new ApiError(503, "Sign-in is temporarily unavailable. Please try again shortly.");
  // Opportunistic TTL cleanup keeps one-off client IPs from growing the
  // counter table indefinitely, without adding a cron service dependency.
  if (Math.random() < 0.01) {
    await prisma.$executeRaw`
      DELETE FROM "api_rate_limit_bucket"
      WHERE "reset_at" < NOW() - INTERVAL '1 day'
    `.catch((error) => console.warn("[throttle] expired bucket cleanup failed", error));
  }
  if (bucket.hits > limit) {
    const retryAfter = Math.max(1, Math.ceil((bucket.reset_at.getTime() - Date.now()) / 1000));
    throw new ApiError(429, "Too many authentication requests. Please wait before trying again.", {}, {
      retry_after_seconds: retryAfter,
    });
  }
}

/** Default AnonRateThrottle/UserRateThrottle behaviour. */
export function throttleIdentity(req: Request, userId: number | null): void {
  if (throttleDisabled()) return;
  if (userId !== null) hit(`user:${userId}`, RATES.user);
  else hit(`anon:${clientKey(req)}`, RATES.anon);
}

/** ScopedRateThrottle for the "auth", "password_reset" and "media" views. */
export async function throttleScope(req: Request, scope: "auth" | "password_reset" | "media"): Promise<void> {
  if (throttleDisabled()) return;
  const key = `${scope}:${clientKey(req)}`;
  if (scope === "auth") {
    await hitShared(key, RATES[scope]);
    return;
  }
  hit(key, RATES[scope]);
}

/** Test helper: clear all counters. */
export function resetThrottle(): void {
  buckets.clear();
}

export { ApiError };
