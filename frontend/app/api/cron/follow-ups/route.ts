/** POST /api/cron/follow-ups/ — retry queued or interrupted follow-up bookings. */
import { handler, ok, forbidden } from "@/lib/route";
import { processPendingFollowUpBookings } from "@/services/treatment.service";

export const maxDuration = 60;

export const POST = handler(async ({ req }) => {
  const secret = process.env.CRON_SECRET ?? "";
  const header =
    req.headers.get("x-cron-secret") ??
    req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ??
    "";
  if (!secret || header !== secret) throw forbidden();

  const retried = await processPendingFollowUpBookings();
  return ok({ retried }, "Follow-up bookings processed.");
}, { skipAuth: true });

export const GET = POST;
