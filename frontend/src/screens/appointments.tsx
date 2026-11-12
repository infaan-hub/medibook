/**
 * PHASE 10–11 — Appointment Engine: booking flow, list, detail, cancel, reschedule, success.
 * Patient books from doctor profile → selects slot → confirms → views list/detail/cancel/reschedule.
 */

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import i18n from "../i18n";
import {
  cancelAppointment,
  completeAppointment,
  createAppointment,
  deleteAppointment,
  getAppointment,
  listMyAppointments,
} from "../api/appointments";
import { getDoctor, getDoctorAvailability, getDoctorAvailableDays } from "../api/doctors";
import { getHospital } from "../api/specialties";
import { getPatientProfile, getPatientProfileById, updatePatientProfile } from "../api/patients";
import { ApiError } from "../api/client";
import { formatDate as formatIntlDate } from "../lib/intl";
import { getQueue, checkIn, startConsultation, type QueueSlot } from "../api/queue";
import { respondToEmergency } from "../api/emergency";
import type {
  Appointment,
  AppointmentStatus,
  DoctorAvailability,
  DoctorAvailableDays,
  DoctorProfile,
  Hospital,
  PatientProfile,
} from "../api/types";
import { Button, Card, EmptyState, ErrorState, Skeleton } from "../components/ui";
import { Modal } from "../components/Modal";
import { LocationPrompt } from "../components/LocationPrompt";
import { NotificationPrompt } from "../components/NotificationPrompt";
import { usePushNotifications } from "../push/usePushNotifications";
import { pushStateNeedsPrompt } from "../push/prompt";
import { captureFix, type CapturedFix } from "../lib/location";
import { useSession, useToast } from "../state/app-context";
import { useRealtimeEvent, useRealtimeSync } from "../realtime/socket";
import { ArrowLeft, CheckCircle2, Heart, Droplet, AlertTriangle, FileText, User, Clock3, XCircle, Calendar, Phone, MapPin, Users, UserCheck, Play, House, Building2 } from "lucide-react";

/* ---------- helpers ---------- */

function message(error: unknown): string {
  return error instanceof Error ? error.message : i18n.t("common.tryAgainError");
}

/**
 * The booking gate: the API answers 403 with
 * `{ errors: { location: ["patient" | "doctor" | "both"] } }` when either side
 * has no coordinates on file. Returns whose prompt should open, or null when
 * this error is unrelated to location.
 */
function locationGateFromError(error: unknown): "patient" | "doctor" | null {
  if (!(error instanceof ApiError) || error.status !== 403) return null;
  const flags = error.errors.location;
  if (!Array.isArray(flags) || flags.length === 0) return null;
  // "both" → fix the patient's side first; the doctor's gap is re-derived below.
  return flags[0] === "doctor" ? "doctor" : "patient";
}

/**
 * The exact sentence the API's booking gate sends with its 409
 * (activeAppointmentMessage) — one open appointment per patient until the
 * doctor marks it done — so the proactive gate below and a refused booking
 * read identically.
 */
function openAppointmentMessage(
  appointment: Appointment,
  t: (key: string, options?: Record<string, unknown>) => string
): string {
  const date = formatIntlDate(`${appointment.appointment_date.slice(0, 10)}T00:00:00`, {
    weekday: "short",
    year: "numeric",
    month: "short",
    day: "numeric",
  });
  const clock = appointment.start_time.slice(0, 5);
  return t("appointments.openAppointmentMessage", { date, time: clock });
}

function formatTime(t: string): string {
  return t.slice(0, 5);
}

function formatDate(d: string): string {
  const dt = new Date(d + "T00:00:00");
  return formatIntlDate(dt, { weekday: "short", year: "numeric", month: "short", day: "numeric" });
}

