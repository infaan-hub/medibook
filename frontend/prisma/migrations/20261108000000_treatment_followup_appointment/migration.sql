-- Track the appointment auto-booked from a treatment's Follow-up Date so re-saving
-- the treatment never creates a duplicate follow-up booking.
ALTER TABLE "treatments_medicaltreatment"
    ADD COLUMN "follow_up_appointment_id" INTEGER;