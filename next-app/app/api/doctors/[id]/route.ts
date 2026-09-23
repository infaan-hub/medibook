import { handler, ok, readJson, intParam, requireAdmin, type RouteCtx } from "@/lib/route";
import { requireAuth } from "@/lib/auth";
import { notFound } from "@/lib/errors";
import { noContentResponse } from "@/lib/responses";
import { retrieveDoctor, updateDoctor, destroyDoctor } from "@/services/doctor.service";

/** GET/PUT/PATCH/DELETE /api/doctors/{id}/ — public read, owner/admin write. */
export const GET = handler(async ({ req, params }) => {
  const id = intParam(params.id);
  if (id === null) throw notFound();
  return ok(await retrieveDoctor(req, id));
});

async function handleWrite({ req, params }: RouteCtx) {
  const user = await requireAuth(req);
  const id = intParam(params.id);
  if (id === null) throw notFound();
  const body = await readJson(req);
  return ok(await updateDoctor(req, user, id, body), "Doctor profile updated.");
}

export const PUT = handler(handleWrite);
export const PATCH = handler(handleWrite);

export const DELETE = handler(async ({ req, params }) => {
  const admin = await requireAdmin(req);
  const id = intParam(params.id);
  if (id === null) throw notFound();
  await destroyDoctor(admin, id);
  return noContentResponse();
});
