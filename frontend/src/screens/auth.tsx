/**
 * PHASE 5 — Authentication screens (§54).
 *
 * LoginScreen          — email + password → session (redirects back to the
 *                        URL the guard remembered, or home).
 * RegisterScreen       — patient/doctor self-registration (§54 role-based).
 * ForgotPasswordScreen — neutral request (§36 — never reveals account state).
 * ResetPasswordScreen  — code from the email (supports ?token= prefill).
 */

import { useState, useRef, useCallback, type ChangeEvent, type FormEvent, type ReactNode } from "react";
import { Link, useLocation, useNavigate, useSearchParams } from "react-router-dom";
import {
  confirmPasswordReset,
  requestPasswordReset,
} from "../api/auth";
import { ApiError } from "../api/client";
import type { RegisterPayload } from "../api/types";
import { useSession, useToast } from "../state/app-context";
import { LOGIN_PATH, homeForRole, roleOwnsPath } from "../components/guards";

/* ---------------- shared helpers ---------------- */

/** Flatten DRF field errors ({email: ["…"]}) to per-field first messages. */
function fieldErrors(error: unknown): Record<string, string> {
  if (error instanceof ApiError) {
    return Object.fromEntries(
      Object.entries(error.errors).map(([field, messages]) => [
        field,
        messages[0] ?? "Invalid value.",
      ])
    );
  }
  return {};
}

function errorMessage(error: unknown): string {
  return error instanceof Error
    ? error.message
    : "Something went wrong. Please try again.";
}

/** Redirects the login screen may honour — same-app, role-owned paths only. */
function isSafeRedirect(target: string): boolean {
  if (!target.startsWith("/") || target.startsWith("//")) return false;
  if (target.startsWith(LOGIN_PATH) || target.startsWith("/signin")) return false;
  if (target.startsWith("/register") || target.startsWith("/onboarding")) return false;
  if (target.startsWith("/forgot-password") || target.startsWith("/reset-password")) return false;
  return true;
}

/** Dashboard for the just-authenticated user (read from storage synchronously). */
function freshHomeForRole(): string {
  try {
    const raw = localStorage.getItem("mb.auth.user");
    if (raw) {
      const stored = JSON.parse(raw) as { role?: string; is_superuser?: boolean };
      if (stored.role === "doctor" || stored.role === "admin" || stored.role === "patient") {
        return homeForRole({
          role: stored.role,
          is_superuser: Boolean(stored.is_superuser),
        });
      }
    }
  } catch {
    /* fall through to patient dashboard */
  }
  return "/dashboard";
}

/** True when `path` is a safe redirect AND belongs to the fresh session's role. */
function canReturnTo(path: string): boolean {
  if (!isSafeRedirect(path)) return false;
  try {
    const raw = localStorage.getItem("mb.auth.user");
    if (!raw) return false;
    const stored = JSON.parse(raw) as { role?: string; is_superuser?: boolean };
    if (stored.role !== "doctor" && stored.role !== "admin" && stored.role !== "patient") {
      return false;
    }
    return roleOwnsPath(path, {
      role: stored.role,
      is_superuser: Boolean(stored.is_superuser),
    });
  } catch {
    return false;
  }
}

/** Single-column centered layout shared by every auth screen. */
function AuthLayout({
  title,
  subtitle,
  children,
  footer,
  hideBack,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
  footer?: ReactNode;
  hideBack?: boolean;
}) {
  const navigate = useNavigate();
  return (
    <main className="ab-page">
      {!hideBack && (
        <button className="ab-back" type="button" aria-label="Go back" onClick={() => navigate(-1)}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="15 18 9 12 15 6" />
          </svg>
        </button>
      )}
      <div className="ab-logo">
        <img className="ab-logo__img" src="/images/logo.jpeg" alt="MediBook" width={48} height={48} draggable={false} />
        <span className="ab-logo__name">Medibook</span>
      </div>
      <h1 className="ab-title">{title}</h1>
      {subtitle && <p className="ab-subtitle">{subtitle}</p>}
      <div className="ab-form">{children}</div>
      {footer && <div className="ab-footer">{footer}</div>}
    </main>
  );
}

