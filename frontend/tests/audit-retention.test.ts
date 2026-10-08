/**
 * Audit retention (72 hours) + the admin "clear the trail" action, driven
 * through the REAL route handlers against a stateful stand-in for the
 * AuditEvent / User tables:
 *
 *   • the trail is a rolling 72-hour window — purging deletes exactly the
 *     rows created before the cutoff; opportunistic purges are spaced to one
 *     per minute while forced purges always run,
 *   • GET /api/admin/audit/ purges first, so an expired row is never listed,
 *   • DELETE /api/admin/audit/ needs a superuser, wipes every row and records
 *     exactly one fresh `audit.cleared` row — the generic request audit skips
 *     this path, so reading/clearing never feeds the trail.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const harness = vi.hoisted(() => {
  type Row = Record<string, any>;

  const users: Row[] = [];
  const audits: Row[] = [];
  /** Every deleteMany call, keeping its `where` (undefined = wipe-all). */
  const deleteCalls: Array<{ where?: Row }> = [];
  let seq = 1;

  const reset = () => {
    users.length = 0;
    audits.length = 0;
    deleteCalls.length = 0;
  };

  const prisma: any = {
    user: {
      findUnique: async ({ where }: Row) => {
        const row = users.find((entry) => entry.id === where.id);
        return row ? { ...row } : null;
      },
    },
    auditEvent: {
      create: async ({ data }: Row) => {
        const row: Row = {
          id: seq++,
          actor_id: null,
          target: "",
          detail: "",
          created_at: new Date(),
          updated_at: new Date(),
          ...data,
        };
        audits.push(row);
        return { ...row };
      },
      deleteMany: async (args?: Row) => {
        const where = args?.where as Row | undefined;
        deleteCalls.push({ where });
        if (!where) {
          const count = audits.length;
          audits.length = 0;
          return { count };
        }
        const lt = where.created_at?.lt as Date | undefined;
        const kept = audits.filter((row) => !(lt instanceof Date && row.created_at < lt));
        const count = audits.length - kept.length;
        audits.splice(0, audits.length, ...kept);
        return { count };
      },
      // The list reaches the repo unfiltered in this suite.
      count: async () => audits.length,
      findMany: async ({ skip = 0, take }: Row) => {
        const page = audits.slice(skip, take ? skip + take : undefined);
        return page.map((row) => ({
          ...row,
          actor: row.actor_id ? (users.find((entry) => entry.id === row.actor_id) ?? null) : null,
        }));
      },
    },
  };

  return {
    prisma,
    reset,
    audits,
    users,
    deleteCalls,
    /** A row outside/inside the window — insertion order doubles as order. */
    seedAudit(createdAt: Date, action = "some.action", actorId: number | null = null) {
      const row: Row = {
        id: seq++,
        actor_id: actorId,
        action,
        target: "/api/x/",
        detail: "HTTP 200 · GET",
        created_at: createdAt,
        updated_at: createdAt,
      };
      audits.push(row);
      return row;
    },
    addUser(overrides: Row = {}) {
      const row: Row = { id: users.length + 1, username: `user-${users.length + 1}`, ...overrides };
      users.push(row);
      return row;
    },
    actions: () => audits.map((row) => row.action),
  };
});

// JWT signing and the route throttle are environment switches, not behaviour.
vi.hoisted(() => {
  process.env.AUTH_SECRET ??= "test-secret-key-for-audit-retention-suite-000";
  process.env.THROTTLE_DISABLED = "true";
});

vi.mock("@/lib/db", () => ({ prisma: harness.prisma }));

import { AUDIT_RETENTION_HOURS, purgeExpiredAuditEvents } from "@/lib/audit";
import { signAccessToken } from "@/lib/jwt";
import { DELETE as clearRoute, GET as listRoute } from "@/app/api/admin/audit/route";

const HOUR = 3_600_000;
const expired = () => new Date(Date.now() - (AUDIT_RETENTION_HOURS + 1) * HOUR);
const fresh = () => new Date(Date.now() - HOUR);

