/**
 * GET /api/emergency/eligibility/ — server-authoritative answer to "may this
 * patient file another emergency right now?" (§7, §27).
 *
 *   { canCreateEmergency, reason, availableAt, status, activeEmergencyId, message }
 *
 * Reading it also sweeps the 30-minute timeout, so a patient who returns after
 * closing the browser sees their real state immediately (§18). The client uses
 * the response to render the form vs. the status card and to show the countdown;
 * POST /api/emergency/ re-checks everything anyway, so this is never the only
 * line of defence.
 */
import { handler, ok } from "@/lib/route";
import { requirePatient } from "@/lib/auth";
import { getEmergencyEligibility } from "@/services/emergency.service";

export const GET = handler(async ({ req }) => {
  const user = await requirePatient(req);
  const eligibility = await getEmergencyEligibility(user.id);
  return ok(eligibility, eligibility.canCreateEmergency ? "" : eligibility.message);
});
