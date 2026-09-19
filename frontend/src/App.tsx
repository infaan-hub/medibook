// PHASE 1 — Development Environment
// This is the environment smoke-test screen only. Real screens, routing, state
// management and the PWA shell are added in PHASE 4 — React Foundation.
interface EnvironmentCheck {
  label: string;
  value: string;
}

const environmentChecks: EnvironmentCheck[] = [
  { label: "React + Vite toolchain", value: "ready" },
  { label: "TypeScript", value: "strict" },
  {
    label: "API base URL",
    value: import.meta.env.VITE_API_BASE_URL ?? "not configured"
  },
  { label: "PWA manifest", value: "PHASE 4" },
  { label: "Service worker", value: "PHASE 4" },
  { label: "Authentication", value: "PHASE 5" }
];

export default function App() {
  return (
    <main className="app-shell">
      <header className="app-header">
        <h1>MediBook</h1>
        <p className="app-subtitle">Development environment status</p>
      </header>

      <section className="status-panel" aria-label="Environment status">
        <ul className="status-list">
          {environmentChecks.map((check) => (
            <li key={check.label}>
              <span className="status-label">{check.label}</span>
              <span className="status-value">{check.value}</span>
            </li>
          ))}
        </ul>
      </section>

      <footer className="app-footer">
        <p>PHASE 1 — Development Environment</p>
      </footer>
    </main>
  );
}