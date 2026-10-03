/**
 * Web push sender (lib/push.ts) — the request that has to reach the phone.
 *
 * Covers the delivery contract for every platform the app targets (iPhone
 * Home Screen PWA via APNs, Android Chrome via FCM, desktop browsers):
 *  - `urgency: high` so the push service delivers immediately instead of
 *    batching behind power policy (Apple: "To attempt to deliver the
 *    notification immediately, specify `high`");
 *  - an RFC 8030 `Topic` so repeats for the same appointment coalesce instead
 *    of stacking on the lock screen;
 *  - a dead endpoint (404/410) is deactivated so sends stop wasting attempts;
 *  - the push service's own `reason` (e.g. 403 BadJwtToken — an iOS-only
 *    VAPID failure) is surfaced instead of a bare status code.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  findMany: vi.fn(),
  update: vi.fn(),
  sendNotification: vi.fn(),
  setVapidDetails: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  prisma: {
    pushSubscription: { findMany: state.findMany, update: state.update },
    user: { findUnique: vi.fn(async () => null) },
  },
}));

import { __setPushTransport, pushTopic, sendWebPushToUser } from "@/lib/push";

function row(id: number, endpoint: string) {
  return {
    id,
    user_id: 7,
    endpoint,
    p256dh_key: "p256dh-value",
    auth_key: "auth-value",
    is_active: true,
  };
}

function pushError(statusCode: number, body?: string) {
  const error = new Error(`push failed with ${statusCode}`) as Error & {
    statusCode?: number;
    body?: string;
  };
  error.statusCode = statusCode;
  error.body = body;
  return error;
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.VAPID_PUBLIC_KEY = "BD4AjtD88HaZjlceIz7QsYmJYrkC9Y-RJBf5gaPtgxsU0xR6J0K2EY7RNLPqpZY9dSCg4K5ulUabV7aUMHnn1Q8";
  process.env.VAPID_PRIVATE_KEY = "64P8KTWFC4A9tmr02Lltq0nM6iZfyJ0usmKahIhrQa0";
  process.env.VAPID_SUBJECT = "mailto:ops@example.com";
  __setPushTransport({
    setVapidDetails: state.setVapidDetails,
    sendNotification: state.sendNotification,
  } as unknown as typeof import("web-push"));
  state.findMany.mockResolvedValue([row(1, "https://fcm.googleapis.com/fcm/send/abc")]);
  state.update.mockResolvedValue({});
  state.sendNotification.mockResolvedValue({ statusCode: 201 });
  vi.spyOn(console, "warn").mockImplementation(() => undefined);
  vi.spyOn(console, "log").mockImplementation(() => undefined);
});

describe("sendWebPushToUser", () => {
  it("sends immediately (urgency high) with a coalescing topic", async () => {
    const result = await sendWebPushToUser(7, {
      title: "Appointment accepted",
      body: "Dr. Smith confirmed your visit.",
      url: "/appointments/42",
      appointment_id: 42,
      notification_id: 9,
      tag: "notification-9",
    });

    expect(result).toEqual({ sent: 1, failed: 0, deactivated: 0, skipped: false });
    expect(state.setVapidDetails).toHaveBeenCalledWith(
      "mailto:ops@example.com",
      process.env.VAPID_PUBLIC_KEY,
      process.env.VAPID_PRIVATE_KEY
    );

    const [, body, options] = state.sendNotification.mock.calls[0] as [
      unknown,
      string,
      { urgency: string; topic?: string; TTL: number }
    ];
    expect(JSON.parse(body)).toMatchObject({
      title: "Appointment accepted",
      url: "/appointments/42",
    });
    expect(options.urgency).toBe("high");
    expect(options.topic).toBe("a42");
    expect(options.TTL).toBeGreaterThan(0);
  });

  it("omits the topic when there is nothing to coalesce", async () => {
    await sendWebPushToUser(7, { title: "MediBook update", body: "New health tip" });

    const options = state.sendNotification.mock.calls[0][2] as { topic?: string };
    expect(options.topic).toBeUndefined();
  });

  it("deactivates a subscription the push service reports as gone (410)", async () => {
    state.sendNotification.mockRejectedValueOnce(pushError(410, '{"reason":"ExpiredToken"}'));

    const result = await sendWebPushToUser(7, {
      title: "Appointment reminder",
      body: "In one hour",
    });

    expect(result.deactivated).toBe(1);
    expect(result.failed).toBe(1);
    expect(state.update).toHaveBeenCalledWith({
      where: { id: 1 },
      data: { is_active: false },
    });
  });

  it("surfaces the push service's own reason for an auth failure instead of hiding it", async () => {
    state.sendNotification.mockRejectedValueOnce(
      pushError(403, '{"reason":"BadJwtToken"}')
    );

    const result = await sendWebPushToUser(7, { title: "Hi", body: "there" });

    expect(result).toMatchObject({ sent: 0, failed: 1, deactivated: 0 });
    expect(state.update).not.toHaveBeenCalled();
    expect(console.warn).toHaveBeenCalledWith(expect.stringContaining("BadJwtToken"));
  });

  it("reports 'nothing to send to' instead of pretending success", async () => {
    state.findMany.mockResolvedValue([]);

    const result = await sendWebPushToUser(7, { title: "Hi", body: "there" });

    expect(result).toMatchObject({ sent: 0, skipped: false });
    expect(state.sendNotification).not.toHaveBeenCalled();
    expect(console.warn).toHaveBeenCalledWith(expect.stringContaining("no active push subscription"));
  });

  it("skips entirely when VAPID is not configured (never a silent fake send)", async () => {
    delete process.env.VAPID_PUBLIC_KEY;
    delete process.env.VAPID_PRIVATE_KEY;
    delete process.env.VAPID_SUBJECT;
    // `configured` is cached per process: clear it the same way a restart would.
    vi.resetModules();
    const fresh = await import("@/lib/push");
    const result = await fresh.sendWebPushToUser(7, { title: "Hi", body: "there" });

    expect(result.skipped).toBe(true);
    expect(state.sendNotification).not.toHaveBeenCalled();
    // Restore for any later test in this file.
    process.env.VAPID_PUBLIC_KEY = "PUB";
    process.env.VAPID_PRIVATE_KEY = "PRIV";
    process.env.VAPID_SUBJECT = "mailto:ops@example.com";
    __setPushTransport({
      setVapidDetails: state.setVapidDetails,
      sendNotification: state.sendNotification,
    } as unknown as typeof import("web-push"));
  });
});

describe("pushTopic", () => {
  it("is at most 32 URL-safe Base64 characters (RFC 8030)", () => {
    const topic = pushTopic({
      title: "t",
      body: "b",
      tag: "a tag with spaces/and?symbols=",
    });
    expect(topic).not.toBeNull();
    expect(topic!.length).toBeLessThanOrEqual(32);
    expect(topic).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it("prefers the appointment, then the notification id", () => {
    expect(pushTopic({ title: "t", body: "b", appointment_id: 42 })).toBe("a42");
    expect(pushTopic({ title: "t", body: "b", notification_id: 9 })).toBe("n9");
    expect(pushTopic({ title: "t", body: "b" })).toBeNull();
  });
});
