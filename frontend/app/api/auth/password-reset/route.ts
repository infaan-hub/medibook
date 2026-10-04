import { handler, ok, readJson } from "@/lib/route";
import { passwordResetRequest } from "@/services/auth.service";

/** POST /api/auth/password-reset/ — neutral §36 response either way. */
export const POST = handler(
  async ({ req }) => {
    const body = await readJson(req);
    await passwordResetRequest(body);
    return ok(null, "If an account exists for this email, a reset link was sent.");
  },
  { throttle: "password_reset" }
);
