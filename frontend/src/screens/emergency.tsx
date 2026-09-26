/**
 * EMERGENCY SCREEN
 * Patient emergency appointment booking with geolocation and nearby doctor search.
 */

import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import type { DoctorProfile, EmergencyReason } from "../api/types";
import { Button, Card, EmptyState, TextField } from "../components/ui";
import { useToast } from "../state/app-context";
import { useRealtimeEvent } from "../realtime/socket";
import {
  ArrowLeft,
  ArrowRight,
  MapPin,
  AlertCircle,
  User,
  Shield,
  X,
  Loader2,
  CheckCircle,
  AlertTriangle,
  MapPin as MapPinIcon,
  Heart,
  Calendar,
  Plus,
} from "lucide-react";

const EMERGENCY_REASONS: { value: EmergencyReason; label: string; icon: React.ReactNode }[] = [
  { value: "severe_pain", label: "Severe Pain", icon: <AlertTriangle size={18} /> },
  { value: "breathing_difficulty", label: "Breathing Difficulty", icon: <Heart size={18} /> },
  { value: "injury", label: "Injury / Trauma", icon: <AlertTriangle size={18} /> },
  { value: "accident", label: "Accident", icon: <AlertTriangle size={18} /> },
  { value: "sudden_illness", label: "Sudden Illness", icon: <AlertTriangle size={18} /> },
  { value: "high_fever", label: "High Fever", icon: <AlertTriangle size={18} /> },
  { value: "allergic_reaction", label: "Allergic Reaction", icon: <AlertTriangle size={18} /> },
  { value: "other", label: "Other Emergency", icon: <AlertCircle size={18} /> },
] as const;

type EmergencyStep = "location" | "doctors" | "confirm" | "pending" | "confirmed";

interface NearbyDoctor {
  doctor: DoctorProfile;
  distance: number;
}

