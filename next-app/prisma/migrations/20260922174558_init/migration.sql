-- CreateEnum
CREATE TYPE "Role" AS ENUM ('patient', 'doctor', 'admin');

-- CreateEnum
CREATE TYPE "AppointmentStatus" AS ENUM ('pending', 'confirmed', 'completed', 'cancelled', 'rejected');

-- CreateEnum
CREATE TYPE "NotificationType" AS ENUM ('appointment_request', 'appointment_confirmed', 'appointment_cancelled', 'appointment_rejected', 'appointment_reminder', 'review', 'system');

-- CreateTable
CREATE TABLE "accounts_user" (
    "id" SERIAL NOT NULL,
    "password" VARCHAR(128) NOT NULL,
    "is_superuser" BOOLEAN NOT NULL DEFAULT false,
    "username" VARCHAR(60) NOT NULL,
    "email" VARCHAR(254) NOT NULL,
    "phone" VARCHAR(16) NOT NULL DEFAULT '',
    "first_name" VARCHAR(150) NOT NULL DEFAULT '',
    "last_name" VARCHAR(150) NOT NULL DEFAULT '',
    "role" "Role" NOT NULL DEFAULT 'patient',
    "profile_image" VARCHAR(100),
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "is_staff" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "accounts_user_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "accounts_passwordresettoken" (
    "id" SERIAL NOT NULL,
    "token" VARCHAR(128) NOT NULL,
    "used_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "user_id" INTEGER NOT NULL,

    CONSTRAINT "accounts_passwordresettoken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "patients_patient" (
    "id" SERIAL NOT NULL,
    "date_of_birth" DATE,
    "gender" VARCHAR(10) NOT NULL DEFAULT '',
    "address" TEXT NOT NULL DEFAULT '',
    "city" VARCHAR(100) NOT NULL DEFAULT '',
    "emergency_contact_name" VARCHAR(150) NOT NULL DEFAULT '',
    "emergency_contact_phone" VARCHAR(16) NOT NULL DEFAULT '',
    "blood_group" VARCHAR(5) NOT NULL DEFAULT '',
    "allergies" TEXT NOT NULL DEFAULT '',
    "medical_history" TEXT NOT NULL DEFAULT '',
    "reminder_preferences" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "user_id" INTEGER NOT NULL,

    CONSTRAINT "patients_patient_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "doctors_doctor" (
    "id" SERIAL NOT NULL,
    "qualifications" TEXT NOT NULL DEFAULT '',
    "experience_years" INTEGER NOT NULL DEFAULT 0,
    "consultation_fee" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "bio" TEXT NOT NULL DEFAULT '',
    "city" VARCHAR(100) NOT NULL DEFAULT '',
    "office_address" TEXT NOT NULL DEFAULT '',
    "is_available" BOOLEAN NOT NULL DEFAULT true,
    "average_rating" DECIMAL(3,2) NOT NULL DEFAULT 0,
    "total_reviews" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "user_id" INTEGER NOT NULL,

    CONSTRAINT "doctors_doctor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "doctors_availability" (
    "id" SERIAL NOT NULL,
    "weekday" INTEGER NOT NULL,
    "start_time" VARCHAR(8) NOT NULL,
    "end_time" VARCHAR(8) NOT NULL,
    "slot_duration_minutes" INTEGER NOT NULL DEFAULT 30,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "doctor_id" INTEGER NOT NULL,

    CONSTRAINT "doctors_availability_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "doctors_availabilitybreak" (
    "id" SERIAL NOT NULL,
    "start_time" VARCHAR(8) NOT NULL,
    "end_time" VARCHAR(8) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "availability_id" INTEGER NOT NULL,

    CONSTRAINT "doctors_availabilitybreak_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "doctors_scheduleexception" (
    "id" SERIAL NOT NULL,
    "date" DATE NOT NULL,
    "start_time" VARCHAR(8),
    "end_time" VARCHAR(8),
    "reason" VARCHAR(255) NOT NULL DEFAULT '',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "doctor_id" INTEGER NOT NULL,

    CONSTRAINT "doctors_scheduleexception_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "specialties_specialty" (
    "id" SERIAL NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "patient_friendly_name" VARCHAR(150) NOT NULL DEFAULT '',
    "description" TEXT NOT NULL DEFAULT '',
    "what_to_expect" TEXT NOT NULL DEFAULT '',
    "icon_url" VARCHAR(200) NOT NULL DEFAULT '',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "specialties_specialty_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "hospitals_hospital" (
    "id" SERIAL NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "city" VARCHAR(100) NOT NULL,
    "address" TEXT NOT NULL DEFAULT '',
    "phone" VARCHAR(16) NOT NULL DEFAULT '',
    "email" VARCHAR(254) NOT NULL DEFAULT '',
    "location_details" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "hospitals_hospital_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "doctors_doctor_hospitals" (
    "doctor_id" INTEGER NOT NULL,
    "hospital_id" INTEGER NOT NULL,

    CONSTRAINT "doctors_doctor_hospitals_pkey" PRIMARY KEY ("doctor_id","hospital_id")
);

