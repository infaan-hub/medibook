/** PATCH/DELETE /api/admin/users/{id}/ */
import { handler, ok, noContent, readJson, intParam, notFound, requireAdmin } from "@/lib/route";
import * as admin from "@/services/admin.service";
import * as users from "@/repositories/users.repo";
import { ValidationError } from "@/lib/errors";

export const GET = handler(async (ctx) => {
  await requireAdmin(ctx.req);
  const id = intParam(ctx.params.id);
  if (id === null) throw notFound();
  const user = await users.findUserById(id);
  if (!user) throw notFound();
  return ok(admin.userDto(user));
});

export const PATCH = handler(async (ctx) => {
  const actor = await requireAdmin(ctx.req);
  const id = intParam(ctx.params.id);
  if (id === null) throw notFound();
  const existing = await users.findUserById(id);
  if (!existing) throw notFound("User not found.");
  const body = (await readJson(ctx.req)) as Record<string, unknown>;
  const data: Record<string, unknown> = {};
  for (const key of ["email", "first_name", "last_name", "phone", "role", "is_active", "username"] as const) {
    if (body[key] !== undefined) data[key] = body[key];
  }
  if (body.email !== undefined && body.email !== existing.email) {
    if (await users.emailExistsIexact(String(body.email))) {
      throw new ValidationError({ email: ["A user with this email already exists."] });
    }
  }
  if (body.username !== undefined && body.username !== existing.username) {
    if (await users.usernameExistsIexact(String(body.username))) {
      throw new ValidationError({ username: ["This username is already taken."] });
    }
  }
  const updated = await users.updateUser(id, data);
  await (await import("@/repositories/admin.repo")).recordAudit(
    actor.id,
    "user.updated",
    existing.username,
    "Updated user account",
  );
  return ok(admin.userDto(updated), "User updated.");
});

export const DELETE = handler(async (ctx) => {
  const actor = await requireAdmin(ctx.req);
  const id = intParam(ctx.params.id);
  if (id === null) throw notFound();
  const result = await admin.adminDeleteUser(actor, id);
  return ok(result, "User deleted.");
});
