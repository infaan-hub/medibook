/**
 * Automatic expiry for planned training and psychology-service sessions.
 *
 * A session expires only when it was **never started** and its scheduled window
 * has fully passed:
 *   • training sessions are date-only, so they expire when that UTC day ends;
 *   • psychology-service sessions expire at their scheduled end time.
 *
 * Once a request has no pending/scheduled/in-progress session left and at least
 * one session expired, the request itself becomes `expired`. The patient is
 * notified that they need to submit a new request.
 *
 * The pass is idempotent: every write is guarded by the pre-expiry status, so
 * the in-process tick, the cron endpoint and an ordinary API read can safely
 * run it at the same time.
 */
import { prisma, withSystemDatabaseIdentity } from "@/lib/db";
import { combineDateTime } from "@/lib/dates";
import { broadcastPlatformDataUpdated, notify } from "@/lib/notify";

/** Request states in which a not-yet-started session is still actionable. */
const TRAINING_ACTIVE_REQUEST_STATUSES = ["pending", "accepted", "scheduled", "in_progress"];
const PSYCHOTHERAPY_ACTIVE_REQUEST_STATUSES = ["accepted", "in_progress", "follow_up"];

/** Sessions that can still be started (so the parent request is not over). */
const TRAINING_STARTABLE_SESSION_STATUSES = ["pending", "in_progress"];
const PSYCHOTHERAPY_STARTABLE_SESSION_STATUSES = ["scheduled", "in_progress"];

export interface SessionExpiryResult {
  training_sessions: number;
  training_requests: number;
  psychotherapy_sessions: number;
  psychotherapy_requests: number;
}

const emptyResult = (): SessionExpiryResult => ({
  training_sessions: 0,
  training_requests: 0,
  psychotherapy_sessions: 0,
  psychotherapy_requests: 0,
});

function startOfUtcDay(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

function sessionEnd(scheduledDate: Date, endTime: string): Date | null {
  const date = scheduledDate.toISOString().slice(0, 10);
  const end = combineDateTime(date, endTime || "23:59:59");
  return Number.isNaN(end.getTime()) ? null : end;
}

async function expireTrainingSessions(now: Date, result: SessionExpiryResult): Promise<void> {
  const dayStart = startOfUtcDay(now);

  // Training has no start/end clock time in its data model. A session is
  // therefore expired once its calendar day (UTC) has ended and it was never
  // started. Cancelled/completed requests are left untouched.
  const stale = await prisma.trainingSession.findMany({
    where: {
      status: "pending",
      session_date: { lt: dayStart },
      training: { status: { in: TRAINING_ACTIVE_REQUEST_STATUSES } },
    },
    select: { id: true },
  });

  if (stale.length > 0) {
    const changed = await prisma.trainingSession.updateMany({
      where: { id: { in: stale.map((session) => session.id) }, status: "pending" },
      data: { status: "expired", expired_at: now },
    });
    result.training_sessions += changed.count;
  }

  // Only close the request when nothing can be started any more and at least
  // one of its sessions actually expired. Mixed completed + expired trainings
  // are therefore closed as expired, not silently reported as complete.
  const requests = await prisma.trainingRequest.findMany({
    where: {
      status: { in: TRAINING_ACTIVE_REQUEST_STATUSES },
      sessions: {
        some: { status: "expired" },
        none: { status: { in: TRAINING_STARTABLE_SESSION_STATUSES } },
      },
    },
    select: { id: true, patient_id: true, training_topic: true },
  });

  for (const request of requests) {
    const changed = await prisma.trainingRequest.updateMany({
      where: { id: request.id, status: { in: TRAINING_ACTIVE_REQUEST_STATUSES } },
      data: { status: "expired", expired_at: now },
    });
    if (changed.count !== 1) continue;

    result.training_requests += 1;
    await notify(
      request.patient_id,
      "appointment_request",
      `Your training "${request.training_topic}" has expired because its session was not started in time. Please request a new training.`,
      null,
      "Training expired"
    ).catch((error) => console.error("[session-expiry] training notification failed", error));
  }
}

async function expirePsychotherapySessions(now: Date, result: SessionExpiryResult): Promise<void> {
  const dayStart = startOfUtcDay(now);

  // Include today's sessions so their end time can be compared precisely;
  // future dates cannot have ended yet.
  const candidates = await prisma.psychotherapySession.findMany({
    where: {
      status: "scheduled",
      scheduled_date: { lte: dayStart },
      request: { status: { in: PSYCHOTHERAPY_ACTIVE_REQUEST_STATUSES } },
    },
    select: { id: true, scheduled_date: true, end_time: true },
  });

  const staleIds = candidates
    .filter((session) => {
      const end = sessionEnd(session.scheduled_date, session.end_time);
      return end !== null && end.getTime() <= now.getTime();
    })
    .map((session) => session.id);

  if (staleIds.length > 0) {
    const changed = await prisma.psychotherapySession.updateMany({
      where: { id: { in: staleIds }, status: "scheduled" },
      data: { status: "expired", expired_at: now },
    });
    result.psychotherapy_sessions += changed.count;
  }

  const requests = await prisma.psychotherapyRequest.findMany({
    where: {
      status: { in: PSYCHOTHERAPY_ACTIVE_REQUEST_STATUSES },
      sessions: {
        some: { status: "expired" },
        none: { status: { in: PSYCHOTHERAPY_STARTABLE_SESSION_STATUSES } },
      },
    },
    select: { id: true, patient_id: true },
  });

  for (const request of requests) {
    const changed = await prisma.psychotherapyRequest.updateMany({
      where: { id: request.id, status: { in: PSYCHOTHERAPY_ACTIVE_REQUEST_STATUSES } },
      data: { status: "expired", expired_at: now },
    });
    if (changed.count !== 1) continue;

    result.psychotherapy_requests += 1;
    await notify(
      request.patient_id,
      "appointment_confirmed",
      "Your psychology service request has expired because a scheduled session was not started in time. Please request a new psychology service session.",
      null,
      "Psychology service expired"
    ).catch((error) => console.error("[session-expiry] psychotherapy notification failed", error));
  }
}

/**
 * Expire every stale training / psychology-service session and close requests
 * that have no startable session left. Safe to call from any request context.
 */
export async function expireStaleSessions(now: Date = new Date()): Promise<SessionExpiryResult> {
  return withSystemDatabaseIdentity(async () => {
    const result = emptyResult();
    await Promise.all([
      expireTrainingSessions(now, result),
      expirePsychotherapySessions(now, result),
    ]);
    if (result.training_sessions > 0 || result.training_requests > 0) {
      broadcastPlatformDataUpdated("training");
    }
    if (result.psychotherapy_sessions > 0 || result.psychotherapy_requests > 0) {
      broadcastPlatformDataUpdated("psychotherapy");
    }
    return result;
  });
}
