import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { apiPost } from "../api/client";
import { Card, Button } from "../components/ui";

export function PsychotherapyRequestScreen() {
  const navigate = useNavigate();
  const [sessionMode, setSessionMode] = useState("");
  const [preferredDate, setPreferredDate] = useState("");
  const [urgency, setUrgency] = useState("routine");
  const [confidentiality, setConfidentiality] = useState(false);
  const [gender, setGender] = useState("any");
  const [language, setLanguage] = useState("english");
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
      setError(err?.message || "Failed to submit request.");
    } finally { setSaving(false); }
  }

  return (
    <div className="page admin-form-page">
      <div className="doctor-page-header">
        <div>
          <p className="doctor-eyebrow">Psychotherapy service</p>
          <h1>Request psychotherapy</h1>
          <p>Fill in the details and a coordinator will assign a psychologist.</p>
        </div>
      </div>
      <Card className="admin-form-card">
        <form onSubmit={submit} className="admin-form-grid">
          <div className="admin-field">
            <label htmlFor="sessionMode">Session mode</label>
            <select id="sessionMode" value={sessionMode} onChange={(e:any)=>setSessionMode(e.target.value)} required>
              <option value="">Select session mode</option>
              <option value="in_person">In-person session</option>
              <option value="online">Online session</option>
            </select>
          </div>
          <div className="admin-field">
            <label htmlFor="preferredDate">Preferred start date</label>
            <input id="preferredDate" type="date" value={preferredDate} onChange={(e:any)=>setPreferredDate(e.target.value)} required />
          </div>
          <div className="admin-field">
            <label htmlFor="urgency">Urgency</label>
            <select id="urgency" value={urgency} onChange={(e:any)=>setUrgency(e.target.value)} required>
              <option value="routine">Routine</option>
              <option value="soon">Soon</option>
              <option value="urgent">Urgent</option>
            </select>
          </div>
          <div className="admin-field">
            <label htmlFor="gender">Gender preference</label>
            <select id="gender" value={gender} onChange={(e:any)=>setGender(e.target.value)} required>
              <option value="any">Any gender</option>
              <option value="male">Male</option>
              <option value="female">Female</option>
            </select>
          </div>
          <div className="admin-field">
            <label htmlFor="language">Language preference</label>
            <select id="language" value={language} onChange={(e:any)=>setLanguage(e.target.value)} required>
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
              I understand psychotherapy is confidential and agree to the confidentiality notice.
            </label>
          </div>
          <div className="admin-field admin-field--wide"><label htmlFor="notes">Notes (optional)</label><textarea id="notes" value={notes} onChange={(e:any)=>setNotes(e.target.value)} /></div>
          {error && <p className="form-note form-note--error admin-field--wide">{error}</p>}
          <div className="admin-form-actions admin-field--wide">
            <Button type="submit" loading={saving}>Request psychotherapy</Button>
          </div>
        </form>
      </Card>
    </div>
  );
}