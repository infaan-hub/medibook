import { useState, useMemo } from "react";
import { useTranslation } from "react-i18next";
import i18n from "../i18n";
import { Link } from "react-router-dom";
import { formatDate as intlDate } from "../lib/intl";
import {
  ArrowRightLeft,
  CalendarDays,
  CheckCircle2,
  Clock3,
  Lock,
  Search,
  Stethoscope,
  UserRound,
} from "lucide-react";
import {
  getCoordinatorDoctors,
  isCoordinatorDoctorAvailableFor,
  reassignCoordinatorAppointment,
  type CoordinatorAppointment,
  type CoordinatorDoctor,
} from "../api/coordinator";
import { Badge, Button, Card, EmptyState, ErrorState, Skeleton, type BadgeStatus } from "../components/ui";
import { useToast } from "../state/app-context";

const statusColors: Record<string, string> = {
  accepted: "#0a9f94",
  pending: "#f3a629",
  in_progress: "#7c3aed",
  done: "#2563eb",
  cancelled: "#a9b6bf",
  rejected: "#a9b6bf",
  expired: "#a9b6bf",
};

const statusLabels: Record<string, string> = {
  pending: "Awaiting review",
  accepted: "Accepted",
  in_progress: "In progress",
  done: "Done",
  cancelled: "Cancelled",
  rejected: "Rejected",
  expired: "Expired",
};

function message(error: unknown) {
  return error instanceof Error ? error.message : i18n.t("coordinatorAppointments.unableToUpdate");
}

