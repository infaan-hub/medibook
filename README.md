# MediBook

Healthcare doctor-appointment booking system: React (Vite) PWA frontend + Next.js App Router API + custom Node WebSocket server + PostgreSQL (Neon/Prisma).

## Development

```bat
start-dev.bat
```

- Backend (API + WebSocket): `next-app` → `npm run dev` (port **8000**, `server.js`)
- Frontend: `frontend` → `npm run dev` (port **5173**, proxies `/api`, `/media`, `/ws`)

## Production architecture (required)

| Piece | Host | Notes |
| --- | --- | --- |
| Frontend SPA | Vercel (or any static host) | `VITE_API_BASE_URL`, optional `VITE_WS_URL` |
| HTTP API + WebSocket + reminder process | Long-running Node (`node server.js production`) | **Not** Vercel serverless — needs a persistent process for `/ws/notifications/` |
| PostgreSQL | Neon (or any Postgres) | `DATABASE_URL` |
| Web Push | VAPID keys in backend env only | Public key via `GET /api/push/vapid-public-key/` |
| Scheduled reminders | Platform cron → `POST /api/cron/reminders/` | Header `x-cron-secret: $CRON_SECRET`. In-process interval only on the long-running Node host (`REMINDERS_INTERVAL_MINUTES`). Set to `0` on serverless. |

If the SPA is on Vercel, either:

1. Proxy `/ws` to the dedicated Node host, or  
2. Set `VITE_WS_URL=wss://your-ws-host` (client opens `/ws/notifications/` on that origin).

HTTP API must remain reachable at `VITE_API_BASE_URL` (same origin path `/api` if reverse-proxied).

### Environment variables

**Backend (`next-app/.env`)**  
`DATABASE_URL`, `AUTH_SECRET`, `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`, `CRON_SECRET`, `REMINDERS_INTERVAL_MINUTES`, `PORT`, …

**Frontend (`frontend/.env`)**  
`VITE_API_BASE_URL` (required), `VITE_WS_URL` (optional absolute WS base), `VITE_VAPID_PUBLIC_KEY` (optional offline override).

Never expose `VAPID_PRIVATE_KEY` or `AUTH_SECRET` to the client.

## Realtime (no chat)

- One WebSocket per signed-in session: `/ws/notifications/?token=…`
- Envelopes: `{ id, type, event, timestamp, version, entity_id, payload }`
- Client: `src/realtime/socket.ts` (dedup + stale-version drop) + `RealtimeProvider`
- Polling is **fallback only** while the socket is down
- Events: appointments, availability, notifications, users/doctors — **no chat / message events**

## Reminders

- Atomic claim on `AppointmentReminder.sent` (idempotent)
- Preferences: `Patient.reminder_preferences` (`1h` / `24h` / `1w`, missing = on)
- Timezone: `Patient.timezone` (IANA, default UTC)
- Triggers: in-process interval (long-running host) + `POST /api/cron/reminders/` + `npm run reminders`

## Commands

| Where | Command |
| --- | --- |
| `next-app` | `npm run typecheck`, `npm test`, `npm run build`, `npm run dev`, `npm run reminders` |
| `frontend` | `npm run typecheck`, `npm test`, `npm run build`, `npm run dev` |
