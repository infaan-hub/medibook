/**
 * Auth service — registration, login, logout, refresh, password flows
 * (port of accounts/views.py + serializers.py).
 */
import { randomBytes, randomInt } from "node:crypto";
import { ApiError, ValidationError, nonFieldError, unauthorized } from "@/lib/errors";
import {
  enforceLock,
  hasExpiredLock,
  invalidCredentialsError,
  lockedError,
  registerFailedAttempt,
} from "@/lib/account-lock";
import { signAccessToken, signRefreshToken, verifyRefreshToken } from "@/lib/jwt";
import { hashPassword, isDjangoHash, validateNewPassword, verifyPassword } from "@/lib/password";
import { passwordResetMail, loginOtpMail, sendMail } from "@/lib/mail";
import { notify } from "@/lib/notify";
import { createPush } from "./notification.service";
import * as users from "@/repositories/users.repo";
import * as doctors from "@/repositories/doctors.repo";
import type { AuthUser } from "@/lib/auth";
import {
  loginOtpVerifySchema,
  loginSchema,
  logoutSchema,
  passwordChangeSchema,
  passwordResetConfirmSchema,
  passwordResetRequestSchema,
  registerSchema,
  type LoginInput,
  type LoginOtpVerifyInput,
  type RegisterInput,
} from "@/validators/auth";
import { parse } from "@/validators/base";

const PHONE_PATTERN = /^\+?[0-9]{7,15}$/;
const refreshLifetimeMs = () => Number(process.env.JWT_REFRESH_DAYS ?? 7) * 86_400_000;

/** Issues an access + refresh pair and records the refresh jti (rotation). */
export async function issuePair(userId: number): Promise<{ access: string; refresh: string }> {
  const jti = randomBytes(16).toString("hex");
  const access = await signAccessToken(userId);
  const refresh = await signRefreshToken(userId, jti);
  await users.createRefreshJti(userId, jti, new Date(Date.now() + refreshLifetimeMs()));
  return { access, refresh };
}

/** POST /api/auth/register/ — self-registration + JWT pair (201). */
export async function register(body: unknown): Promise<{ user: AuthUser; pair: { access: string; refresh: string } }> {
  const input = parse(registerSchema, body) as RegisterInput;
  if (await users.usernameExistsIexact(input.username)) {
    throw new ValidationError({ username: ["This username is already taken."] });
  }
  const email = input.email.trim().toLowerCase(); // RegisterSerializer.validate_email
  if (await users.emailExistsExact(email)) {
    // Django full_clean raised a 500 here; we answer with the admin serializer's
    // wording instead of crashing — documented deviation.
    throw new ValidationError({ email: ["A user with this email already exists."] });
  }
  if (input.password !== input.password_confirm) {
    throw new ValidationError({ password_confirm: ["The two passwords do not match."] });
  }
  const pwErrors = validateNewPassword(input.password);
  if (pwErrors.length > 0) throw new ValidationError({ password: pwErrors });
  if (input.phone && !PHONE_PATTERN.test(input.phone)) {
    throw new ValidationError({
      phone: ["Enter a valid phone number (7-15 digits, optional leading +)."],
    });
  }
  const role = input.role ?? "patient";
  const user = await users.createUser({
    username: input.username,
    email,
    password: hashPassword(input.password),
    phone: input.phone ?? "",
    first_name: input.first_name ?? "",
    last_name: input.last_name ?? "",
    role,
  });
  if (role === "doctor" && !(await doctors.doctorExists(user.id))) {
    await doctors.createDoctor(user.id); // Doctor.objects.get_or_create(user=user)
  }
  return { user, pair: await issuePair(user.id) };
}

/** Login second factor: code life and per-challenge guess budget. */
export const LOGIN_OTP_TTL_MS = 5 * 60_000;
export const LOGIN_OTP_MAX_ATTEMPTS = 3;

/** A login either stops at the OTP challenge or hands back the full session. */
export type LoginResult =
  | {
      otpRequired: true;
      challenge: string;
      expiresInSeconds: number;
      /** The code went out by email too — the channel that reaches EVERY device. */
      emailSent: boolean;
      /** Masked target (j***@example.com) so the OTP screen says where to look. */
      emailHint: string | null;
    }
  | { otpRequired: false; user: AuthUser; pair: { access: string; refresh: string } };

/** j***@example.com — recognizable to their owner, useless for harvesting. */
function maskEmail(email: string): string {
  const at = email.indexOf("@");
  if (at <= 0) return email;
  return `${email[0]}***${email.slice(at)}`;
}

/**
 * POST /api/auth/login/ — username + password → OTP challenge.
 *
 * The password step never issues tokens anymore: it proves the secret, resets
 * the failed-attempt budget, and answers with an opaque challenge. The JWT
 * pair only comes from verifyLoginOtp() once the code is typed back.
 */
