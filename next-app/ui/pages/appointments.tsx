/**
 * PHASE 10–11 — Appointment Engine: booking flow, list, detail, cancel, reschedule, success.
 * Patient books from doctor profile → selects slot → confirms → views list/detail/cancel/reschedule.
 * PHASE 15: Review form on completed appointments.
 */

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  cancelAppointment,
  createAppointment,
  deleteAppointment,
  getAppointment,
  listMyAppointments,
} from "../api/appointments";
import { getDoctor, getDoctorAvailability, getDoctorAvailableDays } from "../api/doctors";
import { getDoctorReviews } from "../api/reviews";
import { getPatientProfile, getPatientProfileById } from "../api/patients";
import type {
  Appointment,
  AppointmentStatus,
  DoctorAvailability,
  DoctorAvailableDays,
  DoctorProfile,
  PatientProfile,
} from "../api/types";
import { Button, Card, EmptyState, ErrorState, Skeleton } from "../components/ui";
import { ReviewForm } from "../components/reviews";
import { useSession, useToast } from "../state/app-context";
import { useRealtimeEvent, useRealtimeSync } from "../realtime/socket";
import { ArrowLeft, CheckCircle2, Heart, Droplet, AlertTriangle, FileText, User, Clock3, XCircle, Calendar } from "lucide-react";

/* ---------- helpers ---------- */

function message(error: unknown): string {
  return error instanceof Error ? error.message : "Something went wrong. Please try again.";
}

function formatTime(t: string): string {
  return t.slice(0, 5);
}

function formatDate(d: string): string {
  const dt = new Date(d + "T00:00:00");
  return dt.toLocaleDateString(undefined, { weekday: "short", year: "numeric", month: "short", day: "numeric" });
}

const STATUS_LABELS: Record<AppointmentStatus, string> = {
  pending: "Pending",
  confirmed: "Confirmed",
  completed: "Completed",
  cancelled: "Cancelled",
  rejected: "Rejected",
};

function StatusBadge({ status }: { status: AppointmentStatus }) {
  return <span className={`badge badge--${status}`}>{STATUS_LABELS[status]}</span>;
}

function DoctorName({ doctorId }: { doctorId: number | null }) {
  const [name, setName] = useState<string>(`Doctor #${doctorId}`);
  useEffect(() => {
    if (!doctorId) return;
    getDoctor(doctorId).then((r) => setName(`${r.data.first_name} ${r.data.last_name}`)).catch(() => {});
  }, [doctorId]);
  return <>{name}</>;
}

/* ======================================
   BOOKING FLOW — from doctor profile page
   ====================================== */

