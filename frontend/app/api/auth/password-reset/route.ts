import { handler, ok, readJson } from "@/lib/route";
import { passwordResetRequest } from "@/services/auth.service";

/** POST /api/auth/password-reset/ — issues the single-use handle for the UI. */
export const POST = handler(
  async ({ req }) => {
    const body = await readJson(req);
    const { reset_handle } = await passwordResetRequest(body);
    // The handle lets the forgot-password screen jump straight to the new-
    // password form (no visible code step); the emailed link carries the same
    // handle for users who prefer it (?token= prefill still works).
    return ok({ reset_handle }, "A reset code was sent to this email address.");
  },
  { throttle: "password_reset" }
);
