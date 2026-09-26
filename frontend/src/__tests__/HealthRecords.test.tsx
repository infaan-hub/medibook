/**
 * Health records — the two ends of the sharing flow:
 *
 *  1. Patient: "Medical Details → Health Records" can upload a document/image
 *     and pick the specific doctor it is shared with.
 *  2. Doctor: "/doctor/medical-treatment" shows that patient's records with
 *     full details (type, title, description, date, file, doctor) and renders
 *     real dates instead of "Invalid Date".
 */

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { SettingsScreen } from "../screens/patient";
import { DoctorMedicalTreatmentScreen } from "../screens/doctor-medical-treatment";
import { ToastProvider } from "../state/app-context";
import type { HealthRecord } from "../api/health-records";
import type { PatientProfile } from "../api/types";

const {
  getPatientProfile,
  updatePatientProfile,
  getLinkedDoctors,
  getPatientProfileById,
  getHealthRecords,
  uploadHealthRecord,
  listDoctorPatients,
  listTreatments,
  createTreatment,
  updateTreatment,
  deleteTreatment,
} = vi.hoisted(() => ({
  getPatientProfile: vi.fn(),
  updatePatientProfile: vi.fn(),
  getLinkedDoctors: vi.fn(),
  getPatientProfileById: vi.fn(),
  getHealthRecords: vi.fn(),
  uploadHealthRecord: vi.fn(),
  listDoctorPatients: vi.fn(),
  listTreatments: vi.fn(),
  createTreatment: vi.fn(),
  updateTreatment: vi.fn(),
  deleteTreatment: vi.fn(),
}));

vi.mock("../api/patients", () => ({
  getPatientProfile,
  updatePatientProfile,
  getLinkedDoctors,
  getPatientProfileById,
}));

vi.mock("../api/health-records", () => ({
  getHealthRecords,
  uploadHealthRecord,
  deleteHealthRecord: vi.fn(),
}));

vi.mock("../api/treatments", () => ({
  listDoctorPatients,
  listTreatments,
  createTreatment,
  updateTreatment,
  deleteTreatment,
}));

// patient.tsx reads translated strings; keep them stable for assertions.
vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) =>
      (
        {
          "settings.healthRecords": "Health Records",
          "settings.noRecords": "No health records yet",
          "settings.noRecordsDesc": "Upload lab reports, prescriptions, and X-rays here.",
        } as Record<string, string>
      )[key] ?? key,
    i18n: { language: "en" },
  }),
}));

function envelope<T>(data: T) {
  return { success: true, message: "", data };
}

function paginated<T>(results: T[]) {
  return envelope({
    count: results.length,
    page: 1,
    page_size: 100,
    total_pages: 1,
    next: null,
    previous: null,
    results,
  });
}

function patientProfile(overrides: Partial<PatientProfile> = {}): PatientProfile {
  return {
    id: 7,
    email: "pat.moyo@example.com",
    first_name: "Pat",
    last_name: "Moyo",
    date_of_birth: "1990-05-04",
    gender: "female",
    address: "12 Lake Rd",
    city: "Dodoma",
    emergency_contact_name: "",
    emergency_contact_phone: "",
    blood_group: "O+",
    allergies: "Penicillin",
    medical_history: "Asthma",
    reminder_preferences: {},
    timezone: "UTC",
    ...overrides,
  };
}

