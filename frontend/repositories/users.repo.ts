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

export const updateUser = (id: number, data: Prisma.UserUpdateInput) =>
  prisma.user.update({ where: { id }, data });

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

export const markResetTokenUsed = (id: number) =>
  prisma.passwordResetToken.update({ where: { id }, data: { used_at: new Date() } });

export const createRefreshJti = (userId: number, jti: string, expiresAt: Date) =>
  prisma.refreshToken.create({ data: { user_id: userId, jti, expires_at: expiresAt } });

export const findRefreshJti = (jti: string) => prisma.refreshToken.findUnique({ where: { jti } });

export const revokeRefreshJti = (jti: string) =>
  prisma.refreshToken.update({ where: { jti }, data: { revoked_at: new Date() } });
