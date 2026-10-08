/** GET    /api/admin/audit/ — paginated platform activity trail (?search=&action=&page=).
 *  DELETE /api/admin/audit/ — clear the trail (rows also expire after 72h on
 *  their own; the wipe records one fresh `audit.cleared` row so the clearing
 *  itself stays accountable, and the generic request audit skips this path). */
import { handler, ok, requireAdmin } from "@/lib/route";
import { clearAudit, listAudit } from "@/services/admin.service";
import { recordAudit } from "@/repositories/admin.repo";

export const GET = handler(async (ctx) => {
  await requireAdmin(ctx.req);
  return listAudit(ctx.req);
});

export const DELETE = handler(async (ctx) => {
  const actor = await requireAdmin(ctx.req);
  const deleted = await clearAudit();
  await recordAudit(actor.id, "audit.cleared", "Audit log", `Cleared ${deleted} audit event(s)`);
  return ok({ deleted }, "Audit log cleared.");
});
