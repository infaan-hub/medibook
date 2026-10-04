/**
 * GET/PATCH/DELETE /api/prescriptions/{id}/ — the issuing doctor owns the
 * write side; the patient it belongs to can read it.
 */
import { handler, ok, noContent, readJson, intParam, notFound } from "@/lib/route";
import { requireAuth } from "@/lib/auth";
import * as prescriptions from "@/services/prescription.service";

export const GET = handler(async (ctx) => {
  const user = await requireAuth(ctx.req);
  const id = intParam(ctx.params.id);
  if (id === null) throw notFound();
  const result = await prescriptions.retrievePrescription(user, id);
  return ok(result.data, result.message);
});

export const PATCH = handler(async (ctx) => {
  const user = await requireAuth(ctx.req);
  const id = intParam(ctx.params.id);
  if (id === null) throw notFound();
  const body = await readJson(ctx.req);
  const result = await prescriptions.patchPrescription(user, id, body);
  return ok(result.data, result.message);
});

export const DELETE = handler(async (ctx) => {
  const user = await requireAuth(ctx.req);
  const id = intParam(ctx.params.id);
  if (id === null) throw notFound();
  const result = await prescriptions.destroyPrescription(user, id);
  if (result.data === null && result.message === "Prescription not found.") {
    return ok(result.data, result.message);
  }
  return noContent();
});
