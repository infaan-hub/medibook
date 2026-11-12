import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { apiPost } from "../api/client";
import { Card, Button } from "../components/ui";

export function PsychotherapyRequestScreen() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [sessionMode, setSessionMode] = useState("");
  const [preferredDate, setPreferredDate] = useState("");
  const [urgency, setUrgency] = useState("");
  const [confidentiality, setConfidentiality] = useState(false);
  const [gender, setGender] = useState("");
  const [language, setLanguage] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function submit(e: any) {
    e.preventDefault();
    setSaving(true); setError("");
    try {
      await apiPost("/psychotherapy/?action=create", {
        session_mode: sessionMode,
        preferred_start_date: preferredDate,
        urgency,
        confidentiality_accepted: confidentiality,
        gender_preference: gender,
        language_preference: language,
        notes,
      });
      navigate("/psychotherapy/success");
    } catch (err: any) {
      setError(err?.message || t("psychotherapy.failed"));
    } finally { setSaving(false); }
  }

  return (
    <div className="page admin-form-page">
      <div className="doctor-page-header">
        <div>
          <p className="doctor-eyebrow">{t("psychotherapy.service")}</p>
          <h1>{t("psychotherapy.requestTitle")}</h1>
          <p>{t("psychotherapy.requestSubtitle")}</p>
        </div>
      </div>
      <Card className="admin-form-card">
        <form onSubmit={submit} className="admin-form-grid">
          <div className="admin-field">
            <label htmlFor="sessionMode">{t("psychotherapy.sessionMode")}</label>
            <select id="sessionMode" value={sessionMode} onChange={(e:any)=>setSessionMode(e.target.value)} required>
              <option value="">{t("psychotherapy.selectSessionMode")}</option>
              <option value="in_person">{t("psychotherapy.inPerson")}</option>
              <option value="online">{t("psychotherapy.online")}</option>
            </select>
          </div>
          <div className="admin-field">
            <label htmlFor="preferredDate">{t("psychotherapy.preferredDate")}</label>
            <input id="preferredDate" type="date" min={new Date().toISOString().slice(0, 10)} value={preferredDate} onChange={(e:any)=>setPreferredDate(e.target.value)} required />
          </div>
          <div className="admin-field">
            <label htmlFor="urgency">{t("psychotherapy.urgency")}</label>
            <select id="urgency" value={urgency} onChange={(e:any)=>setUrgency(e.target.value)} required>
              <option value="">{t("psychotherapy.selectUrgency")}</option>
              <option value="routine">{t("psychotherapy.routine")}</option>
              <option value="soon">{t("psychotherapy.soon")}</option>
              <option value="urgent">{t("psychotherapy.urgent")}</option>
            </select>
          </div>
          <div className="admin-field">
            <label htmlFor="gender">{t("psychotherapy.genderPreference")}</label>
            <select id="gender" value={gender} onChange={(e:any)=>setGender(e.target.value)} required>
              <option value="">{t("psychotherapy.selectGender")}</option>
              <option value="any">{t("psychotherapy.anyGender")}</option>
              <option value="male">{t("psychotherapy.male")}</option>
              <option value="female">{t("psychotherapy.female")}</option>
            </select>
          </div>
          <div className="admin-field">
            <label htmlFor="language">{t("psychotherapy.languagePreference")}</label>
            <select id="language" value={language} onChange={(e:any)=>setLanguage(e.target.value)} required>
              <option value="">{t("psychotherapy.selectLanguage")}</option>
              <option value="english">English</option>
              <option value="swahili">Swahili</option>
              <option value="spanish">Spanish</option>
              <option value="french">French</option>
              <option value="german">German</option>
            </select>
          </div>
          <div className="admin-field admin-field--wide">
            <label>
              <input type="checkbox" checked={confidentiality} onChange={(e:any)=>setConfidentiality(e.target.checked)} required />{" "}
              {t("psychotherapy.confidentiality")}
            </label>
          </div>
          <div className="admin-field admin-field--wide"><label htmlFor="notes">{t("psychotherapy.notesOptional")}</label><textarea id="notes" value={notes} onChange={(e:any)=>setNotes(e.target.value)} /></div>
          {error && <p className="form-note form-note--error admin-field--wide">{error}</p>}
          <div className="admin-form-actions admin-field--wide">
            <Button type="submit" loading={saving}>{t("psychotherapy.requestButton")}</Button>
          </div>
        </form>
      </Card>
    </div>
  );
}
