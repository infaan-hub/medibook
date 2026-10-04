/**
 * Emergency section (§27 / §29) — one file, two role screens:
 *
 *   PatientEmergencyScreen (/emergency)      — SOS form (reason + location).
 *     No date picker and no slot grid: the emergency is stamped with the
 *     current moment, and auto-dispatch hands it to a doctor who is available
 *     right now — falling back to the nearest nearby doctor when nobody is, so
 *     the request is always sent and notified. Plus the live status card, which
 *     tracks the server's 30-minute re-request window with a countdown and
 *     silently re-reads the queue the moment it runs out (§30) — the browser
 *     never reloads, and never decides on its own that the request expired.
 *   DoctorEmergencyScreen  (/doctor/emergency) — live requests assigned to them
 *     (auto-accepted ones included) driven by the server's state machine:
 *       pending → [Accept] | [Reject]
 *       accepted → [Emergency In Progress] | [Reject]
 *       in_progress → [Done]   (the only state that ends a visit the patient
 *                              can then re-request from)
 */

import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import {
  createEmergency,
  getEmergencyEligibility,
  listEmergencies,
  respondToEmergency,
} from "../api/emergency";
import type {
  AppointmentStatus,
  EmergencyAppointment,
  EmergencyEligibility,
  EmergencyReason,
} from "../api/types";
import { Button, Card, EmptyState, ErrorState, Skeleton } from "../components/ui";
import { ApiError } from "../api/client";
import {
  directionsUrl,
  formatDistance,
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

function nowMoment(now: Date = new Date()): { date: string; start: string; end: string } {
  const pad = (value: number) => String(value).padStart(2, "0");
  const clock = (total: number) =>
    `${pad(Math.floor(total / 3600))}:${pad(Math.floor((total % 3600) / 60))}:${pad(total % 60)}`;
  const startSec = now.getHours() * 3600 + now.getMinutes() * 60 + now.getSeconds();
  return {
    date: todayStr(now),
    start: clock(startSec),
    end: clock(Math.min(startSec + 30 * 60, 24 * 3600)),
  };
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

export function reasonLabel(reason?: string | null): string {
  if (!reason) return "Emergency";
  return REASON_LABELS[reason] ?? reason.replace(/_/g, " ");
}

/** Statuses that still hold the patient's single active emergency (§4). */
const OPEN_STATUSES: readonly AppointmentStatus[] = ["pending", "accepted", "in_progress"];

/** Human wording for every status the API can return (badge + cards). */
const STATUS_LABELS: Record<AppointmentStatus, string> = {
  pending: "Pending",
  accepted: "Accepted",
  in_progress: "In progress",
  done: "Completed",
  cancelled: "Cancelled",
  rejected: "Rejected",
  expired: "Expired",
};

export function statusLabel(status: AppointmentStatus): string {
  return STATUS_LABELS[status] ?? status;
}

/** The server's re-request window — mirrored ONLY to render the countdown. */
const EMERGENCY_WINDOW_MS = 30 * 60 * 1000;

/** mm:ss left, clamped at zero. */
function formatCountdown(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

/**
 * When this patient may file again, as an ISO instant.
 *
 * The server owns the arithmetic (§7): its eligibility answer already applied
 * COALESCE(emergency_requested_at, created_at). The local fallback exists only
 * so the card still counts down before that first response lands.
 */
function deadlineFor(
  active: EmergencyAppointment | null,
  eligibility: EmergencyEligibility | null
): string | null {
  if (eligibility && eligibility.activeEmergencyId !== null && eligibility.availableAt) {
    return eligibility.availableAt;
  }
  if (!active || active.status === "in_progress" || !active.emergency_requested_at) {
    return null;
  }
  return new Date(
    Date.parse(active.emergency_requested_at) + EMERGENCY_WINDOW_MS
  ).toISOString();
}

/**
 * Ticks once a second while `iso` is in the future; null when there is no
 * deadline, zero-or-less once it has passed (the caller then re-reads §30).
 */
function useRemainingMs(iso: string | null): number | null {
  const target = iso ? Date.parse(iso) : Number.NaN;
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (Number.isNaN(target) || target <= Date.now()) return;
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [target]);

  if (Number.isNaN(target)) return null;
  return target - now;
}

/**
 * Where the patient is: the Zanzibar ward name plus a one-tap maps link. The
 * raw coordinates stay internal — the ward is what a doctor can act on.
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
  const maps = directionsUrl(point);
  return (
    <p className="emergency__contact-line">
      <MapPin size={14} /> {area ? `Patient is in ${area}` : "Patient location"}
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

/** Pull structured eligibility out of a 409 body, when the server attached one. */
function eligibilityFromError(error: unknown): EmergencyEligibility | null {
  if (!(error instanceof ApiError)) return null;
  const data = error.data;
  if (!data || typeof data !== "object" || !("canCreateEmergency" in data)) return null;
  return data as unknown as EmergencyEligibility;
}

/* =====================================================
   PATIENT — request emergency help + active status
   ===================================================== */

export function PatientEmergencyScreen() {
  const { notify } = useToast();
  const [emergencies, setEmergencies] = useState<EmergencyAppointment[] | null>(null);
  const [eligibility, setEligibility] = useState<EmergencyEligibility | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [reason, setReason] = useState<EmergencyReason | "">("");
  const [description, setDescription] = useState("");
  const [geo, setGeo] = useState<GeoFix | null>(null);
  const [locating, setLocating] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // The screen shows the live request whenever one is open; the form otherwise.
  const active =
    emergencies?.find((item) => OPEN_STATUSES.includes(item.status)) ?? null;

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

  /** Server-side answer + its 30-minute sweep (§18). Failures only hide it. */
  const loadEligibility = useCallback(() => {
    getEmergencyEligibility()
      .then((response) => setEligibility(response.data))
      .catch(() => setEligibility(null));
  }, []);

  const refresh = useCallback(() => {
    load();
    loadEligibility();
  }, [load, loadEligibility]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // A doctor acts (or the patient files from another tab) → status updates live.
  useRealtimeSync({
    refresh,
    events: [
      "appointment.emergency_created",
      "appointment.emergency_accepted",
      "appointment.emergency_rejected",
      "appointment.emergency_in_progress",
      "appointment.emergency_completed",
    ],
  });

  const deadline = useMemo(() => deadlineFor(active, eligibility), [active, eligibility]);
  const remainingMs = useRemainingMs(deadline);

  // §30: the window closed → re-read silently (the read sweeps server-side),
  // so the card turns back into the form without any reload.
  const reconciledDeadline = useRef<string | null>(null);
  useEffect(() => {
    if (!deadline || remainingMs === null || remainingMs > 0) return;
    if (reconciledDeadline.current === deadline) return;
    reconciledDeadline.current = deadline;
    refresh();
  }, [deadline, remainingMs, refresh]);

  // The server blocked us with a row this queue has not shown yet (another tab
  // filed one first) → pull the queue once so the live card can render.
  const blockedId =
    eligibility && !eligibility.canCreateEmergency ? eligibility.activeEmergencyId : null;
  const fetchedBlockedId = useRef<number | null>(null);
  useEffect(() => {
    if (blockedId === null || active !== null || fetchedBlockedId.current === blockedId) return;
    fetchedBlockedId.current = blockedId;
    load();
  }, [blockedId, active, load]);

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
    if (!reason) {
      setFormError("Choose an emergency reason.");
      return;
    }
    setSubmitting(true);
    try {
      // GPS is required by the API; reuse the shared fix or take one now.
      const fix = geo ?? (await requestGeo());
      if (!geo) setGeo(fix);
      const moment = nowMoment();
      const response = await createEmergency({
        appointment_date: moment.date,
        start_time: moment.start,
        end_time: moment.end,
        emergency_reason: reason,
        emergency_description: description.trim() || undefined,
        emergency_latitude: fix.latitude,
        emergency_longitude: fix.longitude,
        emergency_location_accuracy: fix.accuracy,
      });
      const assigned = response.data?.doctor_name;
      notify(
        "success",
        assigned
          ? `Emergency sent to Dr. ${assigned}.`
          : "Emergency sent — the nearest doctor has been assigned."
      );
      setReason("");
      setDescription("");
      setGeo(null);
      refresh();
    } catch (reason_) {
      // A 409 carries the blocking eligibility (§28) — reconcile instead of
      // only printing the message.
      const blocked = eligibilityFromError(reason_);
      if (blocked) {
        setEligibility(blocked);
        load();
      }
      if (reason_ instanceof ApiError && Array.isArray(reason_.errors.location)) {
        setFormError(
          "A doctor in this area has not set a practice location. Please try again."
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

  const blocked = Boolean(eligibility && !eligibility.canCreateEmergency);

  // Nothing is open any more, but the queue still holds the previous request —
  // say WHY it ended instead of silently showing an empty form (§25).
  const lastClosed = useMemo(() => {
    if (active || !emergencies || emergencies.length === 0) return null;
    const newest = emergencies[0];
    return newest && !OPEN_STATUSES.includes(newest.status) ? newest : null;
  }, [active, emergencies]);

  const closedNote = (() => {
    if (!lastClosed) return null;
    switch (lastClosed.status) {
      case "done":
        return "Your last emergency was completed by the doctor — you can request help again.";
      case "expired":
        return "Your last emergency expired after 30 minutes without a doctor starting it — you can request help again.";
      case "rejected":
        return `Your last emergency request was rejected${
          lastClosed.cancel_reason ? `: ${lastClosed.cancel_reason}` : ""
        }.`;
      case "cancelled":
        return `Your last emergency request was cancelled${
          lastClosed.cancel_reason ? `: ${lastClosed.cancel_reason}` : ""
        }.`;
      default:
        return null;
    }
  })();

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
            <span className={`badge badge--${active.status}`}>
              {statusLabel(active.status)}
            </span>
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
              <MapPin size={14} /> Your location: {patientArea ?? "shared"}
            </p>
          )}
          {active.status === "pending" && (
            <p className="form-note">Waiting for the doctor to accept your request…</p>
          )}
          {active.status === "accepted" && (
            <p className="form-note">
              The nearest doctor has been assigned — no waiting on an accept.
            </p>
          )}
          {active.status === "in_progress" && (
            <p className="form-note">
              The doctor is with you now. Your emergency stays open until they
              complete the visit.
            </p>
          )}
          {active.status !== "in_progress" && remainingMs !== null && remainingMs > 0 && (
            <p className="form-note">
              <Clock3 size={14} /> If the doctor does not start the emergency, you
              can request help again in {formatCountdown(remainingMs)}.
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
      ) : blocked && eligibility ? (
        /* -------- the server says no (§30): show why + the countdown -------- */
        <Card className="emergency__status">
          <div className="emergency__status-head">
            <span className={`badge badge--${eligibility.status ?? "pending"}`}>
              {eligibility.status ? statusLabel(eligibility.status) : "Active"}
            </span>
            <span className="emergency__status-reason">
              <ShieldAlert size={15} /> Emergency already open
            </span>
          </div>
          <p>{eligibility.message ?? "You already have an active emergency request."}</p>
          {eligibility.status === "in_progress" ? (
            <p className="form-note">
              You cannot file a second one while a doctor is with you — it ends
              when they mark the visit done.
            </p>
          ) : (
            remainingMs !== null &&
            remainingMs > 0 && (
              <p className="form-note">
                <Clock3 size={14} /> You can request help again in{" "}
                {formatCountdown(remainingMs)}.
              </p>
            )
          )}
          <div className="emergency__actions">
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
          {closedNote && <p className="form-note">{closedNote}</p>}
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
                  ? `Location shared${patientAreaFromFix ? ` · ${patientAreaFromFix}` : ""}`
                  : "Share my location"}
              </Button>
            </div>

            {!geo && (
              <p className="form-note">
                Share your location so the nearest doctor can be dispatched and
                reach you.
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
   DOCTOR — live queue driven by the server state machine
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
  // The lifecycle events are subscribed too, so an action taken from another
  // screen (or the dashboard) refreshes this queue instead of leaving a stale row.
  useRealtimeSync({
    refresh: load,
    events: [
      "appointment.emergency_created",
      "appointment.emergency_accepted",
      "appointment.emergency_rejected",
      "appointment.emergency_in_progress",
      "appointment.emergency_completed",
    ],
  });

  /** One server-backed transition; the queue reloads from the API after it. */
  const act = async (
    id: number,
    action: "accept" | "reject" | "in-progress" | "done",
    body?: { cancel_reason?: string },
    success?: string
  ) => {
    setActing(id);
    try {
      if (body) {
        await respondToEmergency(id, action, body);
      } else {
        await respondToEmergency(id, action);
      }
      if (success) notify("success", success);
      setRejectingId(null);
      setRejectReason("");
      load();
    } catch (reason) {
      notify("error", message(reason));
      // The row may have changed in another tab → re-read rather than assume.
      load();
    } finally {
      setActing(null);
    }
  };

  const accept = (id: number) =>
    act(id, "accept", undefined, "Emergency accepted — the patient has been notified.");

  const startInProgress = (id: number) =>
    act(
      id,
      "in-progress",
      undefined,
      "Emergency in progress — the patient can see you are on your way."
    );

  const complete = (id: number) =>
    act(id, "done", undefined, "Emergency completed. The patient may request help again.");

  const reject = (id: number) => {
    const cancelReason = rejectReason.trim();
    return act(
      id,
      "reject",
      cancelReason ? { cancel_reason: cancelReason } : undefined,
      "Emergency request rejected."
    );
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
            Urgent requests assigned to you — accept the new ones, then take them
            in progress and close them when the visit ends.
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
                  {statusLabel(request.status)}
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
                  {request.status === "pending" && (
                    <Button
                      loading={acting === request.id}
                      onClick={() => accept(request.id)}
                    >
                      <Check size={16} /> Accept
                    </Button>
                  )}

                  {request.status === "accepted" && (
                    <>
                      <p className="form-note">
                        Auto-assigned — accepted for the patient. Mark it in
                        progress once you are with them.
                      </p>
                      <Button
                        loading={acting === request.id}
                        onClick={() => startInProgress(request.id)}
                      >
                        <ShieldAlert size={16} /> Emergency In Progress
                      </Button>
                    </>
                  )}

                  {request.status === "in_progress" && (
                    <>
                      <p className="form-note">
                        Visit open — close it with Done, which is what lets the
                        patient request help again later.
                      </p>
                      <Button
                        loading={acting === request.id}
                        onClick={() => complete(request.id)}
                      >
                        <Check size={16} /> Done
                      </Button>
                    </>
                  )}

                  {/* Reject is legal only while the request is still open. Once the
                      doctor is `in_progress` the server accepts Done alone, and a
                      `done` visit is history — so neither offers Reject. */}
                  {(request.status === "pending" || request.status === "accepted") && (
                    <Button
                      variant="danger"
                      onClick={() => {
                        setRejectingId(request.id);
                        setRejectReason("");
                      }}
                    >
                      <X size={16} /> Reject
                    </Button>
                  )}

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
