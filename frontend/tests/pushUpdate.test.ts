/**
 * POST /api/push/update — the SW `pushsubscriptionchange` rotation endpoint.
 *
 * The browser rotates a subscription while the app is CLOSED (iOS endpoint
 * rotation, VAPID rotation, site-data wipe), so the page is not there to
 * re-register with an access token. The contract:
 *
 *  - possession of the OLD endpoint is the proof for an anonymous caller:
 *    that row's endpoint/keys/device move to the fresh values and the row is
 *    REACTIVATED — but `user_id` is never touched (an attacker who somehow
 *    learns an endpoint must not be able to steal another account's inbox);
 *  - an authenticated caller may also register a fresh subscription directly;
 *  - a fresh endpoint that already exists as its own row (retry / second tab)
 *    is merged — the successor wins and the stale row is dropped, instead of
 *    tripping the unique index;
 *  - a missing `oldEndpoint` match for an anonymous caller is a 404 (nothing
 *    to rotate), malformed payloads are 400s.
 *
 * Runs the real handler → service → repository chain over a stubbed Prisma.
 */
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "@/app/api/push/update/route";
import { signAccessToken } from "@/lib/jwt";

interface PushRow {
  id: number;
  user_id: number;
  endpoint: string;
  p256dh_key: string;
  auth_key: string;
  fcm_token: string;
  device_info: Record<string, unknown>;
  is_active: boolean;
}

const state = vi.hoisted(() => ({
  rows: [] as PushRow[],
  nextId: 100,
  user: { id: 5, role: "patient", is_active: true, is_superuser: false, email: "p@example.test" },
}));

vi.mock("@/lib/db", () => ({
  prisma: {
    pushSubscription: {
      findUnique: async ({ where }: { where: { endpoint?: string; id?: number } }) => {
        if (where.endpoint !== undefined) {
          return state.rows.find((row) => row.endpoint === where.endpoint) ?? null;
        }
        return state.rows.find((row) => row.id === where.id) ?? null;
      },
      update: async ({
        where,
        data,
      }: {
        where: { id: number };
        data: Partial<PushRow>;
      }) => {
        const row = state.rows.find((candidate) => candidate.id === where.id);
        if (!row) throw new Error("record not found");
        Object.assign(row, data);
        return { ...row };
      },
      create: async ({ data }: { data: Omit<PushRow, "id" | "fcm_token" | "device_info" | "is_active"> }) => {
        const row: PushRow = {
          fcm_token: "",
          device_info: {},
          is_active: true,
          ...data,
          id: state.nextId++,
        };
        state.rows.push(row);
        return { ...row };
      },
      delete: async ({ where }: { where: { id: number } }) => {
        const index = state.rows.findIndex((row) => row.id === where.id);
        if (index >= 0) state.rows.splice(index, 1);
        return {};
      },
    },
    user: { findUnique: async ({ where }: { where: { id: number } }) => ({ ...state.user, id: where.id }) },
    auditEvent: { create: async () => ({}) },
  },
}));

function seed(partial: Partial<PushRow> & { id: number; endpoint: string }): PushRow {
  const row: PushRow = {
    user_id: 99,
    p256dh_key: "old-p256dh",
    auth_key: "old-auth",
    fcm_token: "",
    device_info: { source: "page" },
    is_active: false,
    ...partial,
  };
  state.rows.push(row);
  return row;
}

