import { useCallback, useEffect, useState, memo } from "react";
import { Link, useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";
import i18n from "../i18n";
import { listMyAppointments } from "../api/appointments";
import { reasonLabel, statusLabel } from "./emergency";
import { getPatientProfile } from "../api/patients";
import { listDoctors, listTopDoctors, type ListDoctorsParams } from "../api/doctors";
import type { Appointment, DoctorProfile, User } from "../api/types";
import { Button, Card, EmptyState, ErrorState, Skeleton } from "../components/ui";
import { DistanceBadge } from "../components/Location";
import { DoctorImage, resolveDoctorImage } from "../components/DoctorImage";
import { captureFix, directionsUrl, LocationError } from "../lib/location";
import { nearestAreaName } from "../lib/zanzibar";
import { useSession } from "../state/app-context";
import { isStandalonePWA } from "../lib/platform";
import { useRealtimeSync } from "../realtime/socket";
import { usePushNotifications } from "../push/usePushNotifications";
import { pushStateNeedsPrompt } from "../push/prompt";
import { formatDate } from "../lib/intl";
import {
  ChevronRight,
  Crosshair,
  MapPin,
  Search,
  Newspaper,
  House,
  GraduationCap,
  Brain,
} from "lucide-react";

/** Radius used by the directory's "Near me" toggle (matches the API default). */
const NEAR_ME_RADIUS_KM = 5;

/** Viewer position sent to the API for the "near me" sort/filter. */
interface Origin {
  latitude: number;
  longitude: number;
}

/**
 * Photo shown on every doctor card: the doctor's own uploaded picture, or
 * `null` — which renders the "No image" state. There is no stock/random
 * fallback: a picture that is not this doctor's must never be shown as them.
 */
export function doctorCardImage(doctor: Pick<DoctorProfile, "profile_image">): string | null {
  return resolveDoctorImage(doctor.profile_image);
}

export { DoctorAvailabilityScreen, DoctorProfileScreen, DoctorPersonalScreen } from "./doctor";
export { DoctorOnboardingScreen } from "./doctor-onboarding";
export { DoctorDashboardScreen, DoctorAppointmentsScreen } from "./doctor-dashboard";
export { DoctorMedicalTreatmentScreen } from "./doctor-medical-treatment";
export { SpecialtyListPage, SpecialtyDetailPage } from "./specialties";
export { HospitalListPage, HospitalDetailPage } from "./hospitals";
export { BookingScreen, BookingSuccessScreen, RescheduleScreen, AppointmentsListScreen, AppointmentDetailScreen } from "./appointments";
export { NotificationsScreen } from "./notifications";
export { AdminDashboardScreen, AdminUsersScreen, AdminDoctorsScreen, AdminCreateUserScreen, AdminCreateDoctorScreen, AdminAuditScreen, AdminAppointmentsScreen } from "./admin-dashboard";
export { BlogListPage, BlogArticlePage } from "./blog";

function formatAppointment(appointment: Appointment): string {
  const day = formatDate(`${appointment.appointment_date}T00:00:00`, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
  return `${day} · ${appointment.start_time.slice(0, 5)}`;
}

function formatDoctorName(doctor: DoctorProfile): string {
  return `Dr. ${doctor.first_name} ${doctor.last_name}`.trim();
}

/**
 * Availability chip on every doctor card — replaces the old rating stars.
 * Read straight off the card so a patient knows whether they can book before
 * they open the profile.
 */
const AvailabilityChip = memo(function AvailabilityChip({ doctor }: { doctor: DoctorProfile }) {
  const { t } = useTranslation();
  const available = doctor.available_today ?? doctor.is_available !== false;
  return (
    <span
      className={`home__doctor-status${available ? "" : " home__doctor-status--off"}`}
      title={available ? t("home.takingAppointments") : t("home.noAvailabilityToday")}
    >
      <span className="home__doctor-status-dot" aria-hidden="true" />
      {available ? t("home.available") : t("home.notAvailable")}
    </span>
  );
});

/**
 * The signed-in person's photo in the greeting. Deterministic either way:
 * a photo that loads, the first initial when there is none — and when the
 * bytes fail, the initial too, never a broken-image icon.
 */
function GreetingAvatar({ user }: { user: User }) {
  const [brokenSrc, setBrokenSrc] = useState<string | null>(null);
  const src = user.profile_image && user.profile_image !== brokenSrc ? user.profile_image : null;
  const fallback = ((user.first_name || "")[0] || (user.last_name || "")[0] || "M").toUpperCase();
  return (
    <span className="home__avatar">
      {src ? <img src={src} alt="" onError={() => setBrokenSrc(src)} /> : fallback}
    </span>
  );
}

const DoctorCard = memo(function DoctorCard({ doctor, index = 0 }: { doctor: DoctorProfile; index?: number }) {
  const { t } = useTranslation();
  return (
    <Link key={doctor.id} to={`/doctors/${doctor.id}`} className="home__doctor-card">
      <DoctorImage
        src={doctorCardImage(doctor)}
        alt={formatDoctorName(doctor)}
        width={500}
        height={333}
        sizes="40vw"
        priority={index === 0}
      />
      <span className="home__doctor-info">
        <strong>{formatDoctorName(doctor)}</strong>
        {doctor.specialties && doctor.specialties.length > 0 ? (
          <span className="home__doctor-specialties">
            {doctor.specialties[0].patient_friendly_name || doctor.specialties[0].name}
          </span>
        ) : (
          <span>{t("home.medicalSpecialist")}</span>
        )}
        {doctor.has_location && directionsUrl(doctor) && (
          <span className="home__doctor-location">
            <MapPin size={11} />
            <a className="geo-link" href={directionsUrl(doctor)!} target="_blank" rel="noreferrer">
              {nearestAreaName(doctor) ?? t("home.directions")}
            </a>
          </span>
        )}
        <AvailabilityChip doctor={doctor} />
      </span>
      <ChevronRight size={17} />
    </Link>
  );
});

function PatientHome({ user }: { user: User | null }) {
  const { t } = useTranslation();
  const [appointments, setAppointments] = useState<Appointment[] | null>(null);
  const [doctors, setDoctors] = useState<DoctorProfile[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const push = usePushNotifications(user?.id ?? 0);

  const loadAppointments = useCallback(() => {
    listMyAppointments()
      .then((response) => { setError(null); setAppointments(response.data?.results ?? []); })
      .catch((reason: unknown) => setError(reason instanceof Error ? reason.message : i18n.t("common.couldNotLoadAppointments")));
  }, []);

  const refreshAppointments = useCallback(() => {
    listMyAppointments()
      .then((response) => { setError(null); setAppointments(response.data?.results ?? []); })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (user) loadAppointments();
    else setAppointments([]);
    listTopDoctors()
      .then((response) => setDoctors((response.data ?? []).slice(0, 4)))
      .catch(() => setDoctors([]));
  }, [loadAppointments, user]);

  useRealtimeSync({
    refresh: refreshAppointments,
    events: ["appointment.created", "appointment.updated", "appointment.deleted"],
  });

  const upcoming = appointments
    ?.filter((item) => !item.deleted_at && (item.status === "pending" || item.status === "accepted"))
    .sort((a, b) => (a.appointment_date + a.start_time).localeCompare(b.appointment_date + b.start_time)) ?? [];

  return (
    <div className="page home-page">
      {user && (
        <header className="home__topbar">
          <div className="home__greeting">
            <GreetingAvatar user={user} />
            <span>
              <strong>{new Date().getHours() < 12 ? t("home.greeting.morning") : new Date().getHours() < 18 ? t("home.greeting.afternoon") : t("home.greeting.evening")}</strong>
              <span>{user.first_name || user.last_name || t("home.friend")}</span>
            </span>
          </div>
        </header>
      )}

      <Link to="/doctors" className="home__search">
        <span className="home__search-icon"><MapPin size={18} /></span>
        <span>{t("home.searchPlaceholder")}</span>
        <Search size={19} />
      </Link>

      {error && <ErrorState message={error} />}

      {/* Push notification prompt — one finite state machine, one banner:
          iOS Safari tab → Add-to-Home-Screen instructions (no Allow button,
          because iOS ignores a request from a plain tab), ready → Allow,
          granted → finish setup, denied → settings guidance (never a re-ask
          loop), failed → the typed failure that actually happened. */}
      {user && push.probed && push.message && pushStateNeedsPrompt(push.state) && (
        <div className={`home__push-prompt${push.error ? " home__push-prompt--error" : ""}`}>
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
          {push.actionLabel && (
            <button type="button" className="home__push-btn" onClick={push.toggle} disabled={push.loading}>
              {push.loading
                ? t("push.enabling")
                : push.actionLabel === "Allow"
                  ? t("push.allow")
                  : push.actionLabel === "Enable"
                    ? t("push.enable")
                    : push.actionLabel}
            </button>
          )}
        </div>
      )}

      <section className="home__section">
        <div className="home__section-heading">
          <h1>{t("home.topDoctors")}</h1>
          <Link to="/list-doctors">{t("home.seeAll")} <ChevronRight size={15} /></Link>
        </div>
        {doctors === null ? <Skeleton lines={4} /> : doctors.length === 0 ? (
          <EmptyState title={t("home.noDoctors")} description={t("home.noDoctorsDesc")} />
        ) : (
          <div className="home__doctor-list">
            {doctors.map((doctor, index) => (
              <DoctorCard key={doctor.id} doctor={doctor} index={index} />
            ))}
          </div>
        )}
      </section>

      {user && upcoming.length > 0 && (<section className="home__section home__appointments-section">
        <div className="home__section-heading">
          <h2>{t("home.upcomingAppointments")}</h2>
          <Link to="/appointments">{t("home.seeAll")} <ChevronRight size={15} /></Link>
        </div>
        <div className="home__appointment-list">
            {upcoming.slice(0, 3).map((appt) => {
              const emergency = appt.appointment_type === "EMERGENCY";
              return (
                <Link
                  key={appt.id}
                  to={`/appointments/${appt.id}`}
                  className={`home__appointment-card${emergency ? " home__appointment-card--emergency" : ""}`}
                >
                  <span
                    className={`home__appointment-datebox${emergency ? " home__appointment-datebox--emergency" : ""}`}
                  >
                    <strong>{formatDate(`${appt.appointment_date}T00:00:00`, { day: "2-digit" })}</strong>
                    <span>{formatDate(`${appt.appointment_date}T00:00:00`, { month: "short" })}</span>
                  </span>
                  <span className="home__appointment-info">
                    <strong className={emergency ? "home__appointment-title--emergency" : undefined}>
                      {emergency ? t("home.emergencyAppointment") : t("home.doctorAppointment")}
                    </strong>
                    <span>{formatAppointment(appt)}</span>
                    {emergency && appt.emergency_reason && (
                      <span className="home__appointment-emergency-reason">
                        {reasonLabel(appt.emergency_reason)}
                      </span>
                    )}
                    <span className="home__appointment-badges">
                      {emergency && <span className="badge badge--emergency">{t("home.emergencyLabel")}</span>}
                      <span className={`badge badge--${appt.status}`}>{statusLabel(appt.status)}</span>
                    </span>
                  </span>
                  <ChevronRight size={17} />
                </Link>
              );
            })}
        </div>
      </section>)}

      {/* Quick actions */}
      <div className="home__quick-actions">
        <Link to="/home-visit/doctor" className="home__quick-action">
          <House size={20} />
          <span>{t("nav.homeService")}</span>
        </Link>
        <Link to="/blog" className="home__quick-action">
          <Newspaper size={20} />
          <span>{t("home.healthTips")}</span>
        </Link>
        <Link to="/training" className="home__quick-action">
          <GraduationCap size={20} />
          <span>{t("nav.training")}</span>
        </Link>
        <Link to="/psychotherapy" className="home__quick-action">
          <Brain size={20} />
          <span>{t("nav.psychologyService")}</span>
        </Link>
      </div>
    </div>
  );
}

export function HomeScreen() {
  const { user } = useSession();
  // Route-level guard handles access. In a web browser (not installed PWA),
  // guests may view the home screen; in the installed app they are redirected
  // to login by the route guard, so reaching here as a non-patient means web.
  if (!user || user.role !== "patient") {
    // Installed app: nothing to render (guard redirects). Web browser: render
    // the home with a null user so guests can browse doctors/blog.
    if (isStandalonePWA()) return null;
  }
  return <PatientHome user={user && user.role === "patient" ? user : null} />;
}

/**
 * Directory. The free-text "Location / area" box is gone — `Doctor.city` and
 * `Doctor.office_address` were dropped — and in its place is a real
 * **Near me** toggle: send the viewer's coordinates and the API returns only
 * doctors with a fix inside the circle, nearest first, each with `distance_km`.
 */
export function DoctorsPage() {
  const { t } = useTranslation();
  const { user } = useSession();
  const route = useLocation();
  const isHomeVisit = route.pathname.startsWith("/home-visit");
  const [search, setSearch] = useState("");
  const [origin, setOrigin] = useState<Origin | null>(null);
  const [nearMe, setNearMe] = useState(false);
  const [originError, setOriginError] = useState<string | null>(null);
  const [results, setResults] = useState<DoctorProfile[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const buildParams = useCallback(
    (opts: { search: string; nearMe: boolean; origin: Origin | null }): ListDoctorsParams => ({
      search: opts.search || undefined,
      ...(opts.nearMe && opts.origin
        ? { latitude: opts.origin.latitude, longitude: opts.origin.longitude, radius_km: NEAR_ME_RADIUS_KM }
        : {}),
    }),
    []
  );

  const fetchDoctors = useCallback(
    (params: ListDoctorsParams) => {
      setLoading(true);
      setError(null);
      listDoctors(params)
        .then((response) => setResults(response.data.results))
        .catch((reason: unknown) =>
          setError(reason instanceof Error ? reason.message : i18n.t("common.couldNotLoadDoctors"))
        )
        .finally(() => setLoading(false));
    },
    []
  );

  const load = useCallback(
    (opts?: { search?: string; nearMe?: boolean; origin?: Origin | null }) => {
      fetchDoctors(
        buildParams({
          search: opts?.search ?? search,
          nearMe: opts?.nearMe ?? nearMe,
          origin: opts?.origin ?? origin,
        })
      );
    },
    [buildParams, fetchDoctors, search, nearMe, origin]
  );

  // First visit: patients who already saved a fix get sorted by distance;
  // everyone else sees the full directory until they ask for "Near me".
  useEffect(() => {
    if (user?.role !== "patient") {
      load();
      return;
    }
    let cancelled = false;
    getPatientProfile()
      .then((response) => {
        if (cancelled) return;
        const profile = response.data;
        if (profile.has_location && profile.latitude !== null && profile.longitude !== null) {
          const stored: Origin = { latitude: profile.latitude, longitude: profile.longitude };
          setOrigin(stored);
          setNearMe(true);
          load({ nearMe: true, origin: stored });
        } else {
          load();
        }
      })
      .catch(() => {
        if (!cancelled) load();
      });
    return () => {
      cancelled = true;
    };
    // Only on mount — later changes ride the explicit Search/toggle handlers.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** Turn "Near me" on: reuse the stored fix, or ask the browser for one. */
  async function toggleNearMe() {
    if (nearMe) {
      setNearMe(false);
      setOriginError(null);
      load({ nearMe: false });
      return;
    }
    setOriginError(null);
    try {
      const fix = origin ?? (await captureFix());
      setOrigin(fix);
      setNearMe(true);
      load({ nearMe: true, origin: fix });
    } catch (err) {
      setOriginError(
        err instanceof LocationError ? err.message : i18n.t("common.couldNotReadLocation")
      );
    }
  }

  return (
    <div className="page doctors-page">
      <h1 className="page__title">{isHomeVisit ? t("home.findNearbyDoctor") : t("doctors.title")}</h1>
      <Card className="doctors__filters">
        <div className="field">
          <label className="field__label" htmlFor="doctor-search">{t("doctors.name")}</label>
          <input
            id="doctor-search"
            className="field__input"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder={t("doctors.searchByName")}
          />
        </div>
        <div className="field">
          <span className="field__label" id="doctor-nearby-label">{t("doctors.location")}</span>
          <button
            type="button"
            id="doctor-nearby"
            className="btn btn--secondary doctors__nearby"
            aria-pressed={nearMe}
            aria-labelledby="doctor-nearby-label"
            onClick={() => void toggleNearMe()}
            disabled={loading}
          >
            <Crosshair size={14} />
            {nearMe ? t("home.nearMeRadius", { radius: NEAR_ME_RADIUS_KM }) : t("home.nearMe")}
          </button>
        </div>
        <Button onClick={() => load()} loading={loading}>{t("doctors.search")}</Button>
      </Card>
      {originError && <ErrorState message={originError} onRetry={() => void toggleNearMe()} />}
      {error && <ErrorState message={error} onRetry={() => load()} />}
      {loading && <Skeleton lines={5} />}
      {!loading && results?.length === 0 && (
        <EmptyState
          title={t("doctors.noResults")}
          description={nearMe ? t("home.noDoctorsNearbyDesc", { radius: NEAR_ME_RADIUS_KM }) : t("home.tryAnotherName")}
        />
      )}
      {!loading && !!results?.length && (
        <div className="home__doctor-list doctors__grid">
          {results.map((doctor) => (
            <Link key={doctor.id} to={isHomeVisit ? `/home-visit/doctors/${doctor.id}` : `/doctors/${doctor.id}`} className="home__doctor-card">
              <DoctorImage
                src={doctorCardImage(doctor)}
                alt={formatDoctorName(doctor)}
                width={500}
                height={333}
                sizes="25vw"
              />
              <span className="home__doctor-info">
                <strong>{formatDoctorName(doctor)}</strong>
                {doctor.specialties && doctor.specialties.length > 0 ? (
                  <span className="home__doctor-specialties">
                    {doctor.specialties[0].patient_friendly_name || doctor.specialties[0].name}
                  </span>
                ) : (
                  <span>{t("home.medicalSpecialist")}</span>
                )}
                <span className="home__doctor-location">
                  <MapPin size={11} />
                  {doctor.distance_km != null ? (
                    <DistanceBadge km={doctor.distance_km} point={doctor} />
                  ) : doctor.has_location && directionsUrl(doctor) ? (
                    <a className="geo-link" href={directionsUrl(doctor)!} target="_blank" rel="noreferrer">
                      {nearestAreaName(doctor) ?? t("home.directions")}
                    </a>
                  ) : (
                    <span className="geo-missing">{t("home.locationNotShared")}</span>
                  )}
                </span>
                <AvailabilityChip doctor={doctor} />
              </span>
              <ChevronRight size={17} />
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

export function NotFoundPage() {
  const { t } = useTranslation();
  return (
    <div className="page">
      <EmptyState
        title={t("home.pageNotFound")}
        description={t("home.pageNotFoundDesc")}
        action={<Link to="/">{t("home.goHome")}</Link>}
      />
    </div>
  );
}

export { CoordinatorScreen } from "./coordinator";
export function ListDoctorsPage() {
  const { t } = useTranslation();
  const [doctors, setDoctors] = useState<DoctorProfile[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    listDoctors()
      .then((response) => setDoctors(response.data?.results ?? []))
      .catch((reason: unknown) =>
        setError(reason instanceof Error ? reason.message : i18n.t("common.couldNotLoadDoctors"))
      );
  }, []);

  return (
    <div className="page home-page">
      <Link to="/" className="home__back-link">
        <ChevronRight size={16} style={{ transform: "rotate(180deg)" }} /> {t("common.back", { defaultValue: "Back" })}
      </Link>
      <section className="home__section">
        <div className="home__section-heading">
          <h1>{t("doctors.title")}</h1>
        </div>
        {error && <ErrorState message={error} />}
        {doctors === null ? (
          <Skeleton lines={6} />
        ) : doctors.length === 0 ? (
          <EmptyState title={t("home.noDoctors")} description={t("home.noDoctorsDesc")} />
        ) : (
          <div className="home__doctor-list">
            {doctors.map((doctor, index) => (
              <DoctorCard key={doctor.id} doctor={doctor} index={index} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
