import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { apiGet } from "../api/client";
import { Card, Button, Badge, EmptyState, Skeleton, ErrorState } from "../components/ui";

export function TrainingScreen() {
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  async function load() {
    setLoading(true); setError("");
    try {
      const res = await apiGet<any[]>("/training/");
      setItems(res.data ?? []);
    } catch (e: any) {
      setError(e?.message || "Failed to load trainings.");
    } finally { setLoading(false); }
  }
  useEffect(() => { void load(); }, []);

  const active = items.find((t) => ["pending","accepted","scheduled","in_progress"].includes(t.status));

  return (
    <div className="page">
      <div className="doctor-page-header">
        <div>
          <p className="doctor-eyebrow">Training service</p>
          <h1>My trainings</h1>
          <p>Track your training requests and session progress.</p>
        </div>
        <div className="doctor-header-actions">
          {!active && <Link to="/training/request"><Button>Request training</Button></Link>}
        </div>
      </div>

      {error ? <ErrorState message={error} onRetry={load} /> :
       loading ? <Skeleton lines={6} /> :
       items.length === 0 ? <EmptyState title="No training requests" description="Request a training to get started." /> :
       <div style={{ display: "grid", gap: 12 }}>
         {items.map((t) => {
           const statusColor = t.status === "completed" ? "#0a9f94" : t.status === "pending" ? "#f3a629" : "#7c3aed";
           return (
             <Card key={t.id} style={{ borderLeft: `4px solid ${statusColor}` }}>
               <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                 <h2 style={{ margin: 0, fontSize: 18, color: "#17384a" }}>{t.training_topic}</h2>
                 <Badge status={t.status as any} />
               </div>
               <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 8, fontSize: 13, color: "#405563" }}>
                 <div><b style={{ color: "#82909d", fontSize: 11, textTransform: "uppercase", letterSpacing: ".04em" }}>Audience</b><div>{t.audience}{t.company_name ? ` (${t.company_name})` : ""}</div></div>
                 <div><b style={{ color: "#82909d", fontSize: 11, textTransform: "uppercase", letterSpacing: ".04em" }}>Preferred start</b><div>{new Date(t.preferred_start_date).toLocaleDateString()} · {t.preferred_days} day{t.preferred_days === 1 ? "" : "s"}</div></div>
                 <div><b style={{ color: "#82909d", fontSize: 11, textTransform: "uppercase", letterSpacing: ".04em" }}>Delivery</b><div>{t.delivery_mode}{t.location ? ` · ${t.location}` : ""}</div></div>
                 {t.doctor && <div><b style={{ color: "#82909d", fontSize: 11, textTransform: "uppercase", letterSpacing: ".04em" }}>Specialist</b><div>Dr. {t.doctor.user.first_name} {t.doctor.user.last_name}</div></div>}
               </div>
               {t.sessions?.length > 0 && (
                 <div style={{ marginTop: 10, paddingTop: 10, borderTop: "1px solid #eef2f5", fontSize: 12, color: "#82909d" }}>
                   <b>Sessions:</b> {t.sessions.map((s:any) => `#${s.session_number} ${s.status}`).join(" · ")}
                 </div>
               )}
               {t.notes && <p style={{ marginTop: 8, fontSize: 12, color: "#82909d" }}>{t.notes}</p>}
             </Card>
           );
         })}
       </div>}
    </div>
  );
}
