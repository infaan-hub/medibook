# MediBook — local PostgreSQL 18 helper (development only)
#
# PHASE 2 (Django Foundation) support script.
#
# Why this exists: `pg_ctl start` on Windows leaves the postmaster attached to the
# calling console, which makes the shell hang until the server exits. This script
# detaches the start through Start-Process and waits with `pg_isready` instead.
#
# Note: the PostgreSQL Windows service (postgresql-x64-18) and a manually started
# postmaster share the same data directory, so only one of them can run at a time.
#
# Usage:
#   powershell -ExecutionPolicy Bypass -File backend\scripts\pg.ps1 status
#   powershell -ExecutionPolicy Bypass -File backend\scripts\pg.ps1 start
#   powershell -ExecutionPolicy Bypass -File backend\scripts\pg.ps1 stop
#   powershell -ExecutionPolicy Bypass -File backend\scripts\pg.ps1 restart

param(
    [ValidateSet("start", "stop", "restart", "status")]
    [string]$Action = "status"
)

$ErrorActionPreference = "Stop"

if ($env:MEDIBOOK_PG_BIN) { $PgBin = $env:MEDIBOOK_PG_BIN } else { $PgBin = "E:\PostgreSQL\18\bin" }
if ($env:MEDIBOOK_PG_DATA) { $PgData = $env:MEDIBOOK_PG_DATA } else { $PgData = "E:\PostgreSQL\18\data" }

$PgCtl = Join-Path $PgBin "pg_ctl.exe"
$PgIsReady = Join-Path $PgBin "pg_isready.exe"
$PgLog = Join-Path $env:TEMP "medibook_pg.log"

if (-not (Test-Path -LiteralPath $PgCtl)) {
    throw "pg_ctl.exe not found at $PgCtl. Set MEDIBOOK_PG_BIN to your PostgreSQL bin directory."
}

function Test-PostgresRunning {
    if (Test-Path -LiteralPath $PgIsReady) {
        & $PgIsReady -h 127.0.0.1 -p 5432 -q | Out-Null
        return ($LASTEXITCODE -eq 0)
    }
    & $PgCtl -D $PgData status | Out-Null
    return ($LASTEXITCODE -eq 0)
}

function Start-Postgres {
    if (Test-PostgresRunning) {
        Write-Output "PostgreSQL is already running on 127.0.0.1:5432."
        return
    }

    # Detached start: the postmaster must not inherit this console.
    Start-Process -FilePath $PgCtl `
        -ArgumentList @("-D", $PgData, "-l", $PgLog, "start") `
        -WindowStyle Hidden | Out-Null

    for ($attempt = 0; $attempt -lt 30; $attempt++) {
        if (Test-PostgresRunning) {
            Write-Output "PostgreSQL started (127.0.0.1:5432). Log: $PgLog"
            return
        }
        Start-Sleep -Seconds 1
    }

    throw "PostgreSQL did not become ready within 30s. Check $PgLog."
}

function Stop-Postgres {
    if (-not (Test-PostgresRunning)) {
        Write-Output "PostgreSQL is not running."
        return
    }
    & $PgCtl -D $PgData stop -m fast | Out-Null
    Write-Output "PostgreSQL stopped."
}

switch ($Action) {
    "start" { Start-Postgres }
    "stop" { Stop-Postgres }
    "restart" {
        Stop-Postgres
        Start-Postgres
    }
    "status" {
        if (Test-PostgresRunning) {
            Write-Output "PostgreSQL is running on 127.0.0.1:5432."
        }
        else {
            Write-Output "PostgreSQL is NOT running."
        }
    }
}