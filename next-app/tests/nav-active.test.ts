/**
 * Sidebar active-navigation regression tests.
 *
 * Covers the shared active-route algorithm and its rendering through the
 * real `NavLinks` component (SSR render → parsed anchors), for the patient,
 * doctor, and admin sidebars plus the mobile bottom navigation:
 *
 *  - exactly ONE active item per route (never two prefix matches)
 *  - longest / most-specific route wins for nested paths
 *  - active state derives from the URL only (direct URL / refresh / Back /
 *    Forward all resolve the same pathname)
 *  - `aria-current` stays unique alongside the active class
 *  - CSS guards for active icon contrast and the active pill pairing
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { findActiveNavItem } from "@/ui/lib/nav-active";
import {
  NavLinks,
  bottomNavItemsFor,
  navItemsFor,
  type NavItem,
} from "@/ui/components/AppShell";
import type { User } from "@/ui/api/types";

const patient: User = {
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

const doctor: User = { ...patient, id: 3, username: "doctor", role: "doctor" };

const admin: User = { ...patient, id: 1, username: "admin", role: "admin", is_superuser: true };

interface RenderedAnchor {
  href: string;
  classes: string[];
  ariaCurrent?: string;
}

/** Render NavLinks at a pathname and parse the produced anchors. */
function renderNav(pathname: string, items: NavItem[], side = true): RenderedAnchor[] {
  const html = renderToStaticMarkup(
    createElement(
      MemoryRouter,
      { initialEntries: [pathname] },
      createElement(NavLinks, { items, side })
    )
  );
  return [...html.matchAll(/<a\s[^>]*>/g)].map((match) => {
    const tag = match[0];
    const href = /href="([^"]*)"/.exec(tag)?.[1] ?? "";
    const classes = /class="([^"]*)"/.exec(tag)?.[1]?.split(/\s+/) ?? [];
    const ariaCurrent = /aria-current="([^"]*)"/.exec(tag)?.[1];
    return { href, classes, ariaCurrent };
  });
}

function activeAnchors(pathname: string, items: NavItem[], side = true): RenderedAnchor[] {
  return renderNav(pathname, items, side).filter((a) =>
    a.classes.includes("nav-item--active")
  );
}

function activeHrefs(pathname: string, items: NavItem[], side = true): string[] {
  return activeAnchors(pathname, items, side).map((a) => a.href);
}

/** Every list × every item route must yield exactly one active + one aria-current. */
function expectExactlyOneActive(pathname: string, items: NavItem[], side = true): void {
  const anchors = renderNav(pathname, items, side);
  const active = anchors.filter((a) => a.classes.includes("nav-item--active"));
  const aria = anchors.filter((a) => a.ariaCurrent === "page");
  expect(active.map((a) => a.href), `active items at ${pathname}`).toHaveLength(1);
  expect(aria.map((a) => a.href), `aria-current at ${pathname}`).toHaveLength(1);
  expect(aria[0].href).toBe(active[0].href);
  if (side) {
    expect(active[0].classes).toContain("nav-item--side--active");
  } else {
    expect(active[0].classes).not.toContain("nav-item--side--active");
  }
}

const patientSidebar = navItemsFor(patient);
const doctorSidebar = navItemsFor(doctor);
const adminSidebar = navItemsFor(admin);
const patientBottom = bottomNavItemsFor(patient);
const doctorBottom = bottomNavItemsFor(doctor);
const adminBottom = bottomNavItemsFor(admin);

