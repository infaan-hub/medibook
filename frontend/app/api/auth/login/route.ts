import { handler, ok, readJson } from "@/lib/route";
import { userPayload } from "@/lib/serializers";
import { login } from "@/services/auth.service";

/**
 * POST /api/auth/login/ — username + password → one-time-code challenge.
 * A correct password does NOT mint tokens here; /login/verify/ does.
 */
export const POST = handler(
  async ({ req }) => {
    const body = await readJson(req);
    const result = await login(body);
    if (result.otpRequired) {
      return ok(
        {
          otp_required: true,
          challenge: result.challenge,
          expires_in: result.expiresInSeconds,
          email_sent: result.emailSent,
          email_hint: result.emailHint,
        },
        "Verification code sent."
      );
    }
    return ok({ user: userPayload(result.user, req), ...result.pair }, "Login successful.");
  },
  { throttle: "auth" }
);
