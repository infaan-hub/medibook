/**
 * Push Notification Manager — request permission, subscribe/unsubscribe
 * to browser push via the Service Worker Push API.
 *
 * VAPID public key is loaded from the backend (`GET /api/push/vapid-public-key/`)
 * with optional `NEXT_PUBLIC_VAPID_PUBLIC_KEY` override for offline/dev setups.
 */
import { API_BASE_URL } from "../api/client";
import { tokenStore } from "../api/tokens";

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

export async function subscribeToPush(): Promise<PushSubscription | null> {
  if (!("serviceWorker" in navigator) || !("PushManager" in window)) return null;

  try {
    const reg = await navigator.serviceWorker.ready;
    const existing = await reg.pushManager.getSubscription();
    if (existing) return existing;

    const key = await getVapidPublicKey();
    if (!key) return null;

    const permission = await requestNotificationPermission();
    if (permission !== "granted") return null;

    const subscription = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(key).buffer as ArrayBuffer,
    });
    return subscription;
  } catch {
    return null;
  }
}

export async function unsubscribeFromPush(): Promise<boolean> {
  if (!("serviceWorker" in navigator) || !("PushManager" in window)) return false;
  try {
    const reg = await navigator.serviceWorker.ready;
    const subscription = await reg.pushManager.getSubscription();
    if (!subscription) return false;
    return subscription.unsubscribe();
  } catch {
    return false;
  }
}

export async function getPushSubscription(): Promise<PushSubscription | null> {
  if (!("serviceWorker" in navigator) || !("PushManager" in window)) return null;
  try {
    const reg = await navigator.serviceWorker.ready;
    return reg.pushManager.getSubscription();
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
