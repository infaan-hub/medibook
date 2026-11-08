import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { getPatientProfileById } from "../api/patients";
import {
  listDoctorPatients,
  listTreatments,
  createTreatment,
  updateTreatment,
  deleteTreatment,
  type MedicalTreatment,
} from "../api/treatments";
import { listEmergencies } from "../api/emergency";
import { getVisitHistory, type VisitHistoryEntry } from "../api/treatments";
import type { PrescriptionItemInput } from "../api/prescriptions";
import {
  listVitals,
  createVital,
  attachVitalToAppointment,
  deleteVital,
  type Vital,
  type CreateVitalPayload,
} from "../api/vitals";
import type { Gender, PatientProfile } from "../api/types";
import { getHealthRecords, attachHealthRecordToAppointment, type HealthRecord } from "../api/health-records";
import { updatePatientProfile, updatePatientProfileById } from "../api/patients";
import { downloadMediaFile, mediaDownloadName, openMediaFile } from "../lib/files";
import { nearestAreaName } from "../lib/zanzibar";
import { vitalChips } from "../lib/vitals";
import {
  listLabOrders,
  createLabOrder,
  updateLabOrder,
  deleteLabOrder,
  type LabOrder,
  type LabOrderStatus,
  type CreateLabOrderPayload,
} from "../api/lab-orders";
import {
  statusLabel,
  flagLabel,
  resultLabel,
} from "../lib/lab-orders";
import { Button, Card, EmptyState, ErrorState, Skeleton } from "../components/ui";
import { downloadDoctorReport, viewDoctorReport } from "../api/reports";
import { useToast } from "../state/app-context";
import { useRealtimeSync } from "../realtime/socket";
import {
  ArrowLeft,
  User,
  Calendar,
  FileText,
  Edit3,
  Trash2,
  X,
  Pill,
  Plus,
  Activity,
  FlaskConical,
  Stethoscope,
  History,
  Download,
  ExternalLink,
  Eye,
} from "lucide-react";

function msg(error: unknown): string {
  return error instanceof Error ? error.message : "Something went wrong. Please try again.";
}

