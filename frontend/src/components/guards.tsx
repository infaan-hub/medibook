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
  if (status === "authed") return <Navigate to="/" replace />;
  return children ? <>{children}</> : <Outlet />;
}

export function RequireRole({
  role,
  children,
}: {
  role: "patient" | "doctor" | "admin";
  children?: ReactNode;
}) {
  const { status, user } = useSession();

  if (status === "booting") return <BootScreen />;
  if (status !== "authed" || !user) {
    return <Navigate to="/login" replace />;
  }
  if (user.role !== role || (role === "admin" && !user.is_superuser)) {
    return <Navigate to="/" replace />;
  }
  return children ? <>{children}</> : <Outlet />;
}