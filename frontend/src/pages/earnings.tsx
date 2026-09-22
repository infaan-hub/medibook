import { useCallback, useEffect, useState } from "react";
import { getEarningsDashboard, type EarningsData, type DailyBreakdown } from "../api/earnings";
import { Card, EmptyState, ErrorState, Skeleton } from "../components/ui";
import { DollarSign, Calendar, TrendingUp, Activity, BarChart3 } from "lucide-react";

function msg(error: unknown): string {
  return error instanceof Error ? error.message : "Something went wrong. Please try again.";
}

function fmtCurrency(n: number): string {
  return `$${n.toFixed(2)}`;
}

function fmtDate(d: string): string {
  return new Date(d + "T00:00:00").toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}

/* ======================================
   STATS CARD
   ====================================== */

function StatCard({ label, value, sub, icon, color }: {
  label: string;
  value: string;
  sub?: string;
  icon: React.ReactNode;
  color: string;
}) {
  return (
    <Card className="earn-stat-card">
      <div className="earn-stat-icon" style={{ background: color }}>{icon}</div>
      <div className="earn-stat-body">
        <span className="earn-stat-label">{label}</span>
        <span className="earn-stat-value">{value}</span>
        {sub && <span className="earn-stat-sub">{sub}</span>}
      </div>
    </Card>
  );
}

/* ======================================
   SIMPLE BAR CHART
   ====================================== */

function BarChart({ data, maxVal }: { data: DailyBreakdown[]; maxVal: number }) {
  const max = maxVal || Math.max(...data.map((d) => d.earnings), 1);
  return (
    <div className="earn-bar-chart">
      {data.map((d) => {
        const pct = max > 0 ? (d.earnings / max) * 100 : 0;
        return (
          <div key={d.date} className="earn-bar-col" title={`${fmtDate(d.date)}: ${d.appointments} appts, ${fmtCurrency(d.earnings)}`}>
            <div className="earn-bar-value">{d.appointments > 0 ? d.appointments : ""}</div>
            <div className="earn-bar-track">
              <div className="earn-bar-fill" style={{ height: `${Math.max(pct, d.appointments > 0 ? 8 : 0)}%` }} />
            </div>
            <div className="earn-bar-label">{fmtDate(d.date)}</div>
          </div>
        );
      })}
    </div>
  );
}

/* ======================================
   WEEK TABLE
   ====================================== */

function WeekTable({ data }: { data: EarningsData["week_daily"] }) {
  return (
    <div className="earn-week-table">
      {data.map((d) => (
        <div key={d.date} className="earn-week-row">
          <span className="earn-week-day">{d.day}</span>
          <span className="earn-week-date">{fmtDate(d.date)}</span>
          <span className="earn-week-count">{d.appointments} appt{d.appointments !== 1 ? "s" : ""}</span>
          <span className="earn-week-amt">{fmtCurrency(d.earnings)}</span>
        </div>
      ))}
    </div>
  );
}

/* ======================================
   EARNINGS DASHBOARD PAGE
   ====================================== */

export default function EarningsPage() {
  const [data, setData] = useState<EarningsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<"30d" | "week">("30d");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await getEarningsDashboard();
      setData(res.data ?? null);
    } catch (e) {
      setError(msg(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  if (loading) {
    return (
      <div className="page doctor-workspace">
        <div className="doctor-page-header">
          <p className="doctor-eyebrow">Earnings</p>
          <h1>Earnings Dashboard</h1>
        </div>
        <Skeleton lines={6} />
      </div>
    );
  }

  if (error) {
    return (
      <div className="page doctor-workspace">
        <div className="doctor-page-header">
          <p className="doctor-eyebrow">Earnings</p>
          <h1>Earnings Dashboard</h1>
        </div>
        <ErrorState message={error} onRetry={load} />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="page doctor-workspace">
        <div className="doctor-page-header">
          <p className="doctor-eyebrow">Earnings</p>
          <h1>Earnings Dashboard</h1>
        </div>
        <EmptyState icon={<DollarSign size={28} />} title="No data" description="Could not load earnings data." />
      </div>
    );
  }

  const chartData = data.daily_30_days;
  const maxEarnings = Math.max(...chartData.map((d) => d.earnings), 1);

  return (
    <div className="page doctor-workspace">
      <div className="doctor-page-header">
        <div>
          <p className="doctor-eyebrow">Earnings</p>
          <h1>Earnings Dashboard</h1>
          <p>Consultation fee: <strong>{fmtCurrency(data.consultation_fee)}</strong> per visit</p>
        </div>
      </div>

      <div className="earn-stats-grid">
        <StatCard
          label="Today"
          value={fmtCurrency(data.today.earnings)}
          sub={`${data.today.appointments} appointment${data.today.appointments !== 1 ? "s" : ""}`}
          icon={<Calendar size={20} />}
          color="var(--color-primary)"
        />
        <StatCard
          label="This Week"
          value={fmtCurrency(data.this_week.earnings)}
          sub={`${data.this_week.appointments} appointment${data.this_week.appointments !== 1 ? "s" : ""}`}
          icon={<TrendingUp size={20} />}
          color="var(--color-status-confirmed)"
        />
        <StatCard
          label="This Month"
          value={fmtCurrency(data.this_month.earnings)}
          sub={`${data.this_month.appointments} appointment${data.this_month.appointments !== 1 ? "s" : ""}`}
          icon={<Activity size={20} />}
          color="var(--color-status-completed)"
        />
      </div>

      <div className="earn-chart-section">
        <div className="earn-chart-header">
          <h2><BarChart3 size={18} /> {view === "30d" ? "Last 30 Days" : "This Week"}</h2>
          <div className="earn-chart-tabs">
            <button type="button" className={`earn-tab ${view === "30d" ? "earn-tab--active" : ""}`} onClick={() => setView("30d")}>30 Days</button>
            <button type="button" className={`earn-tab ${view === "week" ? "earn-tab--active" : ""}`} onClick={() => setView("week")}>This Week</button>
          </div>
        </div>
        <Card className="earn-chart-card">
          {view === "30d" ? (
            <BarChart data={chartData} maxVal={maxEarnings} />
          ) : (
            <WeekTable data={data.week_daily} />
          )}
        </Card>
      </div>
    </div>
  );
}
