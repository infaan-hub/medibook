-- The application connects with neondb_owner. Run request queries as a
-- restricted role so table owners/BYPASSRLS privileges cannot skip policies.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'medibook_runtime') THEN
    CREATE ROLE medibook_runtime NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS;
  END IF;
END $$;

GRANT medibook_runtime TO neondb_owner;
GRANT USAGE ON SCHEMA public TO medibook_runtime;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO medibook_runtime;
GRANT USAGE, SELECT, UPDATE ON ALL SEQUENCES IN SCHEMA public TO medibook_runtime;
ALTER DEFAULT PRIVILEGES FOR ROLE neondb_owner IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO medibook_runtime;
ALTER DEFAULT PRIVILEGES FOR ROLE neondb_owner IN SCHEMA public
  GRANT USAGE, SELECT, UPDATE ON SEQUENCES TO medibook_runtime;

CREATE OR REPLACE FUNCTION public.app_user_id() RETURNS integer
LANGUAGE sql STABLE PARALLEL SAFE AS $$ SELECT NULLIF(current_setting('app.user_id', true), '')::integer $$;
CREATE OR REPLACE FUNCTION public.app_role() RETURNS text
LANGUAGE sql STABLE PARALLEL SAFE AS $$ SELECT COALESCE(NULLIF(current_setting('app.role', true), ''), 'anonymous') $$;
CREATE OR REPLACE FUNCTION public.app_mode() RETURNS text
LANGUAGE sql STABLE PARALLEL SAFE AS $$ SELECT COALESCE(NULLIF(current_setting('app.mode', true), ''), 'anonymous') $$;
CREATE OR REPLACE FUNCTION public.app_is_privileged() RETURNS boolean
LANGUAGE sql STABLE PARALLEL SAFE AS $$
  SELECT public.app_mode() IN ('auth', 'system') OR public.app_role() IN ('admin', 'coordinator')
      OR COALESCE(NULLIF(current_setting('app.is_superuser', true), ''), 'false') = 'true'
$$;

CREATE OR REPLACE FUNCTION public.app_doctor_matches(target_doctor integer) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public AS $$
  SELECT target_doctor IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.doctors_doctor d WHERE d.id = target_doctor AND d.user_id = public.app_user_id()
  )
$$;
CREATE OR REPLACE FUNCTION public.app_can_access_patient(target_patient integer) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public AS $$
  SELECT public.app_is_privileged() OR target_patient = public.app_user_id() OR EXISTS (
    SELECT 1 FROM public.doctors_doctor d JOIN public.appointments_appointment a ON a.doctor_id = d.id
    WHERE d.user_id = public.app_user_id() AND a.patient_id = target_patient
      AND a.status::text IN ('accepted', 'in_progress', 'done')
  )
$$;
CREATE OR REPLACE FUNCTION public.app_can_access_appointment(target_appointment integer) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public AS $$
  SELECT public.app_is_privileged() OR EXISTS (
    SELECT 1 FROM public.appointments_appointment a LEFT JOIN public.doctors_doctor d ON d.id = a.doctor_id
    WHERE a.id = target_appointment AND (a.patient_id = public.app_user_id() OR d.user_id = public.app_user_id())
  )
$$;
CREATE OR REPLACE FUNCTION public.app_can_access_psychotherapy(target_request integer) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public AS $$
  SELECT public.app_is_privileged() OR EXISTS (
    SELECT 1 FROM public.psychotherapy_request p LEFT JOIN public.doctors_doctor d ON d.id = p.doctor_id
    WHERE p.id = target_request AND (p.patient_id = public.app_user_id() OR d.user_id = public.app_user_id())
  )
$$;

ALTER TABLE public.patients_patient ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.patients_patient FORCE ROW LEVEL SECURITY;
CREATE POLICY patient_profile_access ON public.patients_patient FOR ALL
  USING (public.app_can_access_patient(user_id)) WITH CHECK (public.app_can_access_patient(user_id));

ALTER TABLE public.appointments_appointment ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.appointments_appointment FORCE ROW LEVEL SECURITY;
CREATE POLICY appointment_access ON public.appointments_appointment FOR ALL
  USING (public.app_can_access_appointment(id))
  WITH CHECK (public.app_is_privileged() OR patient_id = public.app_user_id() OR public.app_doctor_matches(doctor_id));

ALTER TABLE public.appointments_appointmentreminder ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.appointments_appointmentreminder FORCE ROW LEVEL SECURITY;
CREATE POLICY appointment_reminder_access ON public.appointments_appointmentreminder FOR ALL
  USING (public.app_can_access_appointment(appointment_id))
  WITH CHECK (public.app_is_privileged() OR public.app_can_access_appointment(appointment_id));

