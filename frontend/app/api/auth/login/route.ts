import { handler, ok, readJson } from "@/lib/route";
import { userPayload } from "@/lib/serializers";
import { login } from "@/services/auth.service";

/** POST /api/auth/login/ — username + password → JWT pair + user. */
export const POST = handler(
  async ({ req }) => {
    const body = await readJson(req);
    const { user, pair } = await login(body);
    return ok({ user: userPayload(user, req), ...pair }, "Login successful.");
  },
  { throttle: "auth" }
);
