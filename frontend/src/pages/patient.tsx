/**
 * PHASE 6 — Patient settings (§55): medical & emergency details.
 * Edits the extended /api/patients/profile/ record (backend slice B2).
 * Account fields (name/phone/email) and password live on the Profile screen.
 */

import { useCallback, useEffect, useState, type ChangeEvent, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { ApiError } from "../api/client";
import { getPatientProfile, updatePatientProfile } from "../api/patients";
import type { Gender, PatientProfile } from "../api/types";
import { Button, Card, ErrorState, Skeleton, TextField } from "../components/ui";
import { useToast } from "../state/app-context";

const GENDERS: { value: Gender; label: string }[] = [
  { value: "", label: "Prefer not to say" },
  { value: "male", label: "Male" },
  { value: "female", label: "Female" },
  { value: "other", label: "Other" },
];

function fieldErrors(error: unknown): Record<string, string> {
  if (error instanceof ApiError) {
    return Object.fromEntries(
      Object.entries(error.errors).map(([field, messages]) => [
        field,
        messages[0] ?? "Invalid value.",
      ])
    );
  }
  return {};
}

/** Select styled exactly like TextField (shares the .field classes). */
function SelectField({
  id,
  label,
  value,
  options,
  error,
  onChange,
}: {
  id: string;
  label: string;
  value: Gender;
  options: { value: Gender; label: string }[];
  error?: string;
  onChange: (event: ChangeEvent<HTMLSelectElement>) => void;
}) {
  return (
    <div className="field">
      <label className="field__label" htmlFor={id}>
        {label}
      </label>
      <select
        id={id}
        className={`field__input${error ? " field__input--error" : ""}`}
        aria-invalid={error ? true : undefined}
        value={value}
        onChange={onChange}
      >
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
      {error && (
        <p className="field__error" id={`${id}-error`} role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

/** Textarea styled exactly like TextField (shares the .field classes). */
function TextAreaField({
  id,
  label,
  value,
  rows = 3,
  hint,
  error,
  placeholder,
  onChange,
}: {
  id: string;
  label: string;
  value: string;
  rows?: number;
  hint?: string;
  error?: string;
  placeholder?: string;
  onChange: (event: ChangeEvent<HTMLTextAreaElement>) => void;
}) {
  return (
    <div className="field">
      <label className="field__label" htmlFor={id}>
        {label}
      </label>
      <textarea
        id={id}
        rows={rows}
        placeholder={placeholder}
        className={`field__input${error ? " field__input--error" : ""}`}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${id}-error` : hint ? `${id}-hint` : undefined}
        value={value}
        onChange={onChange}
      />
      {hint && !error && (
        <p className="field__hint" id={`${id}-hint`}>
          {hint}
        </p>
      )}
      {error && (
        <p className="field__error" id={`${id}-error`} role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

/* ---------------- Settings screen (§55 — patient medical & emergency details) ---------------- */

interface SettingsForm {
  date_of_birth: string;
  gender: Gender;
  address: string;
  city: string;
  emergency_contact_name: string;
  emergency_contact_phone: string;
  blood_group: string;
  allergies: string;
  medical_history: string;
}

function toForm(profile: PatientProfile): SettingsForm {
  return {
    date_of_birth: profile.date_of_birth ?? "",
    gender: profile.gender,
    address: profile.address,
    city: profile.city,
    emergency_contact_name: profile.emergency_contact_name,
    emergency_contact_phone: profile.emergency_contact_phone,
    blood_group: profile.blood_group,
    allergies: profile.allergies,
    medical_history: profile.medical_history,
  };
}

export function SettingsScreen() {
  const { notify } = useToast();
  const [form, setForm] = useState<SettingsForm | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  const load = useCallback(() => {
    setLoadError(null);
    setForm(null);
    getPatientProfile()
      .then((envelope) => setForm(toForm(envelope.data)))
      .catch(() => setLoadError("Could not load your medical details."));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  function update<K extends keyof SettingsForm>(key: K, value: SettingsForm[K]) {
    setForm((current) => (current === null ? current : { ...current, [key]: value }));
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!form) return;
    setSaving(true);
    setErrors({});
    try {
      const envelope = await updatePatientProfile({
        date_of_birth: form.date_of_birth || null,
        gender: form.gender,
        address: form.address,
        city: form.city,
        emergency_contact_name: form.emergency_contact_name,
        emergency_contact_phone: form.emergency_contact_phone,
        blood_group: form.blood_group,
        allergies: form.allergies,
        medical_history: form.medical_history,
      });
      setForm(toForm(envelope.data));
      notify("success", "Medical details saved.");
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
      <div className="page">
        <h1 className="page__title">Medical details</h1>
        <ErrorState message={loadError} onRetry={load} />
      </div>
    );
  }

  return (
    <div className="page">
      <h1 className="page__title">Medical details</h1>
      <p className="page__subtitle">
        Shared with doctors during your visits. Name, phone and password live in{" "}
        <Link to="/profile">Profile</Link>.
      </p>

      <Card>
        {form === null ? (
          <Skeleton lines={6} />
        ) : (
          <form className="form" onSubmit={onSubmit} noValidate>
            <div className="form__row">
              <TextField
                id="settings-dob"
                label="Date of birth"
                type="date"
                value={form.date_of_birth}
                error={errors.date_of_birth}
                onChange={(event) => update("date_of_birth", event.target.value)}
              />
              <SelectField
                id="settings-gender"
                label="Gender"
                value={form.gender}
                options={GENDERS}
                error={errors.gender}
                onChange={(event) => update("gender", event.target.value as Gender)}
              />
            </div>
            <div className="form__row">
              <TextField
                id="settings-blood"
                label="Blood group"
                placeholder="e.g. O+"
                value={form.blood_group}
                error={errors.blood_group}
                onChange={(event) => update("blood_group", event.target.value)}
              />
              <TextField
                id="settings-city"
                label="City"
                placeholder="e.g. Colombo"
                value={form.city}
                error={errors.city}
                onChange={(event) => update("city", event.target.value)}
              />
            </div>
            <TextField
              id="settings-address"
              label="Address"
              value={form.address}
              error={errors.address}
              onChange={(event) => update("address", event.target.value)}
            />
            <div className="form__row">
              <TextField
                id="settings-ec-name"
                label="Emergency contact name"
                value={form.emergency_contact_name}
                error={errors.emergency_contact_name}
                onChange={(event) => update("emergency_contact_name", event.target.value)}
              />
              <TextField
                id="settings-ec-phone"
                label="Emergency contact phone"
                type="tel"
                placeholder="+94 …"
                value={form.emergency_contact_phone}
                error={errors.emergency_contact_phone}
                onChange={(event) => update("emergency_contact_phone", event.target.value)}
              />
            </div>
            <TextAreaField
              id="settings-allergies"
              label="Allergies"
              rows={2}
              hint="One per line, or leave empty."
              value={form.allergies}
              error={errors.allergies}
              onChange={(event) => update("allergies", event.target.value)}
            />
            <TextAreaField
              id="settings-history"
              label="Medical history"
              rows={4}
              hint="Conditions, surgeries, medication — anything a doctor should know."
              value={form.medical_history}
              error={errors.medical_history}
              onChange={(event) => update("medical_history", event.target.value)}
            />
            <Button type="submit" loading={saving}>
              Save changes
            </Button>
          </form>
        )}
      </Card>
    </div>
  );
}
