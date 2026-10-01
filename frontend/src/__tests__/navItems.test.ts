/**
 * Navigation entries per role â€” sidebar (`navItemsFor`) and mobile bottom bar
 * (`bottomNavItemsFor`).
 *
 * The sidebar "Profile" button (generic Lucide `User` icon) was removed for
 * every role (admin, doctor, patient): `/profile` is already the destination of
 * the sidebar footer user card (avatar / initials + name + role), so the extra
 * generic-icon entry was redundant. The mobile bottom bar keeps its Profile
 * slot â€” that is the only place the real `profile_image` is shown.
 */
import { describe, expect, it } from "vitest";
import { bottomNavItemsFor, navItemsFor } from "../components/AppShell";
import type { User } from "../api/types";

const base: User = {
  id: 2,
  username: "patient",
  email: "p@x.test",
  first_name: "Amani",
  last_name: "Juma",
  role: "patient",
  phone: "",
  is_superuser: false,
  profile_image: null,
  date_joined: null,
};

const patient: User = base;
const doctor: User = { ...base, id: 3, username: "doctor", role: "doctor" };
const admin: User = { ...base, id: 1, username: "admin", role: "admin", is_superuser: true };

const sidebarByRole = {
  patient: navItemsFor(patient).map((i) => i.to),
  doctor: navItemsFor(doctor).map((i) => i.to),
  admin: navItemsFor(admin).map((i) => i.to),
};

describe("sidebar navigation â€” no Profile button for any role", () => {
  it("drops the Lucide-icon Profile entry for admin, doctor and patient", () => {
    for (const user of [patient, doctor, admin]) {
      const items = navItemsFor(user);
      expect(items.some((i) => i.to === "/profile"), `${user.role} sidebar route`).toBe(false);
      expect(items.some((i) => i.label === "Profile"), `${user.role} sidebar label`).toBe(false);
    }
  });

  it("keeps every other sidebar entry for each role", () => {
    expect(sidebarByRole.patient).toEqual([
      "/dashboard",
      "/doctors",
      "/appointments",
      "/emergency",
      "/settings",
      "/notifications",
    ]);
    expect(sidebarByRole.doctor).toEqual([
      "/doctor/dashboard",
      "/doctor/personal",
      "/doctor/appointments",
      "/doctor/emergency",
      "/doctor/medical-treatment",
      "/doctor/health-tips",
      "/notifications",
    ]);
    expect(sidebarByRole.admin).toEqual([
      "/admin",
      "/admin/users",
      "/admin/users/new",
      "/admin/doctors",
      "/admin/doctors/new",
      "/admin/appointments",
      "/notifications",
      "/admin/audit",
    ]);
  });

  it("leaves the doctor's personal card entry untouched (different page)", () => {
    expect(navItemsFor(doctor).some((i) => i.to === "/doctor/personal" && i.label === "My card")).toBe(
      true
    );
  });
});

describe("mobile bottom bar â€” Profile slot kept where it existed", () => {
  it("still exposes /profile for admin and doctor (photo item)", () => {
    expect(bottomNavItemsFor(admin).map((i) => i.to)).toContain("/profile");
    expect(bottomNavItemsFor(doctor).map((i) => i.to)).toContain("/profile");
  });

  it("keeps the patient bottom bar profile-free, with 5 slots per role", () => {
    expect(bottomNavItemsFor(patient).some((i) => i.to === "/profile")).toBe(false);
    expect(bottomNavItemsFor(patient)).toHaveLength(5);
    expect(bottomNavItemsFor(doctor)).toHaveLength(5);
    expect(bottomNavItemsFor(admin)).toHaveLength(5);
  });
});