export async function login(body: unknown): Promise<LoginResult> {
  const input = parse(loginSchema, body) as LoginInput;
  const found = await users.findUserByUsername(input.username); // exact match (ModelBackend)
  // Unknown account: same message as a wrong password, no lock data — never
  // confirm whether the username exists.
  if (!found) throw invalidCredentialsError();
  // Lock first: a locked account rejects even a correct password (423), and an
  // expired temporary lock is cleared here before the attempt counts.
  const user = await enforceLock(found);
  if (!verifyPassword(input.password, user.password)) {
    const failed = await registerFailedAttempt(user);
    if (failed.account_locked && !hasExpiredLock(failed)) throw lockedError(failed);
    throw invalidCredentialsError(failed);
  }
  if (!user.is_active) throw nonFieldError("This account has been deactivated.");
  // Progressive hash upgrade: Django PBKDF2 rows → scrypt after a valid login.
  if (isDjangoHash(user.password)) {
    await users.updateUser(user.id, { password: hashPassword(input.password) });
  }
  // A successful authentication starts the attempt budget over; the lock
  // fields themselves are already clear (enforceLock threw otherwise).
  await users.resetFailedLogins(user.id);
  // The login screen has no session, so the usual subscription-sync endpoint
  // can't run yet — the password request itself carries the requesting
  // browser's subscription. Upsert it BEFORE the code goes out (same
  // idempotency/reassignment policy as POST /notifications/push-subscriptions/)
  // so notify()'s web-push leg has a device to deliver to. Only reachable
  // with a CORRECT password. Best-effort: a bad payload or push hiccup must
  // never deny the login — worst case the code rides the inbox row alone.
  if (input.push !== undefined) {
    try {
      await createPush({ id: user.id } as AuthUser, input.push);
    } catch (error) {
      console.warn("[push] login-time subscription registration failed:", error);
    }
  }
  const { challenge, emailSent } = await issueLoginOtp(user);
  return {
    otpRequired: true,
    challenge,
    expiresInSeconds: LOGIN_OTP_TTL_MS / 1000,
    emailSent,
    emailHint: emailSent ? maskEmail(user.email) : null,
  };
}

/**
 * Issue the one-time code for a password-accepted login: replace any earlier
 * challenge (one active row per user), store only its scrypt hash, and
 * deliver the code through THREE channels — inbox row + web push (notify())
 * and EMAIL, which reaches every device including iOS Safari tabs where
 * Apple only allows Web Push inside the installed Home Screen app. Delivery
 * is best-effort: the challenge already exists, so a transient push or mail
 * failure must not deny login; the user re-sends by signing in again.
 */
async function issueLoginOtp(user: {
  id: number;
  email: string;
  first_name: string;
  username: string;
}): Promise<{ challenge: string; emailSent: boolean }> {
  const challenge = randomBytes(32).toString("hex");
  const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
  await users.deleteLoginOtpsForUser(user.id);
  await users.purgeExpiredLoginOtps(new Date(Date.now() - 86_400_000));
  await users.createLoginOtp({
    user_id: user.id,
    challenge,
    code_hash: hashPassword(code),
    expires_at: new Date(Date.now() + LOGIN_OTP_TTL_MS),
  });
  try {
    await notify(
      user.id,
      "system",
      `Your MediBook login code is ${code}. It expires in ${LOGIN_OTP_TTL_MS / 60_000} minutes.`,
      null,
      "Login code"
    );
  } catch (error) {
    console.error("[auth] login code delivery failed:", error);
  }
  let emailSent = false;
  try {
    await sendMail(loginOtpMail(user, code, LOGIN_OTP_TTL_MS / 60_000));
    emailSent = true;
  } catch (error) {
    console.warn("[auth] login code email failed:", error);
  }
  return { challenge, emailSent };
}

/**
 * POST /api/auth/login/verify/ — the OTP step: check the typed code against
 * the challenge the password step issued, then hand back the JWT pair.
 *
 * A wrong guess costs one attempt on THIS challenge (three burn it) — never a
 * failed sign-in on the account, so OTP typos can't lock anyone out. Unknown,
 * expired, burned and wrong codes all answer with the same field error, so
 * the response never confirms which one it was.
 */
