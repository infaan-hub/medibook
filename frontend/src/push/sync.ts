/**
 * Subscription ↔ server self-healing.
 *
 * Why this exists: a PushSubscription is NOT durable. iOS (Home Screen web
 * app) rotates or silently drops endpoints — widely reported after a few
 * hundred pushes, after the app is re-installed, or after notifications are
 * toggled in Settings — and Chrome does the same when site data is cleared or
 * the endpoint is rotated. The browser keeps working with the new endpoint
 * while the server row still points at the dead one: sends then fail with 410,
 * the row is deactivated, and notifications simply stop reaching the device
 * with no error anywhere the user can see.
 *
 * So on every open (and when the app comes back to the foreground) we compare
 * the CURRENT browser subscription with the server's rows and repair the
 * difference. Everything here is a read-only repair pass:
 *   - it never prompts (permission is already "granted" when it runs), so it
 *     is safe on iOS where a permission request must come from a real tap;
 *   - it never runs in a plain iOS Safari tab (`iosNeedsHomeScreen`), where
 *     Web Push does not exist at all;
 *   - it never throws — a failure is just retried on the next open.
 */
import { listPushSubscriptions, registerPushSubscription } from "../api/notifications";
import { getNotificationCapability } from "../lib/platform";
import { getPushSubscription, readNotificationPermission, subscribeToPush } from "./notifications";

export type SyncOutcome =
  /** Nothing this pass may do: unsupported context, iOS Safari tab, or no permission. */
  | "skipped"
  /** Server already holds an active row for the live endpoint. */
  | "up-to-date"
  /** Browser subscription existed, the server row was missing/inactive → stored. */
  | "registered"
  /** Permission was granted but the browser subscription was gone → recreated + stored. */
  | "recreated"
  /** Network/API failure — retried on the next open. */
  | "failed";

/** Coalesce concurrent calls (mount + focus can overlap) into one request. */
let inFlight: Promise<SyncOutcome> | null = null;
/** Last repaired endpoint + when, so focus storms stay cheap. */
let lastOk: { endpoint: string; at: number } | null = null;

/** Focus/visibility re-runs are throttled; the boot probe always runs. */
const FOCUS_THROTTLE_MS = 5 * 60_000;

/** Test seam: forget throttling/coalescing state between cases. */
export function __resetSyncState(): void {
  inFlight = null;
  lastOk = null;
}

async function run(): Promise<SyncOutcome> {
  const capability = getNotificationCapability();
  // Plain iOS/iPadOS Safari tab: Web Push does not exist there — only the
  // installed Home Screen app can subscribe, and we must never ask in a tab.
  if (capability.iosNeedsHomeScreen) return "skipped";
  if (!capability.webPushSupported) return "skipped";
  if (readNotificationPermission() !== "granted") return "skipped";

  try {
    let sub = await getPushSubscription();
    let recreated = false;

    // Permission is granted but the subscription is gone (rotated/expired
    // endpoint, cleared storage, iOS re-grant). `subscribeToPush()` reuses the
    // granted permission, so this is silent — no OS prompt can appear.
    if (!sub) {
      const created = await subscribeToPush();
      if (!created.ok) return "failed";
      sub = created.subscription;
      recreated = true;
    }

    const json = sub.toJSON();
    const keys = (json.keys ?? {}) as { p256dh?: string; auth?: string };
    const endpoint = json.endpoint;
    if (!endpoint || !keys.p256dh || !keys.auth) return "failed";

    if (!recreated && lastOk && lastOk.endpoint === endpoint) {
      if (Date.now() - lastOk.at < FOCUS_THROTTLE_MS) return "up-to-date";
    }

    const list = await listPushSubscriptions();
    const row = list.data.results.find((candidate) => candidate.endpoint === endpoint);
    if (row && row.is_active !== false) {
      lastOk = { endpoint, at: Date.now() };
      return recreated ? "recreated" : "up-to-date";
    }

    await registerPushSubscription({
      endpoint,
      p256dh_key: keys.p256dh,
      auth_key: keys.auth,
      device_info: {
        userAgent: navigator.userAgent,
        platform: capability.platform,
        standalone: capability.standalone,
        registered_at: new Date().toISOString(),
        resynced: true,
      },
    });
    lastOk = { endpoint, at: Date.now() };
    return recreated ? "recreated" : "registered";
  } catch {
    return "failed";
  }
}

/**
 * Verify (and repair) this device's subscription on the server.
 * Best-effort: resolves with an outcome, never rejects.
 */
export function ensureServerSubscription(): Promise<SyncOutcome> {
  if (!inFlight) {
    inFlight = run().finally(() => {
      inFlight = null;
    });
  }
  return inFlight;
}
