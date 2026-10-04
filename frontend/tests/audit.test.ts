/**
 * Audit trail — every request persists one compact row (logins, logouts,
 * account creation, appointments, any API call …), the write never breaks
 * the request it describes, failed auth attempts record the attempted
 * identity, and reading the audit list does not feed it (stable pagination).
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  create: vi.fn(async (args: { data: Record<string, unknown> }) => ({ id: 1, ...args.data })),
}));

vi.mock("@/lib/db", () => ({
  prisma: {
    auditEvent: { create: state.create },
    user: { findUnique: vi.fn(async () => null) },
  },
}));

import { deriveAction } from "@/lib/audit";
import { handler } from "@/lib/route";

const okRoute = handler(async () => new Response(JSON.stringify({ ok: true }), { status: 200 }));

function call(path: string, init?: RequestInit) {
  return okRoute(
    new Request(`https://medibook.test${path}`, init),
    { params: Promise.resolve({}) } as never
  );
}

function lastData(): Record<string, unknown> {
  return state.create.mock.calls[state.create.mock.calls.length - 1][0].data;
}

describe("deriveAction", () => {
  it("maps the important flows to semantic names", () => {
    expect(deriveAction("POST", "/api/auth/login/")).toBe("auth.login");
    expect(deriveAction("POST", "/api/auth/logout/")).toBe("auth.logout");
    expect(deriveAction("POST", "/api/auth/register/")).toBe("auth.register");
    expect(deriveAction("POST", "/api/auth/password-change/")).toBe("auth.password_change");
    expect(deriveAction("POST", "/api/auth/token/refresh/")).toBe("auth.token_refresh");
    expect(deriveAction("GET", "/api/auth/me/")).toBe("auth.me");
  });

  it("names appointments and admin management actions", () => {
    expect(deriveAction("POST", "/api/appointments/")).toBe("appointment.create");
    expect(deriveAction("GET", "/api/appointments/")).toBe("appointment.read");
    expect(deriveAction("POST", "/api/appointments/12/cancel/")).toBe("appointment.cancel");
    expect(deriveAction("POST", "/api/appointments/12/accept/")).toBe("appointment.accept");
    expect(deriveAction("POST", "/api/admin/users/create/")).toBe("admin_user.create");
    expect(deriveAction("DELETE", "/api/admin/users/5/")).toBe("admin_user.delete");
    expect(deriveAction("POST", "/api/admin/doctors/3/approve/")).toBe("admin_doctor.approve");
    expect(deriveAction("GET", "/api/doctor/appointments/")).toBe("doctor_appointment.read");
    expect(deriveAction("POST", "/api/emergency/appointments/")).toBe("emergency_appointment.create");
    expect(deriveAction("GET", "/api/health/")).toBe("health.read");
  });
});

describe("handler audit capture", () => {
  // NOTE: block body — a concise arrow would return the mock and vitest would
  // treat it as a cleanup callback, invoking create() with no arguments.
  beforeEach(() => {
    state.create.mockClear();
  });

  it("records one compact row per request", async () => {
    const response = await call("/api/appointments/");
    expect(response.status).toBe(200);
    expect(state.create).toHaveBeenCalledTimes(1);
    const data = lastData();
    expect(data.action).toBe("appointment.read");
    expect(data.target).toBe("/api/appointments/");
    expect(data.actor_id).toBeNull();
    expect(String(data.detail)).toContain("HTTP 200");
    expect(String(data.detail)).toContain("GET");
    expect(String(data.detail)).toContain("ms");
  });

  it("records the attempted identity on auth posts (failed logins)", async () => {
    const response = await call("/api/auth/login/", {
      method: "POST",
      body: JSON.stringify({ email: "juma@example.com" }),
    });
    expect(response.status).toBe(200);
    expect(state.create).toHaveBeenCalledTimes(1);
    const data = lastData();
    expect(data.action).toBe("auth.login");
    expect(String(data.detail)).toContain("juma@example.com");
  });

  it("keeps the response intact when the audit write fails", async () => {
    state.create.mockRejectedValueOnce(new Error("db down"));
    const response = await call("/api/appointments/3/");
    expect(response.status).toBe(200);
    expect(state.create).toHaveBeenCalledTimes(1);
  });

  it("does not feed the audit list from itself (stable pagination)", async () => {
    await call("/api/admin/audit/?page=2");
    expect(state.create).not.toHaveBeenCalled();
  });

  it("audits failures too — thrown route errors still produce a row", async () => {
    const failing = handler(async () => {
      throw new Error("boom");
    });
    const response = await failing(
      new Request("https://medibook.test/api/appointments/"),
      { params: Promise.resolve({}) } as never
    );
    expect(response.status).toBeGreaterThanOrEqual(400);
    expect(state.create).toHaveBeenCalledTimes(1);
    expect(String(lastData().detail)).toContain(`HTTP ${response.status}`);
  });
});
