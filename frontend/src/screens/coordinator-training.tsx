import { useEffect, useState } from "react";
import { apiGet, apiPost } from "../api/client";
import { getCoordinatorDoctors } from "../api/coordinator";
import { Card, Button, EmptyState, Skeleton, ErrorState } from "../components/ui";

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
      const d = await getCoordinatorDoctors(new Date().toISOString().slice(0, 10));
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
      <div className="doctor-page-header">
        <div>
          <p className="doctor-eyebrow">Coordination center</p>
          <h1>Training requests</h1>
          <p>Review pending training requests and assign a specialist.</p>
        </div>
      </div>

      {error ? <ErrorState message={error} onRetry={load} /> :
       loading ? <Skeleton lines={6} /> :
       items.length === 0 ? <EmptyState title="No pending requests" description="Training requests will appear here." /> :
       <div style={{ display: "grid", gap: 12 }}>
         {items.map((t) => {
           const isSel = selected?.id === t.id;
           return (
             <Card key={t.id} style={{ borderLeft: "4px solid #f3a629" }}>
               <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                 <h2 style={{ margin: 0, fontSize: 18, color: "#17384a" }}>{t.training_topic}</h2>
                 <span style={{ padding: "4px 10px", borderRadius: 99, background: "#fff3db", color: "#a86200", fontSize: 11, fontWeight: 600, textTransform: "capitalize" }}>{t.status}</span>
               </div>
               <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 8, fontSize: 13, color: "#405563" }}>
                 <div><b style={{ color: "#82909d", fontSize: 11, textTransform: "uppercase", letterSpacing: ".04em" }}>Audience</b><div>{t.audience}{t.company_name ? ` (${t.company_name})` : ""}</div></div>
                 <div><b style={{ color: "#82909d", fontSize: 11, textTransform: "uppercase", letterSpacing: ".04em" }}>Duration</b><div>{t.preferred_days} day{t.preferred_days === 1 ? "" : "s"} from {new Date(t.preferred_start_date).toLocaleDateString()}</div></div>
                 <div><b style={{ color: "#82909d", fontSize: 11, textTransform: "uppercase", letterSpacing: ".04em" }}>Delivery</b><div>{t.delivery_mode}{t.location ? ` · ${t.location}` : ""}</div></div>
                 <div><b style={{ color: "#82909d", fontSize: 11, textTransform: "uppercase", letterSpacing: ".04em" }}>Patient</b><div>{t.patient.first_name} {t.patient.last_name} ({t.patient.email})</div></div>
               </div>
               {t.notes && <p style={{ marginTop: 8, fontSize: 12, color: "#82909d" }}>{t.notes}</p>}
               {isSel ? (
                 <div style={{ display: "grid", gap: 8, marginTop: 12, paddingTop: 12, borderTop: "1px solid #eef2f5" }}>
                   <select value={doctorId} onChange={(e:any)=>setDoctorId(e.target.value)} style={{ width: "100%", minHeight: 42, padding: "0 14px", border: "1px solid #c2e0df", borderRadius: 10, background: "#f0faf9", color: "#163C3C", font: "inherit", fontSize: 13 }}>
                     <option value="">Select specialist</option>
                     {doctors.filter((d:any)=>d.is_available).map((d:any)=><option key={d.id} value={d.id}>Dr. {d.name}</option>)}
                   </select>
                   <div style={{ display: "flex", gap: 8 }}>
                     <Button loading={saving} onClick={accept} disabled={!doctorId}>Proceed training</Button>
                     <Button variant="secondary" onClick={()=>{setSelected(null);setDoctorId("");}}>Cancel</Button>
                   </div>
                 </div>
               ) : (
                 <div style={{ marginTop: 12 }}>
                   <Button onClick={()=>setSelected(t)}>Accept & assign</Button>
                 </div>
               )}
             </Card>
           );
         })}
       </div>}
    </div>
  );
}