function AbLogo({ large }: { large?: boolean }) {
  return (
    <div className={`ab-logo${large ? " ab-logo--large" : ""}`} aria-label="MediBook">
      <img
        className="ab-logo__img"
        src="/images/logo.jpeg"
        alt="MediBook"
        width={large ? 74 : 48}
        height={large ? 74 : 48}
        draggable={false}
      />
      <span className="ab-logo__name">Medibook</span>
    </div>
  );
}

/* WhatsApp Image 2026-09-19 at 19.01.59 — stylistic medical reference:
   light cyan canvas, teal circular medallion illustration, clean layout.
   All slides now reuse the single new onboarding-medical.jpeg asset. */
const onboardingSlides = [
  {
    title: "Easy Medicare",
    description: "Book appointments, consult doctors and manage your health — all in one place.",
    illustration: "onboarding-medical.jpeg",
    scene: "team",
  },
  {
    title: "Safe Medicare",
    description: "Your health is our priority. Get trusted care from certified professionals.",
    illustration: "onboarding-medical.jpeg",
    scene: "care",
  },
  {
    title: "Quality Care",
    description: "Quality care, anytime, anywhere. Your health, our commitment.",
    illustration: "onboarding-medical.jpeg",
    scene: "consult",
  },
] as const;

export function OnboardingScreen() {
  const [slide, setSlide] = useState(0);
  const navigate = useNavigate();
  const touchStart = useRef<number | null>(null);
  const touchStartY = useRef<number | null>(null);
  const trackRef = useRef<HTMLDivElement>(null);

  const isLast = slide === onboardingSlides.length - 1;

  const completeAndGoWelcome = useCallback(() => {
    localStorage.setItem("medibook_onboarding_completed", "1");
    navigate("/welcome");
  }, [navigate]);

  const goSignIn = useCallback(() => {
    localStorage.setItem("medibook_onboarding_completed", "1");
    navigate("/login");
  }, [navigate]);

  const goNext = useCallback(() => {
    if (isLast) {
      completeAndGoWelcome();
    } else {
      setSlide((s) => s + 1);
    }
  }, [isLast, completeAndGoWelcome]);

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    touchStart.current = e.touches[0].clientX;
    touchStartY.current = e.touches[0].clientY;
  }, []);

  const handleTouchEnd = useCallback(
    (e: React.TouchEvent) => {
      if (touchStart.current === null) return;
      const dx = e.changedTouches[0].clientX - touchStart.current;
      touchStart.current = null;
      touchStartY.current = null;
      if (dx < -50) {
        setSlide((s) => Math.min(s + 1, onboardingSlides.length - 1));
      } else if (dx > 50) {
        setSlide((s) => Math.max(s - 1, 0));
      }
    },
    []
  );

  return (
    <main
      className="ab-onboarding"
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
      style={{ touchAction: "pan-y" }}
    >
      <button
        className="ab-onboarding__skip"
        type="button"
        onClick={completeAndGoWelcome}
      >
        Skip
      </button>
      <div
        ref={trackRef}
        style={{
          transform: `translateX(-${slide * 100}%)`,
          transition: "transform 0.3s ease",
        }}
      >
        {onboardingSlides.map((item, index) => (
          <section
            key={index}
            className="ab-onboarding__slide"
            aria-live="polite"
          >
            <div className="ab-onboarding__art">
              <img
                src={`/images/${item.illustration}`}
                alt=""
                onError={(event) => {
                  event.currentTarget.hidden = true;
                }}
              />
              {/* Very small logo — logo.jpeg, positioned below the image */}
              <img
                src="/images/logo.jpeg"
                alt="MediBook logo"
                className="ab-onboarding__logo"
                width={20}
                height={20}
                loading="lazy"
                draggable={false}
              />
            </div>
            <h1 className="ab-onboarding__title">{item.title}</h1>
            <p className="ab-onboarding__desc">{item.description}</p>
          </section>
        ))}
      </div>
      <div className="ab-dots" aria-label={`Slide ${slide + 1} of ${onboardingSlides.length}`}>
        {onboardingSlides.map((_item, index) => (
          <span
            key={index}
            className={`ab-dots__dot${index === slide ? " ab-dots__dot--active" : ""}`}
            onClick={() => setSlide(index)}
            role="button"
            tabIndex={0}
            aria-label={`Go to slide ${index + 1}`}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") setSlide(index);
            }}
          />
        ))}
      </div>

      <footer className="ab-onboarding__actions">
        <button type="button" className="ab-btn ab-btn--outline" onClick={goSignIn}>
          Sign In
        </button>
        <button type="button" className="ab-btn ab-btn--primary" onClick={goNext}>
          {isLast ? "Get Started" : "Next"}
        </button>
      </footer>
    </main>
  );
}

