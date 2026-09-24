import { describe, it, expect } from "vitest";
import { homeForRole, roleOwnsPath } from "../components/guards";

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
