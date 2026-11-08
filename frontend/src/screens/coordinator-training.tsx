import { useEffect, useState } from "react";
import { apiGet, apiPost } from "../api/client";
import { getCoordinatorDoctors } from "../api/coordinator";
import { Card, Button, EmptyState, Skeleton, ErrorState, TextField } from "../components/ui";

export function CoordinatorTrainingScreen() {
  const [items, setItems] = useState<any[]>([]);
  const [doctors, setDoctors] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState<any>(null);
  const [doctorId, setDoctorId] = useState("");
  const [saving, setSaving] = useState(false);

  async function load() {
    setLoading(true); setError("");
    try {
      const res = await apiGet<any[]>("/training/?status=pending");
      setItems(res.data ?? []);
      const d = await getCoordinatorDoctors(new Date().toISOString().slice(0,10));
      setDoctors(d.data ?? []);
    } catch (e: any) { setError(e?.message || "Failed."); }
    finally { setLoading(false); }
  }
  useEffect(() => { void load(); }, []);

  async function accept() {
    if (!selected || !doctorId) return;
    setSaving(true);
    try {
      await apiPost(`/training/?action=accept&id=${selected.id}`, { doctor_id: Number(doctorId) });
      setSelected(null); setDoctorId("");
      await load();
    } catch (e: any) { alert(e?.message || "Failed."); }
    finally { setSaving(false); }
  }

  return (
    <div className="page">
      <h1 className="page__title">Training requests</h1>
      {error ? <ErrorState message={error} onRetry={load} /> :
       loading ? <Skeleton lines={6} /> :
       items.length === 0 ? <EmptyState title="No pending requests" description="Training requests will appear here." /> :
       <div style={{ display: "grid", gap: 12 }}>
         {items.map((t) => (
           <Card key={t.id}>
             <h3>{t.training_topic}</h3>
             <p>{t.audience === "company" ? t.company_name : "Individual"} · {t.preferred_days} day(s) from {new Date(t.preferred_start_date).toLocaleDateString()}</p>
             <p>Delivery: {t.delivery_mode}{t.location ? ` · ${t.location}` : ""}</p>
             <p>Patient: {t.patient.first_name} {t.patient.last_name} ({t.patient.email})</p>
             {selected?.id === t.id ? (
               <div style={{ display: "grid", gap: 8, marginTop: 8 }}>
                 <select value={doctorId} onChange={(e:any)=>setDoctorId(e.target.value)} style={{ width: "100%" }}>
                   <option value="">Select specialist</option>
                   {doctors.filter((d:any)=>d.is_available).map((d:any)=><option key={d.id} value={d.id}>Dr. {d.name}</option>)}
                 </select>
                 <Button loading={saving} onClick={accept} disabled={!doctorId}>Proceed training</Button>
                 <Button variant="secondary" onClick={()=>{setSelected(null);setDoctorId("");}}>Cancel</Button>
               </div>
             ) : (
               <Button onClick={()=>setSelected(t)}>Accept & assign</Button>
             )}
           </Card>
         ))}
       </div>}
    </div>
  );
}
