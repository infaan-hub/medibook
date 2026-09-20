/**
 * Route guards (§54 — authentication guard + role-based routing).
 *
 * RequireAuth  — authed users only; remembers the intended URL for post-login.
 * RequireGuest — signed-out users only (login/register/reset screens).
 * RequireRole  — restricts a subtree to one role (admin dashboard).
 */

import type { ReactNode } from "react";
import { Navigate, Outlet, useLocation } from "react-router-dom";
import { Spinner } from "./ui";
import { useSession } from "../state/app-context";

/** Centered full-area spinner shown while the session boot probe runs. */
export function BootScreen() {
  return (
    <div className="boot-screen" role="status" aria-label="Checking your session">
      <Spinner size={32} />
      <p>Checking your session…</p>
    </div>
  );
}

export function RequireAuth({ children }: { children?: ReactNode }) {
  const { status } = useSession();
  const location = useLocation();

  if (status === "booting") return <BootScreen />;
  if (status !== "authed") {
    return (
      <Navigate
        to="/login"
        replace
        state={{ from: `${location.pathname}${location.search}` }}
      />
    );
  }
  return children ? <>{children}</> : <Outlet />;
}

export function RequireGuest({ children }: { children?: ReactNode }) {
  const { status } = useSession();

  if (status === "booting") return <BootScreen />;
  // Never bounce an authed session to role pages from here: login/register
  // navigate explicitly to the role dashboard; this only blocks guests-in.
  if (status === "authed") return <Navigate to="/" replace />;
  return children ? <>{children}</> : <Outlet />;
}

type Role = "patient" | "doctor" | "admin";

/** Where a signed-in user belongs. No cross-role landing without a login. */
export function homeForRole(user: { role: Role; is_superuser: boolean }): string {
  if (user.role === "doctor") return "/doctor/dashboard";
  if (user.role === "admin" && user.is_superuser) return "/admin";
  return "/dashboard";
}

/** True when this path belongs to a role dashboard alien to the user. */
function isAlienRolePath(pathname: string, user: { role: Role; is_superuser: boolean }): boolean {
  if (pathname.startsWith("/admin")) {
    return !(user.role === "admin" && user.is_superuser);
  }
  if (pathname.startsWith("/doctor/")) {
    return user.role !== "doctor";
  }
  return false;
}

export function RequireRole({
  role,
  children,
}: {
  role: Role;
  children?: ReactNode;
}) {
  const { status, user } = useSession();

  if (status === "booting") return <BootScreen />;
  if (status !== "authed" || !user) {
    return <Navigate to="/login" replace />;
  }
  // Signed in but wrong role: bounce straight to YOUR dashboard, never
  // another role's page. No role-hopping without a fresh login.
  if (user.role !== role || (role === "admin" && !user.is_superuser)) {
    return <Navigate to={homeForRole(user)} replace />;
  }
  return children ? <>{children}</> : <Outlet />;
}

/**
 * Patient-only areas (dashboard, find-a-doctor, booking, settings…).
 * Doctors/admins landing here are bounced to their own dashboard so
 * roles never bleed into each other.
 */
export function RequirePatient({ children }: { children?: ReactNode }) {
  const { status, user } = useSession();
  const location = useLocation();

  if (status === "booting") return <BootScreen />;
  if (status !== "authed" || !user) {
    return (
      <Navigate
        to="/login"
        replace
        state={{ from: `${location.pathname}${location.search}` }}
      />
    );
  }
  if (user.role !== "patient" || isAlienRolePath(location.pathname, user)) {
    return <Navigate to={homeForRole(user)} replace />;
  }
  return children ? <>{children}</> : <Outlet />;
}