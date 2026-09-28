/**
 * Accessible modal dialog used by the guided permission prompts (location,
 * notifications). There was no modal primitive in the design system, so this
 * one sticks to the existing tokens — `.modal`, `.modal__backdrop`,
 * `.modal__card`, `.modal__title`, `.modal__body`, `.modal__actions` — and
 * keeps all of the expected dialog behaviour: labelled, scroll-locked, ESC to
 * dismiss and initial focus.
 */
import { useEffect, useRef, type ReactNode } from "react";
import { X } from "lucide-react";

export interface ModalProps {
  open: boolean;
  /** Accessible name — required so screen readers announce the dialog. */
  title: string;
  children: ReactNode;
  /** Footer buttons; pass `null` to hide the row. */
  actions?: ReactNode;
  /** Close button + backdrop click + ESC. Default true. */
  dismissible?: boolean;
  onDismiss?: () => void;
  /** Extra class on the card, for narrow/wide variants. */
  className?: string;
}

const FOCUSABLE =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function Modal({
  open,
  title,
  children,
  actions,
  dismissible = true,
  onDismiss,
  className = "",
}: ModalProps) {
  const cardRef = useRef<HTMLDivElement | null>(null);

  // Lock background scroll while the dialog is up.
  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [open]);

  // Initial focus goes to the first control inside the dialog.
  useEffect(() => {
    if (!open) return;
    const id = window.setTimeout(() => {
      const card = cardRef.current;
      if (!card) return;
      const focusable = card.querySelectorAll<HTMLElement>(FOCUSABLE);
      (focusable[0] ?? card).focus();
    }, 0);
    return () => window.clearTimeout(id);
  }, [open]);

  // ESC dismisses (when allowed).
  useEffect(() => {
    if (!open || !dismissible) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.stopPropagation();
        onDismiss?.();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, dismissible, onDismiss]);

  if (!open) return null;

  return (
    <div
      className="modal"
      role="presentation"
      onMouseDown={(event) => {
        if (dismissible && event.target === event.currentTarget) onDismiss?.();
      }}
    >
      <div className="modal__backdrop" aria-hidden="true" />
      <div
        className={`modal__card ${className}`.trim()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-title"
        ref={cardRef}
        tabIndex={-1}
      >
        <header className="modal__header">
          <h2 className="modal__title" id="modal-title">
            {title}
          </h2>
          {dismissible && (
            <button
              type="button"
              className="modal__close"
              onClick={() => onDismiss?.()}
              aria-label="Close dialog"
            >
              <X size={18} />
            </button>
          )}
        </header>
        <div className="modal__body">{children}</div>
        {actions !== null && <footer className="modal__actions">{actions}</footer>}
      </div>
    </div>
  );
}
