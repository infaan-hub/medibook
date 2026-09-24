/**
 * Route guards (§54 — authentication guard + role-based routing).
 *
 * Rules enforced here (independent roles):
 *  - Guests never see app screens → /login (with intended URL).
 *  - After logout everyone lands on /login — never another role's home.
 *  - Refresh (boot probe) must restore the SAME session/role or drop to guest.
 *  - Wrong role on a path → bounce to THAT user's home, never another role's.
 */

import type { ReactNode } from "react";
import { Navigate, Outlet, useLocation } from "react-router-dom";
import { Spinner } from "./ui";
import { useSession } from "../state/app-context";

export const LOGIN_PATH = "/login";

export type Role = "patient" | "doctor" | "admin";

export interface RoleUser {
  role: Role;
  is_superuser: boolean;
}

/** Centered full-area spinner shown while the session boot probe runs. */
export function BootScreen() {
  return (
    <div className="boot-screen" role="status" aria-label="Checking your session">
      <Spinner size={32} />
      <p>Checking your session…</p>
    </div>
  );
}

/** Where a signed-in user belongs. No cross-role landing without a login. */
export function homeForRole(user: RoleUser): string {
  if (user.role === "doctor") return "/doctor/dashboard";
  if (user.role === "admin" && user.is_superuser) return "/admin";
  // Admin without superuser (or patient) — shared profile is always safe
  // and never loops through RequirePatient.
  if (user.role === "admin") return "/profile";
  return "/dashboard";
}

/**
 * Does this path belong to `user`'s role?
 * Shared areas (profile, notifications, catalog, blog) are open to every role.
 */
export function roleOwnsPath(pathname: string, user: RoleUser): boolean {
  if (pathname.startsWith("/admin")) {
    return user.role === "admin" && user.is_superuser;
  }
  if (pathname.startsWith("/doctor/")) {
    return user.role === "doctor";
  }
  const patientOnly = [
    "/dashboard",
    "/doctors",
    "/booking",
    "/appointments",
    "/reviews",
    "/settings",
  ];
  if (patientOnly.some((p) => pathname === p || pathname.startsWith(`${p}/`))) {
    return user.role === "patient";
  }
  return true;
}

function loginWithFrom(pathname: string, search: string) {
  const from = `${pathname}${search}`;
  return (
    <Navigate
      to={LOGIN_PATH}
      replace
      state={{ from }}
    />
  );
}

/** Authed users only; guests → /login remembering the intended URL. */
export function RequireAuth({ children }: { children?: ReactNode }) {
  const { status } = useSession();
  const location = useLocation();

  if (status === "booting") return <BootScreen />;
  if (status !== "authed") {
    return loginWithFrom(location.pathname, location.search);
  }
  return children ? <>{children}</> : <Outlet />;
}

/** Signed-out users only (login/register/reset). Authed → own role home. */
export function RequireGuest({ children }: { children?: ReactNode }) {
  const { status, user } = useSession();

  if (status === "booting") return <BootScreen />;
  // Never bounce an authed session to `/` (which could race); always the
  // role home. Login/register navigate explicitly after submit.
  if (status === "authed" && user) {
    return <Navigate to={homeForRole(user)} replace />;
  }
  return children ? <>{children}</> : <Outlet />;
}

/**
 * Restrict a subtree to one role.
 * Guest → /login; wrong role → that user's home (never another role's page).
 */
export function RequireRole({
  role,
  children,
}: {
  role: Role;
  children?: ReactNode;
}) {
  const { status, user } = useSession();
  const location = useLocation();

  if (status === "booting") return <BootScreen />;
  if (status !== "authed" || !user) {
    return loginWithFrom(location.pathname, location.search);
  }
  if (user.role !== role || (role === "admin" && !user.is_superuser)) {
    return <Navigate to={homeForRole(user)} replace />;
  }
  return children ? <>{children}</> : <Outlet />;
}

/** Patient-only areas. Doctors/admins → their own home. Guests → /login. */
export function RequirePatient({ children }: { children?: ReactNode }) {
  const { status, user } = useSession();
  const location = useLocation();

  if (status === "booting") return <BootScreen />;
  if (status !== "authed" || !user) {
    return loginWithFrom(location.pathname, location.search);
  }
  if (user.role !== "patient" || !roleOwnsPath(location.pathname, user)) {
    return <Navigate to={homeForRole(user)} replace />;
  }
  return children ? <>{children}</> : <Outlet />;
}

/**
 * Shell-level guard: must be signed in AND allowed on this path prefix.
 * Covers every authenticated route so roles never bleed into each other.
 */
export function RequireSession({ children }: { children?: ReactNode }) {
  const { status, user } = useSession();
  const location = useLocation();

  if (status === "booting") return <BootScreen />;
  if (status !== "authed" || !user) {
    return loginWithFrom(location.pathname, location.search);
  }
  if (!roleOwnsPath(location.pathname, user)) {
    return <Navigate to={homeForRole(user)} replace />;
  }
  return children ? <>{children}</> : <Outlet />;
}
