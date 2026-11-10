/** POST /api/cron/session-expiry/ — expire unstarted training & psychotherapy sessions. */
import { handler, ok, forbidden } from "@/lib/route";
import { expireStaleSessions } from "@/services/session-expiry.service";

export const maxDuration = 60;

export const POST = handler(async ({ req }) => {
  const secret = process.env.CRON_SECRET ?? "";
  const header =
    req.headers.get("x-cron-secret") ??
    req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ??
    "";
  if (!secret || header !== secret) throw forbidden();

  const result = await expireStaleSessions();
  console.log(
    `[cron/session-expiry] training=${result.training_sessions}/${result.training_requests} psychotherapy=${result.psychotherapy_sessions}/${result.psychotherapy_requests}`
  );
  return ok(result, "Session expiry processed.");
}, { skipAuth: true });

/** Allow GET for platforms that only support GET cron URLs (still requires secret). */
export const GET = POST;
