/**
 * PHASE 5 — Authentication screens (§54).
 *
 * LoginScreen          — email + password → session (redirects back to the
 *                        URL the guard remembered, or home).
 * RegisterScreen       — patient/doctor self-registration (§54 role-based).
 * ForgotPasswordScreen — neutral request (§36 — never reveals account state).
 * ResetPasswordScreen  — code from the email (supports ?token= prefill).
 * VerifyEmailScreen    — code from the email (supports ?token= prefill);
 *                        the backend emails a code, not a link.
 */

import { useState, type ChangeEvent, type FormEvent, type ReactNode } from "react";
import { Link, useLocation, useNavigate, useSearchParams } from "react-router-dom";
import {
  confirmPasswordReset,
  requestPasswordReset,
  resendVerification,
  verifyEmail,
} from "../api/auth";
import { ApiError } from "../api/client";
import type { RegisterPayload } from "../api/types";
import { useSession, useToast } from "../state/app-context";
import { Button, Card, TextField } from "../components/ui";

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

/** Single-column centered layout shared by every auth screen. */
function AuthLayout({
  title,
  subtitle,
  children,
  footer,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <div className="auth-page">
      <header className="auth-page__head">
        <h1 className="auth-page__title">{title}</h1>
        {subtitle && <p className="auth-page__subtitle">{subtitle}</p>}
      </header>
      <Card>{children}</Card>
      {footer && <div className="auth-page__footer">{footer}</div>}
    </div>
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

/* ---------------- Login ---------------- */

export function LoginScreen() {
  const { login } = useSession();
  const { notify } = useToast();
  const navigate = useNavigate();
  const location = useLocation();
  const from = (location.state as { from?: string } | null)?.from;

  const [email, setEmail] = useState("");
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
      await login(email.trim(), password);
      notify("success", "Welcome back to MediBook.");
      navigate(from ?? "/", { replace: true });
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
      title="Sign in"
      subtitle="Use the email you registered with."
      footer={
        <>
          <span>
            No account? <Link to="/register">Create one</Link>
          </span>
          <Link to="/forgot-password">Forgot password?</Link>
        </>
      }
    >
      <form className="form" onSubmit={onSubmit} noValidate>
        {topError && <ErrorNote message={topError} />}
        <TextField
          id="login-email"
          label="Email"
          type="email"
          autoComplete="email"
          required
          value={email}
          error={formErrors.email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <TextField
          id="login-password"
          label="Password"
          type="password"
          autoComplete="current-password"
          required
          value={password}
          error={formErrors.password}
          onChange={(e) => setPassword(e.target.value)}
        />
        <Button type="submit" loading={submitting} fullWidth>
          Sign in
        </Button>
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
    if (values.password.length < 8) errors.password = "Use at least 8 characters.";
    if (values.password !== values.password_confirm)
      errors.password_confirm = "Passwords do not match.";
    setFormErrors(errors);
    if (Object.keys(errors).length) return;

    setSubmitting(true);
    const payload: RegisterPayload = {
      email: values.email.trim(),
      password: values.password,
      password_confirm: values.password_confirm,
      first_name: values.first_name.trim(),
      last_name: values.last_name.trim(),
      role,
    };
    if (values.phone.trim()) payload.phone = values.phone.trim();

    try {
      await register(payload);
      notify("success", "Account created. Check your email for the verification code.");
      navigate("/", { replace: true });
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
      title="Create your account"
      subtitle="Join as a patient to book, or as a doctor to receive bookings."
      footer={
        <span>
          Already registered? <Link to="/login">Sign in</Link>
        </span>
      }
    >
      <form className="form" onSubmit={onSubmit} noValidate>
        {topError && <ErrorNote message={topError} />}

        <div className="role-toggle" role="radiogroup" aria-label="Account type">
          {(["patient", "doctor"] as const).map((option) => (
            <button
              key={option}
              type="button"
              role="radio"
              aria-checked={role === option}
              className={`role-toggle__option${
                role === option ? " role-toggle__option--active" : ""
              }`}
              onClick={() => setRole(option)}
            >
              {option === "patient" ? "🧑 Patient" : "🩺 Doctor"}
            </button>
          ))}
        </div>

        <div className="form__row">
          <TextField
            id="reg-first"
            label="First name"
            autoComplete="given-name"
            required
            value={values.first_name}
            error={formErrors.first_name}
            onChange={set("first_name")}
          />
          <TextField
            id="reg-last"
            label="Last name"
            autoComplete="family-name"
            required
            value={values.last_name}
            error={formErrors.last_name}
            onChange={set("last_name")}
          />
        </div>
        <TextField
          id="reg-email"
          label="Email"
          type="email"
          autoComplete="email"
          required
          value={values.email}
          error={formErrors.email}
          onChange={set("email")}
        />
        <TextField
          id="reg-phone"
          label="Phone (optional)"
          type="tel"
          autoComplete="tel"
          value={values.phone}
          error={formErrors.phone}
          onChange={set("phone")}
        />
        <TextField
          id="reg-password"
          label="Password"
          type="password"
          autoComplete="new-password"
          required
          hint="At least 8 characters."
          value={values.password}
          error={formErrors.password}
          onChange={set("password")}
        />
        <TextField
          id="reg-confirm"
          label="Confirm password"
          type="password"
          autoComplete="new-password"
          required
          value={values.password_confirm}
          error={formErrors.password_confirm}
          onChange={set("password_confirm")}
        />
        <Button type="submit" loading={submitting} fullWidth>
          Create account
        </Button>
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
      title="Forgot password"
      subtitle="We'll email you a one-time reset code."
      footer={<span><Link to="/login">Back to sign in</Link></span>}
    >
      {sent ? (
        <>
          <SuccessNote message="If an account exists for this email, a reset code has been sent. The code expires after a short time." />
          <Button fullWidth onClick={() => navigate("/reset-password")}>
            Enter reset code
          </Button>
        </>
      ) : (
        <form className="form" onSubmit={onSubmit} noValidate>
          {topError && <ErrorNote message={topError} />}
          <TextField
            id="forgot-email"
            label="Email"
            type="email"
            autoComplete="email"
            required
            value={email}
            error={formErrors.email}
            onChange={(e: ChangeEvent<HTMLInputElement>) => setEmail(e.target.value)}
          />
          <Button type="submit" loading={submitting} fullWidth>
            Send reset code
          </Button>
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
      <form className="form" onSubmit={onSubmit} noValidate>
        {topError && <ErrorNote message={topError} />}
        <TextField
          id="reset-token"
          label="Reset code"
          required
          autoComplete="one-time-code"
          value={token}
          error={formErrors.token}
          onChange={(e: ChangeEvent<HTMLInputElement>) => setToken(e.target.value)}
        />
        <TextField
          id="reset-password"
          label="New password"
          type="password"
          autoComplete="new-password"
          required
          hint="At least 8 characters."
          value={newPassword}
          error={formErrors.new_password}
          onChange={(e: ChangeEvent<HTMLInputElement>) => setNewPassword(e.target.value)}
        />
        <TextField
          id="reset-confirm"
          label="Confirm new password"
          type="password"
          autoComplete="new-password"
          required
          value={confirm}
          error={formErrors.new_password_confirm}
          onChange={(e: ChangeEvent<HTMLInputElement>) => setConfirm(e.target.value)}
        />
        <Button type="submit" loading={submitting} fullWidth>
          Update password
        </Button>
      </form>
    </AuthLayout>
  );
}

/* ---------------- Verify email ---------------- */

export function VerifyEmailScreen() {
  const { setUser } = useSession();
  const { notify } = useToast();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [token, setToken] = useState(searchParams.get("token") ?? "");
  const [email, setEmail] = useState("");
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const [topError, setTopError] = useState("");
  const [resent, setResent] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setTopError("");
    setFormErrors({});
    setSubmitting(true);
    try {
      const envelope = await verifyEmail(token.trim());
      setUser(envelope.data.user);
      notify("success", "Email verified. Welcome to MediBook!");
      navigate("/", { replace: true });
    } catch (error) {
      const fields = fieldErrors(error);
      setFormErrors(fields);
      if (!Object.keys(fields).length) setTopError(errorMessage(error));
    } finally {
      setSubmitting(false);
    }
  }

  async function onResend(event: FormEvent) {
    event.preventDefault();
    setTopError("");
    try {
      await resendVerification(email.trim());
      setResent(true);
    } catch (error) {
      const fields = fieldErrors(error);
      setFormErrors(fields);
      if (!Object.keys(fields).length) setTopError(errorMessage(error));
    }
  }

  return (
    <AuthLayout
      title="Verify your email"
      subtitle="Paste the one-time code we emailed you."
      footer={<span><Link to="/login">Back to sign in</Link></span>}
    >
      <form className="form" onSubmit={onSubmit} noValidate>
        {topError && <ErrorNote message={topError} />}
        <TextField
          id="verify-token"
          label="Verification code"
          required
          autoComplete="one-time-code"
          value={token}
          error={formErrors.token}
          onChange={(e: ChangeEvent<HTMLInputElement>) => setToken(e.target.value)}
        />
        <Button type="submit" loading={submitting} fullWidth>
          Verify email
        </Button>
      </form>

      <form className="form form--divider" onSubmit={onResend} noValidate>
        <p className="form-note">Didn't get the code? Request a new one.</p>
        {resent && <SuccessNote message="If the account is unverified, a new code was sent." />}
        <div className="form__row">
          <TextField
            id="verify-email"
            label="Email"
            type="email"
            autoComplete="email"
            required
            value={email}
            error={formErrors.email}
            onChange={(e: ChangeEvent<HTMLInputElement>) => setEmail(e.target.value)}
          />
          <Button type="submit" variant="secondary">
            Resend code
          </Button>
        </div>
      </form>
    </AuthLayout>
  );
}