import { describe, it, expect } from "vitest";
import { realtime, __test, FALLBACK_POLL_INTERVAL_MS } from "../realtime/socket";

const { entityKey, RealtimeClient } = __test;

describe("realtime envelope ordering", () => {
  it("entityKey uses event prefix + entity id", () => {
    expect(entityKey("appointment.updated", 42)).toBe("appointment:42");
    expect(entityKey("notification.created", "9")).toBe("notification:9");
    expect(entityKey("doctor.availability.updated", "doc-1-2026-01-01")).toBe("doctor:doc-1-2026-01-01");
    expect(entityKey("appointment.updated", null)).toBeNull();
    expect(entityKey("appointment.updated", undefined)).toBeNull();
  });

  it("drops duplicate envelope ids", () => {
    const client = new RealtimeClient();
    const events: string[] = [];
    const unsub = client.subscribe((event) => events.push(event));
    const frame = {
      id: "uuid-1",
      event: "appointment.updated",
      version: 1,
      entity_id: "1",
      payload: { id: 1 },
    };
    // Access private shouldDeliver via message simulation: use deliver through subscribe path
    // by calling the public test path: reset + double-deliver through private API cast.
    const anyClient = client as unknown as {
      deliver: (f: typeof frame) => void;
      shouldDeliver: (f: typeof frame) => boolean;
      resetOrderingState: () => void;
    };
    anyClient.resetOrderingState();
    expect(anyClient.shouldDeliver(frame)).toBe(true);
    expect(anyClient.shouldDeliver({ ...frame })).toBe(false);
    unsub();
  });

  it("drops stale versions for the same entity", () => {
    const client = new RealtimeClient() as unknown as {
      shouldDeliver: (f: Record<string, unknown>) => boolean;
      resetOrderingState: () => void;
    };
    client.resetOrderingState();
    const base = {
      id: "a",
      event: "appointment.updated",
      entity_id: "7",
      payload: {},
    };
    expect(client.shouldDeliver({ ...base, id: "v10", version: 10 })).toBe(true);
    expect(client.shouldDeliver({ ...base, id: "v9", version: 9 })).toBe(false);
    expect(client.shouldDeliver({ ...base, id: "v11", version: 11 })).toBe(true);
    expect(client.shouldDeliver({ ...base, id: "v10b", version: 10 })).toBe(false);
  });

  it("accepts equal versions as non-stale (at-least-once redelivery)", () => {
    const client = new RealtimeClient() as unknown as {
      shouldDeliver: (f: Record<string, unknown>) => boolean;
      resetOrderingState: () => void;
    };
    client.resetOrderingState();
    const frame = { id: "x1", event: "notification.created", entity_id: "3", version: 5, payload: {} };
    expect(client.shouldDeliver(frame)).toBe(true);
    // Same version but new id (redelivery of logical state) is allowed.
    expect(client.shouldDeliver({ ...frame, id: "x2" })).toBe(true);
  });

  it("delivers events to subscribers with meta", () => {
    const client = new RealtimeClient() as unknown as {
      deliver: (f: Record<string, unknown>) => void;
      resetOrderingState: () => void;
    };
    client.resetOrderingState();
    const seen: Array<{ event: string; version?: number }> = [];
    const unsub = (realtime as unknown as { subscribe: (h: (e: string, p: Record<string, unknown>, m?: { version?: number }) => void) => () => void }).subscribe(
      (event, _payload, meta) => seen.push({ event, version: meta?.version })
    );
    // Use local client's own subscribe
    unsub();
    const unsub2 = (client as unknown as { subscribe: (h: (e: string, p: Record<string, unknown>, m?: { version?: number }) => void) => () => void }).subscribe(
      (event, _payload, meta) => seen.push({ event, version: meta?.version })
    );
    client.deliver({
      id: "z",
      event: "appointment.updated",
      version: 42,
      entity_id: "1",
      payload: { id: 1 },
    });
    client.deliver({ id: "z", event: "appointment.updated", version: 42, entity_id: "1", payload: {} });
    client.deliver({ event: "connected", payload: {} });
    unsub2();
    expect(seen).toEqual([{ event: "appointment.updated", version: 42 }]);
  });
});

describe("fallback polling interval", () => {
  it("uses a low non-5s default", () => {
    expect(FALLBACK_POLL_INTERVAL_MS).toBeGreaterThanOrEqual(10_000);
  });
});

describe("realtime origin parsing", () => {
  const { parseRealtimeOrigin } = __test;

  it("strips every accepted scheme, not just ws(s)", () => {
    // Regression: the old regex only removed ws:// / wss://, so an https://
    // value split on "/" into the literal "https:" — which defeated the
    // .vercel.app check and produced "wss://https//host" (ERR_NAME_NOT_RESOLVED).
    for (const scheme of ["https", "http", "wss", "ws"]) {
      expect(parseRealtimeOrigin(`${scheme}://ws.example.com`)).toEqual({
        host: "ws.example.com",
        secure: scheme === "https" || scheme === "wss",
      });
    }
  });

  it("accepts a bare host and a trailing path without leaking them into the URL", () => {
    expect(parseRealtimeOrigin("ws.example.com")).toEqual({
      host: "ws.example.com",
      secure: false,
    });
    expect(parseRealtimeOrigin("https://ws.example.com/some/path")).toEqual({
      host: "ws.example.com",
      secure: true,
    });
  });

  it("recognises a Vercel host so realtime can bow out to polling", () => {
    expect(parseRealtimeOrigin("https://zan-medibook.vercel.app")?.host).toBe(
      "zan-medibook.vercel.app"
    );
    expect(parseRealtimeOrigin("wss://app.vercel.app")?.host).toBe("app.vercel.app");
  });

  it("returns null when unset so callers fall back to the page origin", () => {
    expect(parseRealtimeOrigin(undefined)).toBeNull();
    expect(parseRealtimeOrigin("")).toBeNull();
    expect(parseRealtimeOrigin("   ")).toBeNull();
  });

  it("never yields a host containing a scheme, so no URL can be double-prefixed", () => {
    for (const value of [
      "https://zan-medibook.vercel.app",
      "wss://realtime.example.com/",
      "realtime.example.com",
      "HTTP://Realtime.Example.COM",
    ]) {
      const host = parseRealtimeOrigin(value)?.host ?? "";
      expect(host, value).not.toContain("://");
      expect(host, value).not.toContain(":");
    }
  });
});
