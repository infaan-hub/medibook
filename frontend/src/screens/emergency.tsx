/**
 * Emergency section (§27) — one file, two role screens:
 *
 *   PatientEmergencyScreen (/emergency)      — SOS form (reason + location + a
 *     merged slot grid for TODAY across the doctors nearby). No date picker: the
 *     appointment starts the moment the emergency happens, so it is always
 *     booked for the current day. No doctor picker either — whoever is free and
 *     nearest at that time is dispatched automatically and the appointment is
 *     confirmed on the spot. Plus the live status card.
 *   DoctorEmergencyScreen  (/doctor/emergency) — live requests assigned to them
 *     (auto-confirmed ones included) with patient contact details, plus the
 *     legacy pending queue with one-tap accept / reject.
 */

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import {
  createEmergency,
  listEmergencies,
  listEmergencySlots,
  respondToEmergency,
} from "../api/emergency";
import type { EmergencyAppointment, EmergencyReason } from "../api/types";
import type { EmergencySlot } from "../api/emergency";
import { Button, Card, EmptyState, ErrorState, Skeleton } from "../components/ui";
import { ApiError } from "../api/client";
import {
  directionsUrl,
  formatDistance,
  formatCoords,
  haversineKm,
} from "../lib/location";
import { nearestAreaName } from "../lib/zanzibar";
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

/**
 * Today in the browser's own calendar, `YYYY-MM-DD`.
 *
 * Deliberately not `toISOString().slice(0, 10)`: that is the UTC day, which in
 * Dar es Salaam (UTC+3) is still *yesterday* between 00:00 and 02:59 — an
 * emergency raised then would be booked on the wrong date.
 */
