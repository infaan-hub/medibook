-- Django CheckConstraints + the partial unique index that prevents double
-- booking (models.Appointment.Meta UniqueConstraint "uniq_live_doctor_slot").
-- Prisma's schema language cannot express CHECK constraints or partial
-- indexes, so they are applied through this follow-up migration.
--
-- Times are zero-padded "HH:MM:SS" strings, so lexicographic comparison is
-- chronological comparison — identical semantics to Django's TimeField checks.

ALTER TABLE "doctors_availability" ADD CONSTRAINT "availability_end_after_start" CHECK ("end_time" > "start_time");

ALTER TABLE "doctors_availabilitybreak" ADD CONSTRAINT "availability_break_end_after_start" CHECK ("end_time" > "start_time");

ALTER TABLE "doctors_scheduleexception" ADD CONSTRAINT "schedule_exception_times_pair" CHECK (("start_time" IS NULL AND "end_time" IS NULL) OR ("start_time" IS NOT NULL AND "end_time" IS NOT NULL));

ALTER TABLE "doctors_scheduleexception" ADD CONSTRAINT "schedule_exception_end_after_start" CHECK (("start_time" IS NULL AND "end_time" IS NULL) OR ("end_time" > "start_time"));

ALTER TABLE "appointments_appointment" ADD CONSTRAINT "appointment_end_after_start" CHECK ("end_time" > "start_time");

-- One live (non-cancelled, non-rejected) row per doctor/date/start slot.
CREATE UNIQUE INDEX "uniq_live_doctor_slot" ON "appointments_appointment"("doctor_id", "appointment_date", "start_time") WHERE "status" NOT IN ('cancelled', 'rejected');
