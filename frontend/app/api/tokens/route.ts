/** POST /api/tokens/ — alias for refresh (some clients post here). */
import { handler, ok, readJson } from "@/lib/route";
import { refresh } from "@/services/auth.service";

export const POST = handler(async (ctx) => {
  const body = await readJson(ctx.req);
  const result = await refresh(body);
  return ok(result, "Token refreshed.");
});
