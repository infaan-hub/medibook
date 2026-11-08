/** System Coordinator APIs: overview, operations, doctor roster and patient history. */
import { handler, ok, readJson, badRequest } from "@/lib/route";
import { requireAuth } from "@/lib/auth";
import { forbidden } from "@/lib/errors";
import * as coordinator from "@/services/coordinator.service";

function assertCoordinator(role: string) { if (role !== "coordinator") throw forbidden("This action is available to system coordinators only."); }
export const GET = handler(async ({ req }) => {
  const user = await requireAuth(req); assertCoordinator(user.role);
  const qs = new URL(req.url).searchParams; const view = qs.get("view") ?? "overview";
  if (view === "overview") return ok(await coordinator.overview());
  if (view === "doctors") return ok(await coordinator.doctorSchedule(qs.get("date") ?? new Date().toISOString().slice(0,10)));
  if (view === "appointments") return ok(await coordinator.listAppointments(qs.get("type") ?? undefined));
  if (view === "patients") return ok(await coordinator.listPatients(qs.get("search") ?? ""));
  if (view === "history") return ok(await coordinator.patientHistory(user, Number(qs.get("patient"))));
  throw badRequest("Select a valid coordinator view.");
});

export const POST = handler(async ({ req }) => {
  const user = await requireAuth(req); assertCoordinator(user.role);
  const qs = new URL(req.url).searchParams; const action = qs.get("action");
  const body = await readJson(req) as { doctor_id?: number };
  const appointmentId = Number(qs.get("appointment"));
  if (!Number.isInteger(appointmentId) || appointmentId < 1) throw badRequest("Select a valid appointment.");
  if (!Number.isInteger(body.doctor_id) || !body.doctor_id) throw badRequest("Select a valid doctor.");
  if (action === "reassign-appointment") return ok(await coordinator.reassignAppointment(user, appointmentId, body.doctor_id));
  if (action === "reassign-emergency") return ok(await coordinator.reassignEmergency(user, appointmentId, body.doctor_id));
  throw badRequest("Select a valid coordinator action.");
});
