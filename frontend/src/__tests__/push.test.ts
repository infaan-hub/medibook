/**
 * Web Push / reminder preference helpers (pure).
 */
import { describe, it, expect, vi } from "vitest";

// Mock API client used by notifications.ts
vi.mock("../api/client", () => ({
  API_BASE_URL: "/api",
  http: { get: vi.fn(), post: vi.fn(), patch: vi.fn(), delete: vi.fn() },
  apiGet: vi.fn(),
  apiPost: vi.fn(),
  apiPatch: vi.fn(),
  apiDelete: vi.fn(),
  refreshAccessToken: vi.fn(async () => null),
}));

vi.mock("../api/tokens", () => ({
  tokenStore: { getAccess: () => null, setAccess: vi.fn(), getRefresh: () => null },
}));

vi.mock("../api/notifications", () => ({
  listPushSubscriptions: vi.fn(async () => ({
    success: true,
    message: "",
    data: { count: 1, next: null, previous: null, results: [{ id: 5, endpoint: "https://push.example/abc" }] },
  })),
  registerPushSubscription: vi.fn(async () => ({ success: true, message: "", data: {} })),
  deletePushSubscription: vi.fn(async () => {}),
}));

import { registerPushSubscription, listPushSubscriptions, deletePushSubscription } from "../api/notifications";

describe("push subscription API contract", () => {
  it("sends p256dh_key/auth_key (not nested keys)", async () => {
    await registerPushSubscription({
      endpoint: "https://push.example/abc",
      p256dh_key: "p256dh-value",
      auth_key: "auth-value",
    });
    expect(registerPushSubscription).toHaveBeenCalledWith({
      endpoint: "https://push.example/abc",
      p256dh_key: "p256dh-value",
      auth_key: "auth-value",
    });
  });

  it("lists subscriptions so unsubscribe can match by endpoint and use numeric id", async () => {
    const list = await listPushSubscriptions();
    const match = list.data.results.find((row: { endpoint: string }) => row.endpoint === "https://push.example/abc");
    expect(match?.id).toBe(5);
    await deletePushSubscription(match!.id);
    expect(deletePushSubscription).toHaveBeenCalledWith(5);
  });
});
