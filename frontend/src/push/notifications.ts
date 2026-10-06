/**
 * Push Notification Manager — request permission, subscribe/unsubscribe
 * to browser push via the Service Worker Push API.
 *
 * VAPID public key is ALWAYS loaded from the backend
 * (`GET /api/push/vapid-public-key/`). There is deliberately no
 * `NEXT_PUBLIC_VAPID_PUBLIC_KEY` build-time override: a key baked into a
 * bundle cannot follow a server rotation, and that is exactly how every
 * subscription once ended up bound to a rotated-out key — each send was
 * rejected while nothing on screen explained why. The server is the single
 * source of truth; this fetch is cheap and always current.
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

// In-flight request coalescing only — deliberately NO long-lived result cache.
// A page that lives across a server VAPID rotation must see the NEW key: a
// value cached at first use would keep every later subscribe/rekey decision
// on the rotated-out key, and every send would then be rejected (403/VapidPk
// mismatch) while nothing on screen explains why.
let keyPromise: Promise<string | null> | null = null;

export async function getVapidPublicKey(): Promise<string | null> {
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
      return body.data.publicKey;
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
  // Safari on macOS and iOS both refuse to subscribe outside an installed app,
  // so the same check gates them; the UI branches on which one it was.
  if (capability.needsInstalledPWA) return "unsupported";
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
    // First launch on a slow phone: the worker still has to fetch + cache the
    // app shell before it activates. 8s cut that short on iOS and the tap
    // failed with `timeout` even though the registration was fine — 15s covers
    // a cold install without hanging the button.
    return { ok: true, reg: await withTimeout(navigator.serviceWorker.ready, 15_000) };
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
  if (capability.needsInstalledPWA) return "not-installed-pwa";
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
  if (capability.needsInstalledPWA) return { ok: false, reason: "not-installed-pwa" };
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

  // An existing subscription is only reusable if it is bound to the server's
  // CURRENT key. One that spans a VAPID rotation can never deliver again, yet
  // getSubscription() keeps returning it happily — so verify before trusting.
  // The browser's own options are authoritative; the localStorage binding is
  // the fallback for engines that do not expose applicationServerKey.
  const serverKey = await getVapidPublicKey();
  if (existing && serverKey) {
    const bound = subscriptionBoundKey(existing) ?? readVapidBinding();
    if (bound && bound !== serverKey) {
      await existing.unsubscribe().catch(() => undefined);
      existing = null;
    }
  }
  if (existing) return { ok: true, subscription: existing };

  if (!serverKey) return { ok: false, reason: "no-vapid-key" };

  try {
    const subscription = await ready.reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(serverKey).buffer as ArrayBuffer,
    });
    // Bind this subscription to the key it was created with, so a later server
    // rotation can be detected and repaired instead of silently 403ing forever.
    writeVapidBinding(serverKey);
    return { ok: true, subscription };
  } catch {
    return { ok: false, reason: "subscription-failed" };
  }
}

export async function unsubscribeFromPush(): Promise<boolean> {
  const ready = await activeRegistration();
  if (!ready.ok) return false;
  clearVapidBinding();
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

/** base64url of the applicationServerKey the subscription was created with, or null
 *  when the engine does not expose it (then the localStorage binding is the source). */
function subscriptionBoundKey(sub: PushSubscription): string | null {
  try {
    const raw = sub.options?.applicationServerKey as ArrayBuffer | null | undefined;
    if (!raw) return null;
    const bytes = new Uint8Array(raw);
    let binary = "";
    for (const byte of bytes) binary += String.fromCharCode(byte);
    return window.btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  } catch {
    return null;
  }
}

/* ------------------------------------------------------------------------- *
 * VAPID key binding
 *
 * A PushSubscription is cryptographically bound to the applicationServerKey it
 * was created with. When the server rotates its VAPID keypair, every existing
 * subscription becomes permanently undeliverable (Google 403, Apple
 * VapidPkHashMismatch) — but `pushManager.getSubscription()` still hands back the
 * old, useless subscription, and it compares equal to the server row, so the
 * ordinary sync sees "in sync" and repairs nothing. The user then has to clear
 * site data by hand.
 *
 * Recording the key the subscription was created with turns that invisible
 * failure into a detectable one: on the next open we compare it against the
 * server's current key and re-subscribe. Kept in localStorage because the fact
 * is browser-side and this needs no database migration.
 * ------------------------------------------------------------------------- */

const BINDING_STORAGE_KEY = "medibook.vapidBinding";

/** localStorage throws in some private-browsing modes; never let that break sync. */
function safeStorage(): Storage | null {
  try {
    if (typeof window === "undefined") return null;
    const store = window.localStorage;
    const probe = "__medibook_probe__";
    store.setItem(probe, "1");
    store.removeItem(probe);
    return store;
  } catch {
    return null;
  }
}

/** The VAPID public key the current browser subscription was created with. */
export function readVapidBinding(): string | null {
  try {
    return safeStorage()?.getItem(BINDING_STORAGE_KEY) ?? null;
  } catch {
    return null;
  }
}

/** Remember the key this device's subscription is bound to. */
export function writeVapidBinding(publicKey: string): void {
  try {
    safeStorage()?.setItem(BINDING_STORAGE_KEY, publicKey);
  } catch {
    /* non-persistent is acceptable — we simply re-check next open */
  }
}

/** Forget the binding (unsubscribe path). */
export function clearVapidBinding(): void {
  try {
    safeStorage()?.removeItem(BINDING_STORAGE_KEY);
  } catch {
    /* ignore */
  }
}