export function WelcomeScreen() {
  const navigate = useNavigate();
  const googleLogin = useGoogleLogin();
  const appleLogin = useAppleLogin();
  return (
    <main className="ab-welcome">
      <div className="ab-welcome__content">
        <AbLogo large />
        <h1 className="ab-welcome__title">Medibook Hospital</h1>
        <p className="ab-welcome__subtitle">Your Health, Our Priority</p>
      </div>
      <div className="ab-welcome__actions">
        <button className="ab-btn ab-btn--primary" type="button" onClick={() => navigate("/register")}>Create new account</button>
        <span className="ab-divider">or</span>
        <div className="ab-social-circles" aria-label="Social sign-in options">
          <button className="ab-social-circle" type="button" aria-label="Google" onClick={googleLogin}>
            <svg width="18" height="18" viewBox="0 0 24 24"><path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/><path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/><path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/><path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/></svg>
          </button>
          <button className="ab-social-circle" type="button" aria-label="Apple" onClick={appleLogin}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="#000"><path d="M17.05 20.28c-.98.95-2.05.88-3.08.4-1.09-.5-2.08-.48-3.24 0-1.44.62-2.2.44-3.06-.4C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.54 4.09zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z"/></svg>
          </button>
        </div>
        <button className="ab-btn ab-btn--outline" type="button" onClick={() => navigate("/login")}>Sign In</button>
      </div>
    </main>
  );
}

function ErrorNote({ message }: { message: string }) {
  return (
    <p className="form-note form-note--error" role="alert">
      {message}
    </p>
  );
}

function SuccessNote({ message }: { message: string }) {
  return <p className="form-note form-note--success">{message}</p>;
}

/* ---------------- Social OAuth helpers ---------------- */

const GOOGLE_CLIENT_ID = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID ?? "";
const APPLE_CLIENT_ID = process.env.NEXT_PUBLIC_APPLE_CLIENT_ID ?? "";
const APPLE_REDIRECT_URI = process.env.NEXT_PUBLIC_APPLE_REDIRECT_URI ?? window.location.origin;

function loadScript(src: string, id: string): Promise<void> {
  return new Promise((resolve, reject) => {
    if (document.getElementById(id)) { resolve(); return; }
    const s = document.createElement("script");
    s.id = id;
    s.src = src;
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error(`Failed to load ${src}`));
    document.head.appendChild(s);
  });
}

function useGoogleLogin() {
  const { socialLogin } = useSession();
  const { notify } = useToast();
  const navigate = useNavigate();
  return useCallback(async () => {
    if (!GOOGLE_CLIENT_ID) {
      notify("error", "Google sign-in is not configured.");
      return;
    }
    try {
      await loadScript("https://accounts.google.com/gsi/client", "google-gsi");
      const google = (window as unknown as Record<string, { accounts: { id: { initialize: (cfg: Record<string, unknown>) => void; prompt: () => void } } }>).google;
      google.accounts.id.initialize({
        client_id: GOOGLE_CLIENT_ID,
        callback: (response: { credential?: string }) => {
          if (response.credential) {
            socialLogin("google", response.credential)
              .then(() => { notify("success", "Welcome to MediBook."); navigate(freshHomeForRole(), { replace: true }); })
              .catch((err: unknown) => { notify("error", err instanceof Error ? err.message : "Google sign-in failed."); });
          }
        },
      });
      google.accounts.id.prompt();
    } catch {
      notify("error", "Could not load Google sign-in.");
    }
  }, [socialLogin, notify, navigate]);
}

