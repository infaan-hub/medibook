import { handler, ok, readJson } from "@/lib/route";
import { passwordResetConfirm } from "@/services/auth.service";

/** POST /api/auth/password-reset-confirm/ — consume the single-use token. */
export const POST = handler(async ({ req }) => {
  const body = await readJson(req);
  await passwordResetConfirm(body);
  return ok(null, "Password reset successfully.");
});
