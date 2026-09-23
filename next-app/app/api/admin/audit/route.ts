/** GET /api/admin/audit/ — bare audit event list (Django parity). */
import { handler, ok, requireAdmin } from "@/lib/route";
import { listAudit } from "@/services/admin.service";

export const GET = handler(async (ctx) => {
  await requireAdmin(ctx.req);
  return ok(await listAudit());
});
