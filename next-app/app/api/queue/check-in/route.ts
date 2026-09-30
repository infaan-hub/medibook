/** POST /api/queue/check-in/ — join today's waiting line (phase 11). */
import { handler, ok, readJson } from "@/lib/route";
import { requireAuth } from "@/lib/auth";
import * as queue from "@/services/queue.service";

export const POST = handler(async (ctx) => {
  const user = await requireAuth(ctx.req);
  const body = await readJson(ctx.req);
  const result = await queue.checkIn(user, body);
  return ok(result.data, result.message);
});
