/**
 * PHASE 12 — Doctor Dashboard (§61): dashboard stats, appointment management
 * with accept/reject/complete/cancel actions, pending/confirmed/completed tabs.
 */

import { useCallback, useEffect, useState, type CSSProperties, type FormEvent } from "react";
import { Link } from "react-router-dom";
import {
  cancelAppointment,
  completeAppointment,
  confirmAppointment,
  deleteAppointment,
  listDoctorAppointments,
  rejectAppointment,
  rescheduleAppointment,
  updateAppointment,
} from "../api/appointments";
import { getDoctorAvailability, getMyDoctorProfile } from "../api/doctors";
import { getPatientProfileById } from "../api/patients";
import type { Appointment, DoctorAvailability, DoctorProfile, PatientProfile } from "../api/types";
import { Badge, Button, Card, EmptyState, ErrorState, Skeleton } from "../components/ui";
import { useToast } from "../state/app-context";
import { useRealtimeEvent } from "../realtime/socket";
import {
  Activity,
  ArrowLeft,
  ArrowUpRight,
  CalendarClock,
  CalendarDays,
  CheckCircle2,
  Clock3,
  FileText,
  MoreHorizontal,
  Settings2,
  Stethoscope,
  Users,
  XCircle,
  Ban,
  Pencil,
  User,
  Droplet,
  AlertTriangle,
} from "lucide-react";

function message(error: unknown): string {
  return error instanceof Error ? error.message : "Something went wrong. Please try again.";
}

