/**
 * Patient medical detail — read-only view with edit toggle.
 * /settings — patient can view and edit their medical information.
 */

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { getLinkedDoctors, getPatientProfile, updatePatientProfile } from "../api/patients";
import {
  getHealthRecords,
  uploadHealthRecord,
  type HealthRecord,
} from "../api/health-records";
import { myPrescriptions, type Prescription } from "../api/prescriptions";
import { myVitals, type Vital } from "../api/vitals";
import { myLabOrders, type LabOrder } from "../api/lab-orders";
import { vitalChips, vitalDate } from "../lib/vitals";
import { statusLabel, flagLabel, referenceLabel, resultLabel } from "../lib/lab-orders";
import type { Gender, GeoInput, LinkedDoctor, PatientProfile } from "../api/types";
import { ApiError } from "../api/client";
import { downloadMediaFile, mediaDownloadName, openMediaFile } from "../lib/files";
import { captureFix, LocationError } from "../lib/location";
import { Button, Card, EmptyState, ErrorState, Skeleton } from "../components/ui";
import { downloadPatientReport, viewPatientReport } from "../api/reports";
import { LocationLine } from "../components/Location";
import { useToast } from "../state/app-context";
import {
  User,
  Droplet,
  MapPin,
  AlertTriangle,
  FileText,
  Calendar,
  Crosshair,
  Heart,
  Shield,
  Edit3,
  X,
  Save,
  Bell,
  Pill,
  Activity,
  FlaskConical,
  Download,
  ExternalLink,
  Eye,
  File,
  Upload,
} from "lucide-react";

const RECORD_TYPE_OPTIONS = [
  { value: "lab_report", label: "Lab report" },
  { value: "prescription", label: "Prescription" },
  { value: "xray", label: "X-ray" },
  { value: "imaging", label: "Imaging" },
  { value: "other", label: "Other" },
] as const;

const EMPTY_RECORD_FORM = {
  title: "",
  description: "",
  record_type: "other",
  doctor: "",
};

function formatGender(g: string): string {
  if (!g) return "Not specified";
  return g.charAt(0).toUpperCase() + g.slice(1);
}

function formatDateOfBirth(d: string | null): string {
  if (!d) return "Not specified";
  const dt = new Date(d + "T00:00:00");
  const age = Math.floor((Date.now() - dt.getTime()) / (365.25 * 24 * 60 * 60 * 1000));
  return `${dt.toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" })} (${age} yrs)`;
}

function fieldErrors(error: unknown): Record<string, string> {
  if (error instanceof ApiError) {
    return Object.fromEntries(
      Object.entries(error.errors).map(([field, messages]) => [field, messages[0] ?? "Invalid value."])
    );
  }
  return {};
}

/* ---------- Medical Detail Card (read-only) ---------- */

