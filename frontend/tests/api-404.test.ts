/**
 * Unknown /api/* paths must answer with the §28 JSON 404 — never the SPA's
 * HTML page (that silently turns a missing route into a client crash).
 */
import { describe, expect, it } from "vitest";
import { GET, POST, DELETE } from "@/app/api/[...slug]/route";

describe("api catch-all", () => {
  it("returns a JSON 404 envelope for unknown API paths", async () => {
    const res = await GET(new Request("https://example.test/api/does-not-exist/"));
    expect(res.status).toBe(404);
    expect(res.headers.get("content-type")).toContain("application/json");
    const body = await res.json();
    expect(body).toMatchObject({
      success: false,
      message: "The requested resource was not found.",
      errors: {},
    });
  });

  it("answers every method the same way", async () => {
    for (const fn of [POST, DELETE]) {
      const res = await fn(new Request("https://example.test/api/queue/", { method: "POST" }));
      expect(res.status).toBe(404);
      expect((await res.json()).success).toBe(false);
    }
  });

  it("still stamps the security headers", async () => {
    const res = await GET(new Request("https://example.test/api/typo/"));
    expect(res.headers.get("x-content-type-options")).toBe("nosniff");
    expect(res.headers.get("x-frame-options")).toBe("DENY");
  });
});
