/**
 * Push Notification Manager — request permission, subscribe/unsubscribe
 * to browser push via the Service Worker Push API.
 *
 * VAPID public key is loaded from the backend (`GET /api/push/vapid-public-key/`)
 * with optional `NEXT_PUBLIC_VAPID_PUBLIC_KEY` override for offline/dev setups.
 *
 * Rules encoded here:
 *  - `Notification.requestPermission()` is only ever reached from a caller's
 *    user gesture, and never when the recorded answer is already "denied" or
 *    when the context cannot present Web Push at all (iOS Safari tab).
 *  - every failure comes back as a TYPED reason, so the UI can say what
 *    actually happened instead of a blanket "permission was not granted".
 */
import { API_BASE_URL } from "../api/client";
import { tokenStore } from "../api/tokens";
import { ensureServiceWorker, isSecureContextForSw } from "../lib/pwa";
import { getNotificationCapability } from "../lib/platform";
import type { PushFailureReason } from "./prompt";

let cachedKey: string | null = null;
let keyPromise: Promise<string | null> | null = null;

export async function getVapidPublicKey(): Promise<string | null> {
  const fromEnv = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY as string | undefined;
  if (fromEnv) return fromEnv;
  if (cachedKey) return cachedKey;
  if (keyPromise) return keyPromise;

  keyPromise = (async () => {
    try {
      const headers: Record<string, string> = {};
      const token = tokenStore.getAccess();
      if (token) headers.Authorization = `Bearer ${token}`;
      const res = await fetch(`${API_BASE_URL}/push/vapid-public-key/`, {
        headers,
        credentials: "include",
      });
      if (!res.ok) return null;
      const body = (await res.json()) as { success?: boolean; data?: { publicKey?: string } };
      if (!body?.success || !body.data?.publicKey) return null;
      cachedKey = body.data.publicKey;
      return cachedKey;
    } catch {
      return null;
    }
  })();

  try {
    return await keyPromise;
  } finally {
    keyPromise = null;
  }
}

/** Current permission without ever triggering a prompt. */
export function readNotificationPermission(): NotificationPermission | "unsupported" {
  if (typeof window === "undefined" || !("Notification" in window)) return "unsupported";
  return Notification.permission;
}

/**
 * Ask the OS for notification permission. MUST be called from inside a user
 * gesture (button tap) — browsers, and iOS in particular, only associate the
 * prompt with the request when it originates from one.
 *
 * Never loops: a recorded "denied" is returned as-is (the OS will not show its
 * bubble again), and an iOS Safari tab without the installed Home Screen app
 * returns "unsupported" instead of firing a request iOS would ignore.
 */
export async function requestNotificationPermission(): Promise<NotificationPermission | "unsupported"> {
  if (typeof window === "undefined" || !("Notification" in window)) return "unsupported";
  const current = Notification.permission;
  if (current === "granted") return "granted";
  if (current === "denied") return "denied";
  const capability = getNotificationCapability();
  if (capability.iosNeedsHomeScreen) return "unsupported";
  if (!capability.secureContext) return "unsupported";
  try {
    return await Notification.requestPermission();
  } catch {
    return Notification.permission;
  }
}

export type SubscribeResult =
  | { ok: true; subscription: PushSubscription }
  | { ok: false; reason: PushFailureReason };

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("timeout")), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error: unknown) => {
        clearTimeout(timer);
        reject(error as Error);
      }
    );
  });
}

type RegResult =
  | { ok: true; reg: ServiceWorkerRegistration }
  | { ok: false; reason: PushFailureReason };

/**
 * Get a registration with an ACTIVE worker, or a typed failure reason.
 * Registers the worker immediately instead of awaiting `serviceWorker.ready`
 * unconditionally — on insecure origins `ready` never settles, which used to
 * hang `subscribeToPush()` forever and left the server with zero subscriptions.
 */
async function activeRegistration(): Promise<RegResult> {
  if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
    return { ok: false, reason: "unsupported" };
  }
  if (!isSecureContextForSw()) return { ok: false, reason: "insecure" };
  const reg = await ensureServiceWorker();
  if (!reg) return { ok: false, reason: "no-sw" };
  if (reg.active) return { ok: true, reg };
  try {
    return { ok: true, reg: await withTimeout(navigator.serviceWorker.ready, 8000) };
  } catch {
    return { ok: false, reason: "timeout" };
  }
}

/** Why the permission step could not produce a granted answer. */
function permissionFailure(
  answer: NotificationPermission | "unsupported"
): PushFailureReason {
  if (answer === "denied") return "permission-denied";
  if (answer === "default") return "permission-dismissed";
  const capability = getNotificationCapability();
  if (capability.iosNeedsHomeScreen) return "not-installed-pwa";
  if (!capability.secureContext) return "insecure";
  return "unsupported";
}

/**
 * Create (or reuse) the browser PushSubscription. Never hangs, never throws:
 * failures come back as a typed reason the UI can show to the user instead of
 * silently pretending the subscription succeeded.
 *
 * The permission request happens FIRST, synchronously from the caller's tap
 * handler — service-worker/VAPID work follows only after the OS answered, so
 * no await can steal the user gesture iOS requires for Web Push.
 *
 * When permission is already granted this performs no prompt at all, which is
 * what lets background re-subscription (resync) run without nagging the user.
 */
export async function subscribeToPush(): Promise<SubscribeResult> {
  const capability = getNotificationCapability();
  if (capability.iosNeedsHomeScreen) return { ok: false, reason: "not-installed-pwa" };
  if (!capability.secureContext) return { ok: false, reason: "insecure" };

  const permission = await requestNotificationPermission();
  if (permission !== "granted") return { ok: false, reason: permissionFailure(permission) };

  const ready = await activeRegistration();
  if (!ready.ok) return ready;

  let existing: PushSubscription | null = null;
  try {
    existing = await ready.reg.pushManager.getSubscription();
  } catch {
    return { ok: false, reason: "subscription-failed" };
  }
  if (existing) return { ok: true, subscription: existing };

  const key = await getVapidPublicKey();
  if (!key) return { ok: false, reason: "no-vapid-key" };

  try {
    const subscription = await ready.reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(key).buffer as ArrayBuffer,
    });
    return { ok: true, subscription };
  } catch {
    return { ok: false, reason: "subscription-failed" };
  }
}

export async function unsubscribeFromPush(): Promise<boolean> {
  const ready = await activeRegistration();
  if (!ready.ok) return false;
  try {
    const subscription = await ready.reg.pushManager.getSubscription();
    if (!subscription) return false;
    return await subscription.unsubscribe();
  } catch {
    return false;
  }
}

export async function getPushSubscription(): Promise<PushSubscription | null> {
  const ready = await activeRegistration();
  if (!ready.ok) return null;
  try {
    return await ready.reg.pushManager.getSubscription();
  } catch {
    return null;
  }
}

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}
