import { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
  createScheduleItem,
  deleteScheduleItem,
  getDoctor,
  getDoctorAvailability,
  getMyDoctorProfile,
  getMySchedule,
} from "../api/doctors";
import { getDoctorReviews } from "../api/reviews";
import type { DoctorAvailability, DoctorProfile, Review, ScheduleItem } from "../api/types";
import { Button, Card, EmptyState, ErrorState, Skeleton } from "../components/ui";
import { DoctorReviewList, StarRating } from "../components/reviews";

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
      <Link to="/doctors">← Back to doctors</Link>
      <Card>
        <h1 className="page__title">{doctor.first_name} {doctor.last_name}</h1>
        <p>{doctor.qualifications || "Professional profile"}</p>
        <p>{doctor.experience_years} years of experience</p>
        <p>Consultation fee: {doctor.consultation_fee}</p>
        {doctor.average_rating != null && doctor.average_rating > 0 && (
          <div className="doctor-profile__rating">
            <StarRating value={doctor.average_rating} readonly size="sm" />
            <span>{doctor.average_rating.toFixed(1)} ({doctor.total_reviews} review{doctor.total_reviews !== 1 ? "s" : ""})</span>
          </div>
        )}
        {doctor.bio && <p>{doctor.bio}</p>}
        <div style={{ marginTop: "var(--space-4)" }}>
          <Link to={`/booking/${id}`}><Button>Book appointment</Button></Link>
        </div>
      </Card>
      <Card>
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
      <Card>
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
  return <div className="page"><h1 className="page__title">Doctor dashboard</h1>{error && <ErrorState message={error} />}{!profile ? <Skeleton lines={4} /> : <Card><h2>Dr. {profile.first_name} {profile.last_name}</h2><p>{profile.qualifications || "Complete your professional profile."}</p><p><Link to="/doctor/availability">Manage availability</Link></p></Card>}</div>;
}

const WEEKDAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

export function DoctorAvailabilityScreen() {
  const [schedule, setSchedule] = useState<ScheduleItem[] | null>(null);
  const [weekday, setWeekday] = useState("0");
  const [startTime, setStartTime] = useState("09:00");
  const [endTime, setEndTime] = useState("17:00");
  const [duration, setDuration] = useState("30");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const load = useCallback(() => { setError(null); getMySchedule().then((response) => setSchedule(response.data)).catch((reason: unknown) => setError(message(reason))); }, []);
  useEffect(() => { load(); }, [load]);
  async function addWindow(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setSaving(true); setError(null);
    try { await createScheduleItem({ weekday: Number(weekday), start_time: startTime, end_time: endTime, slot_duration_minutes: Number(duration), is_active: true }); load(); }
    catch (reason) { setError(message(reason)); } finally { setSaving(false); }
  }
  async function removeWindow(id: number) {
    setError(null); try { await deleteScheduleItem(id); load(); } catch (reason) { setError(message(reason)); }
  }
  return <div className="page"><h1 className="page__title">Availability</h1><p className="page__subtitle">Set recurring working hours. Breaks and one-off closures are enforced by the scheduling API.</p>{error && <ErrorState message={error} onRetry={load} />}<Card><form className="form" onSubmit={addWindow}><div className="field"><label className="field__label" htmlFor="weekday">Day</label><select id="weekday" className="field__input" value={weekday} onChange={(event) => setWeekday(event.target.value)}>{WEEKDAYS.map((day, index) => <option key={day} value={index}>{day}</option>)}</select></div><div className="form__row"><div className="field"><label className="field__label" htmlFor="start">Start</label><input id="start" className="field__input" type="time" value={startTime} onChange={(event) => setStartTime(event.target.value)} /></div><div className="field"><label className="field__label" htmlFor="end">End</label><input id="end" className="field__input" type="time" value={endTime} onChange={(event) => setEndTime(event.target.value)} /></div></div><div className="field"><label className="field__label" htmlFor="duration">Appointment duration (minutes)</label><input id="duration" className="field__input" type="number" min="5" value={duration} onChange={(event) => setDuration(event.target.value)} /></div><Button type="submit" loading={saving}>Add availability</Button></form></Card><Card><h2>Your weekly schedule</h2>{schedule === null ? <Skeleton lines={4} /> : schedule.length === 0 ? <EmptyState title="No availability set" description="Add a working window to begin receiving appointments." /> : <ul>{schedule.map((item) => <li key={item.id}>{WEEKDAYS[item.weekday]}: {item.start_time.slice(0, 5)} – {item.end_time.slice(0, 5)} ({item.slot_duration_minutes} min) <Button variant="ghost" onClick={() => removeWindow(item.id)}>Remove</Button></li>)}</ul>}</Card></div>;
}
