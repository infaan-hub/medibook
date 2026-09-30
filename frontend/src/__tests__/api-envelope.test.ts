/**
 * §28 envelope guard (client.ts) — a response that is not the API envelope
 * (e.g. an HTML page from a misdeployed backend) must surface as a readable
 * ApiError instead of crashing a screen with "… is not iterable".
 */
import { describe, expect, it } from "vitest";
import { ApiError, envelope } from "../api/client";
import type { Envelope } from "../api/types";

describe("envelope", () => {
  it("passes a well-formed envelope through untouched", () => {
    const body: Envelope<number[]> = { success: true, message: "", data: [1, 2] };
    expect(envelope(body, "/api/queue/", 200)).toBe(body);
  });

  it("rejects an HTML document (the misdeployed-backend trap)", () => {
    expect(() => envelope("<!DOCTYPE html><html></html>", "/api/queue/", 200)).toThrow(ApiError);
    expect(() => envelope("<!DOCTYPE html>", "/api/queue/", 200)).toThrow(
      /expected the API JSON envelope/
    );
  });

  it("rejects null, undefined and JSON without a success flag", () => {
    expect(() => envelope(null, "/api/vitals/", 200)).toThrow(ApiError);
    expect(() => envelope(undefined, "/api/vitals/", 200)).toThrow(ApiError);
    expect(() => envelope({ message: "oops" }, "/api/vitals/", 200)).toThrow(ApiError);
    expect(() => envelope("<html>", "/api/vitals/", 200)).toThrow(ApiError);
  });

  it("keeps the status so callers can branch on it", () => {
    try {
      envelope("<html>", "/api/prescriptions/", 200);
      expect.unreachable("should have thrown");
    } catch (error) {
      expect((error as ApiError).status).toBe(200);
    }
  });
});