function localDayKey(date = new Date()): string {
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

const STATUS_KEYS: Record<AppointmentStatus, string> = {
  pending: "appointments.status.pending",
  accepted: "appointments.status.accepted",
  in_progress: "appointments.status.in_progress",
  done: "appointments.status.done",
  cancelled: "appointments.status.cancelled",
  rejected: "appointments.status.rejected",
  expired: "appointments.status.expired",
};

function StatusBadge({ status }: { status: AppointmentStatus }) {
  const { t } = useTranslation();
  return <span className={`badge badge--${status}`}>{t(STATUS_KEYS[status])}</span>;
}

function DoctorName({ doctorId }: { doctorId: number | null }) {
  const { t } = useTranslation();
  const [name, setName] = useState("");
  useEffect(() => {
    if (!doctorId) {
      setName("");
      return;
    }
    getDoctor(doctorId).then((r) => setName(`Dr. ${r.data.first_name} ${r.data.last_name}`)).catch(() => {});
  }, [doctorId]);
  return <>{name || (doctorId ? t("appointments.doctorNumber", { id: doctorId }) : "")}</>;
}

/* Doctor phone is only requested from a specific appointment detail. */
function DoctorPhone({ doctorId, appointmentId }: { doctorId: number | null; appointmentId: number }) {
  const { t } = useTranslation();
  const [phone, setPhone] = useState<string | null>(null);
  useEffect(() => {
    if (!doctorId) return;
    setPhone(null);
    getDoctor(doctorId, appointmentId).then((r) => setPhone(r.data.phone ?? null)).catch(() => {});
  }, [doctorId, appointmentId]);
  if (!phone) return null;
  return (
    <div className="appt-detail__field">
      <span className="appt-detail__label">{t("appointments.doctorPhone")}</span>
      <a href={`tel:${phone}`}>{phone}</a>
    </div>
  );
}

/* ======================================
   BOOKING FLOW — from doctor profile page
   ====================================== */

type VisitMode = "centre" | "home";

/** Legacy fallback for older normal appointments that never stored a hospital
 *  id; new bookings always resolve a real centre or keep their GPS address. */
const DEFAULT_CENTRE = {
  name: "Dhuran Special Need Centre",
  address: "Jambiani Main Road, Kibigija, Tanzania",
  city: "Jambiani, Tanzania",
  maps: "https://www.google.com/maps/dir/?api=1&destination=-6.3024%2C39.5402",
};

function centreMapsUrl(hospital: Hospital | null, fallback = DEFAULT_CENTRE.maps): string {
  if (!hospital) return fallback;
  const query = [hospital.name, hospital.address, hospital.city].filter(Boolean).join(", ");
  return query
    ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`
    : fallback;
}

/** The shared "share/refresh current location" controls used by both booking
 *  routes and by the home-visit choice on a normal booking. */
function CurrentLocationPanel({
  profile,
  saving,
  onCapture,
}: {
  profile: PatientProfile | null;
  saving: boolean;
  onCapture: () => void;
}) {
  const { t } = useTranslation();
  return (
    <>
      <h3 className="booking-home-location__title">{t("booking.homeLocationTitle")}</h3>
      <p className="page__subtitle">{t("booking.homeLocationDesc")}</p>
      {profile?.latitude != null && profile.longitude != null ? (
        <p className="booking-home-location__coords">
          {profile.latitude.toFixed(5)}, {profile.longitude.toFixed(5)}
        </p>
      ) : (
        <p className="form-note--error">{t("booking.shareLocationToContinue")}</p>
      )}
      <Button variant="secondary" disabled={!profile} loading={saving} onClick={onCapture}>
        <MapPin size={15} /> {t("booking.useCurrentLocation")}
      </Button>
    </>
  );
}

export function BookingScreen() {
  const { t } = useTranslation();
  const { id } = useParams<{ id: string }>();
  const route = useLocation();
  const isHomeService = route.pathname.startsWith("/home-visit");
  const navigate = useNavigate();
  const [doctor, setDoctor] = useState<DoctorProfile | null>(null);
  const [patientProfile, setPatientProfile] = useState<PatientProfile | null>(null);
  /** Centre visits are the default on /booking; /home-visit forces a home visit. */
  const [visitMode, setVisitMode] = useState<VisitMode>(isHomeService ? "home" : "centre");
  const [hospitals, setHospitals] = useState<Hospital[]>([]);
  const [selectedHospitalId, setSelectedHospitalId] = useState<number | null>(null);
  const [hospitalsLoading, setHospitalsLoading] = useState(false);

  const today = new Date();
  const [calYear, setCalYear] = useState(today.getFullYear());
  const [calMonth, setCalMonth] = useState(today.getMonth() + 1);
  const [availableDays, setAvailableDays] = useState<DoctorAvailableDays | null>(null);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [availability, setAvailability] = useState<DoctorAvailability | null>(null);
  const [selectedTime, setSelectedTime] = useState("");
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [slotsLoading, setSlotsLoading] = useState(false);
  /** Set when the API answered 403 `errors.location` — the proactive gate
   *  (below) covers the first visit, this catches a stale/changed profile. */
  const [gateOverride, setGateOverride] = useState<"patient" | "doctor" | null>(null);
  const [savingLocation, setSavingLocation] = useState(false);
  /** This patient's oldest open booking (pending/accepted), if they hold one. */
  const [openAppointment, setOpenAppointment] = useState<Appointment | null>(null);

  const loadDoctor = useCallback(() => {
    if (!id) return;
    setError(null);
    getDoctor(Number(id)).then((r) => setDoctor(r.data)).catch((e) => setError(message(e)));
  }, [id]);

  const loadAvailableDays = useCallback(() => {
    if (!id) return;
    setError(null);
    setAvailableDays(null);
    getDoctorAvailableDays(Number(id), calYear, calMonth)
      .then((r) => setAvailableDays(r.data))
      .catch((e) => setError(message(e)));
  }, [id, calYear, calMonth]);

  const loadSlots = useCallback((preserveSelection = false) => {
    if (!id || !selectedDate) return;
    setSlotsLoading(true);
    setAvailability(null);
    if (!preserveSelection) setSelectedTime("");
    getDoctorAvailability(Number(id), selectedDate)
      .then((r) => { setAvailability(r.data); setSlotsLoading(false); })
      .catch((e) => { setError(message(e)); setSlotsLoading(false); });
  }, [id, selectedDate]);

  useEffect(() => { loadDoctor(); }, [loadDoctor]);
  useEffect(() => { loadAvailableDays(); }, [loadAvailableDays]);
  useEffect(() => { loadSlots(); }, [loadSlots]);
  useEffect(() => {
    getPatientProfile()
      .then((r) => setPatientProfile(r.data))
      .catch(() => setPatientProfile(null));
  }, []);

  // Resolve the doctor's centres once so a clinic booking can name the exact
  // place (and so the booking does not require the patient's GPS for it).
  useEffect(() => {
    if (!doctor || isHomeService || doctor.hospitals.length === 0) {
      setHospitals([]);
      setSelectedHospitalId(null);
      setHospitalsLoading(false);
      return;
    }
    let active = true;
    setHospitalsLoading(true);
    Promise.all(
      doctor.hospitals.map((hospitalId) =>
        getHospital(hospitalId)
          .then((r) => r.data)
          .catch(() => null)
      )
    )
      .then((rows) => {
        if (!active) return;
        const list = rows.filter((row): row is Hospital => row !== null);
        setHospitals(list);
        setSelectedHospitalId((current) =>
          current != null && list.some((row) => row.id === current)
            ? current
            : list[0]?.id ?? null
        );
      })
      .finally(() => {
        if (active) setHospitalsLoading(false);
      });
    return () => {
      active = false;
    };
  }, [doctor, isHomeService]);

  // One open appointment per patient: name the appointment being held before a
  // slot is picked, so the API's 409 never lands as a surprise. A failed lookup
  // stays silent — the booking POST enforces the rule either way.
  const loadOpenAppointment = useCallback(() => {
    if (!patientProfile) return; // doctors and admins are not gated
    Promise.all([
      listMyAppointments({ status: "pending" }),
      listMyAppointments({ status: "accepted" }),
      listMyAppointments({ status: "in_progress" }),
    ])
      .then(([pending, accepted, inProgress]) => {
        const rows = [...pending.data.results, ...accepted.data.results, ...inProgress.data.results].sort(
          (a, b) =>
            a.appointment_date.localeCompare(b.appointment_date) ||
            a.start_time.localeCompare(b.start_time)
        );
        setOpenAppointment(rows[0] ?? null);
      })
      .catch(() => setOpenAppointment(null));
  }, [patientProfile]);

  useEffect(() => { loadOpenAppointment(); }, [loadOpenAppointment]);

  // Another client booked a slot on this doctor/date — refresh open slots live.
  useRealtimeEvent((event, payload) => {
    if (event !== "doctor.availability.updated") return;
    if (!id || !selectedDate) return;
    if (payload?.doctor_id != null && Number(payload.doctor_id) !== Number(id)) return;
    if (payload?.date && payload.date !== selectedDate) return;
    if (submitting) return;
    loadSlots(true);
  });

  function prevMonth() {
    if (calMonth === 1) { setCalMonth(12); setCalYear((y) => y - 1); }
    else { setCalMonth((m) => m - 1); }
    setSelectedDate(null);
    setAvailability(null);
    setSelectedTime("");
  }

  function nextMonth() {
    if (calMonth === 12) { setCalMonth(1); setCalYear((y) => y + 1); }
    else { setCalMonth((m) => m + 1); }
    setSelectedDate(null);
    setAvailability(null);
    setSelectedTime("");
  }

  function selectDay(dayStr: string) {
    setSelectedDate(dayStr);
    setSelectedTime("");
  }

  async function handleBook(event: FormEvent) {
    event.preventDefault();
    if (!id || !selectedTime || !selectedDate) return;
    const isHomeVisit = visitMode === "home";
    const homeServiceLocation = isHomeVisit && patientProfile?.latitude != null && patientProfile.longitude != null
      ? { latitude: patientProfile.latitude, longitude: patientProfile.longitude, accuracy: patientProfile.location_accuracy }
      : null;
    if (isHomeVisit && !homeServiceLocation) {
      setGateOverride("patient");
      setError(t("booking.shareLocationForHome"));
      return;
    }
    // A centre with no hospital record still needs both sides on file; a
    // resolved centre carries its own address, so GPS is not required.
    if (!isHomeVisit && !hospitalsLoading && hospitals.length === 0) {
      if (!patientProfile?.has_location) {
        setGateOverride("patient");
        return;
      }
      if (doctor && !doctor.has_location) {
        setGateOverride("doctor");
        return;
      }
    }
    setSubmitting(true);
    setError(null);

    // Compute end time = start + 30 minutes.
    const [startH, startM] = selectedTime.split(":").map(Number);
    const startSec = startH * 3600 + startM * 60;
    const endSec = startSec + 30 * 60;
    const pad = (n: number) => String(n).padStart(2, "0");
    const startTime = `${pad(Math.floor(startSec / 3600))}:${pad(Math.floor((startSec % 3600) / 60))}:00`;
    const endTime = `${pad(Math.floor(endSec / 3600))}:${pad(Math.floor((endSec % 3600) / 60))}:00`;

    try {
      const result = await createAppointment({
        doctor: Number(id),
        appointment_type: isHomeVisit ? "HOME_SERVICE" : "NORMAL",
        ...(!isHomeVisit && selectedHospitalId != null ? { hospital: selectedHospitalId } : {}),
        ...(homeServiceLocation ? {
          home_service_latitude: homeServiceLocation.latitude,
          home_service_longitude: homeServiceLocation.longitude,
          home_service_location_accuracy: homeServiceLocation.accuracy,
        } : {}),
        appointment_date: selectedDate,
        start_time: startTime,
        end_time: endTime,
        reason,
      });
      // apiPost throws on non-2xx, so reaching here means HTTP 2xx.
      // But the envelope might still carry success: false.
      if (!result.success) {
        throw new ApiError(result.message || i18n.t("booking.failed"), 409, result.errors);
      }
      navigate(isHomeVisit ? "/home-visit/success" : "/booking/success");
    } catch (e) {
      // Location refused → open the guided prompt instead of a raw error line.
      const gate = locationGateFromError(e);
      if (gate) {
        setGateOverride(gate);
        setError(null);
      } else {
        // Axios throws on 409/5xx before envelope() runs, so the error reaches
        // here as an ApiError thrown by the response interceptor. Pull the
        // server's message from it, falling back to the raw Axios payload.
        let errorMessage: string;
        if (e instanceof ApiError) {
          errorMessage = e.message;
        } else if (
          e &&
          typeof e === "object" &&
          "response" in e &&
          (e as { response?: { data?: any; status?: number } }).response?.data
        ) {
          const data = (e as { response?: { data?: any } }).response?.data;
          errorMessage = data?.message || i18n.t("common.requestFailed");
        } else {
          errorMessage = message(e);
        }
        setError(errorMessage);
      }
      // Reconcile with server (another client may have taken it while we failed).
      loadSlots(true);
      // 409 = the slot went, or an open appointment still holds this patient's
      // slot — re-check the gate so the screen explains it instead of re-failing.
      if (e instanceof ApiError && e.status === 409) loadOpenAppointment();
    } finally {
      setSubmitting(false);
    }
  }

  /** Persist the captured fix on the patient profile, then drop the gate. */
  async function savePatientLocation(fix: CapturedFix) {
    setSavingLocation(true);
    try {
      const updated = await updatePatientProfile({
        latitude: fix.latitude,
        longitude: fix.longitude,
        location_accuracy: fix.accuracy,
      });
      setPatientProfile(updated.data);
      setGateOverride(null);
    } finally {
      setSavingLocation(false);
    }
  }

  async function useCurrentLocation() {
    try {
      await savePatientLocation(await captureFix());
    } catch (reason) {
      setError(message(reason));
    }
  }

  // A resolved centre carries its own address, so only a home visit (or a
  // centre-less doctor) needs location prompts before booking.
  const centreNeedsGps = !hospitalsLoading && hospitals.length === 0;
  const derivedGate =
    !doctor || (visitMode === "centre" && !centreNeedsGps)
      ? null
      : visitMode === "home"
        ? !patientProfile?.has_location
          ? "patient"
          : null
        : !patientProfile?.has_location
          ? "patient"
          : !doctor.has_location
            ? "doctor"
            : null;
  const locationGate = gateOverride ?? derivedGate;
  const selectedHospital =
    hospitals.find((hospital) => hospital.id === selectedHospitalId) ?? hospitals[0] ?? null;

  if (error && !doctor) return <div className="page"><ErrorState message={error} onRetry={loadDoctor} /></div>;
  if (!doctor) return <div className="page"><Skeleton lines={6} /></div>;

  // Blocking gate: the API refuses a second open appointment with a 409, so
  // send the patient to the one they are holding instead of a refused submit.
  if (openAppointment) {
    return (
      <div className="page">
        <Link to={isHomeService ? `/home-visit/doctors/${id}` : `/doctors/${id}`}><ArrowLeft size={16} /> {t("booking.backToDoctor")}</Link>
        <Card className="card--fit">
          <h1 className="page__title">{isHomeService ? t("booking.bookHomeVisit") : t("booking.title")}</h1>
          <p className="page__subtitle">
            Dr. {doctor.first_name} {doctor.last_name}
          </p>
          <EmptyState
            icon={<Calendar size={28} />}
            title={t("booking.finishCurrentTitle")}
            description={openAppointmentMessage(openAppointment, t)}
            action={
              <div style={{ display: "flex", gap: 12, alignItems: "center", justifyContent: "center" }}>
                <Link to="/appointments">{t("appointments.viewMine")}</Link>
                <Button variant="secondary" onClick={loadOpenAppointment}>{t("booking.checkAgain")}</Button>
              </div>
            }
          />
        </Card>
      </div>
    );
  }

  const calDays = new Date(calYear, calMonth, 0).getDate();
  const firstDayOfWeek = (new Date(calYear, calMonth - 1, 1).getDay() + 6) % 7;
  const daySet = new Set(availableDays?.available_days ?? []);
  const monthName = formatIntlDate(new Date(calYear, calMonth - 1), { month: "long", year: "numeric" });
  // 1 Jan 2024 was a Monday — format a stable week with the active locale.
  const weekdayLabels = Array.from({ length: 7 }, (_, index) =>
    formatIntlDate(new Date(2024, 0, 1 + index), { weekday: "short" })
  );

  return (
    <div className="page">
      <Link to={isHomeService ? `/home-visit/doctors/${id}` : `/doctors/${id}`}><ArrowLeft size={16} /> {t("booking.backToDoctor")}</Link>

      <Card className="card--fit">
        <h1 className="page__title">{isHomeService ? t("booking.bookHomeVisit") : t("booking.title")}</h1>
        <p className="page__subtitle">
          Dr. {doctor.first_name} {doctor.last_name}
          {doctor.specialties && doctor.specialties.length > 0
            ? ` — ${doctor.specialties.map((s) => s.patient_friendly_name || s.name).join(", ")}`
            : ""}
        </p>
      </Card>

      {isHomeService && (
        <Card className="booking-home-location">
          <CurrentLocationPanel
            profile={patientProfile}
            saving={savingLocation}
            onCapture={() => void useCurrentLocation()}
          />
        </Card>
      )}
      {/* Patient medical info preview */}
      {patientProfile && (
        <Card className="booking-medical-card">
          <div className="booking-medical-card__header">
            <Heart size={16} />
            <h2>{t("booking.medicalInfoTitle")}</h2>
            <span className="booking-medical-card__shared">{t("booking.visibleToDoctor")}</span>
          </div>
          <div className="booking-medical-card__grid">
            {patientProfile.blood_group && (
              <div className="booking-medical-card__field">
                <Droplet size={13} />
                <span className="booking-medical-card__label">{t("booking.blood")}</span>
                <span className="booking-medical-card__value">{patientProfile.blood_group}</span>
              </div>
            )}
            {patientProfile.gender && (
              <div className="booking-medical-card__field">
                <span className="booking-medical-card__label">{t("settings.gender")}</span>
                <span className="booking-medical-card__value">{patientProfile.gender}</span>
              </div>
            )}
            {patientProfile.date_of_birth && (
              <div className="booking-medical-card__field">
                <span className="booking-medical-card__label">{t("settings.dateOfBirth")}</span>
                <span className="booking-medical-card__value">{patientProfile.date_of_birth}</span>
              </div>
            )}
            {patientProfile.allergies && (
              <div className="booking-medical-card__field booking-medical-card__field--warn">
                <AlertTriangle size={13} />
                <span className="booking-medical-card__label">{t("settings.allergies")}</span>
                <span className="booking-medical-card__value">{patientProfile.allergies}</span>
              </div>
            )}
            {patientProfile.medical_history && (
              <div className="booking-medical-card__field booking-medical-card__field--full">
                <FileText size={13} />
                <span className="booking-medical-card__label">{t("settings.medicalHistory")}</span>
                <span className="booking-medical-card__value">{patientProfile.medical_history}</span>
              </div>
            )}
            {!patientProfile.blood_group && !patientProfile.allergies && !patientProfile.medical_history && (
              <div className="booking-medical-card__field booking-medical-card__field--full">
                <span className="booking-medical-card__value booking-medical-card__value--muted">
                  {t("booking.noMedicalDetails")} <Link to="/settings">{t("booking.addMedicalDetails")}</Link>
                </span>
              </div>
            )}
          </div>
        </Card>
      )}

      {/* Step 1: Pick a day from calendar */}
      <Card>
        <h2>{t("booking.selectDay")}</h2>
        <div className="booking-cal-nav">
          <Button variant="secondary" onClick={prevMonth}>&larr; {t("common.previous")}</Button>
          <span className="booking-cal-month">{monthName}</span>
          <Button variant="secondary" onClick={nextMonth}>{t("common.next")} &rarr;</Button>
        </div>
        <div className="booking-cal-weekdays">
          {weekdayLabels.map((d) => (
            <span key={d} className="booking-cal-weekday">{d}</span>
          ))}
        </div>
        <div className="booking-cal-grid">
          {Array.from({ length: firstDayOfWeek }).map((_, i) => (
            <span key={`empty-${i}`} className="booking-cal-day booking-cal-day--empty" />
          ))}
          {Array.from({ length: calDays }).map((_, i) => {
            const day = i + 1;
            const dateStr = `${calYear}-${String(calMonth).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
            const isToday = dateStr === today.toISOString().slice(0, 10);
            const isAvailable = daySet.has(dateStr);
            const isSelected = dateStr === selectedDate;
            const isPast = new Date(dateStr + "T00:00:00") < new Date(today.getFullYear(), today.getMonth(), today.getDate());
            return (
              <button
                key={day}
                type="button"
                className={`booking-cal-day${isSelected ? " booking-cal-day--selected" : ""}${isAvailable ? " booking-cal-day--available" : ""}${isToday ? " booking-cal-day--today" : ""}${isPast ? " booking-cal-day--past" : ""}`}
                onClick={() => isAvailable && selectDay(dateStr)}
                disabled={!isAvailable || isPast}
              >
                {day}
              </button>
            );
          })}
        </div>
        <p className="booking-cal-hint">
          {daySet.size > 0
            ? t("booking.daysAvailable", { count: daySet.size })
            : t("booking.noDaysThisMonth")}
        </p>
      </Card>

      {/* Step 2: Choose any available start time */}
      {selectedDate && (
        <Card>
          <h2>{t("booking.chooseTime", { date: formatDate(selectedDate) })}</h2>
          {slotsLoading ? (
            <Skeleton lines={3} />
          ) : availability === null ? (
            <Skeleton lines={3} />
          ) : availability.slots.length === 0 ? (
            <EmptyState title={t("booking.noTimesTitle")} description={t("booking.noTimesDesc")} />
          ) : (
            <>
              <p className="page__subtitle">
                {t("booking.availableWindows", {
                  windows: availability.windows.map((w) => ` ${w.start_time}–${w.end_time}`).join(""),
                })}
              </p>
              <div className="field">
                <label className="field__label" htmlFor="book-time">{t("booking.preferredStart")}</label>
                <input
                  id="book-time"
                  className="field__input"
                  type="time"
                  step={60}
                  value={selectedTime}
                  onChange={(event) => {
                    setSelectedTime(event.target.value);
                    setError(null);
                  }}
                />
                <p className="page__subtitle">
                  {t("booking.timeHint")}
                </p>
              </div>
            </>
          )}
        </Card>
      )}

      {/* Step 3: choose where the visit happens (normal booking only) */}
      {selectedTime && selectedDate && !isHomeService && (
        <Card className="booking-visit-card">
          <h2>{t("booking.visitTypeTitle")}</h2>
          <p className="page__subtitle">{t("booking.visitTypeDesc")}</p>

          <div
            className="booking-visit-options"
            role="radiogroup"
            aria-label={t("booking.visitTypeTitle")}
          >
            <button
              type="button"
              role="radio"
              aria-checked={visitMode === "centre"}
              className={`booking-visit-option${visitMode === "centre" ? " booking-visit-option--active" : ""}`}
              onClick={() => {
                setVisitMode("centre");
                setGateOverride(null);
                setError(null);
              }}
            >
              <span className="booking-visit-option__icon" aria-hidden="true">
                <Building2 size={20} />
              </span>
              <span className="booking-visit-option__copy">
                <strong>{t("booking.visitAtCentre")}</strong>
                <span>{t("booking.visitAtCentreDesc")}</span>
              </span>
              {visitMode === "centre" && (
                <CheckCircle2 size={18} className="booking-visit-option__check" aria-hidden="true" />
              )}
            </button>

            <button
              type="button"
              role="radio"
              aria-checked={visitMode === "home"}
              className={`booking-visit-option${visitMode === "home" ? " booking-visit-option--active" : ""}`}
              onClick={() => {
                setVisitMode("home");
                setGateOverride(null);
                setError(null);
              }}
            >
              <span className="booking-visit-option__icon" aria-hidden="true">
                <House size={20} />
              </span>
              <span className="booking-visit-option__copy">
                <strong>{t("booking.visitAtHome")}</strong>
                <span>{t("booking.visitAtHomeDesc")}</span>
              </span>
              {visitMode === "home" && (
                <CheckCircle2 size={18} className="booking-visit-option__check" aria-hidden="true" />
              )}
            </button>
          </div>

          {visitMode === "centre" ? (
            hospitalsLoading ? (
              <Skeleton lines={2} />
            ) : selectedHospital ? (
              <div className="booking-centre">
                {hospitals.length > 1 && (
                  <div className="field">
                    <label className="field__label" htmlFor="book-centre">
                      {t("booking.chooseCentre")}
                    </label>
                    <select
                      id="book-centre"
                      className="field__input"
                      value={selectedHospital.id}
                      onChange={(event) => setSelectedHospitalId(Number(event.target.value))}
                    >
                      {hospitals.map((hospital) => (
                        <option key={hospital.id} value={hospital.id}>
                          {hospital.name} — {hospital.city}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
                <div className="booking-centre__details">
                  <MapPin size={16} aria-hidden="true" />
                  <div>
                    <strong>{selectedHospital.name}</strong>
                    {selectedHospital.address && <span>{selectedHospital.address}</span>}
                    <span>
                      {[selectedHospital.city, selectedHospital.phone]
                        .filter(Boolean)
                        .join(" · ")}
                    </span>
                  </div>
                  <a
                    className="booking-centre__directions"
                    href={centreMapsUrl(selectedHospital)}
                    target="_blank"
                    rel="noreferrer"
                  >
                    {t("appointments.getDirections")}
                  </a>
                </div>
              </div>
            ) : (
              <p className="page__subtitle">{t("booking.noHospitalLocation")}</p>
            )
          ) : (
            <div className="booking-home-location">
              <CurrentLocationPanel
                profile={patientProfile}
                saving={savingLocation}
                onCapture={() => void useCurrentLocation()}
              />
            </div>
          )}
        </Card>
      )}

      {/* Step 4: reason + confirm */}
      {selectedTime && selectedDate && (
        <Card>
          <h2>{t("booking.confirmTitle")}</h2>
          <p className="page__subtitle">
            {t("booking.dateAtTime", { date: formatDate(selectedDate), time: selectedTime.slice(0, 5) })}
          </p>

          <form className="form" onSubmit={handleBook}>
            <div className="field">
              <label className="field__label" htmlFor="book-reason">{visitMode === "home" ? t("booking.reasonHome") : t("booking.reason")}</label>
              <textarea
                id="book-reason"
                className="field__input"
                rows={3}
                placeholder={t("booking.reasonPlaceholder")}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
              />
            </div>
            {error && <p className="form-note--error">{error}</p>}
            <Button type="submit" loading={submitting}>
              {t("booking.confirm")}
            </Button>
          </form>
        </Card>
      )}

      {/* Location gate — patient side. Blocking: no appointment is created
          without a real position, so the prompt has to be answered first. */}
      <LocationPrompt
        open={locationGate === "patient"}
        saving={savingLocation}
        onCaptured={savePatientLocation}
        title={visitMode === "home" ? t("booking.setHomeLocation") : t("booking.setLocation")}
        description={visitMode === "home"
          ? t("booking.homeLocationDoctorDesc", { name: `${doctor.first_name} ${doctor.last_name}` })
          : t("booking.locationDoctorDesc", { name: `${doctor.first_name} ${doctor.last_name}` })}
        actionLabel={t("booking.shareLocation")}
        privacyNote={visitMode === "home" ? t("booking.homeLocationPrivacy") : t("booking.locationPrivacy")}
      />

      {/* Location gate — doctor side. Nothing the patient can fix, so the only
          way forward is back to the directory. */}
      <Modal
        open={locationGate === "doctor"}
        title={t("booking.doctorNoLocationTitle")}
        dismissible={false}
        actions={
          <>
            <Button variant="ghost" onClick={() => navigate("/doctors")}>
              {t("booking.findAnotherDoctor")}
            </Button>
            <Button variant="primary" onClick={() => navigate(`/doctors/${id}`)}>
              {t("booking.backToProfile")}
            </Button>
          </>
        }
      >
        <div className="prompt">
          <div className="prompt__icon" aria-hidden="true">
            <MapPin size={26} />
          </div>
          <p className="prompt__description">
            {t("booking.doctorNoLocationDesc", { name: `${doctor.first_name} ${doctor.last_name}` })}
          </p>
        </div>
      </Modal>
    </div>
  );
}

/* ======================================
   BOOKING SUCCESS
   ====================================== */

export function BookingSuccessScreen() {
  const { t } = useTranslation();
  const isHomeService = useLocation().pathname.startsWith("/home-visit");
  const { status, user } = useSession();
  const userId = status === "authed" && user ? user.id : null;
  const push = usePushNotifications(userId);
  // Re-prompt at the exact moment a notification will matter: the doctor's
  // reply. Uses the same key as the first-load gate so a user who already
  // answered is not nagged twice — but a state that still has something to
  // offer (first ask, iOS install steps, finish setup, blocked, failed) is
  // worth surfacing here, where the payoff is immediate.
  const [asked, setAsked] = useState(() => {
    try {
      return localStorage.getItem("medibook_notifications_prompted") === "1";
    } catch {
      return true;
    }
  });
  const canAsk = push.probed && pushStateNeedsPrompt(push.state);
  const markAsked = () => {
    try {
      localStorage.setItem("medibook_notifications_prompted", "1");
    } catch { /* ignore */ }
    setAsked(true);
  };
  const installMode = push.state === "IOS_NOT_INSTALLED";
  const blockedMode = push.state === "DENIED";

  return (
    <div className="page">
      <Card className="card--fit">
        <div className="booking-success">
          <div className="booking-success__icon"><CheckCircle2 size={48} /></div>
          <h1 className="page__title">{isHomeService ? t("booking.homeRequestedTitle") : t("booking.requestedTitle")}</h1>
          <p className="page__subtitle">
            {isHomeService
              ? t("booking.homeRequestedDesc")
              : t("booking.requestedDesc")}
          </p>
          <div className="booking-success__actions">
            <Link to="/appointments"><Button>{t("appointments.viewMine")}</Button></Link>
            <Link to={isHomeService ? "/home-visit/doctor" : "/doctors"}><Button variant="secondary">{t("booking.findAnotherDoctor")}</Button></Link>
          </div>
        </div>
      </Card>

      <NotificationPrompt
        open={!asked && canAsk}
        busy={push.loading}
        error={push.error}
        steps={push.steps}
        onEnable={
          push.actionLabel
            ? async () => {
                const ok = await push.subscribe();
                // Stop asking once the flow is finished: subscribed, or the
                // system denied it. A dismissed prompt / failed registration
                // keeps the modal open so the message stays visible.
                const denied =
                  typeof Notification !== "undefined" && Notification.permission === "denied";
                if (ok || denied) markAsked();
              }
            : undefined
        }
        onDismiss={markAsked}
        title={
          installMode
            ? t("booking.installNotificationsTitle")
            : blockedMode
              ? t("push.blockedTitle")
              : t("booking.notifyTitle")
        }
        description={
          installMode
            ? t("booking.notifyInstallDesc")
            : blockedMode
              ? push.message
              : t("booking.notifyDesc")
        }
        enableLabel={push.actionLabel ?? t("push.allowNotifications")}
        skipLabel={t("common.notNow")}
      />
    </div>
  );
}

/* ======================================
   RESCHEDULE APPOINTMENT
   ====================================== */

export function RescheduleScreen() {
  const { t } = useTranslation();
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { notify } = useToast();
  const [appointment, setAppointment] = useState<Appointment | null>(null);
  const [date, setDate] = useState("");
  const [availability, setAvailability] = useState<DoctorAvailability | null>(null);
  const [selectedTime, setSelectedTime] = useState("");
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
    setSelectedTime("");
    getDoctorAvailability(appointment.doctor, date)
      .then((r) => setAvailability(r.data))
      .catch((e) => setError(message(e)));
  }, [appointment?.doctor, date]);

  useEffect(() => { if (appointment) loadSlots(); }, [loadSlots, appointment]);

  // Keep open slots fresh when another client books on this doctor/date.
  useRealtimeEvent((event, payload) => {
    if (event !== "doctor.availability.updated") return;
    if (!appointment?.doctor) return;
    if (payload?.doctor_id != null && Number(payload.doctor_id) !== Number(appointment.doctor)) return;
    if (payload?.date && payload.date !== date) return;
    if (submitting) return;
    loadSlots();
  });

  async function handleReschedule(event: FormEvent) {
    event.preventDefault();
    if (!id || !selectedTime || !appointment || !appointment.doctor) return;
    setSubmitting(true);
    setError(null);

    // Compute end time = start + 30 minutes.
    const [startH, startM] = selectedTime.split(":").map(Number);
    const startSec = startH * 3600 + startM * 60;
    const endSec = startSec + 30 * 60;
    const pad = (n: number) => String(n).padStart(2, "0");
    const startTime = `${pad(Math.floor(startSec / 3600))}:${pad(Math.floor((startSec % 3600) / 60))}:00`;
    const endTime = `${pad(Math.floor(endSec / 3600))}:${pad(Math.floor((endSec % 3600) / 60))}:00`;

    try {
      await cancelAppointment(Number(id), "Rescheduled");
      const isHomeVisit = appointment.appointment_type === "HOME_SERVICE";
      const result = await createAppointment({
        doctor: appointment.doctor,
        appointment_type: isHomeVisit ? "HOME_SERVICE" : "NORMAL",
        ...(!isHomeVisit && appointment.hospital != null ? { hospital: appointment.hospital } : {}),
        ...(isHomeVisit &&
        appointment.home_service_latitude != null &&
        appointment.home_service_longitude != null
          ? {
              home_service_latitude: appointment.home_service_latitude,
              home_service_longitude: appointment.home_service_longitude,
              home_service_location_accuracy: appointment.home_service_location_accuracy ?? undefined,
            }
          : {}),
        appointment_date: date,
        start_time: startTime,
        end_time: endTime,
        reason: appointment.reason,
        rescheduled_from: Number(id),
      });
      if (!result.success) {
        throw new ApiError(result.message || i18n.t("appointments.rescheduleFailed"), 409, result.errors);
      }
      notify("success", t("appointments.rescheduledToast"));
      navigate("/appointments");
    } catch (e) {
      let errorMessage: string;
      if (e instanceof ApiError) {
        // Show the server's actual 409 message so patients can tell whether
        // the time was taken or they already have an open appointment.
        errorMessage = e.message;
      } else if (
        e &&
        typeof e === "object" &&
        "response" in e &&
        (e as { response?: { data?: any; status?: number } }).response?.data
      ) {
        const data = (e as { response?: { data?: any } }).response?.data;
        errorMessage = data?.message || i18n.t("common.requestFailed");
      } else {
        errorMessage = message(e);
      }
      setError(errorMessage);
    } finally {
      setSubmitting(false);
    }
  }

  if (error && !appointment) return <div className="page"><ErrorState message={error} onRetry={loadAppointment} /></div>;
  if (!appointment) return <div className="page"><Skeleton lines={6} /></div>;

  const canReschedule = appointment.status === "pending" || appointment.status === "accepted";
  if (!canReschedule) {
    return (
      <div className="page">
        <Link to={`/appointments/${id}`}><ArrowLeft size={16} /> {t("appointments.backToAppointment")}</Link>
        <Card className="card--fit">
          <EmptyState title={t("appointments.cannotReschedule")} description={t("appointments.cannotRescheduleDesc")} />
        </Card>
      </div>
    );
  }

  return (
    <div className="page">
      <Link to={`/appointments/${id}`}><ArrowLeft size={16} /> {t("appointments.backToAppointment")}</Link>

      <Card className="card--fit">
        <h1 className="page__title">{t("appointments.rescheduleTitle")}</h1>
        <p className="page__subtitle">
          {t("appointments.current", { date: formatDate(appointment.appointment_date), time: formatTime(appointment.start_time) })}
        </p>
      </Card>

      <Card>
        <h2>{t("appointments.selectNewDate")}</h2>
        <div className="field">
          <label className="field__label" htmlFor="reschedule-date">{t("appointments.newDate")}</label>
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
        <h2>{t("appointments.chooseNewTime")}</h2>
        {availability === null ? (
          <Skeleton lines={3} />
        ) : availability.slots.length === 0 ? (
          <EmptyState title={t("booking.noTimesTitle")} description={t("booking.noTimesDescDate")} />
        ) : (
          <div className="field">
            <label className="field__label" htmlFor="reschedule-time">{t("appointments.availableStart")}</label>
            <select
              id="reschedule-time"
              className="field__input"
              value={selectedTime}
              onChange={(event) => {
                setSelectedTime(event.target.value);
                setError(null);
              }}
            >
              <option value="">{t("appointments.selectFreeTime")}</option>
              {availability.slots.map((slot) => (
                <option key={slot.start_time} value={slot.start_time.slice(0, 5)}>
                  {slot.start_time.slice(0, 5)} – {slot.end_time.slice(0, 5)}
                </option>
              ))}
            </select>
            <p className="page__subtitle">{t("appointments.freeTimesNote")}</p>
          </div>
        )}
      </Card>

      {selectedTime && (
        <Card>
          <h2>{t("appointments.confirmReschedule")}</h2>
          <p className="page__subtitle">
            {t("appointments.newTime", { date: formatDate(date), time: selectedTime.slice(0, 5) })}
          </p>
          <p className="form-note">{t("appointments.rescheduleNote")}</p>
          {error && <p className="form-note--error">{error}</p>}
          <Button onClick={handleReschedule} loading={submitting}>
            {t("appointments.confirmReschedule")}
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
  const { t } = useTranslation();
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [queueByAppointment, setQueueByAppointment] = useState<Map<number, QueueSlot>>(new Map());
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<"upcoming" | "past">("upcoming");

  const loadRows = useCallback(async (showError: boolean) => {
    if (showError) setError(null);
    try {
      const response = await listMyAppointments();
      const rows = response.data.results;
      setAppointments(rows);
      const dates = [...new Set(rows.filter((row) => row.appointment_type !== "HOME_SERVICE" && row.status === "accepted" && row.checked_in_at).map((row) => row.appointment_date))];
      const batches = await Promise.all(dates.map((date) => getQueue(date).then((result) => result.data).catch(() => [])));
      const next = new Map<number, QueueSlot>();
      for (const entry of batches.flat()) if (entry.queue) next.set(entry.id, entry.queue);
      setQueueByAppointment(next);
    } catch (e) {
      if (showError) setError(message(e));
    }
  }, []);

  const load = useCallback(() => { void loadRows(true); }, [loadRows]);

  useEffect(() => { load(); }, [load]);

  const refresh = useCallback(() => { void loadRows(false); }, [loadRows]);

  useRealtimeSync({
    refresh,
    events: ["appointment.created", "appointment.updated", "appointment.deleted"],
    polling: false,
    reconcileOnFocus: false,
  });

  // Optimistic delete.
  useRealtimeEvent((event, payload) => {
    if (event === "appointment.deleted" && payload?.id) {
      setAppointments((prev) => prev.filter((a) => a.id !== Number(payload.id)));
    }
  });

  const now = localDayKey();
  const upcoming = appointments.filter(
    (a) => a.appointment_date >= now && (a.status === "pending" || a.status === "accepted")
  );
  const past = appointments.filter(
    (a) => a.appointment_date < now || a.status === "done" || a.status === "cancelled" || a.status === "rejected"
  );
  const visible = tab === "upcoming" ? upcoming : past;

  const statusConfig: Record<string, { icon: React.ReactNode; color: string; bg: string }> = {
    pending: { icon: <Clock3 size={14} />, color: "#d97706", bg: "#fef3c7" },
    accepted: { icon: <CheckCircle2 size={14} />, color: "#059669", bg: "#d1fae5" },
    done: { icon: <CheckCircle2 size={14} />, color: "#2563eb", bg: "#dbeafe" },
    cancelled: { icon: <XCircle size={14} />, color: "#dc2626", bg: "#fee2e2" },
    rejected: { icon: <XCircle size={14} />, color: "#9333ea", bg: "#ede9fe" },
  };

  if (error) return <div className="page"><h1 className="page__title">{t("appointments.mine")}</h1><ErrorState message={error} onRetry={load} /></div>;

  return (
    <div className="page patient-appointments">
      <div className="patient-appt-header">
        <h1 className="page__title">{t("appointments.mine")}</h1>
        <Link to="/doctors" className="patient-appt-book-btn">{t("appointments.bookNew")}</Link>
      </div>

      <div className="patient-appt-tabs">
        <button
          type="button"
          className={`patient-appt-tab${tab === "upcoming" ? " patient-appt-tab--active" : ""}`}
          onClick={() => setTab("upcoming")}
        >
          {t("appointments.upcoming")}
          <span className="patient-appt-tab__count">{upcoming.length}</span>
        </button>
        <button
          type="button"
          className={`patient-appt-tab${tab === "past" ? " patient-appt-tab--active" : ""}`}
          onClick={() => setTab("past")}
        >
          {t("appointments.past")}
          <span className="patient-appt-tab__count">{past.length}</span>
        </button>
      </div>

      {appointments === null ? (
        <Skeleton lines={4} />
      ) : visible.length === 0 ? (
        <div className="patient-appt-empty">
          <div className="patient-appt-empty__icon"><Calendar size={40} /></div>
          <h3>{tab === "upcoming" ? t("appointments.noUpcoming") : t("appointments.noPast")}</h3>
          <p>{tab === "upcoming" ? t("appointments.noUpcomingDesc") : t("appointments.noPastDesc")}</p>
          {tab === "upcoming" && <Link to="/doctors"><Button>{t("appointments.findDoctor")}</Button></Link>}
        </div>
      ) : (
        <div className="patient-appt-grid">
          {visible.map((a) => {
            const sc = statusConfig[a.status] || statusConfig.pending;
            return (
              <Link key={a.id} to={`/appointments/${a.id}`} className="patient-appt-card">
                <div className="patient-appt-card__accent" style={{ background: sc.color }} />
                <div className="patient-appt-card__content">
                  <div className="patient-appt-card__top">
                    <div className="patient-appt-card__date-box">
                      <span className="patient-appt-card__day">
                        {new Date(a.appointment_date + "T00:00:00").getDate()}
                      </span>
                      <span className="patient-appt-card__month">
                        {formatIntlDate(new Date(a.appointment_date + "T00:00:00"), { month: "short" })}
                      </span>
                    </div>
                    <div className="patient-appt-card__info">
                      <div className="patient-appt-card__doctor">
                        {a.appointment_type === "HOME_SERVICE" ? t("appointments.homeServiceWith") : ""}<DoctorName doctorId={a.doctor} />
                      </div>
                      <div className="patient-appt-card__time">
                        {formatTime(a.start_time)} – {formatTime(a.end_time)}
                      </div>
                      {a.appointment_type === "NORMAL" && a.hospital_name && (
                        <div className="patient-appt-card__centre">
                          <MapPin size={12} aria-hidden="true" />
                          <span>
                            {a.hospital_name}
                            {a.hospital_city ? ` · ${a.hospital_city}` : ""}
                          </span>
                        </div>
                      )}
                      {a.appointment_type === "HOME_SERVICE" && <span className="badge badge--accepted">{t("nav.homeService")}</span>}
                      <span
                        className="patient-appt-card__status"
                        style={{ color: sc.color, background: sc.bg }}
                      >
                        {sc.icon} {t(STATUS_KEYS[a.status])}
                      </span>
                      {queueByAppointment.get(a.id)?.being_seen && <span className="queue-badge queue-badge--live">{t("appointments.inConsultation")}</span>}
                      {(queueByAppointment.get(a.id)?.position ?? null) !== null && <span className="queue-badge">{t("appointments.queuePosition", { position: queueByAppointment.get(a.id)?.position })}</span>}
                    </div>
                  </div>
                  {a.reason && (
                    <div className="patient-appt-card__reason">{a.reason}</div>
                  )}
                  <div className="patient-appt-card__footer">
                    <span className="patient-appt-card__view">{t("appointments.viewDetails")}</span>
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ======================================
   APPOINTMENT DETAIL
   ====================================== */

export function AppointmentDetailScreen() {
  const { t } = useTranslation();
  const { id } = useParams<{ id: string }>();
  const { user } = useSession();
  const { notify } = useToast();
  const navigate = useNavigate();
  const [appointment, setAppointment] = useState<Appointment | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cancelling, setCancelling] = useState(false);
  const [cancelReason, setCancelReason] = useState("");
  const [showCancelForm, setShowCancelForm] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [patientMedical, setPatientMedical] = useState<PatientProfile | null>(null);
  const [medicalNote, setMedicalNote] = useState<string | null>(null);
  const [medicalLoading, setMedicalLoading] = useState(false);
  const [showMedical, setShowMedical] = useState(false);
  /** Waiting room (phase 11) — this appointment's place in the day's line. */
  const [queueSlot, setQueueSlot] = useState<QueueSlot | null>(null);
  const [queueBusy, setQueueBusy] = useState(false);
  const [queueTick, setQueueTick] = useState(0);

  const isDoctor = user?.role === "doctor";
  const isHomeService = appointment?.appointment_type === "HOME_SERVICE";

  const load = useCallback(() => {
    if (!id) return;
    setError(null);
    getAppointment(Number(id)).then((r) => {
      setAppointment(r.data);
    }).catch((e) => setError(message(e)));
  }, [id]);

  useEffect(() => { load(); }, [load]);

  // Queue refresh is event-driven: check-ins and consultation starts broadcast
  // appointment.updated to both the doctor and patient.
  useEffect(() => {
    if (!appointment) return;
    if (appointment.appointment_type === "EMERGENCY" || appointment.appointment_type === "HOME_SERVICE") return;
    if (appointment.status !== "pending" && appointment.status !== "accepted") return;
    let cancelled = false;
    const loadQueue = () => {
      getQueue(appointment.appointment_date)
        .then((r) => {
          if (cancelled) return;
          const entry = r.data.find((item) => item.id === appointment.id);
          setQueueSlot(entry?.queue ?? null);
        })
        .catch(() => {});
    };
    loadQueue();
    return () => { cancelled = true; };
  }, [appointment?.id, appointment?.appointment_date, appointment?.status, appointment?.checked_in_at, appointment?.consultation_started_at, queueTick]);

  async function handleCheckIn() {
    if (!appointment) return;
    setQueueBusy(true);
    try {
      const result = await checkIn(appointment.id);
      notify("success", result.message || t("appointments.checkedInToast"));
      load();
      setQueueTick((tick) => tick + 1);
    } catch (e) {
      notify("error", message(e));
    } finally {
      setQueueBusy(false);
    }
  }

  async function handleStartConsultation() {
    if (!appointment) return;
    setQueueBusy(true);
    try {
      if (appointment.appointment_type === "EMERGENCY") {
        await respondToEmergency(appointment.id, "in-progress");
        notify("success", t("appointments.emergencyStartedToast"));
        load();
        navigate(`/doctor/medical-treatment/emergency?patient=${appointment.patient}&appointment=${appointment.id}`);
        return;
      }
      await startConsultation(appointment.id);
      notify("success", t("appointments.consultationStartedToast"));
      load();
      setQueueTick((tick) => tick + 1);
      if (isDoctor) navigate(`/doctor/medical-treatment?patient=${appointment.patient}&appointment=${appointment.id}`);
    } catch (e) {
      notify("error", message(e));
    } finally {
      setQueueBusy(false);
    }
  }

  // Live detail: reflect confirm/cancel/complete the moment the other side acts.
  useRealtimeEvent((event, payload) => {
    if (event === "appointment.updated" && Number(payload.id) === Number(id)) {
      load();
      setQueueTick((tick) => tick + 1);
    }
    if (event === "appointment.deleted" && Number(payload.id) === Number(id)) {
      notify("info", t("appointments.deletedByOtherToast"));
      navigate("/appointments");
    }
  });

  function toggleMedical() {
    if (showMedical) { setShowMedical(false); return; }
    setShowMedical(true);
    if (patientMedical) return;
    if (!appointment?.patient) return;
    setMedicalLoading(true);
    getPatientProfileById(appointment.patient)
      .then((r) => {
        const profile = r.data && Object.keys(r.data).length ? r.data : null;
        setPatientMedical(profile);
        setMedicalNote(profile ? null : r.message || null);
      })
      .catch((e) => {
        setPatientMedical(null);
        setMedicalNote(message(e));
      })
      .finally(() => setMedicalLoading(false));
  }

  async function handleCancel() {
    if (!id) return;
    setCancelling(true);
    setError(null);
    const snapshot = appointment;
    // Optimistic: show cancelled immediately; roll back if the request fails.
    if (appointment) setAppointment({ ...appointment, status: "cancelled" });
    try {
      await cancelAppointment(Number(id), cancelReason);
      notify("success", t("appointments.cancelledToast"));
      navigate("/appointments");
    } catch (e) {
      if (snapshot) setAppointment(snapshot);
      setError(message(e));
    } finally {
      setCancelling(false);
    }
  }

  async function handleDelete() {
    if (!id) return;
    setDeleting(true);
    setError(null);
    try {
      await deleteAppointment(Number(id));
      notify("success", t("appointments.deletedToast"));
      navigate("/appointments");
    } catch (e) {
      setError(message(e));
    } finally {
      setDeleting(false);
    }
  }

  if (error && !appointment) return <div className="page"><ErrorState message={error} onRetry={load} /></div>;
  if (!appointment) return <div className="page"><Skeleton lines={6} /></div>;

  const canCancel = appointment.status === "pending" || appointment.status === "accepted";
  const canReschedule = canCancel;
  const isAppointmentDay = appointment.appointment_date === localDayKey();

  return (
    <div className="page">
      <Link to={isDoctor ? "/doctor/appointments" : "/appointments"}><ArrowLeft size={16} /> {t("appointments.back")}</Link>

      <Card>
        <div className="appt-detail__header">
          <h1 className="page__title">{isHomeService ? t("appointments.homeDetails") : t("appointments.details")}</h1>
          <StatusBadge status={appointment.status} />
        </div>

        <div className="appt-detail__grid">
          <div className="appt-detail__field">
            <span className="appt-detail__label">{t("appointments.doctor")}</span>
            <DoctorName doctorId={appointment.doctor} />
            <DoctorPhone doctorId={appointment.doctor} appointmentId={appointment.id} />
          </div>
          <div className="appt-detail__field">
            <span className="appt-detail__label">{t("appointments.date")}</span>
            {formatDate(appointment.appointment_date)}
          </div>
          <div className="appt-detail__field">
            <span className="appt-detail__label">{t("appointments.time")}</span>
            {formatTime(appointment.start_time)} – {formatTime(appointment.end_time)}
          </div>
          {isHomeService ? (
            appointment.home_service_latitude != null && appointment.home_service_longitude != null && (
              <div className="appt-detail__field appt-detail__location">
                <span className="appt-detail__label">{t("appointments.patientHomeLocation")}</span>
                <strong>{t("appointments.savedForAppointment")}</strong>
                <span>{appointment.home_service_latitude.toFixed(5)}, {appointment.home_service_longitude.toFixed(5)}</span>
                <a className="btn btn--secondary appt-detail__directions" href={`https://www.google.com/maps/dir/?api=1&destination=${appointment.home_service_latitude},${appointment.home_service_longitude}`} target="_blank" rel="noreferrer">
                  <MapPin size={16} /> {t("appointments.openPatientLocation")}
                </a>
              </div>
            )
          ) : (
            <div className="appt-detail__field appt-detail__location">
              <span className="appt-detail__label">{t("appointments.hospitalLocation")}</span>
              <strong>{appointment.hospital_name || DEFAULT_CENTRE.name}</strong>
              <span>{appointment.hospital_address || DEFAULT_CENTRE.address}</span>
              <span>{appointment.hospital_city || DEFAULT_CENTRE.city}</span>
              <a
                className="btn btn--secondary appt-detail__directions"
                href={
                  appointment.hospital_name
                    ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
                        [appointment.hospital_name, appointment.hospital_address, appointment.hospital_city]
                          .filter(Boolean)
                          .join(", ")
                      )}`
                    : DEFAULT_CENTRE.maps
                }
                target="_blank"
                rel="noreferrer"
              >
                <MapPin size={16} /> {t("appointments.getDirections")}
              </a>
            </div>
          )}
          {appointment.reason && (
            <div className="appt-detail__field">
              <span className="appt-detail__label">{t("appointments.reason")}</span>
              {appointment.reason}
            </div>
          )}
          {appointment.notes && (
            <div className="appt-detail__field">
              <span className="appt-detail__label">{t("appointments.notes")}</span>
              {appointment.notes}
            </div>
          )}
          {appointment.cancel_reason && (
            <div className="appt-detail__field">
              <span className="appt-detail__label">{t("appointments.cancelReason")}</span>
              {appointment.cancel_reason}
            </div>
          )}
        </div>
      </Card>

      {isHomeService && isDoctor && appointment.status === "accepted" && (
        <Card className="queue-card">
          <div className="queue-card__head"><span className="queue-card__title"><House size={16} /> {t("appointments.homeConsultation")}</span></div>
          <p className="queue-card__msg">{t("appointments.homeConsultationDesc")}</p>
          <Button variant="primary" disabled={!isAppointmentDay} loading={queueBusy} onClick={() => void handleStartConsultation()}>
            <Play size={14} /> {isAppointmentDay ? t("appointments.startConsultation") : t("appointments.startOnDay")}
          </Button>
        </Card>
      )}

      {appointment.appointment_type === "EMERGENCY" && isDoctor && (appointment.status === "accepted" || appointment.status === "in_progress") && (
        <Card className="queue-card">
          <div className="queue-card__head"><span className="queue-card__title"><Users size={16} /> {t("appointments.emergencyConsultation")}</span></div>
          {appointment.status === "accepted" ? (
            <Button variant="primary" loading={queueBusy} onClick={() => void handleStartConsultation()}>
              <Play size={14} /> {t("appointments.startEmergency")}
            </Button>
          ) : (
            <Button variant="primary" loading={queueBusy} onClick={async () => {
              setQueueBusy(true);
              try {
                await completeAppointment(appointment.id);
                notify("success", t("appointments.emergencyCompleted"));
                load();
              } catch (e) { notify("error", message(e)); }
              finally { setQueueBusy(false); }
            }}>
              <CheckCircle2 size={14} /> {t("appointments.status.done")}
            </Button>
          )}
        </Card>
      )}

      {/* Waiting room (phase 11) — live position for a today's appointment. */}
      {appointment.appointment_type === "NORMAL" && queueSlot !== null && (
        <Card className="queue-card">
          <div className="queue-card__head">
            <span className="queue-card__title">
              <Users size={16} /> {t("appointments.waitingRoom")}
            </span>
            {queueSlot.being_seen && (
              <span className="queue-badge queue-badge--live">{t("appointments.inConsultation")}</span>
            )}
            {!queueSlot.being_seen && queueSlot.position !== null && (
              <span className="queue-badge">#{queueSlot.position}</span>
            )}
          </div>

          {queueSlot.being_seen ? (
            <p className="queue-card__msg">
              {isDoctor ? t("appointments.patientWithYou") : t("appointments.withDoctor")}
            </p>
          ) : queueSlot.position !== null ? (
            <>
              <p className="queue-card__pos">
                {isDoctor
                  ? t("appointments.patientPosition", { position: queueSlot.position })
                  : t("appointments.yourPosition", { position: queueSlot.position })}
                {queueSlot.position > 1 && !isDoctor
                  ? ` — ${t("appointments.aheadOfYou", { count: queueSlot.position - 1 })}`
                  : ""}
              </p>
              <p className="queue-card__meta">
                {t("appointments.waitingCount", { count: queueSlot.waiting_count })}
                {queueSlot.waited_minutes !== null && ` · ${t("appointments.waitedMinutes", { count: queueSlot.waited_minutes })}`}
              </p>
            </>
          ) : (
            <p className="queue-card__msg">
              {isDoctor
                ? t("appointments.notCheckedInDoctor")
                : t("appointments.notCheckedInPatient")}
            </p>
          )}

          <div className="queue-card__acts">
            {!queueSlot.checked_in && appointment.status === "accepted" && canCancel && (
              <Button variant="primary" disabled={!isAppointmentDay} loading={queueBusy} onClick={() => void handleCheckIn()}>
                <UserCheck size={14} /> {isAppointmentDay ? (isDoctor ? t("appointments.checkPatientIn") : t("appointments.checkIn")) : t("appointments.checkInOnDay")}
              </Button>
            )}
            {isDoctor && queueSlot.checked_in && !queueSlot.being_seen && (
              <Button
                variant="secondary"
                loading={queueBusy}
                onClick={() => void handleStartConsultation()}
              >
                <Play size={14} /> {t("appointments.startConsultation")}
              </Button>
            )}
          </div>
        </Card>
      )}

      {isDoctor && (
        <Card>
          <button type="button" className="appt-card__medical-toggle" onClick={toggleMedical}>
            <User size={14} />
            {showMedical ? t("appointments.hideMedical") : t("appointments.viewMedical")}
          </button>
          {showMedical && (
            <div className="treat-patient-fields" style={{ marginTop: "0.75rem" }}>
              {medicalLoading ? (
                <Skeleton lines={3} />
              ) : !patientMedical ? (
                <p className="form-note">{medicalNote ?? t("appointments.noMedicalInfo")}</p>
              ) : (
                <>
                  {patientMedical.blood_group && (
                    <div className="treat-pf">
                      <span><Droplet size={13} /> {t("appointments.bloodGroup")}</span>
                      <strong>{patientMedical.blood_group}</strong>
                    </div>
                  )}
                  {patientMedical.gender && (
                    <div className="treat-pf">
                      <span>{t("settings.gender")}</span>
                      <strong>{patientMedical.gender}</strong>
                    </div>
                  )}
                  {patientMedical.date_of_birth && (
                    <div className="treat-pf">
                      <span>{t("settings.dateOfBirth")}</span>
                      <strong>{formatDate(patientMedical.date_of_birth)}</strong>
                    </div>
                  )}
                  {patientMedical.allergies && (
                    <div className="treat-pf treat-pf--warn">
                      <span><AlertTriangle size={13} /> {t("settings.allergies")}</span>
                      <strong>{patientMedical.allergies}</strong>
                    </div>
                  )}
                  {patientMedical.medical_history && (
                    <div className="treat-pf">
                      <span><FileText size={13} /> {t("settings.medicalHistory")}</span>
                      <strong>{patientMedical.medical_history}</strong>
                    </div>
                  )}
                  {!patientMedical.blood_group && !patientMedical.allergies && !patientMedical.medical_history && (
                    <p className="form-note">{t("booking.noMedicalDetails")}</p>
                  )}
                </>
              )}
            </div>
          )}
        </Card>
      )}

      <Card>
        <h2>{t("appointments.manage")}</h2>
        <div className="appt-manage-actions">
          {canReschedule && (
            <Link className="btn btn--secondary appt-manage-actions__link" to={`/appointments/${id}/reschedule`}>
              {t("appointments.reschedule")}
            </Link>
          )}
          {canCancel && !showCancelForm && (
            <Button variant="danger" onClick={() => setShowCancelForm(true)}>
              {t("appointments.cancel")}
            </Button>
          )}
          {!showDeleteConfirm && (
            <Button variant="danger" onClick={() => setShowDeleteConfirm(true)}>
              {t("appointments.delete")}
            </Button>
          )}
        </div>
        {showDeleteConfirm && (
          <div className="appt-delete-confirm">
            <p>{t("appointments.deleteConfirm")}</p>
            {error && <p className="form-note--error">{error}</p>}
            <div className="form__row form__row--actions appt-manage-confirm-actions">
              <Button variant="danger" loading={deleting} onClick={handleDelete}>
                {t("appointments.yesDelete")}
              </Button>
              <Button variant="secondary" onClick={() => setShowDeleteConfirm(false)} type="button">
                {t("appointments.keep")}
              </Button>
            </div>
          </div>
        )}
        {showCancelForm && (
          <form className="form" onSubmit={(e) => { e.preventDefault(); handleCancel(); }}>
            <div className="field">
              <label className="field__label" htmlFor="cancel-reason">{t("appointments.cancelReasonLabel")}</label>
              <textarea
                id="cancel-reason"
                className="field__input"
                rows={2}
                value={cancelReason}
                onChange={(e) => setCancelReason(e.target.value)}
              />
            </div>
            {error && <p className="form-note--error">{error}</p>}
            <div className="form__row form__row--actions appt-manage-confirm-actions">
              <Button variant="danger" loading={cancelling}>{t("appointments.confirmCancel")}</Button>
              <Button variant="secondary" onClick={() => setShowCancelForm(false)} type="button">{t("appointments.keep")}</Button>
            </div>
          </form>
        )}
      </Card>
    </div>
  );
}
