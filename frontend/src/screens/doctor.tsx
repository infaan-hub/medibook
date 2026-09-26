import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { Link, useParams } from "react-router-dom";
import {
  createScheduleItem,
  deleteScheduleItem,
  getDoctor,
  getDoctorAvailability,
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
import { getDoctorReviews } from "../api/reviews";
import { listSpecialties } from "../api/specialties";
import { ApiError } from "../api/client";
import type {
  AvailabilityBreak,
  DoctorAvailability,
  DoctorProfile,
  Review,
  ScheduleException,
  ScheduleItem,
  Specialty,
} from "../api/types";
import { Button, Card, EmptyState, ErrorState, Skeleton, TextField } from "../components/ui";
import { DoctorReviewList } from "../components/reviews";
import { useSession, useToast } from "../state/app-context";
import { ArrowLeft, Clock, BadgeIndianRupee, MapPin, Check, Phone, Plus, Trash2 } from "lucide-react";

function message(error: unknown): string {
  return error instanceof Error ? error.message : "Something went wrong. Please try again.";
}

/** Meaning of a specialty for patients: friendly name, falling back to medical name. */
function specialtyMeaning(s: Specialty): string {
  return s.patient_friendly_name || s.name;
}

export function DoctorProfileScreen() {
  const { id } = useParams<{ id: string }>();
  const [doctor, setDoctor] = useState<DoctorProfile | null>(null);
  const [availability, setAvailability] = useState<DoctorAvailability | null>(null);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    if (!id) return;
    setError(null);
    getDoctor(Number(id)).then((response) => setDoctor(response.data)).catch((reason: unknown) => setError(message(reason)));
    getDoctorReviews(Number(id)).then((response) => setReviews(response.data)).catch(() => {});
  }, [id]);
  useEffect(() => { load(); }, [load]);

  function loadSlots() {
    if (!id) return;
    setError(null);
    getDoctorAvailability(Number(id), date).then((response) => setAvailability(response.data)).catch((reason: unknown) => setError(message(reason)));
  }

  if (error) return <div className="page"><ErrorState message={error} onRetry={load} /></div>;
  if (!doctor) return <div className="page"><Skeleton lines={6} /></div>;
  return (
    <div className="page">
      <Link to="/doctors"><ArrowLeft size={16} /> Back to doctors</Link>
      <Card className="card--fit">
        {doctor.profile_image && (
          <img
            src={doctor.profile_image}
            alt={`${doctor.first_name} ${doctor.last_name}`}
            className="doctor-profile__photo"
            loading="lazy"
          />
        )}
        <h1 className="page__title">{doctor.first_name} {doctor.last_name}</h1>
        {(doctor.office_address || doctor.city) && (
          <p className="doctor-profile__location">
            <MapPin size={14} /> {doctor.office_address || doctor.city}
          </p>
        )}
        {doctor.phone && (
          <p className="doctor-profile__phone">
            <Phone size={14} /> <a href={`tel:${doctor.phone}`}>{doctor.phone}</a>
          </p>
        )}
        {doctor.specialties && doctor.specialties.length > 0 ? (
          <p>
            <strong>{doctor.specialties[0].name}</strong>
            {doctor.specialties[0].patient_friendly_name
              ? ` — ${doctor.specialties[0].patient_friendly_name}`
              : ""}
          </p>
        ) : (
          <p>Professional profile</p>
        )}
        <p>{doctor.experience_years} years of experience</p>
        <p>Consultation fee: TSh {doctor.consultation_fee}</p>

        {/* All selected specialties with their meanings for patients */}
        {doctor.specialties && doctor.specialties.length > 0 && (
          <div className="doctor-specialties">
            <h3>Specialties</h3>
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
        <div style={{ marginTop: "var(--space-4)" }}>
          <Link to={`/booking/${id}`}><Button>Book appointment</Button></Link>
        </div>
      </Card>
      <Card className="card--fit">
        <h2>Available slots</h2>
        <div className="field">
          <label className="field__label" htmlFor="availability-date">Date</label>
          <input id="availability-date" className="field__input" type="date" value={date} onChange={(event) => setDate(event.target.value)} />
        </div>
        <Button onClick={loadSlots}>Check availability</Button>
        {availability && (availability.slots.length ? (
          <ul>{availability.slots.map((slot) => <li key={slot.start_time}>{slot.start_time} – {slot.end_time}</li>)}</ul>
        ) : (
          <EmptyState title="No available slots" description="Try another date." />
        ))}
      </Card>
      <Card className="card--fit">
        <h2>Reviews</h2>
        <DoctorReviewList reviews={reviews} />
      </Card>
    </div>
  );
}

export function DoctorDashboardScreen() {
  const [profile, setProfile] = useState<DoctorProfile | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { getMyDoctorProfile().then((response) => setProfile(response.data)).catch((reason: unknown) => setError(message(reason))); }, []);
  return <div className="page"><h1 className="page__title">Doctor dashboard</h1>{error && <ErrorState message={error} />}{!profile ? <Skeleton lines={4} /> : <Card><h2>Dr. {profile.first_name} {profile.last_name}</h2><p>{profile.specialties && profile.specialties.length > 0 ? specialtyMeaning(profile.specialties[0]) : "Complete your professional profile."}</p><p><Link to="/doctor/availability">Manage availability</Link> · <Link to="/doctor/personal">Edit personal card</Link></p></Card>}</div>;
}

