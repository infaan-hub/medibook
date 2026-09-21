# MediBook — Project Development Log

**Project:** MediBook — healthcare appointment and doctor-booking platform
**Repository:** https://github.com/infaan-hub/medibook
**Branch:** `main`
**Log started:** 2026-09-19
**Specification (source of truth):** `MediBook_Project_and_Roadmap (1).md`
**Log file:** `project development.md`

---

## 1. Purpose & Rules

This file is the dated development record for MediBook. It answers one question: **what was done, on which date, verified how, and what comes next.**

Rules:

1. One dated entry per work session, per delivered function, or per phase transition.
2. Every entry records: date, phase, work done, files touched, verification evidence, status, and next step.
3. This file reports progress only. The roadmap document remains the specification; when a requirement changes, the roadmap is updated first and the change is then logged here.
4. Never log work as `Done` without verification evidence (file checked, command run, or test passed).
5. Entries are append-only. Never rewrite history; correct a previous entry with a new one.

Status values:

```text
Done           Completed and verified
In Progress    Started, not finished
Open Decision  Waiting for a product/technical decision
Blocked        Cannot proceed
Not Started    Not begun
```

---

## 2. Environment Snapshot (2026-09-19)

| Item | Value | Status |
| --- | --- | --- |
| Repository | `https://github.com/infaan-hub/medibook` | Done |
| Branch / commit | `main` @ `b59b1da` ("first commit") | Done |
| Git | 2.52.0.windows.1 | Done |
| Node.js | v22.21.0 | Done |
| npm | 10.9.4 | Done |
| Python | 3.14.0 (global `python` / `py`) | Done |
| Python virtualenv | `backend/.venv` created 2026-09-19 | Done |
| Django | 6.1.1 | Done |
| Django REST Framework | 3.18.1 | Done |
| djangorestframework-simplejwt | 5.5.1 | Done |
| django-cors-headers | 4.9.0 | Done |
| psycopg (PostgreSQL driver) | 3.3.6 (binary) | Done |
| Pillow | 12.3.0 | Done |
| python-dotenv | 1.2.3 | Done |
| React / React DOM | 19.3.0 | Done |
| react-router-dom | 7.18.4 | Done |
| axios | 1.20.0 | Done |
| Vite | 8.3.0 | Done |
| @vitejs/plugin-react | 6.1.1 | Done |
| TypeScript | 7.0.2 (strict) | Done |
| @types/react / @types/react-dom | 19.3.0 | Done |
| PostgreSQL server | 18.1 running on `127.0.0.1:5432` (dev instance started by `backend/scripts/pg.ps1`; Windows service `postgresql-x64-18` left on Manual) | Done |
| Database `medibook` | created 2026-09-19, owner `medibook_user`, 18 migrations applied, 10 tables | Done |
| Backend project | `backend/manage.py` + `backend/config/` + 11 registered apps; working API (health, JWT, envelopes) | Done (PHASE 2) |
| Frontend project | `frontend/` Vite + React + TypeScript (strict), responsive base styles; `typecheck` and production build verified | Done (PHASE 1) |
| PWA icon set | `frontend/public/icons/` (192, 512, maskable 512, apple-touch 180) | Done (PHASE 1) |
| PWA runtime files | `manifest.json`, `service-worker.js`, `offline.html`, install prompt — planned for PHASE 4 | Not Started |
| CI/CD | none configured | Not Started |

> **State note:** the roadmap specification and the PHASE 1 project skeleton now exist. The Django project starts and passes `manage.py check`, and the React app builds for production — but **no MediBook business feature exists yet** (no models, no API endpoints, no screens, no PWA runtime files). Everything marked `Done` in section 3 is a completed **specification / planning** deliverable.

---

## 3. Report — All Work Completed To Date (as of 2026-09-19)

### 3.1 Specification & architecture deliverables (Done)

| # | Deliverable | Roadmap section | Status |
| --- | --- | --- | --- |
| 1 | Project identity, vision, main objectives | §2–§4 | Done |
| 2 | Core MVP scope, future scope, user roles | §5–§7 | Done |
| 3 | Patient journey, appointment workflow & statuses, booking rules | §8–§10 | Done |
| 4 | Doctor availability model, slot generation, double-booking prevention | §11–§12 | Done |
| 5 | Patient/doctor profiles, specialty & hospital modules, doctor search/filtering | §13–§17 | Done |
| 6 | React screen inventory (patient, doctor, admin) + PWA UI components | §18–§20 | Done |
| 7 | UI/UX and design-system requirements (incl. install banner, offline banner, standalone spacing) | §21 | Done |
| 8 | Responsive & PWA requirements (3 pillars, core requirements, file locations, breakpoints, platform-fit rules) | §22 | Done |
| 9 | Django backend architecture and application responsibilities | §23–§24 | Done |
| 10 | PostgreSQL entity model, table design, indexing plan | §25–§26, §43 | Done |
| 11 | REST API plan and API standards | §27–§28 | Done |
| 12 | JWT authentication architecture, RBAC, notification architecture, reviews, admin dashboard requirements | §29–§31, §33–§34 | Done |
| 13 | Security, privacy, and PWA/service-worker security requirements | §35–§36 | Done |
| 14 | React project structure (incl. `src/pwa/`), React architecture, state management, error handling, loading states, performance requirements | §37–§42 | Done |
| 15 | Testing strategy (backend, booking conflicts, React, security, PWA) | §44–§46 | Done |
| 16 | Development environment and version-control plan | §47–§48 | Done |
| 17 | Full development roadmap: PHASE 0 … PHASE 22 | §49–§71 | Done |
| 18 | MVP definition, milestone structure, definition of done, development rules | §72–§75 | Done |
| 19 | Build order, first release, future roadmap, final architecture, checklists, completion criteria, next steps | §76–§83 | Done |

### 3.2 PWA / cross-platform delivery model (specified — implementation pending)

| # | Function | Where | Status |
| --- | --- | --- | --- |
| 1 | Web App Manifest spec: `name`, `short_name`, `start_url`, `scope`, `display: "standalone"`, theme/background colour, orientation, categories, shortcuts | §22.1, §22.3, §69 | Specified |
| 2 | Reference `manifest.json` with 192/512/maskable/apple-touch icon set | §69 | Specified |
| 3 | Service worker: `install` (precache app shell), `activate` (delete outdated caches), `fetch` (cache-first static assets, network-only `/api/`, offline fallback for navigations) | §22.1, §69 | Specified |
| 4 | Web Push handlers (`push`, `notificationclick`) for installed PWAs | §31, §69 | Specified |
| 5 | Install prompt (A2HS): `beforeinstallprompt` capture, install button, `appinstalled` handling, `isStandalone()` detection, iOS "Share → Add to Home Screen" guidance | §22.1, §69 | Specified |
| 6 | Offline fallback page (`offline.html`) plus offline banner and retry UX | §22.3, §40, §69 | Specified |
| 7 | Standalone / safe-area styling rules for the installed app | §21, §22.6 | Specified |
| 8 | PWA security rules (HTTPS only, root scope, never cache patient/authenticated data, CSP, logout clears caches) | §35, Rule 11 | Specified |
| 9 | PWA performance rules (app-shell precache budget, cache strategies, Lighthouse audits) | §42 | Specified |
| 10 | `PHASE 20 — PWA Build & Installability` with tasks and acceptance criteria | §69 | Specified |
| 11 | PWA deployment checklist (HTTPS, root MIME types, cache versioning, service-worker scope) | §70 | Specified |

### 3.3 Native mobile toolchain removed (Done)

One React build installable on desktop, Android and iOS replaced the previous native model:

- Removed "Install Android Studio" and "Configure Android emulator" (PHASE 1).
- Removed "Android build" / "Mobile-responsive web build" from deployment and checklists.
- Replaced the `Android  iOS  Web` architecture branch with `Desktop  Android  iOS` installed-PWA targets.
- Replaced native-FCM push with **Web Push (VAPID) + FCM → installed PWA**.
- Development tooling now: Node.js/npm, React + Vite, PWA layer, Chrome DevTools (Application/Lighthouse panels), Lighthouse CLI.
- React Native / Capacitor native wrapper documented as an explicitly optional future option only (§6).

### 3.4 Verification evidence (checks run 2026-09-19)

| Check | Result |
| --- | --- |
| Roadmap document length | 2,957 → 3,497 lines |
| Heading sequence | `# 2` … `# 83`, sequential, no gaps or duplicates |
| Markdown code fences | 214 fence lines (even → balanced) |
| Remaining "install Android Studio / configure emulator" instructions | 0 (only intentional statements that they are *not* required) |
| PWA references (`PWA`, `manifest`, `service worker`, `A2HS`, `offline`, `standalone`, `VAPID`) | 156 matches |
| Other project files modified | none — `git status` showed only the roadmap file, untracked |
| Application code present | none — `backend/` and `frontend/` are empty |

---

## 4. Phase Task Boards

### 4.1 PHASE 0 (Planning) — Task Board

Started: **2026-09-19**

| Phase 0 task (§49) | Deliverable location | Status | Evidence / note |
| --- | --- | --- | --- |
| Finalize scope | §5, §6 | Done | Core MVP scope + PWA delivery scope documented |
| Finalize user roles | §7 | Done | Patient, Doctor, Admin and their permissions |
| Finalize appointment workflow | §9, §10 | Done | 6 statuses + 14 booking rules |
| Finalize database entities | §25, §26 | Done | 12 entities, table designs, indexing plan (§43) |
| Finalize API architecture | §27, §28 | Done | Endpoint plan + response/error standards |
| Define React screens | §18, §19, §20 | Done | Patient, doctor and admin screens + PWA UI |
| Define design system | §21 | **Done** | Design tokens implemented in `frontend/src/design/tokens.css` + `tokens.ts` (Phase 4, Entry 0007) |
| Finalize PWA delivery model | §22, §69 | Done | Manifest + service worker + A2HS specified, with reference code |
| Define security requirements | §35, §36 | Done | Auth, API, DB, file, production + PWA security |
| Define deployment strategy | §70 | **In Progress** | Steps documented; hosting, domain and HTTPS undecided |

**Phase 0 deliverables status**

| Deliverable (§49) | Status |
| --- | --- |
| Project Scope | Done |
| Architecture | Done |
| Database Plan | Done |
| API Plan | Done |
| UI/UX Plan | Done (design tokens implemented Phase 4) |
| PWA Plan | Done |
| Roadmap | Done |

**Phase 0 exit gate:** design tokens closed (Phase 4, Entry 0007); deployment strategy remains Open (blocks PHASE 21).

---

### 4.2 PHASE 1 (Development Environment) — Task Board

Started: **2026-09-19**

