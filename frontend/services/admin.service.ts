/**
 * Admin service — stats, user/doctor management and the audit trail
 * (port of reports/views.py; every mutating call writes an AuditEvent).
 */
import { ValidationError, notFound, badRequest } from "@/lib/errors";
import { userPayload } from "@/lib/serializers";
import { mediaUrl } from "@/lib/serialize";
import { hashPassword, validateNewPassword } from "@/lib/password";
import { paginate } from "@/lib/pagination";
import { adminDoctorCreateSchema, adminUserCreateSchema } from "@/validators/more";
import { parse } from "@/validators/base";
import * as admin from "@/repositories/admin.repo";
import * as users from "@/repositories/users.repo";
import * as doctors from "@/repositories/doctors.repo";
import type { AuthUser } from "@/lib/auth";

export const stats = () => admin.platformStats();

type AuditRow = Awaited<ReturnType<typeof admin.findAuditEvents>>[number];

function auditRowDto(event: AuditRow) {
  const actor = event.actor;
  const fullName = actor ? `${actor.first_name} ${actor.last_name}`.trim() : "";
  return {
    id: event.id,
    action: event.action,
    target: event.target,
    detail: event.detail,
    actor: actor ? fullName || String(event.actor_id) : "System",
    created_at: event.created_at.toISOString(),
  };
}

/** GET /api/admin/audit/ — paginated, filterable platform activity trail. */
export async function listAudit(req: Request, scope?: { actorId: number }) {
  const url = new URL(req.url);
  const param = (key: string) => url.searchParams.get(key);
  const filters: admin.AuditFilters = {
    search: param("search"),
    action: param("action"),
    actor: param("actor") ? Number(param("actor")) : null,
    from: param("from"),
    to: param("to"),
  };
  const where = admin.auditWhere(filters, scope?.actorId ?? null);
  return paginate({
    req,
    where,
    count: (w) => admin.countAuditEvents(w),
    fetch: ({ skip, take }) =>
      admin.findAuditEvents(where, skip, take).then((rows) => rows.map(auditRowDto)),
  });
}

/** POST /api/admin/users/create/ — patient/doctor accounts. */
export async function createUser(req: Request, actor: AuthUser, body: unknown) {
  const input = parse(adminUserCreateSchema, body);
  if (await users.usernameExistsIexact(input.username)) {
    throw new ValidationError({ username: ["This username is already taken."] });
  }
  if (await users.emailExistsIexact(input.email)) {
    throw new ValidationError({ email: ["A user with this email already exists."] });
  }
  const user = await users.createUser({
    username: input.username,
    email: input.email,
    password: hashPassword(input.password),
    phone: input.phone ?? "",
    first_name: input.first_name ?? "",
    last_name: input.last_name ?? "",
    role: input.role,
  });
  await admin.recordAudit(actor.id, "user.created", user.username, `Created ${user.role} account`);
  return userPayload(user, req);
}

/** POST /api/admin/doctors/create/ — user + linked doctor profile. */
export async function createDoctor(req: Request, actor: AuthUser, body: unknown) {
  const input = parse(adminDoctorCreateSchema, body);
  if (await users.usernameExistsIexact(input.username)) {
    throw new ValidationError({ username: ["This username is already taken."] });
  }
  if (await users.emailExistsIexact(input.email)) {
    throw new ValidationError({ email: ["A user with this email already exists."] });
  }
  const user = await users.createUser({
    username: input.username,
    email: input.email,
    password: hashPassword(input.password),
    phone: input.phone ?? "",
    first_name: input.first_name ?? "",
    last_name: input.last_name ?? "",
    role: "doctor",
  });
  const profile = await doctors.createDoctor(user.id);
  await doctors.applyDoctorFields(profile.id, {
    qualifications: input.qualifications,
    experience_years: input.experience_years,
    consultation_fee: input.consultation_fee,
    bio: input.bio,
    // Real coordinates — the admin form may leave these blank, in which case
    // the doctor is prompted for their location on first sign-in.
    latitude: input.latitude ?? null,
    longitude: input.longitude ?? null,
    location_accuracy: input.location_accuracy ?? null,
    location_captured_at:
      input.latitude === undefined || input.latitude === null ? null : new Date(),
    phone_secondary: input.phone_secondary ?? "",
  });
  const fullName = `${input.first_name ?? ""} ${input.last_name ?? ""}`.trim();
  await admin.recordAudit(actor.id, "doctor.created", String(profile.id), `Created Dr. ${fullName}`);
  const { doctorDto } = await import("@/lib/serializers");
  const refreshed = await doctors.findDoctorById(profile.id);
  return doctorDto(refreshed!, req);
}