function formatDate(d: string): string {
  return new Date(d + "T00:00:00").toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

function formatTime(t: string): string {
  const [h, m] = t.split(":");
  const hour = Number(h);
  return `${hour % 12 || 12}:${m} ${hour < 12 ? "AM" : "PM"}`;
}

/* ======================================
   PATIENT NAME (lookup by ID)
   ====================================== */

function PatientName({ patientId }: { patientId: number }) {
  const [name, setName] = useState<string | null>(null);
  useEffect(() => {
    import("../api/client").then(({ apiGet }) =>
      apiGet<{ first_name: string; last_name: string; email: string }>(`/patients/${patientId}/`)
        .then((r) => {
          const fn = r.data.first_name || "";
          const ln = r.data.last_name || "";
          const full = `${fn} ${ln}`.trim();
          setName(full || r.data.email || `Patient #${patientId}`);
        })
        .catch(() => setName(`Patient #${patientId}`))
    );
  }, [patientId]);
  return <>{name ?? `Patient #${patientId}`}</>;
}

/* ======================================
   APPOINTMENT ROW (with action buttons)
   ====================================== */

function AppointmentRow({
  appointment,
  onAction,
  doctorId,
  onChanged,
}: {
  appointment: Appointment;
  onAction: (id: number, action: string) => Promise<void>;
  doctorId?: number | null;
  onChanged?: () => void;
}) {
  const { notify } = useToast();
  const [acting, setActing] = useState(false);
  const [showNotes, setShowNotes] = useState(false);
  const [notes, setNotes] = useState(appointment.notes);
  const [showReschedule, setShowReschedule] = useState(false);
  const [reschedDate, setReschedDate] = useState(appointment.appointment_date);
  const [reschedSlots, setReschedSlots] = useState<DoctorAvailability | null>(null);
  const [reschedSlot, setReschedSlot] = useState<{ start_time: string; end_time: string } | null>(null);
  const [reschedBusy, setReschedBusy] = useState(false);
  const [reschedError, setReschedError] = useState<string | null>(null);
  const [showMedical, setShowMedical] = useState(false);
  const [patientMedical, setPatientMedical] = useState<PatientProfile | null>(null);
  const [medicalLoading, setMedicalLoading] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  async function handleAction(action: string) {
    setActing(true);
    try {
      await onAction(appointment.id, action);
    } finally {
      setActing(false);
    }
  }

  async function handleSaveNotes(e: FormEvent) {
    e.preventDefault();
    setActing(true);
    try {
      await updateAppointment(appointment.id, { notes });
    } finally {
      setActing(false);
    }
  }

  function toggleMedical() {
    if (showMedical) {
      setShowMedical(false);
      return;
    }
    setShowMedical(true);
    if (patientMedical) return;
    setMedicalLoading(true);
    getPatientProfileById(appointment.patient)
      .then((r) => setPatientMedical(r.data))
      .catch(() => setPatientMedical(null))
      .finally(() => setMedicalLoading(false));
  }

  useEffect(() => {
    if (!showReschedule || !doctorId || !reschedDate) {
      setReschedSlots(null);
      return;
    }
    setReschedSlots(null);
    setReschedSlot(null);
    setReschedError(null);
    getDoctorAvailability(doctorId, reschedDate)
      .then((r) => setReschedSlots(r.data))
      .catch((e) => setReschedError(message(e)));
  }, [showReschedule, doctorId, reschedDate]);

  async function handleReschedule() {
    if (!reschedSlot) return;
    setReschedBusy(true);
    setReschedError(null);
    try {
      await rescheduleAppointment(appointment.id, {
        appointment_date: reschedDate,
        start_time: reschedSlot.start_time,
        end_time: reschedSlot.end_time,
      });
      notify("success", "Appointment rescheduled — the patient sees the new time instantly.");
      setShowReschedule(false);
      onChanged?.();
    } catch (e) {
      setReschedError(message(e));
    } finally {
      setReschedBusy(false);
    }
  }

  const canReschedule =
    appointment.status === "pending" || appointment.status === "confirmed";

  const statusConfig = {
    pending: { icon: <Clock3 size={14} />, label: "Awaiting review", color: "var(--color-status-pending)" },
    confirmed: { icon: <CheckCircle2 size={14} />, label: "Confirmed", color: "var(--color-status-confirmed)" },
    completed: { icon: <CheckCircle2 size={14} />, label: "Completed", color: "var(--color-status-completed)" },
    cancelled: { icon: <Ban size={14} />, label: "Cancelled", color: "var(--color-status-cancelled)" },
    rejected: { icon: <XCircle size={14} />, label: "Rejected", color: "var(--color-status-rejected)" },
  };

  const currentStatus = statusConfig[appointment.status] || statusConfig.pending;

  return (
    <Card className={`appt-card appt-card--${appointment.status}`}>
      <div className="appt-card__top">
        <div className="appt-card__status-line">
          <span className="appt-card__status-dot" style={{ background: currentStatus.color }} />
          <span className="appt-card__status-label">{currentStatus.label}</span>
          <Badge status={appointment.status} />
        </div>
        <div className="appt-card__time">
          <CalendarClock size={14} />
          <span>{formatDate(appointment.appointment_date)}</span>
          <span className="appt-card__time-sep">·</span>
          <span>{formatTime(appointment.start_time)} – {formatTime(appointment.end_time)}</span>
        </div>
      </div>

      <div className="appt-card__body">
        <div className="appt-card__patient">
          <span className="appt-card__patient-label">Patient</span>
          <span className="appt-card__patient-name">
            <PatientName patientId={appointment.patient} />
          </span>
        </div>
        {appointment.reason && (
          <div className="appt-card__reason">
            <span className="appt-card__reason-label">Reason</span>
            <span className="appt-card__reason-text">{appointment.reason}</span>
          </div>
        )}
        {appointment.notes && (
          <div className="appt-card__notes">
            <span className="appt-card__notes-label">Clinical notes</span>
            <span className="appt-card__notes-text">{appointment.notes}</span>
          </div>
        )}

        <div className="appt-card__patient-medical">
          <button type="button" className="appt-card__medical-toggle" onClick={toggleMedical}>
            <User size={13} />
            {showMedical ? "Hide" : "View"} Patient Medical Info
          </button>
          {showMedical && (
            <div className="appt-card__medical-details">
              {medicalLoading ? (
                <span className="appt-card__medical-loading">Loading medical info…</span>
              ) : !patientMedical ? (
                <span className="appt-card__medical-loading">No medical information available.</span>
              ) : (
                <>
                  {patientMedical.blood_group && (
                    <div className="appt-card__medical-row">
                      <span className="appt-card__medical-label"><Droplet size={11} /> Blood</span>
                      <span className="appt-card__medical-value">{patientMedical.blood_group}</span>
                    </div>
                  )}
                  {patientMedical.date_of_birth && (
                    <div className="appt-card__medical-row">
                      <span className="appt-card__medical-label"><Clock3 size={11} /> Age</span>
                      <span className="appt-card__medical-value">
                        {Math.floor((Date.now() - new Date(patientMedical.date_of_birth + "T00:00:00").getTime()) / (365.25 * 24 * 60 * 60 * 1000))} years
                      </span>
                    </div>
                  )}
                  {patientMedical.gender && (
                    <div className="appt-card__medical-row">
                      <span className="appt-card__medical-label"><User size={11} /> Gender</span>
                      <span className="appt-card__medical-value">{patientMedical.gender}</span>
                    </div>
                  )}
                  {patientMedical.allergies && (
                    <div className="appt-card__medical-row">
                      <span className="appt-card__medical-label"><AlertTriangle size={11} /> Allergies</span>
                      <span className="appt-card__medical-value">{patientMedical.allergies}</span>
                    </div>
                  )}
                  {patientMedical.medical_history && (
                    <div className="appt-card__medical-row">
                      <span className="appt-card__medical-label"><FileText size={11} /> History</span>
                      <span className="appt-card__medical-value">{patientMedical.medical_history}</span>
                    </div>
                  )}
                  {!patientMedical.blood_group && !patientMedical.allergies && !patientMedical.medical_history && (
                    <span className="appt-card__medical-loading">No medical details filled yet.</span>
                  )}
                </>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="appt-card__actions">
        {appointment.status === "pending" && (
          <>
            <Button variant="primary" loading={acting} onClick={() => handleAction("confirm")}>
              <CheckCircle2 size={14} /> Accept
            </Button>
            <Button variant="danger" loading={acting} onClick={() => handleAction("reject")}>
              <XCircle size={14} /> Reject
            </Button>
          </>
        )}
        {appointment.status === "confirmed" && (
          <>
            <Button variant="primary" loading={acting} onClick={() => handleAction("complete")}>
              <CheckCircle2 size={14} /> Complete
            </Button>
            <Button variant="secondary" loading={acting} onClick={() => setShowNotes(!showNotes)}>
              <Pencil size={14} /> {showNotes ? "Close notes" : "Notes"}
            </Button>
            <Button variant="danger" loading={acting} onClick={() => handleAction("cancel")}>
              <Ban size={14} /> Cancel
            </Button>
          </>
        )}
        {appointment.status === "completed" && (
          <Button variant="secondary" onClick={() => setShowNotes(!showNotes)}>
            <FileText size={14} /> {showNotes ? "Close notes" : "View notes"}
          </Button>
        )}
        {canReschedule && (
          <Button variant="secondary" onClick={() => setShowReschedule(!showReschedule)}>
            <CalendarClock size={14} /> {showReschedule ? "Close" : "Reschedule"}
          </Button>
        )}
        {appointment.status !== "completed" && appointment.status !== "cancelled" && appointment.status !== "rejected" && (
          <Link to={`/appointments/${appointment.id}`} className="appt-card__detail-link">
            <Button variant="ghost">
              <ArrowUpRight size={14} /> Details
            </Button>
          </Link>
        )}
        {!showDeleteConfirm ? (
          <Button variant="danger" onClick={() => setShowDeleteConfirm(true)}>
            Delete
          </Button>
        ) : (
          <div className="appt-delete-confirm">
            <span>Delete this appointment?</span>
            <Button variant="danger" loading={acting} onClick={() => handleAction("delete")}>
              Yes
            </Button>
            <Button variant="secondary" onClick={() => setShowDeleteConfirm(false)}>
              No
            </Button>
          </div>
        )}
      </div>

      {showNotes && (
        <form className="appt-row__notes-form" onSubmit={handleSaveNotes}>
          <div className="field">
            <label className="field__label" htmlFor={`notes-${appointment.id}`}>
              Appointment notes
            </label>
            <textarea
              id={`notes-${appointment.id}`}
              className="field__input"
              rows={3}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Add clinical notes..."
            />
          </div>
          <Button type="submit" variant="secondary" loading={acting}>
            Save notes
          </Button>
        </form>
      )}

      {showReschedule && (
        <div className="appt-reschedule">
          <div className="field">
            <label className="field__label" htmlFor={`resched-date-${appointment.id}`}>
              New date
            </label>
            <input
              id={`resched-date-${appointment.id}`}
              className="field__input"
              type="date"
              min={new Date().toISOString().slice(0, 10)}
              value={reschedDate}
              onChange={(e) => setReschedDate(e.target.value)}
            />
          </div>
          {!doctorId ? (
            <p className="form-note">Loading your schedule…</p>
          ) : reschedSlots === null ? (
            <Skeleton lines={2} />
          ) : reschedSlots.slots.length === 0 ? (
            <p className="form-note--error">No open slots on this date. Pick another day.</p>
          ) : (
            <div className="slot-grid">
              {reschedSlots.slots.map((slot) => {
                const isSelected =
                  reschedSlot?.start_time === slot.start_time &&
                  reschedSlot?.end_time === slot.end_time;
                return (
                  <button
                    key={slot.start_time}
                    type="button"
                    className={`slot-btn${isSelected ? " slot-btn--selected" : ""}`}
                    onClick={() => setReschedSlot(slot)}
                  >
                    {formatTime(slot.start_time)} – {formatTime(slot.end_time)}
                  </button>
                );
              })}
            </div>
          )}
          {reschedError && <p className="form-note--error">{reschedError}</p>}
          {reschedSlot && (
            <Button loading={reschedBusy} onClick={handleReschedule}>
              Save new time
            </Button>
          )}
        </div>
      )}
    </Card>
  );
}

/* ======================================
   DOCTOR DASHBOARD (main screen)
   ====================================== */

export function DoctorDashboardScreen() {
  const { notify } = useToast();
  const [profile, setProfile] = useState<DoctorProfile | null>(null);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    setError(null);
    setLoading(true);
    Promise.all([
      getMyDoctorProfile(),
      listDoctorAppointments(),
    ])
      .then(([profileRes, apptsRes]) => {
        setProfile(profileRes.data);
        setAppointments(apptsRes.data);
      })
      .catch((e) => setError(message(e)))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  // Live dashboard: stats + today's schedule react to every booking/status change.
  useRealtimeEvent((event, payload) => {
    if (event === "appointment.created" || event === "appointment.updated") load();
    if (event === "appointment.deleted" && payload?.id) {
      setAppointments((prev) => prev.filter((a) => a.id !== Number(payload.id)));
    }
  });

  async function handleAction(id: number, action: string) {
    try {
      switch (action) {
        case "confirm": await confirmAppointment(id); break;
        case "complete": await completeAppointment(id); break;
        case "reject": await rejectAppointment(id); break;
        case "cancel": await cancelAppointment(id, "Cancelled by doctor"); break;
        case "delete": await deleteAppointment(id); break;
      }
      notify("success", action === "delete" ? "Appointment deleted." : `Appointment ${action === "confirm" ? "accepted" : action === "reject" ? "rejected" : action === "complete" ? "completed" : "cancelled"}.`);
      load();
    } catch (e) {
      notify("error", message(e));
    }
  }

  if (error && !profile) return <div className="page"><ErrorState message={error} onRetry={load} /></div>;
  if (loading) return <div className="page"><Skeleton lines={6} /></div>;

  const today = new Date().toISOString().slice(0, 10);
  const todayAppts = appointments.filter((a) => a.appointment_date === today);
  const pending = appointments.filter((a) => a.status === "pending");
  const confirmed = appointments.filter((a) => a.status === "confirmed");
  const completed = appointments.filter((a) => a.status === "completed");
  const cancelled = appointments.filter((a) => a.status === "cancelled" || a.status === "rejected");
  const statusTotal = Math.max(appointments.length, 1);
  const visibleAppointments = [...todayAppts, ...pending.filter((item) => !todayAppts.some((today) => today.id === item.id))].slice(0, 5);

  return (
    <div className="page doctor-workspace">
      <div className="doctor-page-header">
        <div>
          <p className="doctor-eyebrow">Practice overview</p>
          <h1>{new Date().getHours() < 12 ? "Good morning" : new Date().getHours() < 18 ? "Good afternoon" : "Good evening"}{profile ? `, Dr. ${profile.first_name}` : ""}</h1>
          <p>Here is what is happening in your practice today.</p>
        </div>
        <div className="doctor-header-actions">
          <Link to="/doctor/availability" className="doctor-outline-button"><Settings2 size={16} /> Availability</Link>
          <Link to="/doctor/appointments?tab=pending" className="doctor-primary-button"><CalendarDays size={16} /> Review requests</Link>
        </div>
      </div>

      <div className="doctor-metrics">
        <Card className="doctor-metric"><span className="doctor-metric__icon doctor-metric__icon--teal"><CalendarDays size={19} /></span><span>Today's visits</span><strong>{todayAppts.length}</strong><small>{todayAppts.length ? "Schedule is active" : "No visits scheduled"}</small></Card>
        <Card className="doctor-metric"><span className="doctor-metric__icon doctor-metric__icon--amber"><Clock3 size={19} /></span><span>Pending requests</span><strong>{pending.length}</strong><small>{pending.length ? "Needs your review" : "All caught up"}</small></Card>
        <Card className="doctor-metric"><span className="doctor-metric__icon doctor-metric__icon--blue"><CheckCircle2 size={19} /></span><span>Confirmed</span><strong>{confirmed.length}</strong><small>Upcoming appointments</small></Card>
        <Card className="doctor-metric"><span className="doctor-metric__icon doctor-metric__icon--violet"><Users size={19} /></span><span>Completed visits</span><strong>{completed.length}</strong><small>Recorded in your practice</small></Card>
      </div>

      <div className="doctor-dashboard-grid">
        <Card className="doctor-chart-card">
          <div className="doctor-card-heading"><div><h2>Appointment overview</h2><p>Live distribution of your appointment pipeline</p></div><span className="doctor-live"><Activity size={14} /> Live data</span></div>
          <div className="doctor-chart-layout">
            <div className="doctor-donut" style={{ "--doctor-donut": `${(completed.length / statusTotal) * 100}%` } as CSSProperties}><span>{Math.round((completed.length / statusTotal) * 100)}%<small>completed</small></span></div>
            <div className="doctor-legend"><span><i className="doctor-dot doctor-dot--teal" /> Confirmed <b>{confirmed.length}</b></span><span><i className="doctor-dot doctor-dot--amber" /> Pending <b>{pending.length}</b></span><span><i className="doctor-dot doctor-dot--blue" /> Completed <b>{completed.length}</b></span><span><i className="doctor-dot doctor-dot--muted" /> Closed <b>{cancelled.length}</b></span></div>
          </div>
        </Card>
        <Card className="doctor-chart-card doctor-workload-card">
          <div className="doctor-card-heading"><div><h2>Practice workload</h2><p>Current appointment volume</p></div><MoreHorizontal size={18} /></div>
          <div className="doctor-workload-number"><strong>{appointments.length}</strong><span>total visits</span></div>
          <div className="doctor-progress"><span style={{ width: `${Math.min((confirmed.length / statusTotal) * 100, 100)}%` }} /></div>
          <div className="doctor-workload-footer"><span><CheckCircle2 size={14} /> {completed.length} completed</span><span><Clock3 size={14} /> {pending.length} pending</span></div>
        </Card>
      </div>

      <Card className="doctor-appointments-card">
        <div className="doctor-card-heading"><div><h2>Today's schedule</h2><p>Appointments that need your attention</p></div><Link to="/doctor/appointments"><span>View all</span><ArrowUpRight size={15} /></Link></div>
        {visibleAppointments.length === 0 ? <EmptyState icon={<CalendarDays size={28} />} title="No appointments today" description="Your schedule for today is clear." action={<Link to="/doctor/availability">Manage availability</Link>} /> : <div className="appt-card-list appt-card-list--dashboard">{visibleAppointments.map((appointment) => <AppointmentRow key={appointment.id} appointment={appointment} onAction={handleAction} doctorId={profile?.id ?? null} onChanged={load} />)}</div>}
      </Card>

      <div className="doctor-quick-actions"><Link to="/doctor/appointments?tab=pending"><FileText size={18} /><span><b>Pending requests</b><small>{pending.length} waiting for review</small></span><ArrowUpRight size={15} /></Link><Link to="/doctor/availability"><Stethoscope size={18} /><span><b>Manage availability</b><small>Keep your schedule current</small></span><ArrowUpRight size={15} /></Link></div>
    </div>
  );
}

/* ======================================
   DOCTOR APPOINTMENTS (full list with tabs)
   ====================================== */

type Tab = "pending" | "confirmed" | "completed";

export function DoctorAppointmentsScreen() {
  const { notify } = useToast();
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [activeTab, setActiveTab] = useState<Tab>("pending");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [doctorId, setDoctorId] = useState<number | null>(null);

  useEffect(() => {
    getMyDoctorProfile().then((r) => setDoctorId(r.data.id)).catch(() => {});
  }, []);

  const load = useCallback(() => {
    setError(null);
    setLoading(true);
    listDoctorAppointments()
      .then((r) => setAppointments(r.data))
      .catch((e) => setError(message(e)))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  // Live list: patient bookings/cancellations land in the right tab instantly.
  useRealtimeEvent((event, payload) => {
    if (event === "appointment.created" || event === "appointment.updated") load();
    if (event === "appointment.deleted" && payload?.id) {
      setAppointments((prev) => prev.filter((a) => a.id !== Number(payload.id)));
    }
  });

  async function handleAction(id: number, action: string) {
    try {
      switch (action) {
        case "confirm": await confirmAppointment(id); break;
        case "complete": await completeAppointment(id); break;
        case "reject": await rejectAppointment(id); break;
        case "cancel": await cancelAppointment(id, "Cancelled by doctor"); break;
        case "delete": await deleteAppointment(id); break;
      }
      notify("success", action === "delete" ? "Appointment deleted." : `Appointment ${action === "confirm" ? "accepted" : action === "reject" ? "rejected" : action === "complete" ? "completed" : "cancelled"}.`);
      load();
    } catch (e) {
      notify("error", message(e));
    }
  }

  const tabs: { key: Tab; label: string; count: number }[] = [
    { key: "pending", label: "Pending", count: appointments.filter((a) => a.status === "pending").length },
    { key: "confirmed", label: "Confirmed", count: appointments.filter((a) => a.status === "confirmed").length },
    { key: "completed", label: "Completed", count: appointments.filter((a) => a.status === "completed").length },
  ];

  const filtered = appointments.filter((a) => a.status === activeTab);

  if (error) return <div className="page"><ErrorState message={error} onRetry={load} /></div>;

  return (
    <div className="page">
      <Link to="/doctor/dashboard"><ArrowLeft size={16} /> Dashboard</Link>
      <h1 className="page__title">Appointments</h1>

      {/* Tabs */}
      <div className="tabs">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            className={`tabs__tab${activeTab === tab.key ? " tabs__tab--active" : ""}`}
            onClick={() => setActiveTab(tab.key)}
          >
            {tab.label} ({tab.count})
          </button>
        ))}
      </div>

      {/* List */}
      {loading ? (
        <Skeleton lines={4} />
      ) : filtered.length === 0 ? (
        <EmptyState
          title={`No ${activeTab} appointments`}
          description={
            activeTab === "pending"
              ? "No new appointment requests to review."
              : activeTab === "confirmed"
              ? "No confirmed appointments."
              : "No completed appointments yet."
          }
        />
      ) : (
        <div className="appt-card-list">
          {filtered.map((a) => (
            <AppointmentRow key={a.id} appointment={a} onAction={handleAction} doctorId={doctorId} onChanged={load} />
          ))}
        </div>
      )}
    </div>
  );
}
