/**
 * Next.js instrumentation (runs once per server boot, dev + prod).
 * Starts the in-process appointment reminder scheduler — the equivalent of
 * Django's cron-driven `manage.py send_reminders`.
 */
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const globalScope = globalThis as { __medibook_reminders_started?: boolean };
  if (globalScope.__medibook_reminders_started) return;
  globalScope.__medibook_reminders_started = true;

  const minutes = Number(process.env.REMINDERS_INTERVAL_MINUTES ?? 15);
  if (!Number.isFinite(minutes) || minutes <= 0) return;

  const { sendDueReminders } = await import("./lib/reminders");
  const tick = async () => {
    try {
      const sent = await sendDueReminders();
      if (sent > 0) console.log(`[reminders] dispatched ${sent} reminder(s)`);
    } catch (error) {
      console.error("[reminders] failed:", error);
    }
  };
  setInterval(tick, minutes * 60_000);
  setTimeout(tick, 30_000);
}
