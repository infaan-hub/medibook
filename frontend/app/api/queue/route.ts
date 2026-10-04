/** GET /api/queue/?date=YYYY-MM-DD — waiting room for one day (phase 11). */
import { handler, ok } from "@/lib/route";
import { requireAuth } from "@/lib/auth";
import * as queue from "@/services/queue.service";

export const GET = handler(async (ctx) => {
  const user = await requireAuth(ctx.req);
  const date = new URL(ctx.req.url).searchParams.get("date") ?? undefined;
  const result = await queue.getQueue(user, date);
  return ok(result.data, result.message);
});
