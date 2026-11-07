ALTER TABLE "appointments_appointment"
    ADD COLUMN "deleted_at" TIMESTAMP(3),
    ADD COLUMN "patient_snapshot" JSONB;

CREATE INDEX "appointments_appointment_deleted_at_idx"
    ON "appointments_appointment"("deleted_at");