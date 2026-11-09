import { useEffect, useMemo, useState } from "react";
import { apiGet, apiPost } from "../api/client";
import { getCoordinatorDoctors } from "../api/coordinator";
import { downloadTrainingReport, viewTrainingReport } from "../api/reports";
import { Card, Button, EmptyState, Skeleton, ErrorState } from "../components/ui";

const FILTERS = [
  { key: "all", label: "All" },
  { key: "pending", label: "Pending" },
  { key: "active", label: "Active" },
  { key: "completed", label: "Completed" },
  { key: "cancelled", label: "Cancelled" },
] as const;

type FilterKey = (typeof FILTERS)[number]["key"];

const statusTone = (status: string) => {
  if (status === "completed") return "#0a9f94";
  if (status === "pending") return "#f3a629";
  if (status === "accepted" || status === "scheduled") return "#7c3aed";
  if (status === "in_progress") return "#2563eb";
  if (status === "cancelled") return "#a9b6bf";
  return "#a9b6bf";
};

const matchesFilter = (status: string, filter: FilterKey): boolean => {
  if (filter === "all") return true;
  if (filter === "active") return status === "accepted" || status === "in_progress" || status === "scheduled";
  return status === filter;
};

export function CoordinatorTrainingScreen() {
  const [items, setItems] = useState<any[]>([]);
  const [doctors, setDoctors] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState<any>(null);
  const [doctorId, setDoctorId] = useState("");
  const [saving, setSaving] = useState(false);
  const [filter, setFilter] = useState<FilterKey>("all");
  const [reporting, setReporting] = useState<number | null>(null);

  async function load() {
    setLoading(true); setError("");
    try {
      const res = await apiGet<any[]>("/training/");
      setItems(res.data ?? []);
      const d = await getCoordinatorDoctors(new Date().toISOString().slice(0, 10));
      setDoctors(d.data ?? []);
    } catch (e: any) { setError(e?.message || "Failed."); }
    finally { setLoading(false); }
  }
  useEffect(() => { void load(); }, []);

  const visible = useMemo(() => {
    const order: Record<string, number> = { pending: 0, accepted: 1, in_progress: 2, completed: 3, cancelled: 4 };
    return items
      .filter((training) => matchesFilter(training.status, filter))
      .sort((a, b) => (order[a.status] ?? 9) - (order[b.status] ?? 9) || Number(b.id) - Number(a.id));
  }, [items, filter]);

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

  async function downloadReport(t: any) {
    setReporting(t.id);
    try { await downloadTrainingReport(t.id); }
    catch (e: any) { alert(e?.message || "Unable to generate the training report."); }
    finally { setReporting(null); }
  }

  async function viewReport(t: any) {
    setReporting(t.id);
    try { await viewTrainingReport(t.id); }
    catch (e: any) { alert(e?.message || "Unable to generate the training report."); }
    finally { setReporting(null); }
  }

  return (
    <div className="page">
      <div className="doctor-page-header">
        <div>
          <p className="doctor-eyebrow">Coordination center</p>
          <h1>Training requests</h1>
          <p>Review requests, assign a specialist and generate the PDF training report.</p>
        </div>
      </div>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 16 }}>
        {FILTERS.map((option) => {
          const active = filter === option.key;
          const count = items.filter((training) => matchesFilter(training.status, option.key)).length;
          return (
            <button
              key={option.key}
              type="button"
              onClick={() => setFilter(option.key)}
              style={{
                minHeight: 34,
                padding: "0 14px",
                borderRadius: 999,
                border: `1px solid ${active ? "#09a99e" : "#c2e0df"}`,
                background: active ? "#09a99e" : "#ffffff",
                color: active ? "#ffffff" : "#405563",
                font: "inherit",
                fontSize: 12,
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              {option.label} ({count})
            </button>
          );
        })}
      </div>

      {error ? <ErrorState message={error} onRetry={load} /> :
       loading ? <Skeleton lines={6} /> :
       visible.length === 0 ? <EmptyState title="No training requests" description="Training requests that match this filter will appear here." /> :
       <div style={{ display: "grid", gap: 12 }}>
         {visible.map((t) => {
           const isSel = selected?.id === t.id;
           const tone = statusTone(t.status);
           return (
             <Card key={t.id} style={{ borderLeft: `4px solid ${tone}` }}>
               <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                 <h2 style={{ margin: 0, fontSize: 18, color: "#17384a" }}>{t.training_topic}</h2>
                 <span style={{ padding: "4px 10px", borderRadius: 99, background: tone + "1a", color: tone, fontSize: 11, fontWeight: 600, textTransform: "capitalize" }}>{t.status.replace("_", " ")}</span>
               </div>
               <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 8, fontSize: 13, color: "#405563" }}>
                 <div><b style={{ color: "#82909d", fontSize: 11, textTransform: "uppercase", letterSpacing: ".04em" }}>Audience</b><div>{t.audience}{t.company_name ? ` (${t.company_name})` : ""}</div></div>
                 <div><b style={{ color: "#82909d", fontSize: 11, textTransform: "uppercase", letterSpacing: ".04em" }}>Duration</b><div>{t.preferred_days} day{t.preferred_days === 1 ? "" : "s"} from {new Date(t.preferred_start_date).toLocaleDateString()}</div></div>
                 <div><b style={{ color: "#82909d", fontSize: 11, textTransform: "uppercase", letterSpacing: ".04em" }}>Delivery</b><div>{t.delivery_mode}{t.location ? ` · ${t.location}` : ""}</div></div>
                 <div><b style={{ color: "#82909d", fontSize: 11, textTransform: "uppercase", letterSpacing: ".04em" }}>Patient</b><div>{t.patient.first_name} {t.patient.last_name} ({t.patient.email})</div></div>
                 {t.doctor?.user && <div><b style={{ color: "#82909d", fontSize: 11, textTransform: "uppercase", letterSpacing: ".04em" }}>Specialist</b><div>Dr. {t.doctor.user.first_name} {t.doctor.user.last_name}</div></div>}
               </div>
               {t.notes && <p style={{ marginTop: 8, fontSize: 12, color: "#82909d" }}>{t.notes}</p>}
               {t.status === "pending" && (isSel ? (
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
               ))}
               <div style={{ display: "flex", gap: 8, marginTop: 12, paddingTop: 12, borderTop: "1px solid #eef2f5", flexWrap: "wrap" }}>
                 <Button variant="secondary" loading={reporting === t.id} onClick={() => viewReport(t)}>View report</Button>
                 <Button loading={reporting === t.id} onClick={() => downloadReport(t)}>Download PDF</Button>
               </div>
             </Card>
           );
         })}
       </div>}
    </div>
  );
}
