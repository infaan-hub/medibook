/**
 * Push-notification prompt state machine + copy (pure helpers).
 *
 * Regression coverage for the iPhone bug where the UI kept showing
 *   "Notifications are off — tap Allow to switch them on" followed by
 *   "Notification permission was not granted — tap Allow to request it again."
 * in a Safari tab that can never present Web Push, because one generic
 * permission flow was used for every platform.
 *
 * These helpers decide, per platform, exactly which state the UI shows, which
 * copy it prints and whether a button may exist at all.
 */
import { describe, expect, it } from "vitest";
import {
  IOS_INSTALL_STEPS,
  pushFailureMessage,
  pushStateActionLabel,
  pushStateMessage,
  pushStateNeedsPrompt,
  resolvePushState,
  type PushFailureReason,
  type PushStateInput,
  type PushUiState,
} from "@/src/push/prompt";

const base: PushStateInput = {
  platform: "desktop",
  standalone: false,
  secure: true,
  permission: "default",
  subscribed: false,
  requesting: false,
  failure: null,
};

const state = (overrides: Partial<PushStateInput>): PushUiState =>
  resolvePushState({ ...base, ...overrides });

const ALL_FAILURES: PushFailureReason[] = [
  "unsupported",
  "insecure",
  "no-sw",
  "no-vapid-key",
  "not-installed-pwa",
  "permission-denied",
  "permission-dismissed",
  "subscription-failed",
  "backend-failed",
  "timeout",
  "failed",
];

describe("resolvePushState — platform-specific flow selection", () => {
  it("sends an iPhone Safari tab to the install state, never to a permission ask", () => {
    // Plain Safari tab: whatever iOS reports for `permission`, Web Push does
    // not exist until the app is on the Home Screen.
    expect(state({ platform: "ios", standalone: false })).toBe("IOS_NOT_INSTALLED");
    expect(state({ platform: "ios", standalone: false, permission: "granted" })).toBe(
      "IOS_NOT_INSTALLED"
    );
    expect(state({ platform: "ios", standalone: false, permission: "denied" })).toBe(
      "IOS_NOT_INSTALLED"
    );
    expect(state({ platform: "ios", standalone: false, failure: "permission-denied" })).toBe(
      "IOS_NOT_INSTALLED"
    );
  });

  it("offers the Allow request once iOS runs as an installed Home Screen PWA", () => {
    expect(state({ platform: "ios", standalone: true })).toBe("IOS_READY_TO_REQUEST");
    expect(state({ platform: "ios", standalone: true, permission: "granted" })).toBe("GRANTED");
    expect(state({ platform: "ios", standalone: true, permission: "denied" })).toBe("DENIED");
  });

  it("keeps Android on the normal browser permission flow (no install requirement)", () => {
    expect(state({ platform: "android" })).toBe("ANDROID_READY");
    expect(state({ platform: "android", permission: "granted" })).toBe("GRANTED");
    expect(state({ platform: "android", permission: "denied" })).toBe("DENIED");
  });

  it("keeps desktop on its normal permission flow", () => {
    expect(state({ platform: "desktop" })).toBe("DESKTOP_READY");
    expect(state({ platform: "desktop", permission: "granted" })).toBe("GRANTED");
    expect(state({ platform: "desktop", permission: "denied" })).toBe("DENIED");
  });

  it("reports the in-flight, finished and broken states", () => {
    expect(state({ requesting: true })).toBe("REQUESTING");
    expect(state({ subscribed: true })).toBe("SUBSCRIBED");
    expect(state({ permission: "granted", subscribed: true })).toBe("SUBSCRIBED");
    expect(state({ permission: "granted", failure: "backend-failed" })).toBe("FAILED");
    expect(state({ failure: "permission-dismissed" })).toBe("FAILED");
    expect(state({ failure: "subscription-failed" })).toBe("FAILED");
  });

  it("reports unsupported browsers and insecure origins instead of asking", () => {
    expect(state({ permission: "unsupported" })).toBe("UNSUPPORTED");
    expect(state({ secure: false })).toBe("INSECURE");
    expect(state({ secure: false, platform: "ios", standalone: false })).toBe("INSECURE");
  });

  it("never enters a state that would loop the permission request", () => {
    // A denied OS permission must not resolve to a ready/failed state with an
    // Allow button — that is what produced the endless retry message.
    expect(state({ permission: "denied", failure: "permission-denied" })).toBe("DENIED");
    expect(state({ platform: "ios", standalone: true, permission: "denied" })).toBe("DENIED");
  });

  it("drops a stale permission failure once the OS answer changes", () => {
    // User enables notifications in device Settings and returns: no old error.
    expect(state({ permission: "granted", failure: "permission-denied" })).toBe("GRANTED");
    expect(state({ permission: "granted", failure: "permission-dismissed" })).toBe("GRANTED");
    // ...but an answer that never changed keeps its explanation.
    expect(state({ permission: "default", failure: "permission-dismissed" })).toBe("FAILED");
    expect(state({ permission: "denied", failure: "permission-denied" })).toBe("DENIED");
  });
});

