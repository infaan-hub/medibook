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
  listDoctorAppointments,
  rejectAppointment,
  updateAppointment,
} from "../api/appointments";
import { getMyDoctorProfile } from "../api/doctors";
import type { Appointment, DoctorProfile } from "../api/types";
import { Badge, Button, Card, EmptyState, ErrorState, Skeleton } from "../components/ui";
import { useToast } from "../state/app-context";
import {
  Activity,
  ArrowLeft,
  ArrowUpRight,
  CalendarDays,
  CheckCircle2,
  Clock3,
  FileText,
  MoreHorizontal,
  Settings2,
  Stethoscope,
  Users,
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
      apiGet<{ first_name: string; last_name: string }>(`/patients/${patientId}/`)
        .then((r) => setName(`${r.data.first_name} ${r.data.last_name}`))
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
}: {
  appointment: Appointment;
  onAction: (id: number, action: string) => Promise<void>;
}) {
  const [acting, setActing] = useState(false);
  const [showNotes, setShowNotes] = useState(false);
  const [notes, setNotes] = useState(appointment.notes);

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

  return (
    <Card>
      <div className="appt-row">
        <div className="appt-row__info">
          <div className="appt-row__header">
            <Badge status={appointment.status} />
            <span className="appt-row__date">
              {formatDate(appointment.appointment_date)} at {formatTime(appointment.start_time)} – {formatTime(appointment.end_time)}
            </span>
          </div>
          <p className="appt-row__patient">
            <PatientName patientId={appointment.patient} />
          </p>
          {appointment.reason && <p className="appt-row__reason">{appointment.reason}</p>}
          {appointment.notes && <p className="appt-row__notes">Notes: {appointment.notes}</p>}
        </div>

        <div className="appt-row__actions">
          {appointment.status === "pending" && (
            <>
              <Button variant="primary" loading={acting} onClick={() => handleAction("confirm")}>
                Accept
              </Button>
              <Button variant="danger" loading={acting} onClick={() => handleAction("reject")}>
                Reject
              </Button>
            </>
          )}
          {appointment.status === "confirmed" && (
            <>
              <Button variant="primary" loading={acting} onClick={() => handleAction("complete")}>
                Complete
              </Button>
              <Button variant="secondary" loading={acting} onClick={() => setShowNotes(!showNotes)}>
                Notes
              </Button>
              <Button variant="danger" loading={acting} onClick={() => handleAction("cancel")}>
                Cancel
              </Button>
            </>
          )}
          {appointment.status === "completed" && (
            <Button variant="secondary" onClick={() => setShowNotes(!showNotes)}>
              View notes
            </Button>
          )}
          {appointment.status !== "completed" && appointment.status !== "cancelled" && appointment.status !== "rejected" && (
            <Link to={`/appointments/${appointment.id}`}>
              <Button variant="ghost">Details</Button>
            </Link>
          )}
        </div>
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

  async function handleAction(id: number, action: string) {
    try {
      switch (action) {
        case "confirm": await confirmAppointment(id); break;
        case "complete": await completeAppointment(id); break;
        case "reject": await rejectAppointment(id); break;
        case "cancel": await cancelAppointment(id, "Cancelled by doctor"); break;
      }
      notify("success", `Appointment ${action === "confirm" ? "accepted" : action === "reject" ? "rejected" : action === "complete" ? "completed" : "cancelled"}.`);
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
          <h1>Good morning{profile ? `, Dr. ${profile.first_name}` : ""}</h1>
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
        {visibleAppointments.length === 0 ? <EmptyState icon={<CalendarDays size={28} />} title="No appointments today" description="Your schedule for today is clear." action={<Link to="/doctor/availability">Manage availability</Link>} /> : <div className="doctor-appointment-grid">{visibleAppointments.map((appointment) => <AppointmentRow key={appointment.id} appointment={appointment} onAction={handleAction} />)}</div>}
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

  const load = useCallback(() => {
    setError(null);
    setLoading(true);
    listDoctorAppointments()
      .then((r) => setAppointments(r.data))
      .catch((e) => setError(message(e)))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  async function handleAction(id: number, action: string) {
    try {
      switch (action) {
        case "confirm": await confirmAppointment(id); break;
        case "complete": await completeAppointment(id); break;
        case "reject": await rejectAppointment(id); break;
        case "cancel": await cancelAppointment(id, "Cancelled by doctor"); break;
      }
      notify("success", `Appointment ${action === "confirm" ? "accepted" : action === "reject" ? "rejected" : action === "complete" ? "completed" : "cancelled"}.`);
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
        filtered.map((a) => (
          <AppointmentRow key={a.id} appointment={a} onAction={handleAction} />
        ))
      )}
    </div>
  );
}