export function EmergencyScreen() {
  const { t } = useTranslation();
  const { notify } = useToast();

  const [step, setStep] = useState<EmergencyStep>("location");
  const [location, setLocation] = useState<{ latitude: number; longitude: number; accuracy?: number } | null>(null);
  const [locationError, setLocationError] = useState<string | null>(null);
  const [locating, setLocating] = useState(false);
  const [nearbyDoctors, setNearbyDoctors] = useState<NearbyDoctor[]>([]);
  const [doctorsLoading, setDoctorsLoading] = useState(false);
  const [selectedDoctor, setSelectedDoctor] = useState<DoctorProfile | null>(null);
  const [emergencyReason, setEmergencyReason] = useState<"severe_pain" | "breathing_difficulty" | "injury" | "accident" | "sudden_illness" | "high_fever" | "allergic_reaction" | "other">("severe_pain");
  const [emergencyDescription, setEmergencyDescription] = useState("");
  const [selectedDoctorId, setSelectedDoctorId] = useState<string>("");
  const [preferredDate, setPreferredDate] = useState("");
  const [preferredTime, setPreferredTime] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [confirmedAppointment, setConfirmedAppointment] = useState<any>(null);
  const [nearbyDoctorsError, setNearbyDoctorsError] = useState<string | null>(null);
  const [searchRadius, setSearchRadius] = useState(25);

  const userLocationRef = useRef<{ latitude: number; longitude: number; accuracy?: number } | null>(null);

  // Listen for realtime appointment updates
  useRealtimeEvent((event, payload) => {
    const appointment = payload.appointment as { id?: number } | undefined;
    if (event === "appointment.emergency_accepted" && appointment?.id === confirmedAppointment?.id) {
      setConfirmedAppointment(appointment);
      setStep("confirmed");
      notify("success", "Your emergency appointment has been accepted!");
    }
    if (event === "appointment.emergency_rejected" && appointment?.id === confirmedAppointment?.id) {
      setConfirmedAppointment(appointment);
      notify("error", "Your emergency appointment was rejected.");
      setStep("doctors");
      setSelectedDoctor(null);
      setSelectedDoctorId("");
    }
  });

  // Load current location
  const getCurrentLocation = useCallback(() => {
    setLocating(true);
    setLocationError(null);

    if (!navigator.geolocation) {
      setLocationError("Geolocation is not supported by your browser.");
      setLocating(false);
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const loc = {
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracy: position.coords.accuracy,
        };
        userLocationRef.current = loc;
        setLocation(loc);
        setLocating(false);
        // Auto-search nearby doctors
        searchNearbyDoctors(loc.latitude, loc.longitude);
      },
      (error) => {
        setLocating(false);
        switch (error.code) {
          case error.PERMISSION_DENIED:
            setLocationError("Location permission denied. Please enable location access in your browser settings.");
            break;
          case error.POSITION_UNAVAILABLE:
            setLocationError("Location information is unavailable. Please try again.");
            break;
          case error.TIMEOUT:
            setLocationError("Location request timed out. Please try again.");
            break;
          default:
            setLocationError("An unknown error occurred while getting your location.");
        }
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 60000 }
    );
  }, []);

  const searchNearbyDoctors = useCallback(async (lat: number, lng: number) => {
    setDoctorsLoading(true);
    setNearbyDoctorsError(null);
    try {
      const response = await fetch(
        `/api/emergency/nearby-doctors/?latitude=${lat}&longitude=${lng}&radius=${searchRadius}`,
        { credentials: "include" }
      );
      if (!response.ok) throw new Error("Failed to fetch nearby doctors");
      const data = await response.json();
      setNearbyDoctors(data.data || []);
      if (data.data?.length === 0) {
        setNearbyDoctorsError("No nearby doctors found. Try increasing the search radius.");
      }
    } catch (error) {
      setNearbyDoctorsError("Failed to find nearby doctors. Please try again.");
    } finally {
      setDoctorsLoading(false);
    }
  }, [searchRadius]);

  useEffect(() => {
    getCurrentLocation();
  }, [getCurrentLocation]);

  const handleLocationRetry = () => {
    getCurrentLocation();
  };

  const handleDoctorSelect = (doctor: DoctorProfile) => {
    setSelectedDoctor(doctor);
    setSelectedDoctorId(String(doctor.id));
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!selectedDoctor) {
      notify("error", "Please select a doctor.");
      return;
    }
    if (!preferredDate) {
      notify("error", "Please select a preferred date.");
      return;
    }
    if (!preferredTime) {
      notify("error", "Please select a preferred time.");
      return;
    }

    setSubmitting(true);
    setError(null);

    const loc = userLocationRef.current;
    if (!loc) {
      notify("error", "Location not available. Please try again.");
      setSubmitting(false);
      return;
    }

    try {
      // Parse preferred date and time into appointment slots
      const [startTime] = preferredTime.split("-");
      const response = await fetch("/api/emergency/", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          doctor: selectedDoctorId,
          appointment_date: preferredDate,
          start_time: startTime || "09:00:00",
          end_time: preferredTime || "10:00:00",
          reason: emergencyReason.replace("_", " "),
          notes: emergencyDescription,
          emergency_reason: emergencyReason,
          emergency_description: emergencyDescription,
          emergency_latitude: userLocationRef.current!.latitude,
          emergency_longitude: userLocationRef.current!.longitude,
          emergency_location_accuracy: userLocationRef.current!.accuracy || null,
        }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.message || "Failed to create emergency appointment");
      }

      setConfirmedAppointment(data.data);
      setStep("pending");
      notify("success", "Emergency appointment requested! Waiting for doctor confirmation.");
    } catch (error) {
      setError(error instanceof Error ? error.message : "Failed to create emergency appointment");
    } finally {
      setSubmitting(false);
    }
  };

  const handleCancel = () => {
    if (confirmedAppointment?.id) {
      // TODO: implement cancel emergency appointment
    }
    setStep("doctors");
    setConfirmedAppointment(null);
  };

  const handleNewEmergency = () => {
    setStep("location");
    setSelectedDoctor(null);
    setSelectedDoctorId("");
    setConfirmedAppointment(null);
    setSelectedDoctorId("");
    setEmergencyReason("severe_pain");
    setEmergencyDescription("");
    setPreferredDate("");
    setPreferredTime("");
  };

  // Format date for display
  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr + "T00:00:00");
    return date.toLocaleDateString(undefined, { weekday: "short", year: "numeric", month: "short", day: "numeric" });
  };

  const formatTime = (timeStr: string) => {
    if (!timeStr) return "";
    const [hours, minutes] = timeStr.split(":");
    const hour = parseInt(hours, 10);
    const ampm = hour >= 12 ? "PM" : "AM";
    const hour12 = hour % 12 || 12;
    return `${hour12}:${minutes} ${ampm}`;
  };

  if (step === "location" && !location && !locating) {
    getCurrentLocation();
  }

  return (
    <div className="page emergency-page">
      <div className="emergency-header">
        <Link to="/settings" className="emergency-back">
          <ArrowLeft size={20} /> Back to Settings
        </Link>
        <div className="emergency-header-content">
          <div className="emergency-icon"><Shield size={32} /></div>
          <div>
            <h1 className="page__title">{t("emergency.title")}</h1>
            <p className="page__subtitle">{t("emergency.subtitle")}</p>
          </div>
        </div>
      </div>

      {/* Progress Indicator */}
      <div className="emergency-progress">
        {[
          { step: "location", label: "Location", completed: ["doctors", "confirm", "pending", "confirmed"].includes(step) },
          { step: "doctors", label: "Doctors", completed: ["confirm", "pending", "confirmed"].includes(step), active: step === "doctors" },
          { step: "confirm", label: "Confirm", completed: ["pending", "confirmed"].includes(step), active: step === "confirm" },
          { step: "pending", label: "Waiting", completed: step === "confirmed", active: step === "pending" },
          { step: "confirmed", label: "Confirmed", completed: step === "confirmed" },
        ].map(({ step: s, label, completed, active }) => (
          <div key={s} className={`emergency-step ${completed ? "completed" : ""} ${active ? "active" : ""}`}>
            <div className="emergency-step-circle">{completed ? <CheckCircle size={16} /> : s.charAt(0)}</div>
            <span className="emergency-step-label">{label}</span>
          </div>
        ))}
      </div>

      {/* Step 1: Location */}
{step === "location" && (
        <Card className="emergency-card">
          <div className="emergency-card-header">
            <MapPinIcon size={24} className="emergency-card-icon" />
            <div>
              <h2 className="emergency-card-title">{t("emergency.location.title")}</h2>
              <p className="emergency-card-subtitle">{t("emergency.location.subtitle")}</p>
            </div>
          </div>
          {locationError && (
            <div className="emergency-error">
              <AlertCircle size={18} />
              <span>{locationError}</span>
            </div>
          )}
          {location ? (
            <div className="emergency-location-success">
              <CheckCircle size={24} className="success" />
              <div>
                <p>{t("emergency.location.found")}</p>
                <p className="location-coords">
                  Lat: {location.latitude.toFixed(6)}, Lng: {location.longitude.toFixed(6)}
                  {location.accuracy && ` (±${Math.round(location.accuracy)}m)`}
                </p>
              </div>
            </div>
          ) : (
            <div className="emergency-loading">
              {locating ? (
                <div className="emergency-loading">
                  <Loader2 size={24} className="spin" />
                  <p>{t("emergency.location.locating")}</p>
                </div>
              ) : (
                <Button onClick={handleLocationRetry} variant="primary" className="full-width">
                  <MapPin size={18} /> {t("emergency.location.getLocation")}
                </Button>
              )}
            </div>
          )}
          {(!location || !locating) && !locationError && (
            <Button onClick={handleLocationRetry} variant="primary" className="full-width">
              <MapPin size={18} /> {t("emergency.location.getLocation")}
            </Button>
          )}
        </Card>
      )}

      {/* Step 2: Nearby Doctors */}
      {step === "doctors" && (
        <div className="emergency-steps">
          <Card className="emergency-card">
            <div className="emergency-card-header">
              <User size={24} className="emergency-card-icon" />
              <div>
                <h2 className="emergency-card-title">{t("emergency.doctors.title")}</h2>
                <p className="emergency-card-subtitle">{t("emergency.doctors.subtitle")}</p>
              </div>
            </div>

            <div className="emergency-radius-control">
              <label className="emergency-radius-label">
                <MapPinIcon size={16} />
                <span>Search Radius: {searchRadius} km</span>
              </label>
              <input
                type="range"
                min="5"
                max="50"
                step="5"
                value={searchRadius}
                onChange={(e) => setSearchRadius(Number(e.target.value))}
                className="emergency-radius-slider"
              />
              <span className="emergency-radius-value">{searchRadius} km</span>
            </div>

            {nearbyDoctorsError && (
              <div className="emergency-error">
                <AlertCircle size={18} />
                <span>{nearbyDoctorsError}</span>
              </div>
            )}

            {doctorsLoading ? (
              <div className="emergency-loading">
                <Loader2 size={24} className="spin" />
                <p>{t("emergency.doctors.searching")}</p>
              </div>
            ) : nearbyDoctors.length === 0 ? (
              <EmptyState
                icon={<User size={48} />}
                title={t("emergency.doctors.noneFound")}
                description={t("emergency.doctors.noneFoundDesc")}
              />
            ) : (
              <div className="emergency-doctors-list">
                {nearbyDoctors.map((doc) => (
                  <button
                    key={doc.doctor.id}
                    className={`emergency-doctor-card ${selectedDoctorId === String(doc.doctor.id) ? "selected" : ""}`}
                    onClick={() => handleDoctorSelect(doc.doctor)}
                  >
                    <div className="doctor-avatar">
                      {doc.doctor.profile_image ? (
                        <img src={doc.doctor.profile_image} alt="" />
                      ) : (
                        <User size={24} />
                      )}
                    </div>
                    <div className="doctor-info">
                      <div className="doctor-name">Dr. {doc.doctor.first_name} {doc.doctor.last_name}</div>
                      <div className="doctor-specialty">
                        {doc.doctor.specialties?.map((s) => s.patient_friendly_name || s.name).join(", ") || "General Practice"}
                      </div>
                      <div className="doctor-distance">
                        <MapPinIcon size={14} />
                        {doc.distance < 1 ? `${Math.round(doc.distance * 1000)}m` : `${doc.distance.toFixed(1)} km`}
                      </div>
                    </div>
                    <div className="doctor-availability">
                      <span className={`availability-badge ${doc.doctor.is_available ? "available" : "unavailable"}`}>
                        {doc.doctor.is_available ? "Available" : "Unavailable"}
                      </span>
                    </div>
                  </button>
                ))}
              </div>
            )}

            {selectedDoctor && (
              <Button
                variant="primary"
                className="full-width emergency-continue-btn"
                onClick={() => setStep("confirm")}
                disabled={!selectedDoctor}
              >
                <ArrowRight size={18} /> {t("emergency.doctors.selectDoctor")}
              </Button>
            )}
          </Card>
        </div>
      )}

      {/* Step 3: Confirm */}
      {step === "confirm" && selectedDoctor && (
        <div className="emergency-steps">
          <Card className="emergency-card emergency-confirm-card">
            <div className="emergency-card-header">
              <AlertTriangle size={24} className="emergency-card-icon emergency" />
              <div>
                <h2 className="emergency-card-title">{t("emergency.confirm.title")}</h2>
                <p className="emergency-card-subtitle">{t("emergency.confirm.subtitle")}</p>
              </div>
            </div>

            <div className="emergency-confirm-details">
              <div className="confirm-detail">
                <span className="confirm-label">{t("emergency.confirm.doctor")}</span>
                <span className="confirm-value">Dr. {selectedDoctor.first_name} {selectedDoctor.last_name}</span>
              </div>
              <div className="confirm-detail">
                <span className="confirm-label">{t("emergency.confirm.reason")}</span>
                <span className="confirm-value">{EMERGENCY_REASONS.find(r => r.value === emergencyReason)?.label || emergencyReason}</span>
              </div>
              <div className="confirm-detail">
                <span className="confirm-label">{t("emergency.confirm.date")}</span>
                <span className="confirm-value">{formatDate(preferredDate)}</span>
              </div>
              <div className="confirm-detail">
                <span className="confirm-label">{t("emergency.confirm.time")}</span>
                <span className="confirm-value">{preferredTime}</span>
              </div>
              {emergencyDescription && (
                <div className="confirm-detail">
                  <span className="confirm-label">{t("emergency.confirm.description")}</span>
                  <span className="confirm-value">{emergencyDescription}</span>
                </div>
              )}
            </div>

            <div className="emergency-form-section">
              <h3>{t("emergency.confirm.preferredTime")}</h3>
              <div className="form__row">
                <TextField
                  id="emergency-date"
                  label="Preferred Date"
                  type="date"
                  value={preferredDate}
                  onChange={(e) => setPreferredDate(e.target.value)}
                  required
                  min={new Date().toISOString().split("T")[0]}
                />
                <TextField
                  id="emergency-time"
                  label="Preferred Time"
                  type="time"
                  value={preferredTime}
                  onChange={(e) => setPreferredTime(e.target.value)}
                  required
                />
              </div>

              <div className="field">
                <label className="field__label">{t("emergency.confirm.reason")}</label>
                <div className="emergency-reason-options">
                  {EMERGENCY_REASONS.map((reason) => (
                    <label key={reason.value} className={`emergency-reason-option ${emergencyReason === reason.value ? "selected" : ""}`}>
                      <input
                        type="radio"
                        name="emergencyReason"
                        value={reason.value}
                        checked={emergencyReason === reason.value}
                        onChange={() => setEmergencyReason(reason.value)}
                      />
                      <span className="reason-content">
                        <span className="reason-icon">{reason.icon}</span>
                        <span className="reason-label">{reason.label}</span>
                      </span>
                    </label>
                  ))}
                </div>
              </div>

              <div className="field">
                <label className="field__label" htmlFor="emergency-description">{t("emergency.confirm.description")}</label>
                <textarea
                  id="emergency-description"
                  className="field__input"
                  rows={3}
                  placeholder={t("emergency.confirm.descriptionPlaceholder")}
                  value={emergencyDescription}
                  onChange={(e) => setEmergencyDescription(e.target.value)}
                />
              </div>

              <div className="emergency-confirm-actions">
                <Button variant="secondary" onClick={() => setStep("doctors")}>
                  <X size={16} /> {t("emergency.confirm.back")}
                </Button>
                <Button variant="primary" loading={submitting} onClick={handleSubmit} disabled={submitting || !preferredDate || !preferredTime}>
                  <Loader2 size={16} className={submitting ? "spin" : ""} />
                  {submitting ? t("emergency.confirm.submitting") : t("emergency.confirm.request")}
                </Button>
              </div>
            </div>
          </Card>
        </div>
      )}

      {/* Step 4: Pending */}
      {step === "pending" && confirmedAppointment && (
        <div className="emergency-steps">
          <Card className="emergency-card emergency-pending-card">
            <div className="emergency-card-header">
              <Loader2 size={24} className="spin emergency-card-icon pending" />
              <div>
                <h2 className="emergency-card-title">{t("emergency.pending.title")}</h2>
                <p className="emergency-card-subtitle">{t("emergency.pending.subtitle")}</p>
              </div>
            </div>

            <div className="emergency-pending-details">
              <div className="pending-detail">
                <span className="pending-label">{t("emergency.pending.doctor")}</span>
                <span className="pending-value">Dr. {confirmedAppointment.doctor?.first_name} {confirmedAppointment.doctor?.last_name}</span>
              </div>
              <div className="pending-detail">
                <span className="pending-label">{t("emergency.pending.requestedAt")}</span>
                <span className="pending-value">{formatDate(confirmedAppointment.created_at)} {formatTime(confirmedAppointment.start_time)}</span>
              </div>
              <div className="pending-detail">
                <span className="pending-label">{t("emergency.pending.status")}</span>
                <span className="pending-value pending-status">{confirmedAppointment.status}</span>
              </div>
            </div>

            <div className="emergency-pending-actions">
              <Button variant="secondary" onClick={handleCancel}>
                <X size={16} /> {t("emergency.pending.cancel")}
              </Button>
            </div>

            <div className="emergency-pending-note">
              <AlertCircle size={16} />
              <span>{t("emergency.pending.note")}</span>
            </div>
          </Card>
        </div>
      )}

      {/* Step 5: Confirmed */}
      {step === "confirmed" && confirmedAppointment && (
        <div className="emergency-steps">
          <Card className="emergency-card emergency-confirmed-card">
            <div className="emergency-card-header">
              <CheckCircle size={24} className="emergency-card-icon success" />
              <div>
                <h2 className="emergency-card-title">{t("emergency.confirmed.title")}</h2>
                <p className="emergency-card-subtitle">{t("emergency.confirmed.subtitle")}</p>
              </div>
            </div>

            <div className="emergency-confirmed-details">
              <div className="confirmed-detail">
                <span className="confirmed-label">{t("emergency.confirmed.doctor")}</span>
                <span className="confirmed-value">Dr. {confirmedAppointment.doctor?.first_name} {confirmedAppointment.doctor?.last_name}</span>
              </div>
              <div className="confirmed-detail">
                <span className="confirmed-label">{t("emergency.confirmed.date")}</span>
                <span className="confirmed-value">{formatDate(confirmedAppointment.appointment_date)}</span>
              </div>
              <div className="confirmed-detail">
                <span className="confirmed-label">{t("emergency.confirmed.time")}</span>
                <span className="confirmed-value">{formatTime(confirmedAppointment.start_time)} - {formatTime(confirmedAppointment.end_time)}</span>
              </div>
              <div className="confirmed-detail">
                <span className="confirmed-label">{t("emergency.confirmed.status")}</span>
                <span className="confirmed-value confirmed-status">{confirmedAppointment.status}</span>
              </div>
              {confirmedAppointment.emergency_reason && (
                <div className="confirm-detail">
                  <span className="confirmed-label">{t("emergency.confirmed.reason")}</span>
                  <span className="confirmed-value">{EMERGENCY_REASONS.find(r => r.value === confirmedAppointment.emergency_reason)?.label || confirmedAppointment.emergency_reason}</span>
                </div>
              )}
            </div>

            <div className="emergency-confirmed-actions">
              <Link to={`/appointments/${confirmedAppointment.id}`}>
                <Button variant="primary">
                  <Calendar size={16} /> {t("emergency.confirmed.viewAppointment")}
                </Button>
              </Link>
              <Button variant="secondary" onClick={handleNewEmergency}>
                <Plus size={16} /> {t("emergency.confirmed.newEmergency")}
              </Button>
            </div>
          </Card>
        </div>
      )}

      {error && (
        <div className="emergency-error-banner">
          <AlertCircle size={18} />
          <span>{error}</span>
          <Button variant="ghost" className="btn--sm" onClick={() => setError(null)}>
            <X size={14} />
          </Button>
        </div>
      )}
    </div>
  );
}