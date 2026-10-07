/** POST /api/admin/users/{id}/unlock/ — lift a lock and reset its counter. */
import { handler, ok, intParam, notFound, requireAdmin } from "@/lib/route";
import { nonFieldError } from "@/lib/errors";
import * as admin from "@/services/admin.service";
import * as users from "@/repositories/users.repo";

export const POST = handler(async (ctx) => {
  const actor = await requireAdmin(ctx.req);
  const id = intParam(ctx.params.id);
  if (id === null) throw notFound();
  const existing = await users.findUserById(id);
  if (!existing) throw notFound("User not found.");
  if (!existing.account_locked) throw nonFieldError("This account is not locked.");
  const updated = await users.unlockUser(id);
  await (await import("@/repositories/admin.repo")).recordAudit(
    actor.id,
    "user.unlocked",
    existing.username,
    `Unlocked ${existing.role} account after failed sign-in attempts`,
  );
  return ok(admin.userDto(updated), "Account unlocked.");
});
