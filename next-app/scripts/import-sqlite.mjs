// Import legacy SQLite data into PostgreSQL via Prisma.
// Usage: npm run db:import  (optionally SQLITE_PATH=... to override)
import { readFileSync, existsSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { PrismaClient } from "@prisma/client";

const require = createRequire(import.meta.url);
const dir = dirname(dirname(fileURLToPath(import.meta.url)));
const sqlitePath = process.env.SQLITE_PATH || join(dir, "..", "backups", "db.sqlite3");

if (!existsSync(sqlitePath)) {
  console.error(`SQLite database not found: ${sqlitePath}`);
  process.exit(1);
}

let Database;
try {
  Database = require("better-sqlite3");
} catch {
  console.error(
    "better-sqlite3 is not installed. Run: npm i -D better-sqlite3 && npm run db:import"
  );
  process.exit(1);
}

const db = new Database(sqlitePath, { readonly: true, fileMustExist: true });
const prisma = new PrismaClient();

const rows = (sql) => db.prepare(sql).all();
const isSet = (v) => v !== null && v !== undefined;
const bool = (v) => (isSet(v) ? Boolean(v) : false);
const num = (v) => (isSet(v) ? Number(v) : null);
const str = (v) => (isSet(v) ? String(v) : "");
const json = (v, fallback = null) => {
  if (!isSet(v)) return fallback;
  if (typeof v === "object") return v;
  try {
    return JSON.parse(v);
  } catch {
    return fallback;
  }
};
const date = (v) => (isSet(v) ? new Date(v) : null);
const time = (v) => (isSet(v) ? String(v).slice(0, 8) : "00:00:00");

async function main() {
  console.log("Importing from", sqlitePath);

  // Order respects FKs.
  const users = rows("SELECT * FROM accounts_user");
  for (const u of users) {
    await prisma.user.upsert({
      where: { id: u.id },
      update: {},
      create: {
        id: u.id,
        password: str(u.password),
        username: str(u.username),
        email: str(u.email),
        phone: str(u.phone),
        first_name: str(u.first_name),
        last_name: str(u.last_name),
        role: str(u.role) || "patient",
        profile_image: isSet(u.profile_image) ? str(u.profile_image) : null,
        is_active: bool(u.is_active),
        is_staff: bool(u.is_staff),
        is_superuser: bool(u.is_superuser),
        created_at: date(u.created_at) ?? new Date(),
        updated_at: date(u.updated_at) ?? new Date(),
      },
    });
  }
  console.log("users", users.length);

  for (const s of rows("SELECT * FROM specialties_specialty")) {
    await prisma.specialty.upsert({
      where: { id: s.id },
      update: {},
      create: {
        id: s.id,
        name: str(s.name),
        patient_friendly_name: str(s.patient_friendly_name),
        description: str(s.description),
        what_to_expect: str(s.what_to_expect),
        icon_url: str(s.icon_url),
        created_at: date(s.created_at) ?? new Date(),
        updated_at: date(s.updated_at) ?? new Date(),
      },
    });
  }

  for (const h of rows("SELECT * FROM hospitals_hospital")) {
    await prisma.hospital.upsert({
      where: { id: h.id },
      update: {},
      create: {
        id: h.id,
        name: str(h.name),
        city: str(h.city),
        address: str(h.address),
        phone: str(h.phone),
        email: str(h.email),
        location_details: json(h.location_details, {}),
        created_at: date(h.created_at) ?? new Date(),
        updated_at: date(h.updated_at) ?? new Date(),
      },
    });
  }

  for (const p of rows("SELECT * FROM patients_patient")) {
    await prisma.patient.upsert({
      where: { id: p.id },
      update: {},
      create: {
        id: p.id,
        user_id: p.user_id,
        date_of_birth: date(p.date_of_birth),
        gender: str(p.gender),
        address: str(p.address),
        city: str(p.city),
        emergency_contact_name: str(p.emergency_contact_name),
        emergency_contact_phone: str(p.emergency_contact_phone),
        blood_group: str(p.blood_group),
        allergies: str(p.allergies),
        medical_history: str(p.medical_history),
        reminder_preferences: json(p.reminder_preferences, {}),
        created_at: date(p.created_at) ?? new Date(),
        updated_at: date(p.updated_at) ?? new Date(),
      },
    });
  }

  for (const d of rows("SELECT * FROM doctors_doctor")) {
    await prisma.doctor.upsert({
      where: { id: d.id },
      update: {},
      create: {
        id: d.id,
        user_id: d.user_id,
        qualifications: str(d.qualifications),
        experience_years: num(d.experience_years) ?? 0,
        consultation_fee: d.consultation_fee != null ? Number(d.consultation_fee) : 0,
        bio: str(d.bio),
        city: str(d.city),
        office_address: str(d.office_address),
        is_available: bool(d.is_available),
        average_rating: d.average_rating != null ? Number(d.average_rating) : 0,
        total_reviews: num(d.total_reviews) ?? 0,
        created_at: date(d.created_at) ?? new Date(),
        updated_at: date(d.updated_at) ?? new Date(),
      },
    });
  }

  // M2M join tables (names depend on Django auto-created through tables).
  const tableExists = (name) =>
    isSet(
      db
        .prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name=?`)
        .get(name)
    );

  if (tableExists("doctors_doctor_specialties")) {
    for (const r of rows("SELECT * FROM doctors_doctor_specialties")) {
      const doctor_id = r.doctor_id ?? r.doctor.id;
      const specialty_id = r.specialty_id ?? r.specialty.id;
      const exists = await prisma.doctorSpecialty.findFirst({
        where: { doctor_id, specialty_id },
      });
      if (!exists) await prisma.doctorSpecialty.create({ data: { doctor_id, specialty_id } });
    }
  }
  if (tableExists("doctors_doctor_hospitals")) {
    for (const r of rows("SELECT * FROM doctors_doctor_hospitals")) {
      const doctor_id = r.doctor_id ?? r.doctor.id;
      const hospital_id = r.hospital_id ?? r.hospital.id;
      const exists = await prisma.doctorHospital.findFirst({
        where: { doctor_id, hospital_id },
      });
      if (!exists) await prisma.doctorHospital.create({ data: { doctor_id, hospital_id } });
    }
  }

  for (const a of rows("SELECT * FROM appointments_appointment")) {
    await prisma.appointment.upsert({
      where: { id: a.id },
      update: {},
      create: {
        id: a.id,
        patient_id: a.patient_id,
        doctor_id: a.doctor_id,
        hospital_id: isSet(a.hospital_id) ? a.hospital_id : null,
        appointment_date: date(a.appointment_date) ?? new Date(),
        start_time: time(a.start_time),
        end_time: time(a.end_time),
        status: str(a.status) || "pending",
        reason: str(a.reason),
        notes: str(a.notes),
        cancel_reason: str(a.cancel_reason),
        created_at: date(a.created_at) ?? new Date(),
        updated_at: date(a.updated_at) ?? new Date(),
      },
    });
  }

  for (const n of rows("SELECT * FROM notifications_notification")) {
    await prisma.notification.upsert({
      where: { id: n.id },
      update: {},
      create: {
        id: n.id,
        recipient_id: n.recipient_id,
        notification_type: str(n.notification_type) || "system",
        title: str(n.title),
        message: str(n.message),
        related_appointment_id: isSet(n.related_appointment_id) ? n.related_appointment_id : null,
        is_read: bool(n.is_read),
        push_sent: bool(n.push_sent),
        push_provider_id: str(n.push_provider_id),
        created_at: date(n.created_at) ?? new Date(),
        updated_at: date(n.updated_at) ?? new Date(),
      },
    });
  }

  for (const r of rows("SELECT * FROM reviews_review")) {
    await prisma.review.upsert({
      where: { id: r.id },
      update: {},
      create: {
        id: r.id,
        appointment_id: r.appointment_id,
        patient_id: r.patient_id,
        doctor_id: r.doctor_id,
        rating: num(r.rating) ?? 5,
        comment: str(r.comment),
        is_visible: bool(r.is_visible),
        created_at: date(r.created_at) ?? new Date(),
        updated_at: date(r.updated_at) ?? new Date(),
      },
    });
  }

  for (const t of rows("SELECT * FROM treatments_medicaltreatment")) {
    await prisma.medicalTreatment.upsert({
      where: { id: t.id },
      update: {},
      create: {
        id: t.id,
        doctor_id: t.doctor_id,
        patient_id: t.patient_id,
        appointment_id: isSet(t.appointment_id) ? t.appointment_id : null,
        diagnosis: str(t.diagnosis),
        treatment_notes: str(t.treatment_notes),
        prescription: str(t.prescription),
        follow_up_date: date(t.follow_up_date),
        follow_up_notes: str(t.follow_up_notes),
        created_at: date(t.created_at) ?? new Date(),
        updated_at: date(t.updated_at) ?? new Date(),
      },
    });
  }

  for (const art of rows("SELECT * FROM blog_article")) {
    await prisma.article.upsert({
      where: { id: art.id },
      update: {},
      create: {
        id: art.id,
        title: str(art.title),
        slug: str(art.slug),
        excerpt: str(art.excerpt),
        content: str(art.content),
        image: isSet(art.image) ? str(art.image) : null,
        category: str(art.category) || "general",
        published: bool(art.published),
        published_at: date(art.published_at),
        author_id: isSet(art.author_id) ? art.author_id : null,
        created_at: date(art.created_at) ?? new Date(),
        updated_at: date(art.updated_at) ?? new Date(),
      },
    });
  }

  console.log("Import complete.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    db.close();
    await prisma.$disconnect();
  });