function formatDate(date: string) {
  return intlDate(new Date(`${date.slice(0, 10)}T00:00:00`), {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function labelType(type: string) {
  return type === "NORMAL" ? "Hospital appointment" : type === "EMERGENCY" ? "Emergency" : "Home service";
}

function canReassign(appointment: CoordinatorAppointment) {
  return (
    (appointment.status === "pending" || appointment.status === "accepted") &&
    !appointment.consultation_started_at &&
    appointment.appointment_type !== "EMERGENCY"
  );
}

function AppointmentCard({
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
  const [dateDoctors, setDateDoctors] = useState<CoordinatorDoctor[] | null>(null);
  const [loadingDateDoctors, setLoadingDateDoctors] = useState(false);
  const [doctorLoadError, setDoctorLoadError] = useState<string | null>(null);
  const currentDoctor = (dateDoctors ?? doctors).find((doctor) => doctor.id === appointment.doctor);
  const availableDoctors = (dateDoctors ?? []).filter((doctor) =>
    isCoordinatorDoctorAvailableFor(doctor, appointment)
  );
  const reassignable = canReassign(appointment);

  async function loadDateDoctors() {
    if (dateDoctors || loadingDateDoctors) return;
    setLoadingDateDoctors(true);
    setDoctorLoadError(null);
    try {
      const response = await getCoordinatorDoctors(appointment.appointment_date);
      setDateDoctors(response.data);
    } catch (error) {
      setDoctorLoadError(message(error));
    } finally {
      setLoadingDateDoctors(false);
    }
  }

  async function transfer() {
    if (!target) {
      notify("error", t("coordinatorAppointments.selectDoctorFirst"));
      return;
    }
    setSaving(true);
    try {
      const response = await reassignCoordinatorAppointment(appointment.id, target);
      onReassigned(response.data);
      setTarget("");
      notify("success", t("coordinatorAppointments.reassigned"));
    } catch (error) {
      notify("error", message(error));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card
      className="coordinator-appointment-card"
      style={{ borderLeftColor: statusColors[appointment.status] ?? "#a9b6bf" }}
    >
      <div className="coordinator-appointment-card__head">
        <div className="coordinator-appointment-card__reference">
          <span
            className="coordinator-appointment-card__dot"
            style={{ background: statusColors[appointment.status] ?? "#a9b6bf" }}
          />
          <span className="coordinator-appointment-card__type">{labelType(appointment.appointment_type)}</span>
          <span className="coordinator-appointment-card__id">#{appointment.id}</span>
        </div>
        <Badge status={appointment.status as BadgeStatus} />
      </div>

      <div className="coordinator-appointment-card__when">
        <span><CalendarDays size={15} /> {formatDate(appointment.appointment_date)}</span>
        <span><Clock3 size={15} /> {appointment.start_time.slice(0, 5)}–{appointment.end_time.slice(0, 5)}</span>
      </div>

      <div className="coordinator-appointment-card__details">
        <div>
          <span>{t("coordinatorAppointments.patient")}</span>
          <b>{appointment.patient_email || `Patient #${appointment.patient}`}</b>
        </div>
        <div>
          <span>{t("coordinatorAppointments.doctor")}</span>
          <b>{currentDoctor ? `Dr. ${currentDoctor.name}` : appointment.doctor_name ? `Dr. ${appointment.doctor_name}` : `Doctor #${appointment.doctor}`}</b>
        </div>
        <div className="coordinator-appointment-card__reason">
          <span>{t("coordinatorAppointments.reason")}</span>
          <p>{appointment.reason || t("coordinatorAppointments.noReasonProvided")}</p>
        </div>
      </div>

      {appointment.checked_in_at && (
        <div className="coordinator-appointment-card__checked">
          <CheckCircle2 size={14} /> {t("coordinatorAppointments.patientCheckedIn")}
        </div>
      )}

      {appointment.consultation_started_at && (
        <div className="coordinator-appointment-card__locked">
          <Lock size={14} /> {t("coordinatorAppointments.consultationStarted")}
        </div>
      )}

      {reassignable && (
        <div className="coordinator-appointment-card__reassign">
          <div className="coordinator-appointment-select">
            <Stethoscope size={15} />
            <select
              value={target}
              aria-label={`Choose a doctor for appointment ${appointment.id}`}
              onFocus={() => void loadDateDoctors()}
              onChange={(event) => setTarget(event.target.value ? Number(event.target.value) : "")}
            >
              <option value="">
                {loadingDateDoctors
                  ? t("coordinatorAppointments.checkingAvailability")
                  : doctorLoadError
                    ? t("coordinatorAppointments.couldNotCheckAvailability")
                    : dateDoctors
                      ? availableDoctors.length
                        ? t("coordinatorAppointments.selectDoctor")
                        : t("coordinatorAppointments.noDoctorsFree")
                      : t("coordinatorAppointments.checkAvailability")}
              </option>
              {availableDoctors.map((doctor) => (
                <option key={doctor.id} value={doctor.id}>Dr. {doctor.name}</option>
              ))}
            </select>
          </div>
          <Button
            variant="primary"
            loading={saving}
            disabled={!target || !dateDoctors || loadingDateDoctors}
            onClick={() => void transfer()}
          >
            <ArrowRightLeft size={14} /> {t("coordinatorAppointments.transfer")}
          </Button>
          {dateDoctors && availableDoctors.length === 0 && (
            <div className="coordinator-appointment-card__closed">
              <Stethoscope size={14} /> {t("coordinatorAppointments.noOtherDoctor")}
            </div>
          )}
          {doctorLoadError && <div className="coordinator-appointment-card__closed"><Stethoscope size={14} /> {doctorLoadError}</div>}
        </div>
      )}

      {!reassignable && !appointment.consultation_started_at && (
        <div className="coordinator-appointment-card__closed">
          <UserRound size={14} /> This appointment is {t(`appointments.status.${appointment.status}`)}; no reassignment is needed.
        </div>
      )}
    </Card>
  );
}

export function CoordinatorAppointments({
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

  const rows = appointments.filter((appointment) => appointment.appointment_type !== "EMERGENCY");
  const pending = rows.filter((appointment) => appointment.status === "pending").length;
  const accepted = rows.filter((appointment) => appointment.status === "accepted").length;
  const inProgress = rows.filter((appointment) => appointment.status === "in_progress").length;
  const readyToReassign = rows.filter(canReassign).length;
  const homeService = rows.filter((appointment) => appointment.appointment_type === "HOME_SERVICE").length;

  const filters = [
    { key: "all", label: t("coordinatorAppointments.all"), count: rows.length },
    { key: "pending", label: t("coordinatorAppointments.pending"), count: pending },
    { key: "accepted", label: t("coordinatorAppointments.accepted"), count: accepted },
    { key: "in_progress", label: t("coordinatorAppointments.inProgress"), count: inProgress },
    { key: "done", label: t("coordinatorAppointments.done"), count: rows.filter((appointment) => appointment.status === "done").length },
    {
      key: "closed",
      label: t("coordinatorAppointments.closed"),
      count: rows.filter((appointment) => ["cancelled", "rejected", "expired"].includes(appointment.status)).length,
    },
  ];

  const query = search.trim().toLowerCase();
  const filtered = useMemo(() => rows.filter((appointment) => {
    const matchesFilter =
      filter === "all"
        ? true
        : filter === "closed"
          ? ["cancelled", "rejected", "expired"].includes(appointment.status)
          : appointment.status === filter;
    if (!matchesFilter) return false;
    if (!query) return true;
    return `${appointment.id} ${appointment.patient_email} ${appointment.reason} ${appointment.doctor} ${labelType(appointment.appointment_type)}`
      .toLowerCase()
      .includes(query);
  }), [rows, filter, query]);

  return (
    <div className="page doctor-workspace">
      <div className="doctor-page-header">
        <div>
          <p className="doctor-eyebrow">{t("coordinatorDashboard.coordinationCenter")}</p>
          <h1>{t("coordinatorAppointments.appointments")}</h1>
          <p>{t("coordinatorAppointments.appointmentsDesc")}</p>
        </div>
        <div className="doctor-header-actions">
          <Link to="/coordinator/doctors" className="doctor-outline-button">
            <Stethoscope size={16} /> {t("coordinatorAppointments.doctorAvailability")}
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
              <span className="doctor-metric__icon doctor-metric__icon--teal"><CalendarDays size={19} /></span>
              <span>{t("coordinatorAppointments.totalAppointments")}</span>
              <strong>{rows.length}</strong>
              <small>{homeService} {t("coordinatorAppointments.homeService")} · {rows.length - homeService} {t("coordinatorAppointments.hospital")}</small>
            </Card>
            <Card className="doctor-metric">
              <span className="doctor-metric__icon doctor-metric__icon--amber"><Clock3 size={19} /></span>
              <span>{t("coordinatorAppointments.awaitingReview")}</span>
              <strong>{pending}</strong>
              <small>{pending ? t("coordinatorAppointments.waitingForAcceptance") : t("coordinatorAppointments.nothingWaiting")}</small>
            </Card>
            <Card className="doctor-metric">
              <span className="doctor-metric__icon doctor-metric__icon--blue"><CheckCircle2 size={19} /></span>
              <span>{t("coordinatorAppointments.accepted")}</span>
              <strong>{accepted}</strong>
              <small>{inProgress} {t("coordinatorAppointments.consultationsInProgress")}</small>
            </Card>
            <Card className="doctor-metric">
              <span className="doctor-metric__icon doctor-metric__icon--violet"><ArrowRightLeft size={19} /></span>
              <span>{t("coordinatorAppointments.readyToReassign")}</span>
              <strong>{readyToReassign}</strong>
              <small>{t("coordinatorAppointments.beforeConsultationStarts")}</small>
            </Card>
          </div>

          <Card className="coordinator-appointments-toolbar">
            <div className="coordinator-appointments-search">
              <Search size={16} />
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder={t("coordinatorAppointments.searchPlaceholder")}
                aria-label={t("coordinatorAppointments.searchAria")}
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
            {t("coordinatorAppointments.showing", { filtered: filtered.length, total: rows.length })}
          </p>

          {filtered.length === 0 ? (
            <EmptyState
              icon={<CalendarDays size={28} />}
              title={t("coordinatorAppointments.noMatching")}
              description={rows.length === 0 ? t("coordinatorAppointments.noAppointmentsToCoordinate") : t("coordinatorAppointments.tryDifferentFilter")}
            />
          ) : (
            <div className="coordinator-appointment-grid">
              {filtered.map((appointment) => (
                <AppointmentCard
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
