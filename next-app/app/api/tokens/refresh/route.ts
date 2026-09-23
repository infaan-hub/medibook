/** POST /api/tokens/refresh/ — exchange refresh JWT for a new access token. */
import { handler, ok, readJson, badRequest } from "@/lib/route";
import { refresh } from "@/services/auth.service";

export const POST = handler(async (ctx) => {
  const body = await readJson(ctx.req);
  const result = await refresh(body);
  return ok(result, "Token refreshed.");
});
