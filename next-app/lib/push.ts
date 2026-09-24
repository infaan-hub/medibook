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

async function loadWebPush(): Promise<typeof import("web-push") | null> {
  if (webPushModule !== null) return webPushModule;
  try {
    webPushModule = await import("web-push");
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
  if (!vapidConfigured()) return false;
  const wp = await loadWebPush();
  if (!wp) return false;
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
  if (subs.length === 0) return result;

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
