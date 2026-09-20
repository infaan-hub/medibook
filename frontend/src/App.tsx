/**
 * MediBook root (PHASE 5 — React Authentication).
 * Providers → routes. Guest-only screens render without the app shell;
 * every app screen sits behind RequireAuth (+ RequireRole for /admin).
 * The Splash hides once the boot probe resolves.
 * PHASE 18: React.lazy + Suspense for code splitting.
 * PHASE 21: Onboarding shown only on first visit; auto-login on return.
 */

import { Suspense, lazy, useEffect, useState } from "react";
import { BrowserRouter, Navigate, Outlet, Route, Routes } from "react-router-dom";
import { AppShell } from "./components/AppShell";
import { RequireAuth, RequireGuest, RequireRole } from "./components/guards";
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
} from "./pages/auth";
import { SettingsScreen } from "./pages/patient";
import { ProfileScreen } from "./pages/profile";
import {
  HomeScreen,
  NotFoundPage,
} from "./pages";
import { SessionProvider, ToastProvider, useSession } from "./state/app-context";

/* ---- Lazy-loaded page groups (PHASE 18 code splitting) ---- */

const DoctorsPage = lazy(() => import("./pages").then((m) => ({ default: m.DoctorsPage })));
const DoctorProfileScreen = lazy(() => import("./pages").then((m) => ({ default: m.DoctorProfileScreen })));
const BookingScreen = lazy(() => import("./pages").then((m) => ({ default: m.BookingScreen })));
const BookingSuccessScreen = lazy(() => import("./pages").then((m) => ({ default: m.BookingSuccessScreen })));
const RescheduleScreen = lazy(() => import("./pages").then((m) => ({ default: m.RescheduleScreen })));
const AppointmentsListScreen = lazy(() => import("./pages").then((m) => ({ default: m.AppointmentsListScreen })));
const AppointmentDetailScreen = lazy(() => import("./pages").then((m) => ({ default: m.AppointmentDetailScreen })));
const DoctorDashboardScreen = lazy(() => import("./pages").then((m) => ({ default: m.DoctorDashboardScreen })));
const DoctorAppointmentsScreen = lazy(() => import("./pages").then((m) => ({ default: m.DoctorAppointmentsScreen })));
const DoctorAvailabilityScreen = lazy(() => import("./pages").then((m) => ({ default: m.DoctorAvailabilityScreen })));
const NotificationsScreen = lazy(() => import("./pages").then((m) => ({ default: m.NotificationsScreen })));
const AdminDashboardScreen = lazy(() => import("./pages").then((m) => ({ default: m.AdminDashboardScreen })));
const AdminUsersScreen = lazy(() => import("./pages").then((m) => ({ default: m.AdminUsersScreen })));
const AdminDoctorsScreen = lazy(() => import("./pages").then((m) => ({ default: m.AdminDoctorsScreen })));
const AdminCreateUserScreen = lazy(() => import("./pages").then((m) => ({ default: m.AdminCreateUserScreen })));
const AdminCreateDoctorScreen = lazy(() => import("./pages").then((m) => ({ default: m.AdminCreateDoctorScreen })));
const AdminAuditScreen = lazy(() => import("./pages").then((m) => ({ default: m.AdminAuditScreen })));
const SpecialtyListPage = lazy(() => import("./pages").then((m) => ({ default: m.SpecialtyListPage })));
const SpecialtyDetailPage = lazy(() => import("./pages").then((m) => ({ default: m.SpecialtyDetailPage })));
const HospitalListPage = lazy(() => import("./pages").then((m) => ({ default: m.HospitalListPage })));
const HospitalDetailPage = lazy(() => import("./pages").then((m) => ({ default: m.HospitalDetailPage })));

function PageFallback() {
  return (
    <div className="page" style={{ display: "grid", placeItems: "center", minHeight: "40vh" }}>
      <Spinner size={32} label="Loading page" />
    </div>
  );
}

/**
 * The root route is deliberately unguarded.  It resolves the launch destination
 * before a guest can reach RequireAuth (which would otherwise redirect to login).
 */
function LaunchRoute() {
  const { status, user } = useSession();

  if (status === "booting") return null;

  if (status === "guest") {
    return <Navigate to={localStorage.getItem("medibook_onboarding_completed") ? "/welcome" : "/onboarding"} replace />;
  }

  if (!user) return null;
  const dashboard = user.role === "doctor"
    ? "/doctor/dashboard"
    : user.role === "admin" && user.is_superuser
      ? "/admin"
      : "/dashboard";
  return <Navigate to={dashboard} replace />;
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
    return () => window.clearTimeout(timer);
  }, []);

  return (
    <BrowserRouter>
      <SessionProvider>
        <ToastProvider>
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
              {/* Authenticated app screens (inside the shell) */}
              <Route
                element={
                  <RequireAuth>
                    <AppShell>
                      <Outlet />
                    </AppShell>
                  </RequireAuth>
                }
              >
                <Route path="/dashboard" element={<HomeScreen />} />
                <Route path="/doctors" element={<DoctorsPage />} />
                <Route path="/doctors/:id" element={<DoctorProfileScreen />} />
                <Route path="/booking/:id" element={<BookingScreen />} />
                <Route path="/booking/success" element={<BookingSuccessScreen />} />
                <Route path="/appointments" element={<AppointmentsListScreen />} />
                <Route path="/appointments/:id" element={<AppointmentDetailScreen />} />
                <Route path="/appointments/:id/reschedule" element={<RescheduleScreen />} />
                <Route path="/doctor/dashboard" element={<RequireRole role="doctor"><DoctorDashboardScreen /></RequireRole>} />
                <Route path="/doctor/appointments" element={<RequireRole role="doctor"><DoctorAppointmentsScreen /></RequireRole>} />
                <Route path="/doctor/availability" element={<RequireRole role="doctor"><DoctorAvailabilityScreen /></RequireRole>} />
                <Route path="/notifications" element={<NotificationsScreen />} />
                <Route path="/profile" element={<ProfileScreen />} />
                <Route
                  path="/settings"
                  element={
                    <RequireRole role="patient">
                      <SettingsScreen />
                    </RequireRole>
                  }
                />
                <Route path="/admin" element={<RequireRole role="admin"><AdminDashboardScreen /></RequireRole>} />
                <Route path="/admin/users" element={<RequireRole role="admin"><AdminUsersScreen /></RequireRole>} />
                <Route path="/admin/doctors" element={<RequireRole role="admin"><AdminDoctorsScreen /></RequireRole>} />
                <Route path="/admin/users/new" element={<RequireRole role="admin"><AdminCreateUserScreen /></RequireRole>} />
                <Route path="/admin/doctors/new" element={<RequireRole role="admin"><AdminCreateDoctorScreen /></RequireRole>} />
                <Route path="/admin/audit" element={<RequireRole role="admin"><AdminAuditScreen /></RequireRole>} />
                <Route path="/specialties" element={<SpecialtyListPage />} />
                <Route path="/specialties/:id" element={<SpecialtyDetailPage />} />
                <Route path="/hospitals" element={<HospitalListPage />} />
                <Route path="/hospitals/:id" element={<HospitalDetailPage />} />
                <Route path="*" element={<NotFoundPage />} />
              </Route>
            </Routes>
          </Suspense>
          <ToastViewport />
        </ToastProvider>
      </SessionProvider>
    </BrowserRouter>
  );
}
