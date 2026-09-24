/**
 * Toast viewport — renders the ToastProvider queue (§21 feedback states).
 */

import { useToast } from "../state/app-context";
import { X } from "lucide-react";

export function ToastViewport() {
  const { toasts, dismiss } = useToast();
  if (toasts.length === 0) return null;

  return (
    <div className="toast-viewport" aria-live="polite">
      {toasts.map((toast) => (
        <div key={toast.id} className={`toast toast--${toast.kind}`} role="status">
          <span className="toast__message">{toast.message}</span>
          <button
            type="button"
            className="toast__close"
            aria-label="Dismiss notification"
            onClick={() => dismiss(toast.id)}
          >
            <X size={16} aria-hidden="true" />
          </button>
        </div>
      ))}
    </div>
  );
}
