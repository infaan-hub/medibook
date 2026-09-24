/**
 * MediBook root (PHASE 5 — React Authentication).
 * Providers → routes. Guest-only screens render without the app shell;
 * every app screen sits behind RequireSession (+ RequireRole/RequirePatient
 * for finer role slices). Guests never reach the shell without a login.
 * The Splash hides once the boot probe resolves.
 * PHASE 18: React.lazy + Suspense for code splitting.
 * PHASE 21: Onboarding shown only on first visit; auto-login on return.
 */

import { Suspense, lazy, useEffect, useState } from "react";
import { BrowserRouter, Navigate, Outlet, Route, Routes } from "react-router-dom";
import "./i18n";
import { registerServiceWorker } from "./lib/pwa";
import { AppShell } from "./components/AppShell";
import { RequireGuest, RequirePatient, RequireRole, RequireSession, homeForRole } from "./components/guards";
import { SplashScreen } from "./components/Splash";
import { Spinner } from "./components/ui";
import { ToastViewport } from "./components/ToastViewport";
import {
  ForgotPasswordScreen,
  LoginScreen,
  OnboardingScreen,
  RegisterScreen,
  ResetPasswordScreen,
  WelcomeScreen,
} from "./screens/auth";
import { SettingsScreen } from "./screens/patient";
import { ProfileScreen } from "./screens/profile";
import { SessionProvider, ToastProvider, useSession } from "./state/app-context";
import { RealtimeProvider } from "./realtime/RealtimeProvider";
import { ErrorBoundary } from "./components/ErrorBoundary";

/* ---- Lazy-loaded page groups (PHASE 18 code splitting) ---- */

const HomeScreen = lazy(() => import("./screens").then((m) => ({ default: m.HomeScreen })));
const NotFoundPage = lazy(() => import("./screens").then((m) => ({ default: m.NotFoundPage })));
const DoctorsPage = lazy(() => import("./screens").then((m) => ({ default: m.DoctorsPage })));
const DoctorProfileScreen = lazy(() => import("./screens").then((m) => ({ default: m.DoctorProfileScreen })));
const BookingScreen = lazy(() => import("./screens").then((m) => ({ default: m.BookingScreen })));
const BookingSuccessScreen = lazy(() => import("./screens").then((m) => ({ default: m.BookingSuccessScreen })));
const RescheduleScreen = lazy(() => import("./screens").then((m) => ({ default: m.RescheduleScreen })));
const AppointmentsListScreen = lazy(() => import("./screens").then((m) => ({ default: m.AppointmentsListScreen })));
const AppointmentDetailScreen = lazy(() => import("./screens").then((m) => ({ default: m.AppointmentDetailScreen })));
const DoctorDashboardScreen = lazy(() => import("./screens").then((m) => ({ default: m.DoctorDashboardScreen })));
const DoctorAppointmentsScreen = lazy(() => import("./screens").then((m) => ({ default: m.DoctorAppointmentsScreen })));
const DoctorMedicalTreatmentScreen = lazy(() => import("./screens/doctor-medical-treatment").then((m) => ({ default: m.DoctorMedicalTreatmentScreen })));
const DoctorAvailabilityScreen = lazy(() => import("./screens").then((m) => ({ default: m.DoctorAvailabilityScreen })));
const DoctorPersonalScreen = lazy(() => import("./screens").then((m) => ({ default: m.DoctorPersonalScreen })));
const NotificationsScreen = lazy(() => import("./screens").then((m) => ({ default: m.NotificationsScreen })));
const MyReviewsScreen = lazy(() => import("./screens").then((m) => ({ default: m.MyReviewsScreen })));
const AdminDashboardScreen = lazy(() => import("./screens").then((m) => ({ default: m.AdminDashboardScreen })));
const AdminUsersScreen = lazy(() => import("./screens").then((m) => ({ default: m.AdminUsersScreen })));
const AdminDoctorsScreen = lazy(() => import("./screens").then((m) => ({ default: m.AdminDoctorsScreen })));
const AdminCreateUserScreen = lazy(() => import("./screens").then((m) => ({ default: m.AdminCreateUserScreen })));
const AdminCreateDoctorScreen = lazy(() => import("./screens").then((m) => ({ default: m.AdminCreateDoctorScreen })));
const AdminAuditScreen = lazy(() => import("./screens").then((m) => ({ default: m.AdminAuditScreen })));
const AdminAppointmentsScreen = lazy(() => import("./screens").then((m) => ({ default: m.AdminAppointmentsScreen })));
const SpecialtyListPage = lazy(() => import("./screens").then((m) => ({ default: m.SpecialtyListPage })));
const SpecialtyDetailPage = lazy(() => import("./screens").then((m) => ({ default: m.SpecialtyDetailPage })));
const HospitalListPage = lazy(() => import("./screens").then((m) => ({ default: m.HospitalListPage })));
const HospitalDetailPage = lazy(() => import("./screens").then((m) => ({ default: m.HospitalDetailPage })));
const BlogListPage = lazy(() => import("./screens").then((m) => ({ default: m.BlogListPage })));
const BlogArticlePage = lazy(() => import("./screens").then((m) => ({ default: m.BlogArticlePage })));
const VisitHistoryPage = lazy(() => import("./screens/visit-history").then((m) => ({ default: m.default })));
const EarningsPage = lazy(() => import("./screens/earnings").then((m) => ({ default: m.default })));

