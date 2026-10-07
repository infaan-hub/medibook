/**
 * Navigation entries per role â€” sidebar (`navItemsFor`) and mobile bottom bar
 * (`bottomNavItemsFor`).
 *
 * The sidebar "Profile" button (generic Lucide `User` icon) was removed for
 * every role (admin, doctor, patient): `/profile` is already the destination of
 * the sidebar footer user card (avatar / initials + name + role), so the extra
 * generic-icon entry was redundant. The mobile bottom bar carries the Profile
 * slot for every role — the patient bar swapped Health Tips for it, so the
 * real `profile_image` avatar now shows on all three phone bars.
 */
import { describe, expect, it } from "vitest";
import { activeNavTo, bottomNavItemsFor, navItemsFor } from "../components/AppShell";
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

describe("mobile bottom bar â€” Profile slot for every role (5 slots)", () => {
  it("exposes /profile for admin, doctor and patient (photo item)", () => {
    for (const user of [patient, doctor, admin]) {
      expect(bottomNavItemsFor(user).map((i) => i.to), user.role).toContain("/profile");
    }
  });

  it("patient order: Home, Doctors, Appointments, Emergency, Profile", () => {
    expect(bottomNavItemsFor(patient).map((i) => i.to)).toEqual([
      "/dashboard",
      "/doctors",
      "/appointments",
      "/emergency",
      "/profile",
    ]);
  });

  it("keeps 5 slots per role and drops Health Tips (/blog) from the patient bar", () => {
    expect(bottomNavItemsFor(patient)).toHaveLength(5);
    expect(bottomNavItemsFor(doctor)).toHaveLength(5);
    expect(bottomNavItemsFor(admin)).toHaveLength(5);
    expect(bottomNavItemsFor(patient).some((i) => i.to === "/blog")).toBe(false);
  });
});

describe("activeNavTo — exactly one active item per route", () => {
  const adminSidebar = navItemsFor(admin);
  const adminBottom = bottomNavItemsFor(admin);

  it("admin nested routes resolve to the deepest item, never a parent", () => {
    expect(activeNavTo(adminSidebar, "/admin")).toBe("/admin");
    expect(activeNavTo(adminSidebar, "/admin/users")).toBe("/admin/users");
    expect(activeNavTo(adminSidebar, "/admin/users/new")).toBe("/admin/users/new");
    expect(activeNavTo(adminSidebar, "/admin/doctors")).toBe("/admin/doctors");
    expect(activeNavTo(adminSidebar, "/admin/doctors/new")).toBe("/admin/doctors/new");
    expect(activeNavTo(adminSidebar, "/admin/audit")).toBe("/admin/audit");
  });

  it("resolves every admin route to a single item (no stacked highlights)", () => {
    const paths = [
      "/admin",
      "/admin/users",
      "/admin/users/new",
      "/admin/doctors",
      "/admin/doctors/new",
      "/admin/appointments",
      "/admin/audit",
      "/notifications",
    ];
    for (const path of paths) {
      const active = adminSidebar.filter((i) => activeNavTo(adminSidebar, path) === i.to);
      expect(active, path).toHaveLength(1);
    }
  });

  it("segment-safe: /admin/users does not claim an unrelated path", () => {
    expect(activeNavTo(adminSidebar, "/administrator")).toBeNull();
    expect(activeNavTo(adminSidebar, "/adminish")).toBeNull();
  });

  it("bottom bar keeps a single active slot on nested admin routes", () => {
    expect(activeNavTo(adminBottom, "/admin/users/new")).toBe("/admin/users");
    expect(activeNavTo(adminBottom, "/admin/audit")).toBe("/admin/audit");
  });

  it("patient and doctor detail routes keep their parent item active", () => {
    expect(activeNavTo(navItemsFor(patient), "/doctors/42")).toBe("/doctors");
    expect(activeNavTo(navItemsFor(doctor), "/doctor/visit-history/7")).toBeNull();
    expect(activeNavTo(navItemsFor(patient), "/appointments/9")).toBe("/appointments");
  });
});
