/**
 * Shared API types (Â§28 envelope).
 */

export interface User {
  id: number;
  username: string;
  email: string;
  first_name: string;
  last_name: string;
  role: "patient" | "doctor" | "admin";
  phone: string;
  is_superuser: boolean;
  profile_image: string | null;
  date_joined: string | null;
  /**
   * Doctor accounts only. False until the SERVER verified every required
   * first-login step (notifications, location, profile picture, My Doctor
   * information) — never written by the client, so it survives refresh,
   * logout/login and browser restarts.
   */
  doctor_onboarding_completed?: boolean;
  /**
   * Brute-force state (admin users directory only — never part of the session
   * payload). `account_locked` drives the lock badge + Unlock button,
   * `failed_login_attempts` the "N failed attempts" hint, `lock_reason` the
   * admin-only vs auto-unlock distinction.
   */
  account_locked?: boolean;
  locked_until?: string | null;
  lock_reason?: string;
  failed_login_attempts?: number;
}

export interface AuditEvent {
  id: number;
  action: string;
  target: string;
  detail: string;
  actor: string;
  created_at: string;
}

export interface AuthPair {
  access: string;
  refresh: string;
}

export interface AuthPayload extends AuthPair {
  user: User;
}

/* ---- Request payloads (Â§27 contracts, PHASE 5) ---- */

export interface RegisterPayload {
  username: string;
  email: string;
  password: string;
  password_confirm: string;
  first_name: string;
  last_name: string;
  phone?: string;
  role: "patient" | "doctor";
}

export interface ChangePasswordPayload {
  old_password: string;
  new_password: string;
  new_password_confirm: string;
}

export interface ResetConfirmPayload {
  token: string;
  new_password: string;
  new_password_confirm: string;
}

/* ---- PHASE 6 â€” Patient module ---- */

export type Gender = "" | "male" | "female" | "other";

/**
 * Real geolocation shared by patient and doctor profiles (Phase 1).
 *
 * The old free-text `address` / `city` / `office_address` fields were dropped:
 * they could not be measured, so "nearby" search and the emergency
 * nearby-doctors route had nothing to sort on. Everything now uses WGS84
 * coordinates captured through the browser Geolocation API.
 */
export interface GeoFields {
  /** Degrees, or null when the user has never shared a location. */
  latitude: number | null;
  longitude: number | null;
  /** Browser-reported accuracy in metres (null when unknown). */
  location_accuracy: number | null;
  /** ISO timestamp of the last capture â€” lets the UI show how fresh a fix is. */
  location_captured_at: string | null;
  /** False â†’ the client must prompt for a location before booking an appointment. */
  has_location: boolean;
}

/** Coordinates sent when saving a location. Both must be present or both null. */
export interface GeoInput {
  latitude?: number | null;
  longitude?: number | null;
  location_accuracy?: number | null;
}

/** GET/PATCH /api/patients/profile/ payload (backend patients/serializers.py). */
export interface PatientProfile extends GeoFields {
  id: number;
  email: string;
  first_name: string;
  last_name: string;
  date_of_birth: string | null;
  gender: Gender;
  emergency_contact_name: string;
  emergency_contact_phone: string;
  blood_group: string;
  allergies: string;
  medical_history: string;
  reminder_preferences: Record<string, boolean>;
  /** IANA timezone used to format reminder times (default "UTC"). */
  timezone?: string;
}

export type UpdatePatientProfilePayload = Partial<
  Omit<PatientProfile, "id" | "email">
> & {
  reminder_preferences?: Record<string, boolean>;
  timezone?: string;
};

/** GET /api/patients/linked-doctors/ â€” doctors a patient may share records with. */
export interface LinkedDoctor {
  id: number;
  first_name: string;
  last_name: string;
  email: string;
  specialties: string[];
}

export type AppointmentStatus =
  | "pending"
  | "accepted"
  | "in_progress"
  | "done"
  | "cancelled"
  | "rejected"
  | "expired";

export type AppointmentType = "NORMAL" | "EMERGENCY";

export type EmergencyReason =
  | "severe_pain"
  | "breathing_difficulty"
  | "injury"
  | "accident"
  | "sudden_illness"
  | "high_fever"
  | "allergic_reaction"
  | "other";

/** Appointment list/detail fields (backend appointments/serializers.py). */
export interface Appointment {
  id: number;
  patient: number;
  patient_email: string;
  doctor: number | null;
  hospital: number | null;
  appointment_date: string;
  start_time: string;
  end_time: string;
  status: AppointmentStatus;
  appointment_type: AppointmentType;
  reason: string;
  notes: string;
  cancel_reason: string;
  emergency_reason?: EmergencyReason;
  emergency_description?: string;
  emergency_latitude?: number;
  emergency_longitude?: number;
  emergency_location_accuracy?: number;
  emergency_requested_at?: string | null;
  /** Waiting-room state (phase 11) â€” null until the patient checks in. */
  checked_in_at?: string | null;
  consultation_started_at?: string | null;
}

