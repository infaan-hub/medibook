import type { CSSProperties } from "react";
import {
  Activity,
  ArrowUpRight,
  CalendarDays,
  Clock3,
  GraduationCap,
  Brain,
  RefreshCw,
  Siren,
  Stethoscope,
  UserRound,
  Users,
} from "lucide-react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useCallback, useEffect, useState } from "react";
import { apiGet } from "../api/client";
import { useRealtimeSync } from "../realtime/socket";
import { formatDate as intlDate } from "../lib/intl";
import type { CoordinatorAppointment, CoordinatorStats } from "../api/coordinator";
import { Badge, Card, EmptyState, ErrorState, Skeleton, type BadgeStatus } from "../components/ui";

function formatDate(date: string) {
  return intlDate(new Date(`${date.slice(0, 10)}T00:00:00`), {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function labelType(type: string, t: (k: string) => string) {
  return type === "NORMAL" ? t("coordinatorDashboard.hospitalAppointment") : type === "EMERGENCY" ? t("coordinatorDashboard.emergency") : t("coordinatorDashboard.homeService");
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
  const { t } = useTranslation();
  const [psycho, setPsycho] = useState<any[]>([]);
  const [training, setTraining] = useState<any[]>([]);
  const loadPsychotherapy = useCallback(() => {
    void apiGet<any[]>("/psychotherapy").then((res) => setPsycho(res.data ?? [])).catch(() => {});
  }, []);
  const loadTraining = useCallback(() => {
    void apiGet<any[]>("/training").then((res) => setTraining(res.data ?? [])).catch(() => {});
  }, []);
  useEffect(() => {
    loadPsychotherapy();
    loadTraining();
  }, [loadPsychotherapy, loadTraining]);
  useRealtimeSync({ refresh: loadPsychotherapy, events: ["platform.data.updated"], resources: ["psychotherapy"] });
  useRealtimeSync({ refresh: loadTraining, events: ["platform.data.updated"], resources: ["training"] });
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
  const psychotherapySessions = psycho.flatMap((item) => item.sessions ?? []);
  const psychotherapyCompletedSessions = psychotherapySessions.filter((session: any) => session.status === "completed").length;
  const psychotherapyUpcomingSessions = psychotherapySessions.filter((session: any) => session.status === "scheduled").length;
  const psychotherapyExpiredSessions = psychotherapySessions.filter((session: any) => session.status === "expired").length;
  const psychotherapyTotalSessions = psychotherapySessions.length;
  const psychotherapyProgress = psychotherapyTotalSessions
    ? Math.round((psychotherapyCompletedSessions / psychotherapyTotalSessions) * 100)
    : 0;
  const expiredTrainingRequests = training.filter((item) => item.status === "expired").length;

  const pipeline = [
    { key: "accepted", label: t("appointments.status.accepted"), value: accepted, color: statusColors.accepted },
    { key: "pending", label: t("appointments.status.pending"), value: pending, color: statusColors.pending },
    { key: "in_progress", label: t("appointments.status.in_progress"), value: inProgress, color: statusColors.in_progress },
    { key: "done", label: t("coordinatorDashboard.completed"), value: done, color: statusColors.done },
    { key: "closed", label: t("coordinatorDashboard.closed"), value: closed, color: statusColors.cancelled },
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
          <p className="doctor-eyebrow">{t("coordinatorDashboard.coordinationCenter")}</p>
          <h1>{t("coordinatorDashboard.dashboard")}</h1>
          <p>{t("coordinatorDashboard.dashboardDesc")}</p>
        </div>
        <div className="doctor-header-actions">
          <button
            type="button"
            className="doctor-outline-button"
            onClick={onRefresh}
            disabled={loading}
          >
            <RefreshCw size={16} className={loading ? "doctor-spin" : undefined} />
            {loading ? t("coordinatorDashboard.refreshing") : t("coordinatorDashboard.refreshData")}
          </button>
          <Link to="/coordinator/appointment" className="doctor-primary-button">
            <CalendarDays size={16} /> {t("coordinatorDashboard.appointmentDesk")}
          </Link>
          <Link to="/coordinator/psychotherapy" className="doctor-outline-button">
            <Brain size={16} /> {t("coordinatorDashboard.managePsychology")}
          </Link>
        </div>
      </div>

      <div className="doctor-metrics">
        <Card className="doctor-metric">
          <span className="doctor-metric__icon doctor-metric__icon--teal"><CalendarDays size={19} /></span>
          <span>{t("coordinatorDashboard.todaysAppointments")}</span>
          <strong>{stats.appointments.today}</strong>
          <small>{t("coordinatorDashboard.totalAcrossPlatform", { total })}</small>
        </Card>
        <Card className="doctor-metric">
          <span className="doctor-metric__icon doctor-metric__icon--amber"><Clock3 size={19} /></span>
          <span>{t("coordinatorDashboard.awaitingReview")}</span>
          <strong>{pending}</strong>
          <small>{t("coordinatorDashboard.pendingToday", { count: todayPending, accepted })}</small>
        </Card>
        <Card className="doctor-metric">
          <span className="doctor-metric__icon doctor-metric__icon--blue"><Stethoscope size={19} /></span>
          <span>{t("coordinatorDashboard.availableDoctors")}</span>
          <strong>{availableDoctors}/{totalDoctors}</strong>
          <small>
            {totalDoctors - availableDoctors > 0
              ? t("coordinatorDashboard.unavailableNow", { count: totalDoctors - availableDoctors })
              : t("coordinatorDashboard.allDoctorsAvailable")}
          </small>
        </Card>
        <Card className="doctor-metric">
          <span className="doctor-metric__icon doctor-metric__icon--violet"><Users size={19} /></span>
          <span>{t("coordinatorDashboard.registeredPatients")}</span>
          <strong>{stats.users.patients}</strong>
          <small>{stats.users.coordinators} {stats.users.coordinators === 1 ? t("coordinatorDashboard.coordinatorsOnPlatform", { count: stats.users.coordinators }) : t("coordinatorDashboard.coordinatorsOnPlatformPlural", { count: stats.users.coordinators })}</small>
        </Card>
      </div>

      <div className="doctor-dashboard-grid">
        <Card className="doctor-chart-card">
          <div className="doctor-card-heading">
            <div><h2>{t("coordinatorDashboard.appointmentOverview")}</h2><p>{t("coordinatorDashboard.liveDistribution")}</p></div>
            <span className="doctor-live"><Activity size={14} /> {t("coordinatorDashboard.liveData")}</span>
          </div>
          <div className="doctor-chart-layout">
            <div
              className="doctor-donut"
              style={{ background: donutBackground(pipeline) } as CSSProperties}
            >
              <span>{completionRate}%<small>{t("coordinatorDashboard.completed")}</small></span>
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
            <div><h2>{t("coordinatorDashboard.platformLoad")}</h2><p>{t("coordinatorDashboard.currentVolume")}</p></div>
            <Activity size={18} />
          </div>
          <div className="doctor-workload-number"><strong>{total}</strong><span>{t("coordinatorDashboard.totalAppointments")}</span></div>
          <div className="doctor-progress">
            <span style={{ width: `${Math.min(completionRate, 100)}%` }} />
          </div>
          <p className="coordinator-load-note">
            {done} {t("coordinatorDashboard.completed")} of {total} booked · {completionRate}% {t("coordinatorDashboard.completed")} rate
          </p>
          <div className="doctor-workload-footer coordinator-workload-footer">
            <span><CalendarDays size={14} /> {stats.appointments.today} {t("coordinatorDashboard.today")}</span>
            <span><Clock3 size={14} /> {todayPending} {t("coordinatorDashboard.pendingTodayLabel")}</span>
            <span><Siren size={14} /> {activeEmergency} {t("coordinatorDashboard.active")}</span>
          </div>
        </Card>
      </div>

      <div className="doctor-dashboard-grid">
        <Card className="doctor-chart-card">
          <div className="doctor-card-heading">
            <div><h2>{t("coordinatorDashboard.volume7Day")}</h2><p>{t("coordinatorDashboard.volume7DayDesc")}</p></div>
            <Link to="/coordinator/appointment"><span>{t("coordinatorDashboard.appointments")}</span><ArrowUpRight size={15} /></Link>
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
            <EmptyState icon={<CalendarDays size={28} />} title={t("coordinatorDashboard.noVolumeData")} description={t("coordinatorDashboard.noVolumeDesc")} />
          )}
        </Card>

        <Card className="doctor-chart-card">
          <div className="doctor-card-heading">
            <div><h2>{t("coordinatorDashboard.careServiceMix")}</h2><p>{t("coordinatorDashboard.volumeByType")}</p></div>
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
                  <small className="coordinator-service__meta">{percentage}% {t("coordinatorDashboard.ofAllAppointments")}</small>
                </div>
              );
            })}
          </div>
        </Card>
      </div>

      <Card className="doctor-appointments-card">
        <div className="doctor-card-heading">
          <div><h2>{t("coordinatorDashboard.latestAppointments")}</h2><p>{t("coordinatorDashboard.latestDesc")}</p></div>
          <Link to="/coordinator/appointment"><span>{t("coordinatorDashboard.viewAll")}</span><ArrowUpRight size={15} /></Link>
        </div>
        {recent.length === 0 ? (
          <EmptyState icon={<CalendarDays size={28} />} title={t("coordinatorDashboard.noAppointmentsYet")} description={t("coordinatorDashboard.noAppointmentsYetDesc")} />
        ) : (
          <div className="coordinator-recent-list">
            {recent.map((appointment) => (
              <div className="coordinator-recent-row" key={appointment.id}>
                <span
                  className="coordinator-recent-row__dot"
                  style={{ background: statusColors[appointment.status] ?? "#a9b6bf" }}
                />
                <div className="coordinator-recent-row__main">
                  <b>#{appointment.id} · {labelType(appointment.appointment_type, t)}</b>
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
          <span><b>{t("coordinatorDashboard.reviewRequests")}</b><small>{pending} {t("coordinatorDashboard.waitingReview")}</small></span>
          <ArrowUpRight size={15} />
        </Link>
        <Link to="/coordinator/doctors">
          <Stethoscope size={18} />
          <span><b>{t("coordinatorDashboard.doctorsAvailability")}</b><small>{availableDoctors} {t("coordinatorDashboard.doctorsAvailable", { available: availableDoctors, total: totalDoctors })}</small></span>
          <ArrowUpRight size={15} />
        </Link>
        <Link to="/coordinator/emergency">
          <Siren size={18} />
          <span><b>{t("coordinatorDashboard.emergencyCoordination")}</b><small>{activeEmergency} {activeEmergency === 1 ? t("coordinatorDashboard.activeRequests", { count: activeEmergency }) : t("coordinatorDashboard.activeRequestsPlural", { count: activeEmergency })}</small></span>
          <ArrowUpRight size={15} />
        </Link>
        <Link to="/coordinator/patient">
          <UserRound size={18} />
          <span><b>{t("coordinatorDashboard.patientHistory")}</b><small>{t("coordinatorDashboard.searchPatientRecords", { count: stats.users.patients })}</small></span>
          <ArrowUpRight size={15} />
        </Link>
        <Link to="/coordinator/training">
          <GraduationCap size={18} />
          <span><b>{t("coordinatorDashboard.manageTraining")}</b><small>{t("coordinatorDashboard.manageTraining")}...{expiredTrainingRequests ? ` · ${expiredTrainingRequests} ${t("coordinatorDashboard.trainingExpired", { count: expiredTrainingRequests })}` : ""}</small></span>
          <ArrowUpRight size={15} />
        </Link>
        <Link to="/coordinator/psychotherapy">
          <Brain size={18} />
          <span><b>{t("coordinatorDashboard.managePsychotherapy")}</b><small>{t("coordinatorDashboard.sessionsCompleted", { completed: psychotherapyCompletedSessions, upcoming: psychotherapyUpcomingSessions })}{psychotherapyExpiredSessions ? t("coordinatorDashboard.expiredSuffix", { count: psychotherapyExpiredSessions }) : ""}</small></span>
          <ArrowUpRight size={15} />
        </Link>
      </div>

      <Card className="doctor-chart-card" style={{ marginTop: 16 }}>
        <div className="doctor-card-heading">
          <div>
            <h3>{t("coordinatorDashboard.psychotherapySchedule")}</h3>
            <p>{t("coordinatorDashboard.sessionsCompleted", { completed: psychotherapyCompletedSessions, upcoming: psychotherapyUpcomingSessions })}{psychotherapyExpiredSessions ? t("coordinatorDashboard.expiredSuffix", { count: psychotherapyExpiredSessions }) : ""}.</p>
          </div>
        </div>
        <div className="doctor-progress" role="img" aria-label={`${psychotherapyProgress}% of scheduled psychotherapy sessions completed`}>
          <span style={{ width: `${psychotherapyProgress}%` }} />
        </div>
        {psycho.flatMap((p) => (p.sessions ?? []).filter((s: any) => s.status === "scheduled")).slice(0, 8).length === 0 ? (
          <EmptyState title={t("coordinatorDashboard.noUpcomingSessions")} description={t("coordinatorDashboard.scheduledSessionsAppear")} />
        ) : (
          <ul style={{ listStyle: "none", padding: 0 }}>
            {psycho.flatMap((p) => (p.sessions ?? []).filter((s: any) => s.status === "scheduled").map((s: any) => ({ p, s }))).slice(0, 8).map(({ p, s }) => (
              <li key={s.id} style={{ padding: 6, borderBottom: "1px solid #eee" }}>
                {p.patient?.first_name} {p.patient?.last_name} — Session #{s.session_number} on {String(s.scheduled_date).slice(0, 10)} {s.start_time?.slice(0, 5)}
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