const adminUser = () =>
  harness.addUser({
    role: "admin",
    is_superuser: true,
    is_active: true,
    first_name: "Boss",
    last_name: "Tester",
    email: "boss@example.com",
  });

function call(method: "GET" | "DELETE", token?: string): Promise<Response> {
  const route = method === "DELETE" ? clearRoute : listRoute;
  return route(
    new Request("https://medibook.test/api/admin/audit/", {
      method,
      ...(token ? { headers: { authorization: `Bearer ${token}` } } : {}),
    }),
    { params: Promise.resolve({}) } as never
  );
}

beforeEach(() => harness.reset());

describe("72h retention", () => {
  it("keeps the window at 72 hours", () => {
    expect(AUDIT_RETENTION_HOURS).toBe(72);
  });

  it("deletes exactly the rows created before the cutoff", async () => {
    harness.seedAudit(expired(), "old.login");
    harness.seedAudit(fresh(), "recent.login");

    const removed = await purgeExpiredAuditEvents();

    expect(removed).toBe(1);
    expect(harness.actions()).toEqual(["recent.login"]);
    const purge = harness.deleteCalls.find((entry) => entry.where);
    const cutoff = purge?.where?.created_at?.lt as Date;
    expect(cutoff).toBeInstanceOf(Date);
    expect(Math.abs(cutoff.getTime() - (Date.now() - 72 * HOUR))).toBeLessThan(10_000);
  });

  it("spaces opportunistic purges to one per minute; forced ones always run", async () => {
    // Declared before any route call, so this is the first throttled purge.
    const before = harness.deleteCalls.length;
    await purgeExpiredAuditEvents({ throttle: true });
    expect(harness.deleteCalls.length).toBe(before + 1);

    await purgeExpiredAuditEvents({ throttle: true }); // inside the window
    expect(harness.deleteCalls.length).toBe(before + 1);

    await purgeExpiredAuditEvents(); // forced — ignores the throttle
    expect(harness.deleteCalls.length).toBe(before + 2);
  });
});

describe("GET /api/admin/audit/", () => {
  it("purges expired rows before listing", async () => {
    adminUser();
    harness.seedAudit(expired(), "old.login");
    harness.seedAudit(fresh(), "recent.login");
    const token = await signAccessToken(1);

    const response = await call("GET", token);

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.success).toBe(true);
    expect(body.data.count).toBe(1);
    expect(body.data.results.map((row: { action: string }) => row.action)).toEqual(["recent.login"]);
    expect(harness.actions()).toEqual(["recent.login"]);
  });
});

describe("DELETE /api/admin/audit/", () => {
  it("rejects anonymous callers (401) and non-superusers (403)", async () => {
    expect((await call("DELETE")).status).toBe(401);

    harness.addUser({ role: "patient", is_superuser: false, is_active: true });
    const denied = await call("DELETE", await signAccessToken(1));

    expect(denied.status).toBe(403);
    expect((await denied.json()).message).toBe("This action is available to administrators only.");
    expect(harness.audits).toHaveLength(0); // nothing was wiped
  });

  it("wipes every row and records exactly one fresh audit.cleared row", async () => {
    const admin = adminUser();
    harness.seedAudit(expired(), "old.login");
    harness.seedAudit(fresh(), "recent.login");

    const response = await call("DELETE", await signAccessToken(admin.id));

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.success).toBe(true);
    expect(body.message).toBe("Audit log cleared.");
    expect(body.data).toEqual({ deleted: 2 });
    // The wipe reached the store as a full-table delete…
    expect(harness.deleteCalls.some((entry) => entry.where === undefined)).toBe(true);
    // …and the surviving row is the semantic clear event, attributed to the admin.
    expect(harness.actions()).toEqual(["audit.cleared"]);
    expect(harness.audits[0].actor_id).toBe(admin.id);
    expect(harness.audits[0].detail).toBe("Cleared 2 audit event(s)");
  });
});
