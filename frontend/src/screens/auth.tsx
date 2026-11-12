
/**
 * PHASE 5 — Authentication screens (§54).
 *
 * LoginScreen          — username + password → session (lock banner with a
 *                        live countdown + attempts remaining when the server
 *                        reports them).
 * RegisterScreen       — patient/doctor self-registration (§54 role-based).
 * ForgotPasswordScreen — email only; hands the reset handle straight to the
 *                        new-password screen (no visible code step).
 * ResetPasswordScreen  — new-password form (handle from navigation state or
 *                        ?token= prefill; never a field to type).
 */

import { useState, useRef, useEffect, useCallback, type ChangeEvent, type FormEvent, type ReactNode } from "react";
import { Link, useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import i18n from "../i18n";
import {
  confirmPasswordReset,
  requestPasswordReset,
} from "../api/auth";
import { ApiError } from "../api/client";
import type { RegisterPayload } from "../api/types";
import { useSession, useToast } from "../state/app-context";
import { LOGIN_PATH, homeForRole, roleOwnsPath } from "../components/guards";
import { InstallAppButton } from "../components/InstallAppButton";
import { getPushPlatform } from "../lib/platform";
import { collectLoginPush } from "../push/loginPush";
import { TextField } from "../components/ui";
import { LanguageSwitcher } from "../components/LanguageSwitcher";
import {
  LanguageGate,
  hasSeenLanguagePrompt,
  markLanguagePromptSeen,
} from "../components/LanguageGate";

/* ---------------- shared helpers ---------------- */

/**
 * Flatten DRF field errors ({email: ["…"]}) to per-field first messages.
 *
 * `non_field_errors` is deliberately excluded: it has no input to render
 * under (wrong credentials, deactivated account, …). Keeping it in this map
 * used to suppress the top-level banner (the caller only shows it when the
 * map is empty) while nothing rendered the key — the message was silently
 * dropped. Callers therefore see it via `errorMessage(error)` in the banner.
 */
function fieldErrors(error: unknown): Record<string, string> {
  if (error instanceof ApiError) {
    return Object.fromEntries(
      Object.entries(error.errors)
        .filter(([field]) => field !== "non_field_errors")
        .map(([field, messages]) => [
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
      if (stored.role === "doctor" || stored.role === "admin" || stored.role === "patient" || stored.role === "coordinator") {
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
    if (stored.role !== "doctor" && stored.role !== "admin" && stored.role !== "patient" && stored.role !== "coordinator") {
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
  const { t } = useTranslation();
  const navigate = useNavigate();
  return (
    <main className="ab-page">
      <div className="ab-language">
        <LanguageSwitcher variant="inline" />
      </div>
      {!hideBack && (
        <button className="ab-back" type="button" aria-label={t("auth.goBack")} onClick={() => navigate(-1)}>
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

/* /onboarding — a 4-slide setup tutorial for first-time visitors. First-visit
   flow stays /splash → /onboarding → /welcome; nothing else changes.
   Slide 1 "Welcome to MediBook" says what the guide will set up. Slides 2 and
   3 teach the real permission flow (what MediBook shows first, what the
   browser/OS asks, what to press, and how to recover after Block). Slide 4
   walks installing on Android, iPhone/iPad and desktop.
   Every teaching image is either a REAL MediBook screenshot
   (public/images/onboarding/*.png) or a clearly captioned browser mockup
   (public/images/tutorial-*.svg) — mockups always carry the "Example …"
   caption so nobody expects pixel-identical UI. The logo is always the real
   logo.jpeg (36px brand row, 96px welcome hero) — never text or an emoji.
   Platform tabs are pre-selected from the device but all three remain one tap
   away; detection is a convenience, never a requirement. */

type PlatformKey = "android" | "iphone" | "desktop";

type OnboardingVisual = {
  readonly src: string;
  readonly alt: string;
  /** Line under the image — what it shows, or the "Example …" label. */
  readonly caption?: string;
  /** Real MediBook screenshot (captions render as the teal label style). */
  readonly real?: boolean;
};

type OnboardingPlatformPanel = {
  readonly key: PlatformKey;
  readonly label: string;
  readonly visual: OnboardingVisual;
  /** Numbered "what you see / what you press" procedure. */
  readonly steps: readonly string[];
  /** Recovery or caveat shown under the steps. */
  readonly note?: string;
  /** Optional real screenshot shown after the steps. */
  readonly extra?: OnboardingVisual;
};

type OnboardingSlide = {
  readonly title: string;
  readonly description?: string;
  /** Why this step matters (slides 2–3). */
  readonly why?: string;
  /** Real MediBook screenshot shown above the title. */
  readonly hero?: OnboardingVisual;
  /** Compact MediBook → Allow → enabled chips (slide 3). */
  readonly flow?: readonly string[];
  /** Agenda bullets (slide 1). */
  readonly steps?: readonly string[];
  /** Tabbed per-platform procedures (slides 2–4). */
  readonly platforms?: readonly OnboardingPlatformPanel[];
  /** Real logo hero (slide 1). */
  readonly logo?: boolean;
  /** Show the live "Download app" button under the tabs (slide 4). */
  readonly installable?: boolean;
};

/** Detect the visitor's device; only ever used to pre-select a tab. */
function detectPlatform(): PlatformKey {
  if (typeof navigator === "undefined") return "desktop";
  const platform = getPushPlatform(); // "ios" | "android" | "desktop"
  if (platform === "ios") return "iphone";
  if (platform === "android") return "android";
  return "desktop";
}

/** Read a translated list; i18next returns arrays only with returnObjects. */
function translatedList(t: TFunction, key: string): string[] {
  const value = t(key, { returnObjects: true });
  return Array.isArray(value) ? value.map(String) : [];
}

/**
 * Builds the deck in the active language. Every visible string (titles,
 * descriptions, alt text, captions, steps and notes) comes from
 * `onboarding.slides.*`, so changing language re-renders the whole carousel
 * instantly — the images and layout stay the same.
 */
function buildOnboardingSlides(t: TFunction): readonly OnboardingSlide[] {
  const exampleCaption = t("onboarding.exampleCaption");
  const platformBase = (slide: string, platform: PlatformKey) =>
    `onboarding.slides.${slide}.platforms.${platform}`;

  const visual = (
    slide: string,
    platform: PlatformKey,
    src: string,
    real = false
  ): OnboardingVisual => ({
    src,
    alt: t(`${platformBase(slide, platform)}.alt`),
    caption: real
      ? t(`${platformBase(slide, platform)}.caption`)
      : exampleCaption,
    ...(real ? { real: true } : {}),
  });

  const panel = (
    slide: string,
    platform: PlatformKey,
    illustrated: OnboardingVisual,
    extra?: OnboardingVisual
  ): OnboardingPlatformPanel => {
    const base = platformBase(slide, platform);
    const note = t(`${base}.note`, { defaultValue: "" });
    return {
      key: platform,
      label: t(`${base}.label`),
      visual: illustrated,
      steps: translatedList(t, `${base}.steps`),
      ...(note ? { note } : {}),
      ...(extra ? { extra } : {}),
    };
  };

  const installExtra: OnboardingVisual = {
    src: "onboarding/download-button.png",
    alt: t("onboarding.slides.install.extraAlt"),
    caption: t("onboarding.slides.install.extraCaption"),
    real: true,
  };

  return [
    {
      title: t("onboarding.slides.welcome.title"),
      description: t("onboarding.slides.welcome.description"),
      logo: true,
      steps: translatedList(t, "onboarding.slides.welcome.steps"),
    },
    {
      title: t("onboarding.slides.location.title"),
      why: t("onboarding.slides.location.why"),
      hero: {
        src: "onboarding/location-prompt-card.png",
        alt: t("onboarding.slides.location.heroAlt"),
        caption: t("onboarding.slides.location.heroCaption"),
        real: true,
      },
      platforms: [
        panel(
          "location",
          "android",
          visual("location", "android", "tutorial-location-android.svg")
        ),
        panel(
          "location",
          "iphone",
          visual("location", "iphone", "tutorial-location-iphone.svg")
        ),
        panel(
          "location",
          "desktop",
          visual("location", "desktop", "tutorial-location.svg")
        ),
      ],
    },
    {
      title: t("onboarding.slides.notifications.title"),
      why: t("onboarding.slides.notifications.why"),
      flow: translatedList(t, "onboarding.slides.notifications.flow"),
      hero: {
        src: "onboarding/notification-prompt-card.png",
        alt: t("onboarding.slides.notifications.heroAlt"),
        caption: t("onboarding.slides.notifications.heroCaption"),
        real: true,
      },
      platforms: [
        panel(
          "notifications",
          "android",
          visual("notifications", "android", "tutorial-notifications-android.svg")
        ),
        panel(
          "notifications",
          "iphone",
          visual(
            "notifications",
            "iphone",
            "onboarding/install-ios-steps-card.png",
            true
          )
        ),
        panel(
          "notifications",
          "desktop",
          visual("notifications", "desktop", "tutorial-notifications.svg")
        ),
      ],
    },
    {
      title: t("onboarding.slides.install.title"),
      description: t("onboarding.slides.install.description"),
      installable: true,
      platforms: [
        panel(
          "install",
          "android",
          visual("install", "android", "tutorial-install-android.svg"),
          installExtra
        ),
        panel(
          "install",
          "iphone",
          visual("install", "iphone", "tutorial-install-iphone.svg")
        ),
        panel(
          "install",
          "desktop",
          visual("install", "desktop", "tutorial-install-desktop.svg"),
          installExtra
        ),
      ],
    },
  ];
}

export function OnboardingScreen() {
  const { t } = useTranslation();
  const [slide, setSlide] = useState(0);
  // Tab selection — starts on the safe default and snaps to the real device
  // after mount (never blocks rendering or hydration on detection).
  const [platform, setPlatform] = useState<PlatformKey>("desktop");
  const suggested = useRef<PlatformKey>("desktop");
  const navigate = useNavigate();
  const touchStart = useRef<number | null>(null);
  const touchStartY = useRef<number | null>(null);
  const trackRef = useRef<HTMLDivElement>(null);

  // Rebuilt on every language change so the whole carousel follows the choice.
  const slides = buildOnboardingSlides(t);
  const totalSlides = slides.length;

  // First-ever visit: ask for a language before the guide starts. The flag is
  // separate from i18n's stored language, which the detector writes eagerly.
  const [languageGateOpen, setLanguageGateOpen] = useState(
    () => !hasSeenLanguagePrompt()
  );
  const closeLanguageGate = useCallback(() => {
    markLanguagePromptSeen();
    setLanguageGateOpen(false);
  }, []);

  const isLast = slide === totalSlides - 1;

  useEffect(() => {
    const detected = detectPlatform();
    suggested.current = detected;
    setPlatform(detected);
  }, []);

  // Left/Right arrows page through the slides like the Back/Next buttons —
  // but not while the first-visit language gate is open.
  useEffect(() => {
    if (languageGateOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "ArrowLeft") setSlide((s) => Math.max(s - 1, 0));
      if (event.key === "ArrowRight") {
        setSlide((s) => Math.min(s + 1, totalSlides - 1));
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [totalSlides, languageGateOpen]);

  const completeAndGoWelcome = useCallback(() => {
    localStorage.setItem("medibook_onboarding_completed", "1");
    navigate("/onboarding/welcome");
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

  const goBack = useCallback(() => {
    setSlide((s) => Math.max(s - 1, 0));
  }, []);

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
        setSlide((s) => Math.min(s + 1, totalSlides - 1));
      } else if (dx > 50) {
        setSlide((s) => Math.max(s - 1, 0));
      }
    },
    [totalSlides]
  );

  return (
    <main
      className="ab-onboarding"
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
      style={{ touchAction: "pan-y" }}
    >
      {/* Brand row: the real MediBook logo (36px) at left, Skip at right. */}
      <div className="ab-onboarding__top">
        <div className="ab-onboarding__brand">
          <img
            className="ab-onboarding__brand-img"
            src="/images/logo.jpeg"
            alt={t("onboarding.logoAlt")}
            width={36}
            height={36}
            draggable={false}
          />
          <span className="ab-onboarding__brand-name">Medibook</span>
        </div>
        <div className="ab-onboarding__top-actions">
          <LanguageSwitcher variant="inline" />
          <button
            className="ab-onboarding__skip"
            type="button"
            onClick={completeAndGoWelcome}
          >
            {t("onboarding.skip")}
          </button>
        </div>
      </div>
      <div
        ref={trackRef}
        className="ab-onboarding__track"
        style={{ transform: `translateX(-${slide * 100}%)` }}
      >
        {slides.map((item, index) => {
          const active = index === slide;
          return (
            <section
              key={item.title}
              className="ab-onboarding__slide"
              aria-hidden={!active}
              aria-live={active ? "polite" : undefined}
              inert={active ? undefined : true}
            >
              <div className="ab-onboarding__body">
                {item.hero && (
                  <figure className="ab-onboarding__art">
                    <img
                      src={`/images/${item.hero.src}`}
                      alt={item.hero.alt}
                      loading={active ? "eager" : "lazy"}
                      decoding="async"
                      draggable={false}
                      onError={(event) => {
                        event.currentTarget.hidden = true;
                      }}
                    />
                    {item.hero.caption && (
                      <figcaption className="ab-onboarding__caption">
                        {item.hero.caption}
                      </figcaption>
                    )}
                  </figure>
                )}
                {item.logo && (
                  /* Welcome hero: the real logo.jpeg at its largest size. */
                  <img
                    className="ab-onboarding__hero-logo"
                    src="/images/logo.jpeg"
                    alt={t("onboarding.logoAlt")}
                    width={96}
                    height={96}
                    fetchPriority="high"
                    draggable={false}
                  />
                )}
                <h1 className="ab-onboarding__title">{item.title}</h1>
                {item.description && (
                  <p className="ab-onboarding__desc">{item.description}</p>
                )}
                {item.why && <p className="ab-onboarding__why">{item.why}</p>}
                {item.flow && (
                  <div
                    className="ab-onboarding__flow"
                    role="group"
                    aria-label={t("onboarding.howItWorks", {
                      steps: item.flow.join(" \u2192 "),
                    })}
                  >
                    {item.flow.map((node, nodeIndex) => (
                      <span className="ab-onboarding__flow-group" key={node}>
                        {nodeIndex > 0 && (
                          <span
                            className="ab-onboarding__flow-arrow"
                            aria-hidden="true"
                          >
                            {"\u2192"}
                          </span>
                        )}
                        <span className="ab-onboarding__flow-chip">{node}</span>
                      </span>
                    ))}
                  </div>
                )}
                {item.steps && (
                  <ol className="ab-onboarding__steps">
                    {item.steps.map((step, stepIndex) => (
                      <li className="ab-onboarding__step" key={step}>
                        <span
                          className="ab-onboarding__step-num"
                          aria-hidden="true"
                        >
                          {stepIndex + 1}
                        </span>
                        <span>{step}</span>
                      </li>
                    ))}
                  </ol>
                )}
                {item.platforms && (
                  <>
                    <div
                      className="ab-onboarding__tabs"
                      role="tablist"
                      aria-label={t("onboarding.byDevice", { title: item.title })}
                    >
                      {item.platforms.map((panel) => {
                        const selected = platform === panel.key;
                        return (
                          <button
                            key={panel.key}
                            type="button"
                            role="tab"
                            id={`ob-tab-${index}-${panel.key}`}
                            aria-selected={selected}
                            aria-controls={`ob-panel-${index}-${panel.key}`}
                            className={`ab-onboarding__tab${
                              selected ? " ab-onboarding__tab--active" : ""
                            }`}
                            onClick={() => setPlatform(panel.key)}
                          >
                            {panel.label}
                            {suggested.current === panel.key && (
                              <span className="ab-onboarding__tab-hint">
                                {t("onboarding.suggested")}
                              </span>
                            )}
                          </button>
                        );
                      })}
                    </div>
                    {item.platforms.map((panel) => {
                      const selected = platform === panel.key;
                      return (
                        <div
                          key={panel.key}
                          role="tabpanel"
                          id={`ob-panel-${index}-${panel.key}`}
                          aria-labelledby={`ob-tab-${index}-${panel.key}`}
                          className="ab-onboarding__panel"
                          hidden={!selected}
                        >
                          <figure className="ab-onboarding__art">
                            <img
                              src={`/images/${panel.visual.src}`}
                              alt={panel.visual.alt}
                              loading="lazy"
                              decoding="async"
                              draggable={false}
                              onError={(event) => {
                                event.currentTarget.hidden = true;
                              }}
                            />
                            {panel.visual.caption && (
                              <figcaption
                                className={`ab-onboarding__caption${
                                  panel.visual.real
                                    ? ""
                                    : " ab-onboarding__caption--example"
                                }`}
                              >
                                {panel.visual.caption}
                              </figcaption>
                            )}
                          </figure>
                          <ol className="ab-onboarding__steps">
                            {panel.steps.map((step, stepIndex) => (
                              <li className="ab-onboarding__step" key={step}>
                                <span
                                  className="ab-onboarding__step-num"
                                  aria-hidden="true"
                                >
                                  {stepIndex + 1}
                                </span>
                                <span>{step}</span>
                              </li>
                            ))}
                          </ol>
                          {panel.note && (
                            <p className="ab-onboarding__note">{panel.note}</p>
                          )}
                          {panel.extra && (
                            <figure className="ab-onboarding__extra">
                              <img
                                className="ab-onboarding__extra-img"
                                src={`/images/${panel.extra.src}`}
                                alt={panel.extra.alt}
                                loading="lazy"
                                decoding="async"
                                draggable={false}
                              />
                              {panel.extra.caption && (
                                <figcaption className="ab-onboarding__caption">
                                  {panel.extra.caption}
                                </figcaption>
                              )}
                            </figure>
                          )}
                        </div>
                      );
                    })}
                    {item.installable && (
                      <div className="ab-onboarding__install">
                        <InstallAppButton variant="block" />
                      </div>
                    )}
                  </>
                )}
              </div>
            </section>
          );
        })}
      </div>
      <div
        className="ab-dots"
        role="group"
        aria-label={t("onboarding.slideOf", { current: slide + 1, total: totalSlides })}
      >
        {slides.map((item, index) => (
          <button
            key={item.title}
            type="button"
            className={`ab-dots__dot${
              index === slide ? " ab-dots__dot--active" : ""
            }`}
            aria-label={t("onboarding.goToSlide", { current: index + 1, title: item.title })}
            aria-current={index === slide ? "step" : undefined}
            onClick={() => setSlide(index)}
          />
        ))}
      </div>

      <footer className="ab-onboarding__actions">
        <button
          type="button"
          className="ab-btn ab-btn--outline"
          onClick={goBack}
          disabled={slide === 0}
        >
          {t("onboarding.back")}
        </button>
        <button type="button" className="ab-btn ab-btn--outline" onClick={goSignIn}>
          {t("onboarding.signIn")}
        </button>
        <button type="button" className="ab-btn ab-btn--primary" onClick={goNext}>
          {isLast ? t("onboarding.getStarted") : t("onboarding.next")}
        </button>
      </footer>

      <LanguageGate open={languageGateOpen} onClose={closeLanguageGate} />
    </main>
  );
}

export function WelcomeScreen() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const googleLogin = useGoogleLogin();
  return (
    <main className="ab-welcome">
      {/* First-run CTA (§69) — sits above the brand, opposite the Skip button
          of the onboarding carousel. */}
      <InstallAppButton variant="floating" />
      <div className="ab-welcome__language">
        <LanguageSwitcher variant="inline" />
      </div>
      <div className="ab-welcome__content">
        <AbLogo large />
        <h1 className="ab-welcome__title">{t("auth.welcomeTitle")}</h1>
        <p className="ab-welcome__subtitle">{t("auth.welcomeSubtitle")}</p>
      </div>
      <div className="ab-welcome__actions">
        <button className="ab-btn ab-btn--primary" type="button" onClick={() => navigate("/register")}>{t("auth.createNewAccount")}</button>
<span className="ab-divider">{t("auth.or")}</span>
        <div className="ab-social-btns" aria-label={t("auth.socialOptions")}>
          <button className="ab-social-btn" type="button" aria-label="Google" data-google-btn onClick={googleLogin}>
            <svg width="18" height="18" viewBox="0 0 24 24"><path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/><path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/><path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/><path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l2.85-2.22.81-.62z" fill="#EA4335"/></svg> {t("auth.continueWithGoogle")}
          </button>
        </div>
        <button className="ab-btn ab-btn--outline" type="button" onClick={() => navigate("/login")}>{t("auth.login")}</button>
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

/* ---------------- Social OAuth helpers ---------------- */

const GOOGLE_CLIENT_ID = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID ?? "";

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
  const { t } = useTranslation();
  const { socialLogin } = useSession();
  const { notify } = useToast();
  const navigate = useNavigate();
  return useCallback(async () => {
    if (!GOOGLE_CLIENT_ID) {
      notify("error", t("auth.googleNotConfigured"));
      return;
    }
    try {
      await loadScript("https://accounts.google.com/gsi/client", "google-gsi");
      const google = (window as unknown as Record<string, { accounts: { id: { initialize: (cfg: Record<string, unknown>) => void; prompt: () => void; renderButton: (el: HTMLElement, cfg: Record<string, unknown>) => void } } }>).google;
      
      // Initialize One Tap with account picker for returning users
      google.accounts.id.initialize({
        client_id: GOOGLE_CLIENT_ID,
        callback: (response: { credential?: string }) => {
          if (response.credential) {
            socialLogin("google", response.credential)
              .then(() => { notify("success", t("auth.googleWelcomeToast")); navigate(freshHomeForRole(), { replace: true }); })
              .catch((err: unknown) => { notify("error", err instanceof Error ? err.message : t("auth.googleFailed")); });
          }
        },
        auto_select: false,           // Show account picker for returning users
        cancel_on_tap_outside: false, // Don't dismiss on outside click
      });
      
      // Render the "Continue with Google" button as fallback
      const existingBtn = document.querySelector('[data-google-btn]') as HTMLElement | null;
      if (existingBtn) {
        google.accounts.id.renderButton(existingBtn, {
          theme: "outline",
          size: "large",
          width: "100%",
          type: "standard",
          text: "continue_with",
          shape: "rectangular",
          logo_alignment: "left",
        });
      }
      
      // Show One Tap (account picker for signed-in Google users)
      google.accounts.id.prompt();
    } catch {
      notify("error", t("auth.googleLoadFailed"));
    }
  }, [socialLogin, notify, navigate, t]);
}

/* ---------------- Login ---------------- */

/** Live mm:ss countdown rendered under the lock banner. */
function formatCountdown(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

/** Lock state carried by the 423 payload from a rejected sign-in. */
interface LockBanner {
  requires_admin: boolean;
  locked_until: string | null;
}

/** Which channels accepted the login code, as reported by the password step. */
interface OtpDelivery {
  emailSent: boolean;
  emailHint: string | null;
  pushSent: boolean;
}

/** Sentence telling the user where the code went (never claims a failed channel). */
function otpDeliverySummary(delivery: OtpDelivery | null): string {
  if (!delivery || (!delivery.emailSent && !delivery.pushSent)) return i18n.t("auth.sentToEmail");
  const emailHint = delivery.emailSent ? delivery.emailHint : null;
  const push = delivery.pushSent;
  if (emailHint && push) return i18n.t("auth.sentToEmailAndDevices", { email: emailHint });
  if (delivery.emailSent && push) return i18n.t("auth.sentToEmailAndDevicesNoHint");
  if (emailHint) return i18n.t("auth.sentToEmailHint", { email: emailHint });
  if (delivery.emailSent) return i18n.t("auth.sentToEmail");
  if (push) return i18n.t("auth.sentToDevices");
  return i18n.t("auth.couldNotDeliver");
}

export function LoginScreen() {
  const { t } = useTranslation();
  const { login, verifyLogin } = useSession();
  const { notify } = useToast();
  const navigate = useNavigate();
  const location = useLocation();
  const from = (location.state as { from?: string } | null)?.from;
  const googleLogin = useGoogleLogin();

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const [topError, setTopError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  // Server-reported state: lock banner (423) + attempts left (400 data).
  const [lock, setLock] = useState<LockBanner | null>(null);
  const [attemptsLeft, setAttemptsLeft] = useState<number | null>(null);
  const [clock, setClock] = useState(() => Date.now());
  // Second step: the password was right, now the one-time code must be typed.
  const [challenge, setChallenge] = useState<{ token: string; expiresAt: number } | null>(null);
  const [otpValue, setOtpValue] = useState("");
  const [otpError, setOtpError] = useState("");
  const [otpTopError, setOtpTopError] = useState("");
  const [otpAction, setOtpAction] = useState<"verify" | "resend" | null>(null);
  const [delivery, setDelivery] = useState<OtpDelivery | null>(null);
  const otpInputRef = useRef<HTMLInputElement>(null);
  const otpSubmissionInFlight = useRef(false);

  // Tick once a second, but ONLY while a countdown is running (lock banner,
  // or the OTP code's expiry).
  useEffect(() => {
    if (!lock?.locked_until && !challenge) return;
    const id = window.setInterval(() => setClock(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [lock?.locked_until, challenge]);

  const waitSeconds = lock?.locked_until
    ? Math.max(0, Math.ceil((Date.parse(lock.locked_until) - clock) / 1000))
    : null;

  const otpRemaining = challenge
    ? Math.max(0, Math.ceil((challenge.expiresAt - clock) / 1000))
    : 0;

  useEffect(() => {
    if (challenge && !submitting && otpValue.length === 0 && otpRemaining > 0) {
      otpInputRef.current?.focus();
    }
  }, [challenge, otpRemaining, otpValue, submitting]);

  // Countdown finished → the server auto-unlocks on the next attempt, so the
  // banner clears and the form is usable again. The server, not this timer,
  // decides whether the account is still locked.
  useEffect(() => {
    if (lock && !lock.requires_admin && waitSeconds === 0) {
      setLock(null);
      setAttemptsLeft(null);
    }
  }, [lock, waitSeconds]);

  /** Shared error handling for the password step (and OTP resend). */
  function handlePasswordError(error: unknown) {
    const data = error instanceof ApiError ? error.data : undefined;
    if (data?.code === "ACCOUNT_LOCKED") {
      setAttemptsLeft(0);
      setLock({
        requires_admin: data.requires_admin === true,
        locked_until: typeof data.locked_until === "string" ? data.locked_until : null,
      });
      setTopError(errorMessage(error));
      setFormErrors({});
    } else {
      setLock(null);
      setAttemptsLeft(
        typeof data?.remaining_attempts === "number" ? data.remaining_attempts : null
      );
      const fields = fieldErrors(error);
      setFormErrors(fields);
      if (!Object.keys(fields).length) setTopError(errorMessage(error));
    }
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    await startPasswordStep();
  }

  /** Validate credentials, issue the OTP, and deliver it by email + Web Push. */
  async function startPasswordStep(): Promise<void> {
    setTopError("");
    setFormErrors({});
    setSubmitting(true);
    try {
      await sendLoginCode();
    } catch (error) {
      handlePasswordError(error);
    } finally {
      setSubmitting(false);
    }
  }

  async function sendLoginCode() {
    // The password request is the only chance to hand this browser's push
    // subscription to the server before the code is issued. subscribeToPush()
    // requests the OS permission synchronously from this Sign-In tap; either
    // way the SMTP email and inbox row still carry the code.
    const push = await collectLoginPush();
    const outcome = push
      ? await login(username.trim(), password, push)
      : await login(username.trim(), password);
    if (outcome.otpRequired) {
      setChallenge({
        token: outcome.challenge,
        expiresAt: Date.now() + outcome.expiresIn * 1000,
      });
      setClock(Date.now());
      setAttemptsLeft(null);
      setOtpValue("");
      setOtpError("");
      setOtpTopError("");
      setDelivery({
        emailSent: outcome.emailSent,
        emailHint: outcome.emailHint,
        pushSent: outcome.pushSent,
      });
      return;
    }

    notify("success", t("auth.welcomeBackToast"));
    const target = from && canReturnTo(from) ? from : freshHomeForRole();
    navigate(target, { replace: true });
  }

  /** OTP step: exchange the complete code for the session. */
  async function verifyOtp(code: string) {
    if (code.length !== 6 || !challenge || otpRemaining <= 0 || otpSubmissionInFlight.current) return;
    otpSubmissionInFlight.current = true;
    setOtpAction("verify");
    setSubmitting(true);
    setOtpTopError("");
    setOtpError("");
    try {
      await verifyLogin(challenge.token, code);
      notify("success", t("auth.welcomeBackToast"));
      const target = from && canReturnTo(from) ? from : freshHomeForRole();
      navigate(target, { replace: true });
    } catch (error) {
      const data = error instanceof ApiError ? error.data : undefined;
      if (data?.code === "ACCOUNT_LOCKED") {
        setChallenge(null);
        handlePasswordError(error);
      } else {
        const fields = fieldErrors(error);
        if (fields.otp) setOtpError(fields.otp);
        else setOtpTopError(errorMessage(error));
        setOtpValue("");
      }
    } finally {
      otpSubmissionInFlight.current = false;
      setOtpAction(null);
      setSubmitting(false);
    }
  }

  function onVerify(event: FormEvent) {
    event.preventDefault();
    void verifyOtp(otpValue);
  }

  function onOtpChange(event: ChangeEvent<HTMLInputElement>) {
    const code = event.target.value.replace(/\D/g, "").slice(0, 6);
    setOtpValue(code);
    setOtpError("");
    setOtpTopError("");
    if (code.length === 6) void verifyOtp(code);
  }

  /** Request a fresh code and deliver it by email + Web Push. */
  async function onResend() {
    if (otpSubmissionInFlight.current) return;
    otpSubmissionInFlight.current = true;
    setOtpError("");
    setOtpTopError("");
    setOtpAction("resend");
    setSubmitting(true);
    try {
      await sendLoginCode();
    } catch (error) {
      setOtpTopError(errorMessage(error));
    } finally {
      otpSubmissionInFlight.current = false;
      setOtpAction(null);
      setSubmitting(false);
    }
  }

  function backToPassword() {
    setChallenge(null);
    setOtpValue("");
    setOtpError("");
    setOtpTopError("");
    otpSubmissionInFlight.current = false;
    setDelivery(null);
  }

  const countingDown = Boolean(lock && !lock.requires_admin && (waitSeconds ?? 0) > 0);

  return (
    <AuthLayout
      title={challenge ? t("auth.verifyTitle") : t("auth.login")}
      subtitle={
        challenge
          ? t("auth.verifySubtitle")
          : t("auth.welcomeBackSubtitle")
      }
      footer={
        <span>{t("auth.noAccount")} <Link to="/register">{t("auth.register")}</Link></span>
      }
    >
      {challenge ? (
        <form className="ab-form__inner" onSubmit={onVerify} noValidate>
          {otpTopError && <ErrorNote message={otpTopError} />}
          <p className="form-note" role="status" aria-live="polite">
            {otpAction === "verify" && t("auth.verifyingCode")}
            {otpAction === "resend" && t("auth.sendingNewCode")}
            {!otpAction && (otpRemaining > 0
              ? `${otpDeliverySummary(delivery)} ${t("auth.codeExpiresIn", { time: formatCountdown(otpRemaining) })}`
              : t("auth.codeExpired"))}
          </p>
          <div className="ab-field">
            <label className="ab-field__label" htmlFor="login-otp">{t("auth.verificationCode")}</label>
            <div className="otp-code" data-filled={otpValue.length > 0}>
              <div className="otp-code__digits" aria-hidden="true">
                {Array.from({ length: 6 }, (_, index) => {
                  const digit = otpValue[index] ?? "";
                  return (
                    <span
                      className={`otp-code__digit${index === otpValue.length ? " otp-code__digit--current" : ""}`}
                      key={`${index}-${digit}`}
                    >
                      {digit}
                    </span>
                  );
                })}
              </div>
              <input
                ref={otpInputRef}
                id="login-otp"
                className="otp-code__input"
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                pattern="[0-9]*"
                maxLength={6}
                required
                disabled={submitting || otpRemaining <= 0}
                value={otpValue}
                onChange={onOtpChange}
                aria-describedby={otpError ? "login-otp-error" : undefined}
              />
            </div>
            {otpError && <span id="login-otp-error" className="ab-field__error" role="alert">{otpError}</span>}
          </div>
          <button
            type="button"
            className="ab-btn ab-btn--outline ab-btn--full"
            onClick={onResend}
            disabled={submitting}
          >
            {otpAction === "resend" ? t("auth.sending") : t("auth.resendCode")}
          </button>
          <button type="button" className="ab-forgot" onClick={backToPassword}>
            {t("auth.backToPassword")}
          </button>
        </form>
      ) : (
      <form className="ab-form__inner" onSubmit={onSubmit} noValidate>
        {lock ? (
          <ErrorNote
            message={
              lock.requires_admin
                ? t("auth.lockedAdmin")
                : t("auth.lockedCountdown", { time: formatCountdown(waitSeconds ?? 0) })
            }
          />
        ) : (
          topError && <ErrorNote message={topError} />
        )}
        {!lock && attemptsLeft !== null && attemptsLeft > 0 && (
          <p className="form-note" role="status">
            {t("auth.attemptsLeft", { count: attemptsLeft })}
          </p>
        )}
        <div className="ab-field">
          <label className="ab-field__label" htmlFor="login-username">{t("auth.username")}</label>
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
          <TextField
            id="login-password"
            label={t("auth.password")}
            type="password"
            autoComplete="current-password"
            required
            value={password}
            error={formErrors.password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>
        <Link className="ab-forgot" to="/forgot-password">{t("auth.forgotPassword")}</Link>
        <button
          type="submit"
          className="ab-btn ab-btn--primary ab-btn--full"
          disabled={submitting || countingDown}
        >
          {submitting ? t("auth.signingIn") : t("auth.login")}
        </button>
        <span className="ab-divider">{t("auth.or")}</span>
<div className="ab-social-btns">
          <button className="ab-social-btn" type="button" data-google-btn onClick={googleLogin}>
            <svg width="18" height="18" viewBox="0 0 24 24"><path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/><path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/><path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/><path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#EA4335"/></svg> {t("auth.continueWithGoogle")}
          </button>
        </div>
      </form>
      )}
    </AuthLayout>
  );
}

/* ---------------- Register ---------------- */

export function RegisterScreen() {
  const { t } = useTranslation();
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
    if (nameParts.length < 2) errors.first_name = t("auth.fullNameRequired");
    if (values.username.trim().length < 3) errors.username = t("auth.usernameMin");
    if (values.password.length < 8) errors.password = t("auth.passwordMin");
    if (values.password !== values.password_confirm)
      errors.password_confirm = t("auth.passwordsDoNotMatch");
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
      notify("success", t("auth.welcomeToast"));
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
      title={t("auth.register")}
      subtitle={t("auth.registerSubtitle")}
      footer={
        <span>
          {t("auth.hasAccount")} <Link to="/login">{t("auth.login")}</Link>
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
          <label className="ab-field__label" htmlFor="reg-username">{t("auth.username")}</label>
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
          <label className="ab-field__label" htmlFor="reg-name">{t("auth.fullName")}</label>
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
          <label className="ab-field__label" htmlFor="reg-email">{t("auth.emailAddress")}</label>
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
          <label className="ab-field__label" htmlFor="reg-phone">{t("auth.phoneNumber")}</label>
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
          <TextField
            id="reg-password"
            label={t("auth.password")}
            type="password"
            autoComplete="new-password"
            required
            value={values.password}
            error={formErrors.password}
            onChange={set("password")}
          />
        </div>
        <div className="ab-field">
          <TextField
            id="reg-confirm"
            label={t("auth.confirmPassword")}
            type="password"
            autoComplete="new-password"
            required
            value={values.password_confirm}
            error={formErrors.password_confirm}
            onChange={set("password_confirm")}
          />
        </div>
        <label className="ab-terms">
          <input type="checkbox" required />
          <span>{t("auth.terms")}</span>
        </label>
        <button type="submit" className="ab-btn ab-btn--primary ab-btn--full" disabled={submitting}>
          {submitting ? t("auth.creatingAccount") : t("auth.createAccount")}
        </button>
      </form>
    </AuthLayout>
  );
}

/* ---------------- Forgot password ---------------- */

export function ForgotPasswordScreen() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const [topError, setTopError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setTopError("");
    setFormErrors({});
    setSubmitting(true);
    try {
      const response = await requestPasswordReset(email.trim());
      // No visible "enter the code" step: the handle rides straight into the
      // new-password form. The emailed link (?token=) still works too.
      navigate("/reset-password", {
        state: { reset_handle: response.data?.reset_handle },
        replace: true,
      });
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
      title={t("auth.forgotTitle")}
      subtitle={t("auth.forgotSubtitle")}
      footer={<span><Link to="/login">{t("auth.backToLogin")}</Link></span>}
    >
      <form className="ab-form__inner" onSubmit={onSubmit} noValidate>
        {topError && <ErrorNote message={topError} />}
        <div className="ab-field">
          <label className="ab-field__label" htmlFor="forgot-email">{t("auth.emailAddress")}</label>
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
          {submitting ? t("auth.sending") : t("auth.resetPassword")}
        </button>
      </form>
    </AuthLayout>
  );
}

/* ---------------- Reset password ---------------- */

export function ResetPasswordScreen() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { notify } = useToast();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  // Single-use handle: ?token= from the emailed link, or the state the forgot-
  // password screen carried — never a field the user is asked to type.
  const token =
    searchParams.get("token") ??
    (location.state as { reset_handle?: string } | null)?.reset_handle ??
    "";
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
      setFormErrors({ new_password_confirm: t("auth.passwordsDoNotMatch") });
      return;
    }
    setSubmitting(true);
    try {
      await confirmPasswordReset({
        token,
        new_password: newPassword,
        new_password_confirm: confirm,
      });
      notify("success", t("auth.passwordResetToast"));
      navigate("/login", { replace: true });
    } catch (error) {
      const fields = fieldErrors(error);
      setFormErrors(fields);
      if (!Object.keys(fields).length) setTopError(errorMessage(error));
    } finally {
      setSubmitting(false);
    }
  }

  if (!token) {
    return (
      <AuthLayout
        title={t("auth.resetTitle")}
        subtitle={t("auth.resetNeedsLink")}
        footer={<span><Link to="/login">{t("auth.backToSignIn")}</Link></span>}
      >
        <p className="form-note">
          {t("auth.resetInstruction")}
        </p>
        <Link className="ab-btn ab-btn--primary ab-btn--full" to="/forgot-password">
          {t("auth.requestNewLink")}
        </Link>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout
      title={t("auth.resetTitle")}
      subtitle={t("auth.resetSubtitle")}
      footer={<span><Link to="/login">{t("auth.backToSignIn")}</Link></span>}
    >
      <form className="ab-form__inner" onSubmit={onSubmit} noValidate>
        {topError && <ErrorNote message={topError} />}
        <div className="ab-field">
          <TextField
            id="reset-password"
            label={t("auth.newPassword")}
            type="password"
            autoComplete="new-password"
            required
            value={newPassword}
            error={formErrors.new_password}
            onChange={(e: ChangeEvent<HTMLInputElement>) => setNewPassword(e.target.value)}
          />
        </div>
        <div className="ab-field">
          <TextField
            id="reset-confirm"
            label={t("auth.confirmNewPassword")}
            type="password"
            autoComplete="new-password"
            required
            value={confirm}
            error={formErrors.new_password_confirm}
            onChange={(e: ChangeEvent<HTMLInputElement>) => setConfirm(e.target.value)}
          />
        </div>
        <button type="submit" className="ab-btn ab-btn--primary ab-btn--full" disabled={submitting}>
          {submitting ? t("auth.updating") : t("auth.updatePassword")}
        </button>
      </form>
    </AuthLayout>
  );
}
