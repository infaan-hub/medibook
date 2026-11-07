-- Remove debug test data created during development.
DELETE FROM "treatments_medicaltreatment" WHERE diagnosis ILIKE '%debug%';
DELETE FROM "appointments_appointment" WHERE reason ILIKE 'Follow-up: Debug%';
