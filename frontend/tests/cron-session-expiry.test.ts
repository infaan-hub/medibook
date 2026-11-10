/**
 * POST /api/cron/session-expiry/ — the external scheduler entry point for the
 * automatic training / psychology-service expiry pass:
 *
 *  • without CRON_SECRET (or with a mismatched header) the run is refused
 *    before the job fires,
 *  • a valid `x-cron-secret` or `Authorization: Bearer` secret runs the pass
 *    exactly once and returns its counts.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const jobs = vi.hoisted(() => ({
  expireStaleSessions: vi.fn(),
}));

vi.hoisted(() => {
  process.env.AUTH_SECRET ??= "test-secret-key-for-cron-session-expiry-000";
  process.env.THROTTLE_DISABLED = "true";
  process.env.CRON_SECRET = "unit-cron-secret";
});

vi.mock("@/services/session-expiry.service", () => ({
  expireStaleSessions: jobs.expireStaleSessions,
}));
// handler() still runs the request audit — a minimal stand-in is enough.
vi.mock("@/lib/db", () => ({
  withDatabaseIdentity: (_identity: unknown, fn: () => Promise<unknown>) => fn(),
  prisma: {
    auditEvent: {
      deleteMany: async () => ({ count: 0 }),
      create: async ({ data }: Record<string, any>) => ({ id: 1, ...data }),
    },
  },
}));

import { GET, POST } from "@/app/api/cron/session-expiry/route";

const counts = {
  training_sessions: 2,
  training_requests: 1,
  psychotherapy_sessions: 3,
  psychotherapy_requests: 2,
};

function call(headers: Record<string, string> = {}, method = "POST"): Promise<Response> {
  return POST(
    new Request("https://medibook.test/api/cron/session-expiry/", {
      method,
      headers,
    }),
    { params: Promise.resolve({}) } as never
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.CRON_SECRET = "unit-cron-secret";
  jobs.expireStaleSessions.mockResolvedValue(counts);
});

describe("secret gate", () => {
  it("refuses when CRON_SECRET is unset, even with a header", async () => {
    process.env.CRON_SECRET = "";

    const response = await call({ "x-cron-secret": "anything" });

    expect(response.status).toBe(403);
    expect(jobs.expireStaleSessions).not.toHaveBeenCalled();
  });

  it("refuses a mismatched secret", async () => {
    const response = await call({ "x-cron-secret": "wrong" });

    expect(response.status).toBe(403);
    expect(jobs.expireStaleSessions).not.toHaveBeenCalled();
  });
});

describe("a valid secret", () => {
  it("runs the expiry pass once and reports its counts", async () => {
    const response = await call({ "x-cron-secret": "unit-cron-secret" });

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.success).toBe(true);
    expect(body.message).toBe("Session expiry processed.");
    expect(body.data).toEqual(counts);
    expect(jobs.expireStaleSessions).toHaveBeenCalledTimes(1);
  });

  it("accepts the Authorization: Bearer form too", async () => {
    const response = await call({ authorization: "Bearer unit-cron-secret" });

    expect(response.status).toBe(200);
    expect(jobs.expireStaleSessions).toHaveBeenCalledTimes(1);
  });

  it("exposes the same machine-guarded run over GET", async () => {
    expect(GET).toBe(POST);
  });
});