export function BookingScreen() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [doctor, setDoctor] = useState<DoctorProfile | null>(null);
  const [patientProfile, setPatientProfile] = useState<PatientProfile | null>(null);

  const today = new Date();
  const [calYear, setCalYear] = useState(today.getFullYear());
  const [calMonth, setCalMonth] = useState(today.getMonth() + 1);
  const [availableDays, setAvailableDays] = useState<DoctorAvailableDays | null>(null);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [availability, setAvailability] = useState<DoctorAvailability | null>(null);
  const [selectedSlot, setSelectedSlot] = useState<{ start_time: string; end_time: string } | null>(null);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [slotsLoading, setSlotsLoading] = useState(false);

  const loadDoctor = useCallback(() => {
    if (!id) return;
    setError(null);
    getDoctor(Number(id)).then((r) => setDoctor(r.data)).catch((e) => setError(message(e)));
  }, [id]);

  const loadAvailableDays = useCallback(() => {
    if (!id) return;
    setError(null);
    setAvailableDays(null);
    getDoctorAvailableDays(Number(id), calYear, calMonth)
      .then((r) => setAvailableDays(r.data))
      .catch((e) => setError(message(e)));
  }, [id, calYear, calMonth]);

  const loadSlots = useCallback(() => {
    if (!id || !selectedDate) return;
    setSlotsLoading(true);
    setAvailability(null);
    setSelectedSlot(null);
    getDoctorAvailability(Number(id), selectedDate)
      .then((r) => { setAvailability(r.data); setSlotsLoading(false); })
      .catch((e) => { setError(message(e)); setSlotsLoading(false); });
  }, [id, selectedDate]);

  useEffect(() => { loadDoctor(); }, [loadDoctor]);
  useEffect(() => { loadAvailableDays(); }, [loadAvailableDays]);
  useEffect(() => { loadSlots(); }, [loadSlots]);
  useEffect(() => {
    getPatientProfile()
      .then((r) => setPatientProfile(r.data))
      .catch(() => setPatientProfile(null));
  }, []);

  // Another client booked a slot on this doctor/date — refresh open slots live.
  useRealtimeEvent((event, payload) => {
    if (event !== "doctor.availability.updated") return;
    if (!id || !selectedDate) return;
    if (payload?.doctor_id != null && Number(payload.doctor_id) !== Number(id)) return;
    if (payload?.date && payload.date !== selectedDate) return;
    if (submitting) return;
    loadSlots();
  });

  function prevMonth() {
    if (calMonth === 1) { setCalMonth(12); setCalYear((y) => y - 1); }
    else { setCalMonth((m) => m - 1); }
    setSelectedDate(null);
    setAvailability(null);
    setSelectedSlot(null);
  }

  function nextMonth() {
    if (calMonth === 12) { setCalMonth(1); setCalYear((y) => y + 1); }
    else { setCalMonth((m) => m + 1); }
    setSelectedDate(null);
    setAvailability(null);
    setSelectedSlot(null);
  }

  function selectDay(dayStr: string) {
    setSelectedDate(dayStr);
    setSelectedSlot(null);
  }

  async function handleBook(event: FormEvent) {
    event.preventDefault();
    if (!id || !selectedSlot || !selectedDate) return;
    setSubmitting(true);
    setError(null);

    // Optimistic: the chosen slot disappears immediately (occupied while in flight).
    const booked = selectedSlot;
    const prevAvailability = availability;
    if (availability) {
      setAvailability({
        ...availability,
        slots: availability.slots.filter(
          (s) => !(s.start_time === booked.start_time && s.end_time === booked.end_time)
        ),
      });
    }
    setSelectedSlot(null);

    try {
      await createAppointment({
        doctor: Number(id),
        appointment_date: selectedDate,
        start_time: booked.start_time,
        end_time: booked.end_time,
        reason,
      });
      navigate("/booking/success");
    } catch (e) {
      // Rollback: restore the slot so the patient can retry or pick another.
      setAvailability(prevAvailability);
      setSelectedSlot(booked);
      setError(message(e));
      // Reconcile with server (another client may have taken it while we failed).
      if (prevAvailability) loadSlots();
    } finally {
      setSubmitting(false);
    }
  }

  if (error && !doctor) return <div className="page"><ErrorState message={error} onRetry={loadDoctor} /></div>;
  if (!doctor) return <div className="page"><Skeleton lines={6} /></div>;

  const calDays = new Date(calYear, calMonth, 0).getDate();
  const firstDayOfWeek = (new Date(calYear, calMonth - 1, 1).getDay() + 6) % 7;
  const daySet = new Set(availableDays?.available_days ?? []);
  const monthName = new Date(calYear, calMonth - 1).toLocaleDateString(undefined, { month: "long", year: "numeric" });

  return (
    <div className="page">
      <Link to={`/doctors/${id}`}><ArrowLeft size={16} /> Back to doctor</Link>

      <Card className="card--fit">
        <h1 className="page__title">Book appointment</h1>
        <p className="page__subtitle">
          Dr. {doctor.first_name} {doctor.last_name}
          {doctor.specialties && doctor.specialties.length > 0
            ? ` — ${doctor.specialties.map((s) => s.patient_friendly_name || s.name).join(", ")}`
            : ""}
        </p>
      </Card>

      {/* Patient medical info preview */}
      {patientProfile && (
        <Card className="booking-medical-card">
          <div className="booking-medical-card__header">
            <Heart size={16} />
            <h2>Your medical info</h2>
            <span className="booking-medical-card__shared">Visible to doctor</span>
          </div>
          <div className="booking-medical-card__grid">
            {patientProfile.blood_group && (
              <div className="booking-medical-card__field">
                <Droplet size={13} />
                <span className="booking-medical-card__label">Blood</span>
                <span className="booking-medical-card__value">{patientProfile.blood_group}</span>
              </div>
            )}
            {patientProfile.gender && (
              <div className="booking-medical-card__field">
                <span className="booking-medical-card__label">Gender</span>
                <span className="booking-medical-card__value">{patientProfile.gender}</span>
              </div>
            )}
            {patientProfile.date_of_birth && (
              <div className="booking-medical-card__field">
                <span className="booking-medical-card__label">Date of birth</span>
                <span className="booking-medical-card__value">{patientProfile.date_of_birth}</span>
              </div>
            )}
            {patientProfile.allergies && (
              <div className="booking-medical-card__field booking-medical-card__field--warn">
                <AlertTriangle size={13} />
                <span className="booking-medical-card__label">Allergies</span>
                <span className="booking-medical-card__value">{patientProfile.allergies}</span>
              </div>
            )}
            {patientProfile.medical_history && (
              <div className="booking-medical-card__field booking-medical-card__field--full">
                <FileText size={13} />
                <span className="booking-medical-card__label">Medical history</span>
                <span className="booking-medical-card__value">{patientProfile.medical_history}</span>
              </div>
            )}
            {!patientProfile.blood_group && !patientProfile.allergies && !patientProfile.medical_history && (
              <div className="booking-medical-card__field booking-medical-card__field--full">
                <span className="booking-medical-card__value booking-medical-card__value--muted">
                  No medical details filled yet. <Link to="/settings">Add medical details</Link>
                </span>
              </div>
            )}
          </div>
        </Card>
      )}

      {/* Step 1: Pick a day from calendar */}
      <Card>
        <h2>Select a day</h2>
        <div className="booking-cal-nav">
          <Button variant="secondary" onClick={prevMonth}>&larr; Prev</Button>
          <span className="booking-cal-month">{monthName}</span>
          <Button variant="secondary" onClick={nextMonth}>Next &rarr;</Button>
        </div>
        <div className="booking-cal-weekdays">
          {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => (
            <span key={d} className="booking-cal-weekday">{d}</span>
          ))}
        </div>
        <div className="booking-cal-grid">
          {Array.from({ length: firstDayOfWeek }).map((_, i) => (
            <span key={`empty-${i}`} className="booking-cal-day booking-cal-day--empty" />
          ))}
          {Array.from({ length: calDays }).map((_, i) => {
            const day = i + 1;
            const dateStr = `${calYear}-${String(calMonth).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
            const isToday = dateStr === today.toISOString().slice(0, 10);
            const isAvailable = daySet.has(dateStr);
            const isSelected = dateStr === selectedDate;
            const isPast = new Date(dateStr + "T00:00:00") < new Date(today.getFullYear(), today.getMonth(), today.getDate());
            return (
              <button
                key={day}
                type="button"
                className={`booking-cal-day${isSelected ? " booking-cal-day--selected" : ""}${isAvailable ? " booking-cal-day--available" : ""}${isToday ? " booking-cal-day--today" : ""}${isPast ? " booking-cal-day--past" : ""}`}
                onClick={() => isAvailable && selectDay(dateStr)}
                disabled={!isAvailable || isPast}
              >
                {day}
              </button>
            );
          })}
        </div>
        <p className="booking-cal-hint">
          {daySet.size > 0
            ? `${daySet.size} day${daySet.size !== 1 ? "s" : ""} available this month`
            : "No available days this month"}
        </p>
      </Card>

      {/* Step 2: Pick a time slot */}
      {selectedDate && (
        <Card>
          <h2>Available slots — {formatDate(selectedDate)}</h2>
          {slotsLoading ? (
            <Skeleton lines={3} />
          ) : availability === null ? (
            <Skeleton lines={3} />
          ) : availability.slots.length === 0 ? (
            <EmptyState title="No available slots" description="Try another day." />
          ) : (
            <div className="slot-grid">
              {availability.slots.map((slot) => {
                const isSelected = selectedSlot?.start_time === slot.start_time && selectedSlot?.end_time === slot.end_time;
                return (
                  <button
                    key={slot.start_time}
                    type="button"
                    className={`slot-btn${isSelected ? " slot-btn--selected" : ""}`}
                    onClick={() => setSelectedSlot(slot)}
                  >
                    {formatTime(slot.start_time)} – {formatTime(slot.end_time)}
                  </button>
                );
              })}
            </div>
          )}
        </Card>
      )}

      {/* Step 3: reason + confirm */}
      {selectedSlot && selectedDate && (
        <Card>
          <h2>Confirm your booking</h2>
          <p className="page__subtitle">
            {formatDate(selectedDate)} at {formatTime(selectedSlot.start_time)} – {formatTime(selectedSlot.end_time)}
          </p>

          <form className="form" onSubmit={handleBook}>
            <div className="field">
              <label className="field__label" htmlFor="book-reason">Reason for visit (optional)</label>
              <textarea
                id="book-reason"
                className="field__input"
                rows={3}
                placeholder="Describe your symptoms or reason for the appointment"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
              />
            </div>
            {error && <p className="form-note--error">{error}</p>}
            <Button type="submit" loading={submitting}>
              Confirm booking
            </Button>
          </form>
        </Card>
      )}
    </div>
  );
}

/* ======================================
   BOOKING SUCCESS
   ====================================== */

export function BookingSuccessScreen() {
  return (
    <div className="page">
      <Card className="card--fit">
        <div className="booking-success">
          <div className="booking-success__icon"><CheckCircle2 size={48} /></div>
          <h1 className="page__title">Appointment requested</h1>
          <p className="page__subtitle">
            Your appointment has been submitted. You will receive a notification once the doctor confirms or rejects your request.
          </p>
          <div className="booking-success__actions">
            <Link to="/appointments"><Button>View my appointments</Button></Link>
            <Link to="/doctors"><Button variant="secondary">Find another doctor</Button></Link>
          </div>
        </div>
      </Card>
    </div>
  );
}

/* ======================================
   RESCHEDULE APPOINTMENT
   ====================================== */

export function RescheduleScreen() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { notify } = useToast();
  const [appointment, setAppointment] = useState<Appointment | null>(null);
  const [date, setDate] = useState("");
  const [availability, setAvailability] = useState<DoctorAvailability | null>(null);
  const [selectedSlot, setSelectedSlot] = useState<{ start_time: string; end_time: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const loadAppointment = useCallback(() => {
    if (!id) return;
    setError(null);
    getAppointment(Number(id))
      .then((r) => {
        setAppointment(r.data);
        setDate(r.data.appointment_date);
      })
      .catch((e) => setError(message(e)));
  }, [id]);

  useEffect(() => { loadAppointment(); }, [loadAppointment]);

  const loadSlots = useCallback(() => {
    if (!appointment?.doctor) return;
    setError(null);
    setAvailability(null);
    setSelectedSlot(null);
    getDoctorAvailability(appointment.doctor, date)
      .then((r) => setAvailability(r.data))
      .catch((e) => setError(message(e)));
  }, [appointment?.doctor, date]);

  useEffect(() => { if (appointment) loadSlots(); }, [loadSlots, appointment]);

  // Keep open slots fresh when another client books on this doctor/date.
  useRealtimeEvent((event, payload) => {
    if (event !== "doctor.availability.updated") return;
    if (!appointment?.doctor) return;
    if (payload?.doctor_id != null && Number(payload.doctor_id) !== Number(appointment.doctor)) return;
    if (payload?.date && payload.date !== date) return;
    if (submitting) return;
    loadSlots();
  });

  async function handleReschedule(event: FormEvent) {
    event.preventDefault();
    if (!id || !selectedSlot || !appointment || !appointment.doctor) return;
    setSubmitting(true);
    setError(null);

    // Optimistic: hide the chosen slot while the create is in flight.
    const booked = selectedSlot;
    const prevAvailability = availability;
    if (availability) {
      setAvailability({
        ...availability,
        slots: availability.slots.filter(
          (s) => !(s.start_time === booked.start_time && s.end_time === booked.end_time)
        ),
      });
    }
    setSelectedSlot(null);

    try {
      await cancelAppointment(Number(id), "Rescheduled");
      await createAppointment({
        doctor: appointment.doctor,
        appointment_date: date,
        start_time: booked.start_time,
        end_time: booked.end_time,
        reason: appointment.reason,
      });
      notify("success", "Appointment rescheduled. The new request is pending doctor confirmation.");
      navigate("/appointments");
    } catch (e) {
      // Rollback slot selection + availability, then reconcile with the server.
      setAvailability(prevAvailability);
      setSelectedSlot(booked);
      setError(message(e));
      if (prevAvailability) loadSlots();
    } finally {
      setSubmitting(false);
    }
  }

  if (error && !appointment) return <div className="page"><ErrorState message={error} onRetry={loadAppointment} /></div>;
  if (!appointment) return <div className="page"><Skeleton lines={6} /></div>;

  const canReschedule = appointment.status === "pending" || appointment.status === "confirmed";
  if (!canReschedule) {
    return (
      <div className="page">
        <Link to={`/appointments/${id}`}><ArrowLeft size={16} /> Back to appointment</Link>
        <Card className="card--fit">
          <EmptyState title="Cannot reschedule" description="Only pending or confirmed appointments can be rescheduled." />
        </Card>
      </div>
    );
  }

  return (
    <div className="page">
      <Link to={`/appointments/${id}`}><ArrowLeft size={16} /> Back to appointment</Link>

      <Card className="card--fit">
        <h1 className="page__title">Reschedule appointment</h1>
        <p className="page__subtitle">
          Current: {formatDate(appointment.appointment_date)} at {formatTime(appointment.start_time)}
        </p>
      </Card>

      <Card>
        <h2>Select new date</h2>
        <div className="field">
          <label className="field__label" htmlFor="reschedule-date">New appointment date</label>
          <input
            id="reschedule-date"
            className="field__input"
            type="date"
            min={new Date().toISOString().slice(0, 10)}
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
        </div>
      </Card>

      <Card>
        <h2>Available slots</h2>
        {availability === null ? (
          <Skeleton lines={3} />
        ) : availability.slots.length === 0 ? (
          <EmptyState title="No available slots" description="Try another date." />
        ) : (
          <div className="slot-grid">
            {availability.slots.map((slot) => {
              const isSelected = selectedSlot?.start_time === slot.start_time && selectedSlot?.end_time === slot.end_time;
              return (
                <button
                  key={slot.start_time}
                  type="button"
                  className={`slot-btn${isSelected ? " slot-btn--selected" : ""}`}
                  onClick={() => setSelectedSlot(slot)}
                >
                  {formatTime(slot.start_time)} – {formatTime(slot.end_time)}
                </button>
              );
            })}
          </div>
        )}
      </Card>

      {selectedSlot && (
        <Card>
          <h2>Confirm reschedule</h2>
          <p className="page__subtitle">
            New time: {formatDate(date)} at {formatTime(selectedSlot.start_time)} – {formatTime(selectedSlot.end_time)}
          </p>
          <p className="form-note">Your current appointment will be cancelled and a new request will be submitted.</p>
          {error && <p className="form-note--error">{error}</p>}
          <Button onClick={handleReschedule} loading={submitting}>
            Confirm reschedule
          </Button>
        </Card>
      )}
    </div>
  );
}

/* ======================================
   PATIENT APPOINTMENT LIST
   ====================================== */

export function AppointmentsListScreen() {
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<"upcoming" | "past">("upcoming");

  const load = useCallback(() => {
    setError(null);
    listMyAppointments()
      .then((r) => setAppointments(r.data.results))
      .catch((e) => setError(message(e)));
  }, []);

  useEffect(() => { load(); }, [load]);

  const refresh = useCallback(() => {
    listMyAppointments()
      .then((r) => setAppointments(r.data.results))
      .catch(() => {});
  }, []);

  useRealtimeSync({
    refresh,
    events: ["appointment.created", "appointment.updated", "appointment.deleted"],
  });

  // Optimistic delete.
  useRealtimeEvent((event, payload) => {
    if (event === "appointment.deleted" && payload?.id) {
      setAppointments((prev) => prev.filter((a) => a.id !== Number(payload.id)));
    }
  });

  const now = new Date().toISOString().slice(0, 10);
  const upcoming = appointments.filter(
    (a) => a.appointment_date >= now && (a.status === "pending" || a.status === "confirmed")
  );
  const past = appointments.filter(
    (a) => a.appointment_date < now || a.status === "completed" || a.status === "cancelled" || a.status === "rejected"
  );
  const visible = tab === "upcoming" ? upcoming : past;

  const statusConfig: Record<string, { icon: React.ReactNode; color: string; bg: string }> = {
    pending: { icon: <Clock3 size={14} />, color: "#d97706", bg: "#fef3c7" },
    confirmed: { icon: <CheckCircle2 size={14} />, color: "#059669", bg: "#d1fae5" },
    completed: { icon: <CheckCircle2 size={14} />, color: "#2563eb", bg: "#dbeafe" },
    cancelled: { icon: <XCircle size={14} />, color: "#dc2626", bg: "#fee2e2" },
    rejected: { icon: <XCircle size={14} />, color: "#9333ea", bg: "#ede9fe" },
  };

  if (error) return <div className="page"><h1 className="page__title">My Appointments</h1><ErrorState message={error} onRetry={load} /></div>;

  return (
    <div className="page patient-appointments">
      <div className="patient-appt-header">
        <h1 className="page__title">My Appointments</h1>
        <Link to="/doctors" className="patient-appt-book-btn">+ Book New</Link>
      </div>

      <div className="patient-appt-tabs">
        <button
          type="button"
          className={`patient-appt-tab${tab === "upcoming" ? " patient-appt-tab--active" : ""}`}
          onClick={() => setTab("upcoming")}
        >
          Upcoming
          <span className="patient-appt-tab__count">{upcoming.length}</span>
        </button>
        <button
          type="button"
          className={`patient-appt-tab${tab === "past" ? " patient-appt-tab--active" : ""}`}
          onClick={() => setTab("past")}
        >
          Past
          <span className="patient-appt-tab__count">{past.length}</span>
        </button>
      </div>

      {appointments === null ? (
        <Skeleton lines={4} />
      ) : visible.length === 0 ? (
        <div className="patient-appt-empty">
          <div className="patient-appt-empty__icon"><Calendar size={40} /></div>
          <h3>{tab === "upcoming" ? "No upcoming appointments" : "No past appointments"}</h3>
          <p>{tab === "upcoming" ? "Find a doctor to book your next visit." : "Your completed and cancelled appointments will appear here."}</p>
          {tab === "upcoming" && <Link to="/doctors"><Button>Find a Doctor</Button></Link>}
        </div>
      ) : (
        <div className="patient-appt-grid">
          {visible.map((a) => {
            const sc = statusConfig[a.status] || statusConfig.pending;
            return (
              <Link key={a.id} to={`/appointments/${a.id}`} className="patient-appt-card">
                <div className="patient-appt-card__accent" style={{ background: sc.color }} />
                <div className="patient-appt-card__content">
                  <div className="patient-appt-card__top">
                    <div className="patient-appt-card__date-box">
                      <span className="patient-appt-card__day">
                        {new Date(a.appointment_date + "T00:00:00").getDate()}
                      </span>
                      <span className="patient-appt-card__month">
                        {new Date(a.appointment_date + "T00:00:00").toLocaleDateString(undefined, { month: "short" })}
                      </span>
                    </div>
                    <div className="patient-appt-card__info">
                      <div className="patient-appt-card__doctor">
                        <DoctorName doctorId={a.doctor} />
                      </div>
                      <div className="patient-appt-card__time">
                        {formatTime(a.start_time)} – {formatTime(a.end_time)}
                      </div>
                      <span
                        className="patient-appt-card__status"
                        style={{ color: sc.color, background: sc.bg }}
                      >
                        {sc.icon} {STATUS_LABELS[a.status]}
                      </span>
                    </div>
                  </div>
                  {a.reason && (
                    <div className="patient-appt-card__reason">{a.reason}</div>
                  )}
                  <div className="patient-appt-card__footer">
                    <span className="patient-appt-card__view">View Details →</span>
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ======================================
   APPOINTMENT DETAIL
   ====================================== */

export function AppointmentDetailScreen() {
  const { id } = useParams<{ id: string }>();
  const { user } = useSession();
  const { notify } = useToast();
  const navigate = useNavigate();
  const [appointment, setAppointment] = useState<Appointment | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cancelling, setCancelling] = useState(false);
  const [cancelReason, setCancelReason] = useState("");
  const [showCancelForm, setShowCancelForm] = useState(false);
  const [hasReview, setHasReview] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [patientMedical, setPatientMedical] = useState<PatientProfile | null>(null);
  const [medicalLoading, setMedicalLoading] = useState(false);
  const [showMedical, setShowMedical] = useState(false);

  const isDoctor = user?.role === "doctor";

  const load = useCallback(() => {
    if (!id) return;
    setError(null);
    getAppointment(Number(id)).then((r) => {
      setAppointment(r.data);
      if (r.data.status === "completed" && r.data.doctor) {
        getDoctorReviews(r.data.doctor).then((reviews) => {
          setHasReview(reviews.data.some((rev) => rev.appointment === r.data.id));
        }).catch(() => {});
      }
    }).catch((e) => setError(message(e)));
  }, [id]);

  useEffect(() => { load(); }, [load]);

  // Live detail: reflect confirm/cancel/complete the moment the other side acts.
  useRealtimeEvent((event, payload) => {
    if (event === "appointment.updated" && Number(payload.id) === Number(id)) load();
    if (event === "appointment.deleted" && Number(payload.id) === Number(id)) {
      notify("info", "This appointment was deleted.");
      navigate("/appointments");
    }
  });

  function toggleMedical() {
    if (showMedical) { setShowMedical(false); return; }
    setShowMedical(true);
    if (patientMedical) return;
    if (!appointment?.patient) return;
    setMedicalLoading(true);
    getPatientProfileById(appointment.patient)
      .then((r) => setPatientMedical(r.data))
      .catch(() => setPatientMedical(null))
      .finally(() => setMedicalLoading(false));
  }

  async function handleCancel() {
    if (!id) return;
    setCancelling(true);
    setError(null);
    const snapshot = appointment;
    // Optimistic: show cancelled immediately; roll back if the request fails.
    if (appointment) setAppointment({ ...appointment, status: "cancelled" });
    try {
      await cancelAppointment(Number(id), cancelReason);
      notify("success", "Appointment cancelled.");
      navigate("/appointments");
    } catch (e) {
      if (snapshot) setAppointment(snapshot);
      setError(message(e));
    } finally {
      setCancelling(false);
    }
  }

  async function handleDelete() {
    if (!id) return;
    setDeleting(true);
    setError(null);
    try {
      await deleteAppointment(Number(id));
      notify("success", "Appointment deleted.");
      navigate("/appointments");
    } catch (e) {
      setError(message(e));
    } finally {
      setDeleting(false);
    }
  }

  if (error && !appointment) return <div className="page"><ErrorState message={error} onRetry={load} /></div>;
  if (!appointment) return <div className="page"><Skeleton lines={6} /></div>;

  const canCancel = appointment.status === "pending" || appointment.status === "confirmed";
  const canReschedule = canCancel;

  return (
    <div className="page">
      <Link to={isDoctor ? "/doctor/appointments" : "/appointments"}><ArrowLeft size={16} /> Back to {isDoctor ? "appointments" : "appointments"}</Link>

      <Card>
        <div className="appt-detail__header">
          <h1 className="page__title">Appointment details</h1>
          <StatusBadge status={appointment.status} />
        </div>

        <div className="appt-detail__grid">
          <div className="appt-detail__field">
            <span className="appt-detail__label">Doctor</span>
            <DoctorName doctorId={appointment.doctor} />
          </div>
          <div className="appt-detail__field">
            <span className="appt-detail__label">Date</span>
            {formatDate(appointment.appointment_date)}
          </div>
          <div className="appt-detail__field">
            <span className="appt-detail__label">Time</span>
            {formatTime(appointment.start_time)} – {formatTime(appointment.end_time)}
          </div>
          {appointment.reason && (
            <div className="appt-detail__field">
              <span className="appt-detail__label">Reason</span>
              {appointment.reason}
            </div>
          )}
          {appointment.notes && (
            <div className="appt-detail__field">
              <span className="appt-detail__label">Notes</span>
              {appointment.notes}
            </div>
          )}
          {appointment.cancel_reason && (
            <div className="appt-detail__field">
              <span className="appt-detail__label">Cancel reason</span>
              {appointment.cancel_reason}
            </div>
          )}
        </div>
      </Card>

      {isDoctor && (
        <Card>
          <button type="button" className="appt-card__medical-toggle" onClick={toggleMedical}>
            <User size={14} />
            {showMedical ? "Hide" : "View"} Patient Medical Info
          </button>
          {showMedical && (
            <div className="treat-patient-fields" style={{ marginTop: "0.75rem" }}>
              {medicalLoading ? (
                <Skeleton lines={3} />
              ) : !patientMedical ? (
                <p className="form-note">No medical information available.</p>
              ) : (
                <>
                  {patientMedical.blood_group && (
                    <div className="treat-pf">
                      <span><Droplet size={13} /> Blood Group</span>
                      <strong>{patientMedical.blood_group}</strong>
                    </div>
                  )}
                  {patientMedical.gender && (
                    <div className="treat-pf">
                      <span>Gender</span>
                      <strong>{patientMedical.gender}</strong>
                    </div>
                  )}
                  {patientMedical.date_of_birth && (
                    <div className="treat-pf">
                      <span>Date of Birth</span>
                      <strong>{formatDate(patientMedical.date_of_birth)}</strong>
                    </div>
                  )}
                  {patientMedical.allergies && (
                    <div className="treat-pf treat-pf--warn">
                      <span><AlertTriangle size={13} /> Allergies</span>
                      <strong>{patientMedical.allergies}</strong>
                    </div>
                  )}
                  {patientMedical.medical_history && (
                    <div className="treat-pf">
                      <span><FileText size={13} /> Medical History</span>
                      <strong>{patientMedical.medical_history}</strong>
                    </div>
                  )}
                  {!patientMedical.blood_group && !patientMedical.allergies && !patientMedical.medical_history && (
                    <p className="form-note">No medical details filled yet.</p>
                  )}
                </>
              )}
            </div>
          )}
        </Card>
      )}

      <Card>
        <h2>Manage appointment</h2>
        {(canCancel || canReschedule) && (
          <div className="form__row">
            {canReschedule && (
              <Link to={`/appointments/${id}/reschedule`}>
                <Button variant="secondary">Reschedule</Button>
              </Link>
            )}
            {canCancel && !showCancelForm && (
              <Button variant="danger" onClick={() => setShowCancelForm(true)}>
                Cancel appointment
              </Button>
            )}
          </div>
        )}
        {!showDeleteConfirm && (
          <Button variant="danger" onClick={() => setShowDeleteConfirm(true)}>
            Delete appointment
          </Button>
        )}
        {showDeleteConfirm && (
          <div className="appt-delete-confirm">
            <p>Are you sure you want to permanently delete this appointment?</p>
            {error && <p className="form-note--error">{error}</p>}
            <div className="form__row">
              <Button variant="danger" loading={deleting} onClick={handleDelete}>
                Yes, delete
              </Button>
              <Button variant="secondary" onClick={() => setShowDeleteConfirm(false)} type="button">
                Keep appointment
              </Button>
            </div>
          </div>
        )}
        {showCancelForm && (
          <form className="form" onSubmit={(e) => { e.preventDefault(); handleCancel(); }}>
            <div className="field">
              <label className="field__label" htmlFor="cancel-reason">Reason for cancellation (optional)</label>
              <textarea
                id="cancel-reason"
                className="field__input"
                rows={2}
                value={cancelReason}
                onChange={(e) => setCancelReason(e.target.value)}
              />
            </div>
            {error && <p className="form-note--error">{error}</p>}
            <div className="form__row">
              <Button variant="danger" loading={cancelling}>Confirm cancellation</Button>
              <Button variant="secondary" onClick={() => setShowCancelForm(false)} type="button">Keep appointment</Button>
            </div>
          </form>
        )}
      </Card>

      {appointment.status === "completed" && !hasReview && id && (
        <ReviewForm appointmentId={Number(id)} onSuccess={load} />
      )}

      {appointment.status === "completed" && hasReview && (
        <Card className="card--fit">
          <p className="page__subtitle">You have already reviewed this appointment.</p>
          <Link to={`/doctors/${appointment.doctor}`}>
            <Button variant="secondary">View doctor profile</Button>
          </Link>
        </Card>
      )}
    </div>
  );
}
