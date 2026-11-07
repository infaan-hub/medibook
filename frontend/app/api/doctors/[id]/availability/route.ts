import { handler, ok } from "@/lib/route";
import { notFound, badRequest } from "@/lib/errors";
import { todayIso, isoWeekday } from "@/lib/dates";
import { listActiveWindowsForWeekday, findDoctorById } from "@/repositories/doctors.repo";

/** GET /api/doctors/{id}/availability/?date=YYYY-MM-DD — available window ranges. */
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

  const weekday = isoWeekday(target);
  const windows = await listActiveWindowsForWeekday(doctor.id, weekday);

  // Available window ranges for the patient to pick a time from.
  const windowsForDisplay = windows.map((w) => ({
    start_time: w.start_time,
    end_time: w.end_time,
    duration_minutes: w.slot_duration_minutes ?? 30,
  }));

  return ok({
    doctor: doctor.id,
    date: target,
    windows: windowsForDisplay,
  });
});
