ALTER TABLE public.accounts_passwordresettoken ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.accounts_passwordresettoken FORCE ROW LEVEL SECURITY;
CREATE POLICY password_reset_token_access ON public.accounts_passwordresettoken FOR ALL
  USING (public.app_mode() = 'auth' OR user_id = public.app_user_id())
  WITH CHECK (public.app_mode() = 'auth' OR user_id = public.app_user_id());

ALTER TABLE public.auth_loginotp ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.auth_loginotp FORCE ROW LEVEL SECURITY;
CREATE POLICY login_otp_access ON public.auth_loginotp FOR ALL
  USING (public.app_mode() = 'auth' OR user_id = public.app_user_id())
  WITH CHECK (public.app_mode() = 'auth' OR user_id = public.app_user_id());

ALTER TABLE public.auth_refreshtoken ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.auth_refreshtoken FORCE ROW LEVEL SECURITY;
CREATE POLICY refresh_token_access ON public.auth_refreshtoken FOR ALL
  USING (public.app_mode() = 'auth' OR user_id = public.app_user_id())
  WITH CHECK (public.app_mode() = 'auth' OR user_id = public.app_user_id());

ALTER TABLE public.training_session ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.training_session FORCE ROW LEVEL SECURITY;
CREATE POLICY training_session_access ON public.training_session FOR ALL
  USING (EXISTS (
    SELECT 1 FROM public.training_request r WHERE r.id = training_request_id
      AND (public.app_is_privileged() OR r.patient_id = public.app_user_id()
        OR (r.doctor_id IS NOT NULL AND public.app_doctor_matches(r.doctor_id)))
  )) WITH CHECK (EXISTS (
    SELECT 1 FROM public.training_request r WHERE r.id = training_request_id
      AND (public.app_is_privileged() OR (r.doctor_id IS NOT NULL AND public.app_doctor_matches(r.doctor_id)))
  ));

ALTER TABLE public.training_question ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.training_question FORCE ROW LEVEL SECURITY;
CREATE POLICY training_question_access ON public.training_question FOR ALL
  USING (EXISTS (
    SELECT 1 FROM public.training_session s JOIN public.training_request r ON r.id = s.training_request_id
      WHERE s.id = session_id AND (public.app_is_privileged() OR r.patient_id = public.app_user_id()
        OR (r.doctor_id IS NOT NULL AND public.app_doctor_matches(r.doctor_id)))
  )) WITH CHECK (EXISTS (
    SELECT 1 FROM public.training_session s JOIN public.training_request r ON r.id = s.training_request_id
      WHERE s.id = session_id AND (public.app_is_privileged() OR (r.doctor_id IS NOT NULL AND public.app_doctor_matches(r.doctor_id)))
  ));
