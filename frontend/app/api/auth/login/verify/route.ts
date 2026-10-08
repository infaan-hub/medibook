import { handler, ok, readJson } from "@/lib/route";
import { userPayload } from "@/lib/serializers";
import { verifyLoginOtp } from "@/services/auth.service";

/** POST /api/auth/login/verify/ — the OTP step of login → JWT pair + user. */
export const POST = handler(
  async ({ req }) => {
    const body = await readJson(req);
    const { user, pair } = await verifyLoginOtp(body);
    return ok({ user: userPayload(user, req), ...pair }, "Login successful.");
  },
  { throttle: "auth" }
);
