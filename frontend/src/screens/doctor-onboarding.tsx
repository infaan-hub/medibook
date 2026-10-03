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
import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
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
import { ApiError } from "../api/client";
import { uploadProfileImage } from "../api/auth";
import {
  completeDoctorOnboarding,
  getDoctorOnboarding,
  getMyDoctorProfile,
  updateMyDoctorProfile,
} from "../api/doctors";
import { listSpecialties } from "../api/specialties";
import type {
  DoctorOnboardingStatus,
  DoctorOnboardingStep,
  DoctorProfile,
  Specialty,
} from "../api/types";
import { Button, Card, ErrorState, Skeleton, TextField } from "../components/ui";
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
  const [allSpecialties, setAllSpecialties] = useState<Specialty[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [activeIndex, setActiveIndex] = useState(0);

  const [stepError, setStepError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  // My Doctor information (step 4).
  const [form, setForm] = useState({ first_name: "", last_name: "" });
  const [selectedSpecialtyIds, setSelectedSpecialtyIds] = useState<number[]>([]);
  const [savingInfo, setSavingInfo] = useState(false);

  // Practice location (step 2).
  const [geoBusy, setGeoBusy] = useState(false);

  // Profile picture (step 3).
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [finishing, setFinishing] = useState(false);

  /** Adopt a fresh server-side status: session user and active (resume) step. */
  const applyStatus = useCallback(
    (next: DoctorOnboardingStatus) => {
      setStatus(next);
      if (next.user) setUser(next.user);
      setActiveIndex(firstIncompleteIndex(next));
      // Deliberately does NOT clear `stepError`: a refused completion reloads
      // the status and must keep the server's reason visible on the step it
      // moved the flow to. Step changes and new attempts clear it instead.
    },
    [setUser]
  );

  const refreshStatus = useCallback(async () => {
    const response = await getDoctorOnboarding();
    applyStatus(response.data);
    return response.data;
  }, [applyStatus]);

  const loadProfile = useCallback(() => {
    return getMyDoctorProfile()
      .then((response) => {
        const data = response.data;
        setProfile(data);
        setForm({
          first_name: data.first_name ?? "",
          last_name: data.last_name ?? "",
        });
        setSelectedSpecialtyIds((data.specialties ?? []).map((specialty) => specialty.id));
        return data;
      })
      .catch((reason: unknown) => {
        setStepError(message(reason));
        return null;
      });
  }, []);

  // Initial load: status is mandatory (the flow cannot run without it), the
  // profile form and specialty catalog are best-effort so a hiccup there never
  // hides the flow itself.
  useEffect(() => {
    let cancelled = false;
    getDoctorOnboarding()
      .then((response) => {
        if (!cancelled) {
          applyStatus(response.data);
          setLoadError(null);
        }
      })
      .catch((reason: unknown) => {
        if (!cancelled) setLoadError(message(reason));
      });
    void loadProfile();
    listSpecialties(1, 100)
      .then((response) => {
        if (!cancelled) setAllSpecialties(response.data.results);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [applyStatus, loadProfile]);

  // Already finished (e.g. opened by a stale bookmark) → normal app routes.
  useEffect(() => {
    if (status?.completed) navigate("/doctor/dashboard", { replace: true });
  }, [status?.completed, navigate]);

  const maxReachableIndex = status ? firstIncompleteIndex(status) : 0;

  function openStep(index: number) {
    if (!status || index > maxReachableIndex) return;
    setStepError(null);
    setFieldErrors({});
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
    if (!file.type.startsWith("image/")) {
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

  /* ---------------- Step 4 — My Doctor information --------------------------- */

  function toggleSpecialty(id: number) {
    setSelectedSpecialtyIds((current) =>
      current.includes(id) ? current.filter((x) => x !== id) : [...current, id]
    );
  }

  async function saveInfo(event: FormEvent) {
    event.preventDefault();
    setStepError(null);
    setFieldErrors({});
    setSavingInfo(true);
    try {
      const response = await updateMyDoctorProfile({
        first_name: form.first_name.trim(),
        last_name: form.last_name.trim(),
        specialties: selectedSpecialtyIds,
      });
      setProfile(response.data);
      await refreshStatus();
      notify("success", "Your card information has been saved.");
    } catch (reason) {
      if (reason instanceof ApiError) {
        setFieldErrors(
          Object.fromEntries(
            Object.entries(reason.errors).map(([field, messages]) => [
              field,
              messages[0] ?? "Invalid value.",
            ])
          )
        );
      }
      setStepError(message(reason));
    } finally {
      setSavingInfo(false);
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
      await refreshStatus().catch(() => undefined);
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
              .then((response) => applyStatus(response.data))
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
          const reachable = index <= maxReachableIndex;
          return (
            <li key={step.id} className={`onboarding__step onboarding__step--${state}`}>
              <button
                type="button"
                className="onboarding__step-btn"
                aria-current={current ? "step" : undefined}
                disabled={!reachable}
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
                  <Link to="/doctor/personal" className="onboarding__link">
                    Choose a specific area instead
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

        {/* ---- Step 4: My Doctor information ---- */}
        {activeIndex === 3 && (
          <form className="form onboarding__body" onSubmit={saveInfo} noValidate>
            <div className="form__row">
              <TextField
                id="onboarding-first"
                label="First name"
                value={form.first_name}
                error={fieldErrors.first_name}
                onChange={(event) =>
                  setForm((current) => ({ ...current, first_name: event.target.value }))
                }
              />
              <TextField
                id="onboarding-last"
                label="Last name"
                value={form.last_name}
                error={fieldErrors.last_name}
                onChange={(event) =>
                  setForm((current) => ({ ...current, last_name: event.target.value }))
                }
              />
            </div>

            <div className="specialty-picker" role="group" aria-label="Your specialties">
              <p className="field__label">Your specialties</p>
              <p className="page__subtitle">
                Patients search by these — pick at least one.
              </p>
              <div className="specialty-picker__grid">
                {allSpecialties.length === 0 && <Skeleton lines={3} />}
                {allSpecialties.map((specialty) => {
                  const active = selectedSpecialtyIds.includes(specialty.id);
                  return (
                    <button
                      key={specialty.id}
                      type="button"
                      className={`specialty-picker__item${active ? " specialty-picker__item--active" : ""}`}
                      aria-pressed={active}
                      onClick={() => toggleSpecialty(specialty.id)}
                    >
                      <span className="specialty-picker__check" aria-hidden="true">
                        <Check size={12} />
                      </span>
                      <span className="specialty-picker__name">{specialty.name}</span>
                      {specialty.patient_friendly_name && (
                        <span className="specialty-picker__friendly">
                          {specialty.patient_friendly_name}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
              {fieldErrors.specialties && (
                <p className="field__error">{fieldErrors.specialties}</p>
              )}
            </div>

            <div className="onboarding__actions">
              <Button type="submit" loading={savingInfo}>
                Save information
              </Button>
              <Link to="/doctor/personal" className="onboarding__link">
                Open the full card editor
              </Link>
            </div>
          </form>
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
