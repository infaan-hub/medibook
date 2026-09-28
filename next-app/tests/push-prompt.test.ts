/**
 * Push-notification prompt state + failure copy (pure helpers).
 *
 * Regression coverage for the "push notifications never arrive" root cause:
 *  - the old banner rendered only for `permission === "default" && !subscribed`,
 *    hiding the Enable button from users whose permission was already granted
 *    but whose subscription was missing → they could never (re)subscribe and
 *    the server kept zero push-subscription rows;
 *  - subscribe failures were swallowed, so the UI claimed success while the
 *    server stored nothing.
 *
 * These helpers decide what the banner shows and what error text the user
 * sees for every typed failure reason.
 */
import { describe, expect, it } from "vitest";
import {
  pushFailureMessage,
  pushPromptMessage,
  pushPromptMode,
  type PushFailureReason,
} from "@/ui/push/prompt";

describe("pushPromptMode — what the patient-home banner shows", () => {
  it("offers Enable on first visit (permission still default)", () => {
    expect(pushPromptMode("default", false)).toBe("enable");
  });

  it("offers Enable to heal 'granted but not subscribed' (old code hid this forever)", () => {
    expect(pushPromptMode("granted", false)).toBe("resubscribe");
  });

  it("still offers Allow when permission was denied (asking the device is the only way back)", () => {
    expect(pushPromptMode("denied", false)).toBe("blocked");
  });

  it("hides the banner once subscribed", () => {
    expect(pushPromptMode("default", true)).toBe("hidden");
    expect(pushPromptMode("granted", true)).toBe("hidden");
    expect(pushPromptMode("denied", true)).toBe("hidden");
  });

  it("hides when the browser has no Notifications support", () => {
    expect(pushPromptMode("unsupported", false)).toBe("hidden");
  });

  it("leaves no mode without an action — enable/resubscribe/blocked all keep a button", () => {
    expect(pushPromptMode("default", false)).toBe("enable");
    expect(pushPromptMode("granted", false)).toBe("resubscribe");
    expect(pushPromptMode("denied", false)).toBe("blocked");
  });
});

describe("pushPromptMessage — banner copy per mode", () => {
  it("gives distinct actionable copy for enable vs resubscribe vs blocked", () => {
    const enable = pushPromptMessage("enable");
    const resub = pushPromptMessage("resubscribe");
    const blocked = pushPromptMessage("blocked");
    for (const msg of [enable, resub, blocked]) {
      expect(msg.length).toBeGreaterThan(10);
    }
    expect(new Set([enable, resub, blocked]).size).toBe(3);
  });

  it("has no copy when hidden", () => {
    expect(pushPromptMessage("hidden")).toBe("");
  });
});

describe("pushFailureMessage — every typed failure reason is explainable", () => {
  const reasons: PushFailureReason[] = [
    "unsupported",
    "insecure",
    "no-sw",
    "no-vapid-key",
    "permission-denied",
    "timeout",
    "failed",
  ];

  it("returns a non-empty user-facing message for every reason", () => {
    for (const reason of reasons) {
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
});

describe("copy never dead-ends into browser settings", () => {
  // Product rule: the popup always offers an Allow/Enable button instead of
  // telling the user to go hunting through their browser's site settings.
  const BANNED = /browser settings|site settings|allow them for this site/i;

  it("keeps every prompt-mode message actionable and free of settings instructions", () => {
    for (const mode of ["enable", "resubscribe", "blocked"] as const) {
      const message = pushPromptMessage(mode);
      expect(message, mode).not.toMatch(BANNED);
      expect(message, mode).toMatch(/tap|allow|enable/i);
    }
  });

  it("keeps every failure message free of settings instructions", () => {
    const reasons: PushFailureReason[] = [
      "unsupported",
      "insecure",
      "no-sw",
      "no-vapid-key",
      "permission-denied",
      "timeout",
      "failed",
    ];
    for (const reason of reasons) {
      expect(pushFailureMessage(reason), reason).not.toMatch(BANNED);
    }
    expect(pushFailureMessage("permission-denied")).toMatch(/allow/i);
  });
});
