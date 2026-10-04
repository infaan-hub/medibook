import { handler, ok, readJson, intParam, noContent } from "@/lib/route";
import { requireDoctor } from "@/lib/auth";
import { notFound } from "@/lib/errors";
import { availabilityDto } from "@/lib/serializers";
import { findWindow } from "@/repositories/doctors.repo";
import { updateOwnWindow, deleteOwnWindow } from "@/services/schedule.service";

/** GET/PATCH/DELETE /api/doctors/me/schedule/{id}/ — owner window. */
export const GET = handler(async ({ req, params }) => {
  const user = await requireDoctor(req);
  const id = intParam(params.id);
  if (id === null) throw notFound();
  const window = await findWindow(id);
  if (!window || window.doctor_id === undefined) throw notFound();
  const doctor = await (await import("@/repositories/doctors.repo")).findDoctorByUserId(user.id);
  if (!doctor || window.doctor_id !== doctor.id) throw notFound();
  return ok(availabilityDto(window));
});

export const PATCH = handler(async ({ req, params }) => {
  const user = await requireDoctor(req);
  const id = intParam(params.id);
  if (id === null) throw notFound();
  const body = await readJson(req);
  const window = await updateOwnWindow(user, id, body);
  return ok(availabilityDto(window), "Availability updated.");
});

export const DELETE = handler(async ({ req, params }) => {
  const user = await requireDoctor(req);
  const id = intParam(params.id);
  if (id === null) throw notFound();
  await deleteOwnWindow(user, id);
  return noContent();
});
