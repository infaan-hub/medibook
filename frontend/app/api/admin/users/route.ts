/** GET/POST /api/admin/users/ — paginated user admin list; POST creates a user. */
import { handler, ok, created, readJson } from "@/lib/route";
import { requireAdmin } from "@/lib/auth";
import { paginate } from "@/lib/pagination";
import * as admin from "@/services/admin.service";

export const GET = handler(async (ctx) => {
  await requireAdmin(ctx.req);
  const qs = new URL(ctx.req.url).searchParams;
  const role = qs.get("role") ?? undefined;
  return paginate({
    req: ctx.req,
    where: {},
    count: () => admin.countUsers(role),
    fetch: ({ skip, take }) => admin.listUsers(role, skip, take),
    fetchAll: () => admin.listUsers(role, 0, 1000),
  });
});

export const POST = handler(async (ctx) => {
  const actor = await requireAdmin(ctx.req);
  const body = await readJson(ctx.req);
  const user = await admin.createUserAdmin(ctx.req, actor, body);
  return created(user, "User created.");
});
