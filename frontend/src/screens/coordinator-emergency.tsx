import { useState, useMemo } from "react";
import { useTranslation } from "react-i18next";
import i18n from "../i18n";
import { Link } from "react-router-dom";
import { formatDate as intlDate, formatTime as intlTime, formatDateTime as intlDateTime } from "../lib/intl";
import {
  Activity,
  ArrowRightLeft,
  CalendarDays,
  CheckCircle2,
  Clock3,
  Lock,
  Search,
  Siren,
  Stethoscope,
  UserRound,
} from "lucide-react";
import {
  reassignCoordinatorAppointment,
  type CoordinatorAppointment,
  type CoordinatorDoctor,
} from "../api/coordinator";
import { Badge, Button, Card, EmptyState, ErrorState, Skeleton, type BadgeStatus } from "../components/ui";
import { useToast } from "../state/app-context";

const statusColors: Record<string, string> = {
  pending: "#dc4c4c",
  accepted: "#0a9f94",
  in_progress: "#7c3aed",
  done: "#2563eb",
  cancelled: "#a9b6bf",
  rejected: "#a9b6bf",
  expired: "#a9b6bf",
};

function message(error: unknown) {
  return error instanceof Error ? error.message : i18n.t("coordinatorEmergency.unableToTransfer");
}

