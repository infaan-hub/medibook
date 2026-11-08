import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { apiPost } from "../api/client";
import { Card, Button } from "../components/ui";

export function TrainingRequestScreen() {
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
      setError(err?.message || "Failed to submit request.");
    } finally { setSaving(false); }
  }

  return (
    <div className="page admin-form-page">
      <div className="doctor-page-header">
        <div>
          <p className="doctor-eyebrow">Training service</p>
          <h1>Request training</h1>
          <p>Fill in the details and a coordinator will assign a specialist.</p>
        </div>
      </div>
      <Card className="admin-form-card">
        <form onSubmit={submit} className="admin-form-grid">
          <div className="admin-field">
            <label htmlFor="audience">Audience</label>
            <select id="audience" value={audience} onChange={(e:any)=>setAudience(e.target.value)} required>
              <option value="">Select audience</option>
              <option value="individual">Individual</option>
              <option value="company">Company</option>
            </select>
          </div>
          {audience === "company" && (
            <>
              <div className="admin-field"><label htmlFor="companyName">Company name</label><input id="companyName" value={companyName} onChange={(e:any)=>setCompanyName(e.target.value)} required /></div>
              <div className="admin-field"><label htmlFor="contactName">Contact name</label><input id="contactName" value={contactName} onChange={(e:any)=>setContactName(e.target.value)} required /></div>
              <div className="admin-field"><label htmlFor="contactEmail">Contact email</label><input id="contactEmail" type="email" value={contactEmail} onChange={(e:any)=>setContactEmail(e.target.value)} required /></div>
              <div className="admin-field"><label htmlFor="contactPhone">Contact phone</label><input id="contactPhone" value={contactPhone} onChange={(e:any)=>setContactPhone(e.target.value)} /></div>
            </>
          )}
          <div className="admin-field admin-field--wide"><label htmlFor="topic">Training topic</label><input id="topic" value={topic} onChange={(e:any)=>setTopic(e.target.value)} required /></div>
          <div className="admin-field"><label htmlFor="startDate">Preferred start date</label><input id="startDate" type="date" value={startDate} onChange={(e:any)=>setStartDate(e.target.value)} required /></div>
          <div className="admin-field"><label htmlFor="days">Number of days</label><input id="days" type="number" min={1} max={30} value={days} onChange={(e:any)=>setDays(Number(e.target.value))} /></div>
          <div className="admin-field"><label htmlFor="mode">Delivery mode</label>
            <select id="mode" value={mode} onChange={(e:any)=>setMode(e.target.value)} required>
              <option value="">Select delivery mode</option>
              <option value="online">Online meeting</option>
              <option value="onsite">Onsite</option>
            </select>
          </div>
          {mode === "onsite" && (
            <div className="admin-field admin-field--wide">
              <label htmlFor="location">Location</label>
              <input id="location" value={location} readOnly required placeholder="Use current location to capture coordinates" />
              <div style={{ marginTop: 8 }}>
                <Button type="button" variant="secondary" onClick={() => {
                  if (!navigator.geolocation) { alert("Geolocation not supported"); return; }
                  navigator.geolocation.getCurrentPosition((pos) => {
                    setLocation(`${pos.coords.latitude}, ${pos.coords.longitude}`);
                    setLatitude(pos.coords.latitude);
                    setLongitude(pos.coords.longitude);
                    setAccuracy(pos.coords.accuracy);
                  }, () => alert("Unable to get location"));
                }}>Use current location</Button>
              </div>
            </div>
          )}
          <div className="admin-field admin-field--wide"><label htmlFor="notes">Notes</label><textarea id="notes" value={notes} onChange={(e:any)=>setNotes(e.target.value)} /></div>
          {error && <p className="form-note form-note--error admin-field--wide">{error}</p>}
          <div className="admin-form-actions admin-field--wide">
            <Button type="submit" loading={saving}>Request training</Button>
          </div>
        </form>
      </Card>
    </div>
  );
}
