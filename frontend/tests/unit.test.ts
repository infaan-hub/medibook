import { describe, expect, it } from "vitest";
import { hashPassword, verifyPassword, validateNewPassword } from "@/lib/password";
import { slugify } from "@/services/content.service";
import { intParam } from "@/lib/route";

describe("password", () => {
  it("round-trips scrypt hashes", () => {
    const hash = hashPassword("Str0ng!Pass");
    expect(hash.startsWith("scrypt$")).toBe(true);
    expect(verifyPassword("Str0ng!Pass", hash)).toBe(true);
    expect(verifyPassword("wrong", hash)).toBe(false);
  });

  it("rejects weak passwords like Django validators", () => {
    expect(validateNewPassword("short")).toContain(
      "This password is too short. It must contain at least 8 characters."
    );
    expect(validateNewPassword("12345678")).toContain(
      "This password is too common."
    );
  });
});

describe("slugify", () => {
  it("creates url-safe slugs", () => {
    expect(slugify("Hello World!")).toBe("hello-world");
    expect(slugify("  Multi   Space  ")).toBe("multi-space");
  });
});

describe("intParam", () => {
  it("parses integers and rejects junk", () => {
    expect(intParam("42")).toBe(42);
    expect(intParam("me")).toBeNull();
    expect(intParam(null)).toBeNull();
    expect(intParam(undefined)).toBeNull();
  });
});