export function todayStr(now: Date = new Date()): string {
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
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

/**
 * Where the patient is: a Zanzibar ward name first (coordinates mean nothing
 * on their own), then the raw coordinates and a one-tap maps link.
 */
function emergencyLocationRow(request: EmergencyAppointment) {
  if (
    typeof request.emergency_latitude !== "number" ||
    typeof request.emergency_longitude !== "number"
  ) {
    return null;
  }
  const point = {
    latitude: request.emergency_latitude,
    longitude: request.emergency_longitude,
  };
  const area = nearestAreaName(point);
  const coords = formatCoords(point);
  const maps = directionsUrl(point);
  return (
    <p className="emergency__contact-line">
      <MapPin size={14} /> {area ? `Patient is in ${area}` : "Patient location"}
      {coords ? ` · ${coords}` : ""}
      {maps && (
        <>
          {" · "}
          <a href={maps} target="_blank" rel="noreferrer">
            Open in Google Maps
          </a>
        </>
      )}
    </p>
  );
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

  const [reason, setReason] = useState<EmergencyReason | "">("");
  const [description, setDescription] = useState("");
  const [slot, setSlot] = useState<EmergencySlot | null>(null);
  const [slots, setSlots] = useState<EmergencySlot[] | null>(null);
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
  }, [load]);

  // Doctor accepted / rejected while this screen is open → status updates live.
  useRealtimeSync({
    refresh: load,
    events: ["appointment.emergency_accepted", "appointment.emergency_rejected"],
  });

  // The day the appointment starts: the emergency's own day, never a choice.
  // Declared above the slot effect so its dependency array can read it.
  const today = todayStr();

  // The merged grid needs the patient's position (for distance). The date is
  // never asked for — an emergency starts today, so today is what we query.
  useEffect(() => {
    if (!geo) {
      setSlots(null);
      setSlot(null);
      return;
    }
    let cancelled = false;
    setSlotsLoading(true);
    setSlots(null);
    setSlot(null);
    listEmergencySlots({ latitude: geo.latitude, longitude: geo.longitude, date: today })
      .then((response) => {
        if (!cancelled) setSlots(response.data ?? []);
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
  }, [geo, today]);

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
    if (!reason || !slot) {
      setFormError("Choose an emergency reason and a time slot.");
      return;
    }
    setSubmitting(true);
    try {
      // GPS is required by the API; reuse the shared fix or take one now.
      const fix = geo ?? (await requestGeo());
      if (!geo) setGeo(fix);
      const response = await createEmergency({
        appointment_date: today,
        start_time: slot.start_time,
        end_time: slot.end_time,
        emergency_reason: reason,
        emergency_description: description.trim() || undefined,
        emergency_latitude: fix.latitude,
        emergency_longitude: fix.longitude,
        emergency_location_accuracy: fix.accuracy,
      });
      const assigned = response.data?.doctor_name;
      const where = formatDistance(slot.distance_km) ?? "nearby";
      notify(
        "success",
        assigned
          ? `Emergency sent to Dr. ${assigned} — ${where}${slot.area ? ` — ${slot.area}` : ""}.`
          : "Emergency sent — the nearest available doctor has been assigned."
      );
      setReason("");
      setDescription("");
      setSlot(null);
      setSlots(null);
      setGeo(null);
      load();
    } catch (reason_) {
      if (reason_ instanceof ApiError && Array.isArray(reason_.errors.location)) {
        setFormError(
          "A doctor in this area has not set a practice location. Please try another time slot."
        );
      } else {
        setFormError(message(reason_));
      }
    } finally {
      setSubmitting(false);
    }
  };

  // Ward label for the live fix, so "Location shared" reads like a place name.
  const patientAreaFromFix = geo ? nearestAreaName(geo) : null;

  // Zanzibar area labels for the live status card — coordinates alone mean
  // nothing to a patient reading them under stress.
  const patientPoint =
    active &&
    typeof active.emergency_latitude === "number" &&
    typeof active.emergency_longitude === "number"
      ? { latitude: active.emergency_latitude, longitude: active.emergency_longitude }
      : null;
  const doctorPoint =
    active &&
    typeof active.doctor_latitude === "number" &&
    typeof active.doctor_longitude === "number"
      ? { latitude: active.doctor_latitude, longitude: active.doctor_longitude }
      : null;
  const doctorDistance =
    patientPoint && doctorPoint ? haversineKm(patientPoint, doctorPoint) : null;
  const doctorArea = doctorPoint ? nearestAreaName(doctorPoint) : null;
  const doctorMaps = doctorPoint ? directionsUrl(doctorPoint) : null;
  const patientArea = patientPoint ? nearestAreaName(patientPoint) : null;

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
          {(active.doctor_name || active.doctor_phone) && (
            <p className="emergency__contact-line">
              <UserIcon size={14} /> {active.doctor_name ? `Dr. ${active.doctor_name}` : "Doctor"}
              {doctorDistance !== null && ` · ${formatDistance(doctorDistance) ?? ""}`}
              {doctorArea ? ` — ${doctorArea}` : ""}
              {active.doctor_phone && (
                <>
                  {" · "}
                  <a href={`tel:${active.doctor_phone}`}>{active.doctor_phone}</a>
                </>
              )}
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
          {doctorMaps && (
            <p className="emergency__contact-line">
              <MapPin size={14} />{" "}
              <a href={doctorMaps} target="_blank" rel="noreferrer">
                Open the doctor's location in Google Maps
              </a>
            </p>
          )}
          {patientPoint && (
            <p className="emergency__contact-line">
              <MapPin size={14} /> Your location: {patientArea ?? "shared"} ·{" "}
              {formatCoords(patientPoint)}
            </p>
          )}
          {active.status === "pending" && (
            <p className="form-note">Waiting for the doctor to accept your request…</p>
          )}
          {active.status === "confirmed" && (
            <p className="form-note">
              The nearest available doctor has been assigned — no waiting on an accept.
            </p>
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
              <span className="field__label">Your location</span>
              <p className="form-note">
                Your GPS position picks the doctors near you and tells them how to
                reach you.
              </p>
              <Button
                type="button"
                variant="secondary"
                loading={locating}
                onClick={shareLocation}
              >
                <MapPin size={16} />
                {geo
                  ? `Location shared (±${geo.accuracy}m${patientAreaFromFix ? ` · ${patientAreaFromFix}` : ""})`
                  : "Share my location"}
              </Button>
            </div>

            {geo && (
              <div className="field">
                <span className="field__label">Available time</span>
                {slotsLoading ? (
                  <Skeleton lines={2} />
                ) : !slots || slots.length === 0 ? (
                  <p className="form-note">
                    No doctor nearby has a free slot today — try again shortly.
                  </p>
                ) : (
                  <div className="slot-grid">
                    {slots.map((item) => {
                      const isSelected =
                        slot?.start_time === item.start_time &&
                        slot?.end_time === item.end_time;
                      return (
                        <button
                          key={`${item.start_time}-${item.end_time}`}
                          type="button"
                          className={`slot-btn${isSelected ? " slot-btn--selected" : ""}`}
                          onClick={() => setSlot(item)}
                        >
                          {formatTime(item.start_time)} – {formatTime(item.end_time)}
                          <small>
                            {formatDistance(item.distance_km) ?? ""}
                            {item.area ? ` — ${item.area}` : ""}
                          </small>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {!geo && (
              <p className="form-note">
                Share your location to see which doctors nearby have free times today.
              </p>
            )}

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
            Urgent requests assigned to you — auto-dispatched ones are already
            confirmed; older pending ones still need accept or reject.
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

              {emergencyLocationRow(request)}

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
                  {request.status === "pending" ? (
                    <Button
                      loading={acting === request.id}
                      onClick={() => accept(request.id)}
                    >
                      <Check size={16} /> Accept
                    </Button>
                  ) : (
                    <p className="form-note">
                      Auto-assigned — already confirmed for the patient. Reject only if
                      you cannot attend.
                    </p>
                  )}
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
