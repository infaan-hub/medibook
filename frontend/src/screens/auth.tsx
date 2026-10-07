/**
 * PHASE 5 — Authentication screens (§54).
 *
 * LoginScreen          — email + password → session (redirects back to the
 *                        URL the guard remembered, or home).
 * RegisterScreen       — patient/doctor self-registration (§54 role-based).
 * ForgotPasswordScreen — neutral request (§36 — never reveals account state).
 * ResetPasswordScreen  — code from the email (supports ?token= prefill).
 */

import { useState, useRef, useEffect, useCallback, type ChangeEvent, type FormEvent, type ReactNode } from "react";
import { Link, useLocation, useNavigate, useSearchParams } from "react-router-dom";
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
import { TextField } from "../components/ui";

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

const EXAMPLE_CAPTION =
  "Example \u2014 your screen may look slightly different depending on your browser and version.";

/** Detect the visitor's device; only ever used to pre-select a tab. */
function detectPlatform(): PlatformKey {
  if (typeof navigator === "undefined") return "desktop";
  const platform = getPushPlatform(); // "ios" | "android" | "desktop"
  if (platform === "ios") return "iphone";
  if (platform === "android") return "android";
  return "desktop";
}

const onboardingSlides: readonly OnboardingSlide[] = [
  {
    title: "Welcome to MediBook",
    description: "Your guide to getting MediBook ready.",
    logo: true,
    steps: [
      "Allow location",
      "Turn on notifications",
      "Install MediBook as an app",
      "Use MediBook comfortably on phone and desktop",
    ],
  },
  {
    title: "Allow Location",
    why: "MediBook can use your location to help you find nearby healthcare services and provide location-aware features.",
    hero: {
      src: "onboarding/location-prompt-card.png",
      alt: 'MediBook asking "Set your location to book" with a "Share my location" button',
      caption: "What you will see in MediBook first",
      real: true,
    },
    platforms: [
      {
        key: "android",
        label: "Android",
        visual: {
          src: "tutorial-location-android.svg",
          alt: 'Android Chrome asking "Allow MediBook to use your location?" with Allow highlighted',
          caption: EXAMPLE_CAPTION,
        },
        steps: [
          "Your browser may ask: \u201cAllow MediBook to use your location?\u201d",
          "Choose Allow.",
          "Previously blocked it? Tap the icon next to the address bar \u2192 Site settings \u2192 Location \u2192 Allow.",
        ],
      },
      {
        key: "iphone",
        label: "iPhone & iPad",
        visual: {
          src: "tutorial-location-iphone.svg",
          alt: 'iPhone alert asking to let MediBook use your location, with "Allow While Using App" highlighted',
          caption: EXAMPLE_CAPTION,
        },
        steps: [
          "Your browser may ask: \u201cAllow MediBook to use your location?\u201d",
          "Choose \u201cAllow While Using App\u201d.",
          "Previously blocked it? Tap the address bar \u2192 Website Settings \u2192 Location \u2192 Allow.",
        ],
      },
      {
        key: "desktop",
        label: "Computer",
        visual: {
          src: "tutorial-location.svg",
          alt: "Desktop browser pop-up asking to know your location, with Allow highlighted",
          caption: EXAMPLE_CAPTION,
        },
        steps: [
          "Your browser may ask: \u201cAllow MediBook to use your location?\u201d",
          "Choose Allow.",
          "Previously blocked it? Click the lock icon in the address bar \u2192 Site settings \u2192 Location \u2192 Allow.",
        ],
      },
    ],
  },
  {
    title: "Turn On Notifications",
    why: "Notifications help you know when your appointment, booking, doctor response, emergency request, or other important MediBook activity changes.",
    flow: ["MediBook", "Allow notifications?", "Press Allow", "Notifications are on"],
    hero: {
      src: "onboarding/notification-prompt-card.png",
      alt: 'The "Turn on notifications" card in MediBook with the Allow button',
      caption: "What you will see in MediBook first",
      real: true,
    },
    platforms: [
      {
        key: "android",
        label: "Android",
        visual: {
          src: "tutorial-notifications-android.svg",
          alt: 'Android Chrome asking "Allow MediBook to send you notifications?" with Allow highlighted',
          caption: EXAMPLE_CAPTION,
        },
        steps: [
          "Open MediBook in Chrome.",
          "When the notification permission appears, tap Allow.",
          "Return to MediBook \u2014 updates arrive even when MediBook is closed.",
        ],
        note: "Pressed Block? Tap the icon next to the address bar \u2192 Site settings \u2192 Notifications \u2192 Allow.",
      },
      {
        key: "iphone",
        label: "iPhone & iPad",
        visual: {
          src: "onboarding/install-ios-steps-card.png",
          alt: 'MediBook on iPhone showing "Install MediBook to enable notifications" with the Add to Home Screen steps',
          caption: "What MediBook shows on iPhone",
          real: true,
        },
        steps: [
          "iPhone and iPad cannot turn notifications on from a normal Safari tab \u2014 install MediBook first.",
          "In Safari tap Share \u2192 Add to Home Screen \u2192 Add.",
          "Open MediBook from your Home Screen.",
          "Tap Allow when notifications are asked.",
        ],
        note: "Pressed Don\u2019t Allow? Remove MediBook from your Home Screen, add it again, then tap Allow.",
      },
      {
        key: "desktop",
        label: "Computer",
        visual: {
          src: "tutorial-notifications.svg",
          alt: "Desktop browser pop-up asking to send MediBook notifications, with Allow highlighted",
          caption: EXAMPLE_CAPTION,
        },
        steps: [
          "Open MediBook in your browser.",
          "Press Allow when notifications are asked.",
          "Leave notifications enabled to get updates while MediBook is in the background.",
        ],
        note: "Pressed Block? Click the lock icon in the address bar \u2192 Site settings \u2192 Notifications \u2192 Allow.",
      },
    ],
  },
  {
    title: "Get MediBook as an App",
    description: "You can install MediBook on Android, iPhone/iPad, and desktop.",
    installable: true,
    platforms: [
      {
        key: "android",
        label: "Android",
        visual: {
          src: "tutorial-install-android.svg",
          alt: 'Chrome menu on Android with "Add to Home screen" highlighted',
          caption: EXAMPLE_CAPTION,
        },
        steps: [
          "Open MediBook in Chrome.",
          "Look for \u201cInstall app\u201d or \u201cAdd to Home screen\u201d \u2014 the wording depends on your browser and version.",
          "Tap the installation option.",
          "Confirm the installation.",
          "Open MediBook from your home screen or app launcher.",
        ],
        extra: {
          src: "onboarding/download-button.png",
          alt: 'The "Download app" button in the MediBook header',
          caption: "Or tap Download app in the MediBook header",
          real: true,
        },
      },
      {
        key: "iphone",
        label: "iPhone & iPad",
        visual: {
          src: "tutorial-install-iphone.svg",
          alt: 'iPhone Safari Share sheet with "Add to Home Screen" highlighted',
          caption: EXAMPLE_CAPTION,
        },
        steps: [
          "Open MediBook in Safari.",
          "Tap the Share button.",
          "Select Add to Home Screen.",
          "Confirm with Add.",
          "Open MediBook from your Home Screen.",
          "Enable notifications when MediBook asks.",
        ],
        note: "Safari has no automatic \u201cInstall app\u201d button \u2014 Share \u2192 Add to Home Screen is the real procedure.",
      },
      {
        key: "desktop",
        label: "Computer",
        visual: {
          src: "tutorial-install-desktop.svg",
          alt: "Desktop browser address bar with the install icon highlighted",
          caption: EXAMPLE_CAPTION,
        },
        steps: [
          "Open MediBook in Chrome, Edge or another browser that supports app install.",
          "Look for the install icon in the address bar, or open the browser menu.",
          "Select \u201cInstall MediBook\u201d and confirm.",
          "Open MediBook from your desktop or start menu.",
        ],
        note: "The exact button and wording differ between Chrome, Edge, Safari and versions. In browsers without install support, keep using MediBook normally in a browser tab.",
        extra: {
          src: "onboarding/download-button.png",
          alt: 'The "Download app" button in the MediBook header',
          caption: "Or tap Download app in the MediBook header",
          real: true,
        },
      },
    ],
  },
];

