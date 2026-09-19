/**
 * MediBook root (PHASE 5 — React Authentication).
 * Providers → routes. Guest-only screens render without the app shell;
 * every app screen sits behind RequireAuth (+ RequireRole for /admin).
 * The Splash hides once the boot probe resolves.
 */

import { useEffect, useState } from "react";
import { BrowserRouter, Outlet, Route, Routes } from "react-router-dom";
import { AppShell } from "./components/AppShell";
import { AllowUnverified, RequireAuth, RequireGuest, RequireRole } from "./components/guards";
import { SplashScreen } from "./components/Splash";
import { ToastViewport } from "./components/ToastViewport";
import {
  ForgotPasswordScreen,
  LoginScreen,
  RegisterScreen,
  ResetPasswordScreen,
  VerifyEmailScreen,
} from "./pages/auth";
import { AdminScreen } from "./pages/admin";
import { SettingsScreen } from "./pages/patient";
import { ProfileScreen } from "./pages/profile";
import {
  BookingScreen,
  BookingSuccessScreen,
  RescheduleScreen,
  AppointmentsListScreen,
  AppointmentDetailScreen,
  DoctorsPage,
  DoctorDashboardScreen,
  DoctorProfileScreen,
  DoctorAvailabilityScreen,
  HomeScreen,
  NotFoundPage,
  SpecialtyListPage,
  SpecialtyDetailPage,
  HospitalListPage,
  HospitalDetailPage,
} from "./pages";
import { SessionProvider, ToastProvider } from "./state/app-context";

export default function App() {
  const [booted, setBooted] = useState(false);

  useEffect(() => {
    const timer = window.setTimeout(() => setBooted(true), 350);
    return () => window.clearTimeout(timer);
  }, []);

  return (
    <SessionProvider>
      <ToastProvider>
        <SplashScreen hidden={booted} />
        <BrowserRouter>
          <Routes>
            {/* Guest-only screens (no app shell) */}
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
            <Route
              path="/verify-email"
              element={
                <AllowUnverified>
                  <VerifyEmailScreen />
                </AllowUnverified>
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
              <Route path="/" element={<HomeScreen />} />
              <Route path="/doctors" element={<DoctorsPage />} />
              <Route path="/doctors/:id" element={<DoctorProfileScreen />} />
              <Route path="/booking/:id" element={<BookingScreen />} />
              <Route path="/booking/success" element={<BookingSuccessScreen />} />
              <Route path="/appointments" element={<AppointmentsListScreen />} />
              <Route path="/appointments/:id" element={<AppointmentDetailScreen />} />
              <Route path="/appointments/:id/reschedule" element={<RescheduleScreen />} />
              <Route path="/doctor/dashboard" element={<RequireRole role="doctor"><DoctorDashboardScreen /></RequireRole>} />
              <Route path="/doctor/availability" element={<RequireRole role="doctor"><DoctorAvailabilityScreen /></RequireRole>} />
              <Route path="/profile" element={<ProfileScreen />} />
              <Route
                path="/settings"
                element={
                  <RequireRole role="patient">
                    <SettingsScreen />
                  </RequireRole>
                }
              />
              <Route
                path="/admin"
                element={
                  <RequireRole role="admin">
                    <AdminScreen />
                  </RequireRole>
                }
              />
              <Route path="/specialties" element={<SpecialtyListPage />} />
              <Route path="/specialties/:id" element={<SpecialtyDetailPage />} />
              <Route path="/hospitals" element={<HospitalListPage />} />
              <Route path="/hospitals/:id" element={<HospitalDetailPage />} />
              <Route path="*" element={<NotFoundPage />} />
            </Route>
          </Routes>
          <ToastViewport />
        </BrowserRouter>
      </ToastProvider>
    </SessionProvider>
  );
}
