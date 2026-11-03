import { handler, ok, readJson } from "@/lib/route";
import { checkLoginCredentials } from "@/services/auth.service";

/** POST /api/auth/login/check/ — validate credentials before requesting push permission. */
export const POST = handler(
  async ({ req }) => {
    await checkLoginCredentials(await readJson(req));
    return ok({ credentials_verified: true }, "Credentials verified.");
  },
  { throttle: "auth" }
);
