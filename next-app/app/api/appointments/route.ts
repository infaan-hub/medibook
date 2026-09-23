/** Appointment booking API (§24). */
import { handler, ok, created, noContent, readJson, intParam, badRequest } from "@/lib/route";
import { requireAuth, requirePatient } from "@/lib/auth";
import { appointmentDto } from "@/lib/serializers";
import { paginate } from "@/lib/pagination";
import * as appointments from "@/services/appointment.service";
import * as doctors from "@/repositories/doctors.repo";
import {
  appointmentListWhere,
  countAppointments,
  listAppointments,
  listAppointmentsUnpaginated,
} from "@/repositories/appointments.repo";

export const GET = handler(async (ctx) => {
  const user = await requireAuth(ctx.req);
  const qs = new URL(ctx.req.url).searchParams;
  const status = qs.get("status") ?? undefined;
  const role = user.is_superuser ? "admin" : user.role;
  const doctor =
    role === "doctor" ? await doctors.findDoctorByUserId(user.id) : null;
  const where = appointmentListWhere({
    role,
    userId: user.id,
    doctorProfileId: doctor?.id ?? null,
    status,
  });
  return paginate({
    req: ctx.req,
    where,
    count: () => countAppointments(where),
    fetch: ({ skip, take }) =>
      listAppointments(where, skip, take).then((rows) => rows.map(appointmentDto)),
    fetchAll: () =>
      listAppointmentsUnpaginated(where, { status }).then((rows) =>
        rows.map(appointmentDto)
      ),
  });
});

export const POST = handler(async (ctx) => {
  const user = await requirePatient(ctx.req);
  const body = await readJson(ctx.req);
  const appointment = await appointments.bookAppointment(ctx.req, user, body);
  return created(appointmentDto(appointment), "Appointment requested.");
});

export const PATCH = handler(async (ctx) => {
  const user = await requireAuth(ctx.req);
  const qs = new URL(ctx.req.url).searchParams;
  const id = intParam(qs.get("id") ?? qs.get("appointment"));
  if (id === null) throw badRequest("Missing appointment id.");
  const body = await readJson(ctx.req);
  const result = await appointments.patchAppointment(ctx.req, user, id, body);
  return ok(appointmentDto(result.appointment), result.message);
});

export const DELETE = handler(async (ctx) => {
  const user = await requireAuth(ctx.req);
  const qs = new URL(ctx.req.url).searchParams;
  const id = intParam(qs.get("id") ?? qs.get("appointment"));
  if (id === null) throw badRequest("Missing appointment id.");
  await appointments.assertCanAccess(user, id);
  await appointments.destroyAppointment(id);
  return noContent();
});
