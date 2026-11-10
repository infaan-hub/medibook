import { requireAuth } from "@/lib/auth";
import { handler, badRequest, intParam } from "@/lib/route";
import { recordAudit } from "@/repositories/admin.repo";
import { collectPsychotherapyReport } from "@/reports/data/psychotherapy";
import { renderPsychotherapyReport } from "@/reports/pdf/psychotherapy";
import { pdfFilename, pdfResponse } from "@/reports/http";
import { expireStaleSessions } from "@/services/session-expiry.service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = handler(async (ctx) => {
  const user = await requireAuth(ctx.req);
  const requestId = intParam(new URL(ctx.req.url).searchParams.get("id"));
  if (requestId === null) throw badRequest("Select a psychotherapy case before generating its report.");
  await expireStaleSessions();
  const data = await collectPsychotherapyReport(user, requestId);
  const buffer = await renderPsychotherapyReport(data);
  await recordAudit(user.id, "report.psychotherapy", "psychotherapy_request", String(requestId));
  return pdfResponse(buffer, pdfFilename({ report: "Psychotherapy Report", subject: data.patient.name, period: data.request.reference }));
});