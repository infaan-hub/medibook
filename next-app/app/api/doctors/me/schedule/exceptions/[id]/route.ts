import { handler, ok, readJson, intParam } from "@/lib/route";
import { requireDoctor } from "@/lib/auth";
import { notFound } from "@/lib/errors";
import { noContentResponse } from "@/lib/responses";
import { exceptionDto } from "@/lib/serializers";
import { updateOwnException, deleteOwnException } from "@/services/schedule.service";

/** PATCH/DELETE /api/doctors/me/schedule/exceptions/{id}/ — own closure edit. */
export const PATCH = handler(async ({ req, params }) => {
  const user = await requireDoctor(req);
  const id = intParam(params.id);
  if (id === null) throw notFound();
  const body = await readJson(req);
  const item = await updateOwnException(user, id, body);
  return ok(exceptionDto(item), "Schedule exception updated.");
});

export const DELETE = handler(async ({ req, params }) => {
  const user = await requireDoctor(req);
  const id = intParam(params.id);
  if (id === null) throw notFound();
  await deleteOwnException(user, id);
  return noContentResponse();
});
