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
import { RequireGuest, RequirePatient, RequireRole, RequireSession, launchPath } from "./components/guards";
import { SplashScreen, UpdatePrompt } from "./components/Splash";
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

/**
 * Lazy load with retry on ChunkLoadError.
 * Retries up to 3 times with exponential backoff.
 */
function lazyWithRetry<T extends React.ComponentType<any>>(
  importFn: () => Promise<{ default: T }>,
  maxRetries = 3
) {
  return lazy(async () => {
    let lastError: Error;
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        return await importFn();
      } catch (error) {
        lastError = error as Error;
        // Check if it's a chunk load error
        const isChunkError = error instanceof Error && 
          (error.name === 'ChunkLoadError' || 
           error.message.includes('ChunkLoadError') ||
           error.message.includes('Loading chunk') ||
           error.message.includes('chunk') && error.message.includes('failed'));
        
        if (!isChunkError || attempt === maxRetries) {
          throw error;
        }
        // Wait before retry with exponential backoff
        await new Promise(resolve => setTimeout(resolve, 1000 * Math.pow(2, attempt)));
      }
    }
    throw lastError!;
  });
}

/* ---- Lazy-loaded page groups (PHASE 18 code splitting) ---- */

const HomeScreen = lazyWithRetry(() => import("./screens").then((m) => ({ default: m.HomeScreen })));
const NotFoundPage = lazyWithRetry(() => import("./screens").then((m) => ({ default: m.NotFoundPage })));
const DoctorsPage = lazyWithRetry(() => import("./screens").then((m) => ({ default: m.DoctorsPage })));
const DoctorProfileScreen = lazyWithRetry(() => import("./screens").then((m) => ({ default: m.DoctorProfileScreen })));
const BookingScreen = lazyWithRetry(() => import("./screens").then((m) => ({ default: m.BookingScreen })));
const BookingSuccessScreen = lazyWithRetry(() => import("./screens").then((m) => ({ default: m.BookingSuccessScreen })));
const RescheduleScreen = lazyWithRetry(() => import("./screens").then((m) => ({ default: m.RescheduleScreen })));
const AppointmentsListScreen = lazyWithRetry(() => import("./screens").then((m) => ({ default: m.AppointmentsListScreen })));
const AppointmentDetailScreen = lazyWithRetry(() => import("./screens").then((m) => ({ default: m.AppointmentDetailScreen })));
const DoctorDashboardScreen = lazyWithRetry(() => import("./screens").then((m) => ({ default: m.DoctorDashboardScreen })));
const DoctorAppointmentsScreen = lazyWithRetry(() => import("./screens").then((m) => ({ default: m.DoctorAppointmentsScreen })));
const DoctorMedicalTreatmentScreen = lazyWithRetry(() => import("./screens/doctor-medical-treatment").then((m) => ({ default: m.DoctorMedicalTreatmentScreen })));
const DoctorAvailabilityScreen = lazyWithRetry(() => import("./screens").then((m) => ({ default: m.DoctorAvailabilityScreen })));
const DoctorPersonalScreen = lazyWithRetry(() => import("./screens").then((m) => ({ default: m.DoctorPersonalScreen })));
const NotificationsScreen = lazyWithRetry(() => import("./screens").then((m) => ({ default: m.NotificationsScreen })));
const MyReviewsScreen = lazyWithRetry(() => import("./screens").then((m) => ({ default: m.MyReviewsScreen })));
const AdminDashboardScreen = lazyWithRetry(() => import("./screens").then((m) => ({ default: m.AdminDashboardScreen })));
const AdminUsersScreen = lazyWithRetry(() => import("./screens").then((m) => ({ default: m.AdminUsersScreen })));
const AdminDoctorsScreen = lazyWithRetry(() => import("./screens").then((m) => ({ default: m.AdminDoctorsScreen })));
const AdminCreateUserScreen = lazyWithRetry(() => import("./screens").then((m) => ({ default: m.AdminCreateUserScreen })));
const AdminCreateDoctorScreen = lazyWithRetry(() => import("./screens").then((m) => ({ default: m.AdminCreateDoctorScreen })));
const AdminAuditScreen = lazyWithRetry(() => import("./screens").then((m) => ({ default: m.AdminAuditScreen })));
const AdminAppointmentsScreen = lazyWithRetry(() => import("./screens").then((m) => ({ default: m.AdminAppointmentsScreen })));
const SpecialtyListPage = lazyWithRetry(() => import("./screens").then((m) => ({ default: m.SpecialtyListPage })));
const SpecialtyDetailPage = lazyWithRetry(() => import("./screens").then((m) => ({ default: m.SpecialtyDetailPage })));
const HospitalListPage = lazyWithRetry(() => import("./screens").then((m) => ({ default: m.HospitalListPage })));
const HospitalDetailPage = lazyWithRetry(() => import("./screens").then((m) => ({ default: m.HospitalDetailPage })));
const BlogListPage = lazyWithRetry(() => import("./screens").then((m) => ({ default: m.BlogListPage })));
const BlogArticlePage = lazyWithRetry(() => import("./screens").then((m) => ({ default: m.BlogArticlePage })));
const VisitHistoryPage = lazyWithRetry(() => import("./screens/visit-history").then((m) => ({ default: m.default })));

function PageFallback() {
  return (
    <div className="page" style={{ display: "grid", placeItems: "center", minHeight: "40vh" }}>
      <Spinner size={32} label="Loading page" />
    </div>
  );
}

/**
 * First-run flag (§21 onboarding). Written by `OnboardingScreen` when the
 * carousel is finished or skipped, and deliberately kept across logout so a
 * returning visitor lands on /login instead of the carousel again.
 */
const ONBOARDED_KEY = "medibook_onboarding_completed";

function hasOnboarded(): boolean {
  try {
    return localStorage.getItem(ONBOARDED_KEY) === "1";
  } catch {
    // Storage unavailable (private mode) — never block the sign-in screen.
    return true;
  }
}

/**
 * The root route is deliberately unguarded.  It resolves the launch destination
 * before a guest can reach RequireSession (which would otherwise redirect to login).
 *
 *   already signed in       → that role's home (no onboarding, no welcome)
 *   first ever visit        → /onboarding → /onboarding/welcome (sign up / sign in)
 *   signed out, seen before → /login
 */
function LaunchRoute() {
  const { status, user } = useSession();
  const destination = launchPath(status, user, hasOnboarded());
  // `null` → the boot probe is still running and the splash is still up.
  if (!destination) return null;
  return <Navigate to={destination} replace />;
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
              {/* Guest-only screens (no app shell). Signed-in users bounce to
                  their own home, so /onboarding and /onboarding/welcome stay
                  first-run only. */}
              <Route
                path="/onboarding"
                element={
                  <RequireGuest>
                    <OnboardingScreen />
                  </RequireGuest>
                }
              />
              {/* Welcome (sign up / sign in) lives inside the onboarding flow. */}
              <Route
                path="/onboarding/welcome"
                element={
                  <RequireGuest>
                    <WelcomeScreen />
                  </RequireGuest>
                }
              />
              {/* Legacy /welcome bookmark → the onboarding flow. */}
              <Route
                path="/welcome"
                element={<Navigate to="/onboarding/welcome" replace />}
              />
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
          {/* PWA banners (§18) live at app level; the stack keeps them clear of
              each other and of the guest screens (which have no bottom nav). */}
          <div className="prompt-stack">
            <UpdatePrompt />
          </div>
          <ToastViewport />
          </RealtimeProvider>
        </ToastProvider>
      </SessionProvider>
    </BrowserRouter>
    </ErrorBoundary>
  );
}
