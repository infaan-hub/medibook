# MediBook

Healthcare doctor-appointment booking system: one Next.js 15 app (PWA UI + App Router API) served by a custom Node server that adds WebSocket/SSE realtime, PostgreSQL (Neon/Prisma), web push, PDF reports and scheduled reminders.

## Repository layout

| Directory | What it is |
| --- | --- |
| `frontend/` | **The app.** UI, `/api/**`, `/media/**`, realtime (`server.js`), PWA — this is what deploys. |
| `next-app/` | Legacy parallel variant of the same product (port 8000). Not deployed. |

## Development

```bat
start-dev.bat
```

or manually:

```bat
cd frontend
npm install
npm run dev        # node server.js → http://localhost:3000 (UI + API + WS + SSE)
```

- `npm run dev:next` runs plain `next dev` (UI + API + SSE route, no raw WebSocket).
- Override the port with `PORT=8000 npm run dev`.

## Production

| Piece | Host | Notes |
| --- | --- | --- |
| Full app | Vercel — root directory `frontend` (`zan-medibook`) | Same-origin UI + `/api` + SSE fallback route |
| WebSocket `/ws/notifications/` | Long-running Node (`npm run build && npm start`) | Vercel cannot host raw WS upgrades — the client detects a serverless host and uses SSE instead |
| PostgreSQL | Neon (or any Postgres) | `DATABASE_URL` |
| Web Push | VAPID keys in server env only | Public key via `GET /api/push/vapid-public-key` |
| Reminder cron | Vercel Cron → `GET/POST /api/cron/reminders` (daily `0 3 * * *`, Hobby plan limit) + in-process interval on long-running hosts | Header `x-cron-secret: $CRON_SECRET` (or `Authorization: Bearer`) |

A daily cron can deliver a `1h`-before reminder up to 24h late; on a long-running host set `REMINDERS_INTERVAL_MINUTES=15` for ~15-minute accuracy (`0` disables).

### Environment variables

All in `frontend/.env` — copy `frontend/.env.example` and fill in at least `DATABASE_URL`, `AUTH_SECRET`, `CRON_SECRET`, `VAPID_*`. Optional: `NEXT_PUBLIC_WS_URL` only when realtime is **not** same-origin (it accepts `ws://`, `wss://`, `http://`, `https://` or a bare host — never produces `wss://https//host`).

Never expose `VAPID_PRIVATE_KEY` or `AUTH_SECRET` to the client.

## Realtime (no chat)

- `GET /ws/notifications/?token=…` upgrades to a WebSocket (frames `{event, payload}`, `{"type":"ping"}` → `{event:"pong"}`, close `4001` = refresh your token).
- SSE fallback at `/ws/notifications/sse?token=…` — served by `server.js` on a long-running host and by `app/ws/notifications/[...path]/route.ts` on Vercel (401s are plain text, never an HTML page).
- Both transports share `lib/realtime-hub.js`; the client (`src/realtime/socket.ts` + `RealtimeProvider`) dedups, drops stale versions and falls back to polling only while the transport is down.
- Events: appointments, availability, notifications, users/doctors — **no chat / message events**.

## Reminders

- Atomic claim on `AppointmentReminder.sent` (idempotent, safe to run concurrently).
- Preferences: `Patient.reminder_preferences` (`1h` / `24h` / `1w`, missing = on); timezone: `Patient.timezone` (IANA, default UTC).
- Triggers: daily Vercel cron → `/api/cron/reminders`, in-process interval via `instrumentation.ts` (long-running host only).

## Commands

Run from `frontend/`:

| Command | What it does |
| --- | --- |
| `npm run typecheck` | TypeScript (`tsc --noEmit`) |
| `npm test` | Unit/component tests (vitest, jsdom) |
| `npm run test:api` | API route tests (vitest) |
| `npm run build` | `prisma generate && next build` |
| `npm run dev` / `npm start` | Custom server with WebSocket (dev / production) |