/** Doctor's own card preview block (rendered inside DoctorPersonalScreen). */
function DoctorCardPreview({ profile }: { profile: DoctorProfile }) {
  return (
    <Card className="doc-preview-card">
      <div className="doc-preview-card__photo-wrap">
        <img
          src={profile.profile_image || "/images/splash-screen.jpeg"}
          alt={`Dr. ${profile.first_name} ${profile.last_name}`}
          className="doc-preview-card__photo"
          loading="lazy"
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
            : "Medical specialist"}
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
            <Clock size={14} /> {profile.experience_years ?? 0} yrs exp.
          </span>
          <span className="doc-preview-card__meta-item">
            <BadgeIndianRupee size={14} /> TSh {profile.consultation_fee}
          </span>
          {profile.phone && (
            <span className="doc-preview-card__meta-item">
              <Phone size={13} /> <a href={`tel:${profile.phone}`}>{profile.phone}</a>
            </span>
          )}
        </div>
        {(profile.office_address || profile.city) && (
          <p className="doc-preview-card__location">
            <MapPin size={13} /> <span>{profile.office_address || profile.city}</span>
          </p>
        )}
      </div>
    </Card>
  );
}

/**
 * /doctor/personal — the doctor sees the same card patients see,
 * plus editing for name, experience, fee and card photo.
 */
