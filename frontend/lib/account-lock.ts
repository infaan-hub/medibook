/**
 * Account-lock policy — brute-force protection for sign-in.
 *
 * After MAX_LOGIN_ATTEMPTS consecutive failures on ONE account the account is
 * locked, and every sign-in path (password login, social login, token refresh)
 * plus password-reset confirm rejects it with HTTP 423 and the machine-readable
 * payload below. Role decides how the lock can end:
 *
 *   patient  TEMPORARY        auto-unlocks after PATIENT_LOCK_MS (2 minutes)
 *   doctor   ADMIN_REQUIRED   no deadline — only an administrator may unlock
 *   admin    ADMIN_TEMPORARY  auto-unlocks after ADMIN_LOCK_MS (15 minutes),
 *                             so a lockout can never permanently freeze the
 *                             platform's own admins out; another superuser may
 *                             also unlock one sooner.
 *
 * The SERVER is the single source of truth: the UI only renders what a 423
 * payload tells it (its countdown is derived from `locked_until`), a lock that
 * has passed its deadline is cleared lazily on the next attempt (no background
 * job), and opening the login page never counts as an attempt — only a wrong
 * password on an existing account does.
 *
 * Failure envelope (both codes travel in `data` so screens can branch):
 *   423 { code: "ACCOUNT_LOCKED",     role, requires_admin, locked_until,
 *                                      wait_seconds, remaining_attempts: 0 }
 *   400 { code: "INVALID_CREDENTIALS", remaining_attempts }   (existing account)
 *   400 no data                                                  (unknown user)
 */
import { ApiError, type FieldErrors } from "@/lib/errors";
import * as users from "@/repositories/users.repo";

/** Consecutive failures that trigger a lock (login + reset-confirm shared). */
export const MAX_LOGIN_ATTEMPTS = 3;
/** Patient (and other non-doctor/non-admin) temporary lock: 2 minutes. */
export const PATIENT_LOCK_MS = 2 * 60_000;
/** Admin temporary lock: 15 minutes — bounded, never permanent. */
export const ADMIN_LOCK_MS = 15 * 60_000;

export const LOCKED_CODE = "ACCOUNT_LOCKED";
export const INVALID_CREDENTIALS_CODE = "INVALID_CREDENTIALS";

export type LockReason = "TEMPORARY" | "ADMIN_REQUIRED" | "ADMIN_TEMPORARY";

/** The subset of a user row this policy reads. */
export interface LockFields {
  id: number;
  role: string;
  account_locked: boolean;
  locked_until: Date | null;
  lock_reason: string;
  failed_login_attempts: number;
}

export interface LockState {
  /** FALSE once a temporary lock's deadline has passed. */
  locked: boolean;
  /** TRUE when only an administrator can lift the lock. */
  requires_admin: boolean;
  locked_until: Date | null;
  /** Attempts left before the next failure locks the account. */
  remaining_attempts: number;
  role: string;
}

/** Role-specific lock decision taken when the attempt threshold is reached. */
export function lockPlan(role: string): { reason: LockReason; until: Date | null } {
  if (role === "doctor") return { reason: "ADMIN_REQUIRED", until: null };
  if (role === "admin") {
    return { reason: "ADMIN_TEMPORARY", until: new Date(Date.now() + ADMIN_LOCK_MS) };
  }
  return { reason: "TEMPORARY", until: new Date(Date.now() + PATIENT_LOCK_MS) };
}

/** TRUE when the row carries a temporary lock whose deadline has passed. */
export const hasExpiredLock = (
  user: Pick<LockFields, "account_locked" | "locked_until">
): boolean =>
  user.account_locked &&
  user.locked_until !== null &&
  user.locked_until.getTime() <= Date.now();

/** Effective lock state of a row — an expired temporary lock counts as free. */
export function lockState(user: LockFields): LockState {
  const locked = user.account_locked && !hasExpiredLock(user);
  return {
    locked,
    requires_admin: locked && user.lock_reason === "ADMIN_REQUIRED",
    locked_until: locked ? user.locked_until : null,
    remaining_attempts: Math.max(0, MAX_LOGIN_ATTEMPTS - user.failed_login_attempts),
    role: user.role,
  };
}

function formatWait(seconds: number): string {
  if (seconds >= 60) {
    const minutes = Math.ceil(seconds / 60);
    return `${minutes} minute${minutes === 1 ? "" : "s"}`;
  }
  return `${seconds} second${seconds === 1 ? "" : "s"}`;
}

/**
 * The 423 an authenticated path answers with while an account is locked.
 * The message lands in `non_field_errors` (the banner the UI already renders)
 * and the structured copy rides in `data` for role-aware rendering.
 */
export function lockedError(user: LockFields): ApiError {
  const state = lockState(user);
  const waitSeconds = state.locked_until
    ? Math.max(1, Math.ceil((state.locked_until.getTime() - Date.now()) / 1000))
    : null;
  const message = state.requires_admin
    ? "This account is locked after too many failed sign-in attempts. An administrator must unlock it before you can sign in."
    : `Too many failed sign-in attempts. Try again in ${formatWait(waitSeconds ?? 0)}.`;
  const errors: FieldErrors = { non_field_errors: [message] };
  return new ApiError(423, message, errors, {
    code: LOCKED_CODE,
    role: state.role,
    requires_admin: state.requires_admin,
    locked_until: state.locked_until ? state.locked_until.toISOString() : null,
    wait_seconds: waitSeconds,
    remaining_attempts: 0,
  });
}

/**
 * Wrong password. The SAME message is used for an unknown username (with no
 * `data`, so nothing distinguishes it structurally), while an existing
 * account also reports how many tries remain before it locks — the server-
 * driven "attempts remaining" the login screen renders.
 */
export function invalidCredentialsError(user?: LockFields | null): ApiError {
  const message = "The username or password is incorrect.";
  const errors: FieldErrors = { non_field_errors: [message] };
  if (!user) return new ApiError(400, message, errors);
  return new ApiError(400, message, errors, {
    code: INVALID_CREDENTIALS_CODE,
    remaining_attempts: Math.max(0, MAX_LOGIN_ATTEMPTS - user.failed_login_attempts),
  });
}

/**
 * Enforcement pre-check shared by every sign-in path: clear an expired
 * temporary lock (lazy auto-unlock) and throw the 423 when the account is
 * still locked. Returns the effective row state to continue with — typed as
 * the caller's own row shape so password/role fields stay available.
 */
export async function enforceLock<T extends LockFields>(user: T): Promise<T> {
  if (!user.account_locked) return user;
  if (hasExpiredLock(user)) {
    await users.clearExpiredLock(user.id);
    return {
      ...user,
      account_locked: false,
      locked_until: null,
      lock_reason: "",
      failed_login_attempts: 0,
    } as T;
  }
  throw lockedError(user);
}

/**
 * Atomically record one failure (increment + lock at the threshold) and hand
 * back the committed row. Falls back to the pre-attempt row only if the
 * account vanished mid-request — the caller still reports a sane message
 * rather than a 500.
 */
export async function registerFailedAttempt(user: LockFields): Promise<LockFields> {
  const plan = lockPlan(user.role);
  const row = await users.recordFailedLogin(user.id, MAX_LOGIN_ATTEMPTS, plan.reason, plan.until);
  return row ?? user;
}

/** Data code carried by a rejected password (or reset) attempt. */
export const isLockedPayload = (data: Record<string, unknown> | undefined): boolean =>
  data?.code === LOCKED_CODE;
