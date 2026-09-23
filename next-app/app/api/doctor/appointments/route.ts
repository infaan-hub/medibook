/** GET /api/doctor/appointments/ — doctor's own schedule (unpaginated). */
import { handler, ok } from "@/lib/route";
import { requireDoctor } from "@/lib/auth";
import { appointmentDto } from "@/lib/serializers";
import { notFound } from "@/lib/errors";
import { findDoctorByUserId } from "@/repositories/doctors.repo";
import { listAppointmentsUnpaginated } from "@/repositories/appointments.repo";

export const GET = handler(async (ctx) => {
  const user = await requireDoctor(ctx.req);
  const doctor = await findDoctorByUserId(user.id);
  if (!doctor) throw notFound("Create your doctor profile first.");
  const status = new URL(ctx.req.url).searchParams.get("status") ?? undefined;
  const rows = await listAppointmentsUnpaginated({ doctor_id: doctor.id }, { status });
  return ok(rows.map(appointmentDto));
});
