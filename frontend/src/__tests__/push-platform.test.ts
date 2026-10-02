/**
 * Platform detection + permission-request guards (jsdom).
 *
 * Locks down the iPhone fix:
 *  - all iOS/Android detection goes through `lib/platform.ts` (one UA sniff),
 *  - an iOS Safari tab can never present Web Push, so nothing may call
 *    `Notification.requestPermission()` from it,
 *  - an already-denied permission is never re-requested (no loop),
 *  - the request still happens when a supported platform asks once.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Mock API client used by push/notifications.ts (only reached for the VAPID key)
vi.mock("../api/client", () => ({
  API_BASE_URL: "/api",
  http: { get: vi.fn(), post: vi.fn(), patch: vi.fn(), delete: vi.fn() },
  apiGet: vi.fn(),
  apiPost: vi.fn(),
  apiPatch: vi.fn(),
  apiDelete: vi.fn(),
  refreshAccessToken: vi.fn(async () => null),
}));

vi.mock("../api/tokens", () => ({
  tokenStore: { getAccess: () => null, setAccess: vi.fn(), getRefresh: () => null },
}));

import {
  getNotificationCapability,
  getPushPlatform,
  isAndroid,
  isIOS,
  isStandalonePWA,
} from "../lib/platform";
import { requestNotificationPermission, subscribeToPush } from "../push/notifications";

const IPHONE_SAFARI =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1";
const ANDROID_CHROME =
  "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36";
const DESKTOP_CHROME =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

type W = {
  Notification?: unknown;
  PushManager?: unknown;
  matchMedia?: unknown;
};

const w = window as unknown as W;
const originalUA = window.navigator.userAgent;

function setUA(ua: string): void {
  Object.defineProperty(window.navigator, "userAgent", {
    value: ua,
    configurable: true,
    writable: true,
  });
}

function setStandalone(value: boolean | undefined): void {
  Object.defineProperty(window.navigator, "standalone", {
    value,
    configurable: true,
    writable: true,
  });
}

function setDisplayMode(standalone: boolean): void {
  w.matchMedia = (query: string) => ({
    matches: query.includes("standalone") ? standalone : false,
    media: query,
    onchange: null,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
    addListener: () => undefined,
    removeListener: () => undefined,
    dispatchEvent: () => false,
  });
}

/** Install a fake `Notification` global; returns its requestPermission spy. */
function setNotification(
  permission: NotificationPermission,
  answer?: NotificationPermission
): ReturnType<typeof vi.fn> {
  const requestPermission = vi.fn(async () => answer ?? permission);
  w.Notification = class {
    static permission: NotificationPermission = permission;
    static requestPermission = requestPermission;
  };
  return requestPermission;
}

function clearGlobals(): void {
  setUA(originalUA);
  setStandalone(undefined);
  delete w.matchMedia;
  delete w.Notification;
  delete w.PushManager;
}

beforeEach(clearGlobals);
afterEach(() => {
  clearGlobals();
  vi.restoreAllMocks();
});

describe("platform detection — one UA sniff, everything else is capability", () => {
  it("classifies iOS, Android and desktop", () => {
    setUA(IPHONE_SAFARI);
    expect(isIOS()).toBe(true);
    expect(isAndroid()).toBe(false);
    expect(getPushPlatform()).toBe("ios");

    setUA(ANDROID_CHROME);
    expect(isIOS()).toBe(false);
    expect(isAndroid()).toBe(true);
    expect(getPushPlatform()).toBe("android");

    setUA(DESKTOP_CHROME);
    expect(isIOS()).toBe(false);
    expect(isAndroid()).toBe(false);
    expect(getPushPlatform()).toBe("desktop");
  });

  it("reads Home Screen mode from navigator.standalone (iOS) — not from a manifest", () => {
    setUA(IPHONE_SAFARI);
    setStandalone(false);
    expect(isStandalonePWA()).toBe(false);
    setStandalone(true);
    expect(isStandalonePWA()).toBe(true);
  });

  it("reads installed-PWA mode from display-mode: standalone", () => {
    setUA(DESKTOP_CHROME);
    setDisplayMode(false);
    expect(isStandalonePWA()).toBe(false);
    setDisplayMode(true);
    expect(isStandalonePWA()).toBe(true);
  });
});

