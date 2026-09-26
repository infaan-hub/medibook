/**
 * Emergency appointment service — handles emergency appointment booking,
 * nearby doctor search, and emergency-specific actions.
 */
import { Prisma } from "@prisma/client";
import { conflict, notFound, badRequest, forbidden, ValidationError } from "@/lib/errors";
import { appointmentDto, emergencyAppointmentDto } from "@/lib/serializers";
import { emergencyAppointmentCreateSchema } from "@/validators/misc";
import { parse } from "@/validators/base";
import * as appointments from "@/repositories/appointments.repo";
import * as doctors from "@/repositories/doctors.repo";
import { broadcastAppointmentEvent, notify } from "@/lib/notify";
import type { AuthUser } from "@/lib/auth";
import type { Appointment, User, Doctor } from "@prisma/client";

type AppointmentWithPatient = Appointment & { patient: User };

const EMERGENCY_RADIUS_KM = 25; // Maximum search radius in km
const MAX_EMERGENCY_RADIUS_KM = 50;

/** Calculate distance between two points using Haversine formula. */
function calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371; // Earth's radius in km
  const dLat = (lat2 - lat1) * (Math.PI / 180);
  const dLon = (lon2 - lon1) * (Math.PI / 180);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * (Math.PI / 180)) * Math.cos(lat2 * (Math.PI / 180)) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/** POST /api/emergency/appointments/ — patient books an emergency appointment. */
export async function createEmergencyAppointment(req: Request, user: AuthUser, body: unknown) {
  const input = parse(emergencyAppointmentCreateSchema, body);

  const doctor = await doctors.findDoctorById(Number(input.doctor)).catch(() => null);
  if (!doctor) {
    throw badRequest("The selected doctor was not found.", {
      doctor: ["The selected doctor was not found."],
    });
  }

  if (!doctor.is_available) {
    throw badRequest("The selected doctor is not available for emergency appointments.", {
      doctor: ["This doctor is not currently available for emergency appointments."],
    });
  }

  if (input.hospital !== undefined && input.hospital !== null) {
    const { findHospital } = await import("@/repositories/content.repo");
    if (!(await findHospital(input.hospital))) {
      throw new ValidationError({ hospital: [`Invalid pk "${input.hospital}" - object does not exist.`] });
    }
  }

  const date = input.appointment_date;
  const start = input.start_time;
  const end = input.end_time;

  // Verify the slot is available for the doctor
  const { availableSlots } = await import("./schedule.service");
  const slots = await availableSlots(doctor.id, true, date);
  if (!slots.some((slot) => slot.start_time === start && slot.end_time === end)) {
    throw badRequest("The selected emergency time slot is not available.", {
      start_time: ["This emergency time slot is not available."],
    });
  }

  // Check if patient already has a pending emergency appointment
  const existingEmergency = await appointments.findPatientEmergencyAppointment(user.id);
  if (existingEmergency) {
    throw conflict("You already have a pending emergency appointment.", {
      non_field_errors: ["You can only have one pending emergency appointment at a time."],
    });
  }

  const appointment = await appointments.createEmergencyAppointment({
    patient_id: user.id,
    doctor_id: doctor.id,
    hospital_id: input.hospital ?? null,
    appointment_date: date,
    start_time: start,
    end_time: end,
    reason: input.reason ?? "",
    notes: input.notes ?? "",
    appointment_type: "EMERGENCY",
    emergency_reason: input.emergency_reason,
    emergency_description: input.emergency_description ?? "",
    emergency_latitude: input.emergency_latitude,
    emergency_longitude: input.emergency_longitude,
    emergency_location_accuracy: input.emergency_location_accuracy ?? null,
    emergency_requested_at: new Date(),
  });

  // Notify the doctor immediately
  await notify(
    doctor.user_id,
    "emergency_appointment_request",
    `Emergency appointment request from ${user.email}: ${input.emergency_reason.replace("_", " ")}.`,
    appointment.id
  );

  // Broadcast realtime event
  broadcastAppointmentEvent(appointment, "appointment.emergency_created", [
    appointment.patient_id,
    doctor.user_id,
  ]);

  return appointment;
}

