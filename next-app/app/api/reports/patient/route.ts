/** GET /api/reports/patient/ — the signed-in patient's own record, as PDF. */
import { requirePatient } from "@/lib/auth";
import { handler } from "@/lib/route";
import { recordAudit } from "@/repositories/admin.repo";
import { collectPatientReport } from "@/reports/data/patient";
import { renderPatientReport } from "@/reports/pdf/patient";
import { pdfFilename, pdfResponse, periodQueryFrom, periodToken } from "@/reports/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = handler(async (ctx) => {
  const user = await requirePatient(ctx.req);
  // The chart is ALWAYS the caller's own — no patient id is ever accepted.
  const data = await collectPatientReport(user.id, periodQueryFrom(ctx.req));
  const generatedAt = new Date();
  const buffer = await renderPatientReport(data, generatedAt);

  await recordAudit(user.id, "report.generated", "patient", `${data.period.start}..${data.period.end}`).catch(
    () => undefined
  );

  return pdfResponse(
    buffer,
    pdfFilename({ report: "My Medical Report", period: periodToken(data.period) })
  );
});
