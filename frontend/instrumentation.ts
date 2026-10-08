/**
 * Next.js instrumentation (runs once per server boot, dev + prod).
 *
 * In-process scheduler for long-running Node hosts (`node server.js`): sends
 * due reminders and purges expired appointments (24h retention). On serverless
 * platforms this interval is NOT reliable — use the HTTP cron endpoint
 * instead: GET|POST /api/cron/reminders/ with header
 * `x-cron-secret: CRON_SECRET` (or Vercel Cron, see vercel.json).
 *
 * Set REMINDERS_INTERVAL_MINUTES=0 to disable the in-process interval entirely.
 */
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const globalScope = globalThis as { __medibook_reminders_started?: boolean };
  if (globalScope.__medibook_reminders_started) return;
  globalScope.__medibook_reminders_started = true;

  const minutes = Number(process.env.REMINDERS_INTERVAL_MINUTES ?? 15);
  if (!Number.isFinite(minutes) || minutes <= 0) return;

  const { sendDueReminders } = await import("./lib/reminders");
  const { purgeExpiredAppointments } = await import("./services/emergency.service");
  const tick = async () => {
    try {
      const result = await sendDueReminders();
      if (result.sent > 0 || result.failed > 0) {
        console.log(
          `[reminders] sent=${result.sent} skipped=${result.skipped} failed=${result.failed}`
        );
      }
    } catch (error) {
      console.error("[reminders] failed:", error);
    }
    try {
      const purged = await purgeExpiredAppointments();
      if (purged > 0) {
        console.log(`[appointments] purged=${purged} expired`);
      }
    } catch (error) {
      console.error("[appointments] purge failed:", error);
    }
  };
  setInterval(tick, minutes * 60_000);
  setTimeout(tick, 30_000);
}
