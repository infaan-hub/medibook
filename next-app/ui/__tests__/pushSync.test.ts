/**
 * Subscription ↔ server self-healing (push/sync.ts).
 *
 * Locks down the "notifications silently stop reaching this device" fix:
 * iOS/Home Screen PWAs rotate or drop their push endpoint, so on every open
 * the live browser subscription is compared with the server's rows and the
 * difference is repaired — without ever prompting (the pass only runs once the
 * OS has already said "granted") and without ever running in a plain iOS
 * Safari tab, where Web Push does not exist.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const api = vi.hoisted(() => ({
  listPushSubscriptions: vi.fn(),
  registerPushSubscription: vi.fn(),
  deletePushSubscription: vi.fn(),
}));

const browser = vi.hoisted(() => ({
  getPushSubscription: vi.fn(),
  readNotificationPermission: vi.fn(),
  subscribeToPush: vi.fn(),
  unsubscribeFromPush: vi.fn(),
}));

vi.mock("../api/notifications", () => api);
vi.mock("../push/notifications", () => browser);

import { __resetSyncState, ensureServerSubscription } from "../push/sync";

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

/** jsdom has no Push API — install the minimum capability surface. */
function setWebPushSurface(permission: NotificationPermission): void {
  Object.defineProperty(window.navigator, "serviceWorker", {
    value: {},
    configurable: true,
    writable: true,
  });
  w.PushManager = class {};
  w.Notification = class {
    static permission: NotificationPermission = permission;
  };
}

function clearGlobals(): void {
  setUA(originalUA);
  setStandalone(undefined);
  delete w.matchMedia;
  delete w.Notification;
  delete w.PushManager;
  (window.navigator as unknown as { serviceWorker?: unknown }).serviceWorker = undefined;
}

function sub(endpoint: string) {
  return {
    toJSON: () => ({ endpoint, keys: { p256dh: "p256dh-value", auth: "auth-value" } }),
  };
}

function rows(endpoints: Array<{ endpoint: string; is_active?: boolean }>) {
  return {
    success: true,
    message: "",
    data: {
      count: endpoints.length,
      next: null,
      previous: null,
      results: endpoints.map((row, index) => ({ id: index + 1, ...row })),
    },
  };
}

beforeEach(() => {
  clearGlobals();
  __resetSyncState();
  vi.clearAllMocks();
  browser.readNotificationPermission.mockReturnValue("granted");
  browser.getPushSubscription.mockResolvedValue(null);
  browser.subscribeToPush.mockResolvedValue({ ok: false, reason: "failed" });
  api.listPushSubscriptions.mockResolvedValue(rows([]));
  api.registerPushSubscription.mockResolvedValue({ success: true, message: "", data: {} });
});

