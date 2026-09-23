/** GET/PATCH/DELETE /api/admin/doctors/{id}/ */
import { handler, ok, readJson, intParam, notFound, requireAdmin } from "@/lib/route";
import * as doctors from "@/repositories/doctors.repo";
import { doctorDto } from "@/lib/serializers";
import { parseDoctorWrite, applyDoctorWrite } from "@/services/doctor.service";
import * as adminRepo from "@/repositories/admin.repo";
import * as adminSvc from "@/services/admin.service";

export const GET = handler(async (ctx) => {
  await requireAdmin(ctx.req);
  const id = intParam(ctx.params.id);
  if (id === null) throw notFound();
  const doctor = await doctors.findDoctorById(id);
  if (!doctor) throw notFound();
  return ok(doctorDto(doctor, ctx.req));
});

export const PATCH = handler(async (ctx) => {
  const actor = await requireAdmin(ctx.req);
  const id = intParam(ctx.params.id);
  if (id === null) throw notFound();
  const doctor = await doctors.findDoctorById(id);
  if (!doctor) throw notFound();
  const body = await readJson(ctx.req);
  const input = parseDoctorWrite(body);
  await applyDoctorWrite(id, input);
  await adminRepo.recordAudit(actor.id, "doctor.updated", String(id), "Updated doctor profile");
  const refreshed = await doctors.findDoctorById(id);
  return ok(doctorDto(refreshed ?? doctor, ctx.req), "Doctor updated.");
});

export const DELETE = handler(async (ctx) => {
  const actor = await requireAdmin(ctx.req);
  const id = intParam(ctx.params.id);
  if (id === null) throw notFound();
  await adminSvc.adminDeleteDoctor(actor, id);
  return ok({ id }, "Doctor deleted.");
});
