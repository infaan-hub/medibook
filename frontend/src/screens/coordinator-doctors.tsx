import { AlertTriangle, CalendarDays, CheckCircle2, Clock3, Stethoscope } from "lucide-react";
import type { CoordinatorDoctor } from "../api/coordinator";
import { Badge, Card, EmptyState, ErrorState, Skeleton, type BadgeStatus } from "../components/ui";
import { DoctorImage } from "../components/DoctorImage";

function formatDate(date: string) {
  return new Date(`${date.slice(0, 10)}T00:00:00`).toLocaleDateString(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

function labelType(type: string) {
  return type === "NORMAL" ? "Hospital" : type === "EMERGENCY" ? "Emergency" : "Home service";
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
  if (!doctor.is_available) return { label: "Unavailable", tone: "off" as const };
  if (closedAllDay) return { label: "Closed today", tone: "closed" as const };
  if (!doctor.windows.length) return { label: "No schedule", tone: "off" as const };
  return { label: "Available", tone: "available" as const };
}

function exceptionLabel(doctor: CoordinatorDoctor) {
  return doctor.exceptions
    .map((exception) => {
      if (!exception.start_time || !exception.end_time) return exception.reason || "Closed all day";
      return `${shortTime(exception.start_time)}–${shortTime(exception.end_time)}${exception.reason ? ` · ${exception.reason}` : " · Time off"}`;
    })
    .join(" · ");
}

function DoctorCard({ doctor }: { doctor: CoordinatorDoctor }) {
  const free = freeIntervals(doctor);
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
        <h3>Working hours</h3>
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
                    Break {window.breaks.map((b) => `${shortTime(b.start_time)}–${shortTime(b.end_time)}`).join(", ")}
                  </span>
                )}
              </div>
            ))}
          </div>
        ) : (
          <p className="coordinator-doctor-empty">No working hours for this weekday.</p>
        )}
      </div>

      <div className="coordinator-doctor-section">
        <h3>Free times <span>{free.length ? `${free.length} open` : "Fully booked"}</span></h3>
        {free.length ? (
          <div className="coordinator-slot-list">
            {free.map((range, index) => <span className="coordinator-slot" key={`${range}-${index}`}>{range}</span>)}
          </div>
        ) : (
          <p className="coordinator-doctor-empty">No free working time on this date.</p>
        )}
      </div>

      <div className="coordinator-doctor-section">
        <h3>Appointments <span>{doctor.appointments.length}</span></h3>
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
          <p className="coordinator-doctor-empty">No booked appointments on this date.</p>
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
  const available = doctors.filter((doctor) => doctorState(doctor).tone === "available").length;
  const booked = doctors.reduce((sum, doctor) => sum + doctor.appointments.length, 0);
  const openSlots = doctors.reduce((sum, doctor) => sum + freeIntervals(doctor).length, 0);

  return (
    <div className="page doctor-workspace">
      <div className="doctor-page-header">
        <div>
          <p className="doctor-eyebrow">Coordination center</p>
          <h1>Doctors & availability</h1>
          <p>Review working hours, breaks, bookings and open time for {formatDate(date)}.</p>
        </div>
        <div className="doctor-header-actions">
          <label className="coordinator-date-control">
            <CalendarDays size={16} />
            <span>Schedule date</span>
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
          title="No doctors"
          description="There are no doctor profiles to display."
        />
      ) : (
        <>
          <div className="doctor-metrics">
            <Card className="doctor-metric">
              <span className="doctor-metric__icon doctor-metric__icon--teal"><Stethoscope size={19} /></span>
              <span>Doctors on roster</span>
              <strong>{doctors.length}</strong>
              <small>{available} available · {doctors.length - available} unavailable or off</small>
            </Card>
            <Card className="doctor-metric">
              <span className="doctor-metric__icon doctor-metric__icon--amber"><CheckCircle2 size={19} /></span>
              <span>Available today</span>
              <strong>{available}</strong>
              <small>{available === 0 ? "No doctors scheduled" : "Ready to take bookings"}</small>
            </Card>
            <Card className="doctor-metric">
              <span className="doctor-metric__icon doctor-metric__icon--blue"><CalendarDays size={19} /></span>
              <span>Booked appointments</span>
              <strong>{booked}</strong>
              <small>Across {doctors.length} doctor profile{doctors.length === 1 ? "" : "s"}</small>
            </Card>
            <Card className="doctor-metric">
              <span className="doctor-metric__icon doctor-metric__icon--violet"><Clock3 size={19} /></span>
              <span>Open time slots</span>
              <strong>{openSlots}</strong>
              <small>{loading ? "Updating schedule..." : "Available after breaks and bookings"}</small>
            </Card>
          </div>

          <p className="coordinator-doctors-note">
            {loading
              ? "Updating schedule for the selected date..."
              : "Free time is calculated from active working windows after breaks, time-off exceptions and pending or accepted appointments."}
          </p>

          <div className="coordinator-doctor-grid">
            {doctors.map((doctor) => <DoctorCard key={doctor.id} doctor={doctor} />)}
          </div>
        </>
      )}
    </div>
  );
}
