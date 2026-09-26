/** GET /api/patients/{userId}/ — doctor views a linked patient's profile. */
import { handler, ok, intParam, notFound, requireAuth } from "@/lib/route";
import { getPatientDetail } from "@/services/patient.service";

export const GET = handler(async (ctx) => {
  const user = await requireAuth(ctx.req);
  const id = intParam(ctx.params.userId);
  if (id === null) throw notFound();
  const result = await getPatientDetail(user, id);
  return ok(result.data, result.message);
});
