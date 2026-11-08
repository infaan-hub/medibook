import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Link, useParams } from "react-router-dom";
import { getPatientProfileById } from "../api/patients";
import { getVisitHistory, type VisitHistoryEntry } from "../api/treatments";
import { viewDoctorReport } from "../api/reports";
import {
  getHealthRecords,
  uploadHealthRecord,
  deleteHealthRecord,
  type HealthRecord,
} from "../api/health-records";
import type { PatientProfile } from "../api/types";
import { downloadMediaFile, mediaDownloadName, openMediaFile } from "../lib/files";
import { Button, Card, EmptyState, ErrorState, Skeleton } from "../components/ui";
import { LocationLine } from "../components/Location";
import { useToast } from "../state/app-context";
import {
  ArrowLeft,
  Calendar,
  Clock,
  FileText,
  User,
  Stethoscope,
  Pill,
  CalendarClock,
  ChevronRight,
  Upload,
  Trash2,
  Download,
  ExternalLink,
} from "lucide-react";

function msg(error: unknown): string {
  return error instanceof Error ? error.message : "Something went wrong. Please try again.";
}

function fmtDate(d: string): string {
  return new Date(d + "T00:00:00").toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function fmtTime(t: string): string {
  const [h, m] = t.split(":");
  const hour = Number(h);
  return `${hour % 12 || 12}:${m} ${hour < 12 ? "AM" : "PM"}`;
}

function fmtGender(g: string): string {
  if (!g) return "—";
  return g.charAt(0).toUpperCase() + g.slice(1);
}

/* ======================================
   PATIENT INFO CARD
   ====================================== */

function PatientInfo({ profile }: { profile: PatientProfile }) {
  const age = profile.date_of_birth
    ? Math.floor(
        (Date.now() - new Date(profile.date_of_birth + "T00:00:00").getTime()) /
          (365.25 * 24 * 60 * 60 * 1000)
      )
    : null;

  return (
    <Card className="treat-patient-card">
      <div className="treat-patient-hdr">
        <div className="treat-patient-av">
          <User size={22} />
        </div>
        <div className="treat-patient-info">
          <h3>{profile.first_name || profile.last_name ? `${profile.first_name} ${profile.last_name}`.trim() : profile.email}</h3>
          <span className="treat-patient-meta">
            {fmtGender(profile.gender)} {age !== null ? ` · ${age} years` : ""} {profile.blood_group ? ` · ${profile.blood_group}` : ""}
          </span>
        </div>
      </div>
      {profile.has_location && (
        <div className="treat-patient-row">
          <span className="treat-patient-label">Location</span>
          <LocationLine point={profile} accuracy={profile.location_accuracy} directions={false} />
        </div>
      )}
      {profile.medical_history && (
        <div className="treat-patient-row">
          <span className="treat-patient-label">Medical History</span>
          <span>{profile.medical_history}</span>
        </div>
      )}
      {profile.allergies && (
        <div className="treat-patient-row">
          <span className="treat-patient-label">Allergies</span>
          <span>{profile.allergies}</span>
        </div>
      )}
    </Card>
  );
}

/* ======================================
   VISIT TIMELINE ENTRY
   ====================================== */

function VisitEntry({ entry, onViewReport }: { entry: VisitHistoryEntry; onViewReport: (entry: VisitHistoryEntry) => void }) {
  const [expanded, setExpanded] = useState(false);
  const hasDetails = entry.diagnosis || entry.prescription || entry.treatment_notes || entry.doctor_description || entry.reason || entry.notes || entry.patient || entry.treatments?.length || entry.vitals?.length || entry.lab_orders?.length || entry.patient_reports?.length;

  const statusColors: Record<string, string> = {
    done: "var(--color-status-done)",
    accepted: "var(--color-status-accepted)",
    in_progress: "var(--color-status-accepted)",
    pending: "var(--color-status-pending)",
    cancelled: "var(--color-status-cancelled)",
    rejected: "var(--color-status-rejected)",
  };

  return (
    <div className="visit-timeline-entry">
      <div className="visit-timeline-dot" style={{ background: statusColors[entry.status] || "var(--color-primary)" }} />
      <div className="visit-timeline-line" />
      <div className="visit-timeline-card">
        <div className="visit-card-header">
          <div className="visit-card-date">
            <CalendarClock size={14} />
            <span>{fmtDate(entry.appointment_date)}</span>
            <span className="visit-card-sep">·</span>
            <Clock size={14} />
            <span>{fmtTime(entry.start_time)} – {fmtTime(entry.end_time)}</span>
          </div>
          <span className={`visit-status visit-status--${entry.deleted_at ? "deleted" : entry.status}`}>{entry.deleted_at ? "deleted" : entry.status}</span>
        </div>

        <div className="visit-card-field">
          <span className="visit-field-label"><Calendar size={12} /> Appointment</span>
          <span className="visit-field-value">{entry.appointment_type === "EMERGENCY" ? "Emergency" : entry.appointment_type === "HOME_SERVICE" ? "Home Service" : "Normal"} · {entry.reason || "No reason recorded"}{entry.hospital_name ? ` · ${entry.hospital_name}` : ""}</span>
        </div>
        <div className="visit-card-field"><span className="visit-field-label"><User size={12} /> Treating doctor</span><span className="visit-field-value">Dr. {[entry.doctor_first_name, entry.doctor_last_name].filter(Boolean).join(" ") || "Doctor"}</span></div>
        {entry.booked_at && <div className="visit-card-field"><span className="visit-field-label"><Clock size={12} /> Booked</span><span className="visit-field-value">{new Date(entry.booked_at).toLocaleString()}</span></div>}
        {entry.notes && <div className="visit-card-field"><span className="visit-field-label"><FileText size={12} /> Appointment notes</span><span className="visit-field-value">{entry.notes}</span></div>}
        {entry.cancel_reason && <div className="visit-card-field"><span className="visit-field-label"><FileText size={12} /> Cancellation / deletion reason</span><span className="visit-field-value">{entry.cancel_reason}</span></div>}
        {entry.patient && <div className="visit-card-field"><span className="visit-field-label"><User size={12} /> Patient at booking</span><span className="visit-field-value">{[entry.patient.first_name, entry.patient.last_name].filter(Boolean).join(" ")} · {String(entry.patient.email ?? "")} · {String(entry.patient.phone ?? "")}{entry.patient.date_of_birth ? ` · DOB ${String(entry.patient.date_of_birth)}` : ""}{entry.patient.gender ? ` · ${String(entry.patient.gender)}` : ""}{entry.patient.blood_group ? ` · ${String(entry.patient.blood_group)}` : ""}</span></div>}
        {Boolean(entry.patient?.allergies) && <div className="visit-card-field"><span className="visit-field-label"><Stethoscope size={12} /> Allergies at booking</span><span className="visit-field-value">{String(entry.patient?.allergies)}</span></div>}
        {Boolean(entry.patient?.medical_history) && <div className="visit-card-field"><span className="visit-field-label"><FileText size={12} /> Medical history at booking</span><span className="visit-field-value">{String(entry.patient?.medical_history)}</span></div>}
        {Boolean(entry.patient?.emergency_contact_name) && <div className="visit-card-field"><span className="visit-field-label"><User size={12} /> Emergency contact</span><span className="visit-field-value">{String(entry.patient?.emergency_contact_name)} · {String(entry.patient?.emergency_contact_phone ?? "")}</span></div>}
        {entry.emergency_reason && <div className="visit-card-field"><span className="visit-field-label"><Stethoscope size={12} /> Emergency details</span><span className="visit-field-value">{entry.emergency_reason}{entry.emergency_description ? ` · ${entry.emergency_description}` : ""}</span></div>}

        {entry.doctor_description && (
          <div className="visit-card-field">
            <span className="visit-field-label"><FileText size={12} /> Doctor description</span>
            <span className="visit-field-value">{entry.doctor_description}</span>
          </div>
        )}

        {hasDetails && (
          <button type="button" className="visit-expand-toggle" onClick={() => setExpanded(!expanded)}>
            <Stethoscope size={13} />
            {expanded ? "Hide treatment details" : "View treatment details"}
            <ChevronRight size={14} className={`visit-chevron ${expanded ? "visit-chevron--open" : ""}`} />
          </button>
        )}

        {expanded && (
          <div className="visit-details">
            {!entry.treatments?.length && entry.diagnosis && (
              <div className="visit-detail-field">
                <span className="visit-detail-label"><Stethoscope size={12} /> Diagnosis</span>
                <span>{entry.diagnosis}</span>
              </div>
            )}
            {!entry.treatments?.length && entry.doctor_description !== undefined && (
              <div className="visit-detail-field">
                <span className="visit-detail-label"><FileText size={12} /> Doctor description</span>
                <span>{entry.doctor_description || "Not provided"}</span>
              </div>
            )}
            {!entry.treatments?.length && entry.treatment_notes && (
              <div className="visit-detail-field">
                <span className="visit-detail-label"><FileText size={12} /> Treatment Notes</span>
                <span>{entry.treatment_notes}</span>
              </div>
            )}
            {!entry.treatments?.length && entry.prescription && (
              <div className="visit-detail-field">
                <span className="visit-detail-label"><Pill size={12} /> Prescription</span>
                <span>{entry.prescription}</span>
              </div>
            )}
            {entry.treatments?.map((treatment) => (
              <div key={treatment.id} className="visit-treatment-record">
                <h4>Treatment recorded {fmtDate(treatment.created_at.slice(0, 10))}</h4>
                <div className="visit-detail-field"><span className="visit-detail-label"><Stethoscope size={12} /> Diagnosis</span><span>{treatment.diagnosis || "Not recorded"}</span></div>
                <div className="visit-detail-field"><span className="visit-detail-label"><FileText size={12} /> Doctor description</span><span>{treatment.doctor_description || "Not provided"}</span></div>
                <div className="visit-detail-field"><span className="visit-detail-label"><FileText size={12} /> Treatment notes</span><span>{treatment.treatment_notes || "Not provided"}</span></div>
                {treatment.prescription && <div className="visit-detail-field"><span className="visit-detail-label"><Pill size={12} /> Prescription</span><span>{treatment.prescription}</span></div>}
                {treatment.prescriptions?.flatMap((rx) => rx.items).map((item, index) => <div key={`${treatment.id}-rx-${index}`} className="visit-detail-field"><span className="visit-detail-label"><Pill size={12} /> {item.medication}</span><span>{[item.dosage, item.route, item.frequency, item.duration_days ? `${item.duration_days} days` : "", item.instructions].filter(Boolean).join(" · ")}</span></div>)}
                <div className="visit-detail-field"><span className="visit-detail-label"><Calendar size={12} /> Follow-up</span><span>{treatment.follow_up_date ? `${fmtDate(treatment.follow_up_date)}${treatment.follow_up_time ? ` at ${treatment.follow_up_time.slice(0, 5)}` : ""}` : "Not scheduled"}</span></div>
              </div>
            ))}
            {entry.vitals?.length ? <div className="visit-detail-group"><h4>Vitals</h4>{entry.vitals.map((vital) => <div key={vital.id} className="visit-detail-field"><span className="visit-detail-label">{new Date(vital.recorded_at).toLocaleString()}</span><span>{[
              vital.blood_pressure ? `BP ${vital.blood_pressure}` : "",
              vital.pulse_bpm != null ? `Pulse ${vital.pulse_bpm} bpm` : "",
              vital.temperature_c != null ? `Temp ${vital.temperature_c} °C` : "",
              vital.glucose_mg_dl != null ? `Glucose ${vital.glucose_mg_dl} mg/dL` : "",
              vital.weight_kg != null ? `Weight ${vital.weight_kg} kg` : "",
              vital.height_cm != null ? `Height ${vital.height_cm} cm` : "",
              vital.bmi != null ? `BMI ${vital.bmi}` : "",
              vital.spo2_percent != null ? `SpO₂ ${vital.spo2_percent}%` : "",
              vital.notes,
            ].filter(Boolean).join(" · ")}</span></div>)}</div> : null}
            {entry.lab_orders?.length ? <div className="visit-detail-group"><h4>Lab orders and results</h4>{entry.lab_orders.map((lab) => <div key={lab.id} className="visit-detail-field"><span className="visit-detail-label">{lab.test_name} · {lab.status.replaceAll("_", " ")}</span><span>{[
              lab.result_value ? `Result: ${lab.result_value}${lab.unit ? ` ${lab.unit}` : ""}` : "Result pending",
              lab.result_notes,
              lab.notes,
              lab.result_due_date ? `Due ${fmtDate(lab.result_due_date)}` : "",
              lab.reference_min != null || lab.reference_max != null ? `Reference ${lab.reference_min ?? "—"}–${lab.reference_max ?? "—"}${lab.unit ? ` ${lab.unit}` : ""}` : "",
            ].filter(Boolean).join(" · ")}</span></div>)}</div> : null}
            {entry.patient_reports?.length ? <div className="visit-detail-group"><h4>Patient reports and attached records</h4>{entry.patient_reports.map((report) => <div key={report.id} className="visit-detail-field"><span className="visit-detail-label">{report.record_type.replaceAll("_", " ")} · {report.title}</span><span>{[report.description, report.file_name ? `File: ${report.file_name}` : "No file attached", new Date(report.created_at).toLocaleString()].filter(Boolean).join(" · ")}</span></div>)}</div> : null}
            {!entry.treatments?.length && <div className="visit-detail-field">
              <span className="visit-detail-label"><Calendar size={12} /> Follow-up</span>
              <span>
                {entry.follow_up_date
                  ? `${fmtDate(entry.follow_up_date)}${entry.follow_up_time ? ` at ${entry.follow_up_time.slice(0, 5)}` : ""}`
                  : "Not scheduled"}
              </span>
            </div>}
          </div>
        )}
        <div className="visit-card-actions">
          <Button variant="secondary" onClick={() => onViewReport(entry)}><FileText size={14} /> View visit report</Button>
        </div>
      </div>
    </div>
  );
}

/* ======================================
   HEALTH RECORDS (doctor upload / delete)
   ====================================== */

const RECORD_TYPE_OPTIONS = [
  { value: "lab_report", label: "Lab report" },
  { value: "prescription", label: "Prescription" },
  { value: "xray", label: "X-ray" },
  { value: "imaging", label: "Imaging" },
  { value: "other", label: "Other" },
] as const;

function HealthRecordsSection({ patientId, visits }: { patientId: number; visits: VisitHistoryEntry[] }) {
  const { notify } = useToast();
  const [records, setRecords] = useState<HealthRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ title: "", description: "", record_type: "other" });
  const [file, setFile] = useState<File | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [appointmentId, setAppointmentId] = useState("");

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    getHealthRecords(patientId)
      .then((r) => setRecords(r.data?.results ?? []))
      .catch((e) => setError(msg(e)))
      .finally(() => setLoading(false));
  }, [patientId]);

  useEffect(() => { load(); }, [load]);

  async function handleUpload(e: FormEvent) {
    e.preventDefault();
    if (!form.title.trim()) {
      setError("Title is required.");
      return;
    }
    if (!appointmentId) {
      setError("Select the appointment this patient report belongs to.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.append("patient", String(patientId));
      fd.append("title", form.title.trim());
      fd.append("description", form.description.trim());
      fd.append("record_type", form.record_type);
      fd.append("appointment", appointmentId);
      if (file) fd.append("file", file);
      await uploadHealthRecord(fd);
      notify("success", "Health record uploaded.");
      setForm({ title: "", description: "", record_type: "other" });
      setFile(null);
      setAppointmentId("");
      setShowForm(false);
      load();
    } catch (reason) {
      setError(msg(reason));
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: number) {
    setDeletingId(id);
    try {
      await deleteHealthRecord(id);
      setRecords((prev) => prev.filter((r) => r.id !== id));
      notify("success", "Health record deleted.");
    } catch (reason) {
      setError(msg(reason));
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <Card className="visit-records-card">
      <div className="visit-card-header">
        <div>
          <h3 style={{ margin: 0, fontSize: 15 }}>Health records</h3>
          <p className="page__subtitle" style={{ margin: "4px 0 0" }}>
            Lab reports, prescriptions, and imaging for this patient
          </p>
        </div>
        <Button variant={showForm ? "secondary" : "primary"} onClick={() => setShowForm(!showForm)}>
          {showForm ? "Cancel" : <><Upload size={14} /> Upload record</>}
        </Button>
      </div>

      {error && <p className="form-note form-note--error">{error}</p>}

      {showForm && (
        <form className="visit-record-form" onSubmit={handleUpload}>
          <div className="treat-pf">
            <label htmlFor="hr-title">Title *</label>
            <input
              id="hr-title"
              className="field__input"
              type="text"
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              placeholder="e.g. CBC panel — March 2026"
              required
            />
          </div>
          <div className="treat-pf">
            <label htmlFor="hr-type">Type</label>
            <select
              id="hr-type"
              className="field__input"
              value={form.record_type}
              onChange={(e) => setForm({ ...form, record_type: e.target.value })}
            >
              {RECORD_TYPE_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>
          <div className="treat-pf">
            <label htmlFor="hr-appointment">Appointment *</label>
            <select id="hr-appointment" className="field__input" value={appointmentId} onChange={(e) => setAppointmentId(e.target.value)} required>
              <option value="">Select the visit</option>
              {visits.filter((visit) => !visit.deleted_at).map((visit) => (
                <option key={visit.appointment_id} value={visit.appointment_id}>
                  {visit.appointment_date} · {visit.start_time.slice(0, 5)} · {visit.appointment_type === "EMERGENCY" ? "Emergency" : visit.appointment_type === "HOME_SERVICE" ? "Home Service" : "Normal"} · {visit.status}
                </option>
              ))}
            </select>
          </div>
          <div className="treat-pf">
            <label htmlFor="hr-desc">Description</label>
            <textarea
              id="hr-desc"
              className="field__input"
              rows={2}
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              placeholder="Optional notes…"
            />
          </div>
          <div className="treat-pf">
            <label htmlFor="hr-file">File (optional)</label>
            <input
              id="hr-file"
              className="field__input"
              type="file"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            />
          </div>
          <div className="treat-actions-row">
            <Button type="submit" variant="primary" loading={saving}>
              Upload
            </Button>
            <Button type="button" variant="secondary" onClick={() => setShowForm(false)}>
              Cancel
            </Button>
          </div>
        </form>
      )}

      {loading ? (
        <Skeleton lines={3} />
      ) : records.length === 0 ? (
        <EmptyState
          icon={<FileText size={24} />}
          title="No health records"
          description="Upload lab reports, prescriptions, or imaging for this patient."
        />
      ) : (
        <div className="health-records-list">
          {records.map((record) => (
            <div key={record.id} className="health-record-item">
              <div className="health-record-item__info">
                <span className="health-record-item__type">{record.record_type}</span>
                <span className="health-record-item__title">{record.title}</span>
                {record.description && (
                  <span className="health-record-item__desc">{record.description}</span>
                )}
                <span className="health-record-item__date">
                  {new Date(record.created_at).toLocaleDateString()}
                </span>
              </div>
              <div className="health-record-item__actions">
                {!record.file && <span className="health-record-item__date">No file attached</span>}
                <button
                  type="button"
                  className="btn btn--ghost btn--sm"
                  title="View"
                  disabled={!record.file}
                  onClick={() => {
                    if (record.file) {
                      void openMediaFile(record.file, mediaDownloadName(record), (m) =>
                        notify("error", m)
                      );
                    }
                  }}
                >
                  <ExternalLink size={14} /> View
                </button>
                <button
                  type="button"
                  className="btn btn--ghost btn--sm"
                  title="Download"
                  disabled={!record.file}
                  onClick={() => {
                    if (record.file) {
                      void downloadMediaFile(record.file, mediaDownloadName(record), (m) =>
                        notify("error", m)
                      );
                    }
                  }}
                >
                  <Download size={14} /> Download
                </button>
                <Button
                  variant="ghost"
                  loading={deletingId === record.id}
                  onClick={() => handleDelete(record.id)}
                  title="Delete record"
                >
                  <Trash2 size={14} />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

/* ======================================
   VISIT HISTORY PAGE
   ====================================== */

export default function VisitHistoryPage() {
  const { patientId } = useParams<{ patientId: string }>();
  const { notify } = useToast();
  const [patient, setPatient] = useState<PatientProfile | null>(null);
  const [history, setHistory] = useState<VisitHistoryEntry[]>([]);
  const [reportBusy, setReportBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!patientId) return;
    setLoading(true);
    setError(null);
    try {
      const id = Number(patientId);
      const [histRes, patRes] = await Promise.all([
        getVisitHistory(id),
        getPatientProfileById(id),
      ]);
      setHistory(histRes.data ?? []);
      setPatient(patRes.data ?? null);
    } catch (e) {
      setError(msg(e));
    } finally {
      setLoading(false);
    }
  }, [patientId]);

  useEffect(() => { load(); }, [load]);

  if (loading) {
    return (
      <div className="page doctor-workspace">
        <div className="doctor-page-header">
          <Link to="/doctor/medical-treatment" className="treat-back-btn"><ArrowLeft size={16} /> Back to patients</Link>
          <p className="doctor-eyebrow">Visit History</p>
          <h1>Loading…</h1>
        </div>
        <Skeleton lines={6} />
      </div>
    );
  }

  if (error) {
    return (
      <div className="page doctor-workspace">
        <div className="doctor-page-header">
          <Link to="/doctor/medical-treatment" className="treat-back-btn"><ArrowLeft size={16} /> Back to patients</Link>
          <p className="doctor-eyebrow">Visit History</p>
          <h1>Error</h1>
        </div>
        <ErrorState message={error} onRetry={load} />
      </div>
    );
  }

  return (
    <div className="page doctor-workspace">
      <div className="doctor-page-header">
        <div>
          <Link to="/doctor/medical-treatment" className="treat-back-btn">
            <ArrowLeft size={16} /> Back to patients
          </Link>
          <p className="doctor-eyebrow">Visit History</p>
          <h1>{patient ? `${patient.first_name || ""} ${patient.last_name || ""}`.trim() || patient.email : `Patient #${patientId}`}</h1>
          <p>Complete timeline of past appointments and treatments.</p>
        </div>
      </div>

      {patient && <PatientInfo profile={patient} />}

      <h2 className="visit-section-title">Patient History</h2>
      <div style={{ marginBottom: 12 }}>
        <Button
          variant="secondary"
          loading={reportBusy}
          onClick={async () => {
            if (!patientId) return;
            setReportBusy(true);
            try {
              const r = await viewDoctorReport(Number(patientId));
              notify("success", `Report opened in a new tab — ${r.filename}`);
            } catch (e) {
              notify("error", msg(e));
            } finally {
              setReportBusy(false);
            }
          }}
        >
          Preview patient report
        </Button>
      </div>

      {patientId && <HealthRecordsSection patientId={Number(patientId)} visits={history} />}

      {history.length === 0 ? (
        <EmptyState
          icon={<Calendar size={28} />}
          title="No visits yet"
          description="There are no saved visits in this patient’s history yet."
        />
      ) : (
        <div className="visit-timeline">
          {history.map((entry) => (
            <VisitEntry
              key={entry.appointment_id}
              entry={entry}
              onViewReport={(visit) => {
                if (!patientId) return;
                setReportBusy(true);
                void viewDoctorReport(Number(patientId), { appointmentId: visit.appointment_id })
                  .then((r) => notify("success", `Visit report opened — ${r.filename}`))
                  .catch((e) => notify("error", msg(e)))
                  .finally(() => setReportBusy(false));
              }}
            />
          ))}
        </div>
      )}
    </div>
  );
}
