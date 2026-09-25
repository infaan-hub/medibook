/**
 * Admin service — stats, user/doctor management and the audit trail
 * (port of reports/views.py; every mutating call writes an AuditEvent).
 */
import { ValidationError, notFound, badRequest } from "@/lib/errors";
import { userPayload } from "@/lib/serializers";
import { mediaUrl } from "@/lib/serialize";
import { hashPassword, validateNewPassword } from "@/lib/password";
import { adminDoctorCreateSchema, adminUserCreateSchema } from "@/validators/more";
import { parse } from "@/validators/base";
import * as admin from "@/repositories/admin.repo";
import * as users from "@/repositories/users.repo";
import * as doctors from "@/repositories/doctors.repo";
import type { AuthUser } from "@/lib/auth";

export const stats = () => admin.platformStats();
export const listAudit = async () =>
  (await admin.listAuditEvents()).map((event) => {
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
  });

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
    city: input.city,
    office_address: input.office_address,
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
