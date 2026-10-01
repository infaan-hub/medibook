/** GET /api/doctor/audit/ — the signed-in doctor's own activity trail. */
import { handler, requireDoctor } from "@/lib/route";
import { listMyAudit } from "@/services/admin.service";

export const GET = handler(async (ctx) => {
  const user = await requireDoctor(ctx.req);
  return listMyAudit(ctx.req, user.id);
});
