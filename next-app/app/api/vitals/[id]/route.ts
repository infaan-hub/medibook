/**
 * GET/DELETE /api/vitals/{id}/ — the doctor who took the reading may read and
 * delete it; the patient it belongs to may read it.
 */
import { handler, ok, noContent, intParam, notFound } from "@/lib/route";
import { requireAuth } from "@/lib/auth";
import * as vitals from "@/services/vital.service";

export const GET = handler(async (ctx) => {
  const user = await requireAuth(ctx.req);
  const id = intParam(ctx.params.id);
  if (id === null) throw notFound();
  const result = await vitals.retrieveVital(user, id);
  return ok(result.data, result.message);
});

export const DELETE = handler(async (ctx) => {
  const user = await requireAuth(ctx.req);
  const id = intParam(ctx.params.id);
  if (id === null) throw notFound();
  const result = await vitals.destroyVital(user, id);
  if (result.data === null && result.message === "Vital reading not found.") {
    return ok(result.data, result.message);
  }
  return noContent();
});
