import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { Link, useLocation, useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import i18n from "../i18n";
import { formatDate } from "../lib/intl";
import {
  createScheduleItem,
  deleteScheduleItem,
  getDoctor,
  getMyDoctorProfile,
  getMySchedule,
  updateMyDoctorProfile,
  updateScheduleItem,
  listAvailabilityBreaks,
  createAvailabilityBreak,
  deleteAvailabilityBreak,
  listScheduleExceptions,
  createScheduleException,
  deleteScheduleException,
} from "../api/doctors";
import { uploadProfileImage } from "../api/auth";
import { listSpecialties } from "../api/specialties";
import { ApiError } from "../api/client";
import type {
  AvailabilityBreak,
  DoctorProfile,
  GeoInput,
  ScheduleException,
  ScheduleItem,
  Specialty,
} from "../api/types";
import { Button, Card, EmptyState, ErrorState, Skeleton, TextField } from "../components/ui";
import { doctorOnboardingIncomplete } from "../components/guards";
import { DoctorImage } from "../components/DoctorImage";
import { LocationLine } from "../components/Location";
import { captureFix, LocationError } from "../lib/location";
import { searchZanzibarAreas, type ZanzibarArea } from "../lib/zanzibar";
import { useSession, useToast } from "../state/app-context";
import { ArrowLeft, Clock, BadgeIndianRupee, Crosshair, Check, MapPin, Phone, Plus, Search, Trash2 } from "lucide-react";

function message(error: unknown): string {
  return error instanceof Error ? error.message : i18n.t("common.tryAgainError");
}

// 1 Jan 2024 was a Monday — format a stable week with the active locale.
function weekdayName(index: number): string {
  return formatDate(new Date(2024, 0, 1 + index), { weekday: "long" });
}

/** Meaning of a specialty for patients: friendly name, falling back to medical name. */
function specialtyMeaning(s: Specialty): string {
  return s.patient_friendly_name || s.name;
}

export function DoctorProfileScreen() {
  const { t } = useTranslation();
  const { id } = useParams<{ id: string }>();
  const route = useLocation();
  const isHomeVisit = route.pathname.startsWith("/home-visit");
  const [doctor, setDoctor] = useState<DoctorProfile | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    if (!id) return;
    setError(null);
    getDoctor(Number(id)).then((response) => setDoctor(response.data)).catch((reason: unknown) => setError(message(reason)));
  }, [id]);
  useEffect(() => { load(); }, [load]);

  if (error) return <div className="page"><ErrorState message={error} onRetry={load} /></div>;
  if (!doctor) return <div className="page"><Skeleton lines={6} /></div>;
  return (
    <div className="page">
      <Link to={isHomeVisit ? "/home-visit/doctor" : "/doctors"}><ArrowLeft size={16} /> {isHomeVisit ? t("doctor.backToHomeDoctors") : t("doctor.backToDoctors")}</Link>
      <Card className="card--fit">
        <DoctorImage
          src={doctor.profile_image}
          alt={`Dr. ${doctor.first_name} ${doctor.last_name}`}
          className="doctor-profile__photo"
          emptyClassName="doctor-photo-empty--profile"
          width={320}
          height={240}
          sizes="320px"
        />
        <h1 className="page__title">Dr. {doctor.first_name} {doctor.last_name}</h1>
        <p className="doctor-profile__location">
          <LocationLine point={doctor} accuracy={doctor.location_accuracy} />
        </p>
        {doctor.specialties && doctor.specialties.length > 0 ? (
          <p>
            <strong>{doctor.specialties[0].name}</strong>
            {doctor.specialties[0].patient_friendly_name
              ? ` — ${doctor.specialties[0].patient_friendly_name}`
              : ""}
          </p>
        ) : (
          <p>{t("doctor.professionalProfile")}</p>
        )}
        <p>{t("doctor.yearsExperience", { count: doctor.experience_years })}</p>
        <dl className="doctor-profile__fees">
          {isHomeVisit ? (
            <div><dt>{t("doctor.homeServiceFee", { defaultValue: "Home service fee" })}</dt><dd>TSh {doctor.home_service_fee ?? "0"}</dd></div>
          ) : (
            <div><dt>{t("doctor.appointmentFee", { defaultValue: "Appointment fee" })}</dt><dd>TSh {doctor.appointment_fee ?? doctor.consultation_fee ?? "0"}</dd></div>
          )}
        </dl>

        {/* All selected specialties with their meanings for patients */}
        {doctor.specialties && doctor.specialties.length > 0 && (
          <div className="doctor-specialties">
            <h3>{t("doctor.specialties")}</h3>
            <div className="doctor-specialties__list">
              {doctor.specialties.map((s) => (
                <Link key={s.id} to={`/specialties/${s.id}`} className="doctor-specialty-tag">
                  <span className="doctor-specialty-tag__name">{s.patient_friendly_name || s.name}</span>
                  <span className="doctor-specialty-tag__medical">{s.name}</span>
                  {s.description && <span className="doctor-specialty-tag__desc">{s.description}</span>}
                </Link>
              ))}
            </div>
          </div>
        )}

        {doctor.bio && <p>{doctor.bio}</p>}
        {doctor.is_available === false ? (
          <>
            <p className="form-note--error">
              {t("doctor.notTakingAppointments")}
            </p>
            <div style={{ marginTop: "var(--space-4)" }}>
              <Button disabled>{t("doctor.notAvailableForBooking")}</Button>
            </div>
          </>
        ) : (
          <div style={{ marginTop: "var(--space-4)" }}>
            <Link to={isHomeVisit ? `/home-visit/booking/${id}` : `/booking/${id}`}><Button>{isHomeVisit ? t("doctor.requestHomeService") : t("doctors.book")}</Button></Link>
          </div>
        )}
      </Card>
    </div>
  );
}