describe("findActiveNavItem — shared algorithm", () => {
  const adminItems = [
    { to: "/admin" },
    { to: "/admin/users" },
    { to: "/admin/appointments" },
  ];

  it("returns the exact match", () => {
    expect(findActiveNavItem("/admin/users", adminItems)).toBe("/admin/users");
  });

  it("prefers the longest / most specific match on nested routes", () => {
    expect(findActiveNavItem("/admin/users/12/edit", adminItems)).toBe("/admin/users");
    expect(findActiveNavItem("/admin/appointments", adminItems)).toBe("/admin/appointments");
    // /admin also prefix-matches — it must lose to the specific item.
    expect(findActiveNavItem("/admin/appointments", adminItems)).not.toBe("/admin");
  });

  it("only matches at segment boundaries (no careless includes/startsWith)", () => {
    expect(findActiveNavItem("/admins", adminItems)).toBeNull();
    expect(findActiveNavItem("/adminx/users", adminItems)).toBeNull();
  });

  it("normalizes trailing slashes from direct URLs", () => {
    expect(findActiveNavItem("/admin/users/", adminItems)).toBe("/admin/users");
    expect(findActiveNavItem("/admin//", adminItems)).toBe("/admin");
  });

  it("treats the root item as exact-only", () => {
    expect(findActiveNavItem("/", [{ to: "/" }])).toBe("/");
    expect(findActiveNavItem("/dashboard", [{ to: "/" }, { to: "/dashboard" }])).toBe(
      "/dashboard"
    );
    expect(findActiveNavItem("/dashboard", [{ to: "/" }])).toBeNull();
  });

  it("returns null when the route belongs to no nav item", () => {
    expect(findActiveNavItem("/booking/7", adminItems)).toBeNull();
    expect(findActiveNavItem("/admin", [])).toBeNull();
  });

  it("never returns two results for one pathname", () => {
    for (const path of ["/admin", "/admin/users", "/admin/users/3", "/admin/appointments/9"]) {
      const results = adminItems.filter((i) => i.to === findActiveNavItem(path, adminItems));
      expect(results.length).toBeLessThanOrEqual(1);
    }
  });
});

describe("patient sidebar — exactly one active item", () => {
  it("activates each listed route by itself", () => {
    for (const item of patientSidebar) expectExactlyOneActive(item.to, patientSidebar, true);
  });

  it("keeps only Doctors active inside a doctor detail route", () => {
    expect(activeHrefs("/doctors/12", patientSidebar)).toEqual(["/doctors"]);
  });

  it("keeps only Appointments active inside an appointment detail route", () => {
    expect(activeHrefs("/appointments/42", patientSidebar)).toEqual(["/appointments"]);
  });

  it("activates Emergency on /emergency", () => {
    expect(activeHrefs("/emergency", patientSidebar)).toEqual(["/emergency"]);
  });

  it("leaves zero items active for routes outside the sidebar (never two)", () => {
    expect(activeHrefs("/blog", patientSidebar)).toEqual([]);
  });
});

describe("doctor sidebar — exactly one active item", () => {
  it("activates each listed route by itself", () => {
    for (const item of doctorSidebar) expectExactlyOneActive(item.to, doctorSidebar, true);
  });

  it("keeps only Appointments under nested doctor appointment routes", () => {
    expect(activeHrefs("/doctor/appointments/9", doctorSidebar)).toEqual([
      "/doctor/appointments",
    ]);
  });

  it("activates Emergency on /doctor/emergency", () => {
    expect(activeHrefs("/doctor/emergency", doctorSidebar)).toEqual(["/doctor/emergency"]);
  });

  it("leaves zero active for unlisted doctor routes (visit history)", () => {
    expect(activeHrefs("/doctor/visit-history/5", doctorSidebar)).toEqual([]);
  });
});

describe("admin sidebar — nested prefixes must not stack", () => {
  it("activates each listed route by itself", () => {
    for (const item of adminSidebar) expectExactlyOneActive(item.to, adminSidebar, true);
  });

  it("/admin alone activates only Overview", () => {
    expect(activeHrefs("/admin", adminSidebar)).toEqual(["/admin"]);
  });

  it("/admin/appointments activates Appointments — NOT Overview", () => {
    expect(activeHrefs("/admin/appointments", adminSidebar)).toEqual(["/admin/appointments"]);
  });

  it("/admin/users/new activates only Add user (was 3 items under prefix matching)", () => {
    expect(activeHrefs("/admin/users/new", adminSidebar)).toEqual(["/admin/users/new"]);
  });

  it("/admin/users/12 activates only Users", () => {
    expect(activeHrefs("/admin/users/12", adminSidebar)).toEqual(["/admin/users"]);
  });

  it("/admin/doctors/7 activates only Doctors", () => {
    expect(activeHrefs("/admin/doctors/7", adminSidebar)).toEqual(["/admin/doctors"]);
  });

  it("/admin/audit activates only Audit log", () => {
    expect(activeHrefs("/admin/audit", adminSidebar)).toEqual(["/admin/audit"]);
  });
});

