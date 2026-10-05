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

/**
 * Test-only transport injection. Real sends need a live push service (APNs /
 * FCM) plus network egress, so the suite installs a fake and asserts on the
 * request instead of waiting for a phone.
 */
let transportOverride: typeof import("web-push") | null = null;

export function __setPushTransport(wp: typeof import("web-push") | null): void {
  transportOverride = wp;
  webPushModule = null;
}

/** Log skip reasons once per process — these used to be completely silent. */
function warnSkipped(reason: string): void {
  if (skipWarned) return;
  skipWarned = true;
  console.warn(`[push] web push SKIPPED: ${reason}`);
}

async function loadWebPush(): Promise<typeof import("web-push") | null> {
  if (transportOverride) return transportOverride;
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

/**
 * RFC 8030 `Topic`: at most 32 characters from the URL-safe Base64 alphabet,
 * used by the push service to coalesce (Apple: "Optional identifier that the
 * push service uses to coalesce notifications"). Same tag → only the newest
 * message reaches the device, which is what reminders and repeated status
 * updates need instead of a backlog.
 */
export function pushTopic(payload: PushPayload): string | null {
  const raw =
    payload.appointment_id != null
      ? `a${payload.appointment_id}`
      : payload.notification_id != null
        ? `n${payload.notification_id}`
        : (payload.tag ?? null);
  if (!raw) return null;
  const safe = raw.replace(/[^A-Za-z0-9_-]/g, "").slice(0, 32);
  return safe.length > 0 ? safe : null;
}

/** Apple/FCM put a machine-readable `reason` in the JSON error body. */
function pushErrorReason(error: unknown): string | null {
  const body = (error as { body?: unknown })?.body;
  if (typeof body !== "string" || body.length === 0) return null;
  try {
    const parsed = JSON.parse(body) as { reason?: unknown };
    return typeof parsed.reason === "string" ? parsed.reason : null;
  } catch {
    return null;
  }
}

const reasonWarned = new Set<string>();

/**
 * A VAPID mismatch is permanent for that subscription: the endpoint is
 * cryptographically bound to the applicationServerKey it was created with, so
 * rotating the VAPID keypair makes every pre-existing subscription undeliverable.
 *
 * Google (FCM) answers 403 with a prose body — "the VAPID credentials in the
 * authorization header do not correspond to the credentials used to create the
 * subscriptions" — which pushErrorReason() cannot parse (it only reads a JSON
 * `reason` field). Apple answers 400 with {"reason":"VapidPkHashMismatch"}.
 * Both are matched here so the sender treats them like a dead endpoint instead
 * of retrying the same doomed subscription on every notification forever.
 *
 * Deliberately NOT matched: "BadJwtToken". That one means the VAPID JWT we
 * signed is malformed or the SUBJECT is rejected — a server-side fault that
 * affects every device equally. Deactivating the whole fleet over a bad
 * VAPID_SUBJECT would be the wrong cure; it stays a logged warning instead.
 */
function isVapidMismatch(status: number | undefined, reason: string | null, body: unknown): boolean {
  if (status !== 400 && status !== 403) return false;
  const text = `${reason ?? ""} ${typeof body === "string" ? body : JSON.stringify(body ?? "")}`;
  return /VapidPkHashMismatch|VAPID credentials in the authorization header/i.test(text);
}

/**
 * Surface the push service's own diagnosis exactly once per process —
 * `403 BadJwtToken` (VAPID subject) and `VapidPkHashMismatch` are invisible
 * from the status code alone and are precisely the iOS-only failure modes.
 */
function warnReason(reason: string, detail: string): void {
  if (reasonWarned.has(reason)) return;
  reasonWarned.add(reason);
  console.warn(`[push] ${reason}: ${detail}`);
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
  const topic = pushTopic(payload);
  for (const sub of subs) {
    if (!sub.endpoint || !sub.p256dh_key || !sub.auth_key) continue;
    try {
      await wp.sendNotification(
        { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh_key, auth: sub.auth_key } },
        body,
        {
          TTL: 60 * 60 * 24,
          // Apple's web push guide: "To attempt to deliver the notification
          // immediately, specify `high`." `normal` let actionable messages
          // sit behind device-power batching on Android too.
          urgency: "high",
          ...(topic ? { topic } : {}),
        }
      );
      result.sent += 1;
      await prisma.pushSubscription
        .update({ where: { id: sub.id }, data: { updated_at: new Date() } })
        .catch(() => undefined);
    } catch (error) {
      result.failed += 1;
      const status = (error as { statusCode?: number }).statusCode;
      const reason = pushErrorReason(error);
      const body = (error as { body?: unknown }).body;
      if (status === 404 || status === 410 || isVapidMismatch(status, reason, body)) {
        // Permanently undeliverable — deactivate so we stop retrying. For a
        // VAPID mismatch the client's next sync sees an inactive row and
        // re-subscribes with the current key.
        await prisma.pushSubscription
          .update({ where: { id: sub.id }, data: { is_active: false } })
          .catch(() => undefined);
        result.deactivated += 1;
        const cause = isVapidMismatch(status, reason, body) ? "vapid key rotated" : "endpoint gone";
        console.warn(
          `[push] deactivated subscription id=${sub.id} user=${userId} (${cause}, HTTP ${status})`
        );
      } else if (reason) {
        warnReason(reason, `HTTP ${status ?? "?"} user=${userId} sub=${sub.id}`);
      } else {
        console.warn(`[push] send failed user=${userId} sub=${sub.id}:`, status ?? error);
      }
    }
  }
  return result;
}

/** Fire-and-forget helper — never throws, but does NOT wait for delivery. */
export function sendWebPushSafe(userId: number, payload: PushPayload): void {
  void sendWebPushToUser(userId, payload).catch((error) => {
    console.warn("[push] unexpected error:", error);
  });
}

const NO_RESULT: PushResult = { sent: 0, failed: 0, deactivated: 0, skipped: false };

/**
 * Deliver a push and WAIT for the attempt to finish, capped at `timeoutMs`.
 *
 * `sendWebPushSafe` is fire-and-forget, which works on a long-lived Node server
 * but silently drops the notification on serverless: once the HTTP response is
 * written, Vercel may freeze or tear down the instance, and the in-flight HTTPS
 * request to FCM/APNs is cut off mid-flight. The inbox row and the realtime
 * event still land (both are in-process), which is exactly why this looks like
 * "the app notified me in-app but the phone never buzzed".
 *
 * Awaiting keeps the whole delivery on one code path for every browser we
 * target — Chrome, Edge, Samsung Internet (FCM) and Safari/iOS Home Screen
 * (APNs) — instead of only the platforms that happen to run a long-lived
 * server. The timeout is what stops a wedged push service from holding the
 * caller's request open.
 */
export async function sendWebPushBounded(
  userId: number,
  payload: PushPayload,
  timeoutMs = 4000
): Promise<PushResult> {
  // Attach the rejection handler up front: if the timeout wins the race, a later
  // rejection from the real send would otherwise surface as an unhandled rejection.
  const work = sendWebPushToUser(userId, payload).catch((error) => {
    console.warn("[push] unexpected error:", error);
    return NO_RESULT;
  });

  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<PushResult>((resolve) => {
    timer = setTimeout(() => {
      console.warn(`[push] delivery still in flight after ${timeoutMs}ms — moving on`);
      resolve(NO_RESULT);
    }, timeoutMs);
  });

  try {
    return await Promise.race([work, timeout]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}
