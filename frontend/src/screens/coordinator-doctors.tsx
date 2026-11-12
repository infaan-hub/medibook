import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import i18n from "../i18n";
import { AlertTriangle, CalendarDays, CheckCircle2, Clock3, Stethoscope } from "lucide-react";
import type { CoordinatorDoctor } from "../api/coordinator";
import { Badge, Card, EmptyState, ErrorState, Skeleton, type BadgeStatus } from "../components/ui";
import { DoctorImage } from "../components/DoctorImage";
import { formatDate as intlDate } from "../lib/intl";

function formatDate(date: string) {
  return intlDate(new Date(`${date.slice(0, 10)}T00:00:00`), {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

function labelType(type: string) {
  return type === "NORMAL"
    ? i18n.t("coordinatorDashboard.hospitalAppointment")
    : type === "EMERGENCY"
    ? i18n.t("coordinatorDashboard.emergency")
    : i18n.t("coordinatorDashboard.homeService");
}

function shortTime(time: string) {
  return time.slice(0, 5);
}

/** Active working windows minus breaks, time-off exceptions and live bookings. */
function freeIntervals(doctor: CoordinatorDoctor) {
  if (!doctor.is_available || doctor.exceptions.some((x) => x.start_time === null || x.end_time === null)) return [] as string[];
  const toMin = (time: string) => {
    const [h, m] = time.split(":").map(Number);
    return h * 60 + m;
  };
  const fmt = (n: number) =>
    `${String(Math.floor(n / 60)).padStart(2, "0")}:${String(n % 60).padStart(2, "0")}`;
  return doctor.windows.flatMap((window) => {
    const start = toMin(window.start_time);
    const end = toMin(window.end_time);
    const occupied = [
      ...doctor.exceptions
        .filter((x) => x.start_time && x.end_time)
        .map((x) => ({ start: toMin(x.start_time!), end: toMin(x.end_time!) })),
      ...window.breaks.map((b) => ({ start: toMin(b.start_time), end: toMin(b.end_time) })),
      ...doctor.appointments.map((a) => ({ start: toMin(a.start_time), end: toMin(a.end_time) })),
    ]
      .filter((x) => x.start < end && x.end > start)
      .map((x) => ({ start: Math.max(start, x.start), end: Math.min(end, x.end) }))
      .sort((a, b) => a.start - b.start);
    const merged: { start: number; end: number }[] = [];
    for (const range of occupied) {
      const tail = merged[merged.length - 1];
      if (tail && range.start <= tail.end) tail.end = Math.max(tail.end, range.end);
      else merged.push({ ...range });
    }
    let cursor = start;
    const free: string[] = [];
    for (const range of merged) {
      if (range.start > cursor) free.push(`${fmt(cursor)}–${fmt(range.start)}`);
      cursor = Math.max(cursor, range.end);
    }
    if (cursor < end) free.push(`${fmt(cursor)}–${fmt(end)}`);
    return free;
  });
}

function doctorState(doctor: CoordinatorDoctor) {
  const closedAllDay = doctor.exceptions.some((x) => x.start_time === null || x.end_time === null);
  if (!doctor.is_available) return { label: i18n.t("coordinatorDoctors.unavailable"), tone: "off" as const };
  if (closedAllDay) return { label: i18n.t("coordinatorDoctors.closedToday"), tone: "closed" as const };
  if (!doctor.windows.length) return { label: i18n.t("coordinatorDoctors.noSchedule"), tone: "off" as const };
  return { label: i18n.t("coordinatorDoctors.availableStatus"), tone: "available" as const };
}

function exceptionLabel(doctor: CoordinatorDoctor) {
  return doctor.exceptions
    .map((exception) => {
      if (!exception.start_time || !exception.end_time) return exception.reason || i18n.t("coordinatorDoctors.closedAllDayLabel");
      return `${shortTime(exception.start_time)}–${shortTime(exception.end_time)}${exception.reason ? ` · ${exception.reason}` : ` · ${i18n.t("coordinatorDoctors.timeOff")}`}`;
    })
    .join(" · ");
}

function DoctorCard({ doctor }: { doctor: CoordinatorDoctor }) {
  const { t } = useTranslation();
  const free = useMemo(() => freeIntervals(doctor), [doctor]);
  const state = doctorState(doctor);

  return (
    <Card className="coordinator-doctor-card">
      <div className="coordinator-doctor-card__head">
        <DoctorImage
        src={doctor.profile_image}
        alt={`Dr. ${doctor.name}`}
        width={44}
        height={44}
        sizes="44px"
        className="coordinator-doctor-avatar"
        emptyClassName="coordinator-doctor-avatar--empty"
      />
        <div className="coordinator-doctor-identity">
          <h2>Dr. {doctor.name}</h2>
          <p>{doctor.email}</p>
        </div>
        <span className={`coordinator-doctor-status coordinator-doctor-status--${state.tone}`}>{state.label}</span>
      </div>

      <div className="coordinator-doctor-metrics">
        <div><b>{free.length}</b><small>free slots</small></div>
        <div><b>{doctor.appointments.length}</b><small>booked</small></div>
        <div><b>{doctor.windows.length}</b><small>work windows</small></div>
      </div>

      {doctor.exceptions.length > 0 && (
        <div className="coordinator-doctor-exception">
          <AlertTriangle size={14} />
          <span>{exceptionLabel(doctor)}</span>
        </div>
      )}

      <div className="coordinator-doctor-section">
        <h3>{t("coordinatorDoctors.workingHours")}</h3>
        {doctor.windows.length ? (
          <div className="coordinator-window-list">
            {doctor.windows.map((window, index) => (
              <div className="coordinator-window" key={`${window.start_time}-${index}`}>
                <span className="coordinator-window__time">
                  <Clock3 size={12} />
                  {shortTime(window.start_time)}–{shortTime(window.end_time)}
                </span>
                {window.breaks.length > 0 && (
                  <span className="coordinator-window__break">
                    {t("coordinatorDoctors.break")} {window.breaks.map((b) => `${shortTime(b.start_time)}–${shortTime(b.end_time)}`).join(", ")}
                  </span>
                )}
              </div>
            ))}
          </div>
        ) : (
          <p className="coordinator-doctor-empty">{t("coordinatorDoctors.noWorkingHours")}</p>
        )}
      </div>

      <div className="coordinator-doctor-section">
        <h3>{t("coordinatorDoctors.freeTimes")} <span>{free.length ? `${free.length} ${t("coordinatorDoctors.open")}` : t("coordinatorDoctors.fullyBooked")}</span></h3>
        {free.length ? (
          <div className="coordinator-slot-list">
            {free.map((range, index) => <span className="coordinator-slot" key={`${range}-${index}`}>{range}</span>)}
          </div>
        ) : (
          <p className="coordinator-doctor-empty">{t("coordinatorDoctors.noFreeTime")}</p>
        )}
      </div>

      <div className="coordinator-doctor-section">
        <h3>{t("coordinatorDoctors.appointments")} <span>{doctor.appointments.length}</span></h3>
        {doctor.appointments.length ? (
          <div className="coordinator-doctor-appointments">
            {doctor.appointments.map((appointment) => (
              <div className="coordinator-doctor-appointment" key={appointment.id}>
                <span className="coordinator-doctor-appointment__time">
                  {shortTime(appointment.start_time)}–{shortTime(appointment.end_time)}
                </span>
                <span className="coordinator-doctor-appointment__main">
                  <b>{appointment.patient_name || `Patient #${appointment.patient_id}`}</b>
                  <small>#{appointment.id} · {labelType(appointment.type)}</small>
                </span>
                <Badge status={appointment.status as BadgeStatus} />
              </div>
            ))}
          </div>
        ) : (
          <p className="coordinator-doctor-empty">{t("coordinatorDoctors.noBookedAppointments")}</p>
        )}
      </div>
    </Card>
  );
}

export function CoordinatorDoctors({
  doctors,
  date,
  onDateChange,
  loading,
  error,
  onRetry,
}: {
  doctors: CoordinatorDoctor[];
  date: string;
  onDateChange: (date: string) => void;
  loading: boolean;
  error: string | null;
  onRetry: () => void;
}) {
  const { t } = useTranslation();
  const freeByDoctor = useMemo(() => doctors.map((doctor) => freeIntervals(doctor)), [doctors]);
  const available = doctors.filter((doctor) => doctorState(doctor).tone === "available").length;
  const booked = doctors.reduce((sum, doctor) => sum + doctor.appointments.length, 0);
  const openSlots = freeByDoctor.reduce((sum, free) => sum + free.length, 0);

  return (
    <div className="page doctor-workspace">
      <div className="doctor-page-header">
        <div>
          <p className="doctor-eyebrow">{t("coordinatorDashboard.coordinationCenter")}</p>
          <h1>{t("coordinatorDoctors.doctorsAvailability")}</h1>
          <p>{t("coordinatorDoctors.doctorsAvailabilityDesc", { date: formatDate(date) })}</p>
        </div>
        <div className="doctor-header-actions">
          <label className="coordinator-date-control">
            <CalendarDays size={16} />
            <span>{t("coordinatorDoctors.scheduleDate")}</span>
            <input
              type="date"
              value={date}
              aria-label="Schedule date"
              onChange={(event) => onDateChange(event.target.value)}
            />
          </label>
        </div>
      </div>

      {error ? (
        <ErrorState message={error} onRetry={onRetry} />
      ) : loading && doctors.length === 0 ? (
        <Skeleton lines={8} />
      ) : doctors.length === 0 ? (
        <EmptyState
          icon={<Stethoscope size={28} />}
          title={t("coordinatorDoctors.noDoctors")}
          description={t("coordinatorDoctors.noDoctorsDesc")}
        />
      ) : (
        <>
          <div className="doctor-metrics">
            <Card className="doctor-metric">
              <span className="doctor-metric__icon doctor-metric__icon--teal"><Stethoscope size={19} /></span>
              <span>{t("coordinatorDoctors.doctorsOnRoster")}</span>
              <strong>{doctors.length}</strong>
              <small>{available} {t("coordinatorDoctors.available")} · {doctors.length - available} {t("coordinatorDoctors.unavailableOrOff")}</small>
            </Card>
            <Card className="doctor-metric">
              <span className="doctor-metric__icon doctor-metric__icon--amber"><CheckCircle2 size={19} /></span>
              <span>{t("coordinatorDoctors.availableToday")}</span>
              <strong>{available}</strong>
              <small>{available === 0 ? t("coordinatorDoctors.noDoctorsScheduled") : t("coordinatorDoctors.readyToTakeBookings")}</small>
            </Card>
            <Card className="doctor-metric">
              <span className="doctor-metric__icon doctor-metric__icon--blue"><CalendarDays size={19} /></span>
              <span>{t("coordinatorDoctors.bookedAppointments")}</span>
              <strong>{booked}</strong>
              <small>{t("coordinatorDoctors.acrossProfiles", { count: doctors.length })}{doctors.length === 1 ? "" : "s"}</small>
            </Card>
            <Card className="doctor-metric">
              <span className="doctor-metric__icon doctor-metric__icon--violet"><Clock3 size={19} /></span>
              <span>{t("coordinatorDoctors.openTimeSlots")}</span>
              <strong>{openSlots}</strong>
              <small>{loading ? t("coordinatorDoctors.updatingSchedule") : t("coordinatorDoctors.availableAfterBreaks")}</small>
            </Card>
          </div>

          <p className="coordinator-doctors-note">
            {loading
              ? t("coordinatorDoctors.updatingScheduleForDate")
              : t("coordinatorDoctors.freeTimeCalculated")}
          </p>

          <div className="coordinator-doctor-grid">
            {doctors.map((doctor) => <DoctorCard key={doctor.id} doctor={doctor} />)}
          </div>
        </>
      )}
    </div>
  );
}