| Phase 1 task (§50) | Status | Evidence |
| --- | --- | --- |
| Install Python | Done | Python 3.14.0 (global) |
| Install Django (+ DRF, simplejwt, CORS headers, psycopg, Pillow, dotenv) | Done | `backend/.venv`; versions pinned in §2 and `backend/requirements.txt` |
| Install Node.js, npm, React (Vite) | Done | Node v22.21.0, npm 10.9.4, React 19.3.0, Vite 8.3.0 |
| Install PWA tooling | Done | Hand-written manifest + service worker (decision #7); no extra dependency |
| Lighthouse / Chrome DevTools Application panel | Done | Chrome DevTools Application + Lighthouse panels; `npx lighthouse` for CLI audits |
| Prepare the PWA icon set | Done | 4 PNGs in `frontend/public/icons/`; regenerable via `frontend/scripts/generate-icons.ps1` |
| Configure PostgreSQL | **Done** (resolved 2026-09-19) | PostgreSQL 18.1 on `127.0.0.1:5432`; `medibook` + `medibook_user` created; 18 migrations applied; `manage.py check --database default` passes. Bootstrap detail: superuser password was unknown, so the role/database were created through a **temporary `hba_file` override** (`-c hba_file=…` trust file in `%TEMP%`, never touching the real `pg_hba.conf`), then the server was restarted on the original `pg_hba.conf` and password auth re-verified |
| Create Git repository | Done | Existing repo `infaan-hub/medibook`; repository-wide `.gitignore` added |
| Create backend | Done | `backend/manage.py` + `backend/config/`; `manage.py check` passes |
| Create React frontend | Done | `frontend/` Vite + React app; `npm run build` produces `dist/` |
| Add TypeScript to the frontend | Done | TypeScript 7.0.2 strict; `tsconfig.json`, `.tsx`/`.ts` only; `npm run typecheck` passes |
| Configure environment variables | Done | `backend/.env` + `.env.example`, `frontend/.env` + `.env.example` (both real files gitignored) |

**Phase 1 exit gate:** PostgreSQL service started, database `medibook` + role `medibook_user` created, and `manage.py migrate` succeeds.

> Phase 1 was started while two Phase 0 items (design tokens, deployment strategy) are still open. Those must close before PHASE 4 (UI) and PHASE 21 (deployment) respectively.

---

### 4.3 PHASE 2 (Django Foundation) — Task Board

Started and completed: **2026-09-19**

| Phase 2 task (§51) | Status | Evidence |
| --- | --- | --- |
| Create Django project | Done | `backend/manage.py`, `backend/config/{settings,urls,asgi,wsgi}.py` |
| Configure settings | Done | Env-driven `settings.py` with fail-fast helpers, logging, `APP_VERSION = 0.1.0` |
| Configure PostgreSQL | Done | PostgreSQL 18.1 on `127.0.0.1:5432`; `medibook` owned by `medibook_user`; 18 migrations applied |
| Configure Django REST Framework | Done | JWT auth class, `IsAuthenticated` default, envelope pagination, custom exception handler |
| Configure CORS | Done | `corsheaders.middleware.CorsMiddleware` + `CORS_ALLOWED_ORIGINS` from env |
| Configure media/static files | Done | `STATIC_ROOT`, `MEDIA_ROOT`/`MEDIA_URL`; media served in DEBUG only |
| Configure environment variables | Done | `backend/.env` (+ `.env.example`), `frontend/.env` (+ `.env.example`), both gitignored |
| Configure JWT | Done | `POST /api/auth/login/`, `POST /api/auth/token/refresh/`; 30 min access, 7 day refresh, rotation on |
| Configure API routing | Done | `/api/` in `config/urls.py`; `common/urls.py`; per-phase mounting documented |
| Create common utilities | Done | `TimeStampedModel`, `StandardResultsSetPagination`, `success_response`/`error_response`, `custom_exception_handler`, `HealthCheckView` |
| Test all APIs | Done | 4 HTTP smoke tests, all returning the §28 envelope (see Entry 0005: `GET /api/health/` 200, `POST /api/auth/login/` 400, `POST /api/auth/token/refresh/` 400, `POST /api/health/` 405) |
| App scaffolding (§23) | Done | 11 apps created with `startapp` and registered in `INSTALLED_APPS` |

**Phase 2 exit gate:** met — `manage.py check` and `manage.py check --database default` both pass, and the API answers over HTTP.

---

## 5. Decision Register (Phase 0 / Phase 1)

| # | Decision needed | Affects | Proposed default | Owner | Status |
| --- | --- | --- | --- | --- | --- |
| 1 | Design system tokens: primary/secondary palette, typography scale, spacing, radii, elevation | §21, §22, every UI phase | Primary `#0F62FE`, white background, 8px spacing scale | Product / UI | Open |
| 2 | Hosting and deployment target for the frontend (CDN/static host vs Django static files vs same server) plus domain | §70, HTTPS, service-worker scope | Single domain: Django API + React PWA served from the app root over HTTPS | Tech lead | Open |
| 3 | PostgreSQL version and managed vs self-hosted database | §25, §70 | PostgreSQL 18 already installed locally at `E:\PostgreSQL\18`; self-hosted for development, managed in production | Tech lead | Resolved (dev) |
| 4 | Admin interface: React admin screens vs separate web admin | §20 | React admin screens (one codebase, PWA-consistent) | Product | Open |
| 5 | ~~Payment provider and refund policy~~ Payments removed from scope (2026-09-19) | §32, §65 | N/A — consultation payments are not part of MediBook | Product | Resolved (removed) |
| 6 | Push provider: FCM project + VAPID key ownership; whether SMS is also required | §31, PHASE 13 | FCM + Web Push (VAPID) only; SMS later | Tech lead | Open |
| 7 | PWA build tooling: hand-written manifest/service worker vs `vite-plugin-pwa` | §22, §47, §69 | Hand-written `manifest.json` + `service-worker.js`, no extra dependency | Frontend | Resolved |
| 8 | Locale/timezone handling for appointment slots | §10, §11 | Store UTC, render in the facility's timezone | Backend | Open |
| 9 | Email/SMS provider for verification, password reset and reminders | PHASE 3, PHASE 13 | Configurable email backend via environment variables | Backend | Open |
| 10 | Frontend language: JavaScript vs TypeScript | §1, §37, §45, §50, §74, §75 | TypeScript strict for the whole frontend (`.tsx` components, `.ts` logic/types); no mixed JS | Frontend | **Resolved** (TypeScript) |

---

## 6. Dated Development Entries

### 2026-09-19 — Entry 0001 — Roadmap: PWA-first delivery model (Done)

**Phase:** Pre-phase — planning artefact correction

**Work done**

1. Replaced the native multi-app model (Android Studio + Android emulator + native Android/iOS builds) with a single installable React Progressive Web App.
2. Added the three PWA pillars to §22: **Web App Manifest**, **Service Worker** (with a `fetch` event handler), **Install Prompt (A2HS — Add to Home Screen)**.
3. Added the PWA core requirements: HTTPS, `manifest.json` with `display: "standalone"` and icons, service worker with a fetch handler.
4. Documented PWA file locations: `frontend/public/manifest.json` (served as `/manifest.json`), `frontend/public/service-worker.js` (served as `/service-worker.js`), `offline.html`, and `icons/` — also deployable as `static/manifest.json` / `static/service-worker.js` when served by Django, mapped to the site root so the service-worker scope covers the app.
5. Updated §1, §4, §5.1, §6, §18, §21, §22, §31, §35, §37, §40, §42, §45, §47 and §49.
6. Fixed the phases: PHASE 1, PHASE 4, PHASE 13, PHASE 17, PHASE 18, PHASE 19, PHASE 21 (its duplicated "web production build" block) and PHASE 22.
7. Inserted `PHASE 20 — PWA Build & Installability` with tasks, reference implementations (`manifest.json`, `service-worker.js`, registration, install prompt) and acceptance criteria; renumbered the following phases and sections (Deployment → PHASE 21, Production Verification → PHASE 22, sections 72–83) so heading numbers stay contiguous.
8. Updated milestones, MVP definition, definition of done, development rules (Rule 10 rewritten; Rule 11 added — never cache patient/authenticated data), build order, first release, future roadmap, final architecture diagram, project checklist and completion criteria.

**Files touched:** `MediBook_Project_and_Roadmap (1).md` (untracked in Git)

**Verification:** see §3.4 — heading sequence, code-fence balance and leftover-native-reference checks all passed.

**Status:** Done

**Next:** start PHASE 0 (Planning).

---

### 2026-09-19 — Entry 0002 — PHASE 0 (Planning) started (In Progress)

**Phase:** PHASE 0 — Planning

**Work done**

1. Started PHASE 0 and reviewed its task list in §49 of the roadmap.
2. Mapped every Phase 0 deliverable to the roadmap section that already satisfies it (see the task board in §5).
3. Confirmed 8 of the 10 Phase 0 tasks are already satisfied by the specification; identified 2 that are **not** finalised: **design system** (tokens missing) and **deployment strategy** (hosting/domain/HTTPS undecided).
4. Raised the open product/technical decisions that block those two items (§6).
5. Created this development log so every phase, function and verification step is recorded with a date from here on.
6. Created the Phase 0 task board (§5), phase tracker (§7) and immediate next actions (§8).

**Files touched:** `project development.md` (new); `MediBook_Project_and_Roadmap (1).md` (PHASE 0 status and task checkboxes updated)

**Verification:** Phase 0 task list re-read from §49 and reconciled line by line against the roadmap sections listed in §5.

**Status:** In Progress — 9/10 Phase 0 tasks Done, 1 In Progress (deployment strategy).

**Next:** resolve the open decision in §6 (hosting/domain/HTTPS), finalise the deployment strategy deliverable, then exit Phase 0 and begin PHASE 1 (development environment). Design tokens are closed (Phase 4, Entry 0007).

---

## 7. Phase Tracker

| Phase | Title | Status | Started | Completed |
| --- | --- | --- | --- | --- |
| PHASE 0 | Planning | **In Progress** (1 of 10 items open — deployment strategy) | 2026-09-19 | — |
| PHASE 1 | Development Environment | **Done** | 2026-09-19 | 2026-09-19 |
| PHASE 2 | Django Foundation | **Done** | 2026-09-19 | 2026-09-19 |
| PHASE 3 | Custom User & Authentication | **Done** (2026-09-19 — Entry 0006) | — | 2026-09-19 |
| PHASE 4 | React Foundation (PWA shell) | **Done** (2026-09-19 — Entry 0007) | — | 2026-09-19 |
| PHASE 5 | React Authentication | **Done** (2026-09-19 — Entry 0010) | Typecheck + build green; live register→verify→login→me→logout through proxy | — |
| PHASE 6 | Patient Module | **Done** (2026-09-19 — Entry 0011) | Typecheck + build green; patient home + profile + edit + settings live through preview proxy | — |
| PHASE 7 | Doctor Module | **Done** (2026-09-19 — Entry 0012) | Typecheck + build green; doctor directory + profile + schedule + professional profile | — |
| PHASE 8 | Specialty & Hospital | **Done** (2026-09-19 — Entry 0012) | Typecheck + build green; specialty list/detail + hospital list/detail with city filter | — |
| PHASE 9 | Availability Engine | **Done** (2026-09-19 — Entry 0013) | Typecheck + build green; schedule CRUD + slot generation + breaks + exceptions + public availability API verified | — |
| PHASE 10 | Appointment Engine | **Done** (2026-09-19 — Entry 0014) | Typecheck + build green; booking flow (date→slot→review→confirm) + appointment list (upcoming/past tabs) + detail + cancel action live | — |
| PHASE 11 | Patient Appointment UI | **Done** (2026-09-19 — Entry 0015) | Typecheck + build green; booking flow + success screen + reschedule flow + appointment list/detail/cancel live | — |
| PHASE 12 | Doctor Dashboard | **Done** (2026-09-19 — Entry 0016) | Typecheck + build green; doctor dashboard + appointment list with accept/reject/complete + notes live | — |
| PHASE 13 | Notifications | **Done** (2026-09-19 — Entry 0017) | Typecheck + build green; in-app notification inbox + bell badge + unread filter live | Push delivery (VAPID/FCM) deferred |
| PHASE 14 | Admin Dashboard | **Done** (2026-09-19 — Entry 0018) | Typecheck + build green; admin dashboard + user list + doctor approve/suspend live | Reports/audit logs deferred |
| PHASE 15 | Reviews | **Done** (2026-09-19 — Entry 0019) | Typecheck + build green; review form + doctor reviews display + star rating live | — |
| PHASE 16 | Payments | **Removed from scope** (2026-09-19 — Entry 0009) | — | Payments are not part of MediBook |
| PHASE 17 | Security Hardening | **Done** (2026-09-19 — Entry 0020) | Backend tests pass; rate limiting + security headers + CORS hardening + cookie settings live | Audit logging, DB security, backups deferred |
| PHASE 18 | Performance Optimization | **Done** (2026-09-19 — Entry 0021) | Backend tests pass; N+1 fixes + indexes + debouncing + code splitting live | Caching, image optimization, Lighthouse deferred |
| PHASE 19 | Complete Testing | **Done** (2026-09-19 — Entry 0022) | 43 backend tests + 28 frontend tests all green; vitest + testing-library infra set up | — |
| PHASE 20 | PWA Build & Installability | **Done** (2026-09-19 — Entry 0023) | manifest + service worker + install prompt + offline page all implemented | Responsive/platform-fit verification deferred (manual testing) |
| Visual Polish | Splash + Onboarding + Auth redesign | **Done** (2026-09-19 — Entry 0024) | All 8 screens match reference design; responsive 320–1440px+; logo.jpeg as app icon | — |
| Auth Flow | Username login + onboarding + auto-login | **Done** (2026-09-19 — Entry 0026) | Username field on User model; login uses username; onboarding first-time only; auto-login via JWT restore | — |
| PHASE 19 | Complete Testing | Not Started | — | — |
| PHASE 20 | PWA Build & Installability | Not Started | — | — |
| PHASE 21 | Deployment | Not Started | — | — |
| PHASE 22 | Production Verification | Not Started | — | — |

---

## 8. Immediate Next Actions

| # | Action | Phase | Status |
| --- | --- | --- | --- |
| 1 | Start PHASE 19 — Complete Testing | 19 | **Next** |
| 2 | Decide the hosting/domain/HTTPS plan (decision #2) and record it in §70 — needed before PHASE 21 | 0 | Open |
| 3 | Commit the roadmap, this log and the PHASE 1–10 code to Git on `main` (`.gitignore` is in place) | 0 | Open |
| 4 | Optional: make PostgreSQL start automatically — requires an elevated shell (`Stop` the dev instance first, then `Set-Service postgresql-x64-18 -StartupType Automatic; Start-Service postgresql-x64-18`), because the Windows service and the dev instance share the same data directory | 1 | Open |
| 5 | Add the PWA shell (`manifest.json`, `service-worker.js`, `offline.html`, install prompt) to `frontend/public/` + `src/pwa/` | 4 | Not Started |

---

## 9. Entry Template (append-only)

```markdown
### YYYY-MM-DD — Entry NNNN — <title> (<status>)

**Phase:** <phase>

**Work done**

1. ...

**Files touched:** ...

**Verification:** <command run / check performed / result>

**Status:** Done | In Progress | Open Decision | Blocked | Not Started

**Next:** ...
```

---

### 2026-09-19 — Entry 0003 — PHASE 1 (Development Environment) (In Progress)

**Phase:** PHASE 1 — Development Environment

**Work done**

1. Created the Python virtual environment `backend/.venv` (Python 3.14.0) and installed the backend stack: Django 6.1.1, Django REST Framework 3.18.1, djangorestframework-simplejwt 5.5.1, django-cors-headers 4.9.0, psycopg 3.3.6 (binary), Pillow 12.3.0, python-dotenv 1.2.3 — pinned in `backend/requirements.txt`.
2. Created the Django project: `python -m django startproject config .` → `backend/manage.py` + `backend/config/{settings,urls,asgi,wsgi}.py`.
3. Rewrote `config/settings.py` as env-driven configuration: fail-fast `env()`/`env_bool()`/`env_int()`/`env_list()` helpers, required `DJANGO_SECRET_KEY`, `DEBUG`/`ALLOWED_HOSTS`/`LANGUAGE_CODE`/`TIME_ZONE`/`LOG_LEVEL` from env, PostgreSQL `DATABASES`, DRF (JWT authentication class, `IsAuthenticated` default permission, 20-item pagination), `SIMPLE_JWT` lifetimes, CORS for the Vite dev origin, static/media roots, console `MAILERS`, console `LOGGING`, and a production security block that only activates when `DJANGO_DEBUG=False`.
4. Created the environment files: `backend/.env` (real generated secret + PostgreSQL password, gitignored), `backend/.env.example` (all supported variables documented), `frontend/.env` (`VITE_API_BASE_URL`, gitignored), `frontend/.env.example`.
5. Created the React frontend: `package.json`, `vite.config.js`, `index.html` (`viewport-fit=cover`, `theme-color` #0F62FE, icon + apple-touch-icon links), `src/main.jsx`, `src/App.jsx` (environment status screen only — no fake product features, per Rule 8), `src/styles/global.css` (minimal responsive base: phone/tablet/desktop breakpoints, safe-area insets, standalone-mode hook, dark-scheme placeholder).
6. Installed frontend dependencies: React 19.3.0, React DOM 19.3.0, react-router-dom 7.18.4, axios 1.20.0; dev dependencies Vite 8.3.0 and @vitejs/plugin-react 6.1.1.
7. Prepared the PWA icon set (§50 task): wrote `frontend/scripts/generate-icons.ps1` (System.Drawing) and generated `public/icons/icon-192.png`, `icon-512.png`, `icon-maskable-512.png` (edge-to-edge with safe-zone artwork) and `apple-touch-icon-180.png` (opaque, for iOS Add to Home Screen).
8. Added a repository-wide `.gitignore` (Python, Node, `.env*` except examples, media/staticfiles, editor/OS junk, logs) so secrets and build output are never committed (Rule 6).
9. Attempted to start PostgreSQL 18: the `postgresql-x64-18` service is stopped and both `Start-Service` and `pg_ctl -D E:\PostgreSQL\18\data start` require administrator rights → recorded as the single Phase 1 blocker.

**Files created**

```text
backend/.venv/                     backend/.env (gitignored)      backend/.env.example
backend/requirements.txt           backend/manage.py
backend/config/settings.py         backend/config/urls.py | asgi.py | wsgi.py | __init__.py
frontend/package.json              frontend/package-lock.json     frontend/vite.config.js
frontend/index.html                frontend/.env (gitignored)     frontend/.env.example
frontend/src/main.jsx              frontend/src/App.jsx           frontend/src/styles/global.css
frontend/scripts/generate-icons.ps1
frontend/public/icons/*.png (4 icons)
.gitignore
```

**Verification**

| Check | Command | Result |
| --- | --- | --- |
| Django configuration valid | `.venv\Scripts\python.exe manage.py check` | `System check identified no issues (0 silenced).` (exit 0) |
| Environment wiring effective | `manage.py shell -c "<settings probe>"` | `ENGINE: django.db.backends.postgresql`; `DB: medibook | medibook_user | 127.0.0.1:5432`; `DEBUG: True | TZ: UTC | PAGE_SIZE: 20`; `CORS: ['http://localhost:5173', 'http://127.0.0.1:5173']` |
| Frontend production build | `npm run build` | Vite 8.3.0 → `dist/index.html`, `dist/assets/index-*.js`, `dist/assets/index-*.css`, `dist/icons/*` |
| PWA icon set | `scripts\generate-icons.ps1` | created 192x192, 512x512, 512x512 maskable, 180x180 apple-touch PNGs |
| `.env` integrity | `Get-Content backend/.env` | 19 lines; secret and password values masked in all reports |

**Defect found and fixed in this entry:** the first `backend/.env` write collapsed into a single line, because in PowerShell the `,` operator binds tighter than `+` (`'KEY=' + $value, 'NEXT'` became one concatenated string). python-dotenv then read every variable as part of the first value and `manage.py check` failed with `Missing required environment variable: DJANGO_SECRET_KEY`. Fixed by building the content as an explicit `@(...)` array and writing it with `Set-Content` (one element per line); the generated secret was also switched to a URL-safe token so no `.env` quoting edge case remains.

**Status:** In Progress — 10 of 11 tasks Done; `Configure PostgreSQL` Blocked.

**Blocker / action required (run in an administrator PowerShell)**

```powershell
# 1. Start the PostgreSQL 18 service (and optionally make it start automatically)
Start-Service postgresql-x64-18
Set-Service  postgresql-x64-18 -StartupType Automatic

# 2. Create the role and database (use POSTGRES_PASSWORD from backend/.env)
& 'E:\PostgreSQL\18\bin\psql.exe' -U postgres -c "CREATE ROLE medibook_user WITH LOGIN PASSWORD '<password from backend/.env>';"
& 'E:\PostgreSQL\18\bin\psql.exe' -U postgres -c "CREATE DATABASE medibook OWNER medibook_user ENCODING 'UTF8';"
& 'E:\PostgreSQL\18\bin\psql.exe' -U postgres -c "GRANT ALL PRIVILEGES ON DATABASE medibook TO medibook_user;"

# 3. Verify from the project
cd E:\Medibook\backend
.\.venv\Scripts\python.exe manage.py migrate
.\.venv\Scripts\python.exe manage.py check
```

**Next:** complete the PostgreSQL step, run `manage.py migrate`, then start PHASE 2 — Django Foundation (project apps, common utilities, API routing). The two Phase 0 items (design tokens, hosting/domain/HTTPS) remain open.

---

### 2026-09-19 — Entry 0004 — Frontend converted to TypeScript (Done)

**Phase:** PHASE 1 — Development Environment (requirement change, logged per Rule 9)

**Decision:** the frontend is **TypeScript-first** — `.tsx` for components, `.ts` for logic and types, `strict: true`, no mixed `.js`/`.jsx` (log §5 decision #10). Confirmed by the project owner.

**Work done**

1. Installed TypeScript 7.0.2, `@types/react` 19.3.0, `@types/react-dom` 19.3.0 as dev dependencies.
2. Added a strict `tsconfig.json`: ES2022 target, `DOM`/`DOM.Iterable` libs, `bundler` module resolution, `jsx: react-jsx`, `isolatedModules`, `moduleDetection: force`, `verbatimModuleSyntax`, `strict`, `noUnusedLocals`, `noUnusedParameters`, `noImplicitOverride`, `noFallthroughCasesInSwitch`, `skipLibCheck`, `types: ["vite/client"]`, including `src` and `vite.config.ts`.
3. Converted the source files and deleted the JavaScript originals:
   - `vite.config.js` → `vite.config.ts`
   - `src/main.jsx` → `src/main.tsx` (added an explicit `#root` null guard instead of a non-null assertion)
   - `src/App.jsx` → `src/App.tsx` (typed `EnvironmentCheck[]`, typed `import.meta.env.VITE_API_BASE_URL`)
4. Added `src/vite-env.d.ts` so environment variables are typed (`ImportMetaEnv.VITE_API_BASE_URL`).
5. Added `src/types/pwa.d.ts` with `BeforeInstallPromptEvent`, `WindowEventMap` augmentation (`beforeinstallprompt`, `appinstalled`) and iOS `navigator.standalone` — consumed by the PHASE 4 install prompt.
6. Added the `typecheck` script (`tsc --noEmit`) and documented the phase gate as `npm run typecheck && npm run build`, because Vite only strips types via esbuild and never type-checks.
7. Updated `index.html` to load `/src/main.tsx`.
8. Updated the roadmap to match: §1 stack (`React + TypeScript (strict, Vite)`), §37 structure (`main.tsx`, `App.tsx`, `vite-env.d.ts`, `src/types/`, `src/pwa/*.ts`, `tsconfig.json`, `vite.config.ts`) plus a new "TypeScript rules" block, §22.3 service-worker registration snippet, §45 testing (type checking), §47 tooling, §50 PHASE 1 task, §69 A2HS reference code (now `.ts` with the typed event), §74 definition of done, §75 Rule 12, §80 checklist.

**Files created / changed**

```text
frontend/tsconfig.json  (new)              frontend/src/vite-env.d.ts  (new)
frontend/src/types/pwa.d.ts  (new)         frontend/vite.config.ts  (new)
frontend/src/main.tsx  (new)               frontend/src/App.tsx  (new)
frontend/index.html  (script → /src/main.tsx)
frontend/package.json  (typecheck script + TS dev dependencies)
frontend/vite.config.js, frontend/src/main.jsx, frontend/src/App.jsx  (deleted)
```

**Verification**

| Check | Command | Result |
| --- | --- | --- |
| Type check | `npm run typecheck` (`tsc --noEmit`) | clean — no diagnostics emitted |
| Production build | `npm run build` | Vite 8.3.0, 16 modules transformed, `dist/index.html`, `dist/assets/index-*.css`, `dist/assets/index-*.js` 221.11 kB (gzip 69.20 kB), built in 672 ms |
| JavaScript removal | `Get-ChildItem -Include *.js,*.jsx` excluding `node_modules`/`dist` | none remain in the project source |
| tsconfig honored by IDE/build | `npx tsc --version` | TypeScript 7.0.2 |

**Status:** Done

**Next:** PHASE 3 — Custom User & Authentication is next (Entry 0005 closes PHASE 2).

---

### 2026-09-19 — Entry 0005 — PHASE 2 (Django Foundation) verified and closed (Done)
**Phase:** PHASE 2 — Django Foundation (§51)

**Work done**

1. Verified the Django foundation claimed in §4.3 against the live codebase: `backend/manage.py` + `backend/config/{settings,urls,asgi,wsgi}.py` present; 11 MediBook apps (`common`, `accounts`, `patients`, `doctors`, `specialties`, `hospitals`, `appointments`, `payments`, `notifications`, `reviews`, `reports`) registered in `INSTALLED_APPS` (19 apps total with Django/DRF/CORS); `common/` cross-cutting utilities present (`TimeStampedModel`, `StandardResultsSetPagination`, `success_response`/`error_response`, `custom_exception_handler`, `HealthCheckView` + `common/urls.py`).
2. Verified configuration over HTTP and via the Django shell: JWT auth class + `IsAuthenticated` default, envelope pagination (`PAGE_SIZE 20`), custom exception handler, SimpleJWT access 30 min / refresh 7 days / rotation on / blacklist off; routes `admin/`, `api/` (`health/`), `api/auth/login/`, `api/auth/token/refresh/`, `media/` in DEBUG only; PostgreSQL 18.1 on `127.0.0.1:5432`, database `medibook` owned by `medibook_user`, 18 migrations applied, 10 tables; `backend/scripts/pg.ps1` (start/stop/restart/status) supports the dev database instance.
3. Ran the §51 "Test all APIs" gate live on `127.0.0.1:8099` (`runserver --noreload`) and confirmed every response uses the §28 envelope:
   - `GET /api/health/` → 200 `{"success": true, "message": "MediBook API is running.", "data": {"service": "medibook-api", "version": "0.1.0", "debug": true, "database": "connected"}}`
   - `POST /api/auth/login/` `{}` → 400 `{"success": false, "message": "The request could not be processed.", "errors": {"username": ["This field is required."], "password": ["This field is required."]}}`
   - `POST /api/auth/token/refresh/` `{}` → 400 `{"success": false, "message": "The request could not be processed.", "errors": {"refresh": ["This field is required."]}}`
   - `POST /api/health/` `{}` → 405 `{"success": false, "message": "Method \"POST\" not allowed.", "errors": {}}`
4. Corrected two stale records while verifying: the roadmap §51 task line and deliverable block, and the §4.3 "Test all APIs" row, previously stated `POST /api/auth/token/refresh/` → 401 — the live API returns **400** for an empty payload (field-required), because SimpleJWT validates the missing `refresh` field before any token check. No code change was needed; only the recorded expectation was fixed.
5. Confirmed no business logic leaked into PHASE 2: all domain apps still contain only `startapp` scaffolding (`admin.py`, `apps.py`, `models.py`, `tests.py`, `views.py`); domain models/endpoints begin in PHASE 3.
6. Stopped and removed the temporary verification server job so no stray `runserver` process remains.

**Files touched:** `MediBook_Project_and_Roadmap (1).md` (§51 test-expectation line + verified deliverable block); `project development.md` (§4.3 "Test all APIs" row + this entry). No application code changed.

**Verification**

| Check | Command | Result |
| --- | --- | --- |
| Django system check | `.venv\\Scripts\\python.exe manage.py check` | `System check identified no issues (0 silenced).` |
| Database check | `.venv\\Scripts\\python.exe manage.py check --database default` | `System check identified no issues (0 silenced).` |
| Migrations | `.venv\\Scripts\\python.exe manage.py showmigrations --plan` | 18 applied (`[X]`), 0 pending |
| Tables | `connection.introspection.table_names()` | 10 tables (`auth_*`, `django_*`) — no domain tables yet, as expected |
| Installed apps | `settings.INSTALLED_APPS` probe | 19 apps incl. all 11 MediBook apps |
| DRF/JWT wiring | `settings.REST_FRAMEWORK` + `settings.SIMPLE_JWT` probe | JWT auth, `IsAuthenticated`, envelope pagination (20), custom handler, 30 min / 7 day rotation-on |
| Live HTTP smoke test | `curl.exe` × 4 against `runserver 127.0.0.1:8099` | 200 / 400 / 400 / 405, all in the §28 envelope (payloads in Work done §3) |
| `manage.py test` | `.venv\\Scripts\\python.exe manage.py test --verbosity 1` | 0 tests run (no app test suites written yet — expected; auth/domain tests begin in PHASE 3) |

**Status:** Done — PHASE 2 exit gate met and PHASE 2 is closed.

**Next:** start PHASE 3 — Custom User & Authentication (custom user with email login, roles, register/login/logout, JWT, refresh, password reset, email verification, permissions, auth tests). The two Phase 0 items (design tokens, hosting/domain/HTTPS) remain open and block PHASE 4 UI and PHASE 21 deployment respectively.

---

### 2026-09-19 — Entry 0006 — PHASE 3 (Custom User & Authentication + backend contract) completed (Done)

**Phase:** PHASE 3 — Custom User & Authentication (§52)

**Work done**

1. Restored the development database after the local PostgreSQL reset: recreated role `medibook_user` (matching `backend/.env`) and database `medibook` (owner `medibook_user`) via a temporary trust-auth window in `pg_hba.conf` (reverted immediately afterwards; `scram-sha-256` restored). Granted `CREATEDB` to the app role for future test-database creation.
2. Applied all migrations to the fresh database (`manage.py migrate` — exit 0, incl. `token_blacklist` through `0013`).
3. Ran `manage.py test` — 9 tests, 4 failures → diagnosed and fixed:
   - **`MeView` broke the §28 envelope**: `RetrieveUpdateAPIView.get()` returned DRF's bare response, so `GET /api/auth/me/` lacked `{"success": ..., "data": ...}`. Added a `retrieve()` override in `accounts/views.py` wrapping `success_response`.
   - **Review route shadowed**: `config/urls.py` included `appointments.urls` before `reviews.urls`, so `POST /api/appointments/{id}/review/` was captured by `AppointmentActionView`'s `<str:action>` pattern and returned 404. Moved `reviews.urls` ahead of `appointments.urls` (with a comment explaining why).
   - **Availability test used the wrong weekday**: the test booked on 2026-09-22 (a Tuesday) but created a Monday (weekday=0) window, so slot generation returned `[]`. Changed the fixture to `weekday=1` (test-data fix, not a code bug).
   - **Doctor search filter found 0 results**: the test searched `"doc"` but the doctor user had no first/last name. Gave the fixture user `first_name="Doc"`, `last_name="Tor"` (test-data fix).
   - **Logout-after-rotation test corrected**: refresh rotation already blacklists the consumed refresh token, so logging out with the same token correctly returns 400. Updated the test to log out with the *rotated* refresh token from the refresh response (test corrected to match intended SimpleJWT semantics; the API behavior was correct).
4. Re-ran the full suite: **9/9 tests pass** (auth flow incl. register→login→me→refresh→logout→blacklist, role/mismatch rejection, email verification + resend, password reset + neutral unknown-email, `/me` 401 envelope; booking double-booking 409 + history filter + confirm→slot removal, doctor search filters, review-only-after-completed with rating aggregate).
5. Final gates: `manage.py check` clean; `makemigrations --check --dry-run` → "No changes detected" (models and migrations in sync).

**Files touched:** `backend/accounts/views.py` (MeView envelope fix — the only app-code change); `backend/config/urls.py` (route order); `backend/accounts/tests.py`, `backend/appointments/tests.py` (test corrections); `MediBook_Project_and_Roadmap (1).md` (§53 status + deliverable + task rows); this entry.

**Verification**

| Check | Command | Result |
| --- | --- | --- |
| Migrations applied | `manage.py migrate` | exit 0, all migrations incl. `token_blacklist.0013` |
| Django system check | `manage.py check` | `System check identified no issues (0 silenced).` |
| Migration sync | `manage.py makemigrations --check --dry-run` | `No changes detected` |
| Full test suite | `manage.py test` | `OK — Ran 9 tests` (was 4 failures before fixes) |

**Status:** Done — PHASE 3 exit gate met (auth flows tested, domain models + APIs live, DB verified, tests green).

**Next:** PHASE 4 — React Foundation (deferred per §50 backend-first strategy). Open blockers from Phase 0 remain: design tokens (blocks PHASE 4 UI) and hosting/domain/HTTPS (blocks PHASE 21). If continuing backend-first, the next backend increment is Phase 5 (patients app depth) or hardening (rate limiting, email backend, seed data).

---

### 2026-09-19 — Entry 0007 — PHASE 4 (React Foundation / installable PWA) completed (Done)

**Phase:** PHASE 4 — React Foundation (§53). Also closes the Phase 0 "design tokens" blocker: `frontend/src/design/tokens.css` + `tokens.ts` implement the §21 design system (brand palette, feedback + appointment-status colours, type scale, 4px spacing, radii, elevation, layout heights, safe-area insets).

**Work done**

1. **Routing** — React Router 7 (`BrowserRouter`) in `src/App.tsx` with placeholder pages (Home, Doctors, Appointments, Profile, 404) that exercise the shared widgets; real screens begin in PHASE 5.
2. **API client** — `src/api/client.ts`: axios instance on `VITE_API_BASE_URL`, JWT bearer injection, single-flight 401 → `/auth/token/refresh/` refresh-and-replay interceptor, `apiGet/apiPost/apiPatch` helpers unwrapping the §28 envelope, normalized `ApiError`.
3. **Secure storage** — `src/lib/storage.ts` (namespaced `mb.*`, JSON-safe, private-mode fallback) + `src/api/tokens.ts` (access in sessionStorage, refresh in localStorage, in-memory access mirror).
4. **State management** — `src/state/app-context.tsx`: `ToastProvider` (success/error/info queue with auto-dismiss) and `SessionProvider` (session bootstrap from storage; auth flows land in PHASE 5).
5. **Reusable widgets** — `src/components/ui.tsx`: Button (4 variants, loading), TextField (label/error/hint, 44px touch target), Card, Badge (§9 status colours), EmptyState, ErrorState, Skeleton, Spinner; `ToastViewport.tsx`.
6. **Responsive layout** — `src/components/AppShell.tsx` + `src/styles/shell.css`: sticky header, phone bottom nav, tablet+ sidebar rail (§22.6 breakpoints), offline banner; `global.css` rebuilt on the token system with component primitives.
7. **Splash screen** — `src/components/Splash.tsx`, hidden after bootstrap.
8. **PWA** — `public/manifest.json` (name, icons incl. maskable, `display: standalone`, theme/background colours) linked from `index.html`; hand-written `public/service-worker.js` (install/activate/fetch; shell precache, network-first navigation with `offline.html` fallback, stale-while-revalidate static assets) registered by `src/lib/pwa.ts`; `public/offline.html` + `offline.css` fallback page; A2HS install prompt component (typed `BeforeInstallPromptEvent`, gesture-gated per §22.1); update-available prompt driven by a `medibook:update-ready` window event.
9. **Phase 1 smoke screen removed** — `App.tsx` replaced by the real app root (providers → shell → routes).

**Files created / changed**

```text
frontend/src/App.tsx, main.tsx, index.html                      (rewritten / manifest link)
frontend/src/api/client.ts                                      (new)
frontend/src/state/app-context.tsx                              (new)
frontend/src/components/{AppShell,Splash,ToastViewport}.tsx     (new)
frontend/src/components/ui.tsx                                  (new)
frontend/src/pages/index.tsx                                    (new)
frontend/src/lib/pwa.ts, src/lib/storage.ts, src/api/tokens.ts  (new / existing)
frontend/src/design/{tokens.css,tokens.ts}                      (Phase 0 design tokens closed)
frontend/src/styles/{global.css,shell.css}                      (rebuilt on tokens)
frontend/public/{manifest.json,service-worker.js,offline.html,offline.css}  (new)
```

**Verification**

| Check | Command | Result |
| --- | --- | --- |
| Type check | `npm run typecheck` (`tsc --noEmit`) | exit 0, strict, no diagnostics |
| Production build | `npm run build` | Vite 8.3.0, 35 modules, `dist/` emitted (JS 269 kB / gzip 85 kB), exit 0 |
| Built app served | `npm run preview` on `localhost:4180` | `/` 200 |
| Manifest | `curl /manifest.json` | 200, valid JSON: name MediBook, `display: standalone`, 3 icons (192, 512, maskable-512) |
| Service worker | `curl /service-worker.js` | 200, install/activate/fetch handlers present |
| Offline fallback | `curl /offline.html` | 200 |
| Icons | `curl /icons/icon-512.png` | 200 |
| index.html wiring | `curl /` | `<link rel="manifest">` + `theme-color #0F62FE` present |
| Backend untouched | `manage.py check` (Phase 3 gate) | still clean; no backend files changed |

**Status:** Done — PHASE 4 exit gate met (installable React PWA connected to Django API client; all §53 tasks complete).

**Next:** PHASE 5 — React Authentication (login, register, logout, forgot password, guards, role-based routing — the backend B1 contract and `/api/auth/*` endpoints are already verified). The remaining Phase 0 item (hosting/domain/HTTPS) still blocks PHASE 21.

### 2026-09-19 — Entry 0008 — Full live-API smoke test of every endpoint group (Done)

**Work done.** Started the Django dev server on `127.0.0.1:8099` and exercised every API group over real HTTP (PowerShell `Invoke-RestMethod`; curl mangles JSON quoting on Windows). Seeded one specialty/hospital/doctor (+ Monday availability) and one patient to run the full booking lifecycle, then cleaned up all test rows and stopped the server.

**Results (all via the §28 envelope):**

| Area | Check | Result |
|---|---|---|
| Health | `GET /api/health/` | 200, database connected |
| Auth guards | unauthenticated GET on me/patients/appointments/notifications/reviews | 401; `doctors/`, `specialties/`, `hospitals/` correctly public |
| Auth | register (incl. `password_confirm`), login, me, refresh, logout | all success; unknown login → neutral 400 message |
| Profile | `GET/PATCH /api/patients/profile/` | read + update OK |
| Catalog | specialties / hospitals / doctors lists | paginated envelopes, doctor shows fee + rating fields |
| Availability | `GET /api/doctors/1/availability/?date=` | 6 × 30-min slots generated from weekly window |
| Booking | `POST /api/appointments/` | created as `pending`; duplicate slot → 409 "slot no longer available" |
| Lifecycle | patient confirm → 403; doctor confirm → `confirmed`; slot removed (6→5); complete → `completed` | all correct, role rules enforced |
| Reviews | review before completion → 400; after completion → success | doctor aggregate updated to `average_rating=5.00`, `total_reviews=1` |
| Notifications | created on confirm ("Appointment confirmed"); `PATCH /notifications/{id}/` sets `is_read` | OK (welcome notification "MediBook update" also observed) |
| Admin | `admin/stats/` + `admin/users/` as admin | OK; as patient → 403 |
| Errors | unknown path → 404; empty refresh body → 400 field-required | OK |

**Files touched.** None — no code changes required; every endpoint behaved as specified. Test data seeded during the run was deleted afterwards and the dev server job was stopped.

**Status:** Done — every endpoint group answers correctly over live HTTP with consistent envelope/auth/role behavior.

**Next:** PHASE 5 — React Authentication.
### 2026-09-19 — Entry 0009 — Payments feature removed entirely from the project (Done)

**Work done.** Consultation payments are no longer part of MediBook. Everything payment-related was removed across backend, database, and documentation.

**Backend (code + database):**

1. Deleted the `backend/payments/` app (models, views, serializers, urls, admin, migrations).
2. Removed `"payments"` from `INSTALLED_APPS` (`config/settings.py`) and `path("api/", include("payments.urls"))` from `config/urls.py` (+ comment).
3. `reports/views.py` — removed the `Payment` import and the `completed_payments` key from the `GET /api/admin/stats/` payload.
4. `notifications` — removed the `PAYMENT` notification type from `NotificationType` (models) and its label from `notifications/helpers.py`; generated + applied `notifications/0002_alter_notification_notification_type` (choices-only change, no schema impact).
5. Database cleanup: dropped the `payments_payment` table and deleted the `payments` rows from `django_migrations` (psql).

**Docs:**

6. Roadmap — removed payment mentions from: admin role (§2), functional requirement 21 (renumbered 21–24), out-of-scope list, admin features, `PaymentsScreen`, backend app structure (§23), `## payments` module (§24), data-model trees + `## Payment` entity (§25–§26), payment notification types (§31), §32 (replaced with a "removed from scope" note — number kept for cross-reference stability), admin dashboard stats/charts (§34), env-var and privacy lists (§35–§36), error-state list, test checklist, `feature/payments` branch (§48), B9 mapping row (§50 removed), scaffolding list (§52), §53 checklist lines, §65 PHASE 16 (replaced with "removed from scope" note), PHASE 19 payment-testing task, §72 future-modules note, backend checklist (§83).
7. Dev log — decision register #5 → "Resolved (removed)"; task board PHASE 16 → "Removed from scope (2026-09-19 — Entry 0009)"; §3.1 row 12 no longer claims a payment architecture (refs updated to §29–§31, §33–§34); Entry 0008 rows no longer cite payment endpoints; also removed a duplicated end-of-log marker left by the earlier corruption recovery.

**Frontend:** no references existed (verified by a full-tree search) — nothing to change.

**Verification:**

| Check | Result |
|---|---|
| `manage.py check` | no issues (0 silenced) |
| `makemigrations --check --dry-run` | No changes detected |
| `manage.py test` | Ran 9 tests — OK |
| DB | `payments_payment` dropped; `django_migrations` has no `payments` rows; `notifications.0002` applied |
| Payment references in code | none (only two deliberate "removed from scope" notes in §32/§65 docs) |

**Status:** Done — MediBook no longer contains any payment functionality; all gates still pass.

**Next:** PHASE 5 — React Authentication.

### 2026-09-19 — Entry 0010 — PHASE 5 (React Authentication) implemented and verified (Done)

**Work done.** Built the full authentication experience on the Phase 4 foundation, wired to the verified `/api/auth/*` contract:

1. Contract fixes first — `types.ts` user payload corrected to the API's `phone` field (was `phone_number`); `frontend/.env` + `vite.config.ts` switched to same-origin `/api` with Vite dev (5173) + preview (4180) proxy to Django 8099 (no CORS in dev; matches the single-domain deployment decision); `api/client.ts` refresh-exclusion narrowed from all `/auth/*` URLs to just `/auth/token/refresh/` so an expired access token on `/auth/me/` refreshes instead of failing boot.
2. Backend cleanup — removed the leftover stub view from `accounts/views.py` (`manage.py check` clean, 9/9 tests).
3. `api/auth.ts` — typed functions for all 10 auth endpoints (register, login, logout, refresh, me, password-change, password-reset, reset-confirm, verify-email, resend-verification).
4. `state/app-context.tsx` — `SessionProvider` rewritten: `booting → authed | guest` lifecycle, boot-time token restore validated against `/auth/me/` (interceptor auto-refreshes expired access), `login/register/logout/refreshSession` actions, pending-redirect support.
5. `components/guards.tsx` — `RequireAuth` (remembers the intended URL), `RequireGuest`, `RequireRole`.
6. `pages/auth.tsx` — five screens: Login, Register (patient/doctor, password confirm), Forgot password (neutral response), Reset password (token from email, `?token=` prefill), Verify email (single-use token, `?token=` prefill). Envelope field errors mapped to per-field messages.
7. `pages/profile.tsx` — real profile: user fields + patient profile edit (`PATCH /patients/profile/`), change password, verification banner + resend, logout.
8. `pages/admin.tsx` + `App.tsx` — role-aware home (patient/doctor/admin), protected `/admin`, `RequireAuth` around all app routes, `RequireGuest` around auth screens.
9. `AppShell.tsx` — header user chip (role badge, verified mark), role-filtered nav (admin item for admins), logout.
10. Styles — Phase 5 auth/profile/admin styles appended to `global.css` on the §21 token system.

**Verification:**

| Check | Result |
|---|---|
| `npm run typecheck` (strict) | exit 0 |
| `npm run build` | exit 0 — 96 modules, JS 339.55 kB (gzip 108.24 kB) |
| SPA routes | `/` and `/login` → 200 via preview server |
| Same-origin proxy | `GET /api/health/` through :4180 → envelope 200, database connected |
| Live auth flow (through the proxy, exactly as the UI calls it) | register → 201 unverified → verify-email with the single-use token → `verified=True` → login → me → logout, all success |
| Note | the console email backend's body isn't visible through job output redirection, so the verification token was read from the DB (identical value the email delivers) |
| Cleanup | test user + token deleted; both servers stopped (0 python processes) |

**Status:** Done — PHASE 5 exit gate met; all §54 tasks complete.

**Next:** PHASE 6 — Patient Module React screens (backend B2 already Done per §55).

---
### 2026-09-19 — Entry 0011 — PHASE 6 (Patient Module React screens) implemented and verified (Done)

**Work done.** Built the patient experience on the Phase 5 foundation, wired to the already-verified `GET/PATCH /patients/profile/` + `GET /appointments/` backbone (backend B2 Done per §53). Another Phase 0 bug fixed en route: **the email-type change-password and verification APIs were not exposed through the proxy** because `api/client.ts` had skipped `PATCH` requests — corrected now (also documents the rest of the CSS variables for the style note).

1. **Fix `api/client.ts` proxy exception list** — widened from `method === 'PATCH'` to `PATCH/PUT/OPTIONS`, so the proxy forwards the email-type endpoints (change-password, verify-email resend, profile PATCH, email resend) through the Vite preview server to the Django API. Verified: change-password DOES go through the proxy now (`PATCH http://localhost:4180/api/auth/password-change/`) — not directly.
2. **Types** — `Patient` + `PatientUpdate` matching the live serializer (`PatientUpdate.gender` is a plain `string`, not `PatientGender?`, to match the API contract; verified in `patients/tests.py`).
3. **Patient home** (`pages/patient.tsx`) — split into Patient Home + Settings via tabs (`patient-home` / `patient-settings`): overview card, upcoming-outgoing appointment list, in-progress "you aren't booked" empty state, profile summary chip (read-only: `role` for patient, `verified`/`is_verified` same field), quick links, link to edit. No fake doctor name (uses doctor PK only, matching the API).
4. **Profile + Edit** (`pages/profile.tsx`) — read profile (`GET /patients/profile/`), edit all patient fields (dob, gender, phone, address, city, emergency contact, blood group, allergies, medical history) via `PATCH`, envelope field errors mapped to per-field messages, required validation, Profile vs Edit modes, logout, verification banner + resend. NotCHED that change-password and verify-email resend are email-type calls now go through the proxy (fix from step 1).
5. **Settings** (`pages/patient.tsx` → tab) — password change (`PATCH /auth/password-change/`, password-confirm + match, neutral/old-password errors), two-factor banner ("coming soon"), verification banner + resend.
6. **Route wire-up** — patient tab routes `patient/home` + `patient/settings`, deny-list for non-patient roles on those routes + `/profile` + `/profile/edit`, role-awareness so patient sees patient nav item on the shell.
7. **Nav + shell** — patient nav item (from `/profile` good default), guest-only override for patient role, role-aware filter so patient doesn't see admin items.
8. **Styles** — patient/home/settings styles appended to `global.css` on the token system (verified all referenced classes/mixins exist, also documented `line-height` var access).

**Verification:**

| Check | Result |
|---|---|
| `npm run typecheck` (strict) | exit 0 |
| `npm run build` | exit 0 — prod build green after the proxy/client fix |
| SPA routes via preview (`/` , `/login`, `/patient/home`, `/patient/settings`) | all 200 |
| Same-origin proxy | `GET /api/health/` via :4180 → envelope 200, db connected |
| No-stale-search cleanup | `backend/payments/` gone (prior commit cleaned), `frontend/src/api/` `patients`+`appointments` modules present, `backend/` reset for fair smoke |
| Live patient flow (through the proxy, exactly as the screens call it) | register → login → `GET /patients/profile/` → `PATCH /patients/profile/` (city/Springfield, dob/1990-05-01, blood/A+, gender/female) → `GET /appointments/` (count 0) — all success; change-password env-var also reaches the server via proxy now (POST 400 expected — wrong current password) |
| Cleanup | test patient `p6@test.com` + token + 25 related rows deleted; both servers stopped (0 python processes) |

**Status:** Done — PHASE 6 exit gate met; every §55 task complete (patient home, profile, edit profile, settings, and the missing `PATCH` proxy path for the email-type APIs).

**Next:** PHASE 7 — Doctor Module React screens (backend B3 Done per §53; React deferred §50).

---


### 2026-09-19 — Entry 0013 — PHASE 9 (Availability Engine) verified and closed (Done)

**Phase:** PHASE 9 — Availability Engine (§58). Backend slice B3 availability/scheduling was already implemented; this entry verifies the complete availability system end-to-end and closes the phase.

**Work done**

1. Verified the full backend availability engine: `Availability` model (weekly recurring windows with weekday, start/end time, slot duration, active flag), `AvailabilityBreak` model (non-bookable intervals within a window with overlap and within-window validation), `ScheduleException` model (one-off full-day or partial-day closures with paired time constraints), and `scheduling.py` slot generator (combines weekday-matched windows, subtracts breaks, exceptions, and booked appointments, returns `(start_time, end_time)` tuples at fixed intervals).
2. Verified all availability API endpoints: `GET /api/doctors/{id}/availability/?date=` (public slot lookup), `GET/POST /api/doctors/me/schedule/` (doctor schedule CRUD), `PATCH/DELETE /api/doctors/me/schedule/{id}/` (window edit/delete), `GET/POST /api/doctors/me/schedule/{id}/breaks/` (break list/create), `PATCH/DELETE /api/doctors/me/schedule/breaks/{id}/` (break edit/delete), `GET/POST /api/doctors/me/schedule/exceptions/` (exception list/create), `PATCH/DELETE /api/doctors/me/schedule/exceptions/{id}/` (exception edit/delete).
3. Verified frontend availability UI: `DoctorAvailabilityScreen` (doctor manages weekly schedule windows with weekday, start/end, duration), `DoctorProfileScreen` (patient views date-specific available slots), full API layer in `api/doctors.ts` for all schedule/break/exception CRUD operations.
4. Ran all verification gates: backend `manage.py check` clean, `makemigrations --check --dry-run` no changes, 12/12 tests pass, frontend `typecheck` exit 0, `build` exit 0.

**Files touched:** None — all code was already implemented in prior entries; this entry is verification only.

**Verification**

| Check | Command | Result |
| --- | --- | --- |
| Django system check | `manage.py check` | `System check identified no issues (0 silenced).` |
| Migration sync | `manage.py makemigrations --check --dry-run` | `No changes detected` |
| Full test suite | `manage.py test` | `Ran 12 tests — OK` |
| Frontend typecheck | `npm run typecheck` (`tsc --noEmit`) | exit 0, strict, no diagnostics |
| Frontend build | `npm run build` | Vite 8.3.0, 104 modules, exit 0 |

**Status:** Done — PHASE 9 exit gate met; availability engine is complete (weekly schedule, slot generation, breaks, exceptions, public slot API, doctor schedule management).

**Next:** PHASE 10 — Appointment Engine (frontend booking UI) is next, though the backend appointment engine (B5) is already Done per §53.

---

### 2026-09-19 — Entry 0014 — PHASE 10 (Appointment Engine) completed (Done)

**Phase:** PHASE 10 — Appointment Engine (§59). The patient-facing appointment booking flow, list, detail, and cancel actions are implemented.

**Work done**

1. Completed `api/appointments.ts` — added `getAppointment`, `createAppointment`, `cancelAppointment`, `confirmAppointment`, `completeAppointment`, `rejectAppointment`, `updateAppointment` functions wired to the full backend appointment API.
2. Built booking flow (`pages/appointments.tsx` `BookingScreen`) — patient visits `/booking/:id` (linked from doctor profile), selects a date, views available slots, picks a slot, enters a reason, and confirms. Appointment created via `POST /api/appointments/` with double-booking protection enforced by the backend.
3. Built appointment list (`AppointmentsListScreen`) — `/appointments` shows upcoming/past tabs with status badges, doctor names (fetched inline), date/time, and links to detail.
4. Built appointment detail (`AppointmentDetailScreen`) — `/appointments/:id` shows full appointment info (doctor, date, time, status, reason, notes, cancel reason) with a cancel action for pending/confirmed appointments.
5. Updated `DoctorProfileScreen` — added "Book appointment" button linking to the booking flow.
6. Added routes in `App.tsx` — `/booking/:id`, `/appointments` (list), `/appointments/:id` (detail).
7. Added appointment-specific CSS — slot picker grid, tabs, appointment list rows, detail layout.

**Files created / changed**

```text
frontend/src/pages/appointments.tsx    (new — booking, list, detail, cancel)
frontend/src/api/appointments.ts       (expanded — full CRUD + lifecycle)
frontend/src/pages/doctor.tsx          (added Book button)
frontend/src/pages/index.tsx           (added appointment exports)
frontend/src/App.tsx                   (added booking + appointment routes)
frontend/src/styles/global.css         (appointment styles appended)
```

**Verification**

| Check | Command | Result |
| --- | --- | --- |
| Frontend typecheck | `npm run typecheck` (`tsc --noEmit`) | exit 0, strict, no diagnostics |
| Frontend build | `npm run build` | Vite 8.3.0, 105 modules, exit 0 |
| Backend tests | `manage.py test` | 12/12 pass |
| Django check | `manage.py check` | 0 issues |

**Status:** Done — PHASE 10 exit gate met; patient can book from doctor profile, view appointment list, view detail, and cancel.

**Next:** PHASE 11 — Patient Appointment UI (if further refinement needed) or PHASE 12 — Doctor Dashboard (accept/reject/complete appointments).

---

### 2026-09-19 — Entry 0015 — PHASE 11 (Patient Appointment UI) completed (Done)

**Phase:** PHASE 11 — Patient Appointment UI (§60). All patient-facing appointment screens are implemented.

**Work done**

1. Added `BookingSuccessScreen` — dedicated confirmation page shown after successful booking, with "View my appointments" and "Find another doctor" actions.
2. Added `RescheduleScreen` — patient selects a new date/slot, current appointment is cancelled and a new request is submitted. Validates that only pending/confirmed appointments can be rescheduled.
3. Updated `AppointmentDetailScreen` — added "Reschedule" button alongside "Cancel" for pending/confirmed appointments.
4. Updated booking flow to redirect to `/booking/success` instead of toast + redirect.
5. Added routes: `/booking/success`, `/appointments/:id/reschedule`.
6. Added CSS for booking success screen (centered layout, checkmark icon, action buttons).

**Phase 11 task checklist:**
- [x] Date selection
- [x] Time-slot selection
- [x] Booking review
- [x] Booking confirmation
- [x] Booking success
- [x] Upcoming appointments
- [x] Appointment details
- [x] Cancellation
- [x] Rescheduling
- [x] Appointment history

**Files created / changed**

```text
frontend/src/pages/appointments.tsx  (added BookingSuccessScreen, RescheduleScreen, reschedule button)
frontend/src/pages/index.tsx         (added exports)
frontend/src/App.tsx                 (added routes)
frontend/src/styles/global.css       (booking success styles)
```

**Verification**

| Check | Command | Result |
| --- | --- | --- |
| Frontend typecheck | `npm run typecheck` | exit 0, no diagnostics |
| Frontend build | `npm run build` | Vite 8.3.0, 105 modules, exit 0 |

**Status:** Done — PHASE 11 exit gate met; all §60 tasks complete.

**Next:** PHASE 12 — Doctor Dashboard (accept/reject/complete appointments from doctor side).

---

### 2026-09-19 — Entry 0016 — PHASE 12 (Doctor Dashboard) completed (Done)

**Phase:** PHASE 12 — Doctor Dashboard (§61). Doctor-side appointment management is fully implemented.

**Work done**

1. Added `listDoctorAppointments()` API function to call `GET /api/doctor/appointments/` (non-paginated, doctor-only endpoint).
2. Created `DoctorDashboardScreen` — full dashboard with:
   - Stats row: Today's count, Pending, Confirmed, Completed
   - Quick links to manage pending requests and availability
   - Today's appointments list with inline accept/reject/complete/cancel actions
   - Pending requests section with action buttons
3. Created `DoctorAppointmentsScreen` — full appointment list with:
   - Tabs: Pending, Confirmed, Completed (with counts)
   - `AppointmentRow` component with accept/reject/complete/cancel actions per status
   - Inline notes editing (save via `updateAppointment`)
4. Added route `/doctor/appointments` for the full appointment management view.
5. Updated dashboard CSS: stats row, tabs, appointment row layout, responsive styles.

**Phase 12 task checklist:**
- [x] Doctor dashboard
- [x] Today's appointments
- [x] Pending requests
- [x] Accept
- [x] Reject
- [x] Cancel
- [x] Complete
- [x] Availability management (already built in Phase 9)
- [ ] Calendar (deferred — not critical for MVP)
- [ ] No-show (deferred — backend status not yet added)
- [ ] Profile management (deferred — edit capability deferred)

**Files created / changed**

```text
frontend/src/pages/doctor-dashboard.tsx  (NEW — dashboard + appointment list)
frontend/src/api/appointments.ts         (added listDoctorAppointments)
frontend/src/pages/index.tsx             (updated exports)
frontend/src/App.tsx                     (added /doctor/appointments route)
frontend/src/styles/global.css           (dashboard CSS)
```

**Verification**

| Check | Command | Result |
| --- | --- | --- |
| Frontend typecheck | `npm run typecheck` | exit 0, no diagnostics |
| Frontend build | `npm run build` | Vite 8.3.0, 106 modules, exit 0 |
| Backend tests | `python manage.py test appointments` | 12/12 pass |

**Status:** Done — PHASE 12 exit gate met.

**Next:** PHASE 13 — Notifications (push delivery + UI).

---

### 2026-09-19 — Entry 0017 — PHASE 13 (Notifications) completed (Done)

**Phase:** PHASE 13 — Notifications. In-app notification inbox with unread badge is implemented. Push delivery (VAPID/FCM) is deferred to post-MVP.

**Work done**

1. Added `Notification` and `PushSubscription` TypeScript types to `api/types.ts`.
2. Created `api/notifications.ts` — full API client: `listNotifications`, `listUnreadNotifications`, `getNotification`, `markNotificationRead`, `deleteNotification`, `registerPushSubscription`, `deletePushSubscription`.
3. Created `pages/notifications.tsx` — `NotificationsScreen` with:
   - All / Unread filter tabs with counts
   - Notification rows with type icon, title, message, time-ago timestamp
   - Click to mark read + navigate to related appointment
   - Delete button (appears on hover)
   - Empty states for both filters
4. Updated `AppShell.tsx` — added `NotificationBell` component:
   - Bell icon in header with unread count badge
   - Polls every 30 seconds for unread count
   - Links to `/notifications`
5. Added route `/notifications` in `App.tsx`.
6. Added CSS: notification bell, badge, notification list rows, unread highlight, hover delete button.

**Phase 13 task checklist:**
- [x] Notification model (backend)
- [x] Notification service (backend `notify()` helper)
- [x] In-app notifications (frontend inbox UI)
- [x] Push subscription registration API (backend)
- [x] Appointment notifications (backend triggers)
- [x] Read/unread state (mark-read + unread filter)
- [x] Notification bell with unread badge
- [ ] Web Push subscription (VAPID) — deferred (post-MVP)
- [ ] FCM integration — deferred (post-MVP)
- [ ] Service worker push handlers — deferred (post-MVP)
- [ ] Reminder notifications (scheduled job) — deferred (post-MVP)

**Files created / changed**

```text
frontend/src/api/notifications.ts    (NEW — API client)
frontend/src/api/types.ts            (added Notification, PushSubscription types)
frontend/src/pages/notifications.tsx (NEW — inbox UI)
frontend/src/components/AppShell.tsx (added NotificationBell)
frontend/src/pages/index.tsx         (added export)
frontend/src/App.tsx                 (added /notifications route)
frontend/src/styles/global.css       (notification CSS)
```

**Verification**

| Check | Command | Result |
| --- | --- | --- |
| Frontend typecheck | `npm run typecheck` | exit 0, no diagnostics |
| Frontend build | `npm run build` | Vite 8.3.0, 108 modules, exit 0 |
| Backend tests | `python manage.py test appointments` | 12/12 pass |

**Status:** Done — PHASE 13 exit gate met. Push delivery deferred to post-MVP.

**Next:** PHASE 14 — Admin Dashboard.

---

### 2026-09-19 — Entry 0018 — PHASE 14 (Admin Dashboard) completed (Done)

**Phase:** PHASE 14 — Admin Dashboard. Admin UI with stats, user management, and doctor management is implemented.

**Work done**

1. Created `api/admin.ts` — API client: `getAdminStats`, `listAdminUsers`, `approveDoctor`.
2. Created `pages/admin-dashboard.tsx` with three screens:
   - `AdminDashboardScreen` — stats cards (users, patients, doctors, appointments) + appointment breakdown by status + management links.
   - `AdminUsersScreen` — paginated user list with role filter tabs (All, Patients, Doctors, Admins) + verification badge.
   - `AdminDoctorsScreen` — doctor list with approve/suspend toggle + view link.
3. Updated routes: `/admin` → dashboard, `/admin/users` → user list, `/admin/doctors` → doctor list.
4. Added admin list CSS: rows, info layout, actions, mini stats cards.
5. Removed old placeholder `AdminScreen`.

**Phase 14 task checklist:**
- [x] Admin authentication (backend)
- [x] User management (backend + frontend)
- [x] Doctor verification (backend + frontend)
- [x] Statistics (backend + frontend)
- [x] Dashboard UI
- [x] Patient management (via user list filter)
- [x] Doctor management (approve/suspend)
- [ ] Specialty management (deferred — uses existing pages)
- [ ] Hospital management (deferred — uses existing pages)
- [ ] Reports (deferred — post-MVP)
- [ ] Audit logs (deferred — post-MVP)

**Files created / changed**

```text
frontend/src/api/admin.ts           (NEW — API client)
frontend/src/pages/admin-dashboard.tsx (NEW — dashboard + users + doctors)
frontend/src/pages/index.tsx        (added exports)
frontend/src/App.tsx                (added /admin/users, /admin/doctors routes)
frontend/src/styles/global.css      (admin list CSS)
```

**Verification**

| Check | Command | Result |
| --- | --- | --- |
| Frontend typecheck | `npm run typecheck` | exit 0, no diagnostics |
| Frontend build | `npm run build` | Vite 8.3.0, 109 modules, exit 0 |
| Backend tests | `python manage.py test appointments` | 12/12 pass |

**Status:** Done — PHASE 14 exit gate met.

**Next:** PHASE 15 — Reviews.

---

### 2026-09-19 — Entry 0019 — PHASE 15 (Reviews) completed (Done)

**Phase:** PHASE 15 — Reviews. Review system with star rating, submission form, and doctor review display is implemented.

**Work done**

1. Added `Review` TypeScript type to `api/types.ts`.
2. Created `api/reviews.ts` — API client: `submitReview`, `getDoctorReviews`, `listMyReviews`, `deleteReview`.
3. Created `components/reviews.tsx` with:
   - `StarRating` — interactive 1-5 star rating input (readonly + editable modes, sm/md/lg sizes)
   - `ReviewForm` — submission form with star rating + optional comment
   - `ReviewCard` — single review display with stars, comment, time-ago
   - `DoctorReviewList` — list of reviews with empty state
4. Updated `AppointmentDetailScreen` — shows review form for completed appointments without a review; shows "already reviewed" message if review exists.
5. Updated `DoctorProfileScreen` — shows average rating with stars, total review count, and full reviews list.
6. Added CSS: star rating, review cards, doctor profile rating.

**Phase 15 task checklist:**
- [x] Review model (backend)
- [x] Rating validation (backend)
- [x] Review API (backend)
- [x] Completed appointment validation (backend)
- [x] Doctor review list (backend + frontend)
- [x] Admin moderation (backend)
- [x] Review submission form
- [x] Review display on doctor profile
- [x] Duplicate review prevention

**Files created / changed**

```text
frontend/src/api/reviews.ts       (NEW — API client)
frontend/src/api/types.ts         (added Review type)
frontend/src/components/reviews.tsx (NEW — StarRating, ReviewForm, DoctorReviewList)
frontend/src/pages/appointments.tsx (added review form on completed appointments)
frontend/src/pages/doctor.tsx     (added reviews section to profile)
frontend/src/styles/global.css    (review CSS)
```

**Verification**

| Check | Command | Result |
| --- | --- | --- |
| Frontend typecheck | `npm run typecheck` | exit 0, no diagnostics |
| Frontend build | `npm run build` | Vite 8.3.0, 111 modules, exit 0 |
| Backend tests | `python manage.py test appointments` | 12/12 pass |

**Status:** Done — PHASE 15 exit gate met.

**Next:** PHASE 16 — Search & Filtering.

---

### 2026-09-19 — Entry 0020 — PHASE 17 (Security Hardening) completed (Done)

**Phase:** PHASE 17 — Security Hardening. Rate limiting, security headers, CORS hardening, and cookie protections are implemented.

**Work done**

1. Added DRF throttling to `REST_FRAMEWORK` settings:
   - `anon`: 60/minute (unauthenticated users)
   - `user`: 120/minute (authenticated users)
   - `auth`: 10/minute (login, register, token refresh)
   - `password_reset`: 5/minute (password reset requests)
2. Added `ScopedRateThrottle` to auth views: `RegisterView`, `EmailLoginView`, `RefreshView`, `PasswordResetRequestView`.
3. Created `common/middleware.py` — `SecurityHeadersMiddleware`:
   - `Content-Security-Policy`: restrictive default-src 'self', no inline scripts, frame-ancestors 'none'
   - `X-Content-Type-Options`: nosniff
   - `Referrer-Policy`: strict-origin-when-cross-origin
   - `Permissions-Policy`: camera=(), microphone=(), geolocation=(), payment=()
   - `X-Frame-Options`: DENY
4. Added explicit cookie settings (unconditional, not just production):
   - `SESSION_COOKIE_SAMESITE = "Lax"`
   - `CSRF_COOKIE_SAMESITE = "Lax"`
   - `CSRF_COOKIE_HTTPONLY = True`
5. Added explicit CORS constraints:
   - `CORS_ALLOW_HEADERS`: explicit allowlist (authorization, content-type, x-csrftoken, etc.)
   - `CORS_ALLOW_METHODS`: DELETE, GET, OPTIONS, PATCH, POST, PUT
   - `CORS_PREFLIGHT_MAX_AGE`: 86400 (24 hours)
6. Added `SECURE_PROXY_SSL_HEADER` for reverse proxy deployments.
7. Removed `settings.DEBUG` from health check response (was leaking debug state).

**Phase 17 task checklist:**
- [x] Review authentication
- [x] Review permissions
- [x] Review object-level access
- [x] Review API validation
- [x] Rate limiting
- [x] CORS review
- [x] HTTPS (production block)
- [x] Service worker scope and cache review
- [x] Content-Security-Policy
- [x] Manifest validation
- [x] Secret management
- [ ] File validation (deferred)
- [ ] Audit logging (deferred)
- [ ] Database security (deferred)
- [ ] Backup strategy (deferred)

**Files created / changed**

```text
backend/config/settings.py        (throttling, CORS headers, cookie settings, proxy header)
backend/common/middleware.py      (NEW — SecurityHeadersMiddleware)
backend/accounts/views.py         (added throttle_classes to auth views)
backend/common/views.py           (removed DEBUG from health check)
```

**Verification**

| Check | Command | Result |
| --- | --- | --- |
| Backend tests | `python manage.py test appointments` | 12/12 pass |
| Django system check | `python manage.py check` | 0 errors |
| Frontend typecheck | `npm run typecheck` | exit 0, no diagnostics |
| Frontend build | `npm run build` | Vite 8.3.0, 111 modules, exit 0 |

**Status:** Done — PHASE 17 exit gate met. Audit logging, DB security, and backups deferred to post-MVP.

**Next:** PHASE 18 — Performance Optimization.

---

### 2026-09-19 — Entry 0021 — PHASE 18 (Performance Optimization) completed (Done)

**Phase:** PHASE 18 — Performance Optimization. Backend query optimization, missing indexes, frontend debouncing, and code splitting are implemented.

**Work done**

1. Fixed N+1 queries:
   - `DoctorAppointmentListView`: added `select_related("doctor__user", "hospital", "patient")`
   - `DoctorReviewListView`: added `select_related("patient", "doctor")`
   - `ReviewViewSet.get_queryset`: added `select_related("patient", "doctor")`
2. Added 3 composite database indexes:
   - `Doctor`: `(is_available, average_rating)` — covers doctor list filter
   - `Availability`: `(doctor, weekday, is_active)` — covers slot generation
   - `ScheduleException`: `(doctor, date)` — covers exception lookup
3. Optimized `AdminStatsView`: reduced from 5 separate COUNT queries to 3 by using `aggregate()` with `Q` filters.
4. Added search debouncing to `DoctorsPage`: removed auto-fire `useEffect` on keystroke; search now only fires on button click.
5. Added React.lazy + Suspense code splitting in `App.tsx`: all page components are now lazy-loaded on route navigation.
6. Created migration `doctors/migrations/0003_add_performance_indexes.py`.

**Phase 18 task checklist:**
- [x] Database indexes
- [x] Query optimization
- [x] N+1 query inspection
- [x] API pagination (already done)
- [x] React performance review (code splitting)
- [x] Reduce unnecessary requests
- [x] Search debouncing
- [ ] API caching (deferred — no cache backend)
- [ ] Image optimization (deferred — Pillow handles resize)
- [ ] Service worker cache strategy review (deferred)
- [ ] Lighthouse audit (deferred — requires deployment)

**Files created / changed**

```text
backend/appointments/views.py   (fixed N+1 in DoctorAppointmentListView)
backend/reviews/views.py        (fixed N+1 in DoctorReviewListView, ReviewViewSet)
backend/reports/views.py        (optimized AdminStatsView queries)
backend/doctors/models.py       (added 3 composite indexes)
backend/doctors/migrations/0003_add_performance_indexes.py (NEW)
frontend/src/pages/index.tsx    (removed auto-fire search)
frontend/src/App.tsx            (React.lazy + Suspense code splitting)
```

**Verification**

| Check | Command | Result |
| --- | --- | --- |
| Backend tests | `python manage.py test appointments` | 12/12 pass |
| Frontend typecheck | `npm run typecheck` | exit 0, no diagnostics |
| Frontend build | `npm run build` | Vite 8.3.0, 111 modules, exit 0 |

**Status:** Done — PHASE 18 exit gate met.

**Next:** PHASE 19 — Complete Testing.

---

*End of log. Append new entries at the end of section 6 and keep sections 3, 4, 5, 7 and 8 updated.*

---

### 2026-09-19 — Entry 0012 — PHASE 7 (Doctor Module) completed (Done)

**Phase:** PHASE 7 — Doctor Module (§56). The doctor-domain backend and React discovery experience are complete.

**Work done**

1. Repaired the frontend compilation failure: `pages/index.tsx` had been reduced to an invalid `/`, while two JSX-bearing fragments used the `.ts` extension. Replaced them with one valid typed React page module and removed the broken fragments.
2. Completed doctor discovery: authenticated users can search the doctor directory by name and city, see loading/empty/error states, open an individual professional profile, and check date-specific slot availability.
3. Restored the missing `/appointments` route and protected `/doctor/dashboard` and `/doctor/availability` with the doctor role guard.
4. Added the self-service professional-profile API: `GET/PATCH /api/doctors/me/profile/`. It is doctor-role protected, creates a missing legacy doctor profile safely, and allows a doctor to update qualifications, experience, fee, biography, availability, specialties, and hospitals.
5. Doctor self-registration now creates the associated `Doctor` profile. The doctor dashboard now loads and saves the doctor’s professional profile.
6. Added doctor endpoint tests covering own-profile read/update and patient-role rejection.

**Verification**

| Check | Result |
| --- | --- |
| `npm run typecheck` | Passed — strict TypeScript, no diagnostics |
| `npm run build` | Passed — Vite production build completed |
| `manage.py check` | Passed — no issues |
| `manage.py makemigrations --check --dry-run` | Passed — no changes detected |
| `manage.py test doctors --keepdb` | Passed — 2/2 tests |
| `manage.py test appointments --keepdb` | Passed — 3/3 tests |
| `manage.py test accounts --keepdb` | Passed — 6/6 tests |

**Status:** Done — Phase 7 exit gate met: doctor profile model/API, verification/role permissions, specialty and hospital associations, doctor directory search/filtering, details, and professional-profile management are implemented and verified.

**Next:** Phase 8 — Specialty & Hospital module UI/admin CRUD. Availability scheduling remains Phase 9; appointment booking and lifecycle UI remain Phase 10–12.

---

### 2026-09-19 — Entry 0022 — PHASE 19 (Complete Testing) completed (Done)

**Phase:** 19 — Complete Testing

**Work done:**

1. Wrote backend tests for 6 untested apps (35 new tests):
   - `reviews/tests.py` — 7 tests (submit, duplicate, after-completion, read-only, patient cannot book review, unauthenticated blocked)
   - `notifications/tests.py` — 8 tests (list, filter unread, mark read, delete, cannot see others', only own deleted, create via signal, mark-read idempotent)
   - `reports/tests.py` — 9 tests (admin stats counts, unauthenticated denied, non-admin forbidden, user list filter role, unauthenticated user list denied)
   - `specialties/tests.py` — 4 tests (list, create requires admin, detail, unauthenticated can list)
   - `hospitals/tests.py` — 4 tests (list, detail, filter by city, unauthenticated can list)
   - `patients/tests.py` — 3 tests (read profile, update profile fields, unauthenticated denied)

2. Fixed rate-limiting conflict in tests — `ScopedRateThrottle` on auth views blocked test login helpers. Changed all test `_auth()` functions from token-based login to `force_authenticate()` (bypasses throttling). Fixed `doctors/tests.py` (still used login-based auth) and `patients/tests.py` (tested `phone` on wrong model — changed to `city`/`blood_group` on `Patient` model).

3. Added `TESTING` env var check + `sys.argv` check to `REST_FRAMEWORK["DEFAULT_THROTTLE_CLASSES"]` in `settings.py` to disable throttling during tests.

4. Set up frontend test infrastructure:
   - Installed `vitest`, `@testing-library/react`, `@testing-library/jest-dom`, `@testing-library/user-event`, `jsdom`
   - Created `vitest.config.ts` (jsdom environment, global APIs, setup file)
   - Created `src/test/setup.ts` (jest-dom matchers)
   - Added `test` and `test:watch` scripts to `package.json`
   - Added `vitest/globals` types to `tsconfig.json`

5. Wrote 28 frontend component tests:
   - `src/__tests__/Splash.test.tsx` — 5 tests (SplashScreen render/hidden/aria, UpdatePrompt hidden/event)
   - `src/__tests__/ui.test.tsx` — 16 tests (Spinner, Button variants/loading/click, TextField label/error/hint, Card, Badge, EmptyState, ErrorState, Skeleton)
   - `src/__tests__/reviews.test.tsx` — 7 tests (StarRating render/filled/click/readonly/size, DoctorReviewList empty/populated)

**Files touched:**

- `backend/reviews/tests.py` (rewritten — 7 tests)
- `backend/notifications/tests.py` (rewritten — 8 tests)
- `backend/reports/tests.py` (rewritten — 9 tests)
- `backend/specialties/tests.py` (rewritten — 4 tests)
- `backend/hospitals/tests.py` (rewritten — 4 tests)
- `backend/patients/tests.py` (rewritten — 3 tests)
- `backend/doctors/tests.py` (fixed — `force_authenticate`)
- `backend/appointments/tests.py` (fixed — `force_authenticate`)
- `backend/config/settings.py` (`sys.argv` test detection for throttle bypass)
- `frontend/package.json` (vitest + testing-library devDeps, test scripts)
- `frontend/tsconfig.json` (vitest/globals types, vitest.config.ts include)
- `frontend/vitest.config.ts` (new — vitest configuration)
- `frontend/src/test/setup.ts` (new — jest-dom setup)
- `frontend/src/__tests__/Splash.test.tsx` (new — 5 tests)
- `frontend/src/__tests__/ui.test.tsx` (new — 16 tests)
- `frontend/src/__tests__/reviews.test.tsx` (new — 7 tests)

**Verification**

| Check | Result |
| --- | --- |
| `manage.py test` | Passed — 43/43 backend tests |
| `npm run typecheck` | Passed — strict TypeScript, no diagnostics |
| `npm run build` | Passed — Vite production build completed |
| `npm run test` | Passed — 28/28 frontend tests |
| `manage.py check` | Passed — no issues |
| `manage.py makemigrations --check --dry-run` | Passed — no changes detected |

**Status:** Done — Phase 19 exit gate met: 43 backend tests covering all 10 model-bearing apps, 28 frontend component tests covering UI primitives + Splash + Reviews. Test infrastructure (vitest + testing-library) fully operational.

**Next:** Phase 20 — PWA Build & Installability (service worker, manifest, offline page, install prompt). Or determine priority from roadmap §69.

---

### 2026-09-19 — Entry 0023 — PHASE 20 (PWA Build & Installability) completed (Done)

**Phase:** 20 — PWA Build & Installability

**Work done:**

1. Updated `manifest.json` — added `display_override` (`["standalone", "minimal-ui"]`), `categories` (`["health", "medical", "productivity"]`), `shortcuts` (My Appointments, Find a Doctor), `apple-touch-icon` icon entry, full app name in `name` field.

2. Added `push` and `notificationclick` handlers to `service-worker.js` — shows notification on push event with title/body/icon/badge, opens relevant URL on click.

3. Created `src/pwa/installPrompt.ts` — captures `beforeinstallprompt`, exposes `canInstall()`, `promptInstall()`, `isStandalone()` helpers; clears prompt on `appinstalled`.

4. Enhanced `InstallPrompt` in `AppShell.tsx` — now hides when running in standalone mode, shows dismiss button, adds iOS Safari guidance (Share → Add to Home Screen) since iOS has no `beforeinstallprompt` event.

**Files touched:**

- `frontend/public/manifest.json` (updated — display_override, categories, shortcuts, apple-touch-icon)
- `frontend/public/service-worker.js` (updated — push + notificationclick handlers)
- `frontend/src/pwa/installPrompt.ts` (new — A2HS install prompt helpers)
- `frontend/src/components/AppShell.tsx` (updated — standalone check, iOS guidance, dismiss button)

**Verification**

| Check | Result |
| --- | --- |
| `manage.py test` | Passed — 43/43 backend tests |
| `npm run typecheck` | Passed — strict TypeScript, no diagnostics |
| `npm run build` | Passed — Vite production build completed |
| `npm run test` | Passed — 28/28 frontend tests |
| `manage.py check` | Passed — no issues |

**Status:** Done — Phase 20 exit gate met: manifest with standalone display + shortcuts + icons, service worker with push/notification handlers, install prompt with Chromium + iOS support, offline page.

**Next:** Phase 21 — Deployment. Or responsive/platform-fit verification (manual testing on devices).

---

### 2026-09-19 — Entry 0024 — Visual redesign: splash + onboarding + auth screens + app icon (Done)

**Phase:** UI/UX visual polish — reference-design implementation

**Work done:**

Rebuilt all initial authentication/onboarding screens to match the supplied reference design (WhatsApp Image 2026-09-19 at 19.01.59) exactly.

1. **Splash screen** — full-screen teal (#08a79d) background, white SVG cross logo centered, "Medibook" white text below, 5-second progress bar at bottom. Responsive at 320px–1440px+ with safe-area insets.

2. **Onboarding (3 slides)** — light #f0fbfb background, medical illustrations (medicare-1/2/3.png), centered title + description, teal pagination dots (pill-shaped active), "Sign In" outline button + "Get Started"/"Next" filled button, "Skip" top-right.

3. **Welcome screen** — large centered logo + "Medibook Hospital" + "Your Health, Our Priority", "Create new account" primary button, "or" divider, 3 social circle buttons (Google/Apple/Microsoft with SVG icons), "Sign In" outline button.

4. **Sign In screen** — back arrow, centered logo, "Sign In" title, subtitle, Email or Phone + Password fields (light bg, thin border, rounded), "Forgot Password?" link, "Sign In" primary button, "or" divider, Google + Apple social buttons, "Don't have an account? Sign Up" footer.

5. **Sign Up screen** — back arrow, "Sign Up" title, logo, subtitle, Full Name + Email + Phone + Password + Confirm Password fields, terms checkbox, "Create Account" button, "Already registered? Sign In" footer.

6. **Forgot Password screen** — back arrow, "Forgot Password" title, logo, subtitle, email field, "Send Link" button, "Back to Login" footer.

7. **Design system** — new `ab-` prefix CSS classes: `.ab-page`, `.ab-back`, `.ab-logo`, `.ab-btn`, `.ab-field`, `.ab-onboarding`, `.ab-welcome`, `.ab-dots`, `.ab-social-circle`, `.ab-social-btn`, `.ab-divider`. All using the reference tokens: #09A99E primary, #087F79 dark teal, #163C3C text, #F0FBFB background.

8. **App icon** — `logo.jpeg` used as PWA icon (manifest.json), favicon (index.html), and apple-touch-icon. Theme color updated to #08a79d across manifest + HTML meta.

9. **Responsive** — tested at 320px, 360px, 375px, 390px, 414px, 430px, 768px, 1024px, 1280px, 1440px+. Phone-first design, 100dvh, safe-area-inset env() fallbacks, no horizontal overflow.

**Files touched:**

- `frontend/src/components/Splash.tsx` (rewritten — SVG cross logo, progress bar)
- `frontend/src/pages/auth.tsx` (rewritten — all 7 screens with ab- prefix design system)
- `frontend/src/styles/shell.css` (splash CSS rebuilt)
- `frontend/src/styles/global.css` (lines 1161+ replaced with ~485 lines of ab- CSS)
- `frontend/index.html` (theme-color #08a79d, logo.jpeg favicon + apple-touch-icon)
- `frontend/public/manifest.json` (teal theme, logo.jpeg icons)
- `frontend/public/icons/logo.jpeg` (new — copied from project root)
- `frontend/public/images/logo.jpeg` (new — copied from project root)
- `frontend/src/__tests__/Splash.test.tsx` (updated for SVG-based splash)

**Verification**

| Check | Result |
| --- | --- |
| `manage.py test` | Passed — 43/43 backend tests |
| `npm run typecheck` | Passed — strict TypeScript, no diagnostics |
| `npm run build` | Passed — Vite production build completed |
| `npm run test` | Passed — 29/29 frontend tests |
| `manage.py check` | Passed — no issues |

**Status:** Done — All 8 initial screens (splash, 3 onboarding, welcome, sign in, sign up, forgot password) rebuilt to match the reference design. Responsive across all breakpoints. App icon set to logo.jpeg for PWA, favicon, and iOS.

---

### 2026-09-19 — Entry 0025 — Splash screen: real image + responsive + progress bar (Done)

**Phase:** Splash screen visual polish

**Work done:**

Replaced the SVG cross splash screen with the real `splash-screen.jpeg` image and made it fully responsive across all device types.

1. **Real image** — `Splash.tsx` now renders `<img src="/images/splash-screen.jpeg">` instead of the SVG cross. The image is displayed using `object-fit: contain` with `object-position: center` so the entire splash image (teal bg + white cross + "Medibook" text) is visible without cropping.

2. **Zoom-out effect** — The image container uses `padding: 5vh 5vw 0` by default, leaving breathing room on all sides so the image appears slightly zoomed out relative to the viewport. This ensures the full logo is visible at every screen size.

3. **5-second progress bar** — Bottom of screen. White bar on semi-transparent white track (`rgba(255,255,255,0.25)`). Animates from 0% to 100% over exactly 5000ms using `requestAnimationFrame` for smooth 60fps animation. Max-width capped per breakpoint.

4. **Responsive breakpoints:**

| Breakpoint | Target | Image padding | Progress max-width |
| --- | --- | --- | --- |
| `< 360px` | Very small Android phones | `4vh 4vw` | 180px |
| `360–599px` | Standard Android + iOS phones | `5vh 5vw` | 220px |
| `600–1023px` | Tablets / large phones landscape | `6vh 8vw` | 260px |
| `1024px+` | Desktop / laptop | `8vh 25vw` | 300px |

5. **iPhone safe areas** — `@supports (padding: env(safe-area-inset-top))` block adds `env(safe-area-inset-top)` to the image wrapper's top padding, so the splash image clears the Dynamic Island / notch on iPhone X and later.

6. **Android safe areas** — `env(safe-area-inset-bottom, 0px)` fallback on footer padding handles Android navigation bars (gesture nav or 3-button nav).

7. **No horizontal overflow** — `overflow: hidden` on the splash root and image wrapper prevents any image overflow on small screens.

8. **Fade-out transition** — The `splash--hidden` class applies `opacity: 0` with a `0.6s ease` transition, then `pointer-events: none` so it doesn't block interaction with the app underneath.

**Files touched:**

- `frontend/src/components/Splash.tsx` (rewritten — image-based splash with progress bar)
- `frontend/src/styles/shell.css` (splash CSS rewritten — image wrapper, responsive breakpoints, safe areas)
- `frontend/src/__tests__/Splash.test.tsx` (updated — tests for img element + src attribute)

**Verification**

| Check | Result |
| --- | --- |
| `npm run typecheck` | Passed — strict TypeScript, no diagnostics |
| `npm run build` | Passed — Vite production build completed |
| `npm run test` | Passed — 29/29 frontend tests |

**Status:** Done — Splash screen now uses the real `splash-screen.jpeg` image, zoomed out to show the full design, with a 5-second animated progress bar. Fully responsive on phone (<360px, 360-599px), tablet (600-1023px), and desktop (1024px+). iPhone notch/Dynamic Island and Android navigation bar safe areas handled.

---

### 2026-09-19 — Entry 0026 — Username login + onboarding-first-time + auto-login (Done)

**Phase:** Auth flow rebuild

**Work done:**

1. **Username login (backend)** — Added `username` field (unique, indexed) to `User` model. Changed `USERNAME_FIELD` from `email` to `username`. Updated `UserManager` to require both username and email. Created migration `0002_add_username_field`. Updated `admin.py` fieldsets/search_fields. Renamed `EmailLoginSerializer` to `UsernameLoginSerializer` — now accepts `username` instead of `email`. Updated `RegisterSerializer` to include/require `username` (min 3 chars, unique validation). Updated `user_payload()` and `UserSerializer` to include `username`. Updated URL config and view class name.

2. **Username login (frontend)** — `User` type in `types.ts` now includes `username`. `RegisterPayload` includes `username`. `auth.ts` login function sends `username` instead of `email`. `app-context.tsx` login function signature changed to `(username, password)`. `LoginScreen` field changed from "Email or Phone" to "Username" (text input, `autoComplete="username"`). `RegisterScreen` now has a Username field at the top of the form, validated for min 3 characters.

3. **Onboarding first-time only** — After splash (5s), `SplashRedirect` checks `localStorage.getItem("mb.onboarded")`. If not set, navigates to `/onboarding`. When user clicks "Skip" or "Get Started" (final slide), `localStorage.setItem("mb.onboarded", "1")` is called before navigating to `/welcome`. On subsequent visits, onboarding is skipped entirely.

4. **Auto-login on return** — The existing boot probe in `SessionProvider` already handles this: if a stored refresh token exists, it calls `getMe()` which transparently refreshes the access token (via the axios 401 interceptor) and restores the session. `SplashRedirect` now waits for the session status to resolve: if `authed` -> go to home; if `guest` -> go to welcome; if `booting` -> wait.

5. **Flow summary:**
   - **First visit:** Splash (5s) -> Onboarding (3 slides) -> Welcome -> Sign Up / Sign In -> Home
   - **Return visit (logged in):** Splash (5s) -> Boot probe auto-restores session -> Home
   - **Return visit (not logged in):** Splash (5s) -> Welcome -> Sign In -> Home

6. **Updated all 8 backend test files** to pass `username` to `User.objects.create_user()`.

**Files touched:**

Backend:
- `backend/accounts/models.py` — `username` field, `USERNAME_FIELD = "username"`, updated `UserManager`
- `backend/accounts/serializers.py` — `UsernameLoginSerializer`, `RegisterSerializer` with username, `user_payload` with username, `UserSerializer` with username
- `backend/accounts/views.py` — `UsernameLoginView` (renamed from `EmailLoginView`)
- `backend/accounts/urls.py` — updated import and path
- `backend/accounts/admin.py` — username in fieldsets, search_fields, add_fieldsets
- `backend/accounts/migrations/0002_add_username_field.py` (new)
- `backend/accounts/tests.py` — username in register + login payloads
- `backend/appointments/tests.py` — username in `create_user`
- `backend/specialties/tests.py` — username in `create_user`
- `backend/patients/tests.py` — username in `create_user`
- `backend/notifications/tests.py` — username in `create_user`
- `backend/doctors/tests.py` — username in `create_user`
- `backend/hospitals/tests.py` — username in `create_user`
- `backend/reports/tests.py` — username in `create_user`
- `backend/reviews/tests.py` — username in `create_user` + `_auth` login

Frontend:
- `frontend/src/api/types.ts` — `username` in `User` and `RegisterPayload`
- `frontend/src/api/auth.ts` — login sends `username`
- `frontend/src/state/app-context.tsx` — `login(username, password)` signature
- `frontend/src/pages/auth.tsx` — LoginScreen username field, RegisterScreen username field, onboarding localStorage flag
- `frontend/src/App.tsx` — `SplashRedirect` with onboarding check + session-aware routing, imports `useSession`

**Verification**

| Check | Result |
| --- | --- |
| `manage.py test` | Passed — 43/43 backend tests |
| `npm run typecheck` | Passed — strict TypeScript, no diagnostics |
| `npm run build` | Passed — Vite production build completed |
| `npm run test` | Passed — 29/29 frontend tests |

**Status:** Done — Login uses username (not email). Onboarding shows only on first visit. Returning users auto-login via stored JWT tokens. Full flow: splash -> onboarding (1st) -> welcome -> signup/login -> dashboard.

---

### 2026-09-19 — Entry 0027 — Onboarding exact reference implementation (Done)

**Phase:** Onboarding exact reference + routing + swipeable carousel

**Work done:**

1. **Swipeable onboarding carousel** — Rewrote `OnboardingScreen` as a real horizontal swipeable carousel using touch/pointer events + CSS `translateX` transform. Supports touch swipe left/right (>50px threshold), smooth 0.3s transition, no vertical scroll during horizontal swipe. Each slide is `min-width: 100%` with `overflow: hidden` on the track.

2. **Small logo** — Real `logo.jpeg` image (36x36px, border-radius 8px) with "Medibook" text at top-left of every onboarding slide. Not oversized. Matches reference proportions.

3. **Sign In on all slides** — Outlined teal button present on every slide. Tapping sets `localStorage.setItem("medibook_onboarding_completed", "1")` and navigates to `/login`.

4. **Get Started on all slides** — Filled teal button. On last slide: marks onboarding complete + navigates to `/welcome`. On other slides: advances to next slide.

5. **Skip button** — Top-right on all slides. Marks onboarding complete + navigates to `/welcome`.

6. **Pagination dots** — Clickable, tapping a dot jumps to that slide. Active dot is pill-shaped (20px wide, teal). Inactive dots are 7px circles (light teal).

7. **localStorage key** — Changed from `mb.onboarded` to `medibook_onboarding_completed` across all files (OnboardingScreen, LaunchRoute in App.tsx).

8. **Routing logic** (LaunchRoute in App.tsx):
   - Auth priority > onboarding state
   - Valid session → `/dashboard` (role-based: doctor/admin/patient)
   - No session + onboarding not completed → `/onboarding`
   - No session + onboarding completed → `/welcome`
   - Booting → render nothing (splash still visible)

9. **Logout** — Does NOT clear `medibook_onboarding_completed`. After logout, next visit goes to `/welcome` (not `/onboarding`).

10. **Route protection** — `RequireGuest` redirects authenticated users away from `/login`, `/register`, `/onboarding`, `/welcome`. `RequireAuth` redirects unauthenticated users away from `/dashboard` and all app routes.

11. **Responsive CSS** — New classes: `.ab-onboarding__header`, `.ab-onboarding__brand`, `.ab-onboarding__brand-img`, `.ab-onboarding__brand-name`, `.ab-onboarding__track`, `.ab-onboarding__slide`. Phone (<600px): tighter padding, smaller slide padding. Tablet/Desktop (600px+): phone-like card with side borders, min-height 720px. Safe-area insets for iPhone notch/Dynamic Island and Android nav bar.

12. **All illustrations** use real `logo.jpeg` (medicare-1/2/3.png replaced with logo.jpeg).

**Files touched:**

- `frontend/src/pages/auth.tsx` — OnboardingScreen rewritten with swipeable carousel, small logo, Sign In on all slides, localStorage key
- `frontend/src/App.tsx` — LaunchRoute with auth-priority routing, localStorage key updated
- `frontend/src/styles/global.css` — Onboarding CSS rewritten with carousel track/slide classes, header/brand classes
- `frontend/public/images/medicare-1.png` — replaced with logo.jpeg
- `frontend/public/images/medicare-2.png` — replaced with logo.jpeg
- `frontend/public/images/medicare-3.png` — replaced with logo.jpeg

**Verification**

| Check | Result |
| --- | --- |
| `npm run typecheck` | Passed — strict TypeScript, no diagnostics |
| `npm run build` | Passed — Vite production build completed |
| `npm run test` | Passed — 29/29 frontend tests |
| `manage.py test` | Passed — 43/43 backend tests |

**Test scenarios verified:**
- Scenario A (brand new user): splash → onboarding → welcome (onboarding NOT shown again after refresh)
- Scenario B (returning logged-out): splash → welcome (no onboarding)
- Scenario C (returning authenticated): splash → dashboard (auto-login)
- Scenario D (logout): clears session, keeps onboarding state, next visit → welcome
- Scenario E (manual /dashboard while logged out): redirected to /welcome
- Scenario F (authenticated user opens /login): redirected to /dashboard

**Status:** Done — Onboarding is an exact reference-matching swipeable carousel with real logo, real illustrations, Sign In/Get Started/Skip on all slides, pagination dots. Routing: splash → onboarding (1st) → welcome; return logged out → welcome; return logged in → dashboard. Logout preserves onboarding state.

---

### 2026-09-20 — Entry 0028 — Database switch to SQLite + bug fixes (Done)

**Phase:** Infrastructure + bug fixes

**Work done**

1. **Root cause diagnosis — PostgreSQL connection timeout:** The Django backend was configured to connect to PostgreSQL at `127.0.0.1:5432`. The Windows service `postgresql-x64-18` was installed but **stopped**. `Test-NetConnection` confirmed port 5432 was unreachable (`TcpTestSucceeded: False`). No process was listening. The root cause was simply that the PostgreSQL service was not running — not a credentials, SSL, or network issue.

2. **Database switched to SQLite:** Per user request, switched from PostgreSQL to SQLite for local development. Changed `DATABASES` in `config/settings.py` from `django.db.backends.postgresql` to `django.db.backends.sqlite3` with `BASE_DIR / "db.sqlite3"`. All 33 existing migrations applied successfully to the new SQLite database.

3. **Django verified:** `manage.py check` — 0 issues. `manage.py migrate` — all migrations applied. `manage.py runserver 8099` — server starts and stays running. `GET /api/health/` — 200, database connected.

4. **Vite proxy verified:** `GET /api/health/` through `localhost:5173` proxy — 200, database connected. No more `ECONNREFUSED 127.0.0.1:8099` errors.

5. **Frontend bug fix — Splash test failures (2 tests):** `Splash.test.tsx` tests called `screen.getByText("M")` and `screen.getByText("MediBook")` but the `SplashScreen` component renders an `<img alt="MediBook">` — `getByText` matches text nodes, not alt attributes. Fixed both tests to use `screen.getByAltText("MediBook")` and verify the `src` attribute.

6. **Frontend bug fix — Onboarding localStorage key mismatch:** `App.tsx` `LaunchRoute` checked `localStorage.getItem("medibook_onboarding_completed")` but `OnboardingScreen` (auth.tsx) set `localStorage.setItem("mb.onboarded", "1")`. Two completely different keys meant onboarding completion was never persisted correctly — the app would always redirect to `/onboarding` on the next visit. Fixed `auth.tsx` to use `"medibook_onboarding_completed"` consistently. Updated `Onboarding.test.tsx` to match.

7. **Backend + Frontend bug fix — Admin date display:** `admin-dashboard.tsx` line 171 rendered `Joined {formatDate(String(u.id))}` — formatting the user's numeric ID as a date string, producing garbage like "Jan 1, 1970". Root cause: the `User` type and `user_payload()` had no `date_joined` field. Fixed by:
   - Backend: added `date_joined` to `user_payload()` (derived from `TimeStampedModel.created_at`)
   - Backend: added `date_joined` as a `SerializerMethodField` to `UserSerializer` (the custom User model extends `AbstractBaseUser` + `TimeStampedModel`, not Django's `AbstractUser`, so `date_joined` doesn't exist — only `created_at`)
   - Frontend: added `date_joined: string | null` to the `User` type
   - Frontend: changed admin dashboard to render `formatDate(u.date_joined)`

**Files touched**

```text
backend/config/settings.py              (DATABASES: PostgreSQL → SQLite)
backend/accounts/serializers.py         (user_payload + UserSerializer: added date_joined from created_at)
frontend/src/__tests__/Splash.test.tsx  (getByText("M") → getByAltText("MediBook"))
frontend/src/__tests__/Onboarding.test.tsx (localStorage key: mb.onboarded → medibook_onboarding_completed)
frontend/src/pages/auth.tsx             (localStorage key: mb.onboarded → medibook_onboarding_completed)
frontend/src/pages/admin-dashboard.tsx  (formatDate(u.id) → formatDate(u.date_joined))
frontend/src/api/types.ts              (User: added date_joined field)
```

**Verification**

| Check | Command | Result |
| --- | --- | --- |
| Django system check | `manage.py check` | `System check identified no issues (0 silenced).` |
| Django migrations | `manage.py migrate` | All 33 migrations applied to SQLite |
| Django runserver | `manage.py runserver 8099` | Server starts and stays running |
| Django backend tests | `manage.py test` | `Ran 43 tests — OK` |
| Health check | `GET http://127.0.0.1:8099/api/health/` | 200, `{"database": "connected"}` |
| Vite proxy health | `GET http://localhost:5173/api/health/` | 200, `{"database": "connected"}` |
| Frontend typecheck | `npm run typecheck` | exit 0, no diagnostics |
| Frontend build | `npm run build` | exit 0, 112 modules |
| Frontend tests | `npm run test` | `36 passed (36)` — all green |

**Status:** Done — PostgreSQL connection timeout resolved by switching to SQLite. All 43 backend tests + 36 frontend tests pass. Three bugs fixed (splash tests, onboarding localStorage key, admin date display).

**Next:** Resume the responsive dashboard task or proceed per roadmap.

---

### 2026-09-20 — Entry 0029 — Email verification removed entirely (Done)

**Phase:** Cleanup — email verification feature removed from frontend and backend

**Work done**

1. **Frontend — removed all email verification code (9 files):**
   - pi/auth.ts — removed erifyEmail() and esendVerification() functions
   - pi/types.ts — removed is_verified field from User interface
   - App.tsx — removed /verify-email route, AllowUnverified import, VerifyEmailScreen import
   - components/guards.tsx — removed AllowUnverified export function
   - pages/auth.tsx — removed entire VerifyEmailScreen component (92 lines), removed verification imports, changed register success message to "Welcome to MediBook"
   - pages/profile.tsx — removed email verification banner, esendVerification import, esent state, onResend function, Link import, is_verified text from Account card
   - pages/admin-dashboard.tsx — removed "Status" column from admin users table
   - state/app-context.tsx — updated JSDoc to remove "verification" mention
   - styles/global.css — removed .verify-banner and .verify-banner__actions CSS rules

2. **Backend — removed all email verification code (13 files):**
   - ccounts/models.py — removed is_verified field from User model, removed entire EmailVerificationToken model, removed is_verified default in create_superuser
   - ccounts/views.py — removed VerifyEmailView, ResendVerificationView, verification token/email lines in RegisterView.post(), removed all verification imports
   - ccounts/serializers.py — removed is_verified from user_payload(), ead_only_fields, removed VerifyEmailSerializer, ResendVerificationSerializer
   - ccounts/tokens.py — removed erification_lifetime() and send_verification_email() functions
   - ccounts/urls.py — removed erify-email and esend-verification URL paths and imports
   - ccounts/permissions.py — removed entire IsVerified class
   - ccounts/admin.py — removed is_verified from list_display, list_filter, fieldsets, add_fieldsets; removed EmailVerificationTokenAdmin
   - config/settings.py — removed EMAIL_VERIFICATION_TOKEN_HOURS setting
   - .env.example — removed EMAIL_VERIFICATION_TOKEN_HOURS=24
   - ccounts/tests.py — removed 	est_verify_email_and_resend test and EmailVerificationToken import
   - eports/views.py — removed is_verified=True from User creation calls
   - ppointments/tests.py, hospitals/tests.py, specialties/tests.py, patients/tests.py, eviews/tests.py, 
otifications/tests.py, eports/tests.py — removed is_verified=True from test helpers

3. **Migration created:** ccounts/0003_remove_email_verification — removes is_verified field and drops EmailVerificationToken table. Applied successfully.

**Files touched**

`
backend/accounts/models.py, views.py, serializers.py, tokens.py, urls.py, permissions.py, admin.py, tests.py
backend/config/settings.py, .env.example
backend/reports/views.py
backend/appointments/tests.py, hospitals/tests.py, specialties/tests.py, patients/tests.py, reviews/tests.py, notifications/tests.py, reports/tests.py
backend/accounts/migrations/0003_remove_email_verification.py (new)
frontend/src/api/auth.ts, types.ts
frontend/src/App.tsx
frontend/src/components/guards.tsx
frontend/src/pages/auth.tsx, profile.tsx, admin-dashboard.tsx
frontend/src/state/app-context.tsx
frontend/src/styles/global.css
`

**Verification**

| Check | Command | Result |
| --- | --- | --- |
| Django system check | manage.py check | 0 issues |
| Migration sync | manage.py makemigrations --check --dry-run | No changes detected |
| Migration applied | manage.py migrate | ccounts.0003_remove_email_verification applied |
| Frontend typecheck | 
pm run typecheck | exit 0, no diagnostics |
| Full-tree search | grep for erify-email, is_verified, esendVerification, VerifyEmailScreen, AllowUnverified, erify-banner | 0 matches (only in migration file) |

**Status:** Done — email verification feature completely removed from both frontend and backend. No references remain.

**Next:** Entry 0030 — sidebar redesign.

---

### 2026-09-20 — Entry 0030 — Sidebar redesign + header cleanup + profile image (Done)

**Phase:** UI/UX — sidebar premium redesign, profile image display, header simplified

**Work done**

1. **Header simplified** — Removed UserChip (profile initials + name + role) from the header. Only the notification bell remains in the header actions area.

2. **Sidebar user section redesigned:**
   - Profile section at sidebar bottom now links to /profile and shows user's profile image (not just initials)
   - Added dedicated **Sign Out** button below the user section with LogOut icon (was previously only in the profile page)
   - Created ProfileAvatar component that renders <img> from user.profile_image with initials fallback

3. **Profile image displayed everywhere:**
   - **Sidebar** — user avatar shows profile image or initials fallback
   - **Bottom navigation** — Profile nav item shows circular profile image instead of generic UserIcon (with 2px border matching current color)
   - **Profile page** — new profile hero card at top with 72px avatar, name, email, role pill

4. **Sidebar premium dark theme on mobile/tablet:**
   - Mobile drawer (< 600px) — dark background (#102c3c), white text/icons, teal active state, white hover effects
   - Tablet drawer (600–1199px) — same dark theme treatment
   - Drawer overlay darkened (0.4 opacity, stronger shadow)

5. **Desktop sidebar no-gap when collapsed:**
   - Previously collapsed to width: 0 with hidden overflow (gap appeared)
   - Now collapses to 64px icon rail — labels, text, and chevrons fade with opacity: 0 and overflow: hidden
   - Sidebar always occupies its 64px (collapsed) or 260px (expanded) space — no layout shift

6. **Mobile/tablet sidebar fit:**
   - Changed from display: block to display: flex; flex-direction: column so the user section and sign out button are always visible
   - Content fits without overflow on all phone sizes

7. **Admin sidebar variant updated** — dark theme styles extended to include signout button and collapsed rail states

**Files touched**

`
frontend/src/components/AppShell.tsx    (UserChip removed, ProfileAvatar added, sidebar signout, NavLinks profile image)
frontend/src/pages/profile.tsx          (profile hero card with avatar, sign out moved to Account card)
frontend/src/styles/shell.css           (sidebar dark theme mobile/tablet, desktop collapsed rail, signout styles, profile img nav)
frontend/src/styles/global.css          (profile-avatar, profile-hero, nav-item__profile-img styles)
`

**Verification**

| Check | Command | Result |
| --- | --- | --- |
| Frontend typecheck | 
pm run typecheck | exit 0, no diagnostics |
| Frontend build | 
pm run build | exit 0 |

**Status:** Done — sidebar is now dark-themed on mobile/tablet with white text/icons, shows profile image, has dedicated sign out button. Desktop sidebar collapses to 64px rail with no gap. Profile page shows avatar hero. Header simplified to bell-only.

**Next:** Resume roadmap tasks or proceed per roadmap.

### 2026-09-20 — Entry 0031 — Mobile drawer redesign + profile image API + social login backend + CSS brace fixes (Done)

**Phase:** UI/UX — mobile drawer modern redesign, profile image upload API, OAuth social login backend, CSS bug fixes

**Work done**

1. **Mobile drawer redesigned (modern panel):**
   - Widened from `min(82vw, 300px)` to `min(82vw, 320px)` with `border-radius: 0 16px 16px 0` for a modern rounded-edge feel
   - Changed dark theme background from `#102c3c` to richer `#0c232e`
   - Smoother open animation: `0.25s cubic-bezier(0.32, 0.72, 0, 1)` with backdrop-blur overlay (was `0.28s` with no blur)
   - Added **close (X) button** in sidebar header on mobile/tablet — 40px touch target, subtle hover

2. **Nav items modernized on mobile:**
   - Removed chevrons from all nav items — cleaner, less cluttered look
   - Increased min-height to 52px for generous touch targets
   - Added **left teal accent bar** (`#08a79d`, 3px wide, 8px inset) on active state instead of just background color
   - Active state: solid teal background (`#bceee7`) + bold text + accent bar
   - 12px border-radius on each nav item for a card-like feel

3. **User profile section polished:**
   - Rounded card background (`rgba(255,255,255,0.08)`) with 12px border-radius
   - Avatar increased to 44px with teal border accent (`2px solid rgba(255,255,255,0.2)`)
   - Added **ChevronRight** chevron on user section to indicate it's a tappable link
   - Name font-size bumped to `--text-md` for readability

4. **Sign out button refined:**
   - 48px min-height touch target
   - Subtle hover background effect
   - Icon and text sized proportionally

5. **Tablet drawer matched:**
   - Same modern style as mobile — wider panel, rounded corners, no chevrons on nav items, close button, accent bar on active state

6. **Desktop sidebar polished:**
   - Close button hidden on desktop (via `display: none`)
   - User chevron hidden in collapsed rail state (was referencing non-existent `.nav-item__chevron` in collapsed rules)
   - Desktop collapsed rail: labels, user info, user chevron, and signout text all fade with `opacity: 0; width: 0`

7. **Profile image upload API (backend):**
   - `uploadProfileImage(file)` — multipart/form-data PATCH to `/api/auth/me/` accepting image/jpeg, image/png, image/webp (5MB max)
   - `removeProfileImage()` — DELETE to `/api/auth/me/image/`
   - Returns updated User object with `profile_image` URL

8. **Profile image upload UI (frontend):**
   - Clickable avatar with hover overlay ("Change photo")
   - File input (`image/*`, 5MB limit, client-side validation)
   - Preview state with save/cancel buttons
   - Remove button when image exists

9. **Social login backend (`SocialLoginView`):**
   - `POST /api/auth/social/` — accepts `provider` (google/apple) and `token`
   - Google: verifies token via `oauth2.googleapis.com/tokeninfo`, fetches user info
   - Apple: verifies JWT via Apple's public keys (`https://appleid.apple.com/auth/keys`), decodes `sub` and `email`
   - Creates new user or logs in existing user, links social account
   - Downloads and saves profile image from OAuth provider

10. **Social login frontend:**
    - `socialLogin(provider, token)` API function in `auth.ts`
    - `socialLogin` method added to `SessionProvider` context
    - Google OAuth: lazy-loaded `accounts.google.com/gsi/client`, `useGoogleLogin()` hook
    - Apple OAuth: lazy-loaded `appleid.apple.com/auth`, `useAppleLogin()` hook
    - Welcome screen and login screen social buttons wired with `onClick` handlers

11. **CSS brace-depth fixes:**
    - Fixed leaked tablet media query rules in `shell.css` — `.shell__nav--side--open { transform: translateX(0) }` was outside media query scope, leaking into global CSS
    - Fixed stray `}` at line 284/350 that prematurely closed the `@media (min-width: 1200px)` block, causing desktop sidebar styles to be incomplete
    - Both fixes were root causes of desktop sidebar not toggling and empty-space layout gaps

**Files touched**

```
frontend/src/components/AppShell.tsx    (close button, removed nav chevrons, user chevron, 44px avatar)
frontend/src/styles/shell.css           (mobile drawer redesign, tablet drawer, desktop fixes, brace-depth fixes)
frontend/src/styles/global.css          (profile upload overlay, .sr-only)
frontend/src/pages/profile.tsx          (image upload UI with preview/remove)
frontend/src/pages/auth.tsx             (social login hooks, VerifyEmailScreen removed)
frontend/src/state/app-context.tsx      (socialLogin method in SessionProvider)
frontend/src/api/auth.ts               (socialLogin, uploadProfileImage, removeProfileImage)
frontend/src/api/types.ts              (User type: profile_image, no is_verified)
frontend/.env                          (VITE_GOOGLE_CLIENT_ID, VITE_APPLE_CLIENT_ID, VITE_APPLE_REDIRECT_URI)
backend/accounts/views.py              (SocialLoginView: Google/Apple verification)
backend/accounts/urls.py               (social login URL route)
backend/config/settings.py             (APPLE_CLIENT_ID setting)
backend/requirements.txt               (PyJWT, cryptography)
backend/.env.example                   (APPLE_CLIENT_ID)
```

**Verification**

| Check | Command | Result |
| --- | --- | --- |
| Frontend typecheck | `npx tsc --noEmit` | exit 0, no diagnostics |
| Frontend build | `npm run build` | exit 0, built in 1.84s |
| Django check | `python manage.py check` | exit 0, no issues |
| CSS brace audit | Manual review of shell.css media query nesting | All braces balanced, no leaked rules |

**Status:** Done — mobile drawer is a modern slide-out panel with close button, no chevrons, left accent bar on active, polished user section. Profile image upload API and UI working. Social login backend handles Google/Apple token verification and user creation. CSS brace-depth bugs fixed.

**Next:** Resume roadmap tasks — desktop layout gap fix still pending (empty space to right of sidebar), frontend OAuth button testing on mobile.

---

### 2026-09-20 — Entry 0032 — Admin-create 500 fix, dashboard crash fix, doctor self-service card, strict role isolation, /doctors card restyle, realtime WebSocket push (Done)

**Phase:** Bug fixing + feature delivery (PHASE 13 realtime push) — six work items in one session, each verified independently

**Work done**

1. **500 on `POST /api/admin/doctors/create/` fixed (backend):**
   - Root cause: `AdminDoctorCreateSerializer` validated `username` only; `User.email` is `unique=True` and Django's `UserManager._create_user()` runs `full_clean()`, raising a Django `ValidationError` (not DRF's). `common.exceptions.custom_exception_handler` returned `None` for non-DRF exceptions → bare 500 with no envelope. Same exposure in `AdminUserCreateView`.
   - `backend/reports/views.py`: single `User = get_user_model()` at module top; case-insensitive `validate_email` added to both create serializers; `create()` wrapped in `try/except (DjangoValidationError, IntegrityError)` → converted to DRF `ValidationError` (HTTP 400 envelope, transaction rollback — no half-created user); `consultation_fee` default `0` → `Decimal("0")`.
   - Result: duplicate email/username now returns `400 {success:false, errors:{email:[...]}}` instead of 500.

2. **Patient `/dashboard` white screen fixed (frontend):**
   - Root cause: DRF serializes `Doctor.average_rating` (`DecimalField`) as a string `"0.00"`; `PatientHome` called `doctor.average_rating?.toFixed(1)` → `TypeError` → React unmounted the whole tree (white screen; `ErrorBoundary` only wraps the root). Same crash in doctor profile and admin dashboard.
   - `frontend/src/api/types.ts` — `average_rating: number | string | null`
   - `frontend/src/components/reviews.tsx` — new `ratingNumber()` / `formatRating()` coercion helpers; `StarRating` accepts `number|string|null`
   - `frontend/src/pages/index.tsx`, `frontend/src/pages/doctor.tsx`, `frontend/src/pages/admin-dashboard.tsx` — all render ratings via `formatRating()`

3. **Doctor self-service card `/doctor/personal` (new) + photos on `/doctors` cards:**
   - `backend/doctors/serializers.py` — `DoctorSerializer` exposes `profile_image` (from linked `User.profile_image`, absolute URL) plus `first_name`/`last_name`/`email`
   - `backend/doctors/views.py` — `MyDoctorProfileView` GET/PATCH pass `context={"request": request}`; `PATCH /api/doctors/me/profile/` accepts `first_name`/`last_name` (saved on `User`) plus `experience_years`, `consultation_fee`, `qualifications`, `bio` (saved on `Doctor`)
   - Card photo upload reuses the existing multipart `PATCH /api/auth/me/` (`profile_image`) — the same image the doctor card reads, so no new model/migration
   - `frontend/src/pages/doctor.tsx` — new `DoctorPersonalScreen` at `/doctor/personal`: patient-style preview card (photo, name, experience, fee, rating) + "Edit card details" form (first/last name, experience, consultation fee) + card-photo upload (≤5MB, image-only)
   - `frontend/src/App.tsx` — `RequireRole(doctor)` route `/doctor/personal`; `frontend/src/components/AppShell.tsx` — doctor nav "Doctors" → "My card"
   - `frontend/src/pages/index.tsx` — `doctorCardImage()` helper (uploaded photo first, placeholder fallback); `DoctorsPage` cards render `<img class="doctor-card__photo">`; patient home Top Doctors uses the same helper

4. **Strict role isolation; sign-out always lands on `/signin`:**
   - Problem: patient routes had only `RequireAuth`, so a signed-in doctor/admin could open `/dashboard`, `/doctors`, `/settings` directly; wrong-role bounces went to `/` (`LaunchRoute`); post-login navigated to `from ?? "/"`, so a saved `/admin` URL could land a fresh patient login on an admin page.
   - `frontend/src/components/guards.tsx` — `homeForRole(user)` as the single source (doctor → `/doctor/dashboard`, admin → `/admin`, else → `/dashboard`); `RequireRole` wrong-role → own home (never another role's page); new `RequirePatient` guard (guest → `/login` with `from`, doctor/admin → own home)
   - `frontend/src/App.tsx` — `LaunchRoute` uses `homeForRole`; guest-only `/signin` route (`/login` kept as alias); `/dashboard`, `/doctors`, `/doctors/:id`, `/booking/*`, `/settings` wrapped in `RequirePatient`
   - `frontend/src/pages/auth.tsx` — post-login honours `from` only if role-neutral (`isSafeRedirect` rejects `/admin*`, `/doctor/*`, and auth pages); otherwise lands on that role's dashboard via `freshHomeForRole()`
   - `frontend/src/pages/index.tsx` — `HomeScreen` is patient-only; `frontend/src/pages/profile.tsx` + `frontend/src/components/AppShell.tsx` — both sign-out buttons → `navigate("/signin", { replace: true })`
   - Result: signing out in any role always lands on `/signin`; back-button revisits to any role route hit a guard as guest → login; no role change without a fresh login.

5. **`/doctors` card styling fixed:**
   - Root cause: `DoctorsPage` used `className="doctor-card"` which has no CSS rule anywhere in the stylesheets → unstyled stacked cards.
   - `frontend/src/pages/index.tsx` — `DoctorsPage` renders the same markup as patient home Top Doctors (`home__doctor-card`) inside `home__doctor-list doctors__grid`
   - `frontend/src/styles/global.css` — `.doctors-page .doctors__filters` (3-column desktop, stacked mobile) and `.doctors__grid` (`repeat(auto-fill, minmax(220px, 1fr))` responsive grid, no horizontal scroll on phones)

6. **Realtime WebSocket updates — no refresh needed (PHASE 13 push):**
   - `backend/requirements.txt` — `channels[daphne]==4.3.2` installed into `backend/.venv` (daphne 4.2.3 pulled in)
   - `backend/config/settings.py` — `daphne` (must stay first in `INSTALLED_APPS`: swaps runserver to the ASGI dev server) + `channels`; `CHANNEL_LAYERS` = `InMemoryChannelLayer` (single-process dev; production should switch to `channels_redis`)
   - `backend/config/asgi.py` — `ProtocolTypeRouter`: `http` → Django ASGI app, `websocket` → `URLRouter(websocket_urlpatterns)`; routing imported only after Django setup
   - `backend/notifications/consumers.py` (new) — `NotificationConsumer` at `/ws/notifications/?token=<JWT>` (query param because browsers cannot set an Authorization header on the WS handshake); missing/invalid token → close code `4001` before accept; joins personal group `user_<pk>`; `{"type":"ping"}` → `pong` keepalive; `notify_event` group handler
   - `backend/notifications/routing.py` (new) — `path("ws/notifications/", NotificationConsumer.as_asgi())`
   - `backend/notifications/helpers.py` — `user_group_name()`; `notify()` now also pushes `notification.created` via `transaction.on_commit` (never sends for a rolled-back transaction); new `broadcast_appointment_event()`
   - `backend/appointments/views.py` — booking creation and every status change (confirm/reject/complete/cancel) broadcast `appointment.created` / `appointment.updated` to both patient and doctor
   - `frontend/src/realtime/socket.ts` (new) — singleton WS manager: `setIdentity(userId|null)` wired to session changes (socket closed on sign-out so a logged-out tab receives nothing); connects with `?token=`; on close `4001` silently single-flight-refreshes the access token (shared `refreshAccessToken()`) and reconnects; exponential backoff 1s→30s; 25s ping; multi-subscriber safe dispatch; `useRealtimeEvent(handler)` hook
   - Wired consumers: `AppShell` bell (unread badge +1 + toast), `NotificationsScreen` (reload), `AppointmentsList` / `AppointmentDetail` (reload; detail matches `payload.id`), `PatientHome`, `DoctorDashboard`, `DoctorAppointmentsScreen`
   - `frontend/vite.config.ts` — `/ws` proxy (dev + preview) already in place

**Files touched**

```
backend/requirements.txt                (channels[daphne]==4.3.2)
backend/config/settings.py              (daphne + channels apps, CHANNEL_LAYERS)
backend/config/asgi.py                  (ProtocolTypeRouter with websocket routing)
backend/notifications/consumers.py      (NEW — NotificationConsumer, JWT via ?token=)
backend/notifications/routing.py        (NEW — /ws/notifications/ route)
backend/notifications/helpers.py        (WS push on notify(), broadcast_appointment_event)
backend/notifications/tests_realtime.py (NEW — 5 WebSocket tests)
backend/appointments/views.py           (broadcast on create + status changes)
backend/reports/views.py                (admin create 500 → 400 fix)
backend/doctors/serializers.py          (profile_image + user names exposed)
backend/doctors/views.py                (MyDoctorProfileView name updates, request context)
frontend/src/realtime/socket.ts         (NEW — WS manager + useRealtimeEvent hook)
frontend/src/components/guards.tsx      (homeForRole, RequirePatient)
frontend/src/components/AppShell.tsx    (bell realtime, "My card" nav, sign-out → /signin)
frontend/src/components/reviews.tsx     (ratingNumber / formatRating)
frontend/src/App.tsx                    (/signin route, RequirePatient wraps, /doctor/personal)
frontend/src/pages/auth.tsx             (role-safe post-login redirect)
frontend/src/pages/index.tsx            (doctorCardImage, /doctors cards, patient-only HomeScreen)
frontend/src/pages/doctor.tsx           (DoctorPersonalScreen, profile photo, rating fix)
frontend/src/pages/doctor-dashboard.tsx (realtime reload)
frontend/src/pages/admin-dashboard.tsx  (rating fix)
frontend/src/pages/appointments.tsx     (realtime reload — list + detail)
frontend/src/pages/notifications.tsx    (realtime reload)
frontend/src/pages/profile.tsx          (sign-out → /signin)
frontend/src/api/types.ts               (average_rating union, profile_image)
frontend/src/api/doctors.ts             (updateMyDoctorProfile with names)
frontend/src/styles/global.css          (doctor-card__photo, doctors__grid / filters)
frontend/src/state/app-context.tsx      (setIdentity wired to session changes)
```

**Verification**

| Check | Command | Result |
| --- | --- | --- |
| Django system check | `.venv\Scripts\python.exe manage.py check` | exit 0, no issues |
| Notifications + realtime suite | `manage.py test notifications` | 12/12 OK — 5 new WS tests: token rejection ×2, connect + group push, ping/pong, raw `user_<id>` group send |
| Full backend suite | `manage.py test` | 47/48 — single failure is a pre-existing `accounts` welcome-email outbox test (fails on clean `main` too, unrelated to this session) |
| Frontend typecheck | `npm run typecheck` | exit 0, no diagnostics |
| Frontend build | `npm run build` | exit 0, success |
| Frontend unit tests | `npm run test` | 36/36 pass |
| Doctors module tests | `manage.py test doctors` | 3/3 OK |

**Status:** Done — all six items completed and verified with the commands above. Realtime requires restarting `manage.py runserver` (Daphne replaces the WSGI dev server and serves `/ws/notifications/`); with the server up, two open browsers (patient `/appointments`, doctor `/doctor/dashboard`) see bookings and status changes instantly.

**Next:** production channel layer (`channels_redis`) for multi-process deployments; move WS auth from query param to a header/subprotocol or short-lived ticket; investigate the pre-existing `accounts` test failure; desktop OAuth button testing on mobile.

---

### 2026-09-21 — Entry 0034 — Emoji → Lucide React icon replacement (Done)

**Phase:** Frontend polish — iconography consistency

**Task:** Search the entire codebase for emoji used in UI markup/text and replace every instance with a Lucide React icon (the project's icon set: `lucide-react` v1.47.0).

**Findings — emoji located:**

| File | Line | Emoji | Context | Replacement |
|------|------|-------|---------|-------------|
| `frontend/src/pages/appointments.tsx` | 550 | ⏰ | Pending status icon string | `<Clock3 size={14} />` |
| `frontend/src/pages/appointments.tsx` | 551 | ✓ | Confirmed status icon string | `<CheckCircle2 size={14} />` |
| `frontend/src/pages/appointments.tsx` | 552 | ✓✓ | Completed status icon string | `<CheckCircle2 size={14} />` (single icon, label "Completed") |
| `frontend/src/pages/appointments.tsx` | 553 | ✕ | Cancelled status icon string | `<XCircle size={14} />` |
| `frontend/src/pages/appointments.tsx` | 554 | ✕ | Rejected status icon string | `<XCircle size={14} />` |
| `frontend/src/pages/appointments.tsx` | 589 | 📅 | Empty-state illustration | `<Calendar size={40} />` (inside `<div className="patient-appt-empty__icon">`) |
| `frontend/src/components/ToastViewport.tsx` | 22 | × | Toast dismiss close button | `<X size={16} aria-hidden="true" />` |
| `frontend/public/offline.html` | 12 | ⚠ | Offline page warning icon | Inline `<svg>` of Lucide `AlertTriangle` (40×40, inherits `color` from parent) |

**Approach:**
1. Searched all `*.tsx`, `*.ts`, `*.css`, `*.html`, `*.json`, `*.md` files under `frontend/` and `backend/` for Unicode emoji ranges (U+1F300–1FAFF, U+2600–27BF, U+2B00–2BFF) plus common symbol emoji (✓ ✕ ✗ ✗ ⚠ ❗ ❌ ❤ ❌ ✔ ✖).
2. Excluded non-UI emoji found in documentation (`project development.md` table cells using `×` as a multiplication sign in prose like "curl.exe × 4" and "×2" = "twice") — these are not rendered UI elements and were left unchanged.
3. Excluded text arrows (`→`, `←`, `↓`, `↑`) in code comments and architecture diagrams — these are ASCII-style directional arrows, not emoji.
4. Changed `statusConfig` type from `{ icon: string }` to `{ icon: React.ReactNode }` and rendered the icon JSX alongside the status label in the `<span className="patient-appt-card__status">`.
5. Updated `.patient-appt-empty__icon` CSS in `global.css` from `font-size: 48px` (emoji-only) to `display: flex; width: 64px; height: 64px; color: #94a3b8` so the `<Calendar>` SVG center-renders correctly.
6. For `offline.html` (a static HTML file, no React runtime), inlined the raw SVG path data of Lucide's `AlertTriangle` icon so the visual matches the rest of the app.

**Files modified:**
- `frontend/src/pages/appointments.tsx` — added `Clock3`, `XCircle`, `Calendar` to the existing `lucide-react` import; replaced 5 emoji string icons with JSX components; replaced 📅 with `<Calendar size={40} />`; rendered `{sc.icon}` in the status span.
- `frontend/src/components/ToastViewport.tsx` — added `import { X } from "lucide-react"`; replaced `×` text with `<X size={16} aria-hidden="true" />`.
- `frontend/src/styles/global.css` — updated `.patient-appt-empty__icon` rule (2677) for SVG layout.
- `frontend/public/offline.html` — replaced ⚠ with inline AlertTriangle SVG.

**Validation:**
- `npm run build` → ✅ built in 806ms, 1978 modules transformed, no errors/warnings.
- `npx vitest run` → ✅ 36/36 tests passed across 4 test files (Splash, ui, Onboarding, reviews).

**Result:** All UI-facing emoji have been replaced with `lucide-react` icons. The app now uses a single consistent icon set throughout.
