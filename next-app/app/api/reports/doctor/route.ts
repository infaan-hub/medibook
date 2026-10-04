/**
 * GET /api/reports/doctor/?patient=<id> — the doctor's medical report on one
 * of their patients, returned as PDF.
 *
 * The patient id comes from the query, but the relationship is verified
 * server-side inside `collectDoctorReport` (§25 authorization pipeline).
 */
import { requireDoctor } from "@/lib/auth";
import { handler } from "@/lib/route";
import { recordAudit } from "@/repositories/admin.repo";
import { collectDoctorReport } from "@/reports/data/doctor";
import { renderDoctorReport } from "@/reports/pdf/doctor";
import { pdfFilename, pdfResponse, periodQueryFrom, periodToken } from "@/reports/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = handler(async (ctx) => {
  const user = await requireDoctor(ctx.req);
  const data = await collectDoctorReport(user.id, {
    ...periodQueryFrom(ctx.req),
    patient: new URL(ctx.req.url).searchParams.get("patient"),
  });
  const generatedAt = new Date();
  const buffer = await renderDoctorReport(data, generatedAt);

  await recordAudit(
    user.id,
    "report.generated",
    "doctor",
    `${data.patient.reference} ${data.period.start}..${data.period.end}`
  ).catch(() => undefined);

  return pdfResponse(
    buffer,
    pdfFilename({
      report: "Medical Report",
      subject: data.patient.name,
      period: periodToken(data.period),
    })
  );
});