function useAppleLogin() {
  const { socialLogin } = useSession();
  const { notify } = useToast();
  const navigate = useNavigate();
  return useCallback(async () => {
    if (!APPLE_CLIENT_ID) {
      notify("error", "Apple sign-in is not configured.");
      return;
    }
    try {
      await loadScript("https://appleid.apple.com/auth/appleid.js", "apple-auth");
      const AppleID = (window as unknown as Record<string, { auth: { init: (cfg: Record<string, unknown>) => void; signIn: () => Promise<{ code?: string; id_token?: string }> } }>).AppleID;
      AppleID.auth.init({
        clientId: APPLE_CLIENT_ID,
        scope: "name email",
        redirectURI: APPLE_REDIRECT_URI,
        usePopup: true,
      });
      const result = await AppleID.auth.signIn();
      const token = result.id_token ?? result.code;
      if (token) {
        socialLogin("apple", token)
          .then(() => { notify("success", "Welcome to MediBook."); navigate(freshHomeForRole(), { replace: true }); })
          .catch((err: unknown) => { notify("error", err instanceof Error ? err.message : "Apple sign-in failed."); });
      } else {
        notify("error", "Apple sign-in was cancelled.");
      }
    } catch {
      notify("error", "Could not load Apple sign-in.");
    }
  }, [socialLogin, notify, navigate]);
}

/* ---------------- Login ---------------- */