export async function verifyLoginOtp(
  body: unknown
): Promise<{ user: AuthUser; pair: { access: string; refresh: string } }> {
  const input = parse(loginOtpVerifySchema, body) as LoginOtpVerifyInput;
  const rejected = () =>
    new ValidationError(
      { otp: ["The code is incorrect or expired."] },
      "The code is incorrect or expired."
    );
  const row = await users.findLoginOtp(input.challenge);
  if (!row || row.expires_at.getTime() <= Date.now() || row.attempts >= LOGIN_OTP_MAX_ATTEMPTS) {
    throw rejected();
  }
  if (!verifyPassword(input.otp, row.code_hash)) {
    const attempts = row.attempts + 1;
    if (attempts >= LOGIN_OTP_MAX_ATTEMPTS) await users.deleteLoginOtp(row.challenge);
    else await users.updateLoginOtpAttempts(row.challenge, attempts);
    throw rejected();
  }
  await users.deleteLoginOtp(row.challenge); // single-use: success consumes it
  const found = await users.findUserById(row.user_id);
  if (!found) throw rejected();
  const user = await enforceLock(found); // an admin may have locked mid-challenge
  if (!user.is_active) throw nonFieldError("This account has been deactivated.");
  return { user, pair: await issuePair(user.id) };
}

/** POST /api/auth/token/refresh/ — rotate refresh token (SimpleJWT semantics). */
export async function refresh(body: unknown): Promise<{ access: string; refresh: string }> {
  const parsed = parse(logoutSchema, body);
  const claims = await verifyRefreshToken(parsed.refresh); // 401 on bad/expired
  const row = claims.jti ? await users.findRefreshJti(claims.jti) : null;
  if (!row || row.revoked_at) throw unauthorized("Token is invalid or expired");
  if (row.expires_at.getTime() < Date.now()) throw unauthorized("Token is expired");
  const user = await users.findUserById(Number(claims.sub));
  if (!user) throw unauthorized("Token is invalid or expired");
  // A lock must not be bypassable by an already-issued refresh token.
  await enforceLock(user);
  await users.revokeRefreshJti(row.jti); // BLACKLIST_AFTER_ROTATION
  return issuePair(user.id);
}

/** POST /api/auth/logout/ — blacklist the given refresh token (LogoutView). */
export async function logout(body: unknown): Promise<void> {
  const parsed = parse(logoutSchema, body);
  try {
    const claims = await verifyRefreshToken(parsed.refresh);
    const row = claims.jti ? await users.findRefreshJti(claims.jti) : null;
    if (!row || row.revoked_at) throw new Error("blacklisted");
    await users.revokeRefreshJti(row.jti);
  } catch {
    throw new ValidationError(
      { refresh: ["The refresh token is invalid or has expired."] },
      "The refresh token is invalid or has expired."
    );
  }
}

/** POST /api/auth/password-change/ — authenticated password change. */
export async function passwordChange(user: AuthUser, body: unknown): Promise<void> {
  const input = parse(passwordChangeSchema, body);
  if (!verifyPassword(input.old_password, user.password)) {
    throw new ValidationError({ old_password: ["The current password is incorrect."] });
  }
  if (input.new_password !== input.new_password_confirm) {
    throw new ValidationError({ new_password_confirm: ["The two passwords do not match."] });
  }
  const errors = validateNewPassword(input.new_password, {
    username: user.username,
    email: user.email,
    first_name: user.first_name,
    last_name: user.last_name,
  });
  if (errors.length > 0) throw new ValidationError({ new_password: errors });
  await users.updateUser(user.id, { password: hashPassword(input.new_password) });
}

/**
 * POST /api/auth/password-reset/ — issues a code for a known active account.
 *
 * Returns the single-use handle so the API can hand the forgot-password UI
 * everything it needs to continue (email → new password, with no visible
 * "enter the code" step). The handle is useless without this response or the
 * emailed link, and the endpoint stays behind the 5/min password_reset
 * throttle. TRADE-OFF: anyone who knows an active account's email can obtain
 * the handle straight from the API — see the flow notes in the final report.
 */
export async function passwordResetRequest(body: unknown): Promise<{ reset_handle: string }> {
  const input = parse(passwordResetRequestSchema, body);
  const email = input.email.trim().toLowerCase(); // normalize_email(strip().lower())
  const user = await users.findUserByEmailIexact(email); // Django's email__iexact
  if (!user || !user.is_active) {
    // Explicit account-state error (replaces the old §36 neutral answer; the
    // request endpoint stays behind the 5/min password_reset throttle).
    throw new ValidationError({ email: ["No account with this email address."] });
  }
  const token = randomBytes(48).toString("base64url"); // secrets.token_urlsafe(48)
  await users.createPasswordResetToken(user.id, token);
  await users.expireLiveResetTokens(user.id, token); // older live tokens → used
  await sendMail(passwordResetMail(user, token));
  return { reset_handle: token };
}

/** PASSWORD_RESET_TOKEN_HOURS — hours; invalid/≤0 config falls back to 2 so a
 *  bad env value can never make reset tokens live forever. */