describe("ensureServerSubscription — iOS/Android/desktop delivery self-heal", () => {
  it("is a no-op in a plain iOS Safari tab (Web Push does not exist there)", async () => {
    setUA(IPHONE_SAFARI);
    setStandalone(undefined);
    setWebPushSurface("default");

    await expect(ensureServerSubscription()).resolves.toBe("skipped");
    expect(api.listPushSubscriptions).not.toHaveBeenCalled();
    expect(api.registerPushSubscription).not.toHaveBeenCalled();
    expect(browser.subscribeToPush).not.toHaveBeenCalled();
  });

  it("is a no-op while permission is still default — never a hidden prompt", async () => {
    setUA(ANDROID_CHROME);
    setWebPushSurface("default");
    browser.readNotificationPermission.mockReturnValue("default");

    await expect(ensureServerSubscription()).resolves.toBe("skipped");
    expect(browser.subscribeToPush).not.toHaveBeenCalled();
    expect(api.registerPushSubscription).not.toHaveBeenCalled();
  });

  it("verifies an already-registered endpoint and does nothing else", async () => {
    setUA(DESKTOP_CHROME);
    setWebPushSurface("granted");
    browser.getPushSubscription.mockResolvedValue(sub("https://push.example/live"));
    api.listPushSubscriptions.mockResolvedValue(
      rows([{ endpoint: "https://push.example/live" }])
    );

    await expect(ensureServerSubscription()).resolves.toBe("up-to-date");
    expect(api.registerPushSubscription).not.toHaveBeenCalled();
    expect(browser.subscribeToPush).not.toHaveBeenCalled();
  });

  it("stores the live endpoint when the server has no row for it", async () => {
    setUA(ANDROID_CHROME);
    setWebPushSurface("granted");
    browser.getPushSubscription.mockResolvedValue(sub("https://push.example/rotated"));
    api.listPushSubscriptions.mockResolvedValue(
      rows([{ endpoint: "https://push.example/dead" }])
    );

    await expect(ensureServerSubscription()).resolves.toBe("registered");
    expect(api.registerPushSubscription).toHaveBeenCalledWith({
      endpoint: "https://push.example/rotated",
      p256dh_key: "p256dh-value",
      auth_key: "auth-value",
      device_info: expect.objectContaining({ resynced: true }),
    });
  });

  it("re-registers a row the sender deactivated (410 → is_active false)", async () => {
    setUA(DESKTOP_CHROME);
    setWebPushSurface("granted");
    browser.getPushSubscription.mockResolvedValue(sub("https://push.example/live"));
    api.listPushSubscriptions.mockResolvedValue(
      rows([{ endpoint: "https://push.example/live", is_active: false }])
    );

    await expect(ensureServerSubscription()).resolves.toBe("registered");
    expect(api.registerPushSubscription).toHaveBeenCalledTimes(1);
  });

  it("recreates the browser subscription silently when it vanished", async () => {
    setUA("Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1");
    setStandalone(true);
    setDisplayMode(true);
    setWebPushSurface("granted");
    browser.getPushSubscription.mockResolvedValue(null);
    browser.subscribeToPush.mockResolvedValue({
      ok: true,
      subscription: sub("https://push.example/reborn"),
    });
    api.listPushSubscriptions.mockResolvedValue(rows([]));

    await expect(ensureServerSubscription()).resolves.toBe("recreated");
    expect(browser.subscribeToPush).toHaveBeenCalledTimes(1);
    expect(api.registerPushSubscription).toHaveBeenCalledWith(
      expect.objectContaining({ endpoint: "https://push.example/reborn" })
    );
  });

  it("reports failure instead of throwing when the API is down", async () => {
    setUA(ANDROID_CHROME);
    setWebPushSurface("granted");
    browser.getPushSubscription.mockResolvedValue(sub("https://push.example/live"));
    api.listPushSubscriptions.mockRejectedValue(new Error("network down"));

    await expect(ensureServerSubscription()).resolves.toBe("failed");
  });

  it("throttles repeat verification for the same endpoint (focus storms)", async () => {
    setUA(DESKTOP_CHROME);
    setWebPushSurface("granted");
    browser.getPushSubscription.mockResolvedValue(sub("https://push.example/live"));
    api.listPushSubscriptions.mockResolvedValue(
      rows([{ endpoint: "https://push.example/live" }])
    );

    await expect(ensureServerSubscription()).resolves.toBe("up-to-date");
    await expect(ensureServerSubscription()).resolves.toBe("up-to-date");
    expect(api.listPushSubscriptions).toHaveBeenCalledTimes(1);
  });

  it("coalesces overlapping calls into a single request", async () => {
    setUA(DESKTOP_CHROME);
    setWebPushSurface("granted");
    browser.getPushSubscription.mockResolvedValue(sub("https://push.example/live"));
    api.listPushSubscriptions.mockResolvedValue(rows([]));

    const [first, second] = await Promise.all([
      ensureServerSubscription(),
      ensureServerSubscription(),
    ]);
    expect(first).toBe("registered");
    expect(second).toBe("registered");
    expect(api.listPushSubscriptions).toHaveBeenCalledTimes(1);
  });
});