export function LoginScreen() {
  const { login } = useSession();
  const { notify } = useToast();
  const navigate = useNavigate();
  const location = useLocation();
  const from = (location.state as { from?: string } | null)?.from;
  const googleLogin = useGoogleLogin();
  const appleLogin = useAppleLogin();

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const [topError, setTopError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setTopError("");
    setFormErrors({});
    setSubmitting(true);
    try {
      await login(username.trim(), password);
      notify("success", "Welcome back to MediBook.");
      // Fresh login: only return to the saved URL if THIS role owns it.
      // Otherwise land on your own dashboard — never another role's page.
      const target = from && canReturnTo(from) ? from : freshHomeForRole();
      navigate(target, { replace: true });
    } catch (error) {
      const fields = fieldErrors(error);
      setFormErrors(fields);
      if (!Object.keys(fields).length) setTopError(errorMessage(error));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AuthLayout
      title="Sign In"
      subtitle={"Welcome back! Please sign in\nto continue."}
      footer={
        <span>Don't have an account? <Link to="/register">Sign Up</Link></span>
      }
    >
      <form className="ab-form__inner" onSubmit={onSubmit} noValidate>
        {topError && <ErrorNote message={topError} />}
        <div className="ab-field">
          <label className="ab-field__label" htmlFor="login-username">Username</label>
          <input
            id="login-username"
            className="ab-field__input"
            type="text"
            autoComplete="username"
            required
            value={username}
            onChange={(e) => setUsername(e.target.value)}
          />
          {formErrors.username && <span className="ab-field__error">{formErrors.username}</span>}
        </div>
        <div className="ab-field">
          <label className="ab-field__label" htmlFor="login-password">Password</label>
          <input
            id="login-password"
            className="ab-field__input"
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          {formErrors.password && <span className="ab-field__error">{formErrors.password}</span>}
        </div>
        <Link className="ab-forgot" to="/forgot-password">Forgot Password?</Link>
        <button type="submit" className="ab-btn ab-btn--primary ab-btn--full" disabled={submitting}>
          {submitting ? "Signing In…" : "Sign In"}
        </button>
        <span className="ab-divider">or</span>
        <div className="ab-social-btns">
          <button className="ab-social-btn" type="button" onClick={googleLogin}>
            <svg width="18" height="18" viewBox="0 0 24 24"><path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/><path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/><path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/><path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/></svg>
            Continue with Google
          </button>
          <button className="ab-social-btn" type="button" onClick={appleLogin}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="#000"><path d="M17.05 20.28c-.98.95-2.05.88-3.08.4-1.09-.5-2.08-.48-3.24 0-1.44.62-2.2.44-3.06-.4C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.54 4.09zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z"/></svg>
            Continue with Apple
          </button>
        </div>
      </form>
    </AuthLayout>
  );
}

/* ---------------- Register ---------------- */

export function RegisterScreen() {
  const { register } = useSession();
  const { notify } = useToast();
  const navigate = useNavigate();

  const [role, setRole] = useState<RegisterPayload["role"]>("patient");
  const [values, setValues] = useState({
    username: "",
    first_name: "",
    last_name: "",
    email: "",
    phone: "",
    password: "",
    password_confirm: "",
  });
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const [topError, setTopError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const set = (key: keyof typeof values) => (e: ChangeEvent<HTMLInputElement>) =>
    setValues((prev) => ({ ...prev, [key]: e.target.value }));

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setTopError("");
    const errors: Record<string, string> = {};
    const nameParts = values.first_name.trim().split(/\s+/).filter(Boolean);
    if (nameParts.length < 2) errors.first_name = "Enter your full name.";
    if (values.username.trim().length < 3) errors.username = "Username must be at least 3 characters.";
    if (values.password.length < 8) errors.password = "Use at least 8 characters.";
    if (values.password !== values.password_confirm)
      errors.password_confirm = "Passwords do not match.";
    setFormErrors(errors);
    if (Object.keys(errors).length) return;

    setSubmitting(true);
    const payload: RegisterPayload = {
      username: values.username.trim(),
      email: values.email.trim(),
      password: values.password,
      password_confirm: values.password_confirm,
      first_name: nameParts[0],
      last_name: nameParts.slice(1).join(" "),
      role,
    };
    if (values.phone.trim()) payload.phone = values.phone.trim();

    try {
      await register(payload);
      notify("success", "Welcome to MediBook.");
      navigate(freshHomeForRole(), { replace: true });
    } catch (error) {
      const fields = fieldErrors(error);
      setFormErrors(fields);
      if (!Object.keys(fields).length) setTopError(errorMessage(error));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AuthLayout
      title="Sign Up"
      subtitle="Create your account to get started."
      footer={
        <span>
          Already registered? <Link to="/login">Sign In</Link>
        </span>
      }
    >
      <form className="ab-form__inner" onSubmit={onSubmit} noValidate>
        {topError && <ErrorNote message={topError} />}

        <div style={{ display: "none" }} role="radiogroup" aria-label="Account type">
          {(["patient", "doctor"] as const).map((option) => (
            <button
              key={option}
              type="button"
              role="radio"
              aria-checked={role === option}
              onClick={() => setRole(option)}
            >
              {option}
            </button>
          ))}
        </div>

        <div className="ab-field">
          <label className="ab-field__label" htmlFor="reg-username">Username</label>
          <input
            id="reg-username"
            className="ab-field__input"
            type="text"
            autoComplete="username"
            required
            value={values.username}
            onChange={set("username")}
          />
          {formErrors.username && <span className="ab-field__error">{formErrors.username}</span>}
        </div>
        <div className="ab-field">
          <label className="ab-field__label" htmlFor="reg-name">Full Name</label>
          <input
            id="reg-name"
            className="ab-field__input"
            autoComplete="name"
            required
            value={values.first_name}
            onChange={set("first_name")}
          />
          {formErrors.first_name && <span className="ab-field__error">{formErrors.first_name}</span>}
        </div>
        <div className="ab-field">
          <label className="ab-field__label" htmlFor="reg-email">Email Address</label>
          <input
            id="reg-email"
            className="ab-field__input"
            type="email"
            autoComplete="email"
            required
            value={values.email}
            onChange={set("email")}
          />
          {formErrors.email && <span className="ab-field__error">{formErrors.email}</span>}
        </div>
        <div className="ab-field">
          <label className="ab-field__label" htmlFor="reg-phone">Phone Number</label>
          <input
            id="reg-phone"
            className="ab-field__input"
            type="tel"
            autoComplete="tel"
            value={values.phone}
            onChange={set("phone")}
          />
          {formErrors.phone && <span className="ab-field__error">{formErrors.phone}</span>}
        </div>
        <div className="ab-field">
          <label className="ab-field__label" htmlFor="reg-password">Password</label>
          <input
            id="reg-password"
            className="ab-field__input"
            type="password"
            autoComplete="new-password"
            required
            value={values.password}
            onChange={set("password")}
          />
          {formErrors.password && <span className="ab-field__error">{formErrors.password}</span>}
        </div>
        <div className="ab-field">
          <label className="ab-field__label" htmlFor="reg-confirm">Confirm Password</label>
          <input
            id="reg-confirm"
            className="ab-field__input"
            type="password"
            autoComplete="new-password"
            required
            value={values.password_confirm}
            onChange={set("password_confirm")}
          />
          {formErrors.password_confirm && <span className="ab-field__error">{formErrors.password_confirm}</span>}
        </div>
        <label className="ab-terms">
          <input type="checkbox" required />
          <span>I agree to the Terms &amp; Conditions and Privacy Policy</span>
        </label>
        <button type="submit" className="ab-btn ab-btn--primary ab-btn--full" disabled={submitting}>
          {submitting ? "Creating Account…" : "Create Account"}
        </button>
      </form>
    </AuthLayout>
  );
}

/* ---------------- Forgot password ---------------- */

export function ForgotPasswordScreen() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const [topError, setTopError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setTopError("");
    setFormErrors({});
    setSubmitting(true);
    try {
      await requestPasswordReset(email.trim());
      setSent(true);
    } catch (error) {
      const fields = fieldErrors(error);
      setFormErrors(fields);
      if (!Object.keys(fields).length) setTopError(errorMessage(error));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AuthLayout
      title="Forgot Password"
      subtitle={"Enter your email address and we'll send\nyou a reset link."}
      footer={<span><Link to="/login">Back to Login</Link></span>}
    >
      {sent ? (
        <>
          <SuccessNote message="If an account exists for this email, a reset code has been sent. The code expires after a short time." />
          <button className="ab-btn ab-btn--primary ab-btn--full" type="button" onClick={() => navigate("/reset-password")}>
            Enter reset code
          </button>
        </>
      ) : (
        <form className="ab-form__inner" onSubmit={onSubmit} noValidate>
          {topError && <ErrorNote message={topError} />}
          <div className="ab-field">
            <label className="ab-field__label" htmlFor="forgot-email">Email Address</label>
            <input
              id="forgot-email"
              className="ab-field__input"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e: ChangeEvent<HTMLInputElement>) => setEmail(e.target.value)}
            />
            {formErrors.email && <span className="ab-field__error">{formErrors.email}</span>}
          </div>
          <button type="submit" className="ab-btn ab-btn--primary ab-btn--full" disabled={submitting}>
            {submitting ? "Sending…" : "Send Link"}
          </button>
        </form>
      )}
    </AuthLayout>
  );
}

