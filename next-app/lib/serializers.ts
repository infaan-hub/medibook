/**
 * DTO serializers â€” the TypeScript port of the Django REST Framework
 * serializers. Field names, shapes and value formats match exactly:
 *
 *   datetime â†’ ISO-8601 string, date â†’ "YYYY-MM-DD", time â†’ "HH:MM:SS",
 *   Decimal  â†’ fixed 2-decimal string, media files â†’ URL, FKs â†’ integer ids.
 */
import type {
  Appointment,
  Article,
  AuditEvent,
  Availability,
  AvailabilityBreak,
  Doctor,
  HealthRecord,
  Hospital,
  MedicalTreatment,
  Notification,
  Patient,
  PushSubscription,
  Review,
  ScheduleException,
  Specialty,
  User,
} from "@prisma/client";
import { dateStr, dec2, iso, mediaUrl } from "./serialize";

/** accounts.serializers.user_payload / UserSerializer. */
export function userPayload(user: User, req: Request): Record<string, unknown> {
  return {
    id: user.id,
    username: user.username,
    email: user.email,
    phone: user.phone,
    first_name: user.first_name,
    last_name: user.last_name,
    role: user.role,
    profile_image: mediaUrl(user.profile_image_id),
    is_superuser: user.is_superuser,
    date_joined: iso(user.created_at),
  };
}

/** patients.serializers.PatientSerializer (id = profile id, names from user). */
export function patientDto(patient: Patient & { user: User }): Record<string, unknown> {
  return {
    id: patient.id,
    email: patient.user.email,
    first_name: patient.user.first_name,
    last_name: patient.user.last_name,
    date_of_birth: dateStr(patient.date_of_birth),
    gender: patient.gender,
    address: patient.address,
    city: patient.city,
    emergency_contact_name: patient.emergency_contact_name,
    emergency_contact_phone: patient.emergency_contact_phone,
    blood_group: patient.blood_group,
    allergies: patient.allergies,
    medical_history: patient.medical_history,
    reminder_preferences: patient.reminder_preferences,
    timezone: patient.timezone ?? "UTC",
  };
}

type SpecialtyRow = {
  id: number;
  name: string;
  patient_friendly_name: string;
  description: string;
  what_to_expect: string;
};

/** doctors.serializers.DoctorSerializer. */
export function doctorDto(
  doctor: Doctor & {
    user: User;
    specialties: Array<{ specialty: SpecialtyRow }>;
    hospitals: Array<{ hospital_id: number }>;
  },
  req: Request
): Record<string, unknown> {
  return {
    id: doctor.id,
    email: doctor.user.email,
    first_name: doctor.user.first_name,
    last_name: doctor.user.last_name,
    profile_image: mediaUrl(doctor.user.profile_image_id),
    specialties: doctor.specialties.map(({ specialty }) => ({
      id: specialty.id,
      name: specialty.name,
      patient_friendly_name: specialty.patient_friendly_name,
      description: specialty.description,
      what_to_expect: specialty.what_to_expect,
    })),
    hospitals: doctor.hospitals.map((row) => row.hospital_id),
    qualifications: doctor.qualifications,
    experience_years: doctor.experience_years,
    consultation_fee: dec2(doctor.consultation_fee),
    bio: doctor.bio,
    city: doctor.city,
    office_address: doctor.office_address,
    is_available: doctor.is_available,
    average_rating: dec2(doctor.average_rating),
    total_reviews: doctor.total_reviews,
  };
}

/** doctors.serializers.AvailabilitySerializer. */
export function availabilityDto(availability: Availability): Record<string, unknown> {
  return {
    id: availability.id,
    weekday: availability.weekday,
    start_time: availability.start_time,
    end_time: availability.end_time,
    slot_duration_minutes: availability.slot_duration_minutes,
    is_active: availability.is_active,
  };
}

/** doctors.serializers.AvailabilityBreakSerializer. */
export function breakDto(item: AvailabilityBreak): Record<string, unknown> {
  return { id: item.id, start_time: item.start_time, end_time: item.end_time };
}

/** doctors.serializers.ScheduleExceptionSerializer. */
export function exceptionDto(item: ScheduleException): Record<string, unknown> {
  return {
    id: item.id,
    date: dateStr(item.date),
    start_time: item.start_time,
    end_time: item.end_time,
    reason: item.reason,
  };
}

/** notifications.serializers.NotificationSerializer. */
export function notificationDto(notification: Notification): Record<string, unknown> {
  return {
    id: notification.id,
    notification_type: notification.notification_type,
    title: notification.title,
    message: notification.message,
    related_appointment: notification.related_appointment_id,
    is_read: notification.is_read,
    created_at: iso(notification.created_at),
  };
}

