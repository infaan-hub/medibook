-- Remove approach and review-point fields from the psychotherapy plan.
ALTER TABLE "psychotherapy_request"
  DROP COLUMN IF EXISTS "plan_approach",
  DROP COLUMN IF EXISTS "plan_review_after";