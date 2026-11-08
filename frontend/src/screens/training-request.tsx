import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { apiPost } from "../api/client";
import { Card, Button, TextField } from "../components/ui";

export function TrainingRequestScreen() {
  const navigate = useNavigate();
  const [audience, setAudience] = useState("individual");
  const [companyName, setCompanyName] = useState("");
  const [contactName, setContactName] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  const [topic, setTopic] = useState("");
  const [startDate, setStartDate] = useState("");
  const [days, setDays] = useState(1);
  const [mode, setMode] = useState("online");
  const [location, setLocation] = useState("");
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
      });
      navigate("/training/success");
    } catch (err: any) {
      setError(err?.message || "Failed to submit request.");
    } finally { setSaving(false); }
  }

  return (
    <div className="page">
      <h1 className="page__title">Request training</h1>
      <Card>
        <form onSubmit={submit} style={{ display: "grid", gap: 12 }}>
          <label>Audience
            <select value={audience} onChange={(e:any)=>setAudience(e.target.value)} style={{ width: "100%" }}>
              <option value="individual">Individual</option>
              <option value="company">Company</option>
            </select>
          </label>
          {audience === "company" && (
            <>
              <TextField id="companyName" label="Company name" value={companyName} onChange={(e:any)=>setCompanyName(e.target.value)} required />
              <TextField id="contactName" label="Contact name" value={contactName} onChange={(e:any)=>setContactName(e.target.value)} required />
              <TextField id="contactEmail" label="Contact email" type="email" value={contactEmail} onChange={(e:any)=>setContactEmail(e.target.value)} required />
              <TextField id="contactPhone" label="Contact phone" value={contactPhone} onChange={(e:any)=>setContactPhone(e.target.value)} />
            </>
          )}
          <TextField id="topic" label="Training topic" value={topic} onChange={(e:any)=>setTopic(e.target.value)} required />
          <TextField id="startDate" label="Preferred start date" type="date" value={startDate} onChange={(e:any)=>setStartDate(e.target.value)} required />
          <label>Number of days
            <input type="number" min={1} max={30} value={days} onChange={(e:any)=>setDays(Number(e.target.value))} style={{ width: "100%" }} />
          </label>
          <label>Delivery mode
            <select value={mode} onChange={(e:any)=>setMode(e.target.value)} style={{ width: "100%" }}>
              <option value="online">Online meeting</option>
              <option value="onsite">Onsite</option>
            </select>
          </label>
          {mode === "onsite" && (
            <TextField id="location" label="Location" value={location} onChange={(e:any)=>setLocation(e.target.value)} required placeholder="Enter location" />
          )}
          <label>Notes
            <textarea value={notes} onChange={(e:any)=>setNotes(e.target.value)} style={{ width: "100%" }} />
          </label>
          {error && <p className="error">{error}</p>}
          <Button type="submit" loading={saving}>Request training</Button>
        </form>
      </Card>
    </div>
  );
}
