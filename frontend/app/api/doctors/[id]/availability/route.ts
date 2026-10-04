import { handler, ok } from "@/lib/route";
import { notFound, badRequest } from "@/lib/errors";
import { todayIso, hhmm } from "@/lib/dates";
import { availableSlots } from "@/services/schedule.service";
import { findDoctorById } from "@/repositories/doctors.repo";

/** GET /api/doctors/{id}/availability/?date=YYYY-MM-DD — bookable slots. */
export const GET = handler(async ({ req, params }) => {
  const id = Number(params.id);
  if (!Number.isInteger(id)) throw notFound();
  const doctor = await findDoctorById(id);
  if (!doctor) throw notFound();

  const raw = new URL(req.url).searchParams.get("date");
  let target: string;
  if (raw) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(raw) || Number.isNaN(Date.parse(`${raw}T00:00:00Z`))) {
      throw badRequest("Use date=YYYY-MM-DD.", { date: ["Use date=YYYY-MM-DD."] });
    }
    target = raw;
  } else {
    target = todayIso();
  }

  const slots = await availableSlots(doctor.id, doctor.is_available, target);
  return ok({
    doctor: doctor.id,
    date: target,
    slots: slots.map((slot) => ({
      start_time: hhmm(slot.start_time),
      end_time: hhmm(slot.end_time),
    })),
  });
});
