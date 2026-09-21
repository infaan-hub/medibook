/**
 * Shared API types (§28 envelope).
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

/* ---- Request payloads (§27 contracts, PHASE 5) ---- */

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

/* ---- PHASE 6 — Patient module ---- */

export type Gender = "" | "male" | "female" | "other";

/** GET/PATCH /api/patients/profile/ payload (backend patients/serializers.py). */
export interface PatientProfile {
  id: number;
  email: string;
  first_name: string;
  last_name: string;
  date_of_birth: string | null;
  gender: Gender;
  address: string;
  city: string;
  emergency_contact_name: string;
  emergency_contact_phone: string;
  blood_group: string;
  allergies: string;
  medical_history: string;
}

export type UpdatePatientProfilePayload = Partial<
  Omit<PatientProfile, "id" | "email">
>;

export type AppointmentStatus =
  | "pending"
  | "confirmed"
  | "completed"
  | "cancelled"
  | "rejected";

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
  reason: string;
  notes: string;
  cancel_reason: string;
}

/** §28 response envelope: success/message/data on success, errors on failure. */
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

/* ---- PHASE 7 — Doctor module ---- */

export interface DoctorProfile {
  id: number;
  email: string;
  first_name: string;
  last_name: string;
  profile_image: string | null;
  specialties: number[];
  hospitals: number[];
  qualifications: string;
  experience_years: number | null;
  consultation_fee: string;
  bio: string;
  city: string;
  office_address: string;
  is_available: boolean;
  /* DRF DecimalField serializes as a string ("0.00"), so accept both. */
  average_rating: number | string | null;
  total_reviews: number;
}

export interface DoctorCard extends DoctorProfile {}

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

export interface DoctorQueryParams {
  search?: string;
  specialty?: number;
  city?: string;
  hospital?: number;
  min_rating?: number;
  page?: number;
  page_size?: number;
}

/* ---- PHASE 8 — Specialty & Hospital module ---- */

export interface Specialty {
  id: number;
  name: string;
  description: string;
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

/* ---- PHASE 13 — Notifications ---- */

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

/* ---- PHASE 15 — Reviews ---- */

export interface Review {
  id: number;
  appointment: number;
  patient: number;
  doctor: number;
  rating: number;
  comment: string;
  is_visible: boolean;
  created_at: string;
}
