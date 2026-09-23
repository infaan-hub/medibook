import { handler, ok, readJson } from "@/lib/route";
import { refresh } from "@/services/auth.service";

/** POST /api/auth/token/refresh/ — rotate refresh token. */
export const POST = handler(
  async ({ req }) => {
    const body = await readJson(req);
    const pair = await refresh(body);
    return ok(pair, "Token refreshed.");
  },
  { throttle: "auth" }
);
