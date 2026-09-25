import { describe, it, expect } from "vitest";
import { homeForRole, launchPath, roleOwnsPath } from "../components/guards";

describe("role isolation rules", () => {
  const patient = { role: "patient" as const, is_superuser: false };
  const doctor = { role: "doctor" as const, is_superuser: false };
  const admin = { role: "admin" as const, is_superuser: true };
  const staffAdmin = { role: "admin" as const, is_superuser: false };

  it("homes each role to its own dashboard only", () => {
    expect(homeForRole(patient)).toBe("/dashboard");
    expect(homeForRole(doctor)).toBe("/doctor/dashboard");
    expect(homeForRole(admin)).toBe("/admin");
    // Non-superuser admin never lands in patient /dashboard (avoids redirect loops).
    expect(homeForRole(staffAdmin)).toBe("/profile");
  });

  it("keeps /admin paths superuser-admin only", () => {
    expect(roleOwnsPath("/admin", admin)).toBe(true);
    expect(roleOwnsPath("/admin/users", admin)).toBe(true);
    expect(roleOwnsPath("/admin", doctor)).toBe(false);
    expect(roleOwnsPath("/admin", patient)).toBe(false);
    expect(roleOwnsPath("/admin", staffAdmin)).toBe(false);
  });

  it("keeps /doctor/* paths doctor-only", () => {
    expect(roleOwnsPath("/doctor/dashboard", doctor)).toBe(true);
    expect(roleOwnsPath("/doctor/personal", doctor)).toBe(true);
    expect(roleOwnsPath("/doctor/dashboard", patient)).toBe(false);
    expect(roleOwnsPath("/doctor/dashboard", admin)).toBe(false);
  });

  it("keeps patient booking/search paths patient-only", () => {
    for (const path of ["/dashboard", "/doctors", "/booking/1", "/appointments", "/settings"]) {
      expect(roleOwnsPath(path, patient)).toBe(true);
      expect(roleOwnsPath(path, doctor)).toBe(false);
      expect(roleOwnsPath(path, admin)).toBe(false);
    }
  });

  it("allows shared areas for every signed-in role", () => {
    for (const path of ["/profile", "/notifications", "/specialties", "/blog"]) {
      expect(roleOwnsPath(path, patient)).toBe(true);
      expect(roleOwnsPath(path, doctor)).toBe(true);
      expect(roleOwnsPath(path, admin)).toBe(true);
    }
  });
});

describe("launchPath (root route destination)", () => {
  const patient = { role: "patient" as const, is_superuser: false };
  const doctor = { role: "doctor" as const, is_superuser: false };
  const admin = { role: "admin" as const, is_superuser: true };

  it("keeps the splash while the session boot probe is running", () => {
    expect(launchPath("booting", null, true)).toBeNull();
    expect(launchPath("booting", patient, false)).toBeNull();
  });

  it("sends a signed-in user straight to their own home — never onboarding", () => {
    expect(launchPath("authed", patient, true)).toBe("/dashboard");
    expect(launchPath("authed", doctor, true)).toBe("/doctor/dashboard");
    expect(launchPath("authed", admin, true)).toBe("/admin");
    // A live session wins even on a first-ever visit (shared link + auto-login).
    expect(launchPath("authed", patient, false)).toBe("/dashboard");
  });

  it("sends a first-ever visitor to the onboarding carousel", () => {
    expect(launchPath("guest", null, false)).toBe("/onboarding");
  });

  it("sends a returning signed-out visitor to login", () => {
    expect(launchPath("guest", null, true)).toBe("/login");
  });
});