function formatDate(date: string) {
  return intlDate(new Date(`${date.slice(0, 10)}T00:00:00`), {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function formatTime(value?: string | null) {
  if (!value) return "";
  return intlTime(new Date(value), { hour: "2-digit", minute: "2-digit" });
}

function formatDateTime(value?: string | null) {
  if (!value) return "";
  return intlDateTime(new Date(value), {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function canTransfer(appointment: CoordinatorAppointment) {
  return (
    (appointment.status === "pending" || appointment.status === "accepted") &&
    !appointment.consultation_started_at &&
    !appointment.emergency_in_progress_at
  );
}

function EmergencyCard({
  appointment,
  doctors,
  onReassigned,
}: {
  appointment: CoordinatorAppointment;
  doctors: CoordinatorDoctor[];
  onReassigned: (appointment: CoordinatorAppointment) => void;
}) {
  const { t } = useTranslation();
  const { notify } = useToast();
  const [target, setTarget] = useState<number | "">("");
  const [saving, setSaving] = useState(false);
  const availableDoctors = useMemo(() => doctors.filter((doctor) => doctor.is_available && doctor.id !== appointment.doctor), [doctors, appointment.doctor]);
  const currentDoctor = doctors.find((doctor) => doctor.id === appointment.doctor);
  const transferable = canTransfer(appointment);
  const started = appointment.emergency_in_progress_at || appointment.consultation_started_at || appointment.status === "in_progress";
  const startedAt = formatDateTime(appointment.emergency_in_progress_at);
  const isClosed = ["done", "cancelled", "rejected", "expired"].includes(appointment.status);

  async function transfer() {
    if (!target) {
      notify("error", t("coordinatorEmergency.selectDoctorFirst"));
      return;
    }
    setSaving(true);
    try {
      const response = await reassignCoordinatorAppointment(appointment.id, target, true);
      onReassigned(response.data);
      setTarget("");
      notify("success", t("coordinatorEmergency.transferred"));
    } catch (error) {
      notify("error", message(error));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card
      className="coordinator-emergency-card"
      style={{ borderLeftColor: statusColors[appointment.status] ?? "#a9b6bf" }}
    >
      <div className="coordinator-emergency-card__head">
        <div className="coordinator-emergency-card__flag">
          <span className="coordinator-emergency-card__flag-icon"><Siren size={15} /></span>
          <span>{t("coordinatorEmergency.emergency")} #{appointment.id}</span>
        </div>
        <Badge status={appointment.status as BadgeStatus} />
      </div>

      <div className="coordinator-emergency-card__when">
        <span><CalendarDays size={15} /> {formatDate(appointment.appointment_date)}</span>
        <span><Clock3 size={15} /> {appointment.start_time.slice(0, 5)}–{appointment.end_time.slice(0, 5)}</span>
        {appointment.emergency_requested_at && (
          <span><Activity size={15} /> {t("coordinatorEmergency.requested")} {formatTime(appointment.emergency_requested_at)}</span>
        )}
      </div>

      <div className="coordinator-emergency-card__details">
        <div>
          <span>{t("coordinatorEmergency.patient")}</span>
          <b>{appointment.patient_email || `Patient #${appointment.patient}`}</b>
        </div>
        <div>
          <span>{t("coordinatorEmergency.assignedDoctor")}</span>
          <b>{currentDoctor ? `Dr. ${currentDoctor.name}` : appointment.doctor_name ? `Dr. ${appointment.doctor_name}` : `Doctor #${appointment.doctor}`}</b>
        </div>
      </div>

      <div className="coordinator-emergency-card__reason">
        <span>{t("coordinatorEmergency.reason")}</span>
        <p>{appointment.emergency_reason || appointment.reason || t("coordinatorEmergency.noReasonProvided")}</p>
        {appointment.emergency_description && (
          <small>{appointment.emergency_description}</small>
        )}
      </div>

      {(appointment.emergency_accepted_at || appointment.emergency_completed_at || appointment.emergency_expired_at) && (
        <div className="coordinator-emergency-card__meta">
          {appointment.emergency_accepted_at && (
            <span><CheckCircle2 size={12} /> Accepted {formatDateTime(appointment.emergency_accepted_at)}</span>
          )}
          {appointment.emergency_completed_at && (
            <span><CheckCircle2 size={12} /> Completed {formatDateTime(appointment.emergency_completed_at)}</span>
          )}
          {appointment.emergency_expired_at && (
            <span><Clock3 size={12} /> Expired {formatDateTime(appointment.emergency_expired_at)}</span>
          )}
        </div>
      )}

      {appointment.checked_in_at && (
        <div className="coordinator-emergency-card__checked">
          <CheckCircle2 size={14} /> {t("coordinatorEmergency.patientCheckedIn")}
        </div>
      )}

      {started && !isClosed && (
        <div className="coordinator-emergency-card__locked">
          <Lock size={14} />
          {startedAt
            ? t("coordinatorEmergency.startedAt", { time: startedAt })
            : appointment.status === "in_progress"
              ? t("coordinatorEmergency.inProgressLocked")
              : t("coordinatorEmergency.consultationStarted")}
        </div>
      )}

      {transferable && (
        <div className="coordinator-emergency-card__reassign">
          {availableDoctors.length > 0 ? (
            <>
              <div className="coordinator-appointment-select">
                <Stethoscope size={15} />
                <select
                  value={target}
                  aria-label={`Choose a doctor for emergency ${appointment.id}`}
                  onChange={(event) => setTarget(event.target.value ? Number(event.target.value) : "")}
                >
                  <option value="">Choose available doctor</option>
                  {availableDoctors.map((doctor) => (
                    <option key={doctor.id} value={doctor.id}>Dr. {doctor.name}</option>
                  ))}
                </select>
              </div>
              <Button
                variant="primary"
                loading={saving}
                disabled={!target}
                onClick={() => void transfer()}
              >
                <ArrowRightLeft size={14} /> Transfer
              </Button>
            </>
          ) : (
            <div className="coordinator-emergency-card__closed">
              <Stethoscope size={14} /> No other available doctors to transfer to right now.
            </div>
          )}
        </div>
      )}

      {!transferable && (isClosed || !started) && (
        <div className="coordinator-emergency-card__closed">
          <UserRound size={14} />
          {isClosed
            ? appointment.status === "done"
              ? "This emergency has been completed."
              : `This emergency is ${appointment.status}; no reassignment is needed.`
            : "This emergency is no longer available for reassignment."}
        </div>
      )}
    </Card>
  );
}

export function CoordinatorEmergency({
  appointments,
  doctors,
  loading,
  error,
  onRetry,
  onReassigned,
}: {
  appointments: CoordinatorAppointment[];
  doctors: CoordinatorDoctor[];
  loading: boolean;
  error: string | null;
  onRetry: () => void;
  onReassigned: (appointment: CoordinatorAppointment) => void;
}) {
  const { t } = useTranslation();
  const [filter, setFilter] = useState("all");
  const [search, setSearch] = useState("");

  const rows = appointments.filter((appointment) => appointment.appointment_type === "EMERGENCY");
  const pending = rows.filter((appointment) => appointment.status === "pending").length;
  const accepted = rows.filter((appointment) => appointment.status === "accepted").length;
  const inProgress = rows.filter((appointment) => appointment.status === "in_progress").length;
  const active = rows.filter((appointment) => ["pending", "accepted", "in_progress"].includes(appointment.status)).length;
  const readyToTransfer = rows.filter(canTransfer).length;
  const today = new Date().toISOString().slice(0, 10);
  const todayCount = rows.filter((appointment) => appointment.appointment_date.slice(0, 10) === today).length;

  const filters = [
    { key: "all", label: t("coordinatorEmergency.all"), count: rows.length },
    { key: "pending", label: t("coordinatorEmergency.awaitingReview"), count: pending },
    { key: "accepted", label: t("coordinatorEmergency.accepted"), count: accepted },
    { key: "in_progress", label: t("coordinatorEmergency.inProgressCount"), count: inProgress },
    {
      key: "closed",
      label: t("coordinatorEmergency.closed"),
      count: rows.filter((appointment) => ["done", "cancelled", "rejected", "expired"].includes(appointment.status)).length,
    },
  ];

  const query = search.trim().toLowerCase();
  const filtered = rows.filter((appointment) => {
    const matchesFilter =
      filter === "all"
        ? true
        : filter === "closed"
          ? ["done", "cancelled", "rejected", "expired"].includes(appointment.status)
          : appointment.status === filter;
    if (!matchesFilter) return false;
    if (!query) return true;
    const doctor = doctors.find((item) => item.id === appointment.doctor);
    return `${appointment.id} ${appointment.patient_email} ${appointment.reason} ${appointment.emergency_reason} ${appointment.emergency_description} ${doctor?.name ?? appointment.doctor}`
      .toLowerCase()
      .includes(query);
  });

  return (
    <div className="page doctor-workspace">
      <div className="doctor-page-header">
        <div>
          <p className="doctor-eyebrow">{t("coordinatorDashboard.coordinationCenter")}</p>
          <h1>{t("coordinatorEmergency.emergencyCoordination")}</h1>
          <p>{t("coordinatorEmergency.emergencyCoordinationDesc")}</p>
        </div>
        <div className="doctor-header-actions">
          <Link to="/coordinator/doctors" className="doctor-outline-button">
            <Stethoscope size={16} /> {t("coordinatorDoctors.doctorAvailability")}
          </Link>
        </div>
      </div>

      {error ? (
        <ErrorState message={error} onRetry={onRetry} />
      ) : loading && rows.length === 0 ? (
        <Skeleton lines={8} />
      ) : (
        <>
          <div className="doctor-metrics">
            <Card className="doctor-metric">
              <span className="doctor-metric__icon doctor-metric__icon--red"><Siren size={19} /></span>
              <span>{t("coordinatorEmergency.activeEmergencies")}</span>
              <strong>{active}</strong>
              <small>{todayCount} {t("coordinatorDashboard.today")} · {pending} {t("coordinatorEmergency.awaitingReview")} · {accepted} {t("coordinatorEmergency.accepted")} · {inProgress} {t("coordinatorEmergency.inProgressCount")}</small>
            </Card>
            <Card className="doctor-metric">
              <span className="doctor-metric__icon doctor-metric__icon--amber"><Clock3 size={19} /></span>
              <span>{t("coordinatorEmergency.awaitingReview")}</span>
              <strong>{pending}</strong>
              <small>{pending ? t("coordinatorEmergency.waitingForAcceptance") : t("coordinatorEmergency.nothingWaiting")}</small>
            </Card>
            <Card className="doctor-metric">
              <span className="doctor-metric__icon doctor-metric__icon--violet"><Activity size={19} /></span>
              <span>{t("coordinatorEmergency.careInProgress")}</span>
              <strong>{inProgress}</strong>
              <small>{inProgress ? t("coordinatorEmergency.inProgressLocked") : t("coordinatorEmergency.noEmergencyCare")}</small>
            </Card>
            <Card className="doctor-metric">
              <span className="doctor-metric__icon doctor-metric__icon--teal"><ArrowRightLeft size={19} /></span>
              <span>Ready to transfer</span>
              <strong>{readyToTransfer}</strong>
              <small>Before emergency care starts</small>
            </Card>
          </div>

          <Card className="coordinator-appointments-toolbar">
            <div className="coordinator-appointments-search">
              <Search size={16} />
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder={t("coordinatorEmergency.searchPlaceholder")}
                aria-label={t("coordinatorEmergency.searchAria")}
              />
            </div>
            <div className="coordinator-appointments-filters">
              {filters.map((item) => (
                <button
                  key={item.key}
                  type="button"
                  className={filter === item.key ? "active" : ""}
                  onClick={() => setFilter(item.key)}
                >
                  {item.label} <span>{item.count}</span>
                </button>
              ))}
            </div>
          </Card>

          <p className="coordinator-appointments-count">
            {t("coordinatorEmergency.showing", { filtered: filtered.length, total: rows.length })}
          </p>

          {filtered.length === 0 ? (
            <EmptyState
              icon={<Siren size={28} />}
              title={rows.length === 0 ? t("coordinatorEmergency.noEmergenciesToCoordinate") : t("coordinatorEmergency.noMatching")}
              description={
                rows.length === 0
                  ? "There are no emergency requests to coordinate right now."
                  : "Try a different status filter or search term."
              }
            />
          ) : (
            <div className="coordinator-emergency-grid">
              {filtered.map((appointment) => (
                <EmergencyCard
                  key={appointment.id}
                  appointment={appointment}
                  doctors={doctors}
                  onReassigned={onReassigned}
                />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
