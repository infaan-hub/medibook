/**
 * Person summaries — the view models the identity sections print.
 *
 * Every value is either real database content or the standard "Not provided";
 * nothing is invented, and every name goes through the same formatter the rest
 * of the product uses (`data/format.ts`).
 */
import {
  ageFrom,
  doctorName,
  formatIsoDate,
  formatTimestampDate,
  genderLabel,
  notProvided,
  personName,
} from "./format";
import type { DoctorSummary, PatientSummary } from "../pdf/sections";

export interface PatientProfileRow {
  date_of_birth?: Date | null;
  gender?: string | null;
  blood_group?: string | null;
  allergies?: string | null;
  medical_history?: string | null;
  emergency_contact_name?: string | null;
  emergency_contact_phone?: string | null;
}

/** Minimum patient shape every report can rely on. */
export interface PatientUserRow {
  id: number;
  username?: string | null;
  email?: string | null;
  phone?: string | null;
  first_name?: string | null;
  last_name?: string | null;
  created_at?: Date | null;
  patient?: PatientProfileRow | null;
}

export function buildPatientSummary(row: PatientUserRow): PatientSummary {
  const profile = row.patient ?? null;
  const emergency = [profile?.emergency_contact_name, profile?.emergency_contact_phone]
    .map((part) => (part ?? "").trim())
    .filter(Boolean)
    .join(" · ");

  return {
    reference: (row.username ?? "").trim() || `Patient #${row.id}`,
    name: personName(row),
    dateOfBirth: profile?.date_of_birth ? formatIsoDate(profile.date_of_birth) : notProvided(null),
    age: ageFrom(profile?.date_of_birth ?? null),
    gender: genderLabel(profile?.gender ?? ""),
    bloodGroup: profile?.blood_group ? profile.blood_group.toUpperCase() : notProvided(null),
    phone: (row.phone ?? "").trim() || notProvided(null),
    email: (row.email ?? "").trim() || notProvided(null),
    emergencyContact: emergency || notProvided(null),
    registeredOn: row.created_at ? formatTimestampDate(row.created_at) : notProvided(null),
    allergies: notProvided(profile?.allergies),
    medicalHistory: notProvided(profile?.medical_history),
  };
}

export interface DoctorRelationsRow {
  specialties?: { specialty: { name: string } }[] | null;
  hospitals?: { hospital: { name: string; city: string } }[] | null;
}

export interface DoctorProfileRow extends DoctorRelationsRow {
  id: number;
  qualifications?: string | null;
  experience_years?: number | null;
  average_rating?: unknown;
  total_reviews?: number | null;
  phone?: string | null;
  created_at?: Date | null;
  user?: {
    username?: string | null;
    email?: string | null;
    phone?: string | null;
    first_name?: string | null;
    last_name?: string | null;
  } | null;
}

const listOr = (values: string[]): string => {
  const present = values.map((value) => value.trim()).filter(Boolean);
  return present.length > 0 ? present.join(", ") : notProvided(null);
};

export function buildDoctorSummary(row: DoctorProfileRow): DoctorSummary {
  const user = row.user ?? null;
  const rating = Number(row.average_rating ?? 0);
  const reviews = Number(row.total_reviews ?? 0);

  return {
    reference: (user?.username ?? "").trim() || `Doctor #${row.id}`,
    name: doctorName(user),
    specialties: listOr((row.specialties ?? []).map((entry) => entry.specialty.name)),
    qualifications: notProvided(row.qualifications),
    experience:
      Number(row.experience_years ?? 0) > 0
        ? `${row.experience_years} years`
        : notProvided(null),
    hospital: listOr(
      (row.hospitals ?? []).map((entry) =>
        entry.hospital.city ? `${entry.hospital.name}, ${entry.hospital.city}` : entry.hospital.name
      )
    ),
    phone: (row.phone ?? "").trim() || (user?.phone ?? "").trim() || notProvided(null),
    email: (user?.email ?? "").trim() || notProvided(null),
    rating:
      reviews > 0 ? `${rating.toFixed(1)} / 5 from ${reviews} review${reviews === 1 ? "" : "s"}` : notProvided(null),
    joinedOn: row.created_at ? formatTimestampDate(row.created_at) : notProvided(null),
  };
}

/** Include clause that satisfies `buildDoctorSummary`. */
export const DOCTOR_SUMMARY_INCLUDE = {
  user: true,
  specialties: { include: { specialty: true } },
  hospitals: { include: { hospital: true } },
} as const;
