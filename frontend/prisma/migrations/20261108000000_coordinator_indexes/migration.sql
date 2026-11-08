-- Coordinator performance indexes for appointments table.
CREATE INDEX IF NOT EXISTS "appt_del_type_date_idx" ON "appointments_appointment" ("deleted_at", "appointment_type", "appointment_date");
CREATE INDEX IF NOT EXISTS "appt_del_date_idx" ON "appointments_appointment" ("deleted_at", "appointment_date");
CREATE INDEX IF NOT EXISTS "appt_type_status_del_idx" ON "appointments_appointment" ("appointment_type", "status", "deleted_at");
