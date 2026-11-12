# Database keep-alive and backups

MediBook uses a Neon PostgreSQL database. Neon suspends a free-plan project
after roughly five minutes without a query, so two independent mechanisms keep
it available and backed up.

## 1. Keep-alive — `.github/workflows/keep-alive.yml`

- Runs every 30 minutes, and each run queries the database every 4 minutes for
  about 29 minutes. Because the next run is queued instead of cancelled, the
  database never stays idle long enough to suspend.
- **No setup is required.** By default it calls
  `https://zan-medibook.vercel.app/api/health/`, which runs `SELECT 1` against
  the production database.
- Optional: add a repository secret named `DATABASE_URL` to ping Postgres
  directly instead of going through Vercel. This also keeps working if the web
  deployment is down.
- Optional: add a repository variable named `MEDIBOOK_HEALTH_URL` if the
  deployment URL changes.
- You can start a run manually from **Actions → Keep database awake → Run
  workflow**.

> GitHub disables scheduled workflows in public repositories after 60 days
> without repository activity. If the workflow stops, open the Actions tab and
> re-enable it.

> Keeping compute active 24/7 uses about 720 compute-hours per month. Check
> that this fits your Neon plan; the free plan includes far fewer hours and can
> suspend the project after the monthly allowance is used.

## 2. Cloud backup — `.github/workflows/backup.yml`

Runs daily at **02:15 UTC**, dumps the complete database (schema and data for
all tables), verifies the archive, encrypts it with AES-256, and stores it as a
GitHub Actions artifact for 30 days.

One-time setup — add these under **Settings → Secrets and variables → Actions
→ New repository secret**:

| Secret | Value |
| --- | --- |
| `DATABASE_URL` | The Neon connection string from `frontend/.env`. The workflow automatically rewrites Neon's `-pooler` host to the direct host for `pg_dump`. |
| `BACKUP_PASSPHRASE` | A long random passphrase (16+ characters). **Store it in a password manager** — the backup cannot be decrypted without it. |

Optional:

| Name | Type | Value |
| --- | --- | --- |
| `BACKUP_DATABASE_URL` | Secret | A direct, non-pooler Neon URL, if you prefer not to use the automatic rewrite. |
| `MEDIBOOK_HEALTH_URL` | Variable | Used by the keep-alive workflow only. |

Generate a passphrase in PowerShell:

```powershell
-join ((48..57) + (65..90) + (97..122) | Get-Random -Count 40 | ForEach-Object { [char]$_ })
```

Start a backup manually from **Actions → Backup database → Run workflow**.

### Restore a cloud backup

1. Download the artifact from the workflow run and decrypt it:

   ```powershell
   gpg --output medibook.dump --decrypt medibook-YYYY-MM-DD_HHMMSS.dump.gpg
   ```

2. Restore into an empty database:

   ```powershell
   pg_restore --no-owner --no-privileges `
     --dbname "postgresql://USER:PASSWORD@HOST:5432/DB" medibook.dump
   ```

   Add `--clean --if-exists` to replace the objects in an existing database.

## 3. Local daily backup — Windows Task Scheduler

Because a GitHub-hosted runner cannot write to `E:\Medibook`, a local task
creates a second copy directly on this machine.

| Item | Value |
| --- | --- |
| Task name | `MediBook Neon Daily Backup` |
| Schedule | Daily at **02:00** local time; missed runs start after the next logon |
| Output | `E:\Medibook\backups\medibook-YYYY-MM-DD_HH-mm-ss.dump` |
| Format | PostgreSQL custom archive (complete schema + data), verified with `pg_restore` |
| Retention | 30 days |
| Log | `E:\Medibook\backups\backup.log` |

Re-run the setup after moving the repository or reinstalling Windows:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\backup\install-backup-task.ps1 -RunNow
```

Run a backup immediately at any time:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\backup\backup-medibook.ps1
```

Change the time or retention:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\backup\install-backup-task.ps1 -Time 03:30 -RetentionDays 45
```

The installer downloads the official PostgreSQL 18 client binaries into
`E:\Medibook\.tools\pgsql` (about 330 MB) so nothing has to be installed
system-wide. Both `.tools/` and `backups/` are git-ignored.

### Restore a local backup

```powershell
& "E:\Medibook\.tools\pgsql\bin\pg_restore.exe" `
  --clean --if-exists --no-owner --no-privileges `
  --dbname "postgresql://USER:PASSWORD@HOST:5432/DB" `
  "E:\Medibook\backups\medibook-YYYY-MM-DD_HH-mm-ss.dump"
```

## Security

This repository is public. Never commit `frontend/.env`, `.dump` files, or
decrypted backups. Cloud artifacts are encrypted; local backups contain real
patient data and must stay on trusted storage.