function PageFallback() {
  return (
    <div className="page" style={{ display: "grid", placeItems: "center", minHeight: "40vh" }}>
      <Spinner size={32} label="Loading page" />
    </div>
  );
}

/**
 * The root route is deliberately unguarded.  It resolves the launch destination
 * before a guest can reach RequireSession (which would otherwise redirect to login).
 */
function LaunchRoute() {
  const { status, user } = useSession();

  if (status === "booting") return null;

  if (status === "guest") {
    return <Navigate to="/login" replace />;
  }

  if (!user) return null;
  return <Navigate to={homeForRole(user)} replace />;
}

/** Keep the splash visible until both its minimum duration and session restore finish. */
function LaunchSplash({ timerComplete }: { timerComplete: boolean }) {
  const { status } = useSession();
  return <SplashScreen hidden={timerComplete && status !== "booting"} />;
}

export default function App() {
  const [booted, setBooted] = useState(false);

  useEffect(() => {
    const timer = window.setTimeout(() => setBooted(true), 5000);
    registerServiceWorker();
    return () => window.clearTimeout(timer);
  }, []);

  return (
    <ErrorBoundary>
    <BrowserRouter>
      <SessionProvider>
        <ToastProvider>
          <RealtimeProvider>
          <LaunchSplash timerComplete={booted} />
          <Suspense fallback={<PageFallback />}>
            <Routes>
              <Route path="/" element={<LaunchRoute />} />
              {/* Guest-only screens (no app shell) */}
              <Route path="/onboarding" element={<OnboardingScreen />} />
              <Route path="/welcome" element={<WelcomeScreen />} />
              <Route
                path="/login"
                element={
                  <RequireGuest>
                    <LoginScreen />
                  </RequireGuest>
                }
              />
              {/* /signin is the canonical sign-out landing: always guest-only. */}
              <Route
                path="/signin"
                element={
                  <RequireGuest>
                    <LoginScreen />
                  </RequireGuest>
                }
              />
              <Route
                path="/register"
                element={
                  <RequireGuest>
                    <RegisterScreen />
                  </RequireGuest>
                }
              />
              <Route
                path="/forgot-password"
                element={
                  <RequireGuest>
                    <ForgotPasswordScreen />
                  </RequireGuest>
                }
              />
              <Route
                path="/reset-password"
                element={
                  <RequireGuest>
                    <ResetPasswordScreen />
                  </RequireGuest>
                }
              />
              {/* Authenticated app screens (inside the shell).
                  RequireSession: must be signed in AND allowed on this path
                  prefix — roles stay independent on refresh and deep links. */}
              <Route
                element={
                  <RequireSession>
                    <AppShell>
                      <Outlet />
                    </AppShell>
                  </RequireSession>
                }
              >
                <Route path="/dashboard" element={<RequirePatient><HomeScreen /></RequirePatient>} />
                <Route path="/doctors" element={<RequirePatient><DoctorsPage /></RequirePatient>} />
                <Route path="/doctors/:id" element={<RequirePatient><DoctorProfileScreen /></RequirePatient>} />
                <Route path="/booking/:id" element={<RequirePatient><BookingScreen /></RequirePatient>} />
                <Route path="/booking/success" element={<RequirePatient><BookingSuccessScreen /></RequirePatient>} />
                <Route path="/appointments" element={<RequirePatient><AppointmentsListScreen /></RequirePatient>} />
                <Route path="/appointments/:id" element={<AppointmentDetailScreen />} />
                <Route path="/appointments/:id/reschedule" element={<RequirePatient><RescheduleScreen /></RequirePatient>} />
                <Route path="/doctor/dashboard" element={<RequireRole role="doctor"><DoctorDashboardScreen /></RequireRole>} />
                <Route path="/doctor/personal" element={<RequireRole role="doctor"><DoctorPersonalScreen /></RequireRole>} />
                <Route path="/doctor/appointments" element={<RequireRole role="doctor"><DoctorAppointmentsScreen /></RequireRole>} />
                <Route path="/doctor/medical-treatment" element={<RequireRole role="doctor"><DoctorMedicalTreatmentScreen /></RequireRole>} />
                <Route path="/doctor/visit-history/:patientId" element={<RequireRole role="doctor"><VisitHistoryPage /></RequireRole>} />
                <Route path="/doctor/availability" element={<RequireRole role="doctor"><DoctorAvailabilityScreen /></RequireRole>} />
                <Route path="/doctor/earnings" element={<RequireRole role="doctor"><EarningsPage /></RequireRole>} />
                <Route path="/notifications" element={<NotificationsScreen />} />
                <Route path="/reviews" element={<RequirePatient><MyReviewsScreen /></RequirePatient>} />
                <Route path="/profile" element={<ProfileScreen />} />
                <Route
                  path="/settings"
                  element={
                    <RequirePatient>
                      <SettingsScreen />
                    </RequirePatient>
                  }
                />
                <Route path="/admin" element={<RequireRole role="admin"><AdminDashboardScreen /></RequireRole>} />
                <Route path="/admin/users" element={<RequireRole role="admin"><AdminUsersScreen /></RequireRole>} />
                <Route path="/admin/doctors" element={<RequireRole role="admin"><AdminDoctorsScreen /></RequireRole>} />
                <Route path="/admin/users/new" element={<RequireRole role="admin"><AdminCreateUserScreen /></RequireRole>} />
                <Route path="/admin/doctors/new" element={<RequireRole role="admin"><AdminCreateDoctorScreen /></RequireRole>} />
                <Route path="/admin/audit" element={<RequireRole role="admin"><AdminAuditScreen /></RequireRole>} />
                <Route path="/admin/appointments" element={<RequireRole role="admin"><AdminAppointmentsScreen /></RequireRole>} />
                <Route path="/specialties" element={<SpecialtyListPage />} />
                <Route path="/specialties/:id" element={<SpecialtyDetailPage />} />
                <Route path="/hospitals" element={<HospitalListPage />} />
                <Route path="/hospitals/:id" element={<HospitalDetailPage />} />
                <Route path="/blog" element={<BlogListPage />} />
                <Route path="/blog/:slug" element={<BlogArticlePage />} />
                <Route path="*" element={<NotFoundPage />} />
              </Route>
            </Routes>
          </Suspense>
          <ToastViewport />
          </RealtimeProvider>
        </ToastProvider>
      </SessionProvider>
    </BrowserRouter>
    </ErrorBoundary>
  );
}