function MedicalDetailCard({ profile }: { profile: PatientProfile }) {
  return (
    <div className="med-detail">
      <div className="med-detail__grid">
        <div className="med-detail__item">
          <div className="med-detail__icon"><Calendar size={16} /></div>
          <div className="med-detail__content">
            <span className="med-detail__label">Date of Birth</span>
            <span className="med-detail__value">{formatDateOfBirth(profile.date_of_birth)}</span>
          </div>
        </div>
        <div className="med-detail__item">
          <div className="med-detail__icon"><User size={16} /></div>
          <div className="med-detail__content">
            <span className="med-detail__label">Gender</span>
            <span className="med-detail__value">{formatGender(profile.gender)}</span>
          </div>
        </div>
        <div className="med-detail__item">
          <div className="med-detail__icon"><Droplet size={16} /></div>
          <div className="med-detail__content">
            <span className="med-detail__label">Blood Group</span>
            <span className="med-detail__value">{profile.blood_group || "Not specified"}</span>
          </div>
        </div>
        <div className="med-detail__item">
          <div className="med-detail__icon"><MapPin size={16} /></div>
          <div className="med-detail__content">
            <span className="med-detail__label">Location</span>
            <span className="med-detail__value">
              <LocationLine point={profile} accuracy={profile.location_accuracy} />
            </span>
          </div>
        </div>
      </div>

      {(profile.emergency_contact_name || profile.emergency_contact_phone) && (
        <div className="med-detail__section">
          <div className="med-detail__section-icon"><Shield size={16} /></div>
          <div>
            <span className="med-detail__section-label">Emergency Contact</span>
            <span className="med-detail__section-value">
              {profile.emergency_contact_name}
              {profile.emergency_contact_phone && ` · ${profile.emergency_contact_phone}`}
            </span>
          </div>
        </div>
      )}

      {profile.allergies && (
        <div className="med-detail__section">
          <div className="med-detail__section-icon"><AlertTriangle size={16} /></div>
          <div>
            <span className="med-detail__section-label">Allergies</span>
            <span className="med-detail__section-value">{profile.allergies}</span>
          </div>
        </div>
      )}

      {profile.medical_history && (
        <div className="med-detail__section">
          <div className="med-detail__section-icon"><FileText size={16} /></div>
          <div>
            <span className="med-detail__section-label">Medical History</span>
            <span className="med-detail__section-value">{profile.medical_history}</span>
          </div>
        </div>
      )}
    </div>
  );
}

/* ---------- Medical Edit Form ---------- */

interface MedForm {
  date_of_birth: string;
  gender: Gender;
  emergency_contact_name: string;
  emergency_contact_phone: string;
  blood_group: string;
  allergies: string;
  medical_history: string;
}

function profileToForm(p: PatientProfile): MedForm {
  return {
    date_of_birth: p.date_of_birth ?? "",
    gender: p.gender,
    emergency_contact_name: p.emergency_contact_name,
    emergency_contact_phone: p.emergency_contact_phone,
    blood_group: p.blood_group,
    allergies: p.allergies,
    medical_history: p.medical_history,
  };
}

