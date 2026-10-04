/** POST /api/queue/{id}/start/ — doctor calls the next patient (phase 11). */
import { handler, ok, intParam, notFound, readJson } from "@/lib/route";
import { requireDoctor } from "@/lib/auth";
import * as queue from "@/services/queue.service";

export const POST = handler(async (ctx) => {
  const user = await requireDoctor(ctx.req);
  const id = intParam(ctx.params.id);
  if (id === null) throw notFound();
  await readJson(ctx.req).catch(() => ({}));
  const result = await queue.startConsultation(user, id);
  return ok(result.data, result.message);
});