function fmtDate(d: string | null): string {
  if (!d) return "—";
  // Date-only values ("YYYY-MM-DD") need a time part to parse as local;
  // ISO datetimes (created_at/updated_at) already carry one.
  const dt = new Date(d.length <= 10 ? `${d}T00:00:00` : d);
  if (Number.isNaN(dt.getTime())) return "—";
  return dt.toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function fmtGender(g: string): string {
  if (!g) return "—";
  return g.charAt(0).toUpperCase() + g.slice(1);
}

interface MedRow {
  medication: string;
  dosage: string;
  frequency: string;
  route: string;
  duration_days: string;
  refills: string;
  instructions: string;
}

interface TForm {
  diagnosis: string;
  treatment_notes: string;
  doctor_description: string;
  items: MedRow[];
  prescription_notes: string;
  follow_up_date: string;
  follow_up_time: string;
  follow_up_notes: string;
}

const EMPTY_ROW: MedRow = {
  medication: "",
  dosage: "",
  frequency: "",
  route: "",
  duration_days: "",
  refills: "0",
  instructions: "",
};

const EMPTY: TForm = {
  diagnosis: "",
  treatment_notes: "",
  doctor_description: "",
  items: [{ ...EMPTY_ROW }],
  prescription_notes: "",
  follow_up_date: "",
  follow_up_time: "",
  follow_up_notes: "",
};

/** Blank rows are dropped; blanks inside a row become empty/absent values. */
function toPrescriptionItems(rows: MedRow[]): PrescriptionItemInput[] {
  return rows
    .filter((row) => row.medication.trim() !== "")
    .map((row) => ({
      medication: row.medication.trim(),
      dosage: row.dosage.trim(),
      frequency: row.frequency.trim(),
      route: row.route.trim(),
      duration_days: row.duration_days.trim() === "" ? null : Number(row.duration_days),
      refills: row.refills.trim() === "" ? 0 : Number(row.refills),
      instructions: row.instructions.trim(),
    }));
}

function rowFromItem(item: {
  medication: string;
  dosage: string;
  frequency: string;
  route: string;
  duration_days: number | null;
  refills: number;
  instructions: string;
}): MedRow {
  return {
    medication: item.medication,
    dosage: item.dosage,
    frequency: item.frequency,
    route: item.route,
    duration_days: item.duration_days === null ? "" : String(item.duration_days),
    refills: String(item.refills),
    instructions: item.instructions,
  };
}

/** One-line summary used on the record card ("500 mg · 3 times daily · 7 days"). */
function itemMeta(item: {
  dosage: string;
  frequency: string;
  route: string;
  duration_days: number | null;
  refills: number;
}): string {
  return [
    item.dosage,
    item.frequency,
    item.route,
    item.duration_days ? `${item.duration_days} days` : "",
    item.refills ? `${item.refills} refill${item.refills === 1 ? "" : "s"}` : "",
  ]
    .filter(Boolean)
    .join(" · ");
}

/* ======================================
   VITALS (phase 2)
   ====================================== */

interface VitalForm {
  systolic_bp: string;
  diastolic_bp: string;
  pulse_bpm: string;
  temperature_c: string;
  glucose_mg_dl: string;
  weight_kg: string;
  height_cm: string;
  spo2_percent: string;
  notes: string;
  recorded_at: string;
}

const todayISO = (): string => {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
};

const EMPTY_VITAL: VitalForm = {
  systolic_bp: "",
  diastolic_bp: "",
  pulse_bpm: "",
  temperature_c: "",
  glucose_mg_dl: "",
  weight_kg: "",
  height_cm: "",
  spo2_percent: "",
  notes: "",
  recorded_at: "",
};

/** Blank stays null (the server rejects an all-blank reading anyway). */
function numOrNull(value: string): number | null {
  const trimmed = value.trim();
  if (trimmed === "") return null;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : null;
}

function vitalFormPayload(patientId: number, form: VitalForm, appointmentId: number): CreateVitalPayload {
  return {
    patient: patientId,
    appointment: appointmentId,
    systolic_bp: numOrNull(form.systolic_bp),
    diastolic_bp: numOrNull(form.diastolic_bp),
    pulse_bpm: numOrNull(form.pulse_bpm),
    temperature_c: numOrNull(form.temperature_c),
    glucose_mg_dl: numOrNull(form.glucose_mg_dl),
    weight_kg: numOrNull(form.weight_kg),
    height_cm: numOrNull(form.height_cm),
    spo2_percent: numOrNull(form.spo2_percent),
    notes: form.notes.trim(),
    ...(form.recorded_at ? { recorded_at: form.recorded_at } : {}),
  };
}

/** Every measurement field is blank — nothing to send. */
function vitalFormIsEmpty(form: VitalForm): boolean {
  return [
    form.systolic_bp,
    form.diastolic_bp,
    form.pulse_bpm,
    form.temperature_c,
    form.glucose_mg_dl,
    form.weight_kg,
    form.height_cm,
    form.spo2_percent,
  ].every((value) => value.trim() === "");
}

/**
 * Integer measurement ranges — mirrors vitalsCreateSchema on the server.
 * Systolic, diastolic and pulse are deliberately absent: those are stored as
 * the doctor typed them, with no range and no rule tying them to each other.
 */
const VITAL_INT_RULES: { key: keyof VitalForm; min: number; max: number }[] = [
  { key: "glucose_mg_dl", min: 10, max: 1000 },
  { key: "spo2_percent", min: 40, max: 100 },
];

/** Stored verbatim, but the columns are integers so a fraction can't be saved. */
const VITAL_RECORDED_INT: (keyof VitalForm)[] = [
  "systolic_bp",
  "diastolic_bp",
  "pulse_bpm",
];

/**
 * Client-side mirror of vitalsCreateSchema so a bad reading fails fast with
 * the same reason the API would report (the server re-validates anyway).
 */
function vitalValidationError(form: VitalForm): string | null {
  if (vitalFormIsEmpty(form)) return "Record at least one measurement.";
  return null;
}

const VITAL_FIELDS: { key: keyof VitalForm; label: string; unit?: string; step?: string }[] = [
  { key: "systolic_bp", label: "Systolic", unit: "mmHg", step: "1" },
  { key: "diastolic_bp", label: "Diastolic", unit: "mmHg", step: "1" },
  { key: "pulse_bpm", label: "Pulse", unit: "bpm", step: "1" },
  { key: "temperature_c", label: "Temperature", unit: "°C", step: "0.1" },
  { key: "spo2_percent", label: "SpO₂", unit: "%", step: "1" },
  { key: "glucose_mg_dl", label: "Glucose", unit: "mg/dL", step: "1" },
  { key: "weight_kg", label: "Weight", unit: "kg", step: "0.1" },
  { key: "height_cm", label: "Height", unit: "cm", step: "0.1" },
];

function VitalsCard({
  vitals,
  loading,
  showForm,
  form,
  saving,
  onToggleForm,
  onField,
  onSave,
  onCancel,
  onDelete,
  appointmentId,
  onAttach,
}: {
  vitals: Vital[];
  loading: boolean;
  showForm: boolean;
  form: VitalForm;
  saving: boolean;
  onToggleForm: () => void;
  onField: (key: keyof VitalForm, value: string) => void;
  onSave: () => void;
  onCancel: () => void;
  onDelete: (id: number) => void;
  appointmentId: number | null;
  onAttach: (id: number) => void;
}) {
  const [confirmId, setConfirmId] = useState<number | null>(null);

  return (
    <Card className="visit-records-card">
      <div className="visit-card-header">
        <div>
          <h3 style={{ margin: 0, fontSize: 15 }}>Vitals</h3>
          <p className="page__subtitle" style={{ margin: "4px 0 0" }}>
            Blood pressure, pulse, temperature and other readings for this patient
          </p>
        </div>
        {!showForm && (
          <Button variant="secondary" onClick={onToggleForm}>
            <Activity size={14} /> Record vitals
          </Button>
        )}
        {showForm && (
          <Button variant="secondary" onClick={onCancel}>
            <X size={14} /> Close
          </Button>
        )}
      </div>

      {showForm && (
        <form
          className="vit-form"
          onSubmit={(e) => {
            e.preventDefault();
            onSave();
          }}
        >
          <div className="vit-form__grid">
            {VITAL_FIELDS.map((field) => (
              <label className="rx-field rx-field--num" key={field.key}>
                <span>
                  {field.label}
                  {field.unit ? ` (${field.unit})` : ""}
                </span>
                <input
                  className="field__input"
                  type="number"
                  step={field.step ?? "1"}
                  inputMode="decimal"
                  value={form[field.key]}
                  onChange={(e) => onField(field.key, e.target.value)}
                  placeholder="—"
                />
              </label>
            ))}
            <label className="rx-field rx-field--num">
              <span>Recorded on</span>
              <input
                className="field__input"
                type="date"
                value={form.recorded_at}
                onChange={(e) => onField("recorded_at", e.target.value)}
              />
            </label>
          </div>
          <label className="rx-field">
            <span>Notes</span>
            <input
              className="field__input"
              type="text"
              value={form.notes}
              onChange={(e) => onField("notes", e.target.value)}
              placeholder="e.g. Seated, resting 5 minutes"
            />
          </label>
          <div className="treat-actions-row">
            <Button type="submit" variant="primary" loading={saving}>
              Save reading
            </Button>
            <Button type="button" variant="secondary" onClick={onCancel}>
              Cancel
            </Button>
          </div>
        </form>
      )}

      {loading ? (
        <Skeleton lines={3} />
      ) : vitals.length === 0 ? (
        <EmptyState
          icon={<Activity size={24} />}
          title="No vitals recorded"
          description="Readings recorded during visits will appear here."
        />
      ) : (
        <div className="vit-list">
          {vitals.map((vital) => (
            <div key={vital.id} className="vit-row">
              <div className="vit-row__head">
                <span className="vit-row__date">
                  <Calendar size={13} /> {fmtDate(vital.recorded_at)}
                </span>
                <span className="vit-row__by">
                  {vital.recorded_by ? `Recorded by Dr. ${vital.recorded_by}` : ""}
                </span>
                {!vital.appointment && appointmentId && <Button variant="ghost" onClick={() => onAttach(vital.id)}>Attach to selected visit</Button>}
                {confirmId === vital.id ? (
                  <span className="treat-confirm-del">
                    Confirm?
                    <Button
                      variant="danger"
                      onClick={() => {
                        setConfirmId(null);
                        onDelete(vital.id);
                      }}
                    >
                      Yes
                    </Button>
                    <Button variant="secondary" onClick={() => setConfirmId(null)}>
                      No
                    </Button>
                  </span>
                ) : (
                  <button
                    type="button"
                    className="rx-row__remove"
                    onClick={() => setConfirmId(vital.id)}
                    aria-label="Delete reading"
                  >
                    <Trash2 size={13} />
                  </button>
                )}
              </div>
              <div className="vit-row__chips">
                {vitalChips(vital).map((chip) => (
                  <span key={chip.label} className="vit-chip">
                    <em>{chip.label}</em> {chip.value}
                  </span>
                ))}
              </div>
              {vital.notes && <p className="vit-row__notes">{vital.notes}</p>}
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

/* ======================================
   LAB ORDERS (phase 3)
   ====================================== */

interface LabForm {
  test_name: string;
  result_due_date: string;
}

const EMPTY_LAB: LabForm = {
  test_name: "",
  result_due_date: "",
};

function labPayload(patientId: number, form: LabForm, appointmentId: number): CreateLabOrderPayload {
  return {
    patient: patientId,
    appointment: appointmentId,
    test_name: form.test_name.trim(),
    result_due_date: form.result_due_date.trim(),
  };
}

function LabOrdersCard({
  orders,
  loading,
  showForm,
  form,
  saving,
  onToggleForm,
  onField,
  onSave,
  onCancel,
  onAdvance,
  onSaveResult,
  onDelete,
  appointmentId,
  onAttach,
}: {
  orders: LabOrder[];
  loading: boolean;
  showForm: boolean;
  form: LabForm;
  saving: boolean;
  onToggleForm: () => void;
  onField: (key: keyof LabForm, value: string) => void;
  onSave: () => void;
  onCancel: () => void;
  onAdvance: (id: number, status: LabOrderStatus) => void;
  onSaveResult: (id: number, payload: { result_value: string; result_notes: string }) => void;
  onDelete: (id: number) => void;
  appointmentId: number | null;
  onAttach: (id: number) => void;
}) {
  const [confirmId, setConfirmId] = useState<number | null>(null);
  const [resultId, setResultId] = useState<number | null>(null);
  const [resultForm, setResultForm] = useState({ result_value: "", result_notes: "" });

  function openResult(order: LabOrder) {
    setResultId(order.id);
    setResultForm({ result_value: order.result_value, result_notes: order.result_notes });
  }

  return (
    <Card className="visit-records-card">
      <div className="visit-card-header">
        <div>
          <h3 style={{ margin: 0, fontSize: 15 }}>Lab orders</h3>
          <p className="page__subtitle" style={{ margin: "4px 0 0" }}>
            Tests ordered for this patient and their reported results
          </p>
        </div>
        {!showForm && (
          <Button variant="secondary" onClick={onToggleForm}>
            <FlaskConical size={14} /> Order a test
          </Button>
        )}
        {showForm && (
          <Button variant="secondary" onClick={onCancel}>
            <X size={14} /> Close
          </Button>
        )}
      </div>

      {showForm && (
        <form
          className="vit-form"
          onSubmit={(e) => {
            e.preventDefault();
            onSave();
          }}
        >
          <div className="vit-form__grid lab-form__grid">
            <label className="rx-field lab-field--wide">
              <span>Test name</span>
              <input
                className="field__input"
                type="text"
                value={form.test_name}
                onChange={(e) => onField("test_name", e.target.value)}
                placeholder="e.g. Complete blood count"
              />
            </label>
            <label className="rx-field">
              <span>Results required by</span>
              <input
                className="field__input"
                type="date"
                required
                value={form.result_due_date}
                onChange={(e) => onField("result_due_date", e.target.value)}
              />
            </label>
          </div>
          <div className="treat-actions-row">
            <Button type="submit" variant="primary" loading={saving}>
              Place order
            </Button>
            <Button type="button" variant="secondary" onClick={onCancel}>
              Cancel
            </Button>
          </div>
        </form>
      )}

      {loading ? (
        <Skeleton lines={3} />
      ) : orders.length === 0 ? (
        <EmptyState
          icon={<FlaskConical size={24} />}
          title="No lab orders"
          description="Tests you order for this patient will appear here."
        />
      ) : (
        <div className="lab-list">
          {orders.map((order) => {
            const flag = flagLabel(order);
            const editingResult = resultId === order.id;
            return (
              <div key={order.id} className="lab-row">
                <div className="lab-row__head">
                  <strong className="lab-row__name">{order.test_name}</strong>
                  <span className={`lab-status lab-status--${order.status}`}>
                    {statusLabel(order.status)}
                  </span>
                  {!order.appointment && appointmentId && <Button variant="ghost" onClick={() => onAttach(order.id)}>Attach to selected visit</Button>}
                  {flag && (
                    <span className={`lab-flag lab-flag--${order.flag}`}>{flag}</span>
                  )}
                </div>

                <div className="lab-row__meta">
                  <span>Result: {resultLabel(order)}</span>
                  <span>
                    Ordered {fmtDate(order.ordered_at)}
                    {order.ordered_by ? ` by Dr. ${order.ordered_by}` : ""}
                  </span>
                  {order.result_due_date && (
                    <span>Results required by {fmtDate(order.result_due_date)}</span>
                  )}
                  {order.resulted_at && <span>Resulted {fmtDate(order.resulted_at)}</span>}
                </div>

                {order.notes && <p className="vit-row__notes">{order.notes}</p>}
                {order.result_notes && (
                  <p className="vit-row__notes">{order.result_notes}</p>
                )}

                {editingResult && (
                  <div className="lab-result-form">
                    <label className="rx-field rx-field--num">
                      <span>Result value{order.unit ? ` (${order.unit})` : ""}</span>
                      <input
                        className="field__input"
                        type="text"
                        value={resultForm.result_value}
                        onChange={(e) =>
                          setResultForm((cur) => ({ ...cur, result_value: e.target.value }))
                        }
                        placeholder={order.unit || "value"}
                      />
                    </label>
                    <label className="rx-field">
                      <span>Result notes</span>
                      <input
                        className="field__input"
                        type="text"
                        value={resultForm.result_notes}
                        onChange={(e) =>
                          setResultForm((cur) => ({ ...cur, result_notes: e.target.value }))
                        }
                        placeholder="e.g. Slightly elevated"
                      />
                    </label>
                    <div className="lab-result-form__acts">
                      <Button
                        variant="primary"
                        loading={saving}
                        onClick={() => onSaveResult(order.id, { ...resultForm })}
                      >
                        Save result
                      </Button>
                      <Button variant="secondary" onClick={() => setResultId(null)}>
                        Close
                      </Button>
                    </div>
                  </div>
                )}

                <div className="lab-row__acts">
                  {order.status === "ordered" && (
                    <Button
                      variant="ghost"
                      onClick={() => onAdvance(order.id, "in_progress")}
                    >
                      Start test
                    </Button>
                  )}
                  {order.status !== "cancelled" && !editingResult && (
                    <Button variant="ghost" onClick={() => openResult(order)}>
                      {order.status === "resulted" ? "Edit result" : "Record result"}
                    </Button>
                  )}
                  {(order.status === "ordered" || order.status === "in_progress") && (
                    <Button
                      variant="ghost"
                      onClick={() => onAdvance(order.id, "cancelled")}
                    >
                      Cancel order
                    </Button>
                  )}
                  {confirmId === order.id ? (
                    <span className="treat-confirm-del">
                      Confirm?
                      <Button
                        variant="danger"
                        onClick={() => {
                          setConfirmId(null);
                          onDelete(order.id);
                        }}
                      >
                        Yes
                      </Button>
                      <Button variant="secondary" onClick={() => setConfirmId(null)}>
                        No
                      </Button>
                    </span>
                  ) : (
                    <Button variant="ghost" onClick={() => setConfirmId(order.id)}>
                      <Trash2 size={14} />
                    </Button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
}

/* ======================================
   PATIENT INFO CARD
   ====================================== */

function PatientInfo({ profile }: { profile: PatientProfile }) {
  const { notify } = useToast();
  const [editing, setEditing] = useState(false);
  const [medicalForm, setMedicalForm] = useState({
    gender: profile.gender ?? "",
    blood_group: profile.blood_group ?? "",
    date_of_birth: profile.date_of_birth ?? "",
    allergies: profile.allergies ?? "",
    medical_history: profile.medical_history ?? "",
  });
  const [savingMedical, setSavingMedical] = useState(false);

  const genderOptions: { value: Gender; label: string }[] = [
    { value: "male", label: "Male" },
    { value: "female", label: "Female" },
    { value: "other", label: "Other" },
    { value: "", label: "Not specified" },
  ];

  const handleSaveMedical = async () => {
    setSavingMedical(true);
    try {
      await updatePatientProfileById(profile.id, {
        gender: medicalForm.gender || undefined,
        blood_group: medicalForm.blood_group.trim() || undefined,
        date_of_birth: medicalForm.date_of_birth || undefined,
        allergies: medicalForm.allergies.trim() || undefined,
        medical_history: medicalForm.medical_history.trim() || undefined,
      });
      setEditing(false);
      notify("success", "Patient medical details updated.");
    } catch (e) {
      notify("error", msg(e));
    } finally {
      setSavingMedical(false);
    }
  };

  const cancelEdit = () => {
    setMedicalForm({
      gender: profile.gender ?? "",
      blood_group: profile.blood_group ?? "",
      date_of_birth: profile.date_of_birth ?? "",
      allergies: profile.allergies ?? "",
      medical_history: profile.medical_history ?? "",
    });
    setEditing(false);
  };

  return (
    <Card className="treat-patient-card">
      <div className="treat-patient-hdr">
        <div className="treat-patient-av">
          <User size={22} />
        </div>
        <div className="treat-patient-meta">
          <h3>{profile.first_name || profile.last_name ? `${profile.first_name} ${profile.last_name}`.trim() : profile.email}</h3>
          <span>{fmtGender(profile.gender)} &middot; {profile.blood_group || "No blood group"} &middot; {fmtDate(profile.date_of_birth)}</span>
        </div>
        <div className="treat-patient-actions">
          {!editing ? (
            <Button variant="secondary" onClick={() => setEditing(true)}>
              <Edit3 size={14} /> Edit medical details
            </Button>
          ) : (
            <div className="treat-actions-row">
              <Button variant="secondary" loading={savingMedical} onClick={handleSaveMedical}>
                Save changes
              </Button>
              <Button variant="ghost" onClick={cancelEdit}>
                Cancel
              </Button>
            </div>
          )}
        </div>
      </div>
      <div className="treat-patient-fields">
        {!editing && (
          <>
            <div className="treat-pf">
              <span>Email</span>
              <strong>{profile.email}</strong>
            </div>
            <div className="treat-pf">
              <span>Gender</span>
              <strong>{fmtGender(profile.gender)}</strong>
            </div>
            <div className="treat-pf">
              <span>Blood Group</span>
              <strong>{profile.blood_group || "—"}</strong>
            </div>
            <div className="treat-pf">
              <span>Date of Birth</span>
              <strong>{fmtDate(profile.date_of_birth)}</strong>
            </div>
            <div className="treat-pf">
              <span>Location</span>
              <strong>{nearestAreaName(profile) ?? (profile.has_location ? "Location shared" : "—")}</strong>
            </div>
            {profile.allergies && (
              <div className="treat-pf treat-pf--warn">
                <span>Allergies</span>
                <strong>{profile.allergies}</strong>
              </div>
            )}
            {profile.medical_history && (
              <div className="treat-pf">
                <span>Medical History</span>
                <strong>{profile.medical_history}</strong>
              </div>
            )}
          </>
        )}
        {editing && (
          <>
            <div className="treat-pf">
              <label className="field__label">Email (read-only)</label>
              <input className="field__input" type="text" value={profile.email} readOnly />
            </div>
            <div className="treat-pf">
              <label className="field__label">Gender</label>
              <select
                className="field__input"
                value={medicalForm.gender}
                onChange={(e) => setMedicalForm((current) => ({ ...current, gender: e.target.value as Gender }))}
              >
                {genderOptions.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="treat-pf">
              <label className="field__label">Blood Group</label>
              <input
                className="field__input"
                type="text"
                value={medicalForm.blood_group}
                onChange={(e) => setMedicalForm((current) => ({ ...current, blood_group: e.target.value }))}
                placeholder="e.g. O+, A-, AB+"
              />
            </div>
            <div className="treat-pf">
              <label className="field__label">Date of Birth</label>
              <input
                className="field__input"
                type="date"
                value={medicalForm.date_of_birth}
                onChange={(e) => setMedicalForm((current) => ({ ...current, date_of_birth: e.target.value }))}
              />
            </div>
            <div className="treat-pf">
              <label className="field__label">Location</label>
              <span className="field__input">{nearestAreaName(profile) ?? (profile.has_location ? "Location shared" : "—")}</span>
              <p className="page__subtitle" style={{ margin: "4px 0 0" }}>
                Update the patient&rsquo;s location from {"/doctor/medical-treatment"} is not supported here —
                ask the patient to update it from their profile, or edit it from the doctor availability settings.
              </p>
            </div>
            <div className="treat-pf treat-pf--wide">
              <label className="field__label">Allergies</label>
              <textarea
                className="field__input"
                rows={3}
                value={medicalForm.allergies}
                onChange={(e) => setMedicalForm((current) => ({ ...current, allergies: e.target.value }))}
                placeholder="e.g. Penicillin, peanuts, shellfish"
              />
            </div>
            <div className="treat-pf treat-pf--wide">
              <label className="field__label">Medical History</label>
              <textarea
                className="field__input"
                rows={4}
                value={medicalForm.medical_history}
                onChange={(e) => setMedicalForm((current) => ({ ...current, medical_history: e.target.value }))}
                placeholder="e.g. Diabetes, hypertension, asthma"
              />
            </div>
          </>
        )}
      </div>
    </Card>
  );
}

/* ======================================
   TREATMENT RECORD CARD
   ====================================== */

function TxRecord({
  record,
  isCurrent,
  onEdit,
  onDelete,
  onCancelFollowUp,
  appointmentId,
  onAttach,
}: {
  record: MedicalTreatment;
  isCurrent?: boolean;
  onEdit: (r: MedicalTreatment) => void;
  onDelete: (id: number) => void;
  onCancelFollowUp?: (r: MedicalTreatment) => void;
  appointmentId?: number | null;
  onAttach?: (id: number) => void;
}) {
  const [confirmDel, setConfirmDel] = useState(false);

  function handleDelete() {
    if (confirmDel) {
      onDelete(record.id);
      setConfirmDel(false);
    } else {
      setConfirmDel(true);
    }
  }

  return (
    <Card className="treat-record">
      <div className="treat-rec-hdr">
        <div className="treat-rec-title">
          <Stethoscope size={16} />
          <h4>{record.diagnosis || "No diagnosis"}</h4>
          {isCurrent && <span className="badge badge--accepted">Current</span>}
        </div>
        <div className="treat-rec-acts">
          {!record.appointment && appointmentId && onAttach && <Button variant="ghost" onClick={() => onAttach(record.id)}>Attach to selected visit</Button>}
          {confirmDel && (
            <span className="treat-confirm-del">
              Confirm?
              <Button variant="danger" onClick={handleDelete}>Yes</Button>
              <Button variant="secondary" onClick={() => setConfirmDel(false)}>No</Button>
            </span>
          )}
          {!confirmDel && (
            <>
              <Button variant="ghost" onClick={() => onEdit(record)}><Edit3 size={14} /></Button>
              <Button variant="ghost" onClick={handleDelete}><Trash2 size={14} /></Button>
            </>
          )}
        </div>
      </div>

      {record.treatment_notes && (
        <div className="treat-rec-sec">
          <span className="treat-rec-lbl"><FileText size={12} /> Treatment Notes</span>
          <p className="treat-rec-val">{record.treatment_notes}</p>
        </div>
      )}

      {record.doctor_description && (
        <div className="treat-rec-sec">
          <span className="treat-rec-lbl"><FileText size={12} /> Doctor description</span>
          <p className="treat-rec-val">{record.doctor_description}</p>
        </div>
      )}

      {(record.prescription_items?.length ?? 0) > 0 ? (
        <div className="treat-rec-sec">
          <span className="treat-rec-lbl"><Pill size={12} /> Prescription</span>
          <ul className="rx-list rx-list--view">
            {record.prescription_items.map((item) => (
              <li key={item.id ?? item.sort_order} className="rx-item">
                <strong>{item.medication}</strong>
                {itemMeta(item) && <span className="rx-item__meta">{itemMeta(item)}</span>}
                {item.instructions && <em className="rx-item__note">{item.instructions}</em>}
              </li>
            ))}
          </ul>
          {record.prescription_notes && (
            <p className="treat-rec-val">{record.prescription_notes}</p>
          )}
        </div>
      ) : (
        record.prescription && (
          <div className="treat-rec-sec">
            <span className="treat-rec-lbl"><Pill size={12} /> Prescription</span>
            <p className="treat-rec-val">{record.prescription}</p>
          </div>
        )
      )}

      {record.follow_up_date && (
        <div className="treat-rec-sec">
          <span className="treat-rec-lbl"><Calendar size={12} /> Follow-up Date</span>
          <p className="treat-rec-val">
            {fmtDate(record.follow_up_date)}
            {record.follow_up_time ? ` at ${record.follow_up_time.slice(0, 5)}` : ""}
          </p>
          {(record.follow_up_booking_status === "pending" ||
            record.follow_up_booking_status === "processing") && (
            <p className="treat-rec-val">Scheduling the appointment…</p>
          )}
          {record.follow_up_booking_status === "failed" && (
            <p className="treat-rec-val">
              This follow-up was not scheduled. Edit the treatment and choose a free time.
            </p>
          )}
          {record.follow_up_appointment_id && onCancelFollowUp && (
            <div className="treat-actions-row" style={{ marginTop: 8 }}>
              <Button variant="danger" onClick={() => onCancelFollowUp(record)}>
                Cancel follow-up appointment
              </Button>
            </div>
          )}
        </div>
      )}

      {record.follow_up_notes && (
        <div className="treat-rec-sec">
          <span className="treat-rec-lbl"><FileText size={12} /> Follow-up Notes</span>
          <p className="treat-rec-val">{record.follow_up_notes}</p>
        </div>
      )}

      <div className="treat-rec-footer">
        <span>Created: {fmtDate(record.created_at)}</span>
        <span>Updated: {fmtDate(record.updated_at)}</span>
      </div>
    </Card>
  );
}

/* ======================================
   HEALTH RECORD (patient + doctor uploads)
   ====================================== */

function HcRecord({ record, appointmentId, onAttach }: { record: HealthRecord; appointmentId?: number | null; onAttach?: (id: number) => void }) {
  const { notify } = useToast();
  const typeLabel = record.record_type.replace(/_/g, " ");
  return (
    <Card className="treat-record">
      <div className="treat-rec-hdr">
        <div className="treat-rec-title">
          <FileText size={16} />
          <h4>{record.title}</h4>
        </div>
        <span className="health-record-item__type">{typeLabel}</span>
      </div>

      {record.description && (
        <div className="treat-rec-sec">
          <span className="treat-rec-lbl"><FileText size={12} /> Description</span>
          <p className="treat-rec-val">{record.description}</p>
        </div>
      )}

      <div className="treat-rec-footer">
        <span>Added {fmtDate(record.created_at)}</span>
        {record.doctor_name && <span>Dr. {record.doctor_name}</span>}
        {!record.appointment && appointmentId && onAttach && <Button variant="ghost" onClick={() => onAttach(record.id)}>Attach to selected visit</Button>}
        {!record.file && <span>No file attached</span>}
        <button
          type="button"
          className="treat-rec-link"
          title="View"
          disabled={!record.file}
          onClick={() => {
            if (record.file) {
              void openMediaFile(record.file, mediaDownloadName(record), (m) => notify("error", m));
            }
          }}
        >
          <ExternalLink size={12} /> View
        </button>
        <button
          type="button"
          className="treat-rec-link"
          title="Download"
          disabled={!record.file}
          onClick={() => {
            if (record.file) {
              void downloadMediaFile(record.file, mediaDownloadName(record), (m) => notify("error", m));
            }
          }}
        >
          <Download size={12} /> Download
        </button>
      </div>
    </Card>
  );
}

/* ======================================
   DOCTOR MEDICAL TREATMENT (main screen)
   ====================================== */

export function DoctorMedicalTreatmentScreen() {
  const { notify } = useToast();

  const [patients, setPatients] = useState<PatientProfile[]>([]);
  const [patientsLoading, setPatientsLoading] = useState(true);
  const [patientsError, setPatientsError] = useState<string | null>(null);

  const [initialVisitContext] = useState(() => {
    if (typeof window === "undefined") return { patientId: null as number | null, appointmentId: null as number | null };
    const params = new URLSearchParams(window.location.search);
    const patientId = Number(params.get("patient"));
    const appointmentId = Number(params.get("appointment"));
    return {
      patientId: Number.isInteger(patientId) && patientId > 0 ? patientId : null,
      appointmentId: Number.isInteger(appointmentId) && appointmentId > 0 ? appointmentId : null,
    };
  });
  const [selectedId, setSelectedId] = useState<number | null>(initialVisitContext.patientId);
  const [profile, setProfile] = useState<PatientProfile | null>(null);
  const [treatments, setTreatments] = useState<MedicalTreatment[]>([]);
  const [records, setRecords] = useState<HealthRecord[]>([]);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);
  // Appointment the treatment belongs to. The emergency queue passes its id in
  // the URL so the report can label the doctor description "Emergency"; a
  // normal visit stays "Normal".
  const [contextAppointmentId, setContextAppointmentId] = useState<number | null>(initialVisitContext.appointmentId);
  const [contextPatientId, setContextPatientId] = useState<number | null>(initialVisitContext.patientId);
  const [emergencyRoute] = useState(
    () => typeof window !== "undefined" && window.location.pathname.includes("/doctor/medical-treatment/emergency")
  );
  const [patientHistory, setPatientHistory] = useState<VisitHistoryEntry[]>([]);

  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<MedicalTreatment | null>(null);
  const [form, setForm] = useState<TForm>(EMPTY);
  const [saving, setSaving] = useState(false);

  /* ---- Vitals (phase 2) ---- */
  const [vitals, setVitals] = useState<Vital[]>([]);
  const [vitalsLoading, setVitalsLoading] = useState(false);
  const [showVitalForm, setShowVitalForm] = useState(false);
  const [vitalForm, setVitalForm] = useState<VitalForm>(EMPTY_VITAL);
  const [vitalSaving, setVitalSaving] = useState(false);

  /* ---- Lab orders (phase 3) ---- */
  const [labOrders, setLabOrders] = useState<LabOrder[]>([]);
  const [labsLoading, setLabsLoading] = useState(false);
  const [showLabForm, setShowLabForm] = useState(false);
  const [labForm, setLabForm] = useState<LabForm>(EMPTY_LAB);
  const [labSaving, setLabSaving] = useState(false);

  /* ---- Report generation (§34) ---- */
  const [reportBusy, setReportBusy] = useState<"generate" | "view" | null>(null);
  const [reportError, setReportError] = useState<string | null>(null);

  const runReport = async (action: "generate" | "view") => {
    if (selectedId === null) return;
    setReportBusy(action);
    setReportError(null);
    try {
      const result =
        action === "view"
          ? await viewDoctorReport(selectedId)
          : await downloadDoctorReport(selectedId);
      notify(
        "success",
        action === "view"
          ? `Report opened in a new tab — ${result.filename}`
          : `Report downloaded — ${result.filename}`
      );
    } catch (e) {
      const text = msg(e);
      setReportError(text);
      notify("error", text);
    } finally {
      setReportBusy(null);
    }
  };

  const loadPatients = useCallback(() => {
    setPatientsError(null);
    setPatientsLoading(true);
    listDoctorPatients()
      .then((r) => setPatients(r.data))
      .catch((e) => setPatientsError(msg(e)))
      .finally(() => setPatientsLoading(false));
  }, []);

  const loadVitals = useCallback((id: number) => {
    setVitalsLoading(true);
    listVitals(id)
      .then((r) => setVitals(r.data))
      .catch(() => setVitals([]))
      .finally(() => setVitalsLoading(false));
  }, []);

  const loadLabs = useCallback((id: number) => {
    setLabsLoading(true);
    listLabOrders(id)
      .then((r) => setLabOrders(r.data))
      .catch(() => setLabOrders([]))
      .finally(() => setLabsLoading(false));
  }, []);

  const loadPatient = useCallback(
    (id: number) => {
      setDetailError(null);
      setDetailLoading(true);
      // Records load on their own: a failed health-record call must not blank
      // the profile/treatments, and a switch between patients must never show
      // the previous chart's documents.
      setRecords([]);
      getHealthRecords(id)
        .then((r) => setRecords(r.data?.results ?? []))
        .catch(() => setRecords([]));
      Promise.all([getPatientProfileById(id), listTreatments(id), getVisitHistory(id)])
        .then(([profileRes, txRes, vhRes]) => {
          setProfile(profileRes.data);
          setTreatments(txRes.data);
          const history = vhRes.data ?? [];
          setPatientHistory(history);
          setContextAppointmentId((current) => {
            if (current && history.some((visit) => visit.appointment_id === current && !visit.deleted_at)) return current;
            const activeVisit = history.find((visit) => visit.status === "in_progress" && !visit.deleted_at);
            return activeVisit?.appointment_id ?? null;
          });
          setContextPatientId(id);
        })
        .catch((e) => setDetailError(msg(e)))
        .finally(() => setDetailLoading(false));
      loadVitals(id);
      loadLabs(id);
    },
    [loadVitals, loadLabs]
  );

  useEffect(() => {
    loadPatients();
  }, [loadPatients]);

  useEffect(() => {
    if (selectedId !== null) loadPatient(selectedId);
  }, [selectedId, loadPatient]);
  useEffect(() => {
    if (!emergencyRoute) return;
    listEmergencies()
      .then((r) => {
        const match =
          (r.data ?? []).find((e) => e.status === "in_progress") ??
          (r.data ?? []).find((e) => e.status === "accepted") ??
          (r.data ?? [])[0];
        if (match) {
          setSelectedId(match.patient);
          setContextAppointmentId((current) => current ?? match.id);
          setContextPatientId(match.patient);
        }
      })
      .catch(() => undefined);
  }, [emergencyRoute]);

  // When a follow-up appointment is auto-created in the background (non-blocking
  // to avoid request timeouts), the realtime appointment.created event lets us
  // notify the doctor immediately so the new accepted appointment shows up in
  // their appointments list without a page reload.
  useRealtimeSync({
    refresh: () => {
      if (selectedId) loadPatient(selectedId);
    },
    events: [
      "appointment.created",
      "appointment.updated",
      "appointment.deleted",
      "treatment.updated",
    ],
    polling: false,
    reconcileOnFocus: false,
    enabled: selectedId !== null,
  });

  function handleNew() {
    const visitId = contextAppointmentId ?? patientHistory.find((row) => row.status === "in_progress" && !row.deleted_at)?.appointment_id;
    if (!visitId) {
      notify("error", "Choose an appointment from Patient History before adding treatment.");
      return;
    }
    setContextAppointmentId(visitId);
    setEditing(null);
    setForm(EMPTY);
    setShowForm(true);
  }

  function handleEdit(record: MedicalTreatment) {
    setEditing(record);
    setForm({
      diagnosis: record.diagnosis,
      treatment_notes: record.treatment_notes,
      doctor_description: record.doctor_description ?? "",
      items:
        record.prescription_items.length > 0
          ? record.prescription_items.map(rowFromItem)
          : [{ ...EMPTY_ROW }],
      prescription_notes: record.prescription_notes,
      follow_up_date: record.follow_up_date ?? "",
      follow_up_time: record.follow_up_time ?? "",
      follow_up_notes: record.follow_up_notes,
    });
    setShowForm(true);
  }

  async function handleSave() {
    if (!selectedId) return;
    if (form.follow_up_date && !form.follow_up_time) {
      notify("error", "Choose the exact time for the follow-up appointment.");
      return;
    }
    setSaving(true);
    try {
      const payload = {
        diagnosis: form.diagnosis,
        treatment_notes: form.treatment_notes,
        doctor_description: form.doctor_description,
        items: toPrescriptionItems(form.items),
        prescription_notes: form.prescription_notes,
        follow_up_date: form.follow_up_date || null,
        follow_up_time: form.follow_up_time || undefined,
        follow_up_notes: form.follow_up_notes,
      };
      const result = editing
        ? await updateTreatment(editing.id, payload)
        : await createTreatment({
            patient: selectedId,
            ...(contextAppointmentId ? { appointment: contextAppointmentId } : {}),
            ...payload,
          });
      const followUpSuffix = result?.data?.follow_up_appointment
        ? " Follow-up appointment scheduled automatically."
        : result?.data?.follow_up_booking_status === "pending"
        ? " Follow-up appointment is being scheduled and will appear in Appointments shortly."
        : "";
      notify(
        "success",
        `${editing ? "Treatment record updated." : "Treatment record created."}${followUpSuffix}`
      );
      setShowForm(false);
      setEditing(null);
      setForm(EMPTY);
    } catch (e) {
      notify("error", msg(e));
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: number) {
    try {
      await deleteTreatment(id);
      notify("success", "Treatment record deleted.");
      if (selectedId) loadPatient(selectedId);
    } catch (e) {
      notify("error", msg(e));
    }
  }

  async function handleCancelFollowUp(record: MedicalTreatment) {
    if (!record.follow_up_appointment_id || !selectedId) return;
    try {
      await updateTreatment(record.id, { follow_up_date: null });
      notify("success", "Follow-up appointment cancelled.");
      loadPatient(selectedId);
    } catch (e) {
      notify("error", msg(e));
    }
  }

  /* ---- Structured medication lines (phase 1 e-prescriptions) ---- */

  function updateRow(index: number, patch: Partial<MedRow>) {
    setForm((current) => ({
      ...current,
      items: current.items.map((row, i) => (i === index ? { ...row, ...patch } : row)),
    }));
  }

  function addRow() {
    setForm((current) => ({ ...current, items: [...current.items, { ...EMPTY_ROW }] }));
  }

  function removeRow(index: number) {
    setForm((current) => ({
      ...current,
      items:
        current.items.length > 1
          ? current.items.filter((_, i) => i !== index)
          : [{ ...EMPTY_ROW }],
    }));
  }

  /* ---- Vitals (phase 2) ---- */

  function setVitalField(key: keyof VitalForm, value: string) {
    setVitalForm((current) => ({ ...current, [key]: value }));
  }

  function handleCancelVital() {
    setShowVitalForm(false);
    setVitalForm(EMPTY_VITAL);
  }

  async function handleSaveVital() {
    if (!selectedId) return;
    if (!contextAppointmentId) {
      notify("error", "Select the active appointment before recording vitals.");
      return;
    }
    const invalid = vitalValidationError(vitalForm);
    if (invalid) {
      notify("error", invalid);
      return;
    }
    setVitalSaving(true);
    try {
      await createVital(vitalFormPayload(selectedId, vitalForm, contextAppointmentId));
      notify("success", "Vitals recorded.");
      handleCancelVital();
      loadVitals(selectedId);
    } catch (e) {
      notify("error", msg(e));
    } finally {
      setVitalSaving(false);
    }
  }

  async function handleDeleteVital(id: number) {
    if (!selectedId) return;
    try {
      await deleteVital(id);
      notify("success", "Reading deleted.");
      loadVitals(selectedId);
    } catch (e) {
      notify("error", msg(e));
    }
  }

  async function handleAttachVital(id: number) {
    if (!selectedId || !contextAppointmentId) return;
    try {
      await attachVitalToAppointment(id, contextAppointmentId);
      notify("success", "Vital reading attached to the selected visit.");
      loadPatient(selectedId);
    } catch (e) { notify("error", msg(e)); }
  }

  /* ---- Lab orders (phase 3) ---- */

  function setLabField(key: keyof LabForm, value: string) {
    setLabForm((current) => ({ ...current, [key]: value }));
  }

  function handleCancelLab() {
    setShowLabForm(false);
    setLabForm(EMPTY_LAB);
  }

  async function handleSaveLab() {
    if (!selectedId) return;
    if (!contextAppointmentId) {
      notify("error", "Select the active appointment before placing a lab order.");
      return;
    }
    if (!labForm.test_name.trim()) {
      notify("error", "Test name is required.");
      return;
    }
    if (!labForm.result_due_date.trim()) {
      notify("error", "Results required by date is required.");
      return;
    }
    setLabSaving(true);
    try {
      await createLabOrder(labPayload(selectedId, labForm, contextAppointmentId));
      notify("success", "Lab order placed.");
      handleCancelLab();
      loadLabs(selectedId);
    } catch (e) {
      notify("error", msg(e));
    } finally {
      setLabSaving(false);
    }
  }

  async function handleAdvanceLab(id: number, status: LabOrderStatus) {
    if (!selectedId) return;
    try {
      await updateLabOrder(id, { status });
      notify("success", status === "cancelled" ? "Lab order cancelled." : "Test started.");
      loadLabs(selectedId);
    } catch (e) {
      notify("error", msg(e));
    }
  }

  async function handleAttachLab(id: number) {
    if (!selectedId || !contextAppointmentId) return;
    try {
      await updateLabOrder(id, { appointment: contextAppointmentId });
      notify("success", "Lab order attached to the selected visit.");
      loadPatient(selectedId);
    } catch (e) { notify("error", msg(e)); }
  }

  async function handleAttachTreatment(id: number) {
    if (!selectedId || !contextAppointmentId) return;
    try {
      await updateTreatment(id, { appointment: contextAppointmentId });
      notify("success", "Treatment attached to the selected visit.");
      loadPatient(selectedId);
    } catch (e) { notify("error", msg(e)); }
  }

  async function handleAttachReport(id: number) {
    if (!selectedId || !contextAppointmentId) return;
    try {
      await attachHealthRecordToAppointment(id, contextAppointmentId);
      notify("success", "Report attached to the selected visit.");
      loadPatient(selectedId);
    } catch (e) { notify("error", msg(e)); }
  }

  async function handleSaveLabResult(
    id: number,
    payload: { result_value: string; result_notes: string }
  ) {
    if (!selectedId) return;
    setLabSaving(true);
    try {
      await updateLabOrder(id, { ...payload, status: "resulted" });
      notify("success", "Result recorded.");
      loadLabs(selectedId);
    } catch (e) {
      notify("error", msg(e));
    } finally {
      setLabSaving(false);
    }
  }

  async function handleDeleteLab(id: number) {
    if (!selectedId) return;
    try {
      await deleteLabOrder(id);
      notify("success", "Lab order removed.");
      loadLabs(selectedId);
    } catch (e) {
      notify("error", msg(e));
    }
  }

  /* ---- Patient list view ---- */

  if (selectedId === null) {
    return (
      <div className="page doctor-workspace">
        <div className="doctor-page-header">
          <div>
            <p className="doctor-eyebrow">Treatment Records</p>
            <h1>Medical Treatments</h1>
            <p>Select a patient to view and manage their treatment records.</p>
          </div>
        </div>

        {patientsError && <ErrorState message={patientsError} onRetry={loadPatients} />}
        {patientsLoading && <Skeleton lines={4} />}
        {!patientsLoading && patients.length === 0 && (
          <EmptyState
            icon={<User size={28} />}
            title="No patients found"
            description="No patients have appointments with you yet."
          />
        )}
        {!patientsLoading && patients.length > 0 && (
          <div className="treat-patient-list">
            {patients.map((p) => (
              <div key={p.id} className="treat-patient-sel-wrap">
                <button
                  type="button"
                  className="treat-patient-sel"
                  onClick={() => {
                    setSelectedId(p.id);
                    // Clicking a different patient leaves the emergency
                    // appointment behind, so its id must not leak into the
                    // new treatment.
                    if (contextPatientId !== p.id) {
                      setContextAppointmentId(null);
                      setContextPatientId(p.id);
                    }
                  }}
                >
                  <div className="treat-patient-sel-av">
                    <User size={18} />
                  </div>
                  <div className="treat-patient-sel-info">
                    <span className="treat-patient-sel-name">{p.first_name || p.last_name ? `${p.first_name} ${p.last_name}`.trim() : p.email}</span>
                    <span className="treat-patient-sel-meta">
                      {fmtGender(p.gender)} &middot; {p.blood_group || "No blood group"} &middot; {fmtDate(p.date_of_birth)}
                    </span>
                  </div>
                </button>
                <Link to={`/doctor/visit-history/${p.id}`} className="treat-history-link" title="View visit history">
                  <History size={14} /> History
                </Link>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  /* ---- Patient detail / treatments view ---- */

  return (
    <div className="page doctor-workspace">
      <div className="doctor-page-header">
        <div>
          <button type="button" className="treat-back-btn" onClick={() => setSelectedId(null)}>
            <ArrowLeft size={16} /> Back to patients
          </button>
          <p className="doctor-eyebrow">Treatment Records</p>
          <h1>{profile ? profile.email : `Patient #${selectedId}`}</h1>
          <p>Manage diagnosis, prescriptions, and follow-ups.</p>
        </div>
        <div className="treat-actions-row">
          {!showForm && (
            <Button variant="primary" onClick={handleNew}>
              <Stethoscope size={14} /> New Treatment
            </Button>
          )}
          {showForm && (
            <Button variant="secondary" onClick={() => { setShowForm(false); setEditing(null); setForm(EMPTY); }}>
              <X size={14} /> Close Form
            </Button>
          )}
        </div>
      </div>

      {reportError && <ErrorState message={reportError} />}
      {detailError && <ErrorState message={detailError} onRetry={() => selectedId && loadPatient(selectedId)} />}
      {detailLoading && <Skeleton lines={4} />}

      {!detailLoading && profile && (
        <>
          <PatientInfo profile={profile} />

          <Card className="visit-records-card">
            <div className="treat-pf">
              <label htmlFor="clinical-visit-appointment">Appointment for clinical records</label>
              <select
                id="clinical-visit-appointment"
                className="field__input"
                value={contextAppointmentId ?? ""}
                onChange={(event) => setContextAppointmentId(event.target.value ? Number(event.target.value) : null)}
              >
                <option value="">Select an in-progress or completed appointment</option>
                {patientHistory
                  .filter((visit) => !visit.deleted_at && (visit.status === "in_progress" || visit.status === "done"))
                  .map((visit) => (
                    <option key={visit.appointment_id} value={visit.appointment_id}>
                      {visit.appointment_date} · {visit.start_time.slice(0, 5)} · {visit.appointment_type === "EMERGENCY" ? "Emergency" : "Normal"} · {visit.status}
                    </option>
                  ))}
              </select>
              <p className="form-note">Vitals, lab orders, treatment and attached patient reports will be saved to this visit.</p>
            </div>
          </Card>

          {/* Vitals — readings taken for this patient (phase 2). */}
          <VitalsCard
            vitals={vitals}
            loading={vitalsLoading}
            showForm={showVitalForm}
            form={vitalForm}
            saving={vitalSaving}
            onToggleForm={() => {
              setVitalForm({ ...EMPTY_VITAL, recorded_at: todayISO() });
              setShowVitalForm(true);
            }}
            onField={setVitalField}
            onSave={() => void handleSaveVital()}
            onCancel={handleCancelVital}
            onDelete={(id) => void handleDeleteVital(id)}
            appointmentId={contextAppointmentId}
            onAttach={(id) => void handleAttachVital(id)}
          />

          {/* Lab orders — tests ordered and results recorded (phase 3). */}
          <LabOrdersCard
            orders={labOrders}
            loading={labsLoading}
            showForm={showLabForm}
            form={labForm}
            saving={labSaving}
            onToggleForm={() => {
              setLabForm({ ...EMPTY_LAB, result_due_date: todayISO() });
              setShowLabForm(true);
            }}
            onField={setLabField}
            onSave={() => void handleSaveLab()}
            onCancel={handleCancelLab}
            onAdvance={(id, status) => void handleAdvanceLab(id, status)}
            onSaveResult={(id, payload) => void handleSaveLabResult(id, payload)}
            onDelete={(id) => void handleDeleteLab(id)}
            appointmentId={contextAppointmentId}
            onAttach={(id) => void handleAttachLab(id)}
          />

          {/* Health records — documents/images the patient shared with this
              doctor plus anything this doctor uploaded for them. */}
          <Card className="visit-records-card">
            <div className="visit-card-header">
              <div>
                <h3 style={{ margin: 0, fontSize: 15 }}>Health records</h3>
                <p className="page__subtitle" style={{ margin: "4px 0 0" }}>
                  Documents and images shared with you by this patient
                </p>
              </div>
            </div>
            {records.length === 0 ? (
              <EmptyState
                icon={<FileText size={24} />}
                title="No health records"
                description="Lab reports, prescriptions, and scans shared for this patient will appear here."
              />
            ) : (
              <div className="treat-patient-list">
                {records.map((record) => (
                  <HcRecord key={record.id} record={record} appointmentId={contextAppointmentId} onAttach={(id) => void handleAttachReport(id)} />
                ))}
              </div>
            )}
          </Card>

          {/* Full patient report — deliberately BELOW the health records, because
              the PDF summarises everything above it (profile, treatments,
              prescriptions, vitals, labs and these documents). */}
          <Card className="visit-records-card">
            <div className="visit-card-header">
              <div>
                <h3 style={{ margin: 0, fontSize: 15 }}>Patient medical report</h3>
                <p className="page__subtitle" style={{ margin: "4px 0 0" }}>
                  This patient&rsquo;s complete MediBook record — appointments, treatments,
                  prescriptions, vitals, lab results and health records — in one PDF
                </p>
              </div>
            </div>

            {reportError && (
              <p className="form-note form-note--error">{reportError}</p>
            )}

            <div className="treat-actions-row">
              <Button
                variant="primary"
                loading={reportBusy === "generate"}
                disabled={reportBusy !== null}
                onClick={() => void runReport("generate")}
              >
                <Download size={14} />
                {reportBusy === "generate" ? "Generating report..." : "Generate Patient Report"}
              </Button>
              <Button
                variant="secondary"
                loading={reportBusy === "view"}
                disabled={reportBusy !== null}
                onClick={() => void runReport("view")}
              >
                <Eye size={14} />
                {reportBusy === "view" ? "Opening report..." : "View Report"}
              </Button>
            </div>
            <p className="form-note">
              The patient&rsquo;s complete history since registration — not just the current
              month. You can generate this because you are linked to the patient.
            </p>
          </Card>


          <div className="visit-history-shortcut">
            <Link to={`/doctor/visit-history/${selectedId}`} className="treat-history-link" title="View this patient's full visit history">
              <History size={16} /> History
            </Link>
          </div>


          {showForm && (
            <Card className="treat-form-hdr treat-form">
              <h3>{editing ? "Edit Treatment" : "New Treatment"}</h3>
              <div className="treat-patient-fields">
                <div className="treat-pf">
                  <label htmlFor="tx-diagnosis">Diagnosis</label>
                  <input
                    id="tx-diagnosis"
                    className="field__input"
                    type="text"
                    value={form.diagnosis}
                    onChange={(e) => setForm({ ...form, diagnosis: e.target.value })}
                    placeholder="e.g. Upper respiratory infection"
                  />
                </div>
                <div className="treat-pf">
                  <label htmlFor="tx-notes">Treatment Notes</label>
                  <textarea
                    id="tx-notes"
                    className="field__input"
                    rows={3}
                    value={form.treatment_notes}
                    onChange={(e) => setForm({ ...form, treatment_notes: e.target.value })}
                    placeholder="Clinical notes, observations, procedures..."
                  />
                </div>
                <div className="treat-pf treat-pf--wide">
                  <label htmlFor="tx-doctor-description">Doctor description</label>
                  <textarea
                    id="tx-doctor-description"
                    className="field__input"
                    rows={4}
                    value={form.doctor_description}
                    onChange={(e) => setForm({ ...form, doctor_description: e.target.value })}
                    placeholder="Describe the patient's condition, findings and plan for this appointment..."
                  />
                  <p className="form-note">
                    Saved with this treatment and shown under Documents in the patient&rsquo;s
                    report — labelled Normal or Emergency from the linked appointment.
                  </p>
                </div>
                <div className="treat-pf treat-pf--wide">
                  <span className="treat-pf__label">Medications</span>
                  <div className="rx-list">
                    {form.items.map((row, index) => (
                      <div className="rx-row" key={`rx-${index}`}>
                        <div className="rx-row__grid">
                          <label className="rx-field">
                            <span>Medication</span>
                            <input
                              className="field__input"
                              type="text"
                              value={row.medication}
                              onChange={(e) => updateRow(index, { medication: e.target.value })}
                              placeholder="e.g. Amoxicillin"
                            />
                          </label>
                          <label className="rx-field">
                            <span>Dosage</span>
                            <input
                              className="field__input"
                              type="text"
                              value={row.dosage}
                              onChange={(e) => updateRow(index, { dosage: e.target.value })}
                              placeholder="500 mg"
                            />
                          </label>
                          <label className="rx-field">
                            <span>Frequency</span>
                            <input
                              className="field__input"
                              type="text"
                              value={row.frequency}
                              onChange={(e) => updateRow(index, { frequency: e.target.value })}
                              placeholder="3 times daily"
                            />
                          </label>
                          <label className="rx-field">
                            <span>Route</span>
                            <input
                              className="field__input"
                              type="text"
                              value={row.route}
                              onChange={(e) => updateRow(index, { route: e.target.value })}
                              placeholder="oral"
                            />
                          </label>
                          <label className="rx-field rx-field--num">
                            <span>Days</span>
                            <input
                              className="field__input"
                              type="number"
                              min={1}
                              max={365}
                              value={row.duration_days}
                              onChange={(e) => updateRow(index, { duration_days: e.target.value })}
                              placeholder="7"
                            />
                          </label>
                          <label className="rx-field rx-field--num">
                            <span>Refills</span>
                            <input
                              className="field__input"
                              type="number"
                              min={0}
                              max={12}
                              value={row.refills}
                              onChange={(e) => updateRow(index, { refills: e.target.value })}
                            />
                          </label>
                        </div>
                        <label className="rx-field">
                          <span>Instructions</span>
                          <input
                            className="field__input"
                            type="text"
                            value={row.instructions}
                            onChange={(e) => updateRow(index, { instructions: e.target.value })}
                            placeholder="e.g. Take with food"
                          />
                        </label>
                        <button
                          type="button"
                          className="rx-row__remove"
                          onClick={() => removeRow(index)}
                          aria-label={`Remove medication ${index + 1}`}
                        >
                          <X size={14} /> Remove
                        </button>
                      </div>
                    ))}
                  </div>
                  <button type="button" className="rx-add" onClick={addRow}>
                    <Plus size={14} /> Add medication
                  </button>
                </div>
                <div className="treat-pf">
                  <label htmlFor="tx-rx-notes">Prescription notes</label>
                  <textarea
                    id="tx-rx-notes"
                    className="field__input"
                    rows={2}
                    value={form.prescription_notes}
                    onChange={(e) => setForm({ ...form, prescription_notes: e.target.value })}
                    placeholder="Advice shown under the medication list..."
                  />
                </div>
                <div className="treat-pf">
                  <label htmlFor="tx-followup-date">Follow-up Date</label>
                  <input
                    id="tx-followup-date"
                    className="field__input"
                    type="date"
                    value={form.follow_up_date}
                    onChange={(e) => setForm({ ...form, follow_up_date: e.target.value })}
                  />
                </div>
                <div className="treat-pf">
                  <label htmlFor="tx-followup-time">Follow-up Time</label>
                  <input
                    id="tx-followup-time"
                    className="field__input"
                    type="time"
                    step={60}
                    required={Boolean(form.follow_up_date)}
                    value={form.follow_up_time}
                    onChange={(e) => setForm({ ...form, follow_up_time: e.target.value })}
                  />
                </div>
                <div className="treat-pf">
                  <textarea
                    id="tx-followup-notes"
                    className="field__input"
                    rows={2}
                    value={form.follow_up_notes}
                    onChange={(e) => setForm({ ...form, follow_up_notes: e.target.value })}
                    placeholder="Instructions for the follow-up visit..."
                  />
                </div>
              </div>
              <div className="treat-actions-row">
                <Button variant="primary" loading={saving} onClick={handleSave}>
                  {editing ? "Update Treatment" : "Create Treatment"}
                </Button>
                <Button variant="secondary" onClick={() => { setShowForm(false); setEditing(null); setForm(EMPTY); }}>
                  Cancel
                </Button>
              </div>
            </Card>
          )}

          {treatments.length === 0 && !showForm && (
            <EmptyState
              icon={<FileText size={28} />}
              title="No treatment records"
              description="No treatment records exist for this patient yet."
              action={<Button variant="primary" onClick={handleNew}>Create first record</Button>}
            />
          )}

          {treatments.filter((tx) => {
            const s = tx.appointment_status;
            return s === null || s === undefined || s === "pending" || s === "accepted" || s === "in_progress";
          }).length > 0 && (
            <div className="treat-patient-list">
              {treatments
                .filter((tx) => {
                  const s = tx.appointment_status;
                  return s === null || s === undefined || s === "pending" || s === "accepted" || s === "in_progress";
                })
                .map((tx) => (
                  <TxRecord
                    key={tx.id}
                    record={tx}
                    isCurrent
                    onEdit={handleEdit}
                    onDelete={handleDelete}
                    onCancelFollowUp={(r) => void handleCancelFollowUp(r)}
                    appointmentId={contextAppointmentId}
                    onAttach={(id) => void handleAttachTreatment(id)}
                  />
                ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
