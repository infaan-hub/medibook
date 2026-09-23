import { handler, ok, readJson } from "@/lib/route";
import { requireAuth, requirePatient, requireDoctor, requireAdmin, isSuperAdmin } from "@/lib/auth";
import { userPayload } from "@/lib/serializers";
import { register, login, logout, refresh, passwordChange, passwordResetRequest, passwordResetConfirm, updateMe } from "@/services/auth.service";
import { socialLogin } from "@/services/social.service";

/** POST /api/auth/register/ — self-registration (201) + JWT pair. */
export const POST = handler(
  async ({ req }) => {
    const body = await readJson(req);
    const { user, pair } = await register(body);
    return ok({ user: userPayload(user, req), ...pair }, "Registration successful.", 201);
  },
  { throttle: "auth" }
);
