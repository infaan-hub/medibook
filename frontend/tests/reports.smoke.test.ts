import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { renderAdminReport } from "@/reports/pdf/admin";
import { renderDoctorReport } from "@/reports/pdf/doctor";
import { renderPatientReport } from "@/reports/pdf/patient";

const GENERATED_AT = new Date("2026-10-03T10:15:00.000Z");

function pages(buffer: Buffer): number {
  const text = buffer.toString("latin1");
  return (text.match(/\/Type\s*\/Page[^s]/g) ?? []).length;
}

describe("smoke artifacts", () => {
  it("writes one PDF per family", async () => {
    const out = path.resolve(__dirname, "..", "reports");
    const admin = await renderAdminReport(
      {
        period: { preset: "month", start: "2026-10-01", end: "2026-10-31", label: "1 October 2026 — 31 October 2026", name: "This month" },
        totals: { users: "1,204", patients: "980", doctors: "48", appointments: "3,480", periodAppointments: "612", periodEmergencies: "37", newAccounts: "74", completedAppointments: "401", checkedIn: "388", healthTips: "26", publishedHealthTips: "22", periodHealthTips: "4" },
        statusBreakdown: Array.from({ length: 5 }, (_, i) => ({ status: ["pending","accepted","done","cancelled","rejected"][i], label: ["Pending","Accepted","Done","Cancelled","Rejected"][i], count: String(100 - i * 10), share: `${20 - i * 3}%` })),
        emergencyBreakdown: ["pending","accepted","in_progress","done","rejected","cancelled","expired"].map((status, i) => ({ status, label: ["Pending","Accepted","In Progress","Done","Rejected","Cancelled","Expired"][i], count: String([9, 7, 5, 11, 3, 1, 1][i]), share: `${[24.3, 18.9, 13.5, 29.7, 8.1, 2.7, 2.7][i]}%` })),
        doctorActivity: Array.from({ length: 8 }, (_, i) => ({ name: `Dr. Example ${i + 1}`, specialty: "Cardiology", appointments: String(80 - i), completed: String(60 - i) })),
        dailyVolume: Array.from({ length: 31 }, (_, i) => ({ date: `${String(i + 1).padStart(2, "0")} Oct 2026`, day: `Day ${i + 1}`, appointments: String(20 + i), completed: String(12 + i) })),
        dailyEmergencies: Array.from({ length: 31 }, (_, i) => ({ date: `${String(i + 1).padStart(2, "0")} Oct 2026`, day: `Day ${i + 1}`, requests: String((i % 4) + 1), completed: String(i % 3) })),
        dailyRegistrations: Array.from({ length: 31 }, (_, i) => ({ date: `${String(i + 1).padStart(2, "0")} Oct 2026`, day: `Day ${i + 1}`, accounts: String((i % 5) + 1) })),
        newAccountsByRole: [
          { role: "Patient", count: "58", share: "78.4%" },
          { role: "Doctor", count: "11", share: "14.9%" },
          { role: "Admin", count: "5", share: "6.8%" },
        ],
        registrations: Array.from({ length: 12 }, (_, i) => ({ date: `${i + 1} October 2026, 0${(i % 9) + 1}:20 PM`, name: `Person ${i + 1}`, role: "Patient", email: `person${i + 1}@example.com` })),
        healthTipsPeriod: Array.from({ length: 6 }, (_, i) => ({ title: `Health tip number ${i + 1}`, category: i % 2 ? "Wellness" : "General", status: i % 3 ? "Published" : "Draft", statusKey: i % 3 ? "published" : "draft", publishedAt: i % 3 ? `${i + 1} October 2026, 10:00 AM` : "Not published", createdAt: `${i + 1} October 2026, 09:30 AM`, author: "Dr. Amina Hassan" })),
        healthTipsTruncated: false,
        dailyVolumeTruncated: false,
        registrationsTruncated: false,
      },
      GENERATED_AT
    );
    const patient = {
      period: { preset: "custom", start: "2025-11-14", end: "2026-10-03", label: "14 November 2025 — 3 October 2026", name: "Full record" },
      patient: {
        reference: "salma", name: "Salma Juma", dateOfBirth: "11 April 1992", age: "34 years", gender: "Female",
        bloodGroup: "O+", phone: "+255777000111", email: "salma@example.com",
        emergencyContact: "Amina Juma · +255777000222", registeredOn: "14 November 2025",
        allergies: "Penicillin", medicalHistory: "Hypertension diagnosed 2023.",
      },
      history: {
        appointments: Array.from({ length: 14 }, (_, i) => ({ date: `${i + 1} October 2026`, time: "09:30 – 10:00", bookedAt: `1 October 2026, 0${(i % 9) + 1}:12 PM`, status: "Done", statusKey: "done", type: "Normal", reason: `Consultation reason number ${i + 1} with a longer text to force wrapping`, details: i % 2 ? `Notes: Additional booking note number ${i + 1} for the printout.  ·  Checked in: ${i + 1} October 2026, 09:25 AM` : "", doctor: "Dr. Amina Hassan · Cardiology", patient: "Salma Juma", hospital: "Mnazi Mmoja Hospital" })),
        treatments: Array.from({ length: 5 }, (_, i) => ({ date: `${i + 1} October 2026, 09:52 AM`, diagnosis: `Diagnosis ${i + 1}`, treatmentNotes: "Lifestyle advice given; blood pressure re-check in four weeks. Patient counselled on salt reduction and daily walking.", prescriptionNotes: "Take after food.", followUp: "31 October 2026", followUpNotes: "Bring the home BP diary.", appointmentDate: `${i + 1} October 2026`, attribution: { name: "Dr. Amina Hassan", context: "Cardiology", dateText: "3 October 2026", timeText: "09:52 AM" } })),
        prescriptions: Array.from({ length: 3 }, (_, i) => ({ date: `${i + 1} October 2026, 09:55 AM`, notes: "Take after food.", items: Array.from({ length: 4 }, (_, j) => ({ medication: `Medication ${j + 1}`, dosage: "5 mg", frequency: "Once daily", route: "oral", duration: "30 days", refills: String(j), instructions: "Same time every morning." })), attribution: { name: "Dr. Amina Hassan", context: "Cardiology", dateText: "3 October 2026", timeText: "09:55 AM" } })),
        vitals: Array.from({ length: 10 }, (_, i) => ({ recordedAt: `${i + 1} October 2026, 09:40 AM`, bloodPressure: "142/90 mmHg", pulse: "78 bpm", temperature: "36.8 °C", glucose: "Not provided", weight: `${68 + i} kg`, height: `${160 + i} cm`, bmi: "26.4", spo2: "98%", notes: "", doctor: "Dr. Amina Hassan · Cardiology" })),
        labs: Array.from({ length: 8 }, (_, i) => ({ orderedAt: `${i + 1} October 2026, 09:58 AM`, testName: `Laboratory test ${i + 1}`, status: i % 2 ? "Resulted" : "Ordered", statusKey: i % 2 ? "resulted" : "ordered", result: i % 2 ? "13.8" : "Pending", reference: "12 – 16 g/dL", dueDate: "5 October 2026", resultedAt: i % 2 ? `${i + 2} October 2026, 11:05 AM` : "Not yet resulted", notes: "Fasting not required.", doctor: "Dr. Amina Hassan · Cardiology", flag: i % 2 ? "Normal" : "Awaiting result" })),
        records: Array.from({ length: 6 }, (_, i) => ({ createdAt: `${i + 1} October 2026, 10:02 AM`, type: "Lab report", title: `Document ${i + 1}`, fileName: `document-${i + 1}.pdf`, description: "Uploaded by the treating doctor during the consultation.", doctor: "Dr. Amina Hassan · Cardiology" })),
      },
      counts: { appointments: "14", treatments: "5", prescriptions: "3", vitals: "10", labs: "8", records: "6" },
    };
    const doctor = { ...patient, doctor: { reference: "amina", name: "Dr. Amina Hassan", specialties: "Cardiology", qualifications: "MBChB, MMed", experience: "9 years", hospital: "Mnazi Mmoja Hospital, Zanzibar", phone: "+255712000333", email: "amina@example.com", joinedOn: "1 February 2024" } };

    const files: [string, Buffer][] = [
      ["_smoke-admin.pdf", admin],
      ["_smoke-doctor.pdf", await renderDoctorReport(doctor as never, GENERATED_AT)],
      ["_smoke-patient.pdf", await renderPatientReport(patient as never, GENERATED_AT)],
    ];
    for (const [name, buffer] of files) {
      fs.writeFileSync(path.join(out, name), buffer);
      // eslint-disable-next-line no-console
      console.log(`${name}: ${buffer.byteLength} bytes, ${pages(buffer)} pages`);
      expect(buffer.subarray(0, 5).toString("latin1")).toBe("%PDF-");
      expect(pages(buffer)).toBeGreaterThan(0);
    }
  }, 60_000);
});
