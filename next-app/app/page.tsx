/**
 * The MediBook backend is API-only (the React/Vite frontend in ../frontend is
 * the UI). This page simply identifies the service.
 */
export default function Home() {
  return (
    <main style={{ fontFamily: "system-ui", padding: 40 }}>
      <h1>MediBook API</h1>
      <p>
        Next.js + TypeScript + Prisma + PostgreSQL backend. Endpoints live under{" "}
        <code>/api</code>; realtime events at <code>/ws/notifications/</code>; media at{" "}
        <code>/media</code>.
      </p>
      <p>
        Health check: <code>GET /api/health/</code>
      </p>
    </main>
  );
}
