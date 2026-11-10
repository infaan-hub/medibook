-- Automatic expiry for training and psychology-service sessions.
-- A session that was never started before its scheduled window ended is kept
-- with status 'expired'; the parent request is also flagged so both the patient
-- and staff can see that a new request is required.

ALTER TABLE "training_request" ADD COLUMN "expired_at" TIMESTAMP(3);
ALTER TABLE "training_session" ADD COLUMN "expired_at" TIMESTAMP(3);
ALTER TABLE "psychotherapy_request" ADD COLUMN "expired_at" TIMESTAMP(3);
ALTER TABLE "psychotherapy_session" ADD COLUMN "expired_at" TIMESTAMP(3);

CREATE INDEX "training_session_status_session_date_idx" ON "training_session"("status", "session_date");
CREATE INDEX "psychotherapy_session_status_scheduled_date_idx" ON "psychotherapy_session"("status", "scheduled_date");