/* ---------------- Reset password ---------------- */

export function ResetPasswordScreen() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [token, setToken] = useState(searchParams.get("token") ?? "");
  const [newPassword, setNewPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const [topError, setTopError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setTopError("");
    setFormErrors({});
    if (newPassword !== confirm) {
      setFormErrors({ new_password_confirm: "Passwords do not match." });
      return;
    }
    setSubmitting(true);
    try {
      await confirmPasswordReset({
        token: token.trim(),
        new_password: newPassword,
        new_password_confirm: confirm,
      });
      navigate("/login", { replace: true });
    } catch (error) {
      const fields = fieldErrors(error);
      setFormErrors(fields);
      if (!Object.keys(fields).length) setTopError(errorMessage(error));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AuthLayout
      title="Set a new password"
      subtitle="Paste the reset code from your email."
      footer={<span><Link to="/login">Back to sign in</Link></span>}
    >
      <form className="ab-form__inner" onSubmit={onSubmit} noValidate>
        {topError && <ErrorNote message={topError} />}
        <div className="ab-field">
          <label className="ab-field__label" htmlFor="reset-token">Reset code</label>
          <input
            id="reset-token"
            className="ab-field__input"
            required
            autoComplete="one-time-code"
            value={token}
            onChange={(e: ChangeEvent<HTMLInputElement>) => setToken(e.target.value)}
          />
          {formErrors.token && <span className="ab-field__error">{formErrors.token}</span>}
        </div>
        <div className="ab-field">
          <label className="ab-field__label" htmlFor="reset-password">New password</label>
          <input
            id="reset-password"
            className="ab-field__input"
            type="password"
            autoComplete="new-password"
            required
            value={newPassword}
            onChange={(e: ChangeEvent<HTMLInputElement>) => setNewPassword(e.target.value)}
          />
          {formErrors.new_password && <span className="ab-field__error">{formErrors.new_password}</span>}
        </div>
        <div className="ab-field">
          <label className="ab-field__label" htmlFor="reset-confirm">Confirm new password</label>
          <input
            id="reset-confirm"
            className="ab-field__input"
            type="password"
            autoComplete="new-password"
            required
            value={confirm}
            onChange={(e: ChangeEvent<HTMLInputElement>) => setConfirm(e.target.value)}
          />
          {formErrors.new_password_confirm && <span className="ab-field__error">{formErrors.new_password_confirm}</span>}
        </div>
        <button type="submit" className="ab-btn ab-btn--primary ab-btn--full" disabled={submitting}>
          {submitting ? "Updating…" : "Update password"}
        </button>
      </form>
    </AuthLayout>
  );
}

