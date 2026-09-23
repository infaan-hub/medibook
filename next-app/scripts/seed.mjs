// Seed baseline catalog + admin user (idempotent).
// Plain ESM (no TS imports) so `node scripts/seed.mjs` works directly.
import { PrismaClient } from "@prisma/client";
import { randomBytes, scryptSync } from "node:crypto";

const prisma = new PrismaClient();

// Match lib/password.ts format: scrypt$N$r$p$salt$base64key (32-byte key)
function hash(plain) {
  const salt = randomBytes(16).toString("hex");
  const key = scryptSync(plain, salt, 32, { N: 16384, r: 8, p: 1 });
  return `scrypt$16384$8$1$${salt}$${key.toString("base64")}`;
}

// Specialty catalog — grouped by category (grouping is documentation only).
// patient_friendly_name = the meaning patients see on doctor cards.
const SPECIALTIES = [
  // ---------- Primary Care ----------
  { name: "General Practitioner", patient_friendly_name: "General doctor", description: "First-contact care for common illnesses and everyday health concerns.", what_to_expect: "History, physical exam, and basic tests or referral if needed.", icon_url: "" },
  { name: "Family Medicine", patient_friendly_name: "Whole-family care", description: "Continuing care for every family member, from children to older adults.", what_to_expect: "Check-ups, chronic disease follow-up, and prevention advice.", icon_url: "" },
  { name: "Internal Medicine", patient_friendly_name: "Adult medicine", description: "Diagnosis and management of adult diseases and complex internal conditions.", what_to_expect: "Detailed history, examination, and lab work-up.", icon_url: "" },
  { name: "General Practice", patient_friendly_name: "Family doctor", description: "First-contact and continuing primary care.", what_to_expect: "History, physical exam, and care plan.", icon_url: "" },

  // ---------- Children & Women's Health ----------
  { name: "Pediatrics", patient_friendly_name: "Child health", description: "Medical care for infants, children, and adolescents.", what_to_expect: "Growth checks, vaccines, and developmental screening.", icon_url: "" },
  { name: "Gynecology", patient_friendly_name: "Women's health", description: "Care for the female reproductive system and women's health at every age.", what_to_expect: "Consultation, examination, and ultrasound or screening as needed.", icon_url: "" },
  { name: "Obstetrics", patient_friendly_name: "Pregnancy & childbirth", description: "Care during pregnancy, delivery, and the postnatal period.", what_to_expect: "Antenatal visits, scans, and delivery planning.", icon_url: "" },

  // ---------- Specialist Medicine ----------
  { name: "Cardiology", patient_friendly_name: "Heart specialist", description: "Diagnosis and treatment of heart and cardiovascular conditions.", what_to_expect: "ECG, echocardiogram, and medication review.", icon_url: "" },
  { name: "Neurology", patient_friendly_name: "Brain & nerve specialist", description: "Care for the brain, spine, and nervous system, including stroke and seizures.", what_to_expect: "Neurological examination and imaging or nerve studies if needed.", icon_url: "" },
  { name: "Dermatology", patient_friendly_name: "Skin specialist", description: "Care for skin, hair, and nail conditions.", what_to_expect: "Skin examination and possible biopsy.", icon_url: "" },
  { name: "Gastroenterology", patient_friendly_name: "Digestive health", description: "Care for the digestive system: stomach, intestines, liver, and pancreas.", what_to_expect: "Symptom review and possible endoscopy.", icon_url: "" },
  { name: "Endocrinology", patient_friendly_name: "Hormones & diabetes", description: "Care for hormones, diabetes, thyroid, and metabolism.", what_to_expect: "Blood tests, hormone levels, and treatment plan.", icon_url: "" },
  { name: "Pulmonology", patient_friendly_name: "Lung specialist", description: "Care for the lungs and breathing disorders such as asthma and COPD.", what_to_expect: "Breathing tests (spirometry) and chest imaging.", icon_url: "" },
  { name: "Nephrology", patient_friendly_name: "Kidney specialist", description: "Care for kidney disease, dialysis, and fluid balance.", what_to_expect: "Kidney function tests and urine analysis.", icon_url: "" },
  { name: "Hematology", patient_friendly_name: "Blood specialist", description: "Care for blood disorders such as anemia, bleeding, and blood cancers.", what_to_expect: "Blood counts and possibly bone marrow tests.", icon_url: "" },
  { name: "Rheumatology", patient_friendly_name: "Joints & arthritis", description: "Care for arthritis, autoimmune, and inflammatory muscle or joint conditions.", what_to_expect: "Joint examination and blood inflammatory markers.", icon_url: "" },
  { name: "Oncology", patient_friendly_name: "Cancer care", description: "Diagnosis and treatment planning for cancer.", what_to_expect: "Staging tests, discussion of surgery, chemo, or radiotherapy options.", icon_url: "" },
  { name: "Infectious Disease", patient_friendly_name: "Infection specialist", description: "Care for complex or recurring infections such as TB, HIV, and fever of unknown origin.", what_to_expect: "Culture results review and targeted antibiotic or antiviral plan.", icon_url: "" },

  // ---------- Surgery & Procedures ----------
  { name: "General Surgery", patient_friendly_name: "Surgery specialist", description: "Operations for abdominal, skin, and soft-tissue conditions.", what_to_expect: "Pre-op assessment and surgical procedure planning.", icon_url: "" },
  { name: "Orthopedics", patient_friendly_name: "Bone & joint specialist", description: "Care for bones, joints, muscles, and sports injuries.", what_to_expect: "X-ray review, movement assessment, and treatment or physiotherapy plan.", icon_url: "" },
  { name: "Anesthesiology", patient_friendly_name: "Anesthesia (sleep for surgery)", description: "Safe pain control and anesthesia during surgery, plus some pain clinics.", what_to_expect: "Pre-op anesthesia review and pain management plan.", icon_url: "" },
  { name: "Ophthalmology", patient_friendly_name: "Eye specialist", description: "Care for vision, eye diseases, and eye surgery such as cataract.", what_to_expect: "Vision test, eye pressure check, and dilated exam if needed.", icon_url: "" },
  { name: "Urology", patient_friendly_name: "Urinary & male health", description: "Care for kidneys, bladder, urinary tract, and male reproductive organs.", what_to_expect: "Urine tests and ultrasound or cystoscopy if needed.", icon_url: "" },
  { name: "ENT", patient_friendly_name: "Ear, nose & throat", description: "Care for ear, nose, throat, and related head-and-neck conditions.", what_to_expect: "Throat, ear, and nose examination; hearing or sinus tests if needed.", icon_url: "" },

  // ---------- Mental Health ----------
  { name: "Psychiatry", patient_friendly_name: "Mental health doctor", description: "Medical care for mental health conditions such as depression, anxiety, and psychosis.", what_to_expect: "Confidential consultation and medication or therapy plan.", icon_url: "" },
  { name: "Psychology", patient_friendly_name: "Talking therapy", description: "Psychological assessment and counselling for emotional and behavioral concerns.", what_to_expect: "Talking sessions and a personalized coping plan.", icon_url: "" },

  // ---------- Diagnosis & Recovery ----------
  { name: "Radiology", patient_friendly_name: "Imaging specialist", description: "Interpretation of X-ray, ultrasound, CT, and MRI to guide diagnosis.", what_to_expect: "Imaging study reviewed and reported for your doctor.", icon_url: "" },
  { name: "Physical Medicine & Rehabilitation", patient_friendly_name: "Rehabilitation doctor", description: "Restoring movement and daily function after injury, stroke, or surgery.", what_to_expect: "Function assessment and a physiotherapy or rehab program.", icon_url: "" },

  // ---------- Other Healthcare ----------
  { name: "Dentistry", patient_friendly_name: "Dental care", description: "Care for teeth, gums, and oral health.", what_to_expect: "Dental examination and cleaning or treatment plan.", icon_url: "" },
  { name: "Nutrition & Dietetics", patient_friendly_name: "Diet & nutrition", description: "Diet plans and nutrition support for health, weight, and chronic disease.", what_to_expect: "Diet review and a personalized eating plan.", icon_url: "" },
  { name: "Emergency Medicine", patient_friendly_name: "Emergency doctor", description: "Urgent and life-threatening care in the emergency department.", what_to_expect: "Rapid assessment, stabilization, and referral or admission.", icon_url: "" },
];

