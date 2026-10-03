/**
 * /doctor/onboarding — mandatory first-login setup for doctors.
 *
 * A doctor account exists the moment they register, but it is not WORKABLE
 * until four things are true: this device receives notifications, the practice
 * has coordinates (booking and "near me" both refuse without them), an uploaded
 * profile picture exists, and the My Doctor information patients see is filled
 * in. Until the SERVER has verified all four and flipped
 * `User.doctor_onboarding_completed`, the route guards keep this doctor inside
 * this flow.
 *
 * Rules this screen keeps:
 *  - resume: the server returns `next_step`, so a refresh, a logout/login or a
 *    new device always lands on the first outstanding step — nothing is stored
 *    in localStorage;
 *  - no skip: there is no "do later". Every step is either done (server says
 *    so) or the panel in front of you;
 *  - real errors: whatever the API refuses (a missing step, a rejected upload,
 *    a location failure) is shown verbatim and the flow stays on the step that
 *    failed;
 *  - reuse: the SAME push state machine, location capture, profile upload and
 *    My Doctor save endpoints the rest of the app already uses.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  ArrowLeft,
  Bell,
  Camera,
  Check,
  ChevronRight,
  Circle,
  MapPin,
  User,
} from "lucide-react";
import { uploadProfileImage } from "../api/auth";
import {
  completeDoctorOnboarding,
  getDoctorOnboarding,
  getMyDoctorProfile,
  updateMyDoctorProfile,
} from "../api/doctors";
import type {
  DoctorOnboardingStatus,
  DoctorOnboardingStep,
  DoctorProfile,
} from "../api/types";
import { Button, Card, ErrorState, Skeleton } from "../components/ui";
import { DoctorImage } from "../components/DoctorImage";
import { LocationLine } from "../components/Location";
import { captureFix, LocationError } from "../lib/location";
import { usePushNotifications } from "../push/usePushNotifications";
import { useSession, useToast } from "../state/app-context";

function message(error: unknown): string {
  return error instanceof Error ? error.message : "Something went wrong. Please try again.";
}

/** Requirement steps in the order the flow presents them. */
const REQUIREMENT_STEPS: DoctorOnboardingStep[] = [
  "notifications",
  "location",
  "profile_image",
  "doctor_profile",
];

/** The fifth panel: everything is verified, so this is where Save lives. */
const COMPLETE_INDEX = REQUIREMENT_STEPS.length;

interface StepMeta {
  id: DoctorOnboardingStep | "complete";
  title: string;
  summary: string;
  icon: typeof Bell;
}

const STEPS: StepMeta[] = [
  {
    id: "notifications",
    title: "Turn on notifications",
    summary: "Appointment reminders reach this device.",
    icon: Bell,
  },
  {
    id: "location",
    title: "Set your practice location",
    summary: "Patients see directions; booking requires it.",
    icon: MapPin,
  },
  {
    id: "profile_image",
    title: "Upload a profile picture",
    summary: "Your photo appears on every doctor card.",
    icon: Camera,
  },
  {
    id: "doctor_profile",
    title: "Complete your My Doctor information",
    summary: "Your name and specialties, as patients see them.",
    icon: User,
  },
  {
    id: "complete",
    title: "Save and finish",
    summary: "The server checks every step, then unlocks the app.",
    icon: Check,
  },
];

/** Index of the first step the SERVER still reports as outstanding. */
function firstIncompleteIndex(status: DoctorOnboardingStatus): number {
  const index = REQUIREMENT_STEPS.findIndex((step) => !status.steps[step]);
  return index === -1 ? COMPLETE_INDEX : index;
}

