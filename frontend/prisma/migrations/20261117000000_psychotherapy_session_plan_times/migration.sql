-- Replace psychotherapy frequency with explicit current/follow-up session times.
ALTER TABLE "psychotherapy_request"
  DROP COLUMN IF EXISTS "plan_frequency",
  ADD COLUMN IF NOT EXISTS "plan_followup_time" VARCHAR(8);