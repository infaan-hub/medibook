/**
 * Typed auth API functions (§27 routes, §28 envelope).
 * Every function returns the unwrapped envelope; failures throw ApiError.
 */

import { apiGet, apiPatch, apiPost } from "./client";
import { http } from "./client";
import type {
  AuthPayload,
  ChangePasswordPayload,
  Envelope,
  LoginPushPayload,
  OtpChallengePayload,
  RegisterPayload,
  ResetConfirmPayload,
  User,
} from "./types";

/** POST /api/auth/register/ — creates the account and returns the JWT pair. */
export function register(payload: RegisterPayload): Promise<Envelope<AuthPayload>> {
  return apiPost<AuthPayload>("/auth/register/", payload);
}

/**
 * POST /api/auth/login/ — username + password → OTP challenge (no tokens).
 * `push` attaches this browser's subscription so the code can be web-pushed
 * to the requesting device; omitted entirely (not `undefined`-valued) when the
 * browser has none.
 */
export function login(
  username: string,
  password: string,
  push?: LoginPushPayload
): Promise<Envelope<AuthPayload | OtpChallengePayload>> {
  return apiPost<AuthPayload | OtpChallengePayload>("/auth/login/", {
    username,
    password,
    ...(push ? { push } : {}),
  });
}

/** POST /api/auth/login/verify/ — the OTP step → JWT pair + user. */
export function verifyLoginOtp(
  challenge: string,
  otp: string
): Promise<Envelope<AuthPayload>> {
  return apiPost<AuthPayload>("/auth/login/verify/", { challenge, otp });
}

/** POST /api/auth/social/ — Google OAuth login. */
export function socialLogin(
  provider: "google",
  token: string
): Promise<Envelope<AuthPayload>> {
  return apiPost<AuthPayload>("/auth/social/", { provider, token });
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

/** PATCH /api/auth/me/ — upload profile image (multipart/form-data). */
export function uploadProfileImage(file: File): Promise<Envelope<User>> {
  const form = new FormData();
  form.append("profile_image", file);
  return http
    .patch<Envelope<User>>("/auth/me/", form, {
      headers: { "Content-Type": "multipart/form-data" },
    })
    .then((r) => r.data);
}

/** PATCH /api/auth/me/ — remove profile image. */
export function removeProfileImage(): Promise<Envelope<User>> {
  return apiPatch<User>("/auth/me/", { profile_image: null });
}

/** POST /api/auth/password-change/ — authenticated password change. */
export function changePassword(payload: ChangePasswordPayload): Promise<Envelope<null>> {
  return apiPost<null>("/auth/password-change/", payload);
}

/**
 * POST /api/auth/password-reset/ — returns the single-use handle the forgot-
 * password screen carries straight into the new-password form (the UI never
 * asks the user to type a code). The emailed link still carries `?token=`.
 */
export function requestPasswordReset(
  email: string
): Promise<Envelope<{ reset_handle: string }>> {
  return apiPost<{ reset_handle: string }>("/auth/password-reset/", { email });
}

/** POST /api/auth/password-reset-confirm/ — set the new password. */
export function confirmPasswordReset(payload: ResetConfirmPayload): Promise<Envelope<null>> {
  return apiPost<null>("/auth/password-reset-confirm/", payload);
}