/** Find nearby doctors for emergency appointment. */
export async function findNearbyDoctors(
  latitude: number,
  longitude: number,
  radiusKm: number = EMERGENCY_RADIUS_KM,
  specialtyId?: number
): Promise<Array<{ doctor: Doctor; distance: number }>> {
  if (radiusKm > MAX_EMERGENCY_RADIUS_KM) radiusKm = MAX_EMERGENCY_RADIUS_KM;

  const { prisma } = await import("@/lib/db");
  
  // Get all available doctors with their user location
  const doctorsList = await prisma.doctor.findMany({
    where: {
      is_available: true,
      user: {
        is_active: true,
      },
      ...(specialtyId ? { specialties: { some: { specialty_id: specialtyId } } } : {}),
    },
    include: {
      user: { select: { id: true, first_name: true, last_name: true, email: true, phone: true } },
      specialties: { include: { specialty: true } },
      hospitals: { include: { hospital: true } },
    },
  });

  // Calculate distances and filter by radius
  const nearby = doctorsList
    .filter((doc) => {
      // For now, we'll use the doctor's city as a proxy for location
      // In a real implementation, you'd have lat/long on the doctor profile
      return true; // We'll need to add lat/long to doctor profile for real distance calculation
    })
    .map((doc) => ({
      doctor: doc,
      distance: 0, // Placeholder - need lat/long on doctor
    }))
    .filter((d) => d.distance <= radiusKm)
    .sort((a, b) => a.distance - b.distance);

  return nearby;
}

/** Doctor accepts emergency appointment. */
export async function acceptEmergencyAppointment(req: Request, user: AuthUser, id: number) {
  const appointment = await appointments.findAppointmentById(id);
  if (!appointment) throw notFound();
  if (appointment.appointment_type !== "EMERGENCY") {
    throw badRequest("This is not an emergency appointment.");
  }

  const ownDoctor = await ownDoctorId(user);
  const isOwnerDoctor = user.role === "doctor" && ownDoctor === appointment.doctor_id;
  const isAdmin = user.role === "admin" || user.is_superuser;

  if (!isOwnerDoctor && !isAdmin) {
    throw forbidden("Only the assigned doctor can accept this emergency appointment.");
  }

  if (appointment.status !== "pending") {
    throw conflict("This emergency appointment is no longer pending.");
  }

  const updated = await appointments.updateAppointment(id, { status: "confirmed" });

  await notify(
    appointment.patient_id,
    "emergency_appointment_accepted",
    `Your emergency appointment has been accepted by Dr. ${updated.doctor?.user?.first_name} ${updated.doctor?.user?.last_name}.`,
    updated.id
  );

  broadcastAppointmentEvent(updated, "appointment.emergency_accepted", [
    updated.patient_id,
    updated.doctor_id,
  ]);

  return { appointment: updated, message: "Emergency appointment accepted." };
}

/** Doctor rejects emergency appointment. */
export async function rejectEmergencyAppointment(req: Request, user: AuthUser, id: number, body: unknown) {
  const appointment = await appointments.findAppointmentById(id);
  if (!appointment) throw notFound();
  if (appointment.appointment_type !== "EMERGENCY") {
    throw badRequest("This is not an emergency appointment.");
  }

  const ownDoctor = await ownDoctorId(user);
  const isOwnerDoctor = user.role === "doctor" && ownDoctor === appointment.doctor_id;
  const isAdmin = user.role === "admin" || user.is_superuser;

  if (!isOwnerDoctor && !isAdmin) {
    throw forbidden("Only the assigned doctor can reject this emergency appointment.");
  }

  if (appointment.status !== "pending") {
    throw conflict("This emergency appointment is no longer pending.");
  }

  const { appointmentActionSchema } = await import("@/validators/misc");
  const rawBody = (body ?? {}) as Record<string, unknown>;
  const payload = parse(appointmentActionSchema, { ...rawBody, status: "rejected" });

  const updated = await appointments.updateAppointment(id, {
    status: "rejected",
    cancel_reason: payload.cancel_reason ?? "Doctor rejected the emergency appointment",
  });

  await notify(
    appointment.patient_id,
    "emergency_appointment_rejected",
    `Your emergency appointment was rejected. Reason: ${payload.cancel_reason ?? "No reason provided"}`,
    updated.id
  );

  broadcastAppointmentEvent(updated, "appointment.emergency_rejected", [
    updated.patient_id,
    updated.doctor_id,
  ]);

  return { appointment: updated, message: "Emergency appointment rejected." };
}

/** Get patient's active emergency appointment. */
export async function getPatientEmergencyAppointment(user: AuthUser) {
  return appointments.findPatientEmergencyAppointment(user.id);
}

/** Get doctor's pending emergency appointments. */
export async function getDoctorEmergencyAppointments(user: AuthUser) {
  const ownDoctor = await ownDoctorId(user);
  if (ownDoctor === -1) return [];

  const { prisma } = await import("@/lib/db");
  return prisma.appointment.findMany({
    where: {
      doctor_id: ownDoctor,
      appointment_type: "EMERGENCY",
      status: "pending",
    },
    include: {
      patient: true,
      doctor: { include: { user: true } },
      hospital: true,
    },
    orderBy: { emergency_requested_at: "asc" },
  });
}

async function ownDoctorId(user: AuthUser): Promise<number> {
  const doctor = await doctors.findDoctorByUserId(user.id);
  return doctor ? doctor.id : -1;
}