export function DoctorPersonalScreen() {
  const { setUser } = useSession();
  const { notify } = useToast();
  const [profile, setProfile] = useState<DoctorProfile | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({ first_name: "", last_name: "", experience_years: "", consultation_fee: "", city: "", office_address: "", phone: "" });
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
          consultation_fee: response.data.consultation_fee?.toString() ?? "",
          city: response.data.city ?? "",
          office_address: response.data.office_address ?? "",
          phone: response.data.phone ?? "",
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

  async function onSave(event: FormEvent) {
    event.preventDefault();
    setFieldErrors({});
    setSaving(true);
    try {
      const envelope = await updateMyDoctorProfile({
        first_name: form.first_name.trim(),
        last_name: form.last_name.trim(),
        phone: form.phone.trim(),
        specialties: selectedSpecialtyIds,
        experience_years: form.experience_years === "" ? 0 : Number(form.experience_years),
        consultation_fee: form.consultation_fee.trim() === "" ? "0" : form.consultation_fee.trim(),
        city: form.city.trim(),
        office_address: form.office_address.trim(),
      });
      setProfile(envelope.data);
      notify("success", "Your card has been updated.");
    } catch (reason) {
      if (reason instanceof ApiError) {
        setFieldErrors(
          Object.fromEntries(
            Object.entries(reason.errors).map(([field, messages]) => [field, messages[0] ?? "Invalid value."])
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
      notify("error", "Please select an image file.");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      notify("error", "Image must be under 5 MB.");
      return;
    }
    setUploading(true);
    try {
      const envelope = await uploadProfileImage(file);
      setUser(envelope.data);
      load();
      notify("success", "Photo updated — it now appears on your doctor card.");
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
      <Link to="/doctor/dashboard"><ArrowLeft size={16} /> Dashboard</Link>
      <h1 className="page__title">My doctor card</h1>
      <p className="page__subtitle">This is exactly how patients see you on Find a doctor.</p>
      <div className="doctor-card-preview-wrap"><DoctorCardPreview profile={profile} /></div>
      <Card>
        <h2 className="card__title">Edit card details</h2>
        <form className="form" onSubmit={onSave} noValidate>
          <div className="form__row">
            <TextField id="doc-first" label="First name" value={form.first_name} error={fieldErrors.first_name} onChange={(e) => update("first_name", e.target.value)} />
            <TextField id="doc-last" label="Last name" value={form.last_name} error={fieldErrors.last_name} onChange={(e) => update("last_name", e.target.value)} />
          </div>
          <div className="form__row">
            <TextField id="doc-exp" label="Experience (years)" type="number" min="0" value={form.experience_years} error={fieldErrors.experience_years} onChange={(e) => update("experience_years", e.target.value)} />
            <TextField id="doc-fee" label="Consultation fee (TSh)" inputMode="decimal" value={form.consultation_fee} error={fieldErrors.consultation_fee} onChange={(e) => update("consultation_fee", e.target.value)} />
          </div>
          <div className="form__row">
            <TextField id="doc-city" label="City / area (nearby search)" value={form.city} error={fieldErrors.city} onChange={(e) => update("city", e.target.value)} />
            <TextField id="doc-address" label="Office address (shown on your card)" value={form.office_address} error={fieldErrors.office_address} onChange={(e) => update("office_address", e.target.value)} />
          </div>
          <div className="form__row">
            <TextField id="doc-phone" label="Phone number (shown on your card)" value={form.phone} error={fieldErrors.phone} onChange={(e) => update("phone", e.target.value)} />
          </div>

          {/* Specialty picker — list of all specialties with their meanings */}
          <div className="specialty-picker" role="group" aria-label="Your specialties">
            <p className="field__label">Your specialties</p>
            <p className="page__subtitle">
              Select the specialty(ies) you practice. Patients see the top specialty on your
              card instead of qualifications — each entry includes what it means.
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

          <Button type="submit" loading={saving}>Save changes</Button>
        </form>
      </Card>
      <Card>
        <h2 className="card__title">Card photo</h2>
        <p className="page__subtitle">Upload a square photo — it appears on every doctor card.</p>
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
          Upload photo
        </Button>
      </Card>
    </div>
  );
}

const WEEKDAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

function hhmm(value: string): string {
  return value ? value.slice(0, 5) : "";
}

export function DoctorAvailabilityScreen() {
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
        notify("success", `${WEEKDAYS[weekdayIndex]} removed from your schedule.`);
        load();
      } catch (reason) {
        setError(message(reason));
      } finally {
        setSaving(null);
      }
    } else {
      if (!newStart || !newEnd || newEnd <= newStart) {
        setError("Set a valid time range before adding a day (end must be after start).");
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
        notify("success", `${WEEKDAYS[weekdayIndex]} added to your schedule.`);
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
      setError("End time must be after start time.");
      return;
    }
    setError(null);
    setSavingTimeId(item.id);
    try {
      await updateScheduleItem(item.id, { start_time: draft.start, end_time: draft.end });
      notify("success", `${WEEKDAYS[item.weekday]} hours updated.`);
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
      setError("Break end time must be after start time.");
      return;
    }
    setError(null);
    setSavingBreak(true);
    try {
      await createAvailabilityBreak(selectedWindowId, breakForm);
      notify("success", "Break added.");
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
      notify("success", "Break removed.");
    } catch (reason) {
      setError(message(reason));
    }
  }

  async function addException() {
    if (!exceptionForm.date || !exceptionForm.reason.trim()) {
      setError("Exception needs a date and a reason.");
      return;
    }
    const hasStart = Boolean(exceptionForm.start_time);
    const hasEnd = Boolean(exceptionForm.end_time);
    if (hasStart !== hasEnd || (hasStart && hasEnd && exceptionForm.end_time <= exceptionForm.start_time)) {
      setError("Provide both start and end times, or neither for a full-day closure.");
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
      notify("success", "Schedule exception added.");
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
      notify("success", "Exception removed.");
    } catch (reason) {
      setError(message(reason));
    }
  }

  return (
    <div className="page">
      <Link to="/doctor/dashboard"><ArrowLeft size={16} /> Dashboard</Link>
      <h1 className="page__title">Availability</h1>
      <p className="page__subtitle">Select the days you are available. Patients will be able to book appointments on these days.</p>

      {error && <ErrorState message={error} onRetry={load} />}

      <Card>
        <h2>Which days are you available?</h2>
        <p className="page__subtitle">Set hours for new days, then toggle a day to add or remove it.</p>
        <div className="avail-default-times">
          <label className="field__label" htmlFor="avail-default-start">Default start</label>
          <input
            id="avail-default-start"
            className="field__input"
            type="time"
            value={newStart}
            onChange={(e) => setNewStart(e.target.value)}
          />
          <label className="field__label" htmlFor="avail-default-end">Default end</label>
          <input
            id="avail-default-end"
            className="field__input"
            type="time"
            value={newEnd}
            onChange={(e) => setNewEnd(e.target.value)}
          />
        </div>
        <div className="avail-days-grid">
          {WEEKDAYS.map((day, index) => {
            const isActive = activeWeekdays.has(index);
            const isLoading = saving === index;
            const item = schedule?.find((s) => s.weekday === index && s.is_active);
            return (
              <button
                key={day}
                type="button"
                className={`avail-day-card${isActive ? " avail-day-card--active" : ""}`}
                onClick={() => toggleWeekday(index)}
                disabled={saving !== null}
              >
                <span className="avail-day-card__name">{day}</span>
                <span className="avail-day-card__time">
                  {item ? `${hhmm(item.start_time)} – ${hhmm(item.end_time)}` : `${newStart} – ${newEnd}`}
                </span>
                {isActive && <span className="avail-day-card__badge">Active</span>}
                {isLoading && <span className="avail-day-card__loading">Saving…</span>}
              </button>
            );
          })}
        </div>
      </Card>

      <Card>
        <h2>Your weekly schedule</h2>
        {schedule === null ? (
          <Skeleton lines={4} />
        ) : schedule.length === 0 ? (
          <EmptyState title="No availability set" description="Toggle the days above to start receiving appointments." />
        ) : (
          <ul className="avail-schedule-list">
            {schedule.map((item) => {
              const draft = editTimes[item.id] ?? { start: hhmm(item.start_time), end: hhmm(item.end_time) };
              const isEditing = item.id in editTimes;
              return (
                <li key={item.id} className="avail-schedule-item avail-schedule-item--edit">
                  <span className="avail-schedule-item__day">{WEEKDAYS[item.weekday]}</span>
                  {isEditing ? (
                    <>
                      <input
                        className="field__input avail-time-input"
                        type="time"
                        aria-label={`${WEEKDAYS[item.weekday]} start`}
                        value={draft.start}
                        onChange={(e) =>
                          setEditTimes((prev) => ({ ...prev, [item.id]: { ...draft, start: e.target.value } }))
                        }
                      />
                      <span>–</span>
                      <input
                        className="field__input avail-time-input"
                        type="time"
                        aria-label={`${WEEKDAYS[item.weekday]} end`}
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
                        Save
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
                        Cancel
                      </Button>
                    </>
                  ) : (
                    <>
                      <span className="avail-schedule-item__time">
                        {hhmm(item.start_time)} – {hhmm(item.end_time)}
                      </span>
                      <span className="avail-schedule-item__slots">{item.slot_duration_minutes ?? 30} min slots</span>
                      <Button
                        variant="ghost"
                        onClick={() =>
                          setEditTimes((prev) => ({
                            ...prev,
                            [item.id]: { start: hhmm(item.start_time), end: hhmm(item.end_time) },
                          }))
                        }
                      >
                        Edit hours
                      </Button>
                      <Button
                        variant={selectedWindowId === item.id ? "secondary" : "ghost"}
                        onClick={() => setSelectedWindowId(selectedWindowId === item.id ? null : item.id)}
                      >
                        <Clock size={14} /> Breaks
                      </Button>
                      <Button variant="ghost" onClick={() => toggleWeekday(item.weekday)} disabled={saving !== null}>
                        Remove
                      </Button>
                    </>
                  )}
                  {selectedWindowId === item.id && (
                    <div className="avail-breaks-panel">
                      <h3>Breaks on {WEEKDAYS[item.weekday]}</h3>
                      {breaksLoading ? (
                        <Skeleton lines={2} />
                      ) : breaks.length === 0 ? (
                        <p className="page__subtitle">No breaks yet.</p>
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
                          aria-label="Break start"
                          value={breakForm.start_time}
                          onChange={(e) => setBreakForm((f) => ({ ...f, start_time: e.target.value }))}
                        />
                        <span>–</span>
                        <input
                          className="field__input avail-time-input"
                          type="time"
                          aria-label="Break end"
                          value={breakForm.end_time}
                          onChange={(e) => setBreakForm((f) => ({ ...f, end_time: e.target.value }))}
                        />
                        <Button variant="secondary" loading={savingBreak} onClick={addBreak}>
                          <Plus size={14} /> Add break
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
        <h2>Time off (exceptions)</h2>
        <p className="page__subtitle">Full-day or partial closures — holidays, travel, conferences.</p>
        <div className="avail-exception-form">
          <input
            className="field__input"
            type="date"
            aria-label="Exception date"
            value={exceptionForm.date}
            onChange={(e) => setExceptionForm((f) => ({ ...f, date: e.target.value }))}
          />
          <input
            className="field__input"
            type="time"
            aria-label="Exception start (optional)"
            value={exceptionForm.start_time}
            onChange={(e) => setExceptionForm((f) => ({ ...f, start_time: e.target.value }))}
          />
          <input
            className="field__input"
            type="time"
            aria-label="Exception end (optional)"
            value={exceptionForm.end_time}
            onChange={(e) => setExceptionForm((f) => ({ ...f, end_time: e.target.value }))}
          />
          <input
            className="field__input"
            type="text"
            placeholder="Reason (e.g. vacation)"
            aria-label="Exception reason"
            value={exceptionForm.reason}
            onChange={(e) => setExceptionForm((f) => ({ ...f, reason: e.target.value }))}
          />
          <Button variant="primary" loading={savingException} onClick={addException}>
            <Plus size={14} /> Add
          </Button>
        </div>
        {exceptionsLoading ? (
          <Skeleton lines={2} />
        ) : exceptions.length === 0 ? (
          <EmptyState title="No time off" description="You have no schedule exceptions." />
        ) : (
          <ul className="avail-exception-list">
            {exceptions.map((ex) => (
              <li key={ex.id}>
                <span className="avail-exception-date">{ex.date}</span>
                <span className="avail-exception-times">
                  {ex.start_time && ex.end_time ? `${hhmm(ex.start_time)} – ${hhmm(ex.end_time)}` : "Full day"}
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
