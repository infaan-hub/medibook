-- Rename the appointment lifecycle values so the status reports what actually
-- happened instead of the generic booking vocabulary:
--   confirmed → accepted : the doctor accepted the request (visit is on the calendar)
--   completed → done     : the visit took place and the doctor closed it
-- RENAME VALUE keeps every existing row valid — no data rewrite needed.
ALTER TYPE "AppointmentStatus" RENAME VALUE 'confirmed' TO 'accepted';
ALTER TYPE "AppointmentStatus" RENAME VALUE 'completed' TO 'done';
