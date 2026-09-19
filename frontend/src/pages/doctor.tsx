/**
 * Doctor module pages (PHASE 7 — React).
 *
 * - DoctorProfileScreen  : public doctor detail at /doctors/:id
 * - DoctorDashboardScreen : doctor dashboard at /doctor/dashboard (placeholder)
 * - DoctorAvailabilityScreen : schedule screen at /doctor/availability (placeholder)
 */

import { useEffect, useState, useCallback } from "react";
import { useParams, Link } from "react-router-dom";
import { getDoctor, getDoctorAvailability, getMyDoctorProfile, updateMyDoctorProfile } from "../api/doctors";
import type { DoctorProfile, DoctorAvailability } from "../api/types";
import {
  Badge,
  Button,
  Card,
  EmptyState,
  ErrorState,
  Skeleton,
} from "../components/ui";

interface NavItem {
  to: string;
  label: string;
  icon: string;
}

/* ---- Public doctor detail (professional profile) ---- */

function DoctorProfileScreen() {
  const { id } = useParams<{ id: string }>();
  const [doc, setDoc] = useState<DoctorProfile | null>(null);
  const [availability, setAvailability] = useState<DoctorAvailability | null>(null);
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    if (!id) return;
    setLoading(true);
    setError(null);
    getDoctor(Number(id))
      .then((r) => { if (r.success) setDoc(r.data); else setError(r.message); })
      .catch((e) => setError(e instanceof Error ? e.message : String(e)))
      .finally(() => setLoading(false));
  }, [id]);

  useEffect(() => { load(); }, [load]);

  const loadAvailability = useCallback(() => {
    if (!id) return;
    setLoading(true);
    setError(null);
    const params: Record<string, unknown> = {};
    if (date) params.date = date;
    getDoctorAvailability(Number(id), date)
      .then((r) => { if (r.success) setAvailability(r.data); else setError(r.message); })
      .catch((e) => setError(e instanceof Error ? e.message : String(e)))
      .finally(() => setLoading(false));
  }, [id, date]);

  return (
    <div className="page">
      {!doc && !loading && !error && (
        <EmptyState icon="✓" title="Doctor not found" description="This doctor profile isn't available." />
      )}
      {loading && doc === null && (<Card className="doctor-profile"><Skeleton lines={6} /></Card>)}
      {error && doc === null && (<ErrorState message={error} onRetry={load} />)}
      {doc && (
        <>
          <Card className="doctor-profile">
            <div className="doctor-profile__header">
              <h1 className="doctor-profile__name">{doc.first_name} {doc.last_name}</h1>
              <div className="doctor-profile__meta">
                {doc.average_rating != null && (
                  <span className="doctor-profile__rating">
                    <Badge status="completed" />
                    {doc.average_rating.toFixed(1)} · {doc.total_reviews} review{doc.total_reviews !== 1 ? "s" : ""}
                  </span>
                )}
                {doc.is_available && (<span className="doctor-profile__badge">Available</span>)}
              </div>
            </div>
            <p className="doctor-profile__specialty">
              {doc.experience_years != null && `${doc.experience_years} years of experience`}
            </p>
            <div className="doctor-profile__fee">
              {doc.consultation_fee != null && `Consultation fee: ${doc.consultation_fee}`}
            </div>
            {doc.bio && (<p className="doctor-profile__bio">{doc.bio}</p>)}
            <div className="doctor-profile__details">
              {doc.qualifications && (
                <p className="doctor-profile__field">
                  <strong>Qualifications:</strong> {doc.qualifications}
                </p>
              )}
            </div>
          </Card>
          <Card className="doctor-profile__availability">
            <h2 className="doctor-profile__section-title">Available slots</h2>
            <div className="doctor-profile__date-picker">
              <label className="field__label" htmlFor="slot-date">Date</label>
              <input id="slot-date" className="field__input" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
              <Button onClick={loadAvailability} loading={loading} className="doctor-profile__check-btn">Check availability</Button>
            </div>
            {availability && availability.slots.length > 0 && (
              <div className="doctor-profile__slots">
                <p className="doctor-profile__slots-count">{availability.slots.length} slot{availability.slots.length !== 1 ? "s" : ""} available on {availability.date}</p>
                <ul className="doctor-profile__slot-list">
                  {availability.slots.map((slot, i) => (
                    <li key={i} className="doctor-profile__slot">
                      <span className="doctor-profile__slot-time">{slot.start_time} – {slot.end_time}</span>
                      <Button className="doctor-profile__slot-book">Book</Button>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {availability && availability.slots.length === 0 && date && (
              <p className="doctor-profile__no-slots">No slots available on {date}.</p>
            )}
          </Card>
          <p className="doctor-profile__back"><Link to="/doctors">← Back to doctor search</Link></p>
        </>
      )}
    </div>
  );
}


/* ---- Doctor dashboard (placeholder) ---- */

function DoctorDashboardScreen() {
  const [profile, setProfile] = useState<DoctorProfile | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(() => {
    setError(null);
    getMyDoctorProfile()
      .then((response) => setProfile(response.data))
      .catch((reason: unknown) => setError(reason instanceof Error ? reason.message : "Could not load your professional profile."));
  }, []);

  useEffect(() => { load(); }, [load]);

  async function save() {
    if (!profile) return;
    setSaving(true);
    setError(null);
    try {
      const response = await updateMyDoctorProfile({
        qualifications: profile.qualifications,
        experience_years: profile.experience_years ?? 0,
        consultation_fee: profile.consultation_fee,
        bio: profile.bio,
        is_available: profile.is_available,
      });
      setProfile(response.data);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not save your professional profile.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="page">
      <h1 className="page__title">Doctor dashboard</h1>
      <p className="page__subtitle">Manage your professional profile. Scheduling and appointment operations follow in later phases.</p>
      {error && <ErrorState message={error} onRetry={load} />}
      {!profile ? <Card><Skeleton lines={5} /></Card> : <Card>
        <div className="field"><label className="field__label" htmlFor="doctor-qualifications">Qualifications</label><input id="doctor-qualifications" className="field__input" value={profile.qualifications} onChange={(event) => setProfile({ ...profile, qualifications: event.target.value })} /></div>
        <div className="field"><label className="field__label" htmlFor="doctor-experience">Experience (years)</label><input id="doctor-experience" className="field__input" min="0" type="number" value={profile.experience_years ?? 0} onChange={(event) => setProfile({ ...profile, experience_years: Number(event.target.value) })} /></div>
        <div className="field"><label className="field__label" htmlFor="doctor-fee">Consultation fee</label><input id="doctor-fee" className="field__input" min="0" type="number" value={profile.consultation_fee} onChange={(event) => setProfile({ ...profile, consultation_fee: event.target.value })} /></div>
        <div className="field"><label className="field__label" htmlFor="doctor-bio">Professional biography</label><textarea id="doctor-bio" className="field__input" value={profile.bio} onChange={(event) => setProfile({ ...profile, bio: event.target.value })} /></div>
        <label><input type="checkbox" checked={profile.is_available} onChange={(event) => setProfile({ ...profile, is_available: event.target.checked })} /> Available for appointments</label>
        <p><Button onClick={save} loading={saving}>Save professional profile</Button></p>
      </Card>}
    </div>
  );
}

/* ---- Doctor availability/schedule screen (placeholder) ---- */

function DoctorAvailabilityScreen() {
  return (
    <div className="page">
      <h1 className="page__title">Schedule</h1>
      <p className="page__subtitle">Manage your availability windows.</p>
      <Card>
        <p className="doctor-dashboard__hint">
          Schedule management (add/edit/remove availability) is implemented in the
          doctor dashboard phase.
        </p>
      </Card>
    </div>
  );
}

/* ---- Doctor nav items ---- */

export function doctorNavItems(user: { role?: string } | null): NavItem[] {
  if (user?.role !== "doctor") return [];
  return [
    { to: "/doctor/dashboard", label: "Dashboard", icon: "📹" },
    { to: "/doctor/availability", label: "Schedule", icon: "🕗" },
  ];
}

export { DoctorProfileScreen, DoctorDashboardScreen, DoctorAvailabilityScreen };
