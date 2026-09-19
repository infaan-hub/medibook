/**
 * PHASE 12 — Doctor Dashboard (§61): dashboard stats, appointment management
 * with accept/reject/complete/cancel actions, pending/confirmed/completed tabs.
 */

import { useCallback, useEffect, useState, type FormEvent } from "react";
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
import { ArrowLeft } from "lucide-react";

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

  return (
    <div className="page">
      <h1 className="page__title">
        Welcome{profile ? `, Dr. ${profile.first_name}` : ""}
      </h1>
      <p className="page__subtitle">Your practice at a glance.</p>

      {/* Stats row */}
      <div className="stats-row">
        <Card className="stats-row__card">
          <span className="stats-row__number">{todayAppts.length}</span>
          <span className="stats-row__label">Today</span>
        </Card>
        <Card className="stats-row__card">
          <span className="stats-row__number">{pending.length}</span>
          <span className="stats-row__label">Pending</span>
        </Card>
        <Card className="stats-row__card">
          <span className="stats-row__number">{confirmed.length}</span>
          <span className="stats-row__label">Confirmed</span>
        </Card>
        <Card className="stats-row__card">
          <span className="stats-row__number">{completed.length}</span>
          <span className="stats-row__label">Completed</span>
        </Card>
      </div>

      {/* Quick links */}
      <div className="dash-links">
        <Link to="/doctor/appointments?tab=pending">
          <Button variant="secondary">Manage pending requests ({pending.length})</Button>
        </Link>
        <Link to="/doctor/availability">
          <Button variant="secondary">Manage availability</Button>
        </Link>
      </div>

      {/* Today's appointments */}
      <Card>
        <h2>Today's appointments</h2>
        {todayAppts.length === 0 ? (
          <EmptyState title="No appointments today" description="Your schedule for today is clear." />
        ) : (
          todayAppts.map((a) => (
            <AppointmentRow key={a.id} appointment={a} onAction={handleAction} />
          ))
        )}
      </Card>

      {/* Pending requests */}
      {pending.length > 0 && (
        <Card>
          <h2>Pending requests</h2>
          {pending.map((a) => (
            <AppointmentRow key={a.id} appointment={a} onAction={handleAction} />
          ))}
        </Card>
      )}
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