describe("getNotificationCapability — iOS needs the Home Screen app", () => {
  it("iOS Safari tab: no permission request, no Web Push", () => {
    setUA(IPHONE_SAFARI);
    setStandalone(false);
    setNotification("default");
    const capability = getNotificationCapability();
    expect(capability.platform).toBe("ios");
    expect(capability.iosNeedsHomeScreen).toBe(true);
    expect(capability.canRequestPermission).toBe(false);
    expect(capability.webPushSupported).toBe(false);
  });

  it("iOS Home Screen PWA with the Push API: requestable and subscribable", () => {
    setUA(IPHONE_SAFARI);
    setStandalone(true);
    setNotification("default");
    w.PushManager = class {};
    Object.defineProperty(window.navigator, "serviceWorker", {
      value: {},
      configurable: true,
    });
    const capability = getNotificationCapability();
    expect(capability.iosNeedsHomeScreen).toBe(false);
    expect(capability.canRequestPermission).toBe(true);
    expect(capability.webPushSupported).toBe(true);
    delete (window.navigator as unknown as { serviceWorker?: unknown }).serviceWorker;
  });

  it("Android with the Push API uses the normal browser flow", () => {
    setUA(ANDROID_CHROME);
    setNotification("default");
    w.PushManager = class {};
    Object.defineProperty(window.navigator, "serviceWorker", {
      value: {},
      configurable: true,
    });
    const capability = getNotificationCapability();
    expect(capability.iosNeedsHomeScreen).toBe(false);
    expect(capability.canRequestPermission).toBe(true);
    expect(capability.webPushSupported).toBe(true);
    delete (window.navigator as unknown as { serviceWorker?: unknown }).serviceWorker;
  });

  it("reports unsupported when the Notification API is missing", () => {
    setUA(DESKTOP_CHROME);
    delete w.Notification;
    const capability = getNotificationCapability();
    expect(capability.notificationApi).toBe(false);
    expect(capability.canRequestPermission).toBe(false);
    expect(capability.webPushSupported).toBe(false);
  });
});

describe("requestNotificationPermission — never loops, never asks the wrong context", () => {
  it("does not call requestPermission in an iOS Safari tab", async () => {
    setUA(IPHONE_SAFARI);
    setStandalone(false);
    const requestPermission = setNotification("default");
    await expect(requestNotificationPermission()).resolves.toBe("unsupported");
    expect(requestPermission).not.toHaveBeenCalled();
  });

  it("does not call requestPermission again once the OS said denied", async () => {
    setUA(DESKTOP_CHROME);
    const requestPermission = setNotification("denied");
    await expect(requestNotificationPermission()).resolves.toBe("denied");
    expect(requestPermission).not.toHaveBeenCalled();
  });

  it("returns granted without re-asking when permission is already granted", async () => {
    setUA(DESKTOP_CHROME);
    const requestPermission = setNotification("granted");
    await expect(requestNotificationPermission()).resolves.toBe("granted");
    expect(requestPermission).not.toHaveBeenCalled();
  });

  it("asks exactly once when permission is still default on a supported platform", async () => {
    setUA(ANDROID_CHROME);
    const requestPermission = setNotification("default", "granted");
    await expect(requestNotificationPermission()).resolves.toBe("granted");
    expect(requestPermission).toHaveBeenCalledTimes(1);
  });

  it("asks from the installed iOS PWA", async () => {
    setUA(IPHONE_SAFARI);
    setStandalone(true);
    const requestPermission = setNotification("default", "granted");
    await expect(requestNotificationPermission()).resolves.toBe("granted");
    expect(requestPermission).toHaveBeenCalledTimes(1);
  });
});

describe("subscribeToPush — typed failure instead of a bogus permission claim", () => {
  it("fails with not-installed-pwa on iOS Safari and never touches the OS", async () => {
    setUA(IPHONE_SAFARI);
    setStandalone(false);
    const requestPermission = setNotification("default");
    await expect(subscribeToPush()).resolves.toEqual({
      ok: false,
      reason: "not-installed-pwa",
    });
    expect(requestPermission).not.toHaveBeenCalled();
  });

  it("reports permission-denied (not 'unsupported') when the OS blocked it", async () => {
    setUA(DESKTOP_CHROME);
    setNotification("denied");
    await expect(subscribeToPush()).resolves.toEqual({
      ok: false,
      reason: "permission-denied",
    });
  });

  it("reports permission-dismissed when the prompt was closed unanswered", async () => {
    setUA(DESKTOP_CHROME);
    setNotification("default", "default");
    await expect(subscribeToPush()).resolves.toEqual({
      ok: false,
      reason: "permission-dismissed",
    });
  });
});