/** notifications.serializers.PushSubscriptionSerializer. */
export function pushSubscriptionDto(sub: PushSubscription): Record<string, unknown> {
  return {
    id: sub.id,
    endpoint: sub.endpoint,
    p256dh_key: sub.p256dh_key,
    auth_key: sub.auth_key,
    fcm_token: sub.fcm_token,
    device_info: sub.device_info,
    is_active: sub.is_active,
  };
}

/** reviews.serializers.ReviewSerializer (doctor_name rendered server-side). */
export function reviewDto(review: Review & { doctor: { user: User } }): Record<string, unknown> {
  const user = review.doctor.user;
  const fullName = `${user.first_name} ${user.last_name}`.trim();
  return {
    id: review.id,
    appointment: review.appointment_id,
    patient: review.patient_id,
    doctor: review.doctor_id,
    doctor_name: fullName ? `Dr. ${fullName}` : user.email,
    rating: review.rating,
    comment: review.comment,
    is_visible: review.is_visible,
    created_at: iso(review.created_at),
  };
}

/** blog.serializers.ArticleListSerializer. */
export function articleListDto(article: Article, req: Request): Record<string, unknown> {
  return {
    id: article.id,
    title: article.title,
    slug: article.slug,
    excerpt: article.excerpt,
    image: mediaUrl(article.image_id),
    category: article.category,
    published_at: iso(article.published_at),
    created_at: iso(article.created_at),
  };
}

/** blog.serializers.ArticleDetailSerializer. */
export function articleDetailDto(
  article: Article & { author: User | null },
  req: Request
): Record<string, unknown> {
  const author = article.author;
  const fullName = author ? `${author.first_name} ${author.last_name}`.trim() : "";
  return {
    ...articleListDto(article, req),
    content: article.content,
    published: article.published,
    author: article.author_id,
    author_name: author ? fullName || author.email : "",
    updated_at: iso(article.updated_at),
  };
}

/** treatments.serializers.HealthRecordSerializer. */
export function healthRecordDto(record: HealthRecord, req: Request): Record<string, unknown> {
  return {
    id: record.id,
    patient: record.patient_id,
    doctor: record.doctor_id,
    appointment: record.appointment_id,
    file: mediaUrl(record.file_id),
    record_type: record.record_type,
    title: record.title,
    description: record.description,
    created_at: iso(record.created_at),
  };
}

/** treatments.serializers.MedicalTreatmentSerializer. */
export function treatmentDto(treatment: MedicalTreatment): Record<string, unknown> {
  return {
    id: treatment.id,
    doctor: treatment.doctor_id,
    patient: treatment.patient_id,
    appointment: treatment.appointment_id,
    diagnosis: treatment.diagnosis,
    treatment_notes: treatment.treatment_notes,
    prescription: treatment.prescription,
    follow_up_date: dateStr(treatment.follow_up_date),
    follow_up_notes: treatment.follow_up_notes,
    created_at: iso(treatment.created_at),
    updated_at: iso(treatment.updated_at),
  };
}

/** reports/views.AdminAuditView entry shape. */
export function auditDto(event: AuditEvent & { actor: User | null }): Record<string, unknown> {
  const actor = event.actor;
  const fullName = actor ? `${actor.first_name} ${actor.last_name}`.trim() : "";
  return {
    id: event.id,
    action: event.action,
    target: event.target,
    detail: event.detail,
    actor: actor ? fullName || event.actor_id : "System",
    created_at: iso(event.created_at),
  };
}

/** specialties.serializers.SpecialtySerializer. */
export function specialtyDto(specialty: Specialty): Record<string, unknown> {
  return {
    id: specialty.id,
    name: specialty.name,
    patient_friendly_name: specialty.patient_friendly_name,
    description: specialty.description,
    what_to_expect: specialty.what_to_expect,
    icon_url: specialty.icon_url,
  };
}

/** hospitals.serializers.HospitalSerializer. */
export function hospitalDto(hospital: Hospital): Record<string, unknown> {
  return {
    id: hospital.id,
    name: hospital.name,
    city: hospital.city,
    address: hospital.address,
    phone: hospital.phone,
    email: hospital.email,
    location_details: hospital.location_details,
  };
}

/** appointments.serializers.AppointmentSerializer. */
export function appointmentDto(
  appointment: Appointment & { patient: User }
): Record<string, unknown> {
  return {
    id: appointment.id,
    patient: appointment.patient_id,
    patient_email: appointment.patient.email,
    doctor: appointment.doctor_id,
    hospital: appointment.hospital_id,
    appointment_date: dateStr(appointment.appointment_date),
    start_time: appointment.start_time,
    end_time: appointment.end_time,
    status: appointment.status,
    reason: appointment.reason,
    notes: appointment.notes,
    cancel_reason: appointment.cancel_reason,
  };
}
