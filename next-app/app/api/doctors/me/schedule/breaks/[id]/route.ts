import { handler, ok, readJson, intParam } from "@/lib/route";
import { requireDoctor } from "@/lib/auth";
import { notFound } from "@/lib/errors";
import { noContentResponse } from "@/lib/responses";
import { breakDto } from "@/lib/serializers";
import { updateOwnBreak, deleteOwnBreak } from "@/services/schedule.service";

/** PATCH/DELETE /api/doctors/me/schedule/breaks/{id}/ — own break edit. */
export const PATCH = handler(async ({ req, params }) => {
  const user = await requireDoctor(req);
  const id = intParam(params.id);
  if (id === null) throw notFound();
  const body = await readJson(req);
  const item = await updateOwnBreak(user, id, body);
  return ok(breakDto(item), "Break updated.");
});

export const DELETE = handler(async ({ req, params }) => {
  const user = await requireDoctor(req);
  const id = intParam(params.id);
  if (id === null) throw notFound();
  await deleteOwnBreak(user, id);
  return noContentResponse();
});
