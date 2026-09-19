/**
 * Typed auth API functions (§27 routes, §28 envelope).
 * Every function returns the unwrapped envelope; failures throw ApiError.
 */

import { apiGet, apiPatch, apiPost } from "./client";
import type {
  AuthPayload,
  ChangePasswordPayload,
  Envelope,
  RegisterPayload,
  ResetConfirmPayload,
  User,
} from "./types";

/** POST /api/auth/register/ — creates the account and returns the JWT pair. */
export function register(payload: RegisterPayload): Promise<Envelope<AuthPayload>> {
  return apiPost<AuthPayload>("/auth/register/", payload);
}

/** POST /api/auth/login/ — username + password → JWT pair + user. */
export function login(username: string, password: string): Promise<Envelope<AuthPayload>> {
  return apiPost<AuthPayload>("/auth/login/", { username, password });
}

/** POST /api/auth/logout/ — blacklists the given refresh token. */
export function logout(refresh: string): Promise<Envelope<null>> {
  return apiPost<null>("/auth/logout/", { refresh });
}

/** GET /api/auth/me/ — current user (401 triggers the interceptor refresh). */
export function getMe(): Promise<Envelope<User>> {
  return apiGet<User>("/auth/me/");
}

/** PATCH /api/auth/me/ — update own profile fields (email/role read-only). */
export function updateMe(
  patch: Partial<Pick<User, "first_name" | "last_name" | "phone">>
): Promise<Envelope<User>> {
  return apiPatch<User>("/auth/me/", patch);
}

/** POST /api/auth/password-change/ — authenticated password change. */
export function changePassword(payload: ChangePasswordPayload): Promise<Envelope<null>> {
  return apiPost<null>("/auth/password-change/", payload);
}

/** POST /api/auth/password-reset/ — neutral request response (§36). */
export function requestPasswordReset(email: string): Promise<Envelope<null>> {
  return apiPost<null>("/auth/password-reset/", { email });
}

/** POST /api/auth/password-reset-confirm/ — set the new password. */
export function confirmPasswordReset(payload: ResetConfirmPayload): Promise<Envelope<null>> {
  return apiPost<null>("/auth/password-reset-confirm/", payload);
}

/** POST /api/auth/verify-email/ — confirm email ownership (single-use token). */
export function verifyEmail(token: string): Promise<Envelope<{ user: User }>> {
  return apiPost<{ user: User }>("/auth/verify-email/", { token });
}

/** POST /api/auth/resend-verification/ — neutral response (§36). */
export function resendVerification(email: string): Promise<Envelope<null>> {
  return apiPost<null>("/auth/resend-verification/", { email });
}