/** DELETE /api/admin/users/{id}/ — never self, never admin/superuser. */
export async function deleteUser(actor: AuthUser, targetId: number) {
  if (actor.id === targetId) {
    throw badRequest("You cannot delete your own account.");
  }
  const target = await users.findUserById(targetId);
  if (!target) throw notFound("User not found.");
  if (target.is_superuser || target.role === "admin") {
    throw badRequest("Admin accounts cannot be deleted here.");
  }
  const label = `${target.first_name} ${target.last_name}`.trim() || target.username;
  const role = target.role;
  const username = target.username;
  await users.deleteUser(targetId); // cascades: profile, appointments, reviews…
  await admin.recordAudit(actor.id, "user.deleted", username, `Deleted ${role} account (${label})`);
  return { id: targetId };
}

/** DELETE /api/admin/doctors/{id}/ — removes profile + linked account. */
export async function deleteDoctor(actor: AuthUser, doctorId: number) {
  const doctor = await doctors.findDoctorById(doctorId);
  if (!doctor) throw notFound("Doctor not found.");
  const label = `${doctor.user.first_name} ${doctor.user.last_name}`.trim() || doctor.user.username;
  await users.deleteUser(doctor.user_id); // cascades to the Doctor profile
  await admin.recordAudit(actor.id, "doctor.deleted", String(doctorId), `Deleted Dr. ${label} and their account`);
  return { id: doctorId };
}

export const listUsers = async (role?: string, skip = 0, take = 20) => {
  const rows = await users.listUsers({ role, skip, take });
  return rows.map((u) => ({
    id: u.id,
    username: u.username,
    email: u.email,
    role: u.role ?? "patient",
    is_active: u.is_active,
    first_name: u.first_name ?? "",
    last_name: u.last_name ?? "",
    phone: u.phone ?? "",
    is_superuser: u.is_superuser,
    profile_image: mediaUrl(u.profile_image_id),
    date_joined: u.created_at.toISOString(),
    account_locked: u.account_locked,
    locked_until: u.locked_until ? u.locked_until.toISOString() : null,
    lock_reason: u.lock_reason,
    failed_login_attempts: u.failed_login_attempts,
  }));
};
export const countUsers = (role?: string) => users.countUsers(role);
export const listAllUsers = (skip = 0, take = 20) => listUsers(undefined, skip, take);
export const countAllUsers = () => countUsers();

export const userDto = (u: {
  id: number;
  username: string;
  email: string;
  role?: string | null;
  is_active: boolean;
  first_name?: string | null;
  last_name?: string | null;
  phone?: string | null;
  is_superuser?: boolean;
  profile_image_id?: number | null;
  created_at?: Date;
  account_locked?: boolean;
  locked_until?: Date | null;
  lock_reason?: string | null;
  failed_login_attempts?: number;
}) => ({
  id: u.id,
  username: u.username,
  email: u.email,
  role: u.role ?? "patient",
  is_active: u.is_active,
  first_name: u.first_name ?? "",
  last_name: u.last_name ?? "",
  phone: u.phone ?? "",
  is_superuser: u.is_superuser ?? false,
  profile_image: mediaUrl(u.profile_image_id ?? null),
  date_joined: u.created_at ? u.created_at.toISOString() : null,
  // Brute-force state the admin users table renders (lock badge + Unlock).
  account_locked: u.account_locked ?? false,
  locked_until: u.locked_until ? u.locked_until.toISOString() : null,
  lock_reason: u.lock_reason ?? "",
  failed_login_attempts: u.failed_login_attempts ?? 0,
});

export const userListRow = userDto;

export const createUserAdmin = async (req: Request, actor: AuthUser, body: unknown) =>
  createUser(req, actor, body);
export const createDoctorAdmin = async (req: Request, actor: AuthUser, body: unknown) =>
  createDoctor(req, actor, body);

export const adminDeleteUser = deleteUser;
export const adminDeleteDoctor = deleteDoctor;

export const listAuditEvents = listAudit;
export const platformStats = stats;

export { validateNewPassword };
