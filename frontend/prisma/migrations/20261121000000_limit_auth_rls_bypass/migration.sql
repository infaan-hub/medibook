-- Authentication endpoints do not need platform-wide access to protected
-- records. Allow only their narrow patient-profile insert during signup.
CREATE OR REPLACE FUNCTION public.app_is_privileged() RETURNS boolean
LANGUAGE sql STABLE PARALLEL SAFE AS $$
  SELECT public.app_mode() = 'system'
      OR public.app_role() IN ('admin', 'coordinator')
      OR COALESCE(NULLIF(current_setting('app.is_superuser', true), ''), 'false') = 'true'
$$;

CREATE POLICY patient_profile_signup_insert ON public.patients_patient
  FOR INSERT WITH CHECK (public.app_mode() = 'auth');
