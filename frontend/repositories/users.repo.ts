/**
 * Users / credentials repository — accounts + patient profile + token rows.
 */
import { prisma } from "@/lib/db";
import { Prisma, type User, type Role } from "@prisma/client";

export const USER_PUBLIC_INCLUDE = undefined;

export const findUserById = (id: number) => prisma.user.findUnique({ where: { id } });

/** Django's authenticate() lookup: USERNAME_FIELD exact match. */
export const findUserByUsername = (username: string) =>
  prisma.user.findUnique({ where: { username } });

/** Registration/reset checks used username__iexact / email__iexact. */
export const usernameExistsIexact = async (username: string) =>
  (await prisma.$queryRaw<Array<{ id: number }>>(
    Prisma.sql`SELECT id FROM accounts_user WHERE lower(username) = lower(${username}) LIMIT 1`
  )).length > 0;

export const emailExistsIexact = async (email: string) =>
  (await prisma.$queryRaw<Array<{ id: number }>>(
    Prisma.sql`SELECT id FROM accounts_user WHERE lower(email) = lower(${email}) LIMIT 1`
  )).length > 0;

export const emailExistsExact = async (email: string) =>
  (await prisma.$queryRaw<Array<{ id: number }>>(
    Prisma.sql`SELECT id FROM accounts_user WHERE email = ${email} LIMIT 1`
  )).length > 0;

export const usernameExistsExact = (username: string) =>
  prisma.user.findUnique({ where: { username } });

export const findUserByEmailExact = (email: string) =>
  prisma.user.findUnique({ where: { email } });

/**
 * Case-insensitive account lookup (`WHERE lower(email) = lower($1) LIMIT 1` —
 * Django's `email__iexact`, used by the password-reset request so a stored
 * `John@Example.com` still matches what the user typed).
 */
export const findUserByEmailIexact = (email: string) =>
  prisma.user.findFirst({ where: { email: { equals: email, mode: "insensitive" } } });

export interface CreateUserInput {
  username: string;
  email: string;
  password: string;
  phone?: string;
  first_name?: string;
  last_name?: string;
  role?: Role;
  is_superuser?: boolean;
  is_staff?: boolean;
}

export const createUser = (data: CreateUserInput) =>
  prisma.user.create({
    data: {
      username: data.username,
      email: data.email,
      password: data.password,
      phone: data.phone ?? "",
      first_name: data.first_name ?? "",
      last_name: data.last_name ?? "",
      role: data.role ?? "patient",
      is_superuser: data.is_superuser ?? false,
      is_staff: data.is_staff ?? false,
    },
  });

export const updateUser = (id: number, data: Prisma.UserUpdateInput, tx?: Prisma.TransactionClient) =>
  (tx ?? prisma).user.update({ where: { id }, data });

export const deleteUser = (id: number) => prisma.user.delete({ where: { id } });

export const listUsers = (opts: {
  role?: string;
  skip: number;
  take: number;
}) =>
  prisma.user.findMany({
    where: opts.role ? { role: opts.role as Role } : undefined,
    orderBy: { created_at: "desc" },
    skip: opts.skip,
    take: opts.take,
  });

export const countUsers = (role?: string) =>
  prisma.user.count({ where: role ? { role: role as Role } : undefined });

/* ----------------------------- Patient profile ---------------------------- */

export const getPatientProfile = (userId: number) =>
  prisma.patient.findUnique({
    where: { user_id: userId },
    include: { user: true },
  });

export const getOrCreatePatient = async (userId: number) => {
  const existing = await prisma.patient.findUnique({
    where: { user_id: userId },
    include: { user: true },
  });
  if (existing) return existing;
  await prisma.patient.create({ data: { user_id: userId, reminder_preferences: {} } });
  return prisma.patient.findUnique({
    where: { user_id: userId },
    include: { user: true },
  });
};

export const updatePatient = (userId: number, data: Prisma.PatientUpdateInput) =>
  prisma.patient.update({
    where: { user_id: userId },
    data,
    include: { user: true },
  });

export const findPatientsByUserIds = (ids: number[]) =>
  prisma.patient.findMany({
    where: { user_id: { in: ids } },
    include: { user: true },
    orderBy: { created_at: "desc" },
  });

/* ------------------------------- Token rows -------------------------------- */

export const createPasswordResetToken = (userId: number, token: string) =>
  prisma.passwordResetToken.create({ data: { user_id: userId, token } });

export const expireLiveResetTokens = (userId: number, exceptToken?: string) =>
  prisma.passwordResetToken.updateMany({
    where: {
      user_id: userId,
      used_at: null,
      ...(exceptToken ? { NOT: { token: exceptToken } } : {}),
    },
    data: { used_at: new Date() },
  });

export const findLiveResetToken = (token: string) =>
  prisma.passwordResetToken.findFirst({
    where: { token, used_at: null },
    include: { user: true },
  });

export const markResetTokenUsed = (id: number, tx?: Prisma.TransactionClient) =>
  (tx ?? prisma).passwordResetToken.update({ where: { id }, data: { used_at: new Date() } });

export const createRefreshJti = (userId: number, jti: string, expiresAt: Date) =>
  prisma.refreshToken.create({ data: { user_id: userId, jti, expires_at: expiresAt } });

