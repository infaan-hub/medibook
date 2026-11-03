/**
 * Route guards (§54 — authentication guard + role-based routing).
 *
 * Rules enforced here (independent roles):
 *  - Guests never see app screens → /login (with intended URL).
 *  - After logout everyone lands on /login — never another role's home.
 *  - Refresh (boot probe) must restore the SAME session/role or drop to guest.
 *  - Wrong role on a path → bounce to THAT user's home, never another role's.
 *  - A doctor whose server-verified first-login setup is NOT complete may only
 *    use /doctor/onboarding and the few screens that finish it (it, My Doctor
 *    information, notifications, profile) until the server marks them complete.
 */

import type { ReactNode } from "react";
import { Navigate, Outlet, useLocation } from "react-router-dom";
import { Spinner } from "./ui";
import { useSession, type SessionStatus } from "../state/app-context";

export const LOGIN_PATH = "/login";

export type Role = "patient" | "doctor" | "admin";

export interface RoleUser {
  role: Role;
  is_superuser: boolean;
  /**
   * Doctor accounts only. `false` (explicitly) means the server has NOT yet
   * verified every first-login step. `undefined` — patients, older payloads —
   * is treated as "no unfinished setup", so nothing extra is ever enforced.
   */
  doctor_onboarding_completed?: boolean;
}

/** The mandatory first-login setup route for doctors. */
export const DOCTOR_ONBOARDING_PATH = "/doctor/onboarding";

/**
 * Paths an incomplete doctor may open. Everything else stays unreachable so a
 * half-set-up account can never appear in the directory, take bookings, etc.
 *  - /doctor/onboarding — the flow itself (its own guard entry point);
 *  - /doctor/personal    — reaches My Doctor information + profile picture;
 *  - /notifications      — the notification step, shared screen;
 *  - /profile            — shared profile, also uploads the profile picture.
 */
const DOCTOR_ONBOARDING_ALLOWLIST = [
  DOCTOR_ONBOARDING_PATH,
  "/doctor/personal",
  "/notifications",
  "/profile",
];

/**
 * True only for a doctor whose completion flag is explicitly `false` — i.e.
 * the server said setup is outstanding. Never true for guests, patients,
 * admins, or any user payload without the field.
 */
export function doctorOnboardingIncomplete(user: RoleUser): boolean {
  return user.role === "doctor" && user.doctor_onboarding_completed === false;
}

/** May an incomplete doctor open this path? */
export function doctorOnboardingAllowed(pathname: string): boolean {
  return DOCTOR_ONBOARDING_ALLOWLIST.some(
    (path) => pathname === path || pathname.startsWith(`${path}/`)
  );
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
  // An unfinished doctor starts — and restarts — at first-login setup.
  if (doctorOnboardingIncomplete(user)) return DOCTOR_ONBOARDING_PATH;
  if (user.role === "doctor") return "/doctor/dashboard";
  if (user.role === "admin" && user.is_superuser) return "/admin";
  // Admin without superuser (or patient) — shared profile is always safe
  // and never loops through RequirePatient.
  if (user.role === "admin") return "/profile";
  return "/dashboard";
}

/**
 * Destination for the unguarded root route (§21 onboarding, §54 auth).
 *
 *   signed in             → that role's home (onboarding/welcome never again)
 *   first ever visit      → /onboarding → /onboarding/welcome (sign up / sign in)
 *   signed out, seen before → /login
 *
 * `null` means "keep the splash" — the session boot probe has not finished yet.
 */
export function launchPath(
  status: SessionStatus,
  user: RoleUser | null,
  onboarded: boolean
): string | null {
  if (status === "booting") return null;
  if (status === "authed" && user) return homeForRole(user);
  return onboarded ? LOGIN_PATH : "/onboarding";
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
  // Doctor subtree before first-login setup is finished → only the setup
  // screens listed above are reachable.
  if (doctorOnboardingIncomplete(user) && !doctorOnboardingAllowed(location.pathname)) {
    return <Navigate to={DOCTOR_ONBOARDING_PATH} replace />;
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
  // First-login setup gate: an incomplete doctor is confined to the flow and
  // the screens that complete it (their home is DOCTOR_ONBOARDING_PATH, so a
  // deep link to e.g. /doctor/dashboard simply comes back here).
  if (
    doctorOnboardingIncomplete(user) &&
    !doctorOnboardingAllowed(location.pathname)
  ) {
    return <Navigate to={DOCTOR_ONBOARDING_PATH} replace />;
  }
  return children ? <>{children}</> : <Outlet />;
}
