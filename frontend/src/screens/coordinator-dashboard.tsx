import type { CSSProperties } from "react";
import { Link } from "react-router-dom";
import {
  Activity,
  ArrowUpRight,
  CalendarDays,
  Clock3,
  RefreshCw,
  Siren,
  Stethoscope,
  UserRound,
  Users,
} from "lucide-react";
import type { CoordinatorAppointment, CoordinatorStats } from "../api/coordinator";
import { Badge, Card, EmptyState, ErrorState, Skeleton, type BadgeStatus } from "../components/ui";

function formatDate(date: string) {
  return new Date(`${date.slice(0, 10)}T00:00:00`).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function labelType(type: string) {
  return type === "NORMAL" ? "Hospital appointment" : type === "EMERGENCY" ? "Emergency" : "Home service";
}

const statusColors: Record<string, string> = {
  accepted: "#0a9f94",
  pending: "#f3a629",
  in_progress: "#7c3aed",
  done: "#2563eb",
  cancelled: "#a9b6bf",
  rejected: "#a9b6bf",
  expired: "#a9b6bf",
};

const serviceColors: Record<string, string> = {
  NORMAL: "linear-gradient(90deg, #0a9f94, #45c8bd)",
  EMERGENCY: "linear-gradient(90deg, #dc4c4c, #f07777)",
  HOME_SERVICE: "linear-gradient(90deg, #7c3aed, #a78bfa)",
};

function donutBackground(segments: Array<{ value: number; color: string }>) {
  const total = segments.reduce((sum, segment) => sum + segment.value, 0);
  if (!total) return "conic-gradient(#e8eef1 0% 100%)";
  let cursor = 0;
  const stops = segments
    .filter((segment) => segment.value > 0)
    .map((segment) => {
      const start = (cursor / total) * 100;
      cursor += segment.value;
      const end = (cursor / total) * 100;
      return `${segment.color} ${start}% ${end}%`;
    });
  return `conic-gradient(${stops.join(", ")})`;
}

export function CoordinatorDashboard({
  stats,
  appointments,
  loading,
  error,
  onRefresh,
}: {
  stats: CoordinatorStats | null;
  appointments: CoordinatorAppointment[];
  loading: boolean;
  error: string | null;
  onRefresh: () => void;
}) {
  if (error && !stats) {
    return (
      <div className="page doctor-workspace">
        <ErrorState message={error} onRetry={onRefresh} />
      </div>
    );
  }
  if (!stats) {
    return (
      <div className="page doctor-workspace">
        <Skeleton lines={8} />
      </div>
    );
  }

  const byStatus = stats.appointments.by_status;
  const todayByStatus = stats.appointments.today_by_status ?? {};
  const accepted = byStatus.accepted ?? 0;
  const pending = byStatus.pending ?? 0;
  const inProgress = byStatus.in_progress ?? 0;
  const done = byStatus.done ?? 0;
  const closed = (byStatus.cancelled ?? 0) + (byStatus.rejected ?? 0) + (byStatus.expired ?? 0);
  const total = stats.appointments.total;
  const completionRate = total ? Math.round((done / total) * 100) : 0;
  const activeEmergency = stats.emergency?.active ?? 0;
  const totalDoctors = stats.availability?.total_doctors ?? stats.users.doctors;
  const availableDoctors = stats.availability?.available_doctors ?? totalDoctors;
  const todayPending = todayByStatus.pending ?? 0;

  const pipeline = [
    { key: "accepted", label: "Accepted", value: accepted, color: statusColors.accepted },
    { key: "pending", label: "Pending", value: pending, color: statusColors.pending },
    { key: "in_progress", label: "In progress", value: inProgress, color: statusColors.in_progress },
    { key: "done", label: "Done", value: done, color: statusColors.done },
    { key: "closed", label: "Closed", value: closed, color: statusColors.cancelled },
  ];

  const weekly = stats.appointments.last_7_days ?? [];
  const weeklyMax = Math.max(1, ...weekly.map((day) => day.count));
  const services = stats.services;
  const serviceTotal = Math.max(1, total);
  const recent = appointments.slice(0, 6);

  return (
    <div className="page doctor-workspace">
      <div className="doctor-page-header">
        <div>
          <p className="doctor-eyebrow">Coordination center</p>
          <h1>Coordinator dashboard</h1>
          <p>Live oversight of patients, doctor capacity, appointments and emergency routing.</p>
        </div>
        <div className="doctor-header-actions">
          <button
            type="button"
            className="doctor-outline-button"
            onClick={onRefresh}
            disabled={loading}
          >
            <RefreshCw size={16} className={loading ? "doctor-spin" : undefined} />
            {loading ? "Refreshing..." : "Refresh data"}
          </button>
          <Link to="/coordinator/appointment" className="doctor-primary-button">
            <CalendarDays size={16} /> Appointment desk
          </Link>
        </div>
      </div>

      <div className="doctor-metrics">
        <Card className="doctor-metric">
          <span className="doctor-metric__icon doctor-metric__icon--teal"><CalendarDays size={19} /></span>
          <span>Today's appointments</span>
          <strong>{stats.appointments.today}</strong>
          <small>{total} appointments across the platform</small>
        </Card>
        <Card className="doctor-metric">
          <span className="doctor-metric__icon doctor-metric__icon--amber"><Clock3 size={19} /></span>
          <span>Awaiting review</span>
          <strong>{pending}</strong>
          <small>{todayPending} pending today · {accepted} accepted</small>
        </Card>
        <Card className="doctor-metric">
          <span className="doctor-metric__icon doctor-metric__icon--blue"><Stethoscope size={19} /></span>
          <span>Available doctors</span>
          <strong>{availableDoctors}/{totalDoctors}</strong>
          <small>
            {totalDoctors - availableDoctors > 0
              ? `${totalDoctors - availableDoctors} unavailable right now`
              : "All doctor profiles available"}
          </small>
        </Card>
        <Card className="doctor-metric">
          <span className="doctor-metric__icon doctor-metric__icon--violet"><Users size={19} /></span>
          <span>Registered patients</span>
          <strong>{stats.users.patients}</strong>
          <small>{stats.users.coordinators} coordinator{stats.users.coordinators === 1 ? "" : "s"} on the platform</small>
        </Card>
      </div>

      <div className="doctor-dashboard-grid">
        <Card className="doctor-chart-card">
          <div className="doctor-card-heading">
            <div><h2>Appointment overview</h2><p>Live distribution of the platform appointment pipeline</p></div>
            <span className="doctor-live"><Activity size={14} /> Live data</span>
          </div>
          <div className="doctor-chart-layout">
            <div
              className="doctor-donut"
              style={{ background: donutBackground(pipeline) } as CSSProperties}
            >
              <span>{completionRate}%<small>completed</small></span>
            </div>
            <div className="doctor-legend">
              {pipeline.map((segment) => (
                <span key={segment.key}>
                  <i className="doctor-dot" style={{ background: segment.color }} />
                  {segment.label}
                  <b>{segment.value}</b>
                </span>
              ))}
            </div>
          </div>
        </Card>

        <Card className="doctor-chart-card doctor-workload-card">
          <div className="doctor-card-heading">
            <div><h2>Platform load</h2><p>Current appointment volume</p></div>
            <Activity size={18} />
          </div>
          <div className="doctor-workload-number"><strong>{total}</strong><span>total appointments</span></div>
          <div className="doctor-progress">
            <span style={{ width: `${Math.min(completionRate, 100)}%` }} />
          </div>
          <p className="coordinator-load-note">
            {done} completed of {total} booked · {completionRate}% completion rate
          </p>
          <div className="doctor-workload-footer coordinator-workload-footer">
            <span><CalendarDays size={14} /> {stats.appointments.today} today</span>
            <span><Clock3 size={14} /> {todayPending} pending today</span>
            <span><Siren size={14} /> {activeEmergency} active</span>
          </div>
        </Card>
      </div>

      <div className="doctor-dashboard-grid">
        <Card className="doctor-chart-card">
          <div className="doctor-card-heading">
            <div><h2>7-day appointment volume</h2><p>Bookings recorded each day over the last week</p></div>
            <Link to="/coordinator/appointment"><span>Appointments</span><ArrowUpRight size={15} /></Link>
          </div>
          {weekly.length ? (
            <div className="coordinator-bars">
              {weekly.map((day) => (
                <div className="coordinator-bar" key={day.date}>
                  <span className="coordinator-bar__value">{day.count}</span>
                  <div className="coordinator-bar__track">
                    <span
                      className="coordinator-bar__fill"
                      style={{ height: `${day.count ? Math.max(8, (day.count / weeklyMax) * 100) : 3}%` }}
                    />
                  </div>
                  <span className="coordinator-bar__day">{day.label}</span>
                  <small className="coordinator-bar__date">{day.date.slice(5).replace("-", "/")}</small>
                </div>
              ))}
            </div>
          ) : (
            <EmptyState icon={<CalendarDays size={28} />} title="No volume data" description="Daily appointment counts will appear here." />
          )}
        </Card>

        <Card className="doctor-chart-card">
          <div className="doctor-card-heading">
            <div><h2>Care service mix</h2><p>Appointment volume by service type</p></div>
          </div>
          <div className="coordinator-service-list">
            {services.map((service) => {
              const percentage = Math.round((service.count / serviceTotal) * 100);
              return (
                <div className="coordinator-service" key={service.key}>
                  <div className="coordinator-service__top">
                    <span>{service.label}</span>
                    <b>{service.count}</b>
                  </div>
                  <div className="coordinator-service__track">
                    <span
                      style={{
                        width: `${service.count ? Math.max(4, percentage) : 0}%`,
                        background: serviceColors[service.key] ?? "linear-gradient(90deg, #0a9f94, #45c8bd)",
                      }}
                    />
                  </div>
                  <small className="coordinator-service__meta">{percentage}% of all appointments</small>
                </div>
              );
            })}
          </div>
        </Card>
      </div>

      <Card className="doctor-appointments-card">
        <div className="doctor-card-heading">
          <div><h2>Latest appointments</h2><p>Recent bookings and their current status</p></div>
          <Link to="/coordinator/appointment"><span>View all</span><ArrowUpRight size={15} /></Link>
        </div>
        {recent.length === 0 ? (
          <EmptyState icon={<CalendarDays size={28} />} title="No appointments yet" description="New bookings will appear here as they are created." />
        ) : (
          <div className="coordinator-recent-list">
            {recent.map((appointment) => (
              <div className="coordinator-recent-row" key={appointment.id}>
                <span
                  className="coordinator-recent-row__dot"
                  style={{ background: statusColors[appointment.status] ?? "#a9b6bf" }}
                />
                <div className="coordinator-recent-row__main">
                  <b>#{appointment.id} · {labelType(appointment.appointment_type)}</b>
                  <span>
                    {formatDate(appointment.appointment_date)} · {appointment.start_time.slice(0, 5)}–{appointment.end_time.slice(0, 5)}
                    {appointment.patient_email ? ` · ${appointment.patient_email}` : ""}
                  </span>
                </div>
                <Badge status={appointment.status as BadgeStatus} />
              </div>
            ))}
          </div>
        )}
      </Card>

      <div className="doctor-quick-actions">
        <Link to="/coordinator/appointment">
          <Clock3 size={18} />
          <span><b>Review appointment requests</b><small>{pending} waiting for review</small></span>
          <ArrowUpRight size={15} />
        </Link>
        <Link to="/coordinator/doctors">
          <Stethoscope size={18} />
          <span><b>Doctors & availability</b><small>{availableDoctors} of {totalDoctors} doctors available</small></span>
          <ArrowUpRight size={15} />
        </Link>
        <Link to="/coordinator/emergency">
          <Siren size={18} />
          <span><b>Emergency coordination</b><small>{activeEmergency} active request{activeEmergency === 1 ? "" : "s"}</small></span>
          <ArrowUpRight size={15} />
        </Link>
        <Link to="/coordinator/patient">
          <UserRound size={18} />
          <span><b>Patient history</b><small>Search {stats.users.patients} patient records</small></span>
          <ArrowUpRight size={15} />
        </Link>
      </div>
    </div>
  );
}
