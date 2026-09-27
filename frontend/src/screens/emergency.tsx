/**
 * Emergency section (§27) — one file, two role screens:
 *
 *   PatientEmergencyScreen (/emergency)      — SOS form (doctor + reason + date
 *     slot + live GPS), plus the patient's active request with live status.
 *   DoctorEmergencyScreen  (/doctor/emergency) — the pending request queue with
 *     patient contact details and one-tap accept / reject.
 */

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { createEmergency, listEmergencies, respondToEmergency } from "../api/emergency";
import { getDoctorAvailability, listDoctors } from "../api/doctors";
import type {
  AvailabilitySlot,
  DoctorProfile,
  EmergencyAppointment,
  EmergencyReason,
} from "../api/types";
import { Button, Card, EmptyState, ErrorState, Skeleton } from "../components/ui";
import { useToast } from "../state/app-context";
import { useRealtimeSync } from "../realtime/socket";
import {
  Siren,
  MapPin,
  Phone,
  ShieldAlert,
  Check,
  X,
  Clock3,
  User as UserIcon,
} from "lucide-react";

/* ---------- helpers ---------- */

function message(error: unknown): string {
  return error instanceof Error ? error.message : "Something went wrong. Please try again.";
}

function formatTime(t: string): string {
  return t.slice(0, 5);
}

