/**
 * GET/PATCH/DELETE /api/lab-orders/{id}/ — the ordering doctor owns the whole
 * row; the patient it belongs to can read it (results are their health data).
 */
import { handler, ok, noContent, readJson, intParam, notFound } from "@/lib/route";
import { requireAuth } from "@/lib/auth";
import * as labs from "@/services/lab-order.service";

export const GET = handler(async (ctx) => {
  const user = await requireAuth(ctx.req);
  const id = intParam(ctx.params.id);
  if (id === null) throw notFound();
  const result = await labs.retrieveLabOrder(user, id);
  return ok(result.data, result.message);
});

export const PATCH = handler(async (ctx) => {
  const user = await requireAuth(ctx.req);
  const id = intParam(ctx.params.id);
  if (id === null) throw notFound();
  const body = await readJson(ctx.req);
  const result = await labs.patchLabOrder(user, id, body);
  return ok(result.data, result.message);
});

export const DELETE = handler(async (ctx) => {
  const user = await requireAuth(ctx.req);
  const id = intParam(ctx.params.id);
  if (id === null) throw notFound();
  const result = await labs.destroyLabOrder(user, id);
  if (result.data === null && result.message === "Lab order not found.") {
    return ok(result.data, result.message);
  }
  return noContent();
});