export function DoctorOnboardingScreen() {
  const { user, setUser } = useSession();
  const { notify } = useToast();
  const navigate = useNavigate();
  const push = usePushNotifications(user?.id ?? null);

  const [status, setStatus] = useState<DoctorOnboardingStatus | null>(null);
  const [profile, setProfile] = useState<DoctorProfile | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [activeIndex, setActiveIndex] = useState(0);

  const [stepError, setStepError] = useState<string | null>(null);

  // Practice location (step 2).
  const [geoBusy, setGeoBusy] = useState(false);

  // Profile picture (step 3).
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [finishing, setFinishing] = useState(false);

  /**
   * Adopt a fresh server-side status: session user + which step to show.
   *
   * `jump = true` (initial load, refused finish) moves the flow onto the first
   * outstanding step even if that is *behind* where the doctor currently is —
   * that is how a refused "Finish setup" lands on the step it failed on.
   * Completing a step the doctor is standing on only ever moves forward, so
   * finishing a later task never throws them back to an earlier screen.
   *
   * Deliberately does NOT clear `stepError`: a refused completion reloads the
   * status and must keep the server's reason visible on the step it moved the
   * flow to. Step changes and new attempts clear it instead.
   */
  const applyStatus = useCallback(
    (next: DoctorOnboardingStatus, jump = false) => {
      setStatus(next);
      if (next.user) setUser(next.user);
      setActiveIndex((current) => {
        const target = firstIncompleteIndex(next);
        return jump || target >= current ? target : current;
      });
    },
    [setUser]
  );

  const refreshStatus = useCallback(
    async (jump = false) => {
      const response = await getDoctorOnboarding();
      applyStatus(response.data, jump);
      return response.data;
    },
    [applyStatus]
  );

  const loadProfile = useCallback(() => {
    return getMyDoctorProfile()
      .then((response) => {
        const data = response.data;
        setProfile(data);
        return data;
      })
      .catch((reason: unknown) => {
        setStepError(message(reason));
        return null;
      });
  }, []);

  // Initial load: status is mandatory (the flow cannot run without it), the
  // My Doctor profile is best-effort so a hiccup there never hides the flow
  // itself. `jump` lands the doctor on the first outstanding step so a refresh
  // / re-login resumes the task they were in.
  useEffect(() => {
    let cancelled = false;
    getDoctorOnboarding()
      .then((response) => {
        if (!cancelled) {
          applyStatus(response.data, true);
          setLoadError(null);
        }
      })
      .catch((reason: unknown) => {
        if (!cancelled) setLoadError(message(reason));
      });
    void loadProfile();
    return () => {
      cancelled = true;
    };
  }, [applyStatus, loadProfile]);

  // Already finished (e.g. opened by a stale bookmark) → normal app routes.
  useEffect(() => {
    if (status?.completed) navigate("/doctor/dashboard", { replace: true });
  }, [status?.completed, navigate]);

  /**
   * Open a step by tapping it. Every step in the progress list is tappable on
   * every platform — a first-time doctor can jump straight into the task they
   * want to do; the server still refuses "Finish setup" until all four are done
   * and sends them to whatever is missing.
   */
  function openStep(index: number) {
    if (!status || index < 0 || index > COMPLETE_INDEX) return;
    setStepError(null);
    setActiveIndex(index);
  }

  function isDone(index: number): boolean {
    if (!status) return false;
    if (index === COMPLETE_INDEX) return status.completed;
    return status.steps[REQUIREMENT_STEPS[index]] === true;
  }

  /* ---------------- Step 1 — notifications (existing push machine) ------------- */

  async function enableNotifications() {
    setStepError(null);
    try {
      await push.subscribe();
    } finally {
      // Whatever the browser answered, the server's row count is the truth.
      await refreshStatus().catch((reason: unknown) => setStepError(message(reason)));
    }
  }

  /* ---------------- Step 2 — practice location ------------------------------- */

  async function saveLocation() {
    setStepError(null);
    setGeoBusy(true);
    try {
      const fix = await captureFix();
      await updateMyDoctorProfile({
        latitude: fix.latitude,
        longitude: fix.longitude,
        location_accuracy: fix.accuracy,
      });
      await loadProfile();
      await refreshStatus();
      notify("success", "Practice location saved.");
    } catch (reason) {
      setStepError(
        reason instanceof LocationError ? reason.message : message(reason)
      );
    } finally {
      setGeoBusy(false);
    }
  }

  /* ---------------- Step 3 — profile picture --------------------------------- */

    async function onPhoto(file: File) {
      // Android/iOS pickers sometimes return a valid picture with an EMPTY
      // mime type — only reject when the browser positively says it is not an
      // image. The server validates the real bytes either way.
      if (file.type && !file.type.startsWith("image/")) {
        setStepError("Please select an image file.");
        return;
      }
    if (file.size > 5 * 1024 * 1024) {
      setStepError("Image must be under 5 MB.");
      return;
    }
    setStepError(null);
    setUploading(true);
    try {
      const response = await uploadProfileImage(file);
      setUser(response.data);
      await refreshStatus();
      notify("success", "Photo updated — it now appears on your doctor card.");
    } catch (reason) {
      setStepError(message(reason));
    } finally {
      setUploading(false);
    }
  }

  /* ---------------- Step 5 — server-validated completion --------------------- */

  async function finish() {
    setStepError(null);
    setFinishing(true);
    try {
      const response = await completeDoctorOnboarding();
      setUser(response.data.user);
      notify("success", "Setup complete — welcome aboard.");
      navigate("/doctor/dashboard", { replace: true });
    } catch (reason) {
      // The server names the step that is still outstanding; the reload moves
      // the flow onto it and keeps this error visible there.
      setStepError(message(reason));
      await refreshStatus(true).catch(() => undefined);
    } finally {
      setFinishing(false);
    }
  }

  /* ---------------- Render ---------------------------------------------------- */

  if (loadError) {
    return (
      <div className="page">
        <h1 className="page__title">Finish setting up your account</h1>
        <ErrorState
          message={loadError}
          onRetry={() => {
            setLoadError(null);
            getDoctorOnboarding()
              .then((response) => applyStatus(response.data, true))
              .catch((reason: unknown) => setLoadError(message(reason)));
          }}
        />
      </div>
    );
  }

  if (!status) {
    return (
      <div className="page">
        <h1 className="page__title">Finish setting up your account</h1>
        <Skeleton lines={6} />
      </div>
    );
  }

  const activeMeta = STEPS[activeIndex];
  const ActiveIcon = activeMeta.icon;

  return (
    <div className="page onboarding">
      <h1 className="page__title">Finish setting up your account</h1>
      <p className="page__subtitle">
        Four quick steps before patients can find and book you. Your progress is
        saved on the server — you can come back at any time and pick up here.
      </p>

      {/* Progress: done ✓ · current → · not yet ○ */}
      <ol className="onboarding__steps" aria-label="Setup progress">
        {STEPS.map((step, index) => {
          const done = isDone(index);
          const current = index === activeIndex;
          const state = current ? "current" : done ? "done" : "pending";
          return (
            <li key={step.id} className={`onboarding__step onboarding__step--${state}`}>
              <button
                type="button"
                className="onboarding__step-btn"
                aria-current={current ? "step" : undefined}
                onClick={() => openStep(index)}
              >
                <span className={`onboarding__marker onboarding__marker--${state}`} aria-hidden="true">
                  {done ? <Check size={14} /> : current ? <ChevronRight size={14} /> : <Circle size={14} />}
                </span>
                <span className="onboarding__step-title">{step.title}</span>
                <span className="sr-only">
                  {done ? "completed" : current ? "in progress" : "not started"}
                </span>
              </button>
            </li>
          );
        })}
      </ol>

      <Card className="onboarding__panel">
        <h2 className="card__title">
          <ActiveIcon size={18} aria-hidden="true" /> {activeMeta.title}
        </h2>
        <p className="page__subtitle">{activeMeta.summary}</p>

        {stepError && (
          <p className="field__error" role="alert">
            {stepError}
          </p>
        )}

        {/* ---- Step 1: notifications ---- */}
        {activeIndex === 0 && (
          <div className="onboarding__body">
            {status.steps.notifications ? (
              <p className="onboarding__confirmed">
                <Check size={15} aria-hidden="true" />
                Notifications are active on this device — appointment reminders
                will reach you here.
              </p>
            ) : (
              <>
                {!push.probed && <Skeleton lines={2} />}
                {push.probed && push.message && (
                  <div className={`onboarding__push${push.error ? " onboarding__push--error" : ""}`}>
                    <span>
                      {push.message}
                      {push.steps && (
                        <ol className="home__push-steps">
                          {push.steps.map((step) => (
                            <li key={step}>{step}</li>
                          ))}
                        </ol>
                      )}
                    </span>
                  </div>
                )}
                {push.probed && push.actionLabel && (
                  <Button
                    loading={push.loading}
                    onClick={() => void enableNotifications()}
                  >
                    {push.actionLabel}
                  </Button>
                )}
                {push.probed && !push.actionLabel && !status.steps.notifications && (
                  <p className="field__hint">
                    Follow the instructions above, then continue — this step is
                    confirmed by the server once your device is registered.
                  </p>
                )}
              </>
            )}
          </div>
        )}

        {/* ---- Step 2: practice location ---- */}
        {activeIndex === 1 && (
          <div className="onboarding__body">
            {status.steps.location && profile ? (
              <p className="onboarding__confirmed">
                <Check size={15} aria-hidden="true" />
                Location saved — <LocationLine point={profile} accuracy={profile.location_accuracy} />
              </p>
            ) : (
              <>
                <p>
                  Patients use this to get directions and to find you under
                  &ldquo;near me&rdquo;, and appointments can only be booked once
                  it is set.
                </p>
                <div className="onboarding__actions">
                  <Button
                    loading={geoBusy}
                    onClick={() => void saveLocation()}
                  >
                    <MapPin size={14} /> Use my current location
                  </Button>
                  {/* Required step — this redirect opens the full location form
                      (/doctor/personal), where the practice area can be pinned
                      instead of using GPS. There is no way to skip it: the step
                      only completes once the server sees valid coordinates. */}
                  <Link to="/doctor/personal" className="btn btn--secondary">
                    Go to the location form
                  </Link>
                </div>
                <p className="field__hint">
                  Setting it from the full card editor works too — come back here
                  afterwards and this step will be checked off.
                </p>
              </>
            )}
          </div>
        )}

        {/* ---- Step 3: profile picture ---- */}
        {activeIndex === 2 && (
          <div className="onboarding__body">
            <div className="onboarding__photo">
              <DoctorImage
                src={user?.profile_image ?? null}
                alt={
                  user
                    ? `Dr. ${user.first_name} ${user.last_name}`
                    : "Profile picture"
                }
                className="onboarding__photo-img"
                width={160}
                height={160}
                sizes="160px"
              />
              <div>
                <p>
                  {status.steps.profile_image
                    ? "Your picture is live on every doctor card."
                    : "Upload a clear photo of yourself — this is what patients see on your card."}
                </p>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  className="sr-only"
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    if (file) void onPhoto(file);
                    event.target.value = "";
                  }}
                />
                <Button
                  variant="secondary"
                  loading={uploading}
                  onClick={() => fileInputRef.current?.click()}
                >
                  <Camera size={14} /> {status.steps.profile_image ? "Replace photo" : "Upload photo"}
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* ---- Step 4: My Doctor information → the REAL My Doctor page ---- */}
        {activeIndex === 3 && (
          <div className="onboarding__body">
            {status.steps.doctor_profile ? (
              <p className="onboarding__confirmed">
                <Check size={15} aria-hidden="true" />
                Your My Doctor information is saved — it is what patients see on
                your card.
              </p>
            ) : (
              <>
                <p>
                  Patients choose you by this information. Opening the My Doctor
                  page runs the existing editor: fill the required fields and
                  press its Save button. This step is only ticked once the server
                  confirms the save.
                </p>
                <div className="onboarding__actions">
                  <Link to="/doctor/personal" className="btn btn--secondary">
                    Open My Doctor information
                  </Link>
                </div>
                <p className="field__hint">
                  Save there, then come back — the checklist re-reads your card
                  from the server, so nothing is lost.
                </p>
              </>
            )}
          </div>
        )}

        {/* ---- Step 5: server-validated completion ---- */}
        {activeIndex === COMPLETE_INDEX && (
          <div className="onboarding__body">
            <ul className="onboarding__checklist">
              {STEPS.slice(0, COMPLETE_INDEX).map((step, index) => (
                <li key={step.id} className={isDone(index) ? "is-done" : "is-missing"}>
                  {isDone(index) ? (
                    <Check size={15} aria-hidden="true" />
                  ) : (
                    <Circle size={15} aria-hidden="true" />
                  )}
                  <span>{step.title}</span>
                  <span className="sr-only">
                    {isDone(index) ? "completed" : "not completed"}
                  </span>
                </li>
              ))}
            </ul>
            <p>
              Pressing finish asks the server to check every step again. If
              anything is still missing, you&apos;ll stay here and go straight to it.
            </p>
            <Button loading={finishing} onClick={() => void finish()}>
              Finish setup
            </Button>
          </div>
        )}
      </Card>

      {activeIndex > 0 && (
        <button
          type="button"
          className="onboarding__back"
          onClick={() => openStep(activeIndex - 1)}
        >
          <ArrowLeft size={15} /> Back
        </button>
      )}
    </div>
  );
}
