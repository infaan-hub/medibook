/**
 * Reusable UI widgets (§47 component inventory). All visuals come from the
 * design tokens — no hardcoded colours, spacing or radii.
 */

import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode } from "react";

/* ---------------- Spinner (§21 loading state) ---------------- */

export function Spinner({ size = 20, label = "Loading" }: { size?: number; label?: string }) {
  return (
    <span className="spinner" role="status" aria-label={label} style={{ width: size, height: size }}>
      <span className="spinner__circle" />
    </span>
  );
}

/* ---------------- Button (variants: primary / secondary / ghost / danger) ---------------- */

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "ghost" | "danger";
  loading?: boolean;
  fullWidth?: boolean;
}

export function Button({
  variant = "primary",
  loading = false,
  fullWidth = false,
  disabled,
  children,
  className = "",
  ...rest
}: ButtonProps) {
  const classes = ["btn", `btn--${variant}`, fullWidth ? "btn--block" : "", className]
    .filter(Boolean)
    .join(" ");
  return (
    <button type="button" className={classes} disabled={disabled || loading} {...rest}>
      {loading && <Spinner size={16} label="" />}
      <span className={loading ? "btn__label--loading" : undefined}>{children}</span>
    </button>
  );
}

/* ---------------- TextField (label + input + error, §21) ---------------- */

interface TextFieldProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  error?: string;
  hint?: string;
  id: string;
}

export function TextField({ label, error, hint, id, className = "", ...rest }: TextFieldProps) {
  return (
    <div className={`field ${className}`}>
      <label className="field__label" htmlFor={id}>
        {label}
      </label>
      <input
        id={id}
        className={`field__input${error ? " field__input--error" : ""}`}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${id}-error` : hint ? `${id}-hint` : undefined}
        {...rest}
      />
      {hint && !error && (
        <p className="field__hint" id={`${id}-hint`}>
          {hint}
        </p>
      )}
      {error && (
        <p className="field__error" id={`${id}-error`} role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

/* ---------------- Card ---------------- */

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <section className={`card ${className}`.trim()}>{children}</section>;
}

/* ---------------- Badge (appointment status colours, §9) ---------------- */

export type BadgeStatus =
  | "pending"
  | "confirmed"
  | "completed"
  | "cancelled"
  | "rejected"
  | "no-show";

export function Badge({ status }: { status: BadgeStatus }) {
  return <span className={`badge badge--${status}`}>{status}</span>;
}

/* ---------------- EmptyState (§21 empty state) ---------------- */

export function EmptyState({
  icon = "☰",
  title,
  description,
  action,
}: {
  icon?: string;
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="empty">
      <div className="empty__icon" aria-hidden="true">
        {icon}
      </div>
      <h2 className="empty__title">{title}</h2>
      {description && <p className="empty__description">{description}</p>}
      {action && <div className="empty__action">{action}</div>}
    </div>
  );
}

/* ---------------- ErrorState (§21 error state) ---------------- */

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="error-state" role="alert">
      <div className="error-state__icon" aria-hidden="true">
        !
      </div>
      <p className="error-state__message">{message}</p>
      {onRetry && (
        <Button variant="secondary" onClick={onRetry}>
          Retry
        </Button>
      )}
    </div>
  );
}

/* ---------------- Skeleton (§21 loading placeholder) ---------------- */

export function Skeleton({ lines = 3 }: { lines?: number }) {
  return (
    <div className="skeleton" aria-hidden="true">
      {Array.from({ length: lines }, (_, index) => (
        <span key={index} className="skeleton__line" style={{ width: `${100 - index * 12}%` }} />
      ))}
    </div>
  );
}