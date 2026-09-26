import { handler, ok, readJson } from "@/lib/route";
import { userPayload } from "@/lib/serializers";
import { socialLogin } from "@/services/social.service";

/** POST /api/auth/social/ — Google sign-in. */
export const POST = handler(
  async ({ req }) => {
    const body = await readJson(req);
    const { user, pair } = await socialLogin(body);
    return ok({ user: userPayload(user, req), ...pair }, "Social login successful.");
  },
  { throttle: "auth" }
);