describe("pushStateMessage — copy per state", () => {
  it("gives iOS Safari tabs install instructions, not a permission claim", () => {
    const message = pushStateMessage("IOS_NOT_INSTALLED");
    expect(message).toMatch(/install/i);
    expect(message).toMatch(/home screen/i);
    expect(message).not.toMatch(/tap allow/i);
  });

  it("spells out the Add-to-Home-Screen steps", () => {
    expect(IOS_INSTALL_STEPS).toHaveLength(4);
    expect(IOS_INSTALL_STEPS[0]).toMatch(/share/i);
    expect(IOS_INSTALL_STEPS[1]).toMatch(/add to home screen/i);
    expect(IOS_INSTALL_STEPS[3]).toMatch(/allow/i);
  });

  it("asks for the gesture-based Allow in the installed iOS PWA", () => {
    expect(pushStateMessage("IOS_READY_TO_REQUEST")).toMatch(/allow/i);
    expect(pushStateMessage("IOS_READY_TO_REQUEST")).toMatch(/medibook/i);
  });

  it("keeps Android and desktop on 'enable notifications'", () => {
    expect(pushStateMessage("ANDROID_READY")).toMatch(/enable notifications/i);
    expect(pushStateMessage("DESKTOP_READY")).toMatch(/enable notifications/i);
  });

  it("explains a blocked permission without promising a re-request", () => {
    const message = pushStateMessage("DENIED");
    expect(message).toMatch(/blocked/i);
    expect(message).toMatch(/settings/i);
    expect(message).not.toMatch(/request it again/i);
    expect(message).not.toMatch(/tap allow/i);
  });

  it("has nothing to say while requesting or once subscribed", () => {
    expect(pushStateMessage("REQUESTING")).toBe("");
    expect(pushStateMessage("SUBSCRIBED")).toBe("");
  });

  it("never repeats the old infinite-loop pair of messages", () => {
    const states: PushUiState[] = [
      "UNSUPPORTED",
      "INSECURE",
      "IOS_NOT_INSTALLED",
      "IOS_READY_TO_REQUEST",
      "ANDROID_READY",
      "DESKTOP_READY",
      "REQUESTING",
      "GRANTED",
      "DENIED",
      "SUBSCRIBED",
      "FAILED",
    ];
    for (const s of states) {
      const message = pushStateMessage(s, "permission-denied");
      expect(message, s).not.toMatch(/request it again/i);
      expect(message, s).not.toMatch(/notifications are off/i);
    }
  });
});