DO $$ DECLARE t text; BEGIN
  FOREACH t IN ARRAY ARRAY['treatments_medicaltreatment','prescriptions_prescription','vitals_vital',
    'labs_laborder','treatments_healthrecord','training_request','psychotherapy_request'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE public.%I FORCE ROW LEVEL SECURITY', t);
  END LOOP;
END $$;

CREATE POLICY medical_treatment_access ON public.treatments_medicaltreatment FOR ALL
  USING (public.app_can_access_patient(patient_id))
  WITH CHECK (public.app_is_privileged() OR (public.app_doctor_matches(doctor_id) AND public.app_can_access_patient(patient_id)));
CREATE POLICY prescription_access ON public.prescriptions_prescription FOR ALL
  USING (public.app_can_access_patient(patient_id))
  WITH CHECK (public.app_is_privileged() OR (public.app_doctor_matches(doctor_id) AND public.app_can_access_patient(patient_id)));
CREATE POLICY vital_access ON public.vitals_vital FOR ALL
  USING (public.app_can_access_patient(patient_id))
  WITH CHECK (public.app_is_privileged() OR (public.app_doctor_matches(doctor_id) AND public.app_can_access_patient(patient_id)));
CREATE POLICY lab_order_access ON public.labs_laborder FOR ALL
  USING (public.app_can_access_patient(patient_id))
  WITH CHECK (public.app_is_privileged() OR (public.app_doctor_matches(doctor_id) AND public.app_can_access_patient(patient_id)));
CREATE POLICY health_record_access ON public.treatments_healthrecord FOR ALL
  USING (public.app_can_access_patient(patient_id))
  WITH CHECK (public.app_is_privileged() OR (public.app_doctor_matches(doctor_id) AND public.app_can_access_patient(patient_id)));
CREATE POLICY training_request_access ON public.training_request FOR ALL
  USING (public.app_is_privileged() OR patient_id = public.app_user_id() OR (doctor_id IS NOT NULL AND public.app_doctor_matches(doctor_id)))
  WITH CHECK (public.app_is_privileged() OR patient_id = public.app_user_id() OR (doctor_id IS NOT NULL AND public.app_doctor_matches(doctor_id)));
CREATE POLICY psychotherapy_request_access ON public.psychotherapy_request FOR ALL
  USING (public.app_is_privileged() OR patient_id = public.app_user_id() OR (doctor_id IS NOT NULL AND public.app_doctor_matches(doctor_id)))
  WITH CHECK (public.app_is_privileged() OR patient_id = public.app_user_id() OR (doctor_id IS NOT NULL AND public.app_doctor_matches(doctor_id)));

ALTER TABLE public.prescriptions_prescriptionitem ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.prescriptions_prescriptionitem FORCE ROW LEVEL SECURITY;
CREATE POLICY prescription_item_access ON public.prescriptions_prescriptionitem FOR ALL
  USING (EXISTS (SELECT 1 FROM public.prescriptions_prescription p WHERE p.id = prescription_id AND public.app_can_access_patient(p.patient_id)))
  WITH CHECK (public.app_is_privileged() OR EXISTS (
    SELECT 1 FROM public.prescriptions_prescription p WHERE p.id = prescription_id
      AND public.app_doctor_matches(p.doctor_id) AND public.app_can_access_patient(p.patient_id)
  ));

ALTER TABLE public.psychotherapy_session ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.psychotherapy_session FORCE ROW LEVEL SECURITY;
CREATE POLICY psychotherapy_session_access ON public.psychotherapy_session FOR ALL
  USING (public.app_can_access_psychotherapy(psychotherapy_request_id))
  WITH CHECK (public.app_can_access_psychotherapy(psychotherapy_request_id));
ALTER TABLE public.psychotherapy_medication ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.psychotherapy_medication FORCE ROW LEVEL SECURITY;
CREATE POLICY psychotherapy_medication_access ON public.psychotherapy_medication FOR ALL
  USING (public.app_is_privileged() OR EXISTS (
    SELECT 1 FROM public.psychotherapy_session s JOIN public.psychotherapy_request p ON p.id = s.psychotherapy_request_id
      WHERE s.id = session_id AND public.app_doctor_matches(p.doctor_id)
  )) WITH CHECK (public.app_is_privileged() OR EXISTS (
    SELECT 1 FROM public.psychotherapy_session s JOIN public.psychotherapy_request p ON p.id = s.psychotherapy_request_id
      WHERE s.id = session_id AND public.app_doctor_matches(p.doctor_id)
  ));

ALTER TABLE public.notifications_notification ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications_notification FORCE ROW LEVEL SECURITY;
CREATE POLICY notification_owner_access ON public.notifications_notification FOR ALL
  USING (public.app_is_privileged() OR recipient_id = public.app_user_id())
  WITH CHECK (public.app_is_privileged() OR recipient_id = public.app_user_id());
ALTER TABLE public.notifications_pushsubscription ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications_pushsubscription FORCE ROW LEVEL SECURITY;
CREATE POLICY push_subscription_owner_access ON public.notifications_pushsubscription FOR ALL
  USING (public.app_is_privileged() OR user_id = public.app_user_id())
  WITH CHECK (public.app_is_privileged() OR user_id = public.app_user_id());

ALTER TABLE public.reviews_review ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reviews_review FORCE ROW LEVEL SECURITY;
CREATE POLICY review_access ON public.reviews_review FOR ALL
  USING (public.app_is_privileged() OR patient_id = public.app_user_id() OR public.app_doctor_matches(doctor_id) OR is_visible)
  WITH CHECK (public.app_is_privileged() OR patient_id = public.app_user_id() OR public.app_doctor_matches(doctor_id));
