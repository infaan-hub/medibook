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

  it("shows a blocked hint without a button when permission was denied", () => {
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

  it("never renders both a button and nothing — enable/resubscribe are actionable, blocked is not", () => {
    for (const permission of ["default", "granted"] as const) {
      const mode = pushPromptMode(permission, false);
      expect(["enable", "resubscribe"]).toContain(mode);
    }
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
