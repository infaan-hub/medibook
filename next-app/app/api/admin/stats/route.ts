/** GET /api/admin/stats/ — alias for platform stats (frontend calls this path). */
import { handler, ok } from "@/lib/route";
import { requireAdmin } from "@/lib/auth";
import { platformStats } from "@/services/admin.service";

export const GET = handler(async (ctx) => {
  await requireAdmin(ctx.req);
  return ok(await platformStats());
});
