/**
 * Server-side authentication + authorization — the replacement for
 * SimpleJWTAuthentication and the IsPatient / IsDoctor / IsAdminRole
 * permission classes (backend/accounts/permissions.py).
 *
 * Authorization ALWAYS happens here, on the server; UI state and localStorage
 * roles are never trusted.
 */
import { prisma } from "./db";
import { ApiError, PERMISSION_MESSAGES, unauthorized } from "./errors";
import { verifyAccessToken } from "./jwt";
import type { Role, User } from "@prisma/client";

export type AuthUser = User;

/** Resolve the Bearer token (if any) to an active user; null when absent. */
export async function optionalAuth(req: Request): Promise<AuthUser | null> {
  const header = req.headers.get("authorization") ?? "";
  if (!header.toLowerCase().startsWith("bearer ")) return null;
  const token = header.slice(7).trim();
  if (!token) return null;
  const claims = await verifyAccessToken(token); // throws 401 on bad tokens
  const user = await prisma.user.findUnique({ where: { id: Number(claims.sub) } });
  if (!user) throw new ApiError(401, "User not found");
  if (!user.is_active) throw new ApiError(401, "User is not active");
  return user;
}

/** IsAuthenticated. */
export async function requireAuth(req: Request): Promise<AuthUser> {
  const user = await optionalAuth(req);
  if (!user) throw unauthorized();
  return user;
}

export const isSuperAdmin = (user: AuthUser): boolean =>
  user.is_superuser || user.role === "admin";

/**
 * IsAdminRole — mirrors Django exactly: ONLY Django superusers passed this
 * permission (role == "admin" alone was NOT enough).
 */
export async function requireAdmin(req: Request): Promise<AuthUser> {
  const user = await requireAuth(req);
  if (!user.is_superuser) throw new ApiError(403, PERMISSION_MESSAGES.admin);
  return user;
}

export async function requirePatient(req: Request): Promise<AuthUser> {
  const user = await requireAuth(req);
  if (user.role !== "patient") throw new ApiError(403, PERMISSION_MESSAGES.patient);
  return user;
}

export async function requireDoctor(req: Request): Promise<AuthUser> {
  const user = await requireAuth(req);
  if (user.role !== "doctor") throw new ApiError(403, PERMISSION_MESSAGES.doctor);
  return user;
}

/** Fetch the doctor profile row for a user (or null when missing). */
export const doctorProfile = (userId: number) =>
  prisma.doctor.findUnique({ where: { user_id: userId } });

/** get_or_create semantics used by several Django views. */
export async function doctorProfileOrCreate(userId: number) {
  const existing = await prisma.doctor.findUnique({ where: { user_id: userId }, include: { user: true } });
  if (existing) return existing;
  return prisma.doctor.create({ data: { user_id: userId }, include: { user: true } });
}

export type { Role };
