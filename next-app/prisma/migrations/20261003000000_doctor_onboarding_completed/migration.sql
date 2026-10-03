-- Doctor first-login onboarding: a persistent completion flag on the account.
-- The flag is only ever set to TRUE by the server AFTER it has verified every
-- required step (active push subscription, valid practice coordinates,
-- uploaded profile image, completed My Doctor information) — a client payload
-- claiming completion is never trusted.
ALTER TABLE "accounts_user" ADD COLUMN "doctor_onboarding_completed" BOOLEAN NOT NULL DEFAULT false;

-- Existing doctor accounts keep the access they already have: backfill TRUE
-- only for the ones that already satisfy every required step, so a doctor who
-- is genuinely set up is never pushed back through setup, while anyone still
-- missing required information is guided through it once on their next sign-in.
UPDATE "accounts_user" AS u
SET "doctor_onboarding_completed" = TRUE
WHERE u."role" = 'doctor'
  AND u."first_name" <> ''
  AND u."last_name" <> ''
  AND u."profile_image_id" IS NOT NULL
  AND EXISTS (
    SELECT 1
    FROM "doctors_doctor" AS d
    WHERE d."user_id" = u."id"
      AND d."latitude" IS NOT NULL
      AND d."longitude" IS NOT NULL
      AND d."latitude" BETWEEN -90 AND 90
      AND d."longitude" BETWEEN -180 AND 180
  )
  AND EXISTS (
    SELECT 1
    FROM "doctors_doctor_specialties" AS ds
    JOIN "doctors_doctor" AS d ON d."id" = ds."doctor_id"
    WHERE d."user_id" = u."id"
  )
  AND EXISTS (
    SELECT 1
    FROM "notifications_pushsubscription" AS ps
    WHERE ps."user_id" = u."id"
      AND ps."is_active" = TRUE
  );