function MedicalEditForm({
  form,
  setForm,
  onSave,
  onCancel,
  saving,
  errors,
  geo,
  geoBusy,
  geoError,
  onCaptureLocation,
  onClearLocation,
}: {
  form: MedForm;
  setForm: (f: MedForm) => void;
  onSave: () => void;
  onCancel: () => void;
  saving: boolean;
  errors: Record<string, string>;
  geo: GeoInput;
  geoBusy: boolean;
  geoError: string | null;
  onCaptureLocation: () => void;
  onClearLocation: () => void;
}) {
  function update<K extends keyof MedForm>(key: K, value: MedForm[K]) {
    setForm({ ...form, [key]: value });
  }

  return (
    <div className="med-detail">
      <div className="med-edit-form">
        <div className="form__row">
          <div className="field">
            <label className="field__label" htmlFor="med-dob">Date of birth</label>
            <input id="med-dob" className={`field__input${errors.date_of_birth ? " field__input--error" : ""}`} type="date" value={form.date_of_birth} onChange={(e) => update("date_of_birth", e.target.value)} />
            {errors.date_of_birth && <p className="field__error">{errors.date_of_birth}</p>}
          </div>
          <div className="field">
            <label className="field__label" htmlFor="med-gender">Gender</label>
            <select id="med-gender" className="field__input" value={form.gender} onChange={(e) => update("gender", e.target.value as Gender)}>
              <option value="">Prefer not to say</option>
              <option value="male">Male</option>
              <option value="female">Female</option>
              <option value="other">Other</option>
            </select>
          </div>
        </div>
        <div className="field">
          <label className="field__label" htmlFor="med-blood">Blood group</label>
          <input id="med-blood" className="field__input" placeholder="e.g. O+" value={form.blood_group} onChange={(e) => update("blood_group", e.target.value)} />
        </div>
        {/* Real position — the address/city text boxes were dropped because
            free text cannot power "near me", directions or emergencies. */}
        <div className="field">
          <span className="field__label" id="med-location-label">Location</span>
          <p className="page__subtitle">
            Captured with your device's GPS. Used to find doctors near you and to route emergency
            requests — appointments cannot be booked without it.
          </p>
          <p className="doctor-profile__location">
            <LocationLine point={geo} accuracy={geo.location_accuracy} />
          </p>
          {geoError && <p className="field__error" role="alert">{geoError}</p>}
          {errors.latitude && <p className="field__error">{errors.latitude}</p>}
          <div className="prompt__actions-row">
            <Button
              type="button"
              variant="secondary"
              loading={geoBusy}
              onClick={onCaptureLocation}
            >
              <Crosshair size={14} /> {geo.latitude != null ? "Update location" : "Set my location"}
            </Button>
            {geo.latitude != null && (
              <Button type="button" variant="ghost" onClick={onClearLocation}>
                Clear
              </Button>
            )}
          </div>
        </div>
        <div className="form__row">
          <div className="field">
            <label className="field__label" htmlFor="med-ec-name">Emergency contact name</label>
            <input id="med-ec-name" className="field__input" value={form.emergency_contact_name} onChange={(e) => update("emergency_contact_name", e.target.value)} />
          </div>
          <div className="field">
            <label className="field__label" htmlFor="med-ec-phone">Emergency contact phone</label>
            <input id="med-ec-phone" className="field__input" type="tel" placeholder="+94 …" value={form.emergency_contact_phone} onChange={(e) => update("emergency_contact_phone", e.target.value)} />
          </div>
        </div>
        <div className="field">
          <label className="field__label" htmlFor="med-allergies">Allergies</label>
          <textarea id="med-allergies" className="field__input" rows={2} placeholder="One per line, or leave empty." value={form.allergies} onChange={(e) => update("allergies", e.target.value)} />
        </div>
        <div className="field">
          <label className="field__label" htmlFor="med-history">Medical history</label>
          <textarea id="med-history" className="field__input" rows={4} placeholder="Conditions, surgeries, medication — anything a doctor should know." value={form.medical_history} onChange={(e) => update("medical_history", e.target.value)} />
        </div>
        <div className="med-edit-actions">
          <Button onClick={onSave} loading={saving}><Save size={14} /> Save</Button>
          <Button variant="secondary" onClick={onCancel}><X size={14} /> Cancel</Button>
        </div>
      </div>
    </div>
  );
}

/* ---------- Main Settings Screen ---------- */