export function OnboardingScreen() {
  const [slide, setSlide] = useState(0);
  // Tab selection — starts on the safe default and snaps to the real device
  // after mount (never blocks rendering or hydration on detection).
  const [platform, setPlatform] = useState<PlatformKey>("desktop");
  const suggested = useRef<PlatformKey>("desktop");
  const navigate = useNavigate();
  const touchStart = useRef<number | null>(null);
  const touchStartY = useRef<number | null>(null);
  const trackRef = useRef<HTMLDivElement>(null);

  const isLast = slide === onboardingSlides.length - 1;

  useEffect(() => {
    const detected = detectPlatform();
    suggested.current = detected;
    setPlatform(detected);
  }, []);

  // Left/Right arrows page through the slides like the Back/Next buttons.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "ArrowLeft") setSlide((s) => Math.max(s - 1, 0));
      if (event.key === "ArrowRight") {
        setSlide((s) => Math.min(s + 1, onboardingSlides.length - 1));
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

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
      {/* Brand row: the real MediBook logo (36px) at left, Skip at right. */}
      <div className="ab-onboarding__top">
        <div className="ab-onboarding__brand">
          <img
            className="ab-onboarding__brand-img"
            src="/images/logo.jpeg"
            alt="MediBook logo"
            width={36}
            height={36}
            draggable={false}
          />
          <span className="ab-onboarding__brand-name">Medibook</span>
        </div>
        <button
          className="ab-onboarding__skip"
          type="button"
          onClick={completeAndGoWelcome}
        >
          Skip
        </button>
      </div>
      <div
        ref={trackRef}
        className="ab-onboarding__track"
        style={{ transform: `translateX(-${slide * 100}%)` }}
      >
        {onboardingSlides.map((item, index) => {
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
                    alt="MediBook logo"
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
                    aria-label={`How it works: ${item.flow.join(", then ")}`}
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
                      aria-label={`${item.title} by device`}
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
                                Suggested
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
        aria-label={`Slide ${slide + 1} of ${onboardingSlides.length}`}
      >
        {onboardingSlides.map((item, index) => (
          <button
            key={item.title}
            type="button"
            className={`ab-dots__dot${
              index === slide ? " ab-dots__dot--active" : ""
            }`}
            aria-label={`Go to slide ${index + 1}: ${item.title}`}
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
          Back
        </button>
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
  return (
    <main className="ab-welcome">
      {/* First-run CTA (§69) — sits above the brand, opposite the Skip button
          of the onboarding carousel. */}
      <InstallAppButton variant="floating" />
      <div className="ab-welcome__content">
        <AbLogo large />
        <h1 className="ab-welcome__title">Medibook Hospital</h1>
        <p className="ab-welcome__subtitle">Your Health, Our Priority</p>
      </div>
      <div className="ab-welcome__actions">
        <button className="ab-btn ab-btn--primary" type="button" onClick={() => navigate("/register")}>Create new account</button>
<span className="ab-divider">or</span>
        <div className="ab-social-circles" aria-label="Social sign-in options">
          <button className="ab-social-circle" type="button" aria-label="Google" data-google-btn onClick={googleLogin}>
            <svg width="18" height="18" viewBox="0 0 24 24"><path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/><path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/><path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/><path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l2.85-2.22.81-.62z" fill="#EA4335"/></svg>
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
      const google = (window as unknown as Record<string, { accounts: { id: { initialize: (cfg: Record<string, unknown>) => void; prompt: () => void; renderButton: (el: HTMLElement, cfg: Record<string, unknown>) => void } } }>).google;
      
      // Initialize One Tap with account picker for returning users
      google.accounts.id.initialize({
        client_id: GOOGLE_CLIENT_ID,
        callback: (response: { credential?: string }) => {
          if (response.credential) {
            socialLogin("google", response.credential)
              .then(() => { notify("success", "Welcome to MediBook."); navigate(freshHomeForRole(), { replace: true }); })
              .catch((err: unknown) => { notify("error", err instanceof Error ? err.message : "Google sign-in failed."); });
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
      notify("error", "Could not load Google sign-in.");
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
        </div>
        <Link className="ab-forgot" to="/forgot-password">Forgot Password?</Link>
        <button type="submit" className="ab-btn ab-btn--primary ab-btn--full" disabled={submitting}>
          {submitting ? "Signing In…" : "Sign In"}
        </button>
        <span className="ab-divider">or</span>
<div className="ab-social-btns">
          <button className="ab-social-btn" type="button" data-google-btn onClick={googleLogin}>
            <svg width="18" height="18" viewBox="0 0 24 24"><path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/><path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/><path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/><path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#EA4335"/></svg>
            Continue with Google
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
          <TextField
            id="reg-password"
            label="Password"
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
            label="Confirm Password"
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
          <TextField
            id="reset-password"
            label="New password"
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
            label="Confirm new password"
            type="password"
            autoComplete="new-password"
            required
            value={confirm}
            error={formErrors.new_password_confirm}
            onChange={(e: ChangeEvent<HTMLInputElement>) => setConfirm(e.target.value)}
          />
        </div>
        <button type="submit" className="ab-btn ab-btn--primary ab-btn--full" disabled={submitting}>
          {submitting ? "Updating…" : "Update password"}
        </button>
      </form>
    </AuthLayout>
  );
}

