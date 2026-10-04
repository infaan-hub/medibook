/** POST /api/cron/reminders/ — idempotent reminder run for external schedulers. */
import { handler, ok, forbidden } from "@/lib/route";
import { sendDueReminders } from "@/lib/reminders";

export const POST = handler(async ({ req }) => {
  const secret = process.env.CRON_SECRET ?? "";
  const header =
    req.headers.get("x-cron-secret") ??
    req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ??
    "";
  if (!secret || header !== secret) {
    throw forbidden();
  }
  const result = await sendDueReminders();
  console.log(
    `[cron/reminders] sent=${result.sent} skipped=${result.skipped} failed=${result.failed}`
  );
  return ok(result, "Reminders processed.");
});

/** Allow GET for platforms that only support GET cron URLs (still requires secret). */
export const GET = POST;
