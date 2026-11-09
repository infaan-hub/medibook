/**
 * GET /api/reports/training/?id=<training id> — one training request as a PDF.
 *
 * The training id comes from the query, but the relationship is verified
 * server-side inside `collectTrainingReport`:
 *   - doctors may print only trainings assigned to them,
 *   - patients may print only their own training,
 *   - coordinators/admins may print any training.
 */
import { requireAuth } from "@/lib/auth";
import { handler, badRequest, intParam } from "@/lib/route";
import { recordAudit } from "@/repositories/admin.repo";
import { collectTrainingReport } from "@/reports/data/training";
import { renderTrainingReport } from "@/reports/pdf/training";
import { pdfFilename, pdfResponse } from "@/reports/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = handler(async (ctx) => {
  const user = await requireAuth(ctx.req);
  const trainingId = intParam(new URL(ctx.req.url).searchParams.get("id"));
  if (trainingId === null) throw badRequest("Select a training before generating its report.");

  const data = await collectTrainingReport(user, trainingId);
  const generatedAt = new Date();
  const buffer = await renderTrainingReport(data, generatedAt);

  await recordAudit(
    user.id,
    "report.generated",
    "training",
    `${data.training.reference} ${data.training.status}`
  ).catch(() => undefined);

  return pdfResponse(
    buffer,
    pdfFilename({
      report: "Training Report",
      subject: `${data.patient.name} — ${data.training.topic}`,
      period: data.training.startDate,
    })
  );
});
