/** GET/DELETE /api/health-records/{id}/ */
import { handler, ok, noContent, intParam, notFound, requireAuth, requireDoctor } from "@/lib/route";
import { destroyHealthRecord } from "@/services/treatment.service";
import * as clinical from "@/repositories/clinical.repo";
import * as doctors from "@/repositories/doctors.repo";
import { healthRecordDto } from "@/lib/serializers";

export const GET = handler(async (ctx) => {
  const user = await requireAuth(ctx.req);
  const id = intParam(ctx.params.id);
  if (id === null) throw notFound();
  const doctor =
    user.role === "doctor" ? await doctors.findDoctorByUserId(user.id) : null;
  const where =
    user.role === "patient"
      ? { id, patient_id: user.id }
      : user.role === "doctor"
        ? { id, doctor_id: doctor?.id ?? -1 }
        : { id: -1 };
  const rows = await clinical.listHealthRecords(where, 0, 1);
  if (!rows[0]) throw notFound();
  return ok(healthRecordDto(rows[0], ctx.req));
});

export const DELETE = handler(async (ctx) => {
  const user = await requireDoctor(ctx.req);
  const id = intParam(ctx.params.id);
  if (id === null) throw notFound();
  await destroyHealthRecord(user, id);
  return noContent();
});