const HOSPITALS = [
  {
    name: "City General Hospital",
    city: "Riyadh",
    address: "123 Main St",
    phone: "+966500000001",
    email: "info@citygeneral.example",
    location_details: {},
  },
  {
    name: "North Clinic",
    city: "Riyadh",
    address: "45 North Ave",
    phone: "+966500000002",
    email: "info@northclinic.example",
    location_details: {},
  },
];

async function main() {
  for (const s of SPECIALTIES) {
    await prisma.specialty.upsert({
      where: { name: s.name },
      update: { patient_friendly_name: s.patient_friendly_name, description: s.description, what_to_expect: s.what_to_expect },
      create: s,
    });
  }
  for (const h of HOSPITALS) {
    const existing = await prisma.hospital.findFirst({ where: { name: h.name } });
    if (!existing) await prisma.hospital.create({ data: h });
  }

  const adminEmail = "admin@medibook.local";
  const admin = await prisma.user.findUnique({ where: { email: adminEmail } });
  if (!admin) {
    await prisma.user.create({
      data: {
        username: "admin",
        email: adminEmail,
        password: hash("admin123"),
        first_name: "Site",
        last_name: "Admin",
        role: "admin",
        is_superuser: true,
        is_staff: true,
        is_active: true,
      },
    });
    console.log("Created admin@medibook.local / admin123");
  } else {
    // Keep the dev credentials deterministic across re-seeds.
    await prisma.user.update({
      where: { id: admin.id },
      data: {
        username: "admin",
        password: hash("admin123"),
        is_active: true,
        is_superuser: true,
        role: "admin",
      },
    });
    console.log("Admin ensured: admin / admin123");
  }

  console.log(
    `Seed complete: ${await prisma.specialty.count()} specialties, ${await prisma.hospital.count()} hospitals.`
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
