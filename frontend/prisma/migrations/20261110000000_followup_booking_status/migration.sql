ALTER TABLE "treatments_medicaltreatment"
    ADD COLUMN "follow_up_booking_status" VARCHAR(16);

UPDATE "treatments_medicaltreatment"
SET "follow_up_booking_status" = 'scheduled'
WHERE "follow_up_appointment_id" IS NOT NULL;

UPDATE "treatments_medicaltreatment"
SET "follow_up_booking_status" = CASE
    WHEN "follow_up_date" < CURRENT_DATE OR BTRIM("follow_up_time") = '' THEN 'failed'
    ELSE 'pending'
END
WHERE "follow_up_date" IS NOT NULL
  AND "follow_up_appointment_id" IS NULL;
