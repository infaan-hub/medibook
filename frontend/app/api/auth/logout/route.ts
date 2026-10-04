import { handler, ok, readJson } from "@/lib/route";
import { requireAuth } from "@/lib/auth";
import { logout } from "@/services/auth.service";

/** POST /api/auth/logout/ — blacklist the supplied refresh token. */
export const POST = handler(async ({ req }) => {
  await requireAuth(req); // IsAuthenticated
  const body = await readJson(req);
  await logout(body);
  return ok(null, "Logout successful.");
});