export function DoctorDashboardScreen() {
  const { t } = useTranslation();
  const [profile, setProfile] = useState<DoctorProfile | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { getMyDoctorProfile().then((response) => setProfile(response.data)).catch((reason: unknown) => setError(message(reason))); }, []);
  return <div className="page"><h1 className="page__title">{t("doctor.dashboardTitle")}</h1>{error && <ErrorState message={error} />}{!profile ? <Skeleton lines={4} /> : <Card><h2>Dr. {profile.first_name} {profile.last_name}</h2><p>{profile.specialties && profile.specialties.length > 0 ? specialtyMeaning(profile.specialties[0]) : t("doctor.completeProfile")}</p><p><Link to="/doctor/availability">{t("doctor.manageAvailability")}</Link> · <Link to="/doctor/personal">{t("doctor.editPersonalCard")}</Link></p></Card>}</div>;
}

/** Doctor's own card preview block (rendered inside DoctorPersonalScreen). */
function DoctorCardPreview({ profile }: { profile: DoctorProfile }) {
  const { t } = useTranslation();
  return (
    <Card className="doc-preview-card">
      <div className="doc-preview-card__photo-wrap">
        <DoctorImage
          src={profile.profile_image}
          alt={`Dr. ${profile.first_name} ${profile.last_name}`}
          className="doc-preview-card__photo"
          emptyClassName="doc-preview-card__photo-empty"
          width={380}
          height={200}
          sizes="380px"
        />
        <div className="doc-preview-card__photo-overlay" />
        {profile.phone && (
          <span className="doc-preview-card__badge">
            <Phone size={12} fill="currentColor" /> <a href={`tel:${profile.phone}`} style={{color: "inherit", textDecoration: "none"}}>{profile.phone}</a>
          </span>
        )}
      </div>
      <div className="doc-preview-card__body">
        <h2 className="doc-preview-card__name">Dr. {profile.first_name} {profile.last_name}</h2>

        {/* Front of card: top (first) specialty — never qualifications */}
        <p className="doc-preview-card__qual">
          {profile.specialties && profile.specialties.length > 0
            ? profile.specialties[0].name
            : t("doctor.medicalSpecialist")}
        </p>
        {profile.specialties && profile.specialties.length > 0 && (
          <p className="doc-preview-card__specialty-meaning">
            {[profile.specialties[0].patient_friendly_name, profile.specialties[0].description]
              .filter(Boolean)
              .join(" — ")}
          </p>
        )}

        {/* Inside the card: ALL selected specialties with meanings */}
        {profile.specialties && profile.specialties.length > 0 && (
          <div className="doc-preview-card__specialties">
            {profile.specialties.map((s) => (
              <span key={s.id} className="doctor-specialty-tag doctor-specialty-tag--small">
                <span className="doctor-specialty-tag__name">{s.name}</span>
                <span className="doctor-specialty-tag__medical">{specialtyMeaning(s)}</span>
              </span>
            ))}
          </div>
        )}

        <div className="doc-preview-card__meta">
          <span className="doc-preview-card__meta-item">
            <Clock size={14} /> {t("doctor.yrsExp", { count: profile.experience_years ?? 0 })}
          </span>
          <span className="doc-preview-card__meta-item">
            <BadgeIndianRupee size={14} /> TSh {profile.appointment_fee ?? profile.consultation_fee}
          </span>
          {profile.phone && (
            <span className="doc-preview-card__meta-item">
              <Phone size={13} /> <a href={`tel:${profile.phone}`}>{profile.phone}</a>
            </span>
          )}
        </div>
        <dl className="doc-preview-card__fees">
          <div><dt>{t("doctor.appointmentFee", { defaultValue: "Appointment fee" })}</dt><dd>TSh {profile.appointment_fee ?? profile.consultation_fee ?? "0"}</dd></div>
          <div><dt>{t("doctor.homeServiceFee", { defaultValue: "Home service fee" })}</dt><dd>TSh {profile.home_service_fee ?? "0"}</dd></div>
          <div><dt>{t("doctor.psychotherapyFee", { defaultValue: "Psychological service fee" })}</dt><dd>TSh {profile.psychotherapy_fee ?? "0"}</dd></div>
          <div><dt>{t("doctor.trainingFee", { defaultValue: "Training fee" })}</dt><dd>TSh {profile.training_fee ?? "0"}</dd></div>
        </dl>
        <p className="doc-preview-card__location">
          <LocationLine point={profile} accuracy={profile.location_accuracy} />
        </p>
      </div>
    </Card>
  );
}

