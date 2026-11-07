-- Store the follow-up time alongside the date so the patient history card can
-- show the full follow-up appointment slot.
ALTER TABLE "treatments_medicaltreatment"
    ADD COLUMN "follow_up_time" TEXT NOT NULL DEFAULT '';