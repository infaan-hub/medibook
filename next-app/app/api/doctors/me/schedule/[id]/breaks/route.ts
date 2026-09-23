import { handler, ok, readJson, intParam } from "@/lib/route";
import { requireDoctor } from "@/lib/auth";
import { notFound } from "@/lib/errors";
import { breakDto } from "@/lib/serializers";
import { listOwnBreaks, createOwnBreak } from "@/services/schedule.service";

/** GET/POST /api/doctors/me/schedule/{id}/breaks/ — breaks of one window. */
export const GET = handler(async ({ req, params }) => {
  const user = await requireDoctor(req);
  const id = intParam(params.id);
  if (id === null) throw notFound();
  return ok((await listOwnBreaks(user, id)).map(breakDto));
});

export const POST = handler(async ({ req, params }) => {
  const user = await requireDoctor(req);
  const id = intParam(params.id);
  if (id === null) throw notFound();
  const body = await readJson(req);
  const item = await createOwnBreak(user, id, body);
  return ok(breakDto(item), "Break added.", 201);
});