/** POST/GET /api/emergency/ rows (emergencyAppointmentDto). */
export interface EmergencyAppointment extends Appointment {
  /** Shown on the doctor's emergency queue and the patient's live status card. */
  patient_name?: string;
  patient_phone?: string;
  doctor_phone?: string;
  doctor_phone_secondary?: string;
  /** Auto-dispatch names the doctor it picked and shares their practice coordinates. */
  doctor_name?: string;
  doctor_latitude?: number | null;
  doctor_longitude?: number | null;
  /**
   * Emergency lifecycle stamps (§27) — each one is written exactly once by the
   * server when the request passes that stage, and stays null until then.
   */
  emergency_accepted_at?: string | null;
  emergency_in_progress_at?: string | null;
  emergency_completed_at?: string | null;
  emergency_expired_at?: string | null;
}

/** Why the server refuses another emergency request right now (§7). */
export type EmergencyBlockReason = "EMERGENCY_ACTIVE" | "EMERGENCY_IN_PROGRESS";

/**
 * GET /api/emergency/eligibility/ — the server's own answer to "may this
 * patient file an emergency right now?" (§7, §30). Read it before showing the
 * request form; POST /api/emergency/ re-checks the same rules anyway.
 */
export interface EmergencyEligibility {
  canCreateEmergency: boolean;
  reason: EmergencyBlockReason | null;
  /** ISO instant the patient may request again, or null when no timer applies. */
  availableAt: string | null;
  /** Status of the row currently blocking (null when nothing is active). */
  status: AppointmentStatus | null;
  activeEmergencyId: number | null;
  message: string | null;
}

/** Â§28 response envelope: success/message/data on success, errors on failure. */
export interface Envelope<T = unknown> {
  success: boolean;
  message: string;
  data: T;
  errors?: Record<string, string[]>;
}

/** Paginated payload shape produced by common/pagination.py. */
export interface Paginated<T> {
  count: number;
  next: string | null;
  previous: string | null;
  results: T[];
}

/* ---- PHASE 7 â€” Doctor module ---- */

export interface DoctorProfile extends GeoFields {
  id: number;
  email: string;
  first_name: string;
  last_name: string;
  /** Contact number on the account â€” shown on the doctor card and to patients. */
  phone: string;
  /** Optional second contact number stored on the doctor profile row. */
  phone_secondary?: string;
  profile_image: string | null;
  specialties: Specialty[];
  hospitals: number[];
  qualifications: string;
  experience_years: number | null;
  consultation_fee: string;
  bio: string;
  is_available: boolean;
  available_today?: boolean;
  /** Present only when the request supplied an origin (near-me search). */
  distance_km?: number | null;
  /* DRF DecimalField serializes as a string ("0.00"), so accept both. */
  average_rating: number | string | null;
  total_reviews: number;
}

/* ---- Doctor first-login onboarding (server-evaluated) ---- */

/** The four required setup steps, in the order the onboarding shows them. */
export type DoctorOnboardingStep =
  | "notifications"
  | "location"
  | "profile_image"
  | "doctor_profile";

/** GET/POST /api/doctors/me/onboarding/ — every requirement re-read from the DB. */
export interface DoctorOnboardingStatus {
  /** Server-verified flag; false means the doctor may not enter normal routes. */
  completed: boolean;
  steps: Record<DoctorOnboardingStep, boolean>;
  /** First incomplete step, or null when everything required is done. */
  next_step: DoctorOnboardingStep | null;
  /** Refreshed session user (carries the up-to-date completion flag). */
  user: User;
}

export interface AvailabilitySlot {
  start_time: string;
  end_time: string;
}

export interface DoctorAvailability {
  doctor: number;
  date: string;
  slots: AvailabilitySlot[];
}

export interface DoctorAvailableDays {
  doctor: number;
  year: number;
  month: number;
  available_days: string[];
}

export interface ScheduleItem {
  id: number;
  weekday: number;
  start_time: string;
  end_time: string;
  slot_duration_minutes: number | null;
  is_active: boolean;
  date_created?: string;
  date_updated?: string;
}

export interface AvailabilityBreak {
  id: number;
  start_time: string;
  end_time: string;
}

export interface ScheduleException {
  id: number;
  date: string;
  start_time: string | null;
  end_time: string | null;
  reason: string;
}

/* ---- PHASE 8 â€” Specialty & Hospital module ---- */

export interface Specialty {
  id: number;
  name: string;
  patient_friendly_name: string;
  description: string;
  what_to_expect: string;
  icon_url: string;
}

export interface Hospital {
  id: number;
  name: string;
  city: string;
  address: string;
  phone: string;
  email: string;
  location_details: Record<string, unknown>;
}

/* ---- PHASE 13 â€” Notifications ---- */

export type NotificationType =
  | "appointment_request"
  | "appointment_confirmed"
  | "appointment_cancelled"
  | "appointment_rejected"
  | "appointment_reminder"
  | "review"
  | "system";

export interface Notification {
  id: number;
  notification_type: NotificationType;
  title: string;
  message: string;
  related_appointment: number | null;
  is_read: boolean;
  created_at: string;
}

export interface PushSubscription {
  id: number;
  endpoint: string;
  p256dh_key: string;
  auth_key: string;
  fcm_token: string | null;
  device_info: Record<string, unknown>;
  is_active: boolean;
}