export function SettingsScreen() {
  const { t } = useTranslation();
  const { notify } = useToast();
  const [profile, setProfile] = useState<PatientProfile | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<MedForm | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  /** Pending GPS fix for the edit form (sent with the rest of the profile). */
  const [geo, setGeo] = useState<GeoInput>({ latitude: null, longitude: null, location_accuracy: null });
  const [geoBusy, setGeoBusy] = useState(false);
  const [geoError, setGeoError] = useState<string | null>(null);
  const [healthRecords, setHealthRecords] = useState<HealthRecord[]>([]);
  const [recordsLoading, setRecordsLoading] = useState(true);
  const [prescriptions, setPrescriptions] = useState<Prescription[]>([]);
  const [rxLoading, setRxLoading] = useState(true);
  const [vitals, setVitals] = useState<Vital[]>([]);
  const [vitalsLoading, setVitalsLoading] = useState(true);
  const [labOrders, setLabOrders] = useState<LabOrder[]>([]);
  const [labsLoading, setLabsLoading] = useState(true);
  const [linkedDoctors, setLinkedDoctors] = useState<LinkedDoctor[]>([]);
  const [showRecordForm, setShowRecordForm] = useState(false);
  const [recordForm, setRecordForm] = useState(EMPTY_RECORD_FORM);
  const [recordFile, setRecordFile] = useState<File | null>(null);
  const [recordSaving, setRecordSaving] = useState(false);
  const [recordError, setRecordError] = useState<string | null>(null);

  const loadRecords = useCallback(() => {
    setRecordsLoading(true);
    getHealthRecords()
      .then((r) => setHealthRecords(r.data?.results ?? []))
      .catch(() => setHealthRecords([]))
      .finally(() => setRecordsLoading(false));
  }, []);

  /** Structured prescriptions issued by any of this patient's doctors. */
  const loadPrescriptions = useCallback(() => {
    setRxLoading(true);
    myPrescriptions()
      .then((r) => setPrescriptions(r.data ?? []))
      .catch(() => setPrescriptions([]))
      .finally(() => setRxLoading(false));
  }, []);

  /** The patient's own vitals history (phase 2). */
  const loadVitals = useCallback(() => {
    setVitalsLoading(true);
    myVitals()
      .then((r) => setVitals(r.data ?? []))
      .catch(() => setVitals([]))
      .finally(() => setVitalsLoading(false));
  }, []);

  /** Lab tests ordered for this patient, with any reported results (phase 3). */
  const loadLabOrders = useCallback(() => {
    setLabsLoading(true);
    myLabOrders()
      .then((r) => setLabOrders(r.data ?? []))
      .catch(() => setLabOrders([]))
      .finally(() => setLabsLoading(false));
  }, []);

  const load = useCallback(() => {
    setLoadError(null);
    setProfile(null);
    setEditing(false);
    getPatientProfile()
      .then((envelope) => setProfile(envelope.data))
      .catch(() => setLoadError("Could not load your medical details."));
    loadRecords();
    loadPrescriptions();
    loadVitals();
    loadLabOrders();
    // Doctors this patient can share a record with (appointment-linked only).
    getLinkedDoctors()
      .then((r) => setLinkedDoctors(r.data ?? []))
      .catch(() => setLinkedDoctors([]));
  }, [loadRecords, loadPrescriptions, loadVitals, loadLabOrders]);

  useEffect(() => { load(); }, [load]);

  /* ---- Report generation (§34) — always the caller's own chart ---- */
  const [reportBusy, setReportBusy] = useState<"generate" | "view" | null>(null);
  const [reportError, setReportError] = useState<string | null>(null);

  const runReport = async (action: "generate" | "view") => {
    setReportBusy(action);
    setReportError(null);
    try {
      const result = action === "view" ? await viewPatientReport() : await downloadPatientReport();
      notify(
        "success",
        action === "view"
          ? `Report opened in a new tab — ${result.filename}`
          : `Report downloaded — ${result.filename}`
      );
    } catch (error) {
      const text = error instanceof Error ? error.message : "Could not generate your report.";
      setReportError(text);
      notify("error", text);
    } finally {
      setReportBusy(null);
    }
  };

  async function handleUploadRecord(e: FormEvent) {
    e.preventDefault();
    setRecordError(null);
    if (!recordForm.doctor) {
      setRecordError("Choose the doctor to share this record with.");
      return;
    }
    if (!recordForm.title.trim()) {
      setRecordError("Title is required.");
      return;
    }
    setRecordSaving(true);
    try {
      const fd = new FormData();
      fd.append("doctor", recordForm.doctor);
      fd.append("title", recordForm.title.trim());
      fd.append("description", recordForm.description.trim());
      fd.append("record_type", recordForm.record_type);
      if (recordFile) fd.append("file", recordFile);
      await uploadHealthRecord(fd);
      notify("success", "Health record uploaded and shared with your doctor.");
      setRecordForm(EMPTY_RECORD_FORM);
      setRecordFile(null);
      setShowRecordForm(false);
      loadRecords();
    } catch (error) {
      setRecordError(error instanceof Error ? error.message : "Could not upload the record.");
    } finally {
      setRecordSaving(false);
    }
  }

  function handleEdit() {
    if (!profile) return;
    setForm(profileToForm(profile));
    setGeo({
      latitude: profile.latitude,
      longitude: profile.longitude,
      location_accuracy: profile.location_accuracy,
    });
    setGeoError(null);
    setErrors({});
    setEditing(true);
  }

  function handleCancel() {
    setEditing(false);
    setForm(null);
    setGeoError(null);
    setErrors({});
  }

  async function handleCaptureLocation() {
    setGeoError(null);
    setGeoBusy(true);
    try {
      const fix = await captureFix();
      setGeo({ latitude: fix.latitude, longitude: fix.longitude, location_accuracy: fix.accuracy });
    } catch (reason) {
      setGeoError(reason instanceof LocationError ? reason.message : "Could not read your location.");
    } finally {
      setGeoBusy(false);
    }
  }

  async function handleSave() {
    if (!form) return;
    setSaving(true);
    setErrors({});
    try {
      const envelope = await updatePatientProfile({
        date_of_birth: form.date_of_birth || null,
        gender: form.gender,
        emergency_contact_name: form.emergency_contact_name,
        emergency_contact_phone: form.emergency_contact_phone,
        blood_group: form.blood_group,
        allergies: form.allergies,
        medical_history: form.medical_history,
        latitude: geo.latitude ?? null,
        longitude: geo.longitude ?? null,
        location_accuracy: geo.location_accuracy ?? null,
      });
      setProfile(envelope.data);
      setEditing(false);
      setForm(null);
      notify("success", "Medical details saved successfully.");
    } catch (error) {
      const fieldMap = fieldErrors(error);
      if (Object.keys(fieldMap).length > 0) {
        setErrors(fieldMap);
      } else {
        notify("error", "Could not save your details. Please try again.");
      }
    } finally {
      setSaving(false);
    }
  }

  if (loadError) {
    return (
      <div className="page med-page">
        <h1 className="page__title">Medical Details</h1>
        <ErrorState message={loadError} onRetry={load} />
      </div>
    );
  }

  if (!profile) return <div className="page med-page"><h1 className="page__title">Medical Details</h1><Skeleton lines={6} /></div>;

  return (
    <div className="page med-page">
      <div className="med-page__header">
        <div>
          <h1 className="page__title">Medical Details</h1>
          <p className="page__subtitle">
            Your health profile shared with your doctors during visits. Account info lives in{" "}
            <Link to="/profile">Profile</Link>.
          </p>
        </div>
        <div className="med-page__actions">
          <Button variant="secondary" onClick={() => runReport("generate")} disabled={reportBusy !== null}>
            <Download size={14} /> {reportBusy === "generate" ? "Generating report..." : "Generate Report"}
          </Button>
          <Button variant="secondary" onClick={() => runReport("view")} disabled={reportBusy !== null}>
            <Eye size={14} /> {reportBusy === "view" ? "Opening report..." : "View"}
          </Button>
        </div>
      </div>

      {reportError && <ErrorState message={reportError} />}

      <Card className="card--fit">
        <div className="med-detail__header">
          <div className="med-detail__title-row">
            <div className="med-detail__avatar"><Heart size={24} /></div>
            <div>
              <h2 className="med-detail__title">Medical Information</h2>
              <p className="med-detail__subtitle">Your health profile shared with your doctors</p>
            </div>
          </div>
          {!editing && (
            <Button variant="secondary" onClick={handleEdit}>
              <Edit3 size={14} /> Edit
            </Button>
          )}
        </div>

        {editing && form ? (
          <MedicalEditForm
            form={form}
            setForm={setForm}
            onSave={handleSave}
            onCancel={handleCancel}
            saving={saving}
            errors={errors}
            geo={geo}
            geoBusy={geoBusy}
            geoError={geoError}
            onCaptureLocation={() => void handleCaptureLocation()}
            onClearLocation={() =>
              setGeo({ latitude: null, longitude: null, location_accuracy: null })
            }
          />
        ) : (
          <MedicalDetailCard profile={profile} />
        )}
      </Card>

      {/* Reminder Preferences */}
      <Card className="card--fit">
        <div className="med-detail__header">
          <div className="med-detail__title-row">
            <div className="med-detail__avatar"><Bell size={24} /></div>
            <div>
              <h2 className="med-detail__title">{t("settings.reminders")}</h2>
              <p className="med-detail__subtitle">Choose when to receive appointment reminders</p>
            </div>
          </div>
        </div>
        <div className="reminder-settings">
          {[
            { key: "1h", label: t("settings.reminder1h") },
            { key: "24h", label: t("settings.reminder24h") },
            { key: "1w", label: t("settings.reminder1w") },
          ].map(({ key, label }) => (
            <label key={key} className="reminder-settings__item">
              <input
                type="checkbox"
                checked={profile?.reminder_preferences?.[key] !== false}
                onChange={(e) => {
                  const prefs = { ...(profile?.reminder_preferences ?? {}), [key]: e.target.checked };
                  updatePatientProfile({ reminder_preferences: prefs })
                    .then((r) => setProfile(r.data))
                    .catch(() => notify("error", "Could not save reminder preferences."));
                }}
              />
              <span>{label}</span>
            </label>
          ))}
        </div>
        <div className="field" style={{ marginTop: 12 }}>
          <label className="field__label" htmlFor="reminder-timezone">
            Timezone (for reminder times)
          </label>
          <input
            id="reminder-timezone"
            className="field__input"
            type="text"
            list="common-timezones"
            placeholder="e.g. Africa/Dar_es_Salaam"
            defaultValue={profile?.timezone ?? "UTC"}
            onBlur={(e) => {
              const tz = e.target.value.trim() || "UTC";
              try {
                new Intl.DateTimeFormat("en-US", { timeZone: tz });
              } catch {
                notify("error", "Invalid timezone. Use an IANA name like Africa/Dar_es_Salaam.");
                e.target.value = profile?.timezone ?? "UTC";
                return;
              }
              if (tz === (profile?.timezone ?? "UTC")) return;
              updatePatientProfile({ timezone: tz })
                .then((r) => setProfile(r.data))
                .catch(() => notify("error", "Could not save timezone."));
            }}
          />
          <datalist id="common-timezones">
            {[
              "UTC",
              "Africa/Dar_es_Salaam",
              "Africa/Nairobi",
              "Africa/Lagos",
              "Africa/Cairo",
              "Europe/London",
              "Europe/Paris",
              "America/New_York",
              "America/Chicago",
              "America/Los_Angeles",
              "Asia/Dubai",
              "Asia/Karachi",
              "Asia/Kolkata",
              "Asia/Tokyo",
              "Australia/Sydney",
            ].map((tz) => (
              <option key={tz} value={tz} />
            ))}
          </datalist>
        </div>
      </Card>

      {/* Prescriptions (structured e-prescriptions, phase 1) */}
      <Card className="card--fit">
        <div className="med-detail__header">
          <div className="med-detail__title-row">
            <div className="med-detail__avatar"><Pill size={24} /></div>
            <div>
              <h2 className="med-detail__title">Prescriptions</h2>
              <p className="med-detail__subtitle">
                Medicines prescribed for you during your visits
              </p>
            </div>
          </div>
        </div>

        {rxLoading ? (
          <Skeleton lines={3} />
        ) : prescriptions.length === 0 ? (
          <EmptyState
            icon={<Pill size={28} />}
            title="No prescriptions yet"
            description="Medications your doctors prescribe will appear here after a visit."
          />
        ) : (
          <div className="rx-list">
            {prescriptions.map((rx) => (
              <div key={rx.id} className="rx-card">
                <div className="rx-card__head">
                  <span className="rx-card__date">
                    <Calendar size={13} /> {new Date(rx.created_at).toLocaleDateString()}
                  </span>
                  <span className="rx-card__count">
                    {rx.items.length} medication{rx.items.length === 1 ? "" : "s"}
                  </span>
                </div>
                <ul className="rx-list rx-list--view">
                  {rx.items.map((item) => (
                    <li key={item.id ?? item.sort_order ?? item.medication} className="rx-item">
                      <strong>
                        {item.medication}
                        {item.dosage ? ` ${item.dosage}` : ""}
                      </strong>
                      <span className="rx-item__meta">
                        {[
                          item.frequency,
                          item.route,
                          item.duration_days ? `${item.duration_days} days` : "",
                          item.refills ? `${item.refills} refill${item.refills === 1 ? "" : "s"}` : "",
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                      </span>
                      {item.instructions && (
                        <em className="rx-item__note">{item.instructions}</em>
                      )}
                    </li>
                  ))}
                </ul>
                {rx.notes && <p className="rx-card__notes">{rx.notes}</p>}
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* Vitals history (phase 2) */}
      <Card className="card--fit">
        <div className="med-detail__header">
          <div className="med-detail__title-row">
            <div className="med-detail__avatar"><Activity size={24} /></div>
            <div>
              <h2 className="med-detail__title">Vitals</h2>
              <p className="med-detail__subtitle">
                Blood pressure, pulse and other readings recorded at your visits
              </p>
            </div>
          </div>
        </div>

        {vitalsLoading ? (
          <Skeleton lines={3} />
        ) : vitals.length === 0 ? (
          <EmptyState
            icon={<Activity size={28} />}
            title="No readings yet"
            description="Vitals recorded by your doctor during a visit will appear here."
          />
        ) : (
          <div className="vit-list">
            {vitals.map((vital) => (
              <div key={vital.id} className="vit-row">
                <div className="vit-row__head">
                  <span className="vit-row__date">{vitalDate(vital.recorded_at)}</span>
                  {vital.recorded_by && (
                    <span className="vit-row__by">Recorded by Dr. {vital.recorded_by}</span>
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

      {/* Lab results (phase 3) */}
      <Card className="card--fit">
        <div className="med-detail__header">
          <div className="med-detail__title-row">
            <div className="med-detail__avatar"><FlaskConical size={24} /></div>
            <div>
              <h2 className="med-detail__title">Lab results</h2>
              <p className="med-detail__subtitle">
                Tests ordered by your doctor and their reported results
              </p>
            </div>
          </div>
        </div>

        {labsLoading ? (
          <Skeleton lines={3} />
        ) : labOrders.length === 0 ? (
          <EmptyState
            icon={<FlaskConical size={28} />}
            title="No lab tests yet"
            description="Tests ordered during a visit will appear here with their results."
          />
        ) : (
          <div className="lab-list">
            {labOrders.map((order) => {
              const flag = flagLabel(order);
              return (
                <div key={order.id} className="lab-row">
                  <div className="lab-row__head">
                    <strong className="lab-row__name">{order.test_name}</strong>
                    <span className={`lab-status lab-status--${order.status}`}>
                      {statusLabel(order.status)}
                    </span>
                    {flag && <span className={`lab-flag lab-flag--${order.flag}`}>{flag}</span>}
                  </div>
                  <div className="lab-row__meta">
                    <span>Reference: {referenceLabel(order)}</span>
                    <span>Result: {resultLabel(order)}</span>
                    <span>
                      Ordered {vitalDate(order.ordered_at)}
                      {order.ordered_by ? ` by Dr. ${order.ordered_by}` : ""}
                    </span>
                    {order.result_due_date && (
                      <span>Results required by {vitalDate(order.result_due_date)}</span>
                    )}
                    {order.resulted_at && <span>Resulted {vitalDate(order.resulted_at)}</span>}
                  </div>
                  {order.notes && <p className="vit-row__notes">{order.notes}</p>}
                  {order.result_notes && <p className="vit-row__notes">{order.result_notes}</p>}
                </div>
              );
            })}
          </div>
        )}
      </Card>

      {/* Health Records */}
      <Card className="card--fit">
        <div className="med-detail__header">
          <div className="med-detail__title-row">
            <div className="med-detail__avatar"><File size={24} /></div>
            <div>
              <h2 className="med-detail__title">{t("settings.healthRecords")}</h2>
              <p className="med-detail__subtitle">
                Lab reports, prescriptions, and X-rays — upload your own and share them with your doctor
              </p>
            </div>
          </div>
          {!showRecordForm && (
            <Button variant="secondary" onClick={() => { setRecordError(null); setShowRecordForm(true); }}>
              <Upload size={14} /> Upload record
            </Button>
          )}
        </div>

        {recordError && <p className="form-note form-note--error">{recordError}</p>}

        {showRecordForm && (
          <form className="visit-record-form" onSubmit={handleUploadRecord}>
            <div className="field">
              <label className="field__label" htmlFor="hr-doctor">Share with doctor *</label>
              <select
                id="hr-doctor"
                className="field__input"
                value={recordForm.doctor}
                onChange={(e) => setRecordForm({ ...recordForm, doctor: e.target.value })}
                required
              >
                <option value="">Select a doctor…</option>
                {linkedDoctors.map((doctor) => (
                  <option key={doctor.id} value={String(doctor.id)}>
                    {doctor.first_name || doctor.last_name
                      ? `Dr. ${[doctor.first_name, doctor.last_name].filter(Boolean).join(" ")}`
                      : doctor.email}
                    {doctor.specialties.length > 0 ? ` — ${doctor.specialties.join(", ")}` : ""}
                  </option>
                ))}
              </select>
              {linkedDoctors.length === 0 && (
                <p className="form-note">
                  You can share records with a doctor once you have an appointment with them.
                </p>
              )}
            </div>
            <div className="form__row">
              <div className="field">
                <label className="field__label" htmlFor="hr-title">Title *</label>
                <input
                  id="hr-title"
                  className="field__input"
                  type="text"
                  value={recordForm.title}
                  onChange={(e) => setRecordForm({ ...recordForm, title: e.target.value })}
                  placeholder="e.g. CBC panel — March 2026"
                  required
                />
              </div>
              <div className="field">
                <label className="field__label" htmlFor="hr-type">Type</label>
                <select
                  id="hr-type"
                  className="field__input"
                  value={recordForm.record_type}
                  onChange={(e) => setRecordForm({ ...recordForm, record_type: e.target.value })}
                >
                  {RECORD_TYPE_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </select>
              </div>
            </div>
            <div className="field">
              <label className="field__label" htmlFor="hr-desc">Description</label>
              <textarea
                id="hr-desc"
                className="field__input"
                rows={2}
                value={recordForm.description}
                onChange={(e) => setRecordForm({ ...recordForm, description: e.target.value })}
                placeholder="Optional notes…"
              />
            </div>
            <div className="field">
              <label className="field__label" htmlFor="hr-file">Document or image (PDF, JPG, PNG — max 15 MB)</label>
              <input
                id="hr-file"
                className="field__input"
                type="file"
                accept="application/pdf,image/*"
                onChange={(e) => setRecordFile(e.target.files?.[0] ?? null)}
              />
            </div>
            <div className="med-edit-actions">
              <Button type="submit" loading={recordSaving}>
                <Upload size={14} /> Share record
              </Button>
              <Button
                type="button"
                variant="secondary"
                onClick={() => {
                  setShowRecordForm(false);
                  setRecordForm(EMPTY_RECORD_FORM);
                  setRecordFile(null);
                  setRecordError(null);
                }}
              >
                <X size={14} /> Cancel
              </Button>
            </div>
          </form>
        )}

        {recordsLoading ? (
          <Skeleton lines={3} />
        ) : healthRecords.length === 0 ? (
          <EmptyState
            icon={<FileText size={28} />}
            title={t("settings.noRecords")}
            description={t("settings.noRecordsDesc")}
          />
        ) : (
          <div className="health-records-list">
            {healthRecords.map((record) => (
              <div key={record.id} className="health-record-item">
                <div className="health-record-item__info">
                  <span className="health-record-item__type">{record.record_type}</span>
                  <span className="health-record-item__title">{record.title}</span>
                  {record.description && <span className="health-record-item__desc">{record.description}</span>}
                  <span className="health-record-item__meta">
                    {record.doctor_name ? `Dr. ${record.doctor_name}` : "Not shared yet"}
                    {" · "}
                    {new Date(record.created_at).toLocaleDateString()}
                  </span>
                </div>
                <div className="health-record-item__actions">
                  {!record.file && (
                    <span className="health-record-item__date">No file attached</span>
                  )}
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
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