function healthRecord(overrides: Partial<HealthRecord> = {}): HealthRecord {
  return {
    id: 11,
    patient: 7,
    doctor: 3,
    doctor_name: "Ada Lovelace",
    appointment: null,
    file: "/media/42",
    record_type: "lab_report",
    title: "CBC panel — March 2026",
    description: "Fasting sample",
    created_at: "2026-09-01T10:00:00Z",
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

function renderPatient() {
  return render(
    <MemoryRouter>
      <ToastProvider>
        <SettingsScreen />
      </ToastProvider>
    </MemoryRouter>
  );
}

describe("patient Medical Details — health records", () => {
  it("lists the patient's records with the doctor they belong to", async () => {
    getPatientProfile.mockResolvedValue(envelope(patientProfile()));
    getLinkedDoctors.mockResolvedValue(
      envelope([{ id: 3, first_name: "Ada", last_name: "Lovelace", email: "ada@example.com", specialties: ["Cardiology"] }])
    );
    getHealthRecords.mockResolvedValue(paginated([healthRecord()]));

    renderPatient();

    expect(await screen.findByText("CBC panel — March 2026")).toBeInTheDocument();
    expect(screen.getByText(/dr\. ada lovelace/i)).toBeInTheDocument();
    expect(screen.getByText("Fasting sample")).toBeInTheDocument();
    const open = screen.getByTitle("Open file");
    expect(open).toHaveAttribute("href", "/media/42");
    expect(getHealthRecords).toHaveBeenCalledTimes(1);
  });

  it("shows an upload form that shares a document with a specific doctor", async () => {
    const user = userEvent.setup();
    getPatientProfile.mockResolvedValue(envelope(patientProfile()));
    getLinkedDoctors.mockResolvedValue(
      envelope([{ id: 3, first_name: "Ada", last_name: "Lovelace", email: "ada@example.com", specialties: ["Cardiology"] }])
    );
    getHealthRecords.mockResolvedValue(paginated([]));
    uploadHealthRecord.mockResolvedValue(envelope(healthRecord()));

    renderPatient();

    await user.click(await screen.findByRole("button", { name: /upload record/i }));

    // The doctor picker is driven by appointment-linked doctors only.
    await waitFor(() => expect(getLinkedDoctors).toHaveBeenCalledTimes(1));
    await user.selectOptions(screen.getByLabelText(/share with doctor/i), "3");
    await user.type(screen.getByLabelText(/^title/i), "X-ray chest");
    await user.selectOptions(screen.getByLabelText(/^type/i), "xray");
    await user.type(screen.getByLabelText(/description/i), "After the fall");
    await user.upload(screen.getByLabelText(/document or image/i), new File(["%PDF-1.4"], "xray.pdf", { type: "application/pdf" }));

    await user.click(screen.getByRole("button", { name: /share record/i }));

    await waitFor(() => expect(uploadHealthRecord).toHaveBeenCalledTimes(1));
    const fd = uploadHealthRecord.mock.calls[0][0] as FormData;
    expect(fd.get("doctor")).toBe("3");
    expect(fd.get("title")).toBe("X-ray chest");
    expect(fd.get("record_type")).toBe("xray");
    expect(fd.get("description")).toBe("After the fall");
    expect(fd.get("file")).toBeInstanceOf(File);
    // The list reloads so the new record shows up immediately.
    await waitFor(() => expect(getHealthRecords).toHaveBeenCalledTimes(2));
  });

  it("refuses to upload until a doctor is chosen", async () => {
    const user = userEvent.setup();
    getPatientProfile.mockResolvedValue(envelope(patientProfile()));
    getLinkedDoctors.mockResolvedValue(envelope([]));
    getHealthRecords.mockResolvedValue(paginated([]));

    renderPatient();

    await user.click(await screen.findByRole("button", { name: /upload record/i }));
    const form = document.querySelector("form.visit-record-form") as HTMLFormElement;
    expect(form).not.toBeNull();

    fireEvent.submit(form);

    expect(await screen.findByText(/choose the doctor to share this record with/i)).toBeInTheDocument();
    expect(uploadHealthRecord).not.toHaveBeenCalled();
  });

  it("tells the patient when no doctor is linked yet", async () => {
    getPatientProfile.mockResolvedValue(envelope(patientProfile()));
    getLinkedDoctors.mockResolvedValue(envelope([]));
    getHealthRecords.mockResolvedValue(paginated([]));

    renderPatient();

    await userEvent.click(await screen.findByRole("button", { name: /upload record/i }));
    expect(
      await screen.findByText(/once you have an appointment with them/i)
    ).toBeInTheDocument();
  });
});

describe("doctor /doctor/medical-treatment — health records", () => {
  function renderDoctor() {
    return render(
      <MemoryRouter>
        <ToastProvider>
          <DoctorMedicalTreatmentScreen />
        </ToastProvider>
      </MemoryRouter>
    );
  }

  it("shows the selected patient's records with full details", async () => {
    const user = userEvent.setup();
    listDoctorPatients.mockResolvedValue(envelope([patientProfile()]));
    getPatientProfileById.mockResolvedValue(envelope(patientProfile()));
    listTreatments.mockResolvedValue(envelope([]));
    getHealthRecords.mockResolvedValue(
      paginated([healthRecord({ title: "X-ray chest", record_type: "xray", description: "After the fall" })])
    );

    renderDoctor();

    await user.click(await screen.findByRole("button", { name: /pat moyo/i }));

    expect(await screen.findByText("X-ray chest")).toBeInTheDocument();
    expect(screen.getByText("xray")).toBeInTheDocument();
    expect(screen.getByText("After the fall")).toBeInTheDocument();
    expect(screen.getByText(/dr\. ada lovelace/i)).toBeInTheDocument();
    expect(screen.getByText(/open file/i)).toHaveAttribute("href", "/media/42");
    expect(screen.getByText(/added/i).parentElement).toHaveTextContent(/added .*sep 1, 2026/i);
    // The record is fetched with the user id from the patient list.
    expect(getHealthRecords).toHaveBeenCalledWith(7);
    expect(getPatientProfileById).toHaveBeenCalledWith(7);
    expect(listTreatments).toHaveBeenCalledWith(7);
  });

  it("renders real dates on treatment records (regression: Invalid Date)", async () => {
    const user = userEvent.setup();
    listDoctorPatients.mockResolvedValue(envelope([patientProfile()]));
    getPatientProfileById.mockResolvedValue(envelope(patientProfile()));
    listTreatments.mockResolvedValue(
      envelope([
        {
          id: 5,
          doctor: 3,
          patient: 7,
          appointment: 9,
          diagnosis: "Viral fever",
          treatment_notes: "Rest and fluids",
          prescription: "Paracetamol 500mg",
          follow_up_date: "2026-09-10",
          follow_up_notes: "Review if fever persists",
          created_at: "2026-09-01T10:00:00Z",
          updated_at: "2026-09-02T11:30:00Z",
        },
      ])
    );
    getHealthRecords.mockResolvedValue(paginated([]));

    renderDoctor();

    await user.click(await screen.findByRole("button", { name: /pat moyo/i }));
    expect(await screen.findByText("Viral fever")).toBeInTheDocument();

    expect(document.body.textContent).not.toContain("Invalid Date");
    expect(screen.getByText(/created/i).parentElement).toHaveTextContent(/created: .*sep 1, 2026/i);
    expect(screen.getByText(/follow-up date/i).parentElement).toHaveTextContent(/sep 10, 2026/i);
  });

  it("offers an empty state when nothing has been shared yet", async () => {
    const user = userEvent.setup();
    listDoctorPatients.mockResolvedValue(envelope([patientProfile()]));
    getPatientProfileById.mockResolvedValue(envelope(patientProfile()));
    listTreatments.mockResolvedValue(envelope([]));
    getHealthRecords.mockResolvedValue(paginated([]));

    renderDoctor();

    await user.click(await screen.findByRole("button", { name: /pat moyo/i }));

    expect(await screen.findByText("No health records")).toBeInTheDocument();
  });
});
