/**
 * POST /api/cron/reminders/ — the external scheduler entry point now runs the
 * 24-hour expired-appointment purge alongside the reminder dispatch:
 *
 *  • without CRON_SECRET (or with a mismatched header) the run is refused
 *    before either job fires,
 *  • a valid `x-cron-secret` or `Authorization: Bearer` secret runs BOTH jobs
 *    exactly once and reports the purge count in the envelope.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const jobs = vi.hoisted(() => ({
  sendDueReminders: vi.fn(),
  purgeExpiredAppointments: vi.fn(),
}));

vi.hoisted(() => {
  process.env.AUTH_SECRET ??= "test-secret-key-for-cron-reminders-suite-000";
  process.env.THROTTLE_DISABLED = "true";
  process.env.CRON_SECRET = "unit-cron-secret";
});

vi.mock("@/lib/reminders", () => ({ sendDueReminders: jobs.sendDueReminders }));
vi.mock("@/services/emergency.service", () => ({
  purgeExpiredAppointments: jobs.purgeExpiredAppointments,
}));
// handler() still runs the request audit — a minimal stand-in is enough.
vi.mock("@/lib/db", () => ({
  prisma: {
    auditEvent: {
      deleteMany: async () => ({ count: 0 }),
      create: async ({ data }: Record<string, any>) => ({ id: 1, ...data }),
    },
  },
}));

import { POST } from "@/app/api/cron/reminders/route";

function call(headers: Record<string, string> = {}): Promise<Response> {
  return POST(
    new Request("https://medibook.test/api/cron/reminders/", {
      method: "POST",
      headers,
    }),
    { params: Promise.resolve({}) } as never
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.CRON_SECRET = "unit-cron-secret";
  jobs.sendDueReminders.mockResolvedValue({ sent: 2, skipped: 1, failed: 0 });
  jobs.purgeExpiredAppointments.mockResolvedValue(3);
});

describe("secret gate", () => {
  it("refuses when CRON_SECRET is unset, even with a header", async () => {
    process.env.CRON_SECRET = "";

    const response = await call({ "x-cron-secret": "anything" });

    expect(response.status).toBe(403);
    expect(jobs.sendDueReminders).not.toHaveBeenCalled();
    expect(jobs.purgeExpiredAppointments).not.toHaveBeenCalled();
  });

  it("refuses a mismatched secret", async () => {
    const response = await call({ "x-cron-secret": "wrong" });

    expect(response.status).toBe(403);
    expect(jobs.purgeExpiredAppointments).not.toHaveBeenCalled();
  });
});

describe("a valid secret", () => {
  it("runs reminders + purge once and reports the purge count", async () => {
    const response = await call({ "x-cron-secret": "unit-cron-secret" });

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.success).toBe(true);
    expect(body.message).toBe("Reminders processed.");
    expect(body.data).toEqual({ sent: 2, skipped: 1, failed: 0, purged: 3 });
    expect(jobs.sendDueReminders).toHaveBeenCalledTimes(1);
    expect(jobs.purgeExpiredAppointments).toHaveBeenCalledTimes(1);
  });

  it("accepts the Authorization: Bearer form too", async () => {
    const response = await call({ authorization: "Bearer unit-cron-secret" });

    expect(response.status).toBe(200);
    expect(jobs.purgeExpiredAppointments).toHaveBeenCalledTimes(1);
  });
});
