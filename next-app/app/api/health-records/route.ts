/** GET/POST /api/health-records/ — role-scoped health records (paginated). */
import {
  handler,
  ok,
  created,
  noContent,
  readJson,
  intParam,
  badRequest,
  requireAuth,
  requireDoctor,
} from "@/lib/route";
import {
  healthRecordScope,
  createHealthRecord,
  destroyHealthRecord,
} from "@/services/treatment.service";
import * as clinical from "@/repositories/clinical.repo";
import { healthRecordDto } from "@/lib/serializers";
import { paginate } from "@/lib/pagination";

export const GET = handler(async (ctx) => {
  const user = await requireAuth(ctx.req);
  const qs = new URL(ctx.req.url).searchParams;
  const patient = qs.get("patient") ?? undefined;
  const where = await healthRecordScope(user, patient);
  return paginate({
    req: ctx.req,
    where,
    count: () => clinical.countHealthRecords(where),
    fetch: ({ skip, take }) =>
      clinical.listHealthRecords(where, skip, take).then((rows) =>
        rows.map((row) => healthRecordDto(row, ctx.req))
      ),
    fetchAll: async () =>
      clinical.listHealthRecords(where, 0, 1000).then((rows) =>
        rows.map((row) => healthRecordDto(row, ctx.req))
      ),
  });
});

export const POST = handler(async (ctx) => {
  // Both roles may upload: doctors FOR a patient, patients WITH a doctor
  // (role-specific targeting is enforced inside createHealthRecord).
  const user = await requireAuth(ctx.req);
  const contentType = ctx.req.headers.get("content-type") ?? "";
  let body: unknown = {};
  let file: File | null = null;
  if (contentType.includes("multipart/form-data")) {
    const form = await ctx.req.formData();
    body = Object.fromEntries(form.entries());
    const raw = form.get("file");
    if (raw instanceof File) file = raw;
  } else {
    body = await readJson(ctx.req);
  }
  const row = await createHealthRecord(user, body, file);
  return created(healthRecordDto(row, ctx.req), "Health record uploaded.");
});

export const DELETE = handler(async (ctx) => {
  const user = await requireDoctor(ctx.req);
  const qs = new URL(ctx.req.url).searchParams;
  const id = intParam(qs.get("id"));
  if (id === null) throw badRequest("Missing health record id.");
  await destroyHealthRecord(user, id);
  return noContent();
});
