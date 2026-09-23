/**
 * Auth service — registration, login, logout, refresh, password flows
 * (port of accounts/views.py + serializers.py).
 */
import { randomBytes } from "node:crypto";
import { ValidationError, nonFieldError, unauthorized } from "@/lib/errors";
import { signAccessToken, signRefreshToken, verifyRefreshToken } from "@/lib/jwt";
import { hashPassword, isDjangoHash, validateNewPassword, verifyPassword } from "@/lib/password";
import { passwordResetMail, sendMail } from "@/lib/mail";
import * as users from "@/repositories/users.repo";
import * as doctors from "@/repositories/doctors.repo";
import type { AuthUser } from "@/lib/auth";
import {
  loginSchema,
  logoutSchema,
  passwordChangeSchema,
  passwordResetConfirmSchema,
  passwordResetRequestSchema,
  registerSchema,
  type LoginInput,
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

/** POST /api/auth/login/ — username + password → JWT pair. */
export async function login(body: unknown): Promise<{ user: AuthUser; pair: { access: string; refresh: string } }> {
  const input = parse(loginSchema, body) as LoginInput;
  const user = await users.findUserByUsername(input.username); // exact match (ModelBackend)
  if (!user || !verifyPassword(input.password, user.password)) {
    throw nonFieldError("The username or password is incorrect.");
  }
  if (!user.is_active) throw nonFieldError("This account has been deactivated.");
  // Progressive hash upgrade: Django PBKDF2 rows → scrypt after a valid login.
  if (isDjangoHash(user.password)) {
    await users.updateUser(user.id, { password: hashPassword(input.password) });
  }
  return { user, pair: await issuePair(user.id) };
}

/** POST /api/auth/token/refresh/ — rotate refresh token (SimpleJWT semantics). */
export async function refresh(body: unknown): Promise<{ access: string; refresh: string }> {
  const parsed = parse(logoutSchema, body);
  const claims = await verifyRefreshToken(parsed.refresh); // 401 on bad/expired
  const row = claims.jti ? await users.findRefreshJti(claims.jti) : null;
  if (!row || row.revoked_at) throw unauthorized("Token is invalid or expired");
  if (row.expires_at.getTime() < Date.now()) throw unauthorized("Token is expired");
  await users.revokeRefreshJti(row.jti); // BLACKLIST_AFTER_ROTATION
  return issuePair(Number(claims.sub));
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

/** POST /api/auth/password-reset/ — always the neutral §36 message. */
export async function passwordResetRequest(body: unknown): Promise<void> {
  const input = parse(passwordResetRequestSchema, body);
  const email = input.email.trim().toLowerCase(); // normalize_email(strip().lower())
  const user = await users.findUserByEmailExact(email).catch(() => null);
  if (!user) return; // never reveal whether the email exists (§36)
  const token = randomBytes(48).toString("base64url"); // secrets.token_urlsafe(48)
  await users.createPasswordResetToken(user.id, token);
  await users.expireLiveResetTokens(user.id, token); // older live tokens → used
  await sendMail(passwordResetMail(user, token));
}

/** POST /api/auth/password-reset-confirm/ — consume the single-use token. */
export async function passwordResetConfirm(body: unknown): Promise<void> {
  const input = parse(passwordResetConfirmSchema, body);
  const row = await users.findLiveResetToken(input.token);
  const invalid = () =>
    new ValidationError(
      { token: ["The reset token is invalid or has expired."] },
      "The reset token is invalid or has expired."
    );
  if (!row) throw invalid();
  const hours = Number(process.env.PASSWORD_RESET_TOKEN_HOURS ?? 2);
  if (row.created_at.getTime() + hours * 3_600_000 < Date.now()) {
    await users.markResetTokenUsed(row.id);
    throw invalid();
  }
  if (input.new_password !== input.new_password_confirm) {
    throw new ValidationError({ new_password_confirm: ["The two passwords do not match."] });
  }
  const errors = validateNewPassword(input.new_password);
  if (errors.length > 0) throw new ValidationError({ new_password: errors });
  await users.updateUser(row.user_id, { password: hashPassword(input.new_password) });
  await users.markResetTokenUsed(row.id);
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
  if (file) {
    const { saveUpload } = await import("@/lib/upload");
    data.profile_image = await saveUpload(file, "profile_images", { imagesOnly: true });
  } else if (patch.profile_image === null) {
    data.profile_image = null; // Django ImageField(allow_null) — row cleared
  }
  if (Object.keys(data).length === 0) return user;
  return (await users.updateUser(user.id, data)) as AuthUser;
}