export const findRefreshJti = (jti: string) => prisma.refreshToken.findUnique({ where: { jti } });

export const revokeRefreshJti = (jti: string) =>
  prisma.refreshToken.update({ where: { jti }, data: { revoked_at: new Date() } });

/**
 * Invalidate every still-live refresh JTI owned by one user
 * (`UPDATE … SET revoked_at = now() WHERE user_id = $1 AND revoked_at IS NULL`).
 * Only that user's rows are touched — never anyone else's sessions.
 */
export const revokeAllRefreshJtis = (userId: number, tx?: Prisma.TransactionClient) =>
  (tx ?? prisma).refreshToken.updateMany({
    where: { user_id: userId, revoked_at: null },
    data: { revoked_at: new Date() },
  });

/* --------------------------- Sign-in lock state --------------------------- */

/** Row shape returned by the atomic failed-attempt UPDATE (snake_case columns). */
export interface FailedAttemptRow {
  id: number;
  role: string;
  account_locked: boolean;
  locked_until: Date | null;
  lock_reason: string;
  failed_login_attempts: number;
}

/**
 * Record ONE failed sign-in attempt atomically: bump the shared counter and,
 * the moment it reaches `max`, take the role-appropriate lock — all inside a
 * single UPDATE, so concurrent attempts can never read a stale count or race
 * the threshold decision (the row lock serialises them). `RETURNING` hands
 * back the row as committed, letting the caller choose between "N attempts
 * left" and "locked right now".
 *
 * `until === null` means an administrator-only lock (no deadline).
 */
export const recordFailedLogin = async (
  userId: number,
  max: number,
  reason: string,
  until: Date | null
): Promise<FailedAttemptRow | null> => {
  const rows = await prisma.$queryRaw<FailedAttemptRow[]>`
    UPDATE "accounts_user"
       SET "failed_login_attempts" = "failed_login_attempts" + 1,
           "last_failed_login_at" = ${new Date()},
           "updated_at" = ${new Date()},
           "account_locked" = CASE WHEN "failed_login_attempts" + 1 >= ${max}::int THEN true ELSE "account_locked" END,
           "locked_until" = CASE WHEN "failed_login_attempts" + 1 >= ${max}::int THEN ${until}::timestamp ELSE "locked_until" END,
           "lock_reason" = CASE WHEN "failed_login_attempts" + 1 >= ${max}::int THEN ${reason} ELSE "lock_reason" END
     WHERE "id" = ${userId}
 RETURNING "id", "role", "account_locked", "locked_until", "lock_reason", "failed_login_attempts"`;
  return rows[0] ?? null;
};

/**
 * Lazy auto-unlock: clear a temporary lock whose deadline has passed, together
 * with the stale attempt counter, so the next sign-in starts a fresh budget.
 * Guarded (`account_locked = true AND locked_until <= now()`) so it never
 * clobbers a lock an administrator took or extended concurrently.
 */
export const clearExpiredLock = (userId: number) =>
  prisma.user.updateMany({
    where: {
      id: userId,
      account_locked: true,
      locked_until: { not: null, lte: new Date() },
    },
    data: { account_locked: false, locked_until: null, lock_reason: "", failed_login_attempts: 0 },
  });

/** Administrator unlock: lift the lock AND reset the attempt counter. */
export const unlockUser = (userId: number) =>
  prisma.user.update({
    where: { id: userId },
    data: { account_locked: false, locked_until: null, lock_reason: "", failed_login_attempts: 0 },
  });

/**
 * Successful authentication clears the attempt counter. The LOCK fields are
 * deliberately untouched: a password reset (or anything else short of
 * auto-unlock/expiry or an admin action) must never free a locked account.
 */
export const resetFailedLogins = (userId: number, tx?: Prisma.TransactionClient) =>
  (tx ?? prisma).user.updateMany({
    where: { id: userId, failed_login_attempts: { gt: 0 } },
    data: { failed_login_attempts: 0 },
  });

/* --------------------------- Login OTP challenges -------------------------- */

export const findLoginOtp = (challenge: string) =>
  prisma.loginOtp.findUnique({ where: { challenge } });

export const createLoginOtp = (data: {
  user_id: number;
  challenge: string;
  code_hash: string;
  expires_at: Date;
}) => prisma.loginOtp.create({ data });

export const updateLoginOtpAttempts = (challenge: string, attempts: number) =>
  prisma.loginOtp.update({ where: { challenge }, data: { attempts } });

/** Drop one challenge (burned by guesses, superseded, or consumed by success). */
export const deleteLoginOtp = (challenge: string) =>
  prisma.loginOtp.deleteMany({ where: { challenge } });

/** One active challenge per user: a fresh login replaces the previous one. */
export const deleteLoginOtpsForUser = (userId: number) =>
  prisma.loginOtp.deleteMany({ where: { user_id: userId } });

/** Opportunistic sweep: challenges that expired more than a day ago. */
export const purgeExpiredLoginOtps = (cutoff: Date) =>
  prisma.loginOtp.deleteMany({ where: { expires_at: { lt: cutoff } } });
