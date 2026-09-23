import { handler, ok } from "@/lib/route";
import { notFound } from "@/lib/errors";
import { todayIso } from "@/lib/dates";
import { availableDays } from "@/services/schedule.service";
import { findDoctorById } from "@/repositories/doctors.repo";

/** GET /api/doctors/{id}/available-days/?year=&month= — days with slots. */
export const GET = handler(async ({ req, params }) => {
  const id = Number(params.id);
  if (!Number.isInteger(id)) throw notFound();
  const doctor = await findDoctorById(id);
  if (!doctor) throw notFound();

  const url = new URL(req.url);
  const today = todayIso();
  const year = Number(url.searchParams.get("year") ?? today.slice(0, 4));
  const month = Number(url.searchParams.get("month") ?? Number(today.slice(5, 7)));
  const safeYear = Number.isInteger(year) ? year : Number(today.slice(0, 4));
  const safeMonth = Number.isInteger(month) && month >= 1 && month <= 12 ? month : Number(today.slice(5, 7));

  const days = await availableDays(doctor.id, doctor.is_available, safeYear, safeMonth, today);
  return ok({ doctor: doctor.id, year: safeYear, month: safeMonth, available_days: days });
});
