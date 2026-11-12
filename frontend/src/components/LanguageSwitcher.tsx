/**
 * Language switcher — one component, three placements:
 *
 *  - `card`    : full "Language" card on the shared /profile screen (every role)
 *  - `inline`  : compact globe + native select for guests on auth/onboarding
 *  - `sidebar` : globe shortcut + popover in the app sidebar footer
 *
 * Switching is instant (`i18n.changeLanguage`, no reload). Guests persist the
 * choice in localStorage; signed-in users also PATCH /auth/me so the account
 * language follows them to another device. A failed server sync never undoes
 * the local switch — it only warns that the account could not keep it.
 */
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Check, ChevronUp, Globe } from "lucide-react";
import {
  APP_LANGUAGES,
  LANGUAGE_NAMES,
  changeAppLanguage,
  normalizeLanguage,
  type AppLanguage,
} from "../i18n";
import { updateMe } from "../api/auth";
import { useOptionalSession, useToast } from "../state/app-context";
import { Card } from "./ui";

export type LanguageSwitcherVariant = "card" | "inline" | "sidebar";

export function LanguageSwitcher({
  variant = "card",
  className = "",
  onSelected,
}: {
  variant?: LanguageSwitcherVariant;
  className?: string;
  onSelected?: () => void;
}) {
  const { t, i18n } = useTranslation();
  const session = useOptionalSession();
  const user = session?.user ?? null;
  const { notify } = useToast();
  const [saving, setSaving] = useState<AppLanguage | null>(null);
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  const current =
    normalizeLanguage(i18n.resolvedLanguage ?? i18n.language) ?? "en";

  // Close the sidebar popover on outside click / Escape.
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  async function choose(language: AppLanguage) {
    setOpen(false);
    onSelected?.();
    if (saving || language === current) return;

    setSaving(language);
    // Instant UI switch first — no reload, every t() re-renders.
    await changeAppLanguage(language);

    if (user) {
      try {
        const envelope = await updateMe({ language });
        session?.setUser(envelope.data);
      } catch {
        // i18n.t (not the closure's `t`) so the warning is in the NEW language.
        notify("error", i18n.t("language.saveError"));
      }
    }
    setSaving(null);
  }

  if (variant === "inline") {
    return (
      <label className={`language-inline ${className}`.trim()}>
        <Globe size={16} aria-hidden="true" />
        <span className="sr-only">{t("language.menuLabel")}</span>
        <select
          value={current}
          aria-label={t("language.menuLabel")}
          title={t("language.menuLabel")}
          disabled={saving !== null}
          onChange={(event) => void choose(event.target.value as AppLanguage)}
        >
          {APP_LANGUAGES.map((language) => (
            <option key={language} value={language}>
              {LANGUAGE_NAMES[language]}
            </option>
          ))}
        </select>
      </label>
    );
  }

  if (variant === "sidebar") {
    return (
      <div className={`language-menu ${className}`.trim()} ref={rootRef}>
        <button
          type="button"
          className="sidebar__signout language-menu__trigger"
          aria-haspopup="listbox"
          aria-expanded={open}
          title={t("language.menuLabel")}
          onClick={() => setOpen((value) => !value)}
        >
          <Globe size={18} aria-hidden="true" />
          <span>{LANGUAGE_NAMES[current]}</span>
          <ChevronUp
            size={14}
            className={`language-menu__chevron${open ? " language-menu__chevron--open" : ""}`}
            aria-hidden="true"
          />
        </button>

        {open && (
          <div className="language-menu__panel" role="listbox" aria-label={t("language.title")}>
            {APP_LANGUAGES.map((language) => {
              const selected = language === current;
              return (
                <button
                  key={language}
                  type="button"
                  role="option"
                  aria-selected={selected}
                  className={`language-menu__option${selected ? " language-menu__option--active" : ""}`}
                  onClick={() => void choose(language)}
                >
                  <span>{LANGUAGE_NAMES[language]}</span>
                  {selected && <Check size={15} aria-hidden="true" />}
                </button>
              );
            })}
          </div>
        )}
      </div>
    );
  }

  return (
    <Card className={`language-card ${className}`.trim()}>
      <div className="language-card__head">
        <span className="language-card__icon" aria-hidden="true">
          <Globe size={20} />
        </span>
        <div>
          <h2 className="card__title">{t("language.title")}</h2>
          <p className="page__subtitle">{t("language.description")}</p>
        </div>
      </div>
      <div className="language-card__options" role="radiogroup" aria-label={t("language.title")}>
        {APP_LANGUAGES.map((language) => {
          const selected = language === current;
          return (
            <button
              key={language}
              type="button"
              role="radio"
              aria-checked={selected}
              className={`language-chip${selected ? " language-chip--active" : ""}`}
              disabled={saving !== null}
              onClick={() => void choose(language)}
            >
              <span>{LANGUAGE_NAMES[language]}</span>
              {selected && <Check size={16} aria-hidden="true" />}
            </button>
          );
        })}
      </div>
    </Card>
  );
}