function formatDate(d: string): string {
  const dt = new Date(d + "T00:00:00");
  return dt.toLocaleDateString(undefined, {
    weekday: "short",
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

const REASON_LABELS: Record<string, string> = {
  severe_pain: "Severe pain",
  breathing_difficulty: "Breathing difficulty",
  injury: "Injury",
  accident: "Accident",
  sudden_illness: "Sudden illness",
  high_fever: "High fever",
  allergic_reaction: "Allergic reaction",
  other: "Other",
};

function reasonLabel(reason?: string | null): string {
  if (!reason) return "Emergency";
  return REASON_LABELS[reason] ?? reason.replace(/_/g, " ");
}

interface GeoFix {
  latitude: number;
  longitude: number;
  accuracy: number;
}

/** One high-accuracy GPS fix. Rejected with a human message on any failure. */
function requestGeo(): Promise<GeoFix> {
  return new Promise((resolve, reject) => {
    if (typeof navigator === "undefined" || !("geolocation" in navigator)) {
      reject(new Error("This device cannot share a location."));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (position) =>
        resolve({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracy: Math.round(position.coords.accuracy ?? 0),
        }),
      (error) =>
        reject(
          new Error(
            error.code === error.PERMISSION_DENIED
              ? "Location permission is required for an emergency request."
              : "Could not read your location. Try again."
          )
        ),
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    );
  });
}

/* =====================================================
   PATIENT — request emergency help + active status
   ===================================================== */

export function PatientEmergencyScreen() {
  const { notify } = useToast();
  const [emergencies, setEmergencies] = useState<EmergencyAppointment[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [doctors, setDoctors] = useState<DoctorProfile[] | null>(null);

  const [doctorId, setDoctorId] = useState("");
  const [reason, setReason] = useState<EmergencyReason | "">("");
  const [description, setDescription] = useState("");
  const [date, setDate] = useState("");
  const [slot, setSlot] = useState<AvailabilitySlot | null>(null);
  const [slots, setSlots] = useState<AvailabilitySlot[] | null>(null);
  const [slotsLoading, setSlotsLoading] = useState(false);
  const [geo, setGeo] = useState<GeoFix | null>(null);
  const [locating, setLocating] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // The screen shows the live request whenever one is open; the form otherwise.
  const active =
    emergencies?.find((item) => item.status === "pending" || item.status === "confirmed") ??
    null;

  const load = useCallback(() => {
    listEmergencies()
      .then((response) => {
        setError(null);
        setEmergencies(response.data ?? []);
      })
      .catch((reason_: unknown) => {
        setError(message(reason_));
        setEmergencies((previous) => previous ?? []);
      });
  }, []);

  useEffect(() => {
    load();
    listDoctors({ page_size: 200 })
      .then((response) => setDoctors(response.data.results ?? []))
      .catch(() => setDoctors([]));
  }, [load]);

  // Doctor accepted / rejected while this screen is open → status updates live.
  useRealtimeSync({
    refresh: load,
    events: ["appointment.emergency_accepted", "appointment.emergency_rejected"],
  });

  // Slots depend on doctor + date.
  useEffect(() => {
    if (!doctorId || !date) {
      setSlots(null);
      setSlot(null);
      return;
    }
    let cancelled = false;
    setSlotsLoading(true);
    setSlots(null);
    setSlot(null);
    getDoctorAvailability(Number(doctorId), date)
      .then((response) => {
        if (!cancelled) setSlots(response.data?.slots ?? []);
      })
      .catch(() => {
        if (!cancelled) setSlots([]);
      })
      .finally(() => {
        if (!cancelled) setSlotsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [doctorId, date]);

  const shareLocation = async () => {
    setLocating(true);
    try {
      const fix = await requestGeo();
      setGeo(fix);
      setFormError(null);
    } catch (reason_) {
      setFormError(message(reason_));
    } finally {
      setLocating(false);
    }
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setFormError(null);
    if (!doctorId || !reason || !date || !slot) {
      setFormError("Choose a doctor, an emergency reason, a date and a time slot.");
      return;
    }
    setSubmitting(true);
    try {
      // GPS is required by the API; reuse the shared fix or take one now.
      const fix = geo ?? (await requestGeo());
      if (!geo) setGeo(fix);
      await createEmergency({
        doctor: Number(doctorId),
        appointment_date: date,
        start_time: slot.start_time,
        end_time: slot.end_time,
        emergency_reason: reason,
        emergency_description: description.trim() || undefined,
        emergency_latitude: fix.latitude,
        emergency_longitude: fix.longitude,
        emergency_location_accuracy: fix.accuracy,
      });
      notify("success", "Emergency request sent — a doctor will respond shortly.");
      setDoctorId("");
      setReason("");
      setDescription("");
      setDate("");
      setSlot(null);
      setSlots(null);
      setGeo(null);
      load();
    } catch (reason_) {
      setFormError(message(reason_));
    } finally {
      setSubmitting(false);
    }
  };

  const today = new Date().toISOString().slice(0, 10);

  return (
    <div className="page emergency-page">
      <header className="emergency__hero">
        <span className="emergency__hero-icon" aria-hidden="true">
          <Siren size={26} />
        </span>
        <div>
          <h1 className="page__title">Emergency</h1>
          <p className="page__subtitle">
            Request urgent help from an available doctor right now.
          </p>
        </div>
      </header>

      {error && <ErrorState message={error} onRetry={load} />}

      {emergencies === null ? (
        <Skeleton lines={5} />
      ) : active ? (
        /* -------- active request: live status -------- */
        <Card className="emergency__status">
          <div className="emergency__status-head">
            <span className={`badge badge--${active.status}`}>{active.status}</span>
            <span className="emergency__status-reason">
              <ShieldAlert size={15} /> {reasonLabel(active.emergency_reason)}
            </span>
          </div>
          {active.emergency_description && <p>{active.emergency_description}</p>}
          <p className="page__subtitle emergency__status-when">
            <Clock3 size={14} /> {formatDate(active.appointment_date)} ·{" "}
            {formatTime(active.start_time)}–{formatTime(active.end_time)}
            {active.emergency_requested_at &&
              ` · requested ${new Date(active.emergency_requested_at).toLocaleString()}`}
          </p>
          {active.doctor_phone && (
            <p className="emergency__contact-line">
              <Phone size={14} /> Doctor:{" "}
              <a href={`tel:${active.doctor_phone}`}>{active.doctor_phone}</a>
              {active.doctor_phone_secondary && (
                <>
                  {" · alt: "}
                  <a href={`tel:${active.doctor_phone_secondary}`}>
                    {active.doctor_phone_secondary}
                  </a>
                </>
              )}
            </p>
          )}
          {active.status === "pending" && (
            <p className="form-note">Waiting for the doctor to accept your request…</p>
          )}
          <div className="emergency__actions">
            <Link to={`/appointments/${active.id}`}>
              <Button variant="secondary">View details</Button>
            </Link>
            <Link to="/appointments">
              <Button variant="secondary">All appointments</Button>
            </Link>
          </div>
        </Card>
      ) : (
        /* -------- request form -------- */
        <Card>
          <h2 className="emergency__form-title">
            <ShieldAlert size={18} /> Request emergency help
          </h2>
          <form className="form" onSubmit={submit}>
            <div className="field">
              <label className="field__label" htmlFor="em-doctor">
                Doctor
              </label>
              <select
                id="em-doctor"
                className="field__input"
                value={doctorId}
                onChange={(event) => setDoctorId(event.target.value)}
                required
              >
                <option value="">
                  {doctors === null ? "Loading doctors…" : "Select a doctor…"}
                </option>
                {doctors?.map((doctor) => (
                  <option key={doctor.id} value={doctor.id}>
                    Dr. {doctor.first_name} {doctor.last_name}
                    {doctor.city ? ` — ${doctor.city}` : ""}
                  </option>
                ))}
              </select>
            </div>

            <div className="field">
              <label className="field__label" htmlFor="em-reason">
                What is happening?
              </label>
              <select
                id="em-reason"
                className="field__input"
                value={reason}
                onChange={(event) => setReason(event.target.value as EmergencyReason)}
                required
              >
                <option value="">Select an emergency reason…</option>
                {Object.entries(REASON_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </div>

            <div className="field">
              <label className="field__label" htmlFor="em-description">
                Description (optional)
              </label>
              <textarea
                id="em-description"
                className="field__input"
                rows={3}
                placeholder="Describe what happened, symptoms, allergies…"
                value={description}
                onChange={(event) => setDescription(event.target.value)}
              />
            </div>

            <div className="field">
              <label className="field__label" htmlFor="em-date">
                Date
              </label>
              <input
                id="em-date"
                type="date"
                className="field__input"
                min={today}
                value={date}
                onChange={(event) => setDate(event.target.value)}
                required
              />
            </div>

            {date && doctorId && (
              <div className="field">
                <span className="field__label">Available time</span>
                {slotsLoading ? (
                  <Skeleton lines={2} />
                ) : !slots || slots.length === 0 ? (
                  <p className="form-note">
                    No free slots for this doctor on that date — pick another day.
                  </p>
                ) : (
                  <div className="slot-grid">
                    {slots.map((item) => {
                      const isSelected =
                        slot?.start_time === item.start_time &&
                        slot?.end_time === item.end_time;
                      return (
                        <button
                          key={item.start_time}
                          type="button"
                          className={`slot-btn${isSelected ? " slot-btn--selected" : ""}`}
                          onClick={() => setSlot(item)}
                        >
                          {formatTime(item.start_time)} – {formatTime(item.end_time)}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            <div className="field">
              <span className="field__label">Your location</span>
              <p className="form-note">
                Your GPS position is sent with the request so the doctor can reach
                you.
              </p>
              <Button
                type="button"
                variant="secondary"
                loading={locating}
                onClick={shareLocation}
              >
                <MapPin size={16} />
                {geo
                  ? `Location shared (±${geo.accuracy}m)`
                  : "Share my location"}
              </Button>
            </div>

            {formError && <p className="form-note--error">{formError}</p>}
            <Button type="submit" loading={submitting}>
              <Siren size={16} /> Request emergency help
            </Button>
          </form>
        </Card>
      )}
    </div>
  );
}

/* =====================================================
   DOCTOR — pending emergency queue
   ===================================================== */

export function DoctorEmergencyScreen() {
  const { notify } = useToast();
  const [requests, setRequests] = useState<EmergencyAppointment[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [acting, setActing] = useState<number | null>(null);
  const [rejectingId, setRejectingId] = useState<number | null>(null);
  const [rejectReason, setRejectReason] = useState("");

  const load = useCallback(() => {
    listEmergencies()
      .then((response) => {
        setError(null);
        setRequests(response.data ?? []);
      })
      .catch((reason: unknown) => setError(message(reason)));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // A patient files a new emergency while this screen is open → it appears live.
  useRealtimeSync({
    refresh: load,
    events: ["appointment.emergency_created", "appointment.emergency_accepted"],
  });

  const accept = async (id: number) => {
    setActing(id);
    try {
      await respondToEmergency(id, "accept");
      notify("success", "Emergency accepted — the patient has been notified.");
      load();
    } catch (reason) {
      notify("error", message(reason));
    } finally {
      setActing(null);
    }
  };

  const reject = async (id: number) => {
    setActing(id);
    try {
      const cancelReason = rejectReason.trim();
      await respondToEmergency(
        id,
        "reject",
        cancelReason ? { cancel_reason: cancelReason } : undefined
      );
      notify("info", "Emergency request rejected.");
      setRejectingId(null);
      setRejectReason("");
      load();
    } catch (reason) {
      notify("error", message(reason));
    } finally {
      setActing(null);
    }
  };

  return (
    <div className="page emergency-page">
      <header className="emergency__hero">
        <span className="emergency__hero-icon" aria-hidden="true">
          <Siren size={26} />
        </span>
        <div>
          <h1 className="page__title">Emergency requests</h1>
          <p className="page__subtitle">
            Incoming urgent requests assigned to you — accept or reject.
          </p>
        </div>
      </header>

      {error && <ErrorState message={error} onRetry={load} />}

      {requests === null ? (
        <Skeleton lines={5} />
      ) : requests.length === 0 ? (
        <EmptyState
          icon={<Siren size={28} />}
          title="No emergency requests right now"
          description="New urgent requests from patients will appear here in real time."
        />
      ) : (
        <div className="emergency__list">
          {requests.map((request) => (
            <Card key={request.id} className="emergency__request">
              <div className="emergency__request-head">
                <span className="emergency__request-patient">
                  <UserIcon size={15} />
                  {request.patient_name || request.patient_email}
                </span>
                <span className={`badge badge--${request.status}`}>
                  {request.status}
                </span>
              </div>

              <p className="emergency__request-reason">
                <strong>{reasonLabel(request.emergency_reason)}</strong>
                {request.emergency_description
                  ? ` — ${request.emergency_description}`
                  : ""}
              </p>

              <p className="page__subtitle">
                <Clock3 size={14} /> {formatDate(request.appointment_date)} ·{" "}
                {formatTime(request.start_time)}–{formatTime(request.end_time)}
                {request.emergency_requested_at &&
                  ` · requested ${new Date(request.emergency_requested_at).toLocaleString()}`}
              </p>

              <div className="emergency__contact-line">
                {request.patient_phone && (
                  <a href={`tel:${request.patient_phone}`}>
                    <Phone size={14} /> {request.patient_phone}
                  </a>
                )}
                <a href={`mailto:${request.patient_email}`}>
                  {request.patient_email}
                </a>
              </div>

              {rejectingId === request.id ? (
                <div className="form">
                  <div className="field">
                    <label
                      className="field__label"
                      htmlFor={`reject-${request.id}`}
                    >
                      Reason (shared with the patient)
                    </label>
                    <input
                      id={`reject-${request.id}`}
                      className="field__input"
                      value={rejectReason}
                      onChange={(event) => setRejectReason(event.target.value)}
                      placeholder="e.g. Off duty — call the clinic line"
                    />
                  </div>
                  <div className="emergency__actions">
                    <Button
                      variant="danger"
                      loading={acting === request.id}
                      onClick={() => reject(request.id)}
                    >
                      Confirm rejection
                    </Button>
                    <Button
                      variant="secondary"
                      onClick={() => {
                        setRejectingId(null);
                        setRejectReason("");
                      }}
                    >
                      Cancel
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="emergency__actions">
                  <Button
                    loading={acting === request.id}
                    onClick={() => accept(request.id)}
                  >
                    <Check size={16} /> Accept
                  </Button>
                  <Button
                    variant="danger"
                    onClick={() => {
                      setRejectingId(request.id);
                      setRejectReason("");
                    }}
                  >
                    <X size={16} /> Reject
                  </Button>
                  <Link to={`/appointments/${request.id}`}>
                    <Button variant="secondary">Details</Button>
                  </Link>
                </div>
              )}
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
