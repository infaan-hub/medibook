/** GET/POST /api/specialties/ — paginated specialty catalog. */
import { handler, ok, created, readJson, requireAdmin, badRequest } from "@/lib/route";
import { paginate } from "@/lib/pagination";
import * as content from "@/services/content.service";
import { specialtyDto } from "@/lib/serializers";

export const GET = handler(async (ctx) => {
  return paginate({
    req: ctx.req,
    where: {},
    count: () => content.countSpecialtyRows(),
    fetch: ({ skip, take }) =>
      content.listSpecialtyPage(skip, take).then((rows) => rows.map(specialtyDto)),
    fetchAll: async () =>
      content.listSpecialtyPage(0, 1000).then((rows) => rows.map(specialtyDto)),
  });
});

export const POST = handler(async (ctx) => {
  await requireAdmin(ctx.req);
  const body = await readJson(ctx.req);
  const specialty = await content.createSpecialty(body);
  return created(specialty, "Specialty created.");
});
