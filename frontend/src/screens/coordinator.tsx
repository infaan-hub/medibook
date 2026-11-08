import { useCallback, useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import { useRealtimeSync } from "../realtime/socket";
import { getCoordinatorAppointments, getCoordinatorDoctors, getCoordinatorOverview, getCoordinatorPatientHistory, getCoordinatorPatients, invalidateCoordinatorCache, type CoordinatorAppointment, type CoordinatorDoctor, type CoordinatorHistory, type CoordinatorPatient, type CoordinatorStats } from "../api/coordinator";
import { CoordinatorDashboard } from "./coordinator-dashboard";
import { CoordinatorDoctors } from "./coordinator-doctors";
import { CoordinatorAppointments } from "./coordinator-appointments";
import { CoordinatorEmergency } from "./coordinator-emergency";
import { CoordinatorPatients } from "./coordinator-patients";

function errorText(e: unknown) { return e instanceof Error ? e.message : "Unable to load data."; }

export function CoordinatorScreen() {
  const location = useLocation();
  const path = location.pathname; const query = new URLSearchParams(location.search);
  const section = path.includes("/doctors") ? "doctors" : path.includes("/appointment") ? "appointments" : path.includes("/emergency") ? "emergency" : path.includes("/patient") ? "patients" : "dashboard";
  const selectedPatientId = Number(query.get("patient")) || null;
  const [stats,setStats]=useState<CoordinatorStats|null>(null); const [doctors,setDoctors]=useState<CoordinatorDoctor[]>([]); const [appointments,setAppointments]=useState<CoordinatorAppointment[]>([]); const [patients,setPatients]=useState<CoordinatorPatient[]>([]); const [history,setHistory]=useState<CoordinatorHistory|null>(null);
  const [date,setDate]=useState(new Date().toISOString().slice(0,10)); const [search,setSearch]=useState(""); const [error,setError]=useState<string|null>(null); const [loading,setLoading]=useState(true);

  const load = useCallback(async () => {
    setError(null); setLoading(true);
    try {
      if(section==="dashboard") { const [overview, recent] = await Promise.allSettled([getCoordinatorOverview(), getCoordinatorAppointments()]); if(overview.status==="rejected") throw overview.reason; setStats(overview.value.data); setAppointments(recent.status==="fulfilled"?recent.value.data:[]); }
      else if(section==="doctors") { const r=await getCoordinatorDoctors(date); setDoctors(r.data); }
      else if(section==="appointments"||section==="emergency") { const r=await getCoordinatorAppointments(section==="emergency"?"EMERGENCY":undefined); setAppointments(r.data.filter((a)=>section==="emergency"?a.appointment_type==="EMERGENCY":a.appointment_type!=="EMERGENCY")); if(section==="emergency"){const d=await getCoordinatorDoctors(date);setDoctors(d.data);}else setDoctors([]); }
      else if(selectedPatientId) { const r=await getCoordinatorPatientHistory(selectedPatientId); setHistory(r.data); }
      else { const r=await getCoordinatorPatients(search); setPatients(r.data); }
    } catch(e) { setError(errorText(e)); }
    finally { setLoading(false); }
  },[section,date,search,selectedPatientId]);
  useEffect(()=>{void load();},[load]);
  useRealtimeSync({ refresh:()=>{ invalidateCoordinatorCache(); void load(); }, events:["platform.data.updated"], polling:false, reconcileOnFocus:false });

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

  if (section === "emergency") {
    return <CoordinatorEmergency
      appointments={appointments}
      doctors={doctors}
      loading={loading}
      error={error}
      onRetry={()=>void load()}
      onReassigned={(updated)=>setAppointments((current)=>current.map((appointment)=>appointment.id===updated.id?updated:appointment))}
    />;
  }

  return <CoordinatorPatients
    patients={patients}
    history={history}
    selectedPatientId={selectedPatientId}
    search={search}
    onSearchChange={setSearch}
    loading={loading}
    error={error}
    onRetry={()=>void load()}
  />;
}