-- CreateTable
CREATE TABLE "doctors_doctor_specialties" (
    "doctor_id" INTEGER NOT NULL,
    "specialty_id" INTEGER NOT NULL,

    CONSTRAINT "doctors_doctor_specialties_pkey" PRIMARY KEY ("doctor_id","specialty_id")
);

-- CreateTable
CREATE TABLE "appointments_appointment" (
    "id" SERIAL NOT NULL,
    "appointment_date" DATE NOT NULL,
    "start_time" VARCHAR(8) NOT NULL,
    "end_time" VARCHAR(8) NOT NULL,
    "status" "AppointmentStatus" NOT NULL DEFAULT 'pending',
    "reason" TEXT NOT NULL DEFAULT '',
    "notes" TEXT NOT NULL DEFAULT '',
    "cancel_reason" TEXT NOT NULL DEFAULT '',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "patient_id" INTEGER NOT NULL,
    "doctor_id" INTEGER NOT NULL,
    "hospital_id" INTEGER,

    CONSTRAINT "appointments_appointment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "appointments_appointmentreminder" (
    "id" SERIAL NOT NULL,
    "reminder_type" VARCHAR(5) NOT NULL,
    "scheduled_for" TIMESTAMP(3) NOT NULL,
    "sent" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "appointment_id" INTEGER NOT NULL,

    CONSTRAINT "appointments_appointmentreminder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notifications_notification" (
    "id" SERIAL NOT NULL,
    "notification_type" "NotificationType" NOT NULL DEFAULT 'system',
    "title" VARCHAR(200) NOT NULL,
    "message" TEXT NOT NULL,
    "is_read" BOOLEAN NOT NULL DEFAULT false,
    "push_sent" BOOLEAN NOT NULL DEFAULT false,
    "push_provider_id" VARCHAR(200) NOT NULL DEFAULT '',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "recipient_id" INTEGER NOT NULL,
    "related_appointment_id" INTEGER NOT NULL,

    CONSTRAINT "notifications_notification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notifications_pushsubscription" (
    "id" SERIAL NOT NULL,
    "endpoint" VARCHAR(500) NOT NULL,
    "p256dh_key" VARCHAR(200) NOT NULL DEFAULT '',
    "auth_key" VARCHAR(100) NOT NULL DEFAULT '',
    "fcm_token" VARCHAR(300) NOT NULL DEFAULT '',
    "device_info" JSONB NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "user_id" INTEGER NOT NULL,

    CONSTRAINT "notifications_pushsubscription_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reviews_review" (
    "id" SERIAL NOT NULL,
    "rating" INTEGER NOT NULL,
    "comment" TEXT NOT NULL DEFAULT '',
    "is_visible" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "appointment_id" INTEGER NOT NULL,
    "patient_id" INTEGER NOT NULL,
    "doctor_id" INTEGER NOT NULL,

    CONSTRAINT "reviews_review_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reports_auditevent" (
    "id" SERIAL NOT NULL,
    "action" VARCHAR(80) NOT NULL,
    "target" VARCHAR(160) NOT NULL DEFAULT '',
    "detail" VARCHAR(255) NOT NULL DEFAULT '',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "actor_id" INTEGER,

    CONSTRAINT "reports_auditevent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "treatments_medicaltreatment" (
    "id" SERIAL NOT NULL,
    "diagnosis" VARCHAR(255) NOT NULL DEFAULT '',
    "treatment_notes" TEXT NOT NULL DEFAULT '',
    "prescription" TEXT NOT NULL DEFAULT '',
    "follow_up_date" DATE,
    "follow_up_notes" TEXT NOT NULL DEFAULT '',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "doctor_id" INTEGER NOT NULL,
    "patient_id" INTEGER NOT NULL,
    "appointment_id" INTEGER,

    CONSTRAINT "treatments_medicaltreatment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "treatments_healthrecord" (
    "id" SERIAL NOT NULL,
    "file" VARCHAR(100),
    "record_type" VARCHAR(20) NOT NULL DEFAULT 'other',
    "title" VARCHAR(200) NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "patient_id" INTEGER NOT NULL,
    "doctor_id" INTEGER NOT NULL,
    "appointment_id" INTEGER,

    CONSTRAINT "treatments_healthrecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "blog_article" (
    "id" SERIAL NOT NULL,
    "title" VARCHAR(200) NOT NULL,
    "slug" VARCHAR(220) NOT NULL,
    "excerpt" TEXT NOT NULL DEFAULT '',
    "content" TEXT NOT NULL,
    "image" VARCHAR(100),
    "category" VARCHAR(40) NOT NULL DEFAULT 'general',
    "published" BOOLEAN NOT NULL DEFAULT false,
    "published_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "author_id" INTEGER,

    CONSTRAINT "blog_article_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "auth_refreshtoken" (
    "id" SERIAL NOT NULL,
    "jti" VARCHAR(64) NOT NULL,
    "revoked_at" TIMESTAMP(3),
    "expires_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "user_id" INTEGER NOT NULL,

    CONSTRAINT "auth_refreshtoken_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "accounts_user_username_key" ON "accounts_user"("username");

-- CreateIndex
CREATE UNIQUE INDEX "accounts_user_email_key" ON "accounts_user"("email");

-- CreateIndex
CREATE INDEX "accounts_user_role_idx" ON "accounts_user"("role");

-- CreateIndex
CREATE INDEX "accounts_user_created_at_idx" ON "accounts_user"("created_at");

-- CreateIndex
CREATE UNIQUE INDEX "accounts_passwordresettoken_token_key" ON "accounts_passwordresettoken"("token");

-- CreateIndex
CREATE INDEX "accounts_passwordresettoken_user_id_idx" ON "accounts_passwordresettoken"("user_id");

-- CreateIndex
CREATE INDEX "accounts_passwordresettoken_created_at_idx" ON "accounts_passwordresettoken"("created_at");

-- CreateIndex
CREATE UNIQUE INDEX "patients_patient_user_id_key" ON "patients_patient"("user_id");

-- CreateIndex
CREATE INDEX "patients_patient_created_at_idx" ON "patients_patient"("created_at");

-- CreateIndex
CREATE UNIQUE INDEX "doctors_doctor_user_id_key" ON "doctors_doctor"("user_id");

-- CreateIndex
CREATE INDEX "dr_avail_rat_idx" ON "doctors_doctor"("is_available", "average_rating");

-- CreateIndex
CREATE INDEX "doctors_doctor_is_available_idx" ON "doctors_doctor"("is_available");

-- CreateIndex
CREATE INDEX "doctors_doctor_city_idx" ON "doctors_doctor"("city");

-- CreateIndex
CREATE INDEX "doctors_doctor_created_at_idx" ON "doctors_doctor"("created_at");

-- CreateIndex
CREATE INDEX "avail_dk_wd_act_idx" ON "doctors_availability"("doctor_id", "weekday", "is_active");

-- CreateIndex
CREATE INDEX "doctors_availability_doctor_id_idx" ON "doctors_availability"("doctor_id");

-- CreateIndex
CREATE INDEX "doctors_availability_created_at_idx" ON "doctors_availability"("created_at");

-- CreateIndex
CREATE INDEX "doctors_availabilitybreak_availability_id_idx" ON "doctors_availabilitybreak"("availability_id");

-- CreateIndex
CREATE INDEX "doctors_availabilitybreak_created_at_idx" ON "doctors_availabilitybreak"("created_at");

-- CreateIndex
CREATE INDEX "sched_exc_dk_dt_idx" ON "doctors_scheduleexception"("doctor_id", "date");

-- CreateIndex
CREATE INDEX "doctors_scheduleexception_date_idx" ON "doctors_scheduleexception"("date");

-- CreateIndex
CREATE INDEX "doctors_scheduleexception_doctor_id_idx" ON "doctors_scheduleexception"("doctor_id");

-- CreateIndex
CREATE INDEX "doctors_scheduleexception_created_at_idx" ON "doctors_scheduleexception"("created_at");

-- CreateIndex
CREATE UNIQUE INDEX "specialties_specialty_name_key" ON "specialties_specialty"("name");

-- CreateIndex
CREATE INDEX "specialties_specialty_created_at_idx" ON "specialties_specialty"("created_at");

-- CreateIndex
CREATE INDEX "hospitals_hospital_name_idx" ON "hospitals_hospital"("name");

-- CreateIndex
CREATE INDEX "hospitals_hospital_city_idx" ON "hospitals_hospital"("city");

-- CreateIndex
CREATE INDEX "hospitals_hospital_created_at_idx" ON "hospitals_hospital"("created_at");

-- CreateIndex
CREATE INDEX "doctors_doctor_hospitals_doctor_id_idx" ON "doctors_doctor_hospitals"("doctor_id");

-- CreateIndex
CREATE INDEX "doctors_doctor_hospitals_hospital_id_idx" ON "doctors_doctor_hospitals"("hospital_id");

-- CreateIndex
CREATE INDEX "doctors_doctor_specialties_doctor_id_idx" ON "doctors_doctor_specialties"("doctor_id");

-- CreateIndex
CREATE INDEX "doctors_doctor_specialties_specialty_id_idx" ON "doctors_doctor_specialties"("specialty_id");

-- CreateIndex
CREATE INDEX "appointments_appointment_doctor_id_appointment_date_status_idx" ON "appointments_appointment"("doctor_id", "appointment_date", "status");

-- CreateIndex
CREATE INDEX "appointments_appointment_patient_id_appointment_date_status_idx" ON "appointments_appointment"("patient_id", "appointment_date", "status");

-- CreateIndex
CREATE INDEX "appointments_appointment_appointment_date_idx" ON "appointments_appointment"("appointment_date");

-- CreateIndex
CREATE INDEX "appointments_appointment_status_idx" ON "appointments_appointment"("status");

-- CreateIndex
CREATE INDEX "appointments_appointment_doctor_id_idx" ON "appointments_appointment"("doctor_id");

-- CreateIndex
CREATE INDEX "appointments_appointment_patient_id_idx" ON "appointments_appointment"("patient_id");

-- CreateIndex
CREATE INDEX "appointments_appointment_hospital_id_idx" ON "appointments_appointment"("hospital_id");

-- CreateIndex
CREATE INDEX "appointments_appointment_created_at_idx" ON "appointments_appointment"("created_at");

-- CreateIndex
CREATE INDEX "appointments_appointmentreminder_scheduled_for_idx" ON "appointments_appointmentreminder"("scheduled_for");

-- CreateIndex
CREATE INDEX "appointments_appointmentreminder_sent_idx" ON "appointments_appointmentreminder"("sent");

-- CreateIndex
CREATE INDEX "appointments_appointmentreminder_appointment_id_idx" ON "appointments_appointmentreminder"("appointment_id");

-- CreateIndex
CREATE INDEX "appointments_appointmentreminder_created_at_idx" ON "appointments_appointmentreminder"("created_at");

-- CreateIndex
CREATE UNIQUE INDEX "uniq_appointment_reminder_type" ON "appointments_appointmentreminder"("appointment_id", "reminder_type");

-- CreateIndex
CREATE INDEX "notifications_notification_recipient_id_is_read_created_at_idx" ON "notifications_notification"("recipient_id", "is_read", "created_at");

-- CreateIndex
CREATE INDEX "notifications_notification_recipient_id_notification_type_idx" ON "notifications_notification"("recipient_id", "notification_type");

-- CreateIndex
CREATE INDEX "notifications_notification_recipient_id_idx" ON "notifications_notification"("recipient_id");

-- CreateIndex
CREATE INDEX "notifications_notification_notification_type_idx" ON "notifications_notification"("notification_type");

-- CreateIndex
CREATE INDEX "notifications_notification_is_read_idx" ON "notifications_notification"("is_read");

-- CreateIndex
CREATE INDEX "notifications_notification_created_at_idx" ON "notifications_notification"("created_at");

-- CreateIndex
CREATE UNIQUE INDEX "notifications_pushsubscription_endpoint_key" ON "notifications_pushsubscription"("endpoint");

-- CreateIndex
CREATE INDEX "notifications_pushsubscription_user_id_is_active_idx" ON "notifications_pushsubscription"("user_id", "is_active");

-- CreateIndex
CREATE INDEX "notifications_pushsubscription_user_id_idx" ON "notifications_pushsubscription"("user_id");

-- CreateIndex
CREATE INDEX "notifications_pushsubscription_created_at_idx" ON "notifications_pushsubscription"("created_at");

-- CreateIndex
CREATE UNIQUE INDEX "reviews_review_appointment_id_key" ON "reviews_review"("appointment_id");

-- CreateIndex
CREATE INDEX "reviews_review_doctor_id_is_visible_created_at_idx" ON "reviews_review"("doctor_id", "is_visible", "created_at");

-- CreateIndex
CREATE INDEX "reviews_review_doctor_id_idx" ON "reviews_review"("doctor_id");

-- CreateIndex
CREATE INDEX "reviews_review_patient_id_idx" ON "reviews_review"("patient_id");

-- CreateIndex
CREATE INDEX "reviews_review_rating_idx" ON "reviews_review"("rating");

-- CreateIndex
CREATE INDEX "reviews_review_is_visible_idx" ON "reviews_review"("is_visible");

-- CreateIndex
CREATE INDEX "reviews_review_created_at_idx" ON "reviews_review"("created_at");

-- CreateIndex
CREATE INDEX "reports_auditevent_actor_id_idx" ON "reports_auditevent"("actor_id");

-- CreateIndex
CREATE INDEX "reports_auditevent_created_at_idx" ON "reports_auditevent"("created_at");

-- CreateIndex
CREATE INDEX "treat_dr_pat_idx" ON "treatments_medicaltreatment"("doctor_id", "patient_id");

-- CreateIndex
CREATE INDEX "treatments_medicaltreatment_doctor_id_idx" ON "treatments_medicaltreatment"("doctor_id");

-- CreateIndex
CREATE INDEX "treatments_medicaltreatment_patient_id_idx" ON "treatments_medicaltreatment"("patient_id");

-- CreateIndex
CREATE INDEX "treatments_medicaltreatment_appointment_id_idx" ON "treatments_medicaltreatment"("appointment_id");

-- CreateIndex
CREATE INDEX "treatments_medicaltreatment_created_at_idx" ON "treatments_medicaltreatment"("created_at");

-- CreateIndex
CREATE INDEX "hr_pat_type_idx" ON "treatments_healthrecord"("patient_id", "record_type");

-- CreateIndex
CREATE INDEX "hr_doc_pat_idx" ON "treatments_healthrecord"("doctor_id", "patient_id");

-- CreateIndex
CREATE INDEX "treatments_healthrecord_patient_id_idx" ON "treatments_healthrecord"("patient_id");

-- CreateIndex
CREATE INDEX "treatments_healthrecord_doctor_id_idx" ON "treatments_healthrecord"("doctor_id");

-- CreateIndex
CREATE INDEX "treatments_healthrecord_record_type_idx" ON "treatments_healthrecord"("record_type");

-- CreateIndex
CREATE INDEX "treatments_healthrecord_appointment_id_idx" ON "treatments_healthrecord"("appointment_id");

-- CreateIndex
CREATE INDEX "treatments_healthrecord_created_at_idx" ON "treatments_healthrecord"("created_at");

-- CreateIndex
CREATE UNIQUE INDEX "blog_article_slug_key" ON "blog_article"("slug");

-- CreateIndex
CREATE INDEX "blog_article_author_id_idx" ON "blog_article"("author_id");

-- CreateIndex
CREATE INDEX "blog_article_published_idx" ON "blog_article"("published");

-- CreateIndex
CREATE INDEX "blog_article_category_idx" ON "blog_article"("category");

-- CreateIndex
CREATE INDEX "blog_article_created_at_idx" ON "blog_article"("created_at");

-- CreateIndex
CREATE UNIQUE INDEX "auth_refreshtoken_jti_key" ON "auth_refreshtoken"("jti");

-- CreateIndex
CREATE INDEX "auth_refreshtoken_user_id_idx" ON "auth_refreshtoken"("user_id");

-- AddForeignKey
ALTER TABLE "accounts_passwordresettoken" ADD CONSTRAINT "accounts_passwordresettoken_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "accounts_user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "patients_patient" ADD CONSTRAINT "patients_patient_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "accounts_user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "doctors_doctor" ADD CONSTRAINT "doctors_doctor_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "accounts_user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "doctors_availability" ADD CONSTRAINT "doctors_availability_doctor_id_fkey" FOREIGN KEY ("doctor_id") REFERENCES "doctors_doctor"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "doctors_availabilitybreak" ADD CONSTRAINT "doctors_availabilitybreak_availability_id_fkey" FOREIGN KEY ("availability_id") REFERENCES "doctors_availability"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "doctors_scheduleexception" ADD CONSTRAINT "doctors_scheduleexception_doctor_id_fkey" FOREIGN KEY ("doctor_id") REFERENCES "doctors_doctor"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "doctors_doctor_hospitals" ADD CONSTRAINT "doctors_doctor_hospitals_doctor_id_fkey" FOREIGN KEY ("doctor_id") REFERENCES "doctors_doctor"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "doctors_doctor_hospitals" ADD CONSTRAINT "doctors_doctor_hospitals_hospital_id_fkey" FOREIGN KEY ("hospital_id") REFERENCES "hospitals_hospital"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "doctors_doctor_specialties" ADD CONSTRAINT "doctors_doctor_specialties_doctor_id_fkey" FOREIGN KEY ("doctor_id") REFERENCES "doctors_doctor"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "doctors_doctor_specialties" ADD CONSTRAINT "doctors_doctor_specialties_specialty_id_fkey" FOREIGN KEY ("specialty_id") REFERENCES "specialties_specialty"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "appointments_appointment" ADD CONSTRAINT "appointments_appointment_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "accounts_user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "appointments_appointment" ADD CONSTRAINT "appointments_appointment_doctor_id_fkey" FOREIGN KEY ("doctor_id") REFERENCES "doctors_doctor"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "appointments_appointment" ADD CONSTRAINT "appointments_appointment_hospital_id_fkey" FOREIGN KEY ("hospital_id") REFERENCES "hospitals_hospital"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "appointments_appointmentreminder" ADD CONSTRAINT "appointments_appointmentreminder_appointment_id_fkey" FOREIGN KEY ("appointment_id") REFERENCES "appointments_appointment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications_notification" ADD CONSTRAINT "notifications_notification_recipient_id_fkey" FOREIGN KEY ("recipient_id") REFERENCES "accounts_user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications_notification" ADD CONSTRAINT "notifications_notification_related_appointment_id_fkey" FOREIGN KEY ("related_appointment_id") REFERENCES "appointments_appointment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications_pushsubscription" ADD CONSTRAINT "notifications_pushsubscription_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "accounts_user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reviews_review" ADD CONSTRAINT "reviews_review_appointment_id_fkey" FOREIGN KEY ("appointment_id") REFERENCES "appointments_appointment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reviews_review" ADD CONSTRAINT "reviews_review_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "accounts_user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reviews_review" ADD CONSTRAINT "reviews_review_doctor_id_fkey" FOREIGN KEY ("doctor_id") REFERENCES "doctors_doctor"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reports_auditevent" ADD CONSTRAINT "reports_auditevent_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "accounts_user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "treatments_medicaltreatment" ADD CONSTRAINT "treatments_medicaltreatment_doctor_id_fkey" FOREIGN KEY ("doctor_id") REFERENCES "doctors_doctor"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "treatments_medicaltreatment" ADD CONSTRAINT "treatments_medicaltreatment_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "accounts_user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "treatments_medicaltreatment" ADD CONSTRAINT "treatments_medicaltreatment_appointment_id_fkey" FOREIGN KEY ("appointment_id") REFERENCES "appointments_appointment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "treatments_healthrecord" ADD CONSTRAINT "treatments_healthrecord_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "accounts_user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "treatments_healthrecord" ADD CONSTRAINT "treatments_healthrecord_doctor_id_fkey" FOREIGN KEY ("doctor_id") REFERENCES "doctors_doctor"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "treatments_healthrecord" ADD CONSTRAINT "treatments_healthrecord_appointment_id_fkey" FOREIGN KEY ("appointment_id") REFERENCES "appointments_appointment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "blog_article" ADD CONSTRAINT "blog_article_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "accounts_user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "auth_refreshtoken" ADD CONSTRAINT "auth_refreshtoken_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "accounts_user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
