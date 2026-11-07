-- Doctor-written description stored with each medical treatment and shown in
-- the patient report's "Doctor description" section.
ALTER TABLE "treatments_medicaltreatment"
    ADD COLUMN "doctor_description" TEXT NOT NULL DEFAULT '';
