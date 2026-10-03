import { handler, ok, requireDoctor } from "@/lib/route";
import { userPayload } from "@/lib/serializers";
import {
  completeDoctorOnboarding,
  doctorOnboardingStatus,
} from "@/services/onboarding.service";

/**
 * GET/POST /api/doctors/me/onboarding/ — first-login setup state.
 *
 * GET  reports the server-evaluated per-step requirements plus the persistent
 *      completion flag, so the client can resume at the first incomplete step
 *      after any refresh, logout/login or device change.
 * POST takes NO body: it re-validates every requirement on the server and only
 *      then marks onboarding complete. A client cannot claim completion.
 *
 * Both answers carry the signed-in `user` payload (with the refreshed flag) so
 * the session store never has to fabricate one.
 */
export const GET = handler(async ({ req }) => {
  const user = await requireDoctor(req);
  const status = await doctorOnboardingStatus(user);
  return ok({ ...status, user: userPayload(user, req) });
});

export const POST = handler(async ({ req }) => {
  const user = await requireDoctor(req);
  const { status, user: updated } = await completeDoctorOnboarding(user);
  return ok(
    { ...status, user: userPayload(updated, req) },
    "Doctor onboarding complete."
  );
});
