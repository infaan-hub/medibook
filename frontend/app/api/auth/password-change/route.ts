import { handler, ok, readJson } from "@/lib/route";
import { requireAuth } from "@/lib/auth";
import { passwordChange } from "@/services/auth.service";

/** POST /api/auth/password-change/ — authenticated password change. */
export const POST = handler(async ({ req }) => {
  const user = await requireAuth(req);
  const body = await readJson(req);
  await passwordChange(user, body);
  return ok(null, "Password changed successfully.");
});
