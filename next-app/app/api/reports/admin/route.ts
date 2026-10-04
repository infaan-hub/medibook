/** GET /api/reports/admin/ — platform administrative report, returned as PDF. */
import { requireAdmin } from "@/lib/auth";
import { recordAudit } from "@/repositories/admin.repo";
import { handler } from "@/lib/route";
import { collectAdminReport } from "@/reports/data/admin";
import { adminFilenameReport, adminReportTitle, renderAdminReport } from "@/reports/pdf/admin";
import { pdfFilename, pdfResponse, periodQueryFrom, periodToken } from "@/reports/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = handler(async (ctx) => {
  const user = await requireAdmin(ctx.req);
  const data = await collectAdminReport(periodQueryFrom(ctx.req));
  const generatedAt = new Date();
  const buffer = await renderAdminReport(data, generatedAt);

  await recordAudit(
    user.id,
    "report.generated",
    "admin",
    `${data.period.start}..${data.period.end}`
  ).catch(() => undefined);

  return pdfResponse(
    buffer,
    pdfFilename({ report: adminFilenameReport(data), period: periodToken(data.period) })
  );
});
