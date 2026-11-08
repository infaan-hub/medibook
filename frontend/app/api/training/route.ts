import { handler, ok, readJson, badRequest } from "@/lib/route";
import { unauthorized, forbidden } from "@/lib/errors";
import type { AuthUser } from "@/lib/auth";
import * as training from "@/services/training.service";

function assertAuth(user: AuthUser | null): asserts user is AuthUser {
  if (!user) throw unauthorized();
}

export const GET = handler(async ({ req, user }) => {
  assertAuth(user);
  const qs = new URL(req.url).searchParams;
  const id = qs.get("id");
  if (id) {
    const r = await training.getTrainingRequest(Number(id));
    if (user.role === "patient" && r.patient_id !== user.id) throw forbidden();
    if (user.role === "doctor") {
      const doc = await (await import("@/repositories/doctors.repo")).findDoctorByUserId(user.id);
      if (!doc || r.doctor_id !== doc.id) throw forbidden();
    }
    return ok(r);
  }
  if (user.role === "patient") {
    return ok(await training.listTrainingRequests({ patient_id: user.id }));
  }
  if (user.role === "doctor") {
    const doc = await (await import("@/repositories/doctors.repo")).findDoctorByUserId(user.id);
    return ok(await training.listTrainingRequests({ doctor_id: doc?.id }));
  }
  if (user.role === "coordinator" || user.role === "admin") {
    const status = qs.get("status") ?? undefined;
    return ok(await training.listTrainingRequests({ status }));
  }
  throw forbidden();
});

export const POST = handler(async ({ req, user }) => {
  assertAuth(user);
  const body = (await readJson(req)) as any;
  const action = new URL(req.url).searchParams.get("action");
  if (action === "create") {
    if (user.role !== "patient") throw forbidden();
    return ok(await training.createTrainingRequest(user, body));
  }
  if (action === "accept") {
    if (user.role !== "coordinator" && user.role !== "admin") throw forbidden();
    const id = Number(new URL(req.url).searchParams.get("id"));
    return ok(await training.acceptTraining(user, id, Number(body.doctor_id)));
  }
  if (action === "start-session") {
    if (user.role !== "doctor" && user.role !== "admin") throw forbidden();
    const id = Number(new URL(req.url).searchParams.get("id"));
    const sessionId = Number(body.session_id);
    return ok(await training.startSession(user, id, sessionId));
  }
  if (action === "add-question") {
    if (user.role !== "doctor" && user.role !== "admin") throw forbidden();
    const sessionId = Number(body.session_id);
    return ok(await training.addQuestion(user, sessionId, body.question, body.challenge));
  }
  if (action === "next-session") {
    if (user.role !== "doctor" && user.role !== "admin") throw forbidden();
    const id = Number(new URL(req.url).searchParams.get("id"));
    const sessionId = Number(body.session_id);
    return ok(await training.nextSession(user, id, sessionId));
  }
  if (action === "cancel") {
    if (user.role !== "patient" && user.role !== "doctor" && user.role !== "coordinator" && user.role !== "admin") throw forbidden();
    const id = Number(new URL(req.url).searchParams.get("id"));
    return ok(await training.cancelTraining(user, id));
  }
  if (action === "reschedule") {
    if (user.role !== "patient" && user.role !== "doctor" && user.role !== "coordinator" && user.role !== "admin") throw forbidden();
    const id = Number(new URL(req.url).searchParams.get("id"));
    return ok(await training.rescheduleTraining(user, id, body.preferred_start_date, body.preferred_days));
  }
  if (action === "complete") {
    if (user.role !== "doctor" && user.role !== "admin") throw forbidden();
    const id = Number(new URL(req.url).searchParams.get("id"));
    const sessionId = Number(body.session_id);
    return ok(await training.completeTraining(user, id, sessionId));
  }
  throw badRequest("Unknown action.");
});
