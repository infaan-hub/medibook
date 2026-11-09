import { handler, ok, created, badRequest, intParam, readJson } from "@/lib/route";
import { unauthorized, forbidden } from "@/lib/errors";
import type { AuthUser } from "@/lib/auth";
import * as psychotherapy from "@/services/psychotherapy.service";

export const maxDuration = 120;

function assertAuth(user: AuthUser | null): asserts user is AuthUser {
  if (!user) throw unauthorized();
}

export const GET = handler(async ({ req, user }) => {
  assertAuth(user);
  const qs = new URL(req.url).searchParams;
  const id = qs.get("id");
  if (id) {
    return ok(await psychotherapy.getPsychotherapyRequest(user, Number(id)));
  }
  const status = qs.get("status") ?? undefined;
  const patient = qs.get("patient");
  const doctor = qs.get("doctor");
  return ok(
    await psychotherapy.listPsychotherapyRequests(user, {
      status,
      patient_id: patient ? Number(patient) : undefined,
      doctor_id: doctor ? Number(doctor) : undefined,
    })
  );
});

export const POST = handler(async ({ req, user }) => {
  assertAuth(user);
  const body = (await readJson(req)) as any;
  // The client sends actions as ?action=..., while allowing body.action keeps
  // compatibility with API consumers that encode the operation in JSON.
  const queryAction = new URL(req.url).searchParams.get("action");
  const action = String(body?.action ?? queryAction ?? "create");
  if (action === "create") {
    return created(await psychotherapy.createPsychotherapyRequest(user, body));
  }
  if (action === "assign") {
    const id = Number(body?.id);
    const doctorId = Number(body?.doctor_id ?? body?.doctor);
    if (!id || !doctorId) throw badRequest("Missing request or doctor.");
    return ok(await psychotherapy.assignPsychotherapyDoctor(user, id, doctorId));
  }
  if (action === "plan") {
    const id = Number(body?.id);
    if (!id) throw badRequest("Missing request id.");
    return ok(await psychotherapy.planPsychotherapy(user, id, body));
  }
  if (action === "start_session") {
    const id = Number(body?.request_id ?? body?.id);
    const sessionId = Number(body?.session_id);
    if (!id || !sessionId) throw badRequest("Missing request or session.");
    return ok(await psychotherapy.startPsychotherapySession(user, id, sessionId));
  }
  if (action === "update_session") {
    const id = Number(body?.request_id ?? body?.id);
    const sessionId = Number(body?.session_id);
    if (!id || !sessionId) throw badRequest("Missing request or session.");
    return ok(await psychotherapy.updatePsychotherapySession(user, id, sessionId, body));
  }
  if (action === "save_medication") {
    const id = Number(body?.request_id ?? body?.id);
    const sessionId = Number(body?.session_id);
    if (!id || !sessionId) throw badRequest("Missing request or session.");
    return ok(await psychotherapy.savePsychotherapyMedication(user, id, sessionId, body));
  }
  if (action === "complete_session") {
    const id = Number(body?.request_id ?? body?.id);
    const sessionId = Number(body?.session_id);
    if (!id || !sessionId) throw badRequest("Missing request or session.");
    return ok(await psychotherapy.completePsychotherapySession(user, id, sessionId, body));
  }
  if (action === "finalize") {
    const id = Number(body?.id);
    if (!id) throw badRequest("Missing request id.");
    return ok(await psychotherapy.finalizePsychotherapy(user, id));
  }
  if (action === "medication_history") {
    const id = Number(body?.id);
    if (!id) throw badRequest("Missing request id.");
    return ok(await psychotherapy.listPsychotherapyMedicationHistory(user, id));
  }
  throw badRequest("Unknown action.");
});