async function post(body: unknown, token?: string) {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (token) headers.Authorization = `Bearer ${token}`;
  return POST(
    new Request("http://localhost/api/push/update", {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({}) }
  );
}

function freshSubscription(endpoint = "https://fcm.example/FRESH") {
  return {
    endpoint,
    keys: { p256dh: "new-p256dh", auth: "new-auth" },
    device_info: { source: "pushsubscriptionchange" },
  };
}

beforeAll(() => {
  // Read lazily by jose at sign/verify time — set it before any token is minted.
  process.env.AUTH_SECRET = "vitest-rotation-secret";
});

beforeEach(() => {
  state.rows = [];
  vi.spyOn(console, "log").mockImplementation(() => undefined);
  vi.spyOn(console, "warn").mockImplementation(() => undefined);
});

describe("POST /api/push/update — anonymous rotation (endpoint possession)", () => {
  it("swaps the old row onto the fresh endpoint without touching its owner", async () => {
    seed({ id: 41, endpoint: "https://fcm.example/OLD", user_id: 99, is_active: false });

    const res = await post({
      oldEndpoint: "https://fcm.example/OLD",
      newSubscription: freshSubscription(),
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as { success: boolean; data: Record<string, unknown> };
    expect(body.success).toBe(true);
    expect(body.data.endpoint).toBe("https://fcm.example/FRESH");
    expect(body.data.is_active).toBe(true);

    expect(state.rows).toHaveLength(1);
    const row = state.rows[0];
    expect(row.id).toBe(41);
    expect(row.endpoint).toBe("https://fcm.example/FRESH");
    expect(row.p256dh_key).toBe("new-p256dh");
    expect(row.auth_key).toBe("new-auth");
    expect(row.is_active).toBe(true);
    // The security line: an anonymous caller can move KEYS, never the inbox.
    expect(row.user_id).toBe(99);
  });

  it("404s when no row matches the old endpoint (nothing to rotate)", async () => {
    const res = await post({
      oldEndpoint: "https://fcm.example/UNKNOWN",
      newSubscription: freshSubscription(),
    });

    expect(res.status).toBe(404);
    const body = (await res.json()) as { success: boolean };
    expect(body.success).toBe(false);
    expect(state.rows).toHaveLength(0);
  });

  it("merges a successor that already exists instead of tripping the unique index", async () => {
    seed({ id: 41, endpoint: "https://fcm.example/OLD", user_id: 99 });
    seed({ id: 77, endpoint: "https://fcm.example/FRESH", user_id: 99, is_active: true });

    const res = await post({
      oldEndpoint: "https://fcm.example/OLD",
      newSubscription: freshSubscription(),
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as { data: { id: number; endpoint: string } };
    expect(body.data.id).toBe(77);

    // One row left: the live endpoint — the replaced row is dropped.
    expect(state.rows).toHaveLength(1);
    expect(state.rows[0].id).toBe(77);
    expect(state.rows[0].p256dh_key).toBe("new-p256dh");
    expect(state.rows[0].is_active).toBe(true);
  });
});

describe("POST /api/push/update — authenticated registration", () => {
  it("registers the fresh subscription under the signed-in user when no oldEndpoint is carried", async () => {
    const token = await signAccessToken(5);

    const res = await post({ newSubscription: freshSubscription() }, token);

    expect(res.status).toBe(200);
    expect(state.rows).toHaveLength(1);
    expect(state.rows[0].user_id).toBe(5);
    expect(state.rows[0].endpoint).toBe("https://fcm.example/FRESH");
    expect(state.rows[0].is_active).toBe(true);
  });

  it("hands the old row over to the signed-in user (same device, new account)", async () => {
    seed({ id: 41, endpoint: "https://fcm.example/OLD", user_id: 99 });
    const token = await signAccessToken(5);

    const res = await post(
      { oldEndpoint: "https://fcm.example/OLD", newSubscription: freshSubscription() },
      token
    );

    expect(res.status).toBe(200);
    expect(state.rows).toHaveLength(1);
    expect(state.rows[0].id).toBe(41);
    expect(state.rows[0].user_id).toBe(5);
  });
});

describe("POST /api/push/update — payload validation", () => {
  it("400s when newSubscription is missing entirely", async () => {
    const res = await post({ oldEndpoint: "https://fcm.example/OLD" });

    expect(res.status).toBe(400);
    const body = (await res.json()) as { success: boolean; message: string };
    expect(body.success).toBe(false);
    expect(body.message).toContain("new subscription");
  });

  it("400s when the encryption keys are missing (an unusable subscription)", async () => {
    seed({ id: 41, endpoint: "https://fcm.example/OLD" });

    const res = await post({
      oldEndpoint: "https://fcm.example/OLD",
      newSubscription: { endpoint: "https://fcm.example/FRESH" },
    });

    expect(res.status).toBe(400);
    const body = (await res.json()) as { message: string };
    expect(body.message).toContain("p256dh_key");
    // The stale row stays untouched — a bad payload must not half-rotate.
    expect(state.rows[0].endpoint).toBe("https://fcm.example/OLD");
  });

  it("400s when the endpoint is not a URL", async () => {
    seed({ id: 41, endpoint: "https://fcm.example/OLD" });

    const res = await post({
      oldEndpoint: "https://fcm.example/OLD",
      newSubscription: { ...freshSubscription("not-a-url"), keys: { p256dh: "k", auth: "a" } },
    });

    expect(res.status).toBe(400);
    expect(state.rows[0].endpoint).toBe("https://fcm.example/OLD");
  });
});
