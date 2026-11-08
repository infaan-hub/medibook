-- Home Service appointments retain a per-visit location snapshot.
ALTER TYPE "AppointmentType" ADD VALUE IF NOT EXISTS 'HOME_SERVICE';

ALTER TABLE "appointments_appointment"
  ADD COLUMN "home_service_latitude" DOUBLE PRECISION,
  ADD COLUMN "home_service_longitude" DOUBLE PRECISION,
  ADD COLUMN "home_service_location_accuracy" DOUBLE PRECISION;