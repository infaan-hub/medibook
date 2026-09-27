/**
 * Push Notification Manager — request permission, subscribe/unsubscribe
 * to browser push via the Service Worker Push API.
 *
 * VAPID public key is loaded from the backend (`GET /api/push/vapid-public-key/`)
 * with optional `NEXT_PUBLIC_VAPID_PUBLIC_KEY` override for offline/dev setups.
 */
import { API_BASE_URL } from "../api/client";
import { tokenStore } from "../api/tokens";
import { ensureServiceWorker, isSecureContextForSw } from "../lib/pwa";
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

export async function requestNotificationPermission(): Promise<NotificationPermission> {
  if (!("Notification" in window)) return "denied";
  if (Notification.permission === "granted") return "granted";
  if (Notification.permission === "denied") return "denied";
  return Notification.requestPermission();
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

/**
 * Create (or reuse) the browser PushSubscription. Never hangs, never throws:
 * failures come back as a typed reason the UI can show to the user instead of
 * silently pretending the subscription succeeded.
 */
export async function subscribeToPush(): Promise<SubscribeResult> {
  const ready = await activeRegistration();
  if (!ready.ok) return ready;

  try {
    const existing = await ready.reg.pushManager.getSubscription();
    if (existing) return { ok: true, subscription: existing };
  } catch {
    return { ok: false, reason: "failed" };
  }

  const key = await getVapidPublicKey();
  if (!key) return { ok: false, reason: "no-vapid-key" };

  const permission = await requestNotificationPermission();
  if (permission !== "granted") return { ok: false, reason: "permission-denied" };

  try {
    const subscription = await ready.reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(key).buffer as ArrayBuffer,
    });
    return { ok: true, subscription };
  } catch {
    return { ok: false, reason: "failed" };
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
