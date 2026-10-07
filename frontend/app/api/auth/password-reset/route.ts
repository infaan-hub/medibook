import { handler, ok, readJson } from "@/lib/route";
import { passwordResetRequest } from "@/services/auth.service";

/** POST /api/auth/password-reset/ — neutral §36 response either way. */
export const POST = handler(
  async ({ req }) => {
    const body = await readJson(req);
    await passwordResetRequest(body);
    return ok(null, "A reset code was sent to this email address.");
  },
  { throttle: "password_reset" }
);
