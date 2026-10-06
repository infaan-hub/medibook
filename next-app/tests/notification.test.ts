/**
 * sendTestNotificationToAllDevices — the ADMIN-ONLY platform fan-out behind
 * /profile's "Send test notification" (POST /api/notifications/test/).
 *
 * Pins the contract the UI depends on:
 *  1. non-admins (doctors, patients) are refused with a 403 — the gate lives
 *     in the service, not just in the UI, so a hand-crafted request cannot
 *     fan out to every device;
 *  2. each user with an ACTIVE registration is notified through the same
 *     notify() path real system notifications take (inbox → realtime → web
 *     push);
 *  3. the reach (users + ACTIVE devices) is reported so the admin toast can
 *     say exactly what happened; zero devices is still a successful run.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { sendTestNotificationToAllDevices } from "@/services/notification.service";
import type { AuthUser } from "@/lib/auth";

const repo = vi.hoisted(() => ({
  listUserIdsWithActivePush: vi.fn(),
  countAllActivePushSubscriptions: vi.fn(),
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

const ADMIN = { id: 1, role: "admin", is_superuser: false } as AuthUser;
const PATIENT = { id: 7, role: "patient", is_superuser: false } as AuthUser;
const DOCTOR = { id: 8, role: "doctor", is_superuser: false } as AuthUser;

beforeEach(() => {
  repo.listUserIdsWithActivePush.mockReset();
  repo.countAllActivePushSubscriptions.mockReset();
  notify.mockReset();
});

describe("sendTestNotificationToAllDevices", () => {
  it("refuses doctors and patients with a 403 and notifies nobody", async () => {
    for (const actor of [PATIENT, DOCTOR]) {
      await expect(sendTestNotificationToAllDevices(actor)).rejects.toMatchObject({
        status: 403,
      });
    }
    expect(notify).not.toHaveBeenCalled();
    expect(repo.listUserIdsWithActivePush).not.toHaveBeenCalled();
  });

  it("fans out to every user with an active device and reports the reach", async () => {
    repo.listUserIdsWithActivePush.mockResolvedValue([3, 4, 9]);
    repo.countAllActivePushSubscriptions.mockResolvedValue(5);

    const result = await sendTestNotificationToAllDevices(ADMIN);

    expect(notify).toHaveBeenCalledTimes(3);
    expect(notify).toHaveBeenCalledWith(
      3,
      "system",
      expect.stringContaining("test notification"),
      null,
      "MediBook test notification"
    );
    expect(result).toEqual({ users: 3, push_subscriptions: 5 });
  });

  it("succeeds with an empty platform so the admin sees a truthful zero", async () => {
    repo.listUserIdsWithActivePush.mockResolvedValue([]);
    repo.countAllActivePushSubscriptions.mockResolvedValue(0);

    const result = await sendTestNotificationToAllDevices(ADMIN);

    expect(result).toEqual({ users: 0, push_subscriptions: 0 });
    expect(notify).not.toHaveBeenCalled();
  });
});
