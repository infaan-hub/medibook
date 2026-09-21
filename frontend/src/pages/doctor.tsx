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
} from "../api/doctors";
import { uploadProfileImage } from "../api/auth";
import { getDoctorReviews } from "../api/reviews";
import { ApiError } from "../api/client";
import type { DoctorAvailability, DoctorProfile, Review, ScheduleItem } from "../api/types";
import { Button, Card, EmptyState, ErrorState, Skeleton, TextField } from "../components/ui";
import { DoctorReviewList, StarRating, formatRating, ratingNumber } from "../components/reviews";
import { useSession, useToast } from "../state/app-context";
import { ArrowLeft, Clock, BadgeIndianRupee, Star, MapPin } from "lucide-react";

function message(error: unknown): string {
  return error instanceof Error ? error.message : "Something went wrong. Please try again.";
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
        <p>{doctor.qualifications || "Professional profile"}</p>
        <p>{doctor.experience_years} years of experience</p>
        <p>Consultation fee: TSh {doctor.consultation_fee}</p>
        {ratingNumber(doctor.average_rating) > 0 && (
          <div className="doctor-profile__rating">
            <StarRating value={doctor.average_rating} readonly size="sm" />
            <span>{formatRating(doctor.average_rating)} ({doctor.total_reviews} review{doctor.total_reviews !== 1 ? "s" : ""})</span>
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
  return <div className="page"><h1 className="page__title">Doctor dashboard</h1>{error && <ErrorState message={error} />}{!profile ? <Skeleton lines={4} /> : <Card><h2>Dr. {profile.first_name} {profile.last_name}</h2><p>{profile.qualifications || "Complete your professional profile."}</p><p><Link to="/doctor/availability">Manage availability</Link> · <Link to="/doctor/personal">Edit personal card</Link></p></Card>}</div>;
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
        {ratingNumber(profile.average_rating) > 0 && (
          <span className="doc-preview-card__badge">
            <Star size={12} fill="currentColor" /> {formatRating(profile.average_rating)}
          </span>
        )}
      </div>
      <div className="doc-preview-card__body">
        <h2 className="doc-preview-card__name">Dr. {profile.first_name} {profile.last_name}</h2>
        <p className="doc-preview-card__qual">{profile.qualifications || "Medical specialist"}</p>
        <div className="doc-preview-card__meta">
          <span className="doc-preview-card__meta-item">
            <Clock size={14} /> {profile.experience_years ?? 0} yrs exp.
          </span>
          <span className="doc-preview-card__meta-item">
            <BadgeIndianRupee size={14} /> TSh {profile.consultation_fee}
          </span>
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
  const [form, setForm] = useState({ first_name: "", last_name: "", experience_years: "", consultation_fee: "", city: "", office_address: "" });
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
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
        });
      })
      .catch((reason: unknown) => setError(message(reason)));
  }, []);
  useEffect(() => { load(); }, [load]);

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

export function DoctorAvailabilityScreen() {
  const { notify } = useToast();
  const [schedule, setSchedule] = useState<ScheduleItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState<number | null>(null);

  const load = useCallback(() => {
    setError(null);
    getMySchedule()
      .then((response) => setSchedule(response.data))
      .catch((reason: unknown) => setError(message(reason)));
  }, []);

  useEffect(() => { load(); }, [load]);

  const activeWeekdays = new Set((schedule ?? []).filter((s) => s.is_active).map((s) => s.weekday));

  async function toggleWeekday(weekdayIndex: number) {
    setError(null);
    const existing = schedule?.find((s) => s.weekday === weekdayIndex && s.is_active);
    if (existing) {
      setSaving(weekdayIndex);
      try {
        await deleteScheduleItem(existing.id);
        notify("success", `${WEEKDAYS[weekdayIndex]} removed from your schedule.`);
        load();
      } catch (reason) {
        setError(message(reason));
      } finally {
        setSaving(null);
      }
    } else {
      setSaving(weekdayIndex);
      try {
        await createScheduleItem({
          weekday: weekdayIndex,
          start_time: "09:00",
          end_time: "17:00",
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

  return (
    <div className="page">
      <Link to="/doctor/dashboard"><ArrowLeft size={16} /> Dashboard</Link>
      <h1 className="page__title">Availability</h1>
      <p className="page__subtitle">Select the days you are available. Patients will be able to book appointments on these days.</p>

      {error && <ErrorState message={error} onRetry={load} />}

      <Card>
        <h2>Which days are you available?</h2>
        <p className="page__subtitle">Toggle a day to add or remove it from your schedule.</p>
        <div className="avail-days-grid">
          {WEEKDAYS.map((day, index) => {
            const isActive = activeWeekdays.has(index);
            const isLoading = saving === index;
            return (
              <button
                key={day}
                type="button"
                className={`avail-day-card${isActive ? " avail-day-card--active" : ""}`}
                onClick={() => toggleWeekday(index)}
                disabled={saving !== null}
              >
                <span className="avail-day-card__name">{day}</span>
                <span className="avail-day-card__time">09:00 – 17:00</span>
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
            {schedule.map((item) => (
              <li key={item.id} className="avail-schedule-item">
                <span className="avail-schedule-item__day">{WEEKDAYS[item.weekday]}</span>
                <span className="avail-schedule-item__time">{item.start_time.slice(0, 5)} – {item.end_time.slice(0, 5)}</span>
                <span className="avail-schedule-item__slots">{item.slot_duration_minutes} min slots</span>
                <Button variant="ghost" onClick={() => toggleWeekday(item.weekday)} disabled={saving !== null}>
                  Remove
                </Button>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
