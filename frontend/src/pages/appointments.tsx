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
  getAppointment,
  listMyAppointments,
} from "../api/appointments";
import { getDoctor, getDoctorAvailability } from "../api/doctors";
import { getDoctorReviews } from "../api/reviews";
import type {
  Appointment,
  AppointmentStatus,
  DoctorAvailability,
  DoctorProfile,
} from "../api/types";
import { Button, Card, EmptyState, ErrorState, Skeleton } from "../components/ui";
import { ReviewForm } from "../components/reviews";
import { useToast } from "../state/app-context";
import { ArrowLeft, CheckCircle2 } from "lucide-react";

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
  const [date, setDate] = useState(() => {
    const now = new Date();
    return now.toISOString().slice(0, 10);
  });
  const [availability, setAvailability] = useState<DoctorAvailability | null>(null);
  const [selectedSlot, setSelectedSlot] = useState<{ start_time: string; end_time: string } | null>(null);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const loadDoctor = useCallback(() => {
    if (!id) return;
    setError(null);
    getDoctor(Number(id)).then((r) => setDoctor(r.data)).catch((e) => setError(message(e)));
  }, [id]);

  const loadSlots = useCallback(() => {
    if (!id) return;
    setError(null);
    setAvailability(null);
    setSelectedSlot(null);
    getDoctorAvailability(Number(id), date)
      .then((r) => setAvailability(r.data))
      .catch((e) => setError(message(e)));
  }, [id, date]);

  useEffect(() => { loadDoctor(); }, [loadDoctor]);
  useEffect(() => { loadSlots(); }, [loadSlots]);

  async function handleBook(event: FormEvent) {
    event.preventDefault();
    if (!id || !selectedSlot) return;
    setSubmitting(true);
    setError(null);
    try {
      await createAppointment({
        doctor: Number(id),
        appointment_date: date,
        start_time: selectedSlot.start_time,
        end_time: selectedSlot.end_time,
        reason,
      });
      navigate("/booking/success");
    } catch (e) {
      setError(message(e));
    } finally {
      setSubmitting(false);
    }
  }

  if (error && !doctor) return <div className="page"><ErrorState message={error} onRetry={loadDoctor} /></div>;
  if (!doctor) return <div className="page"><Skeleton lines={6} /></div>;

  return (
    <div className="page">
      <Link to={`/doctors/${id}`}><ArrowLeft size={16} /> Back to doctor</Link>

      <Card>
        <h1 className="page__title">Book appointment</h1>
        <p className="page__subtitle">
          Dr. {doctor.first_name} {doctor.last_name}
          {doctor.qualifications ? ` — ${doctor.qualifications}` : ""}
        </p>
      </Card>

      {/* Step 1: pick date */}
      <Card>
        <h2>Select a date</h2>
        <div className="field">
          <label className="field__label" htmlFor="book-date">Appointment date</label>
          <input
            id="book-date"
            className="field__input"
            type="date"
            min={new Date().toISOString().slice(0, 10)}
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
        </div>
      </Card>

      {/* Step 2: pick slot */}
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

      {/* Step 3: reason + confirm */}
      {selectedSlot && (
        <Card>
          <h2>Confirm your booking</h2>
          <p className="page__subtitle">
            {formatDate(date)} at {formatTime(selectedSlot.start_time)} – {formatTime(selectedSlot.end_time)}
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
      <Card>
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

  async function handleReschedule(event: FormEvent) {
    event.preventDefault();
    if (!id || !selectedSlot || !appointment || !appointment.doctor) return;
    setSubmitting(true);
    setError(null);
    try {
      await cancelAppointment(Number(id), "Rescheduled");
      await createAppointment({
        doctor: appointment.doctor,
        appointment_date: date,
        start_time: selectedSlot.start_time,
        end_time: selectedSlot.end_time,
        reason: appointment.reason,
      });
      notify("success", "Appointment rescheduled. The new request is pending doctor confirmation.");
      navigate("/appointments");
    } catch (e) {
      setError(message(e));
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
        <Card>
          <EmptyState title="Cannot reschedule" description="Only pending or confirmed appointments can be rescheduled." />
        </Card>
      </div>
    );
  }

  return (
    <div className="page">
      <Link to={`/appointments/${id}`}><ArrowLeft size={16} /> Back to appointment</Link>

      <Card>
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

  const now = new Date().toISOString().slice(0, 10);
  const upcoming = appointments.filter(
    (a) => a.appointment_date >= now && (a.status === "pending" || a.status === "confirmed")
  );
  const past = appointments.filter(
    (a) => a.appointment_date < now || a.status === "completed" || a.status === "cancelled" || a.status === "rejected"
  );
  const visible = tab === "upcoming" ? upcoming : past;

  if (error) return <div className="page"><h1 className="page__title">My appointments</h1><ErrorState message={error} onRetry={load} /></div>;

  return (
    <div className="page">
      <h1 className="page__title">My appointments</h1>

      <div className="appt-tabs">
        <button
          type="button"
          className={`appt-tab${tab === "upcoming" ? " appt-tab--active" : ""}`}
          onClick={() => setTab("upcoming")}
        >
          Upcoming ({upcoming.length})
        </button>
        <button
          type="button"
          className={`appt-tab${tab === "past" ? " appt-tab--active" : ""}`}
          onClick={() => setTab("past")}
        >
          Past ({past.length})
        </button>
      </div>

      {appointments === null ? (
        <Skeleton lines={4} />
      ) : visible.length === 0 ? (
        <EmptyState
          title={tab === "upcoming" ? "No upcoming appointments" : "No past appointments"}
          description={tab === "upcoming" ? "Find a doctor to book your next visit." : "Your completed and cancelled appointments will appear here."}
          action={tab === "upcoming" ? <Link to="/doctors">Find a doctor</Link> : undefined}
        />
      ) : (
        <div className="appt-list">
          {visible.map((a) => (
            <Link key={a.id} to={`/appointments/${a.id}`} className="appt-row">
              <div className="appt-row__info">
                <div className="appt-row__when">
                  {formatDate(a.appointment_date)} at {formatTime(a.start_time)}
                </div>
                <div className="appt-row__meta">
                  <DoctorName doctorId={a.doctor} />
                </div>
              </div>
              <StatusBadge status={a.status} />
            </Link>
          ))}
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
  const { notify } = useToast();
  const navigate = useNavigate();
  const [appointment, setAppointment] = useState<Appointment | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cancelling, setCancelling] = useState(false);
  const [cancelReason, setCancelReason] = useState("");
  const [showCancelForm, setShowCancelForm] = useState(false);
  const [hasReview, setHasReview] = useState(false);

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

  async function handleCancel() {
    if (!id) return;
    setCancelling(true);
    setError(null);
    try {
      await cancelAppointment(Number(id), cancelReason);
      notify("success", "Appointment cancelled.");
      navigate("/appointments");
    } catch (e) {
      setError(message(e));
    } finally {
      setCancelling(false);
    }
  }

  if (error && !appointment) return <div className="page"><ErrorState message={error} onRetry={load} /></div>;
  if (!appointment) return <div className="page"><Skeleton lines={6} /></div>;

  const canCancel = appointment.status === "pending" || appointment.status === "confirmed";
  const canReschedule = canCancel;

  return (
    <div className="page">
      <Link to="/appointments"><ArrowLeft size={16} /> Back to appointments</Link>

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

      {(canCancel || canReschedule) && (
        <Card>
          <h2>Manage appointment</h2>
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
      )}

      {appointment.status === "completed" && !hasReview && id && (
        <ReviewForm appointmentId={Number(id)} onSuccess={load} />
      )}

      {appointment.status === "completed" && hasReview && (
        <Card>
          <p className="page__subtitle">You have already reviewed this appointment.</p>
          <Link to={`/doctors/${appointment.doctor}`}>
            <Button variant="secondary">View doctor profile</Button>
          </Link>
        </Card>
      )}
    </div>
  );
}