/**
 * /doctor/personal — the doctor sees the same card patients see,
 * plus editing for name, experience, fee and card photo.
 */
export function DoctorPersonalScreen() {
  const { t } = useTranslation();
  const { user, setUser } = useSession();
  const { notify } = useToast();
  const [profile, setProfile] = useState<DoctorProfile | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({ first_name: "", last_name: "", experience_years: "", phone: "" });
  /** Real practice coordinates — the city/office-address text fields are gone. */
  const [geo, setGeo] = useState<GeoInput>({ latitude: null, longitude: null, location_accuracy: null });
  const [geoBusy, setGeoBusy] = useState(false);
  const [geoError, setGeoError] = useState<string | null>(null);
  /** Method 1 of 2: a typed area name plus the wards it matched. */
  const [placeQuery, setPlaceQuery] = useState("");
  const [placeHits, setPlaceHits] = useState<ZanzibarArea[]>([]);
  const [placeSearched, setPlaceSearched] = useState(false);
  /** Saving is blocked until one of the two methods has produced a fix. */
  const hasLocation = geo.latitude !== null && geo.longitude !== null;
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [allSpecialties, setAllSpecialties] = useState<Specialty[]>([]);
  const [selectedSpecialtyIds, setSelectedSpecialtyIds] = useState<number[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const load = useCallback(() => {
    setError(null);
    getMyDoctorProfile()
      .then((response) => {
        setProfile(response.data);
        setForm({
          first_name: response.data.first_name ?? "",
          last_name: response.data.last_name ?? "",
          experience_years: response.data.experience_years?.toString() ?? "",
          phone: response.data.phone ?? "",
        });
        setGeo({
          latitude: response.data.latitude,
          longitude: response.data.longitude,
          location_accuracy: response.data.location_accuracy,
        });
        setSelectedSpecialtyIds((response.data.specialties ?? []).map((s) => s.id));
      })
      .catch((reason: unknown) => setError(message(reason)));
  }, []);
  useEffect(() => { load(); }, [load]);

  // Full specialty catalog with meanings for the picker.
  useEffect(() => {
    listSpecialties(1, 100)
      .then((response) => setAllSpecialties(response.data.results))
      .catch(() => {});
  }, []);

  function toggleSpecialty(id: number) {
    setSelectedSpecialtyIds((current) =>
      current.includes(id) ? current.filter((x) => x !== id) : [...current, id]
    );
  }

  function update(name: string, value: string) {
    setForm((current) => ({ ...current, [name]: value }));
  }

  /** Method 1 — match the typed text against the bundled ward list. */
  function updatePlace(value: string) {
    setPlaceQuery(value);
    const trimmed = value.trim();
    setPlaceHits(trimmed.length >= 2 ? searchZanzibarAreas(trimmed) : []);
    setPlaceSearched(trimmed.length >= 2);
  }

  /** A chosen ward replaces whatever fix was there — text and GPS are equal. */
  function pickPlace(area: ZanzibarArea) {
    setGeo({ latitude: area.latitude, longitude: area.longitude, location_accuracy: null });
    setGeoError(null);
    setFieldErrors((current) => {
      if (!("latitude" in current)) return current;
      const next = { ...current };
      delete next.latitude;
      return next;
    });
    setPlaceQuery("");
    setPlaceHits([]);
    setPlaceSearched(false);
    notify("success", t("doctor.practiceLocationSet", { name: area.name, district: area.district }));
  }

  function clearPlace() {
    setGeo({ latitude: null, longitude: null, location_accuracy: null });
    setPlaceQuery("");
    setPlaceHits([]);
    setPlaceSearched(false);
  }

  /** Grab a fresh fix for the practice location (saved with the card). */
  async function captureLocation() {
    setGeoError(null);
    setGeoBusy(true);
    try {
      const fix = await captureFix();
      setGeo({ latitude: fix.latitude, longitude: fix.longitude, location_accuracy: fix.accuracy });
    } catch (reason) {
      setGeoError(reason instanceof LocationError ? reason.message : t("doctor.couldNotReadLocation"));
    } finally {
      setGeoBusy(false);
    }
  }

  async function onSave(event: FormEvent) {
    event.preventDefault();
    setFieldErrors({});
    // A card without coordinates can never be booked — assertBookingLocation
    // refuses it — so say so here instead of letting the API discover it.
    if (geo.latitude === null || geo.longitude === null) {
      setFieldErrors({ latitude: t("doctor.setLocationBeforeSaving") });
      return;
    }
    setSaving(true);
    try {
      const envelope = await updateMyDoctorProfile({
        first_name: form.first_name.trim(),
        last_name: form.last_name.trim(),
        phone: form.phone.trim(),
        specialties: selectedSpecialtyIds,
        experience_years: form.experience_years === "" ? 0 : Number(form.experience_years),
        latitude: geo.latitude ?? null,
        longitude: geo.longitude ?? null,
        location_accuracy: geo.location_accuracy ?? null,
      });
      setProfile(envelope.data);
      notify("success", t("doctor.cardUpdated"));
    } catch (reason) {
      if (reason instanceof ApiError) {
        setFieldErrors(
          Object.fromEntries(
            Object.entries(reason.errors).map(([field, messages]) => [field, messages[0] ?? t("doctor.invalidValue")])
          )
        );
      } else {
        notify("error", message(reason));
      }
    } finally {
      setSaving(false);
    }
  }

  async function onPhoto(file: File) {
    if (!file.type.startsWith("image/")) {
      notify("error", t("doctor.selectImage"));
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      notify("error", t("doctor.imageTooLarge"));
      return;
    }
    setUploading(true);
    try {
      const envelope = await uploadProfileImage(file);
      setUser(envelope.data);
      load();
      notify("success", t("doctor.photoUpdated"));
    } catch (reason) {
      notify("error", message(reason));
    } finally {
      setUploading(false);
    }
  }

  if (error) return <div className="page"><ErrorState message={error} onRetry={load} /></div>;
  if (!profile) return <div className="page"><Skeleton lines={6} /></div>;
  return (
    <div className="page">
      <Link to="/doctor/dashboard"><ArrowLeft size={16} /> {t("nav.dashboard")}</Link>
      <h1 className="page__title">{t("doctor.myCard")}</h1>
      <p className="page__subtitle">{t("doctor.cardSubtitle")}</p>
      {/* First-login setup routed this doctor here to complete step 4 — hand
          control back when the card is saved (and never leave them stranded:
          the guard only allows this page until setup is finished). */}
      {user && doctorOnboardingIncomplete(user) && (
        <p className="onboarding__return">
          <Link to="/doctor/onboarding" className="btn btn--secondary">
            {t("doctor.backToSetup")}
          </Link>
        </p>
      )}
      <div className="doctor-card-preview-wrap"><DoctorCardPreview profile={profile} /></div>
      <Card>
        <h2 className="card__title">{t("doctor.editCard")}</h2>
        <form className="form" onSubmit={onSave} noValidate>
          <div className="form__row">
            <TextField id="doc-first" label={t("profile.firstName")} value={form.first_name} error={fieldErrors.first_name} onChange={(e) => update("first_name", e.target.value)} />
            <TextField id="doc-last" label={t("profile.lastName")} value={form.last_name} error={fieldErrors.last_name} onChange={(e) => update("last_name", e.target.value)} />
          </div>
          <div className="form__row">
            <TextField id="doc-exp" label={t("doctor.experienceYears")} type="number" min="0" value={form.experience_years} error={fieldErrors.experience_years} onChange={(e) => update("experience_years", e.target.value)} />
          </div>
          <p className="field__hint">
            {t("doctor.feesSetByAdmin", { defaultValue: "Service fees are set by an administrator and appear on your card automatically." })}
          </p>
          {/* Real practice location — patients use it for "near me" and for
              directions, and the booking gate refuses without it. Two ways in:
              type an area, or take a fresh GPS fix. */}
          <div className="field">
            <span className="field__label">{t("doctor.practiceLocation")}</span>
            <p className="page__subtitle">
              {t("doctor.practiceLocationDesc")}
            </p>

            {/* Method 1 — typed text, matched against the bundled ward list, so
                nothing is sent anywhere and the answer is a real coordinate
                pair rather than free text. */}
            <label className="field__label" htmlFor="doc-place">{t("doctor.searchArea")}</label>
            <div className="location-search">
              <input
                id="doc-place"
                className="field__input"
                value={placeQuery}
                placeholder={t("doctor.areaPlaceholder")}
                autoComplete="off"
                onChange={(event) => updatePlace(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    updatePlace(placeQuery);
                  }
                }}
              />
              <Button type="button" variant="secondary" onClick={() => updatePlace(placeQuery)}>
                <Search size={14} /> {t("doctor.find")}
              </Button>
            </div>
            {placeSearched && placeHits.length === 0 && (
              <p className="field__hint" role="status">
                {t("doctor.noAreaMatches", { query: placeQuery.trim() })}
              </p>
            )}
            {placeHits.length > 0 && (
              <ul className="location-search__results" aria-label={t("doctor.matchingAreas")}>
                {placeHits.map((area) => (
                  <li key={`${area.region}-${area.district}-${area.name}`}>
                    <button
                      type="button"
                      className="location-search__hit"
                      onClick={() => pickPlace(area)}
                    >
                      <MapPin size={14} aria-hidden="true" />
                      <span>
                        <b>{area.name}</b>
                        <small>{area.district} · {area.region}</small>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}

            {/* Method 2 — the device's own position. */}
            <p className="doctor-profile__location">
              <LocationLine
                point={geo}
                accuracy={geo.location_accuracy}
                suffix={geo.latitude !== null ? t("doctor.onYourCard") : undefined}
              />
            </p>
            {geoError && <p className="field__error" role="alert">{geoError}</p>}
            {fieldErrors.latitude && <p className="field__error">{fieldErrors.latitude}</p>}
            <div className="prompt__actions-row">
              <Button
                type="button"
                variant="secondary"
                loading={geoBusy}
                onClick={() => void captureLocation()}
              >
                <Crosshair size={14} />{" "}
                {geo.latitude !== null ? t("doctor.updateFromPosition") : t("doctor.useCurrentLocation")}
              </Button>
              {geo.latitude !== null && (
                <Button type="button" variant="ghost" onClick={clearPlace}>
                  {t("doctor.clear")}
                </Button>
              )}
            </div>
            {!hasLocation && (
              <p className="field__hint">
                {t("doctor.practiceLocationRequired")}
              </p>
            )}
          </div>
          <div className="form__row">
            <TextField id="doc-phone" label={t("doctor.phoneOnCard")} value={form.phone} error={fieldErrors.phone} onChange={(e) => update("phone", e.target.value)} />
          </div>

          {/* Specialty picker — list of all specialties with their meanings */}
          <div className="specialty-picker" role="group" aria-label={t("doctor.yourSpecialties")}>
            <p className="field__label">{t("doctor.yourSpecialties")}</p>
            <p className="page__subtitle">
              {t("doctor.specialtiesDesc")}
            </p>
            <div className="specialty-picker__grid">
              {allSpecialties.length === 0 && <Skeleton lines={3} />}
              {allSpecialties.map((s) => {
                const active = selectedSpecialtyIds.includes(s.id);
                return (
                  <button
                    key={s.id}
                    type="button"
                    className={`specialty-picker__item${active ? " specialty-picker__item--active" : ""}`}
                    aria-pressed={active}
                    onClick={() => toggleSpecialty(s.id)}
                  >
                    <span className="specialty-picker__check" aria-hidden="true">
                      <Check size={12} />
                    </span>
                    <span className="specialty-picker__name">{s.name}</span>
                    {s.patient_friendly_name && (
                      <span className="specialty-picker__friendly">{s.patient_friendly_name}</span>
                    )}
                    {s.description && <span className="specialty-picker__desc">{s.description}</span>}
                  </button>
                );
              })}
            </div>
            {fieldErrors.specialties && <p className="field__error">{fieldErrors.specialties}</p>}
          </div>

          <Button type="submit" loading={saving} disabled={!hasLocation}>{t("doctor.saveChanges")}</Button>
        </form>
      </Card>
      <Card>
        <h2 className="card__title">{t("doctor.cardPhoto")}</h2>
        <p className="page__subtitle">{t("doctor.cardPhotoDesc")}</p>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          className="sr-only"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void onPhoto(file);
            e.target.value = "";
          }}
        />
        <Button variant="secondary" loading={uploading} onClick={() => fileInputRef.current?.click()}>
          {t("doctor.uploadPhoto")}
        </Button>
      </Card>
    </div>
  );
}

const WEEKDAY_INDEXES = [0, 1, 2, 3, 4, 5, 6];

function hhmm(value: string): string {
  return value ? value.slice(0, 5) : "";
}

export function DoctorAvailabilityScreen() {
  const { t } = useTranslation();
  const { notify } = useToast();
  const [schedule, setSchedule] = useState<ScheduleItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState<number | "new" | null>(null);
  const [newStart, setNewStart] = useState("09:00");
  const [newEnd, setNewEnd] = useState("17:00");
  const [editTimes, setEditTimes] = useState<Record<number, { start: string; end: string }>>({});
  const [savingTimeId, setSavingTimeId] = useState<number | null>(null);

  const [selectedWindowId, setSelectedWindowId] = useState<number | null>(null);
  const [breaks, setBreaks] = useState<AvailabilityBreak[]>([]);
  const [breaksLoading, setBreaksLoading] = useState(false);
  const [breakForm, setBreakForm] = useState({ start_time: "12:00", end_time: "13:00" });
  const [savingBreak, setSavingBreak] = useState(false);

  const [exceptions, setExceptions] = useState<ScheduleException[]>([]);
  const [exceptionsLoading, setExceptionsLoading] = useState(false);
  const [exceptionForm, setExceptionForm] = useState({
    date: "",
    start_time: "",
    end_time: "",
    reason: "",
  });
  const [savingException, setSavingException] = useState(false);

  const load = useCallback(() => {
    setError(null);
    getMySchedule()
      .then((response) => setSchedule(response.data))
      .catch((reason: unknown) => setError(message(reason)));
    setExceptionsLoading(true);
    listScheduleExceptions()
      .then((response) => setExceptions(response.data ?? []))
      .catch(() => setExceptions([]))
      .finally(() => setExceptionsLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (selectedWindowId === null) {
      setBreaks([]);
      return;
    }
    setBreaksLoading(true);
    listAvailabilityBreaks(selectedWindowId)
      .then((response) => setBreaks(response.data ?? []))
      .catch(() => setBreaks([]))
      .finally(() => setBreaksLoading(false));
  }, [selectedWindowId]);

  const activeWeekdays = new Set((schedule ?? []).filter((s) => s.is_active).map((s) => s.weekday));

  async function toggleWeekday(weekdayIndex: number) {
    setError(null);
    const existing = schedule?.find((s) => s.weekday === weekdayIndex && s.is_active);
    if (existing) {
      setSaving(weekdayIndex);
      try {
        await deleteScheduleItem(existing.id);
        if (selectedWindowId === existing.id) setSelectedWindowId(null);
        notify("success", t("doctor.weekdayRemoved", { day: weekdayName(weekdayIndex) }));
        load();
      } catch (reason) {
        setError(message(reason));
      } finally {
        setSaving(null);
      }
    } else {
      if (!newStart || !newEnd || newEnd <= newStart) {
        setError(t("doctor.invalidTimeRange"));
        return;
      }
      setSaving(weekdayIndex);
      try {
        await createScheduleItem({
          weekday: weekdayIndex,
          start_time: newStart,
          end_time: newEnd,
          slot_duration_minutes: 30,
          is_active: true,
        });
        notify("success", t("doctor.weekdayAdded", { day: weekdayName(weekdayIndex) }));
        load();
      } catch (reason) {
        setError(message(reason));
      } finally {
        setSaving(null);
      }
    }
  }

  async function saveWindowTimes(item: ScheduleItem) {
    const draft = editTimes[item.id];
    if (!draft) return;
    if (!draft.start || !draft.end || draft.end <= draft.start) {
      setError(t("doctor.endAfterStart"));
      return;
    }
    setError(null);
    setSavingTimeId(item.id);
    try {
      await updateScheduleItem(item.id, { start_time: draft.start, end_time: draft.end });
      notify("success", t("doctor.hoursUpdated", { day: weekdayName(item.weekday) }));
      setEditTimes((prev) => {
        const next = { ...prev };
        delete next[item.id];
        return next;
      });
      load();
    } catch (reason) {
      setError(message(reason));
    } finally {
      setSavingTimeId(null);
    }
  }

  async function addBreak() {
    if (selectedWindowId === null) return;
    if (!breakForm.start_time || !breakForm.end_time || breakForm.end_time <= breakForm.start_time) {
      setError(t("doctor.breakEndAfterStart"));
      return;
    }
    setError(null);
    setSavingBreak(true);
    try {
      await createAvailabilityBreak(selectedWindowId, breakForm);
      notify("success", t("doctor.breakAdded"));
      const response = await listAvailabilityBreaks(selectedWindowId);
      setBreaks(response.data ?? []);
      setBreakForm({ start_time: "12:00", end_time: "13:00" });
    } catch (reason) {
      setError(message(reason));
    } finally {
      setSavingBreak(false);
    }
  }

  async function removeBreak(id: number) {
    if (selectedWindowId === null) return;
    try {
      await deleteAvailabilityBreak(id);
      setBreaks((prev) => prev.filter((b) => b.id !== id));
      notify("success", t("doctor.breakRemoved"));
    } catch (reason) {
      setError(message(reason));
    }
  }

  async function addException() {
    if (!exceptionForm.date || !exceptionForm.reason.trim()) {
      setError(t("doctor.exceptionNeeds"));
      return;
    }
    const hasStart = Boolean(exceptionForm.start_time);
    const hasEnd = Boolean(exceptionForm.end_time);
    if (hasStart !== hasEnd || (hasStart && hasEnd && exceptionForm.end_time <= exceptionForm.start_time)) {
      setError(t("doctor.exceptionTimes"));
      return;
    }
    setError(null);
    setSavingException(true);
    try {
      await createScheduleException({
        date: exceptionForm.date,
        start_time: hasStart ? exceptionForm.start_time : null,
        end_time: hasEnd ? exceptionForm.end_time : null,
        reason: exceptionForm.reason.trim(),
      });
      notify("success", t("doctor.exceptionAdded"));
      setExceptionForm({ date: "", start_time: "", end_time: "", reason: "" });
      const response = await listScheduleExceptions();
      setExceptions(response.data ?? []);
    } catch (reason) {
      setError(message(reason));
    } finally {
      setSavingException(false);
    }
  }

  async function removeException(id: number) {
    try {
      await deleteScheduleException(id);
      setExceptions((prev) => prev.filter((e) => e.id !== id));
      notify("success", t("doctor.exceptionRemoved"));
    } catch (reason) {
      setError(message(reason));
    }
  }

  return (
    <div className="page">
      <Link to="/doctor/dashboard"><ArrowLeft size={16} /> {t("nav.dashboard")}</Link>
      <h1 className="page__title">{t("nav.availability")}</h1>
      <p className="page__subtitle">{t("doctor.availabilitySubtitle")}</p>

      {error && <ErrorState message={error} onRetry={load} />}

      <Card>
        <h2>{t("doctor.whichDays")}</h2>
        <p className="page__subtitle">{t("doctor.setHours")}</p>
        <div className="avail-default-times">
          <label className="field__label" htmlFor="avail-default-start">{t("doctor.defaultStart")}</label>
          <input
            id="avail-default-start"
            className="field__input"
            type="time"
            value={newStart}
            onChange={(e) => setNewStart(e.target.value)}
          />
          <label className="field__label" htmlFor="avail-default-end">{t("doctor.defaultEnd")}</label>
          <input
            id="avail-default-end"
            className="field__input"
            type="time"
            value={newEnd}
            onChange={(e) => setNewEnd(e.target.value)}
          />
        </div>
        <div className="avail-days-grid">
          {WEEKDAY_INDEXES.map((index) => {
            const day = weekdayName(index);
            const isActive = activeWeekdays.has(index);
            const isLoading = saving === index;
            const item = schedule?.find((s) => s.weekday === index && s.is_active);
            return (
              <button
                key={index}
                type="button"
                className={`avail-day-card${isActive ? " avail-day-card--active" : ""}`}
                onClick={() => toggleWeekday(index)}
                disabled={saving !== null}
              >
                <span className="avail-day-card__name">{day}</span>
                <span className="avail-day-card__time">
                  {item ? `${hhmm(item.start_time)} – ${hhmm(item.end_time)}` : `${newStart} – ${newEnd}`}
                </span>
                {isActive && <span className="avail-day-card__badge">{t("doctor.active")}</span>}
                {isLoading && <span className="avail-day-card__loading">{t("doctor.saving")}</span>}
              </button>
            );
          })}
        </div>
      </Card>

      <Card>
        <h2>{t("doctor.weeklySchedule")}</h2>
        {schedule === null ? (
          <Skeleton lines={4} />
        ) : schedule.length === 0 ? (
          <EmptyState title={t("doctor.noAvailabilitySet")} description={t("doctor.noAvailabilitySetDesc")} />
        ) : (
          <ul className="avail-schedule-list">
            {schedule.map((item) => {
              const draft = editTimes[item.id] ?? { start: hhmm(item.start_time), end: hhmm(item.end_time) };
              const isEditing = item.id in editTimes;
              return (
                <li key={item.id} className="avail-schedule-item avail-schedule-item--edit">
                  <span className="avail-schedule-item__day">{weekdayName(item.weekday)}</span>
                  {isEditing ? (
                    <>
                      <input
                        className="field__input avail-time-input"
                        type="time"
                        aria-label={t("doctor.weekdayStart", { day: weekdayName(item.weekday) })}
                        value={draft.start}
                        onChange={(e) =>
                          setEditTimes((prev) => ({ ...prev, [item.id]: { ...draft, start: e.target.value } }))
                        }
                      />
                      <span>–</span>
                      <input
                        className="field__input avail-time-input"
                        type="time"
                        aria-label={t("doctor.weekdayEnd", { day: weekdayName(item.weekday) })}
                        value={draft.end}
                        onChange={(e) =>
                          setEditTimes((prev) => ({ ...prev, [item.id]: { ...draft, end: e.target.value } }))
                        }
                      />
                      <Button
                        variant="primary"
                        loading={savingTimeId === item.id}
                        onClick={() => saveWindowTimes(item)}
                      >
                        {t("common.save")}
                      </Button>
                      <Button
                        variant="ghost"
                        onClick={() =>
                          setEditTimes((prev) => {
                            const next = { ...prev };
                            delete next[item.id];
                            return next;
                          })
                        }
                      >
                        {t("common.cancel")}
                      </Button>
                    </>
                  ) : (
                    <>
                      <span className="avail-schedule-item__time">
                        {hhmm(item.start_time)} – {hhmm(item.end_time)}
                      </span>
                      <Button
                        variant="ghost"
                        onClick={() =>
                          setEditTimes((prev) => ({
                            ...prev,
                            [item.id]: { start: hhmm(item.start_time), end: hhmm(item.end_time) },
                          }))
                        }
                      >
                        {t("doctor.editHours")}
                      </Button>
                      <Button
                        variant={selectedWindowId === item.id ? "secondary" : "ghost"}
                        onClick={() => setSelectedWindowId(selectedWindowId === item.id ? null : item.id)}
                      >
                        <Clock size={14} /> {t("doctor.breaks")}
                      </Button>
                      <Button variant="ghost" onClick={() => toggleWeekday(item.weekday)} disabled={saving !== null}>
                        {t("doctor.remove")}
                      </Button>
                    </>
                  )}
                  {selectedWindowId === item.id && (
                    <div className="avail-breaks-panel">
                      <h3>{t("doctor.breaksOn", { day: weekdayName(item.weekday) })}</h3>
                      {breaksLoading ? (
                        <Skeleton lines={2} />
                      ) : breaks.length === 0 ? (
                        <p className="page__subtitle">{t("doctor.noBreaks")}</p>
                      ) : (
                        <ul className="avail-break-list">
                          {breaks.map((b) => (
                            <li key={b.id}>
                              {hhmm(b.start_time)} – {hhmm(b.end_time)}
                              <Button variant="ghost" onClick={() => removeBreak(b.id)}>
                                <Trash2 size={13} />
                              </Button>
                            </li>
                          ))}
                        </ul>
                      )}
                      <div className="avail-break-form">
                        <input
                          className="field__input avail-time-input"
                          type="time"
                          aria-label={t("doctor.breakStart")}
                          value={breakForm.start_time}
                          onChange={(e) => setBreakForm((f) => ({ ...f, start_time: e.target.value }))}
                        />
                        <span>–</span>
                        <input
                          className="field__input avail-time-input"
                          type="time"
                          aria-label={t("doctor.breakEnd")}
                          value={breakForm.end_time}
                          onChange={(e) => setBreakForm((f) => ({ ...f, end_time: e.target.value }))}
                        />
                        <Button variant="secondary" loading={savingBreak} onClick={addBreak}>
                          <Plus size={14} /> {t("doctor.addBreak")}
                        </Button>
                      </div>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      <Card>
        <h2>{t("doctor.timeOff")}</h2>
        <p className="page__subtitle">{t("doctor.timeOffDesc")}</p>
        <div className="avail-exception-form">
          <input
            className="field__input"
            type="date"
            aria-label={t("doctor.timeOffDate")}
            value={exceptionForm.date}
            onChange={(e) => setExceptionForm((f) => ({ ...f, date: e.target.value }))}
          />
          <input
            className="field__input"
            type="time"
            aria-label={t("doctor.timeOffStart")}
            value={exceptionForm.start_time}
            onChange={(e) => setExceptionForm((f) => ({ ...f, start_time: e.target.value }))}
          />
          <input
            className="field__input"
            type="time"
            aria-label={t("doctor.timeOffEnd")}
            value={exceptionForm.end_time}
            onChange={(e) => setExceptionForm((f) => ({ ...f, end_time: e.target.value }))}
          />
          <input
            className="field__input"
            type="text"
            placeholder={t("doctor.timeOffReasonPlaceholder")}
            aria-label={t("doctor.timeOffReason")}
            value={exceptionForm.reason}
            onChange={(e) => setExceptionForm((f) => ({ ...f, reason: e.target.value }))}
          />
          <Button variant="primary" loading={savingException} onClick={addException}>
            <Plus size={14} /> {t("doctor.add")}
          </Button>
        </div>
        {exceptionsLoading ? (
          <Skeleton lines={2} />
        ) : exceptions.length === 0 ? (
          <EmptyState title={t("doctor.noTimeOff")} description={t("doctor.noTimeOffDesc")} />
        ) : (
          <ul className="avail-exception-list">
            {exceptions.map((ex) => (
              <li key={ex.id}>
                <span className="avail-exception-date">{ex.date}</span>
                <span className="avail-exception-times">
                  {ex.start_time && ex.end_time ? `${hhmm(ex.start_time)} – ${hhmm(ex.end_time)}` : t("doctor.fullDay")}
                </span>
                <span className="avail-exception-reason">{ex.reason}</span>
                <Button variant="ghost" onClick={() => removeException(ex.id)}>
                  <Trash2 size={13} />
                </Button>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
