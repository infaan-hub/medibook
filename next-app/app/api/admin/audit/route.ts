/** GET /api/admin/audit/ — paginated platform activity trail (?search=&action=&page=). */
import { handler, requireAdmin } from "@/lib/route";
import { listAudit } from "@/services/admin.service";

export const GET = handler(async (ctx) => {
  await requireAdmin(ctx.req);
  return listAudit(ctx.req);
});
