import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { apiPost } from "../api/client";
import { Card, Button } from "../components/ui";

export function TrainingRequestScreen() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [audience, setAudience] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [contactName, setContactName] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  const [topic, setTopic] = useState("");
  const [startDate, setStartDate] = useState("");
  const [days, setDays] = useState(1);
  const [mode, setMode] = useState("");
  const [location, setLocation] = useState("");
  const [latitude, setLatitude] = useState<number | null>(null);
  const [longitude, setLongitude] = useState<number | null>(null);
  const [accuracy, setAccuracy] = useState<number | null>(null);
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function submit(e: any) {
    e.preventDefault();
    setSaving(true); setError("");
    try {
      await apiPost("/training/?action=create", {
        audience, company_name: companyName, contact_name: contactName,
        contact_email: contactEmail, contact_phone: contactPhone,
        training_topic: topic, preferred_start_date: startDate,
        preferred_days: days, delivery_mode: mode, location, notes,
        latitude, longitude, location_accuracy: accuracy,
      });
      navigate("/training/success");
    } catch (err: any) {
      setError(err?.message || t("training.failed"));
    } finally { setSaving(false); }
  }

  return (
    <div className="page admin-form-page">
      <div className="doctor-page-header">
        <div>
          <p className="doctor-eyebrow">{t("training.service")}</p>
          <h1>{t("training.requestTitle")}</h1>
          <p>{t("training.requestSubtitle")}</p>
        </div>
      </div>
      <Card className="admin-form-card">
        <form onSubmit={submit} className="admin-form-grid">
          <div className="admin-field">
            <label htmlFor="audience">{t("training.audience")}</label>
            <select id="audience" value={audience} onChange={(e:any)=>setAudience(e.target.value)} required>
              <option value="">{t("training.selectAudience")}</option>
              <option value="individual">{t("training.individual")}</option>
              <option value="company">{t("training.company")}</option>
            </select>
          </div>
          {audience === "company" && (
            <>
              <div className="admin-field"><label htmlFor="companyName">{t("training.companyName")}</label><input id="companyName" value={companyName} onChange={(e:any)=>setCompanyName(e.target.value)} required /></div>
              <div className="admin-field"><label htmlFor="contactName">{t("training.contactName")}</label><input id="contactName" value={contactName} onChange={(e:any)=>setContactName(e.target.value)} required /></div>
              <div className="admin-field"><label htmlFor="contactEmail">{t("training.contactEmail")}</label><input id="contactEmail" type="email" value={contactEmail} onChange={(e:any)=>setContactEmail(e.target.value)} required /></div>
              <div className="admin-field"><label htmlFor="contactPhone">{t("training.contactPhone")}</label><input id="contactPhone" value={contactPhone} onChange={(e:any)=>setContactPhone(e.target.value)} /></div>
            </>
          )}
          <div className="admin-field admin-field--wide"><label htmlFor="topic">{t("training.topic")}</label><input id="topic" value={topic} onChange={(e:any)=>setTopic(e.target.value)} required /></div>
          <div className="admin-field"><label htmlFor="startDate">{t("training.startDate")}</label><input id="startDate" type="date" value={startDate} onChange={(e:any)=>setStartDate(e.target.value)} required /></div>
          <div className="admin-field"><label htmlFor="days">{t("training.days")}</label><input id="days" type="number" min={1} max={30} value={days} onChange={(e:any)=>setDays(Number(e.target.value))} /></div>
          <div className="admin-field"><label htmlFor="mode">{t("training.mode")}</label>
            <select id="mode" value={mode} onChange={(e:any)=>setMode(e.target.value)} required>
              <option value="">{t("training.selectMode")}</option>
              <option value="online">{t("training.online")}</option>
              <option value="onsite">{t("training.onsite")}</option>
            </select>
          </div>
          {mode === "onsite" && (
            <div className="admin-field admin-field--wide">
              <label htmlFor="location">{t("training.location")}</label>
              <input id="location" value={location} readOnly required placeholder={t("training.locationPlaceholder")} />
              <div style={{ marginTop: 8 }}>
                <Button type="button" variant="secondary" onClick={() => {
                  if (!navigator.geolocation) { alert(t("training.geolocationUnsupported")); return; }
                  navigator.geolocation.getCurrentPosition(async (pos) => {
                    const lat = pos.coords.latitude;
                    const lng = pos.coords.longitude;
                    setLatitude(lat);
                    setLongitude(lng);
                    setAccuracy(pos.coords.accuracy);
                    try {
                      const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}`);
                      const data = await res.json();
                      setLocation(data.display_name || `${lat}, ${lng}`);
                    } catch {
                      setLocation(`${lat}, ${lng}`);
                    }
                  }, () => alert(t("training.locationFailed")));
                }}>{t("training.useCurrentLocation")}</Button>
              </div>
            </div>
          )}
          <div className="admin-field admin-field--wide"><label htmlFor="notes">{t("training.notes")}</label><textarea id="notes" value={notes} onChange={(e:any)=>setNotes(e.target.value)} /></div>
          {error && <p className="form-note form-note--error admin-field--wide">{error}</p>}
          <div className="admin-form-actions admin-field--wide">
            <Button type="submit" loading={saving}>{t("training.requestButton")}</Button>
          </div>
        </form>
      </Card>
    </div>
  );
}