describe("mobile bottom navigation — exactly one active item", () => {
  it("activates each listed route by itself for every role", () => {
    for (const item of patientBottom) expectExactlyOneActive(item.to, patientBottom, false);
    for (const item of doctorBottom) expectExactlyOneActive(item.to, doctorBottom, false);
    for (const item of adminBottom) expectExactlyOneActive(item.to, adminBottom, false);
  });

  it("admin bottom: /admin/users/new activates Users only (not Overview)", () => {
    expect(activeHrefs("/admin/users/new", adminBottom, false)).toEqual(["/admin/users"]);
  });

  it("admin bottom: /admin/appointments falls back to Overview alone", () => {
    expect(activeHrefs("/admin/appointments", adminBottom, false)).toEqual(["/admin"]);
  });

  it("patient bottom: /blog activates Health Tips", () => {
    expect(activeHrefs("/blog", patientBottom, false)).toEqual(["/blog"]);
  });

  it("patient bottom: nested /doctors/3 activates Doctors", () => {
    expect(activeHrefs("/doctors/3", patientBottom, false)).toEqual(["/doctors"]);
  });
});

describe("direct URL / refresh / back-forward consistency", () => {
  const pathnames = [
    "/dashboard",
    "/doctors",
    "/doctors/5",
    "/appointments",
    "/emergency",
    "/profile",
    "/doctor/dashboard",
    "/doctor/appointments",
    "/admin",
    "/admin/users/new",
    "/admin/appointments",
  ];

  it("resolves the same single active item for every pathname, every render", () => {
    for (const pathname of pathnames) {
      const first = activeHrefs(pathname, patientSidebar, true);
      const second = activeHrefs(pathname, patientSidebar, true);
      expect(second, pathname).toEqual(first);
      const list = pathname.startsWith("/admin")
        ? adminSidebar
        : pathname.startsWith("/doctor")
          ? doctorSidebar
          : patientSidebar;
      const active = activeHrefs(pathname, list, true);
      expect(active.length, pathname).toBeLessThanOrEqual(1);
    }
  });
});

describe("active-state CSS — icon and indicator visibility", () => {
  const css = readFileSync(resolve(__dirname, "../ui/styles/shell.css"), "utf8");

  it("active side icons inherit the active item color (never white-on-white)", () => {
    expect(css).toMatch(
      /\.nav-item--side\.nav-item--active \.nav-item__icon[^{]*\{[^}]*color:\s*inherit/
    );
  });

  it("active icon rule wins over the white icon rule by specificity AND order", () => {
    const whiteIconRule = css.indexOf(".nav-item--side .nav-item__icon {");
    const activeIconRule = css.indexOf(".nav-item--side.nav-item--active .nav-item__icon");
    expect(whiteIconRule).toBeGreaterThan(-1);
    expect(activeIconRule).toBeGreaterThan(whiteIconRule);
  });

  it("active side pill pairs white background with the teal icon/text color", () => {
    expect(css).toMatch(
      /\.nav-item--side--active,\s*\.nav-item--side--active:hover\s*\{[^}]*background:\s*#fff;[^}]*color:\s*#09A99E/
    );
    // Drawer + admin contexts use the same white pill / teal ink pairing.
    const whitePillTealInk = css.match(/color:\s*#09A99E;\s*background:\s*#fff;/g) ?? [];
    expect(whitePillTealInk.length).toBeGreaterThanOrEqual(3);
  });

  it("bottom-nav active text uses the brand primary color", () => {
    expect(css).toMatch(/\.nav-item--active\s*\{[^}]*color:\s*var\(--color-primary\)/);
  });

  it("bottom-nav indicator bar renders in currentColor (visible against white bar)", () => {
    expect(css).toMatch(/\.nav-item__bar\s*\{[^}]*background:\s*currentColor/);
    expect(css).toMatch(/\.nav-item--active \.nav-item__bar\s*\{[^}]*opacity:\s*1/);
  });

  it("drawer active indicator is teal on the white pill (not white-on-white)", () => {
    const beforeRules =
      css.match(/\.nav-item--side\.nav-item--active::before\s*\{[^}]*\}/g) ?? [];
    expect(beforeRules.length).toBeGreaterThanOrEqual(2);
    for (const rule of beforeRules) {
      if (/background/.test(rule)) expect(rule).toMatch(/background:\s*#09A99E/);
    }
  });
});
