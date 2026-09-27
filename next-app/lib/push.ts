/**
 * Web Push sender — delivers browser push via VAPID + web-push.
 * Secrets (VAPID_PRIVATE_KEY) never leave the server.
 */
import { prisma } from "./db";

type PushResult = {
  sent: number;
  failed: number;
  deactivated: number;
  skipped: boolean;
};

let webPushModule: typeof import("web-push") | null = null;
let configured: boolean | null = null;
let skipWarned = false;
const zeroSubsWarned = new Set<number>();

/** Log skip reasons once per process — these used to be completely silent. */
function warnSkipped(reason: string): void {
  if (skipWarned) return;
  skipWarned = true;
  console.warn(`[push] web push SKIPPED: ${reason}`);
}

async function loadWebPush(): Promise<typeof import("web-push") | null> {
  if (webPushModule !== null) return webPushModule;
  try {
    // Deliberately opaque to the bundler: web-push → https-proxy-agent →
    // agent-base → require('http') cannot be resolved while webpack compiles
    // instrumentation.ts in dev, and a failed instrumentation compile made
    // EVERY dev request 500. `eval("require")` keeps the module out of the
    // static graph so web-push is loaded from node_modules at runtime.
    const nodeRequire = eval("require") as
      | ((id: string) => typeof import("web-push"))
      | undefined;
    webPushModule =
      typeof nodeRequire === "function"
        ? nodeRequire("web-push")
        : await import(/* webpackIgnore: true */ "web-push");
  } catch {
    webPushModule = null;
  }
  return webPushModule;
}

export function vapidConfigured(): boolean {
  if (configured !== null) return configured;
  configured = Boolean(
    process.env.VAPID_PUBLIC_KEY &&
      process.env.VAPID_PRIVATE_KEY &&
      process.env.VAPID_SUBJECT
  );
  return configured;
}

export function vapidPublicKey(): string {
  return process.env.VAPID_PUBLIC_KEY ?? "";
}

async function ensureConfigured(): Promise<boolean> {
  if (!vapidConfigured()) {
    warnSkipped(
      "VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY / VAPID_SUBJECT missing or empty in the server environment"
    );
    return false;
  }
  const wp = await loadWebPush();
  if (!wp) {
    warnSkipped("web-push package failed to load (is it installed in node_modules?)");
    return false;
  }
  wp.setVapidDetails(
    process.env.VAPID_SUBJECT!,
    process.env.VAPID_PUBLIC_KEY!,
    process.env.VAPID_PRIVATE_KEY!
  );
  return true;
}

export interface PushPayload {
  title: string;
  body: string;
  url?: string;
  appointment_id?: number | string;
  notification_id?: number | string;
  tag?: string;
}

/** Send a web push to every active subscription for a user. */
export async function sendWebPushToUser(userId: number, payload: PushPayload): Promise<PushResult> {
  const result: PushResult = { sent: 0, failed: 0, deactivated: 0, skipped: false };
  if (!(await ensureConfigured())) {
    result.skipped = true;
    return result;
  }
  const wp = (await loadWebPush())!;
  const subs = await prisma.pushSubscription.findMany({
    where: { user_id: userId, is_active: true },
  });
  if (subs.length === 0) {
    // Root cause of "no OS notification ever appears": nothing to send to.
    // Log once per user so the diagnosis is visible in server output.
    if (!zeroSubsWarned.has(userId)) {
      zeroSubsWarned.add(userId);
      console.warn(
        `[push] user ${userId} has no active push subscription — OS push skipped (in-app inbox/realtime unaffected)`
      );
    }
    return result;
  }

  const body = JSON.stringify(payload);
  for (const sub of subs) {
    if (!sub.endpoint || !sub.p256dh_key || !sub.auth_key) continue;
    try {
      await wp.sendNotification(
        { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh_key, auth: sub.auth_key } },
        body,
        {
          TTL: 60 * 60 * 24,
          urgency: "normal",
        }
      );
      result.sent += 1;
      await prisma.pushSubscription
        .update({ where: { id: sub.id }, data: { updated_at: new Date() } })
        .catch(() => undefined);
    } catch (error) {
      result.failed += 1;
      const status = (error as { statusCode?: number }).statusCode;
      if (status === 404 || status === 410) {
        // Permanently gone — deactivate so we stop retrying.
        await prisma.pushSubscription
          .update({ where: { id: sub.id }, data: { is_active: false } })
          .catch(() => undefined);
        result.deactivated += 1;
        console.warn(`[push] deactivated invalid subscription id=${sub.id} user=${userId}`);
      } else {
        console.warn(`[push] send failed user=${userId} sub=${sub.id}:`, status ?? error);
      }
    }
  }
  return result;
}

/** Fire-and-forget helper used by notify() — never throws into request paths. */
export function sendWebPushSafe(userId: number, payload: PushPayload): void {
  void sendWebPushToUser(userId, payload).catch((error) => {
    console.warn("[push] unexpected error:", error);
  });
}
