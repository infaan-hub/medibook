/**
 * GET /api/reports/doctor/summary/?preset=… — the doctor's PRACTICE summary PDF.
 *
 * The practice-level companion to /api/reports/doctor/ (which reports on ONE
 * patient): patient, appointment and emergency counts, the two lifecycle
 * breakdowns, and the busiest patients.
 *
 * The scope is the signed-in doctor — there is no doctor parameter, so a doctor
 * can never read another doctor's numbers.
 */
import { requireDoctor } from "@/lib/auth";
import { handler } from "@/lib/route";
import { recordAudit } from "@/repositories/admin.repo";
import { collectDoctorSummaryReport } from "@/reports/data/doctorSummary";
import { renderDoctorSummaryReport } from "@/reports/pdf/doctorSummary";
import { pdfFilename, pdfResponse, periodQueryFrom, periodToken } from "@/reports/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = handler(async (ctx) => {
  const user = await requireDoctor(ctx.req);
  const data = await collectDoctorSummaryReport(user.id, periodQueryFrom(ctx.req));
  const generatedAt = new Date();
  const buffer = await renderDoctorSummaryReport(data, generatedAt);

  await recordAudit(
    user.id,
    "report.generated",
    "doctor_summary",
    `${data.period.start}..${data.period.end}`
  ).catch(() => undefined);

  return pdfResponse(
    buffer,
    pdfFilename({
      report: "Practice Summary",
      subject: data.doctor.name,
      period: periodToken(data.period),
    })
  );
});