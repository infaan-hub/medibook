-- Add explicit follow-up session date for psychotherapy plans.
ALTER TABLE "psychotherapy_request"
  ADD COLUMN IF NOT EXISTS "plan_followup_date" DATE;