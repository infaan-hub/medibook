/** POST /api/admin/users/create/ — explicit create path used by frontend. */
import { handler, created, readJson } from "@/lib/route";
import { requireAdmin } from "@/lib/auth";
import * as admin from "@/services/admin.service";

export const POST = handler(async (ctx) => {
  const actor = await requireAdmin(ctx.req);
  const body = await readJson(ctx.req);
  const user = await admin.createUserAdmin(ctx.req, actor, body);
  return created(user, "User created.");
});