describe("pushStateActionLabel — a button only when it can do something", () => {
  it("offers Allow on every platform that can present the OS prompt", () => {
    expect(pushStateActionLabel("IOS_READY_TO_REQUEST")).toBe("Allow");
    expect(pushStateActionLabel("ANDROID_READY")).toBe("Allow");
    expect(pushStateActionLabel("DESKTOP_READY")).toBe("Allow");
  });

  it("offers Enable when permission is granted but the subscription is missing", () => {
    expect(pushStateActionLabel("GRANTED")).toBe("Enable");
  });

  it("offers a retry only for recoverable failures", () => {
    expect(pushStateActionLabel("FAILED", "backend-failed")).toBe("Try again");
    expect(pushStateActionLabel("FAILED", "subscription-failed")).toBe("Try again");
    expect(pushStateActionLabel("FAILED", "timeout")).toBe("Try again");
    expect(pushStateActionLabel("FAILED", "insecure")).toBeNull();
    expect(pushStateActionLabel("FAILED", "unsupported")).toBeNull();
  });

  it("offers no button where the OS would ignore the tap", () => {
    expect(pushStateActionLabel("IOS_NOT_INSTALLED")).toBeNull();
    expect(pushStateActionLabel("DENIED")).toBeNull();
    expect(pushStateActionLabel("UNSUPPORTED")).toBeNull();
    expect(pushStateActionLabel("INSECURE")).toBeNull();
    expect(pushStateActionLabel("SUBSCRIBED")).toBeNull();
    expect(pushStateActionLabel("REQUESTING")).toBeNull();
  });
});

describe("pushStateNeedsPrompt — which states may open a prompt surface", () => {
  it("prompts for install, ready, granted, denied and failed", () => {
    for (const s of [
      "IOS_NOT_INSTALLED",
      "IOS_READY_TO_REQUEST",
      "ANDROID_READY",
      "DESKTOP_READY",
      "GRANTED",
      "DENIED",
      "FAILED",
    ] as const) {
      expect(pushStateNeedsPrompt(s), s).toBe(true);
    }
  });

  it("stays quiet once subscribed, unsupported, insecure or mid-flow", () => {
    for (const s of ["SUBSCRIBED", "UNSUPPORTED", "INSECURE", "REQUESTING"] as const) {
      expect(pushStateNeedsPrompt(s), s).toBe(false);
    }
  });
});

describe("pushFailureMessage — the failure that actually happened", () => {
  it("returns a non-empty user-facing message for every reason", () => {
    for (const reason of ALL_FAILURES) {
      const message = pushFailureMessage(reason);
      expect(message.length, reason).toBeGreaterThan(10);
    }
  });

  it("explains the HTTPS requirement for insecure origins (phone over http://LAN)", () => {
    expect(pushFailureMessage("insecure")).toMatch(/HTTPS/i);
  });

  it("explains the missing VAPID configuration", () => {
    expect(pushFailureMessage("no-vapid-key")).toMatch(/VAPID/i);
  });

  it("blames the missing Home Screen install, not the permission", () => {
    expect(pushFailureMessage("not-installed-pwa")).toMatch(/home screen/i);
    expect(pushFailureMessage("not-installed-pwa")).not.toMatch(/permission/i);
  });

  it("blames the device registration, not the permission, when the backend fails", () => {
    const message = pushFailureMessage("backend-failed");
    expect(message).toMatch(/allowed/i);
    expect(message).toMatch(/register/i);
    expect(message).not.toMatch(/permission was not granted/i);
  });

  it("distinguishes a denied permission from a dismissed prompt", () => {
    expect(pushFailureMessage("permission-denied")).toMatch(/blocked/i);
    expect(pushFailureMessage("permission-dismissed")).toMatch(/tap allow/i);
    expect(pushFailureMessage("permission-dismissed")).not.toMatch(/request it again/i);
  });

  it("never dead-ends into 'permission was not granted' for non-permission failures", () => {
    const notPermission: PushFailureReason[] = [
      "unsupported",
      "insecure",
      "no-sw",
      "no-vapid-key",
      "not-installed-pwa",
      "subscription-failed",
      "backend-failed",
      "timeout",
      "failed",
    ];
    for (const reason of notPermission) {
      expect(pushFailureMessage(reason), reason).not.toMatch(/permission was not granted/i);
      expect(pushFailureMessage(reason), reason).not.toMatch(/request it again/i);
    }
  });
});
