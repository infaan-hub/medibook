/**
 * First-visit language gate.
 *
 * Shown once on /onboarding so a brand-new visitor can pick the app language
 * before reading the setup guide. Tapping an option calls `changeAppLanguage`
 * immediately — every onboarding/welcome string re-renders in that language
 * without a reload. Dismissing the dialog (Continue, close button, Escape or
 * backdrop) records a separate localStorage flag, so later visits are not
 * interrupted while the inline switcher stays available for changes.
 */
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { Check, Globe, X } from "lucide-react";
import {
  APP_LANGUAGES,
  LANGUAGE_NAMES,
  changeAppLanguage,
  normalizeLanguage,
  rememberLanguageChoice,
  type AppLanguage,
} from "../i18n";

/** Kept apart from i18n's own cache key so "seen the gate" is not confused
 *  with "has a stored language" (the detector writes that on first load). */
export const LANGUAGE_PROMPT_SEEN_KEY = "medibook_language_prompt_seen";

export function hasSeenLanguagePrompt(): boolean {
  if (typeof window === "undefined") return true;
  try {
    return window.localStorage.getItem(LANGUAGE_PROMPT_SEEN_KEY) === "1";
  } catch {
    return true;
  }
}

export function markLanguagePromptSeen(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(LANGUAGE_PROMPT_SEEN_KEY, "1");
  } catch {
    /* Private mode with storage disabled — the gate simply shows again. */
  }
}

export function LanguageGate({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const { t, i18n } = useTranslation();
  const [selected, setSelected] = useState<AppLanguage>(
    () => normalizeLanguage(i18n.resolvedLanguage ?? i18n.language) ?? "en"
  );
  const dialogRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const descriptionId = useId();

  // Keep the checkmark in sync if the language is changed elsewhere while open.
  useEffect(() => {
    if (!open) return;
    setSelected(normalizeLanguage(i18n.resolvedLanguage ?? i18n.language) ?? "en");
  }, [open, i18n.resolvedLanguage, i18n.language]);

  // Lock background scroll, move focus into the dialog, restore it on close.
  useEffect(() => {
    if (!open) return;
    const previousFocus = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const option =
      dialogRef.current?.querySelector<HTMLElement>(
        '[data-language-option][aria-checked="true"]'
      ) ?? dialogRef.current?.querySelector<HTMLElement>("[data-language-option]");
    option?.focus();

    return () => {
      document.body.style.overflow = previousOverflow;
      previousFocus?.focus?.();
    };
  }, [open]);

  // Escape closes; Tab is trapped inside the dialog.
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key !== "Tab" || !dialogRef.current) return;
      const focusable = Array.from(
        dialogRef.current.querySelectorAll<HTMLElement>(
          'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
        )
      );
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  const choose = useCallback((language: AppLanguage) => {
    setSelected(language);
    // This is a deliberate choice: carry it into the account after sign-in so
    // every other page (not just onboarding) keeps the same language.
    rememberLanguageChoice(language);
    // Instant switch — no reload, no confirmation step.
    void changeAppLanguage(language);
  }, []);

  if (!open || typeof document === "undefined") return null;

  return createPortal(
    <div className="language-gate">
      <div
        className="language-gate__backdrop"
        aria-hidden="true"
        onClick={onClose}
      />
      <div
        ref={dialogRef}
        className="language-gate__dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
      >
        <button
          type="button"
          className="language-gate__close"
          aria-label={t("onboarding.languagePrompt.close")}
          onClick={onClose}
        >
          <X size={18} aria-hidden="true" />
        </button>

        <span className="language-gate__icon" aria-hidden="true">
          <Globe size={24} />
        </span>
        <h2 className="language-gate__title" id={titleId}>
          {t("onboarding.languagePrompt.title")}
        </h2>
        <p className="language-gate__desc" id={descriptionId}>
          {t("onboarding.languagePrompt.description")}
        </p>

        <div
          className="language-gate__options"
          role="radiogroup"
          aria-label={t("onboarding.languagePrompt.title")}
        >
          {APP_LANGUAGES.map((language) => {
            const active = language === selected;
            return (
              <button
                key={language}
                type="button"
                role="radio"
                aria-checked={active}
                data-language-option
                className={`language-gate__option${
                  active ? " language-gate__option--active" : ""
                }`}
                onClick={() => choose(language)}
              >
                <span className="language-gate__code" aria-hidden="true">
                  {language.toUpperCase()}
                </span>
                <span className="language-gate__name">
                  {LANGUAGE_NAMES[language]}
                </span>
                {active && (
                  <Check
                    className="language-gate__check"
                    size={18}
                    aria-hidden="true"
                  />
                )}
              </button>
            );
          })}
        </div>

        <button
          type="button"
          className="ab-btn ab-btn--primary language-gate__continue"
          onClick={onClose}
        >
          {t("onboarding.languagePrompt.continue")}
        </button>
      </div>
    </div>,
    document.body
  );
}
