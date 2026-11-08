import { useCallback, useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Activity, RefreshCw, Search, UserRound, ArrowLeft } from "lucide-react";
import { Card, EmptyState, ErrorState, Skeleton } from "../components/ui";
import { useToast } from "../state/app-context";
import { useRealtimeSync } from "../realtime/socket";
import { getCoordinatorAppointments, getCoordinatorDoctors, getCoordinatorOverview, getCoordinatorPatientHistory, getCoordinatorPatients, reassignCoordinatorAppointment, type CoordinatorAppointment, type CoordinatorDoctor, type CoordinatorHistory, type CoordinatorPatient, type CoordinatorStats } from "../api/coordinator";
import { CoordinatorDashboard } from "./coordinator-dashboard";
import { CoordinatorDoctors } from "./coordinator-doctors";
import { CoordinatorAppointments } from "./coordinator-appointments";

const cardStyle: React.CSSProperties = { padding: 20, border: "1px solid var(--border-color, #e5e7eb)", borderRadius: 16, background: "var(--surface, #fff)" };
const gridStyle: React.CSSProperties = { display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(210px,1fr))", gap: 16, margin: "20px 0" };
const headingStyle: React.CSSProperties = { display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap", marginBottom: 20 };
const muted: React.CSSProperties = { color: "var(--muted, #64748b)" };
function errorText(e: unknown) { return e instanceof Error ? e.message : "Unable to load data."; }
function formatDate(date: string) { return new Date(`${date.slice(0,10)}T00:00:00`).toLocaleDateString(undefined,{weekday:"short",month:"short",day:"numeric",year:"numeric"}); }

function labelType(type: string) { return type === "NORMAL" ? "Hospital appointment" : type === "EMERGENCY" ? "Emergency" : "Home service"; }
function labelStatus(status: string) { return status.replaceAll("_"," ").replace(/^./, (c) => c.toUpperCase()); }

export function CoordinatorScreen() {
  const location = useLocation(); const navigate = useNavigate(); const { notify } = useToast();
  const path = location.pathname; const query = new URLSearchParams(location.search);
  const section = path.includes("/doctors") ? "doctors" : path.includes("/appointment") ? "appointments" : path.includes("/emergency") ? "emergency" : path.includes("/patient") ? "patients" : "dashboard";
  const selectedPatientId = Number(query.get("patient")) || null;
  const [stats,setStats]=useState<CoordinatorStats|null>(null); const [doctors,setDoctors]=useState<CoordinatorDoctor[]>([]); const [appointments,setAppointments]=useState<CoordinatorAppointment[]>([]); const [patients,setPatients]=useState<CoordinatorPatient[]>([]); const [history,setHistory]=useState<CoordinatorHistory|null>(null);
  const [date,setDate]=useState(new Date().toISOString().slice(0,10)); const [search,setSearch]=useState(""); const [error,setError]=useState<string|null>(null); const [loading,setLoading]=useState(true); const [savingId,setSavingId]=useState<number|null>(null); const [targets,setTargets]=useState<Record<number,number>>({});

  const load = useCallback(async () => {
    setError(null); setLoading(true);
    try {
      if(section==="dashboard") { const [overview, recent] = await Promise.allSettled([getCoordinatorOverview(), getCoordinatorAppointments()]); if(overview.status==="rejected") throw overview.reason; setStats(overview.value.data); setAppointments(recent.status==="fulfilled"?recent.value.data:[]); }
      else if(section==="doctors") { const r=await getCoordinatorDoctors(date); setDoctors(r.data); }
      else if(section==="appointments"||section==="emergency") { const r=await getCoordinatorAppointments(section==="emergency"?"EMERGENCY":undefined); setAppointments(r.data.filter((a)=>section==="emergency"?a.appointment_type==="EMERGENCY":a.appointment_type!=="EMERGENCY")); const d=await getCoordinatorDoctors(date); setDoctors(d.data); }
      else if(selectedPatientId) { const r=await getCoordinatorPatientHistory(selectedPatientId); setHistory(r.data); }
      else { const r=await getCoordinatorPatients(search); setPatients(r.data); }
    } catch(e) { setError(errorText(e)); }
    finally { setLoading(false); }
  },[section,date,search,selectedPatientId]);
  useEffect(()=>{void load();},[load]);
  useRealtimeSync({ refresh:()=>{void load();}, events:["platform.data.updated"], polling:false, reconcileOnFocus:false });

  async function reassign(item:CoordinatorAppointment, emergency=false) {
    const doctor_id=targets[item.id]; if(!doctor_id){notify("error","Select a doctor first.");return;}
    setSavingId(item.id);
    try { const response = await reassignCoordinatorAppointment(item.id,doctor_id,emergency); setAppointments((current)=>current.map((appointment)=>appointment.id===item.id?response.data:appointment)); notify("success",emergency?"Emergency transferred. The new doctor must accept it.":"Appointment reassigned. The new doctor must accept it."); }
    catch(e){notify("error",errorText(e));}
    finally{setSavingId(null);}
  }

  if (section === "dashboard") {
    return <CoordinatorDashboard stats={stats} appointments={appointments} loading={loading} error={error} onRefresh={()=>void load()} />;
  }

  if (section === "doctors") {
    return <CoordinatorDoctors doctors={doctors} date={date} onDateChange={setDate} loading={loading} error={error} onRetry={()=>void load()} />;
  }

  if (section === "appointments") {
    return <CoordinatorAppointments
      appointments={appointments}
      doctors={doctors}
      loading={loading}
      error={error}
      onRetry={()=>void load()}
      onReassigned={(updated)=>setAppointments((current)=>current.map((appointment)=>appointment.id===updated.id?updated:appointment))}
    />;
  }

  const title = section==="emergency"?"Emergency coordination":"Patients and history";
  const description = section==="emergency"?"Route an emergency to another available doctor before care starts.":"Find a patient and review the full visit history across doctors.";

  return <main style={{padding:"clamp(16px,3vw,32px)",maxWidth:1440,margin:"0 auto"}}>
    <header style={headingStyle}><div><div style={{display:"flex",alignItems:"center",gap:10}}><span style={{color:"#0f766e"}}><Activity size={24}/></span><h1 style={{margin:0,fontSize:"clamp(24px,3vw,32px)"}}>{title}</h1></div><p style={{...muted,margin:"8px 0 0"}}>{description}</p></div><button className="btn btn--secondary" onClick={()=>void load()}><RefreshCw size={16}/> Refresh</button></header>
    {error&&<ErrorState message={error} onRetry={()=>void load()}/>}
    {loading&&!error&&<Card><Skeleton lines={5}/></Card>}
    {!loading&&!error&&section==="emergency"&&<div style={{display:"grid",gap:14}}>{appointments.length===0?<EmptyState title={section==="emergency"?"No emergency requests":"No appointments"} description="There are no matching appointments."/>:appointments.map(item=>{const eligible=section==="emergency"?["pending","accepted"].includes(item.status)&&!item.consultation_started_at:["pending","accepted"].includes(item.status)&&!item.consultation_started_at&&item.appointment_type!=="EMERGENCY";return <Card key={item.id} style={cardStyle}><div style={{display:"flex",justifyContent:"space-between",gap:14,flexWrap:"wrap"}}><div><div style={{display:"flex",gap:8,alignItems:"center",flexWrap:"wrap"}}><b>#{item.id} · {labelType(item.appointment_type)}</b><span style={{padding:"4px 9px",borderRadius:99,background:item.status==="accepted"?"#dcfce7":"#fef3c7"}}>{labelStatus(item.status)}</span></div><p style={{margin:"8px 0 3px"}}><b>{formatDate(item.appointment_date)}</b> · {item.start_time.slice(0,5)}–{item.end_time.slice(0,5)}</p><p style={{...muted,margin:"0 0 4px"}}>Patient #{item.patient} · Doctor #{item.doctor}</p><p style={{margin:"6px 0 0"}}>{item.reason||"No reason provided."}</p>{item.consultation_started_at&&<p style={{color:"#b91c1c",margin:"8px 0 0"}}>Consultation has started; reassignment is locked.</p>}</div>{eligible&&<div style={{display:"flex",gap:8,alignItems:"center",flexWrap:"wrap"}}><select value={targets[item.id]??""} onChange={e=>setTargets(v=>({...v,[item.id]:Number(e.target.value)}))} style={{padding:10,borderRadius:9,border:"1px solid #cbd5e1",maxWidth:230}}><option value="">Choose available doctor</option>{doctors.filter(d=>d.is_available&&d.id!==item.doctor).map(d=><option key={d.id} value={d.id}>Dr. {d.name}</option>)}</select><button className="btn btn--primary" disabled={savingId===item.id||!targets[item.id]} onClick={()=>void reassign(item,section==="emergency")}>{savingId===item.id?"Transferring…":section==="emergency"?"Transfer emergency":"Reassign"}</button></div>}</div></Card>})}</div>}
    {!loading&&!error&&section==="patients"&&!selectedPatientId&&<>
      <div style={{...cardStyle,display:"flex",gap:10,alignItems:"center",marginBottom:16}}><Search size={18}/><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search patient name, username or email" style={{border:0,outline:0,width:"100%",fontSize:16}}/></div>
      {patients.length===0?<EmptyState title="No patients found" description="Try a different search."/>:<div style={{display:"grid",gap:10}}>{patients.map(patient=><Card key={patient.id} style={{...cardStyle,display:"flex",justifyContent:"space-between",alignItems:"center",gap:14,flexWrap:"wrap"}}><div><b>{patient.first_name} {patient.last_name}</b><div style={muted}>{patient.email} · {patient.appointment_count} visits</div></div><button className="btn btn--secondary" onClick={()=>navigate(`/coordinator/patient?patient=${patient.id}`)}><UserRound size={16}/> View history</button></Card>)}</div>}
    </>}
    {!loading&&!error&&section==="patients"&&selectedPatientId&&history&&<><button className="btn btn--secondary" style={{marginBottom:14}} onClick={()=>navigate("/coordinator/patient")}><ArrowLeft size={16}/> All patients</button><Card style={{...cardStyle,marginBottom:16}}><h2 style={{marginTop:0}}>{history.patient.first_name} {history.patient.last_name}</h2><div style={gridStyle}><div>Email<br/><b>{history.patient.email}</b></div><div>Phone<br/><b>{history.patient.phone||"—"}</b></div><div>Blood group<br/><b>{String(history.patient.profile?.blood_group||"—")}</b></div><div>Gender / date of birth<br/><b>{String(history.patient.profile?.gender||"—")} · {String(history.patient.profile?.date_of_birth||"—")}</b></div><div>Allergies<br/><b>{String(history.patient.profile?.allergies||"None recorded")}</b></div><div>Medical history<br/><b>{String(history.patient.profile?.medical_history||"None recorded")}</b></div></div></Card><h2>Appointment history · {history.visits.length}</h2>{history.visits.length===0?<EmptyState title="No visit history" description="No appointment records have been recorded for this patient."/>:<div style={{display:"grid",gap:14}}>{history.visits.map((visit:any)=><Card key={visit.appointment_id} style={cardStyle}><h3 style={{marginTop:0}}>Appointment #{visit.appointment_id} · {formatDate(visit.appointment_date)}</h3><p>{labelType(visit.appointment_type||"NORMAL")} · {visit.start_time?.slice(0,5)}–{visit.end_time?.slice(0,5)} · {labelStatus(visit.status)}</p><p>Doctor: Dr. {visit.doctor_first_name} {visit.doctor_last_name} · Reason: {visit.reason||"—"}{visit.hospital_name?` · ${visit.hospital_name}`:""}</p>{visit.emergency_reason&&<p>Emergency: {visit.emergency_reason} · {visit.emergency_description||""}</p>}<p style={muted}>Booked {visit.booked_at?new Date(visit.booked_at).toLocaleString():"—"} · {visit.checked_in_at?`Checked in ${new Date(visit.checked_in_at).toLocaleString()}`:"Not checked in"} · {visit.consultation_started_at?`Consultation started ${new Date(visit.consultation_started_at).toLocaleString()}`:"No consultation start recorded"}</p><div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(220px,1fr))",gap:12}}><section><b>Treatments</b>{visit.treatments?.length?visit.treatments.map((t:any)=><p key={t.id} style={muted}>Diagnosis: {t.diagnosis||"—"}<br/>Treatment: {t.treatment_notes||"—"}<br/>Doctor report: {t.doctor_description||"—"}<br/>Prescription: {t.prescription||"—"}{t.follow_up_date?` · Follow-up ${t.follow_up_date} ${t.follow_up_time||""}`:""}{t.prescriptions?.map((rx:any)=><div key={rx.id}>Prescription details: {rx.items?.map((m:any)=>`${m.medication} ${m.dosage} ${m.frequency} ${m.duration_days?`${m.duration_days} days`:""}`).join("; ")}</div>)}</p>):<p style={muted}>None recorded</p>}</section><section><b>Vitals</b>{visit.vitals?.length?visit.vitals.map((v:any)=><p key={v.id} style={muted}>{v.recorded_at?.slice(0,10)} · BP {v.blood_pressure||"—"} · Pulse {v.pulse_bpm??"—"} · Temp {v.temperature_c??"—"}°C · SpO₂ {v.spo2_percent??"—"}% · Weight {v.weight_kg??"—"}kg · Height {v.height_cm??"—"}cm · BMI {v.bmi??"—"} · Glucose {v.glucose_mg_dl??"—"} · {v.notes||""}</p>):<p style={muted}>None recorded</p>}</section><section><b>Lab orders</b>{visit.lab_orders?.length?visit.lab_orders.map((l:any)=><p key={l.id} style={muted}>{l.test_name} · {labelStatus(l.status)} · {l.result_value||"No result"} {l.unit||""} · Due {l.result_due_date||"—"} · {l.result_notes||l.notes||""}</p>):<p style={muted}>None recorded</p>}</section><section><b>Reports</b>{visit.patient_reports?.length?visit.patient_reports.map((r:any)=><p key={r.id} style={muted}>{r.title} · {r.record_type} · {r.file_name||r.description||"Report"} · {r.description||""}</p>):<p style={muted}>None recorded</p>}</section></div>{visit.notes&&<p><b>Notes:</b> {visit.notes}</p>}{visit.cancel_reason&&<p><b>Cancellation/rejection:</b> {visit.cancel_reason}</p>}</Card>)}</div>}</>}
  </main>;
}
