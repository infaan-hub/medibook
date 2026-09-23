/** POST /api/admin/doctors/{id}/approve/ — toggle doctor approval + availability. */
import { handler, ok, intParam, notFound, readJson, requireAdmin } from "@/lib/route";
import { adminApprove } from "@/services/doctor.service";
import { badRequest } from "@/lib/errors";

export const POST = handler(async (ctx) => {
  const actor = await requireAdmin(ctx.req);
  const id = intParam(ctx.params.id);
  if (id === null) throw notFound();
  const body = (await readJson(ctx.req)) as { is_available?: boolean };
  if (typeof body.is_available !== "boolean") throw badRequest("is_available is required.");
  const doctor = await adminApprove(ctx.req, actor, id, body.is_available);
  return ok(doctor, "Doctor approval updated.");
});
