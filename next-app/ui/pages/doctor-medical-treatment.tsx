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
import type { PatientProfile } from "../api/types";
import { getHealthRecords, type HealthRecord } from "../api/health-records";
import { Button, Card, EmptyState, ErrorState, Skeleton } from "../components/ui";
import { useToast } from "../state/app-context";
import {
  ArrowLeft,
  User,
  Calendar,
  FileText,
  Edit3,
  Trash2,
  X,
  Pill,
  Stethoscope,
  History,
  Download,
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

interface TForm {
  diagnosis: string;
  treatment_notes: string;
  prescription: string;
  follow_up_date: string;
  follow_up_notes: string;
}

const EMPTY: TForm = {
  diagnosis: "",
  treatment_notes: "",
  prescription: "",
  follow_up_date: "",
  follow_up_notes: "",
};

/* ======================================
   PATIENT INFO CARD
   ====================================== */

function PatientInfo({ profile }: { profile: PatientProfile }) {
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
      </div>
      <div className="treat-patient-fields">
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
          <span>City</span>
          <strong>{profile.city || "—"}</strong>
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
      </div>
    </Card>
  );
}

/* ======================================
   TREATMENT RECORD CARD
   ====================================== */

function TxRecord({
  record,
  onEdit,
  onDelete,
}: {
  record: MedicalTreatment;
  onEdit: (r: MedicalTreatment) => void;
  onDelete: (id: number) => void;
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
        </div>
        <div className="treat-rec-acts">
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

      {record.prescription && (
        <div className="treat-rec-sec">
          <span className="treat-rec-lbl"><Pill size={12} /> Prescription</span>
          <p className="treat-rec-val">{record.prescription}</p>
        </div>
      )}

      {record.follow_up_date && (
        <div className="treat-rec-sec">
          <span className="treat-rec-lbl"><Calendar size={12} /> Follow-up Date</span>
          <p className="treat-rec-val">{fmtDate(record.follow_up_date)}</p>
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

function HcRecord({ record }: { record: HealthRecord }) {
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
        {record.file && (
          <a href={record.file} target="_blank" rel="noopener noreferrer" className="treat-rec-link">
            <Download size={12} /> Open file
          </a>
        )}
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

  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [profile, setProfile] = useState<PatientProfile | null>(null);
  const [treatments, setTreatments] = useState<MedicalTreatment[]>([]);
  const [records, setRecords] = useState<HealthRecord[]>([]);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);

  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<MedicalTreatment | null>(null);
  const [form, setForm] = useState<TForm>(EMPTY);
  const [saving, setSaving] = useState(false);

  const loadPatients = useCallback(() => {
    setPatientsError(null);
    setPatientsLoading(true);
    listDoctorPatients()
      .then((r) => setPatients(r.data))
      .catch((e) => setPatientsError(msg(e)))
      .finally(() => setPatientsLoading(false));
  }, []);

  const loadPatient = useCallback(
    (id: number) => {
      setDetailError(null);
      setDetailLoading(true);
      Promise.all([
        getPatientProfileById(id),
        listTreatments(id),
        getHealthRecords(id),
      ])
        .then(([profileRes, txRes, recordRes]) => {
          setProfile(profileRes.data);
          setTreatments(txRes.data);
          setRecords(recordRes.data?.results ?? []);
        })
        .catch((e) => setDetailError(msg(e)))
        .finally(() => setDetailLoading(false));
    },
    []
  );

  useEffect(() => {
    loadPatients();
  }, [loadPatients]);

  useEffect(() => {
    if (selectedId !== null) loadPatient(selectedId);
  }, [selectedId, loadPatient]);

  function handleNew() {
    setEditing(null);
    setForm(EMPTY);
    setShowForm(true);
  }

  function handleEdit(record: MedicalTreatment) {
    setEditing(record);
    setForm({
      diagnosis: record.diagnosis,
      treatment_notes: record.treatment_notes,
      prescription: record.prescription,
      follow_up_date: record.follow_up_date ?? "",
      follow_up_notes: record.follow_up_notes,
    });
    setShowForm(true);
  }

  async function handleSave() {
    if (!selectedId) return;
    setSaving(true);
    try {
      if (editing) {
        await updateTreatment(editing.id, {
          diagnosis: form.diagnosis,
          treatment_notes: form.treatment_notes,
          prescription: form.prescription,
          follow_up_date: form.follow_up_date || null,
          follow_up_notes: form.follow_up_notes,
        });
        notify("success", "Treatment record updated.");
      } else {
        await createTreatment({
          patient: selectedId,
          diagnosis: form.diagnosis,
          treatment_notes: form.treatment_notes,
          prescription: form.prescription,
          follow_up_date: form.follow_up_date || null,
          follow_up_notes: form.follow_up_notes,
        });
        notify("success", "Treatment record created.");
      }
      setShowForm(false);
      setEditing(null);
      setForm(EMPTY);
      loadPatient(selectedId);
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
                  onClick={() => setSelectedId(p.id)}
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

      {detailError && <ErrorState message={detailError} onRetry={() => selectedId && loadPatient(selectedId)} />}
      {detailLoading && <Skeleton lines={4} />}

      {!detailLoading && profile && (
        <>
          <PatientInfo profile={profile} />

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
                  <HcRecord key={record.id} record={record} />
                ))}
              </div>
            )}
          </Card>

          {showForm && (
            <Card className="treat-form-hdr">
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
                <div className="treat-pf">
                  <label htmlFor="tx-rx">Prescription</label>
                  <textarea
                    id="tx-rx"
                    className="field__input"
                    rows={2}
                    value={form.prescription}
                    onChange={(e) => setForm({ ...form, prescription: e.target.value })}
                    placeholder="Medications, dosages, duration..."
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
                  <label htmlFor="tx-followup-notes">Follow-up Notes</label>
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

          {treatments.length > 0 && (
            <div className="treat-patient-list">
              {treatments.map((tx) => (
                <TxRecord key={tx.id} record={tx} onEdit={handleEdit} onDelete={handleDelete} />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
