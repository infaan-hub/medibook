/**
 * Platform + capability detection for the notification flow.
 *
 * Rule: ALL iOS/iPadOS user-agent sniffing in the UI lives in this file.
 * Every other module asks for a capability (`getNotificationCapability()`) or
 * a platform (`getPushPlatform()`) instead of branching on
 * `navigator.userAgent` itself, so the iOS-specific UX branch stays in one
 * auditable place.
 *
 * Detection preference:
 *   1. feature detection — Notification / PushManager / serviceWorker / HTTPS
 *   2. display mode      — `navigator.standalone` (iOS Home Screen web app) and
 *                          `matchMedia("(display-mode: standalone)")` (installed PWA)
 *   3. user agent        — only to tell iOS apart from Android/desktop
 *
 * Having a manifest.json does NOT mean the app is installed: iOS only offers
 * Web Push to a site opened from the Home Screen, and that is exactly what
 * `standalone` reports.
 */
import { isSecureContextForSw } from "./pwa";

export type PushPlatform = "ios" | "android" | "desktop";

/** iOS / iPadOS. The ONLY user-agent sniff for the platform branch. */
export function isIOS(): boolean {
  if (typeof window === "undefined") return false;
  const ua = window.navigator.userAgent;
  if (/iPad|iPhone|iPod/.test(ua)) return true;
  // iPadOS 13+ can identify itself as desktop Safari ("Request Desktop
  // Website"): a Macintosh UA with touch support is still iPadOS.
  return ua.includes("Mac") && "ontouchend" in window;
}

/** Android browser/Chrome. Isolated here with the iOS sniff. */
export function isAndroid(): boolean {
  if (typeof window === "undefined") return false;
  return /Android/i.test(window.navigator.userAgent);
}

/** Which permission flow the UI must use. */
export function getPushPlatform(): PushPlatform {
  if (isIOS()) return "ios";
  if (isAndroid()) return "android";
  return "desktop";
}

/**
 * True when MediBook is running as an installed app: an iOS/iPadOS Home
 * Screen web app (`navigator.standalone`) or any browser's standalone display
 * mode. This is the gate for iOS Web Push — plain Safari tabs cannot subscribe.
 */
export function isStandalonePWA(): boolean {
  if (typeof window === "undefined") return false;
  if (window.navigator.standalone === true) return true;
  if (typeof window.matchMedia === "function") {
    return window.matchMedia("(display-mode: standalone)").matches;
  }
  return false;
}

/** Everything the notification flow needs to know about the current context. */
export interface NotificationCapability {
  platform: PushPlatform;
  /** Running as an installed Home Screen / standalone PWA. */
  standalone: boolean;
  /** HTTPS (or localhost) — service workers and Push API require it. */
  secureContext: boolean;
  notificationApi: boolean;
  serviceWorker: boolean;
  pushApi: boolean;
  /**
   * iOS/iPadOS: Web Push only exists inside the installed Home Screen app, so
   * a Safari tab must never be asked for permission.
   */
  iosNeedsHomeScreen: boolean;
  /** A permission prompt can actually be presented right now. */
  canRequestPermission: boolean;
  /** Everything required to create a PushSubscription exists. */
  webPushSupported: boolean;
}

export function getNotificationCapability(): NotificationCapability {
  const platform = getPushPlatform();
  const standalone = isStandalonePWA();
  const secureContext = typeof window === "undefined" ? false : isSecureContextForSw();
  const notificationApi = typeof window !== "undefined" && "Notification" in window;
  const serviceWorker = typeof navigator !== "undefined" && "serviceWorker" in navigator;
  const pushApi = typeof window !== "undefined" && "PushManager" in window;
  const iosNeedsHomeScreen = platform === "ios" && !standalone;

  return {
    platform,
    standalone,
    secureContext,
    notificationApi,
    serviceWorker,
    pushApi,
    iosNeedsHomeScreen,
    canRequestPermission: notificationApi && secureContext && !iosNeedsHomeScreen,
    webPushSupported:
      notificationApi && serviceWorker && pushApi && secureContext && !iosNeedsHomeScreen,
  };
}

/** Feature-detected Web Push support (never a UA guess). */
export function supportsWebPush(): boolean {
  return getNotificationCapability().webPushSupported;
}
