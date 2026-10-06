/**
 * sendTestNotification — the delivery diagnostic behind /profile's
 * "Send test notification" (POST /api/notifications/test/).
 *
 * Pins the contract the UI depends on:
 *  1. the test goes to the CALLER through the same notify() path real system
 *     notifications take (inbox row → realtime frame → web push);
 *  2. `push_subscriptions` counts ACTIVE device registrations — a deactivated
 *     row can never deliver, and reporting it would tell the user "you're
 *     fine" while push is actually dead;
 *  3. zero registered devices is still a successful send (the inbox row is
 *     real) so the UI can advise re-enabling instead of showing an error.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { sendTestNotification } from "@/services/notification.service";
import type { AuthUser } from "@/lib/auth";

const repo = vi.hoisted(() => ({
  countActivePushSubscriptions: vi.fn(),
}));

const notify = vi.hoisted(() => vi.fn());

vi.mock("@/repositories/notifications.repo", () => repo);

vi.mock("@/lib/notify", () => ({
  notify,
  broadcastNotificationUpdated: vi.fn(),
  broadcastAppointmentEvent: vi.fn(),
  broadcastAvailabilityUpdated: vi.fn(),
  pushRaw: vi.fn(),
  notificationPayload: vi.fn(),
  appointmentPayload: vi.fn(),
}));

// Never touched — stubbed so no Prisma client is constructed in a unit test.
vi.mock("@/lib/db", () => ({ prisma: {} }));

const USER = { id: 7, role: "patient" } as AuthUser;

function row() {
  return {
    id: 42,
    recipient_id: 7,
    notification_type: "system",
    title: "MediBook test notification",
    message: "This is a test notification from MediBook. If you can see it, delivery to this account works.",
    related_appointment_id: null,
    is_read: false,
    created_at: new Date("2026-10-06T10:00:00Z"),
  };
}

beforeEach(() => {
  repo.countActivePushSubscriptions.mockReset();
  notify.mockReset();
  notify.mockResolvedValue(row());
});

describe("sendTestNotification", () => {
  it("sends through notify() to the caller and reports the ACTIVE push registrations", async () => {
    repo.countActivePushSubscriptions.mockResolvedValue(2);

    const result = await sendTestNotification(USER);

    expect(notify).toHaveBeenCalledTimes(1);
    expect(notify).toHaveBeenCalledWith(
      7,
      "system",
      expect.stringContaining("test notification"),
      null,
      "MediBook test notification"
    );
    expect(result.push_subscriptions).toBe(2);
    expect(result.notification).toMatchObject({
      id: 42,
      notification_type: "system",
      title: "MediBook test notification",
      is_read: false,
    });
  });

  it("still succeeds with zero devices so the UI can advise re-enabling", async () => {
    repo.countActivePushSubscriptions.mockResolvedValue(0);

    const result = await sendTestNotification(USER);

    expect(repo.countActivePushSubscriptions).toHaveBeenCalledWith(7);
    expect(result.push_subscriptions).toBe(0);
    expect(notify).toHaveBeenCalledTimes(1);
  });
});