function resetTokenLifetimeHours(): number {
  const parsed = Number.parseFloat(process.env.PASSWORD_RESET_TOKEN_HOURS ?? "");
  return Number.isNaN(parsed) || parsed <= 0 ? 2 : parsed;
}

/**
 * POST /api/auth/password-reset-confirm/ — consume the single-use token.
 *
 * Account state matters here too: a locked account cannot be reset (the reset
 * NEVER clears `account_locked`/`locked_until`/`lock_reason`), and rejections
 * that resolve to a user feed the SAME shared attempt counter as the login
 * form, so neither flow farms attempts on its own. An unresolvable handle
 * (already-used or forged) simply cannot be attributed to anyone.
 */
export async function passwordResetConfirm(body: unknown): Promise<void> {
  const input = parse(passwordResetConfirmSchema, body);
  const row = await users.findLiveResetToken(input.token);
  const invalid = () =>
    new ValidationError(
      { token: ["The reset token is invalid or has expired."] },
      "The reset token is invalid or has expired."
    );
  if (!row) throw invalid();
  // Lazy auto-unlock first (same rule as login), then reject while locked.
  const user = await enforceLock(row.user);
  if (!user.is_active) throw nonFieldError("This account has been deactivated.");
  if (row.created_at.getTime() + resetTokenLifetimeHours() * 3_600_000 < Date.now()) {
    await users.markResetTokenUsed(row.id);
    throw invalid(); // token failure, not a credential guess — not counted
  }
  /** Count the rejection, then re-throw (or upgrade it to the 423 lock). */
  const reject = async (error: ApiError): Promise<never> => {
    const failed = await registerFailedAttempt(user);
    if (failed.account_locked && !hasExpiredLock(failed)) throw lockedError(failed);
    throw error;
  };
  if (input.new_password !== input.new_password_confirm) {
    await reject(
      new ValidationError({ new_password_confirm: ["The two passwords do not match."] })
    );
  }
  const errors = validateNewPassword(input.new_password, {
    username: user.username,
    email: user.email,
    first_name: user.first_name,
    last_name: user.last_name,
  });
  if (errors.length > 0) await reject(new ValidationError({ new_password: errors }));
  // Atomic tail: either the new password lands WITH every live session revoked,
  // the token consumed and the attempt counter cleared (the LOCK fields are
  // never touched here — see the note above), or nothing at all is committed.
  const { prisma } = await import("@/lib/db");
  await prisma.$transaction(async (tx) => {
    await users.updateUser(user.id, { password: hashPassword(input.new_password) }, tx);
    await users.revokeAllRefreshJtis(user.id, tx);
    await users.markResetTokenUsed(row.id, tx);
    await users.resetFailedLogins(user.id, tx);
  });
}

/** PATCH /api/auth/me/ — profile fields + optional avatar upload/removal. */
export async function updateMe(
  user: AuthUser,
  patch: { phone?: string; first_name?: string; last_name?: string; profile_image?: string | null },
  file?: File | null
): Promise<AuthUser> {
  const data: Record<string, unknown> = {};
  if (patch.phone !== undefined) data.phone = patch.phone;
  if (patch.first_name !== undefined) data.first_name = String(patch.first_name).trim();
  if (patch.last_name !== undefined) data.last_name = String(patch.last_name).trim();

  const wantsImage = Boolean(file && file.size > 0);
  const wantsClear = !wantsImage && patch.profile_image === null;

  if (!wantsImage && !wantsClear) {
    if (Object.keys(data).length === 0) return user;
    return (await users.updateUser(user.id, data)) as AuthUser;
  }

  // Phase 8 (transactional replace): validate + CREATE the new MediaFile →
  // UPDATE the profile reference → DELETE the old row, as ONE transaction.
  // Any failure rolls everything back: the OLD image always remains, and a
  // failed profile update never strands a newly created row.
  const previousId = user.profile_image_id;
  const { uploadImage, deleteMediaIfUnreferenced } = await import("@/lib/media/uploadImage");
  const { prisma } = await import("@/lib/db");

  return prisma.$transaction(
    async (tx) => {
      if (wantsImage) {
        const media = await uploadImage(file as File, {
          subdir: "profile_images",
          ownerId: user.id,
          kind: "image",
          tx,
        });
        data.profile_image_id = media.id;
      } else {
        data.profile_image_id = null;
      }
      const updated = (await tx.user.update({ where: { id: user.id }, data })) as AuthUser;
      // Phase 9: replace/remove must drop the old binary — unless another
      // record still references the same row (checked inside).
      if (previousId && previousId !== data.profile_image_id) {
        await deleteMediaIfUnreferenced(previousId, tx);
      }
      return updated;
    },
    { timeout: 15_000 }
  );
}

