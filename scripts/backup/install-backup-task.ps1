<#
.SYNOPSIS
    Installs the portable PostgreSQL client and registers the daily MediBook
    backup task in Windows Task Scheduler.

.DESCRIPTION
    One-time setup. Afterwards Windows runs backup-medibook.ps1 every day at
    02:00 (local time) and writes full database dumps to E:\Medibook\backups.
    Missed runs start automatically the next time the user is logged on.

    Run once from any directory:
        powershell -NoProfile -ExecutionPolicy Bypass -File scripts\backup\install-backup-task.ps1

    Options:
        -Time '03:30'        change the daily run time
        -RetentionDays 45    keep dumps longer (default 30)
        -RunNow              take a backup immediately after registering
        -TaskName '...'      use a different Task Scheduler name
#>
[CmdletBinding()]
param(
    [string]$Time = '02:00',
    [ValidateRange(1, 3650)]
    [int]$RetentionDays = 30,
    [string]$TaskName = 'MediBook Neon Daily Backup',
    [string]$PgVersion = '18.6',
    [switch]$RunNow
)

$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'

$repoRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\..'))
$backupScript = Join-Path $PSScriptRoot 'backup-medibook.ps1'
$toolsRoot = Join-Path $repoRoot '.tools'
$pgDump = Join-Path $toolsRoot 'pgsql\bin\pg_dump.exe'

if (-not (Test-Path -LiteralPath $backupScript -PathType Leaf)) {
    throw "Backup script not found: $backupScript"
}

# Validate the time early so Task Scheduler never sees a malformed value.
try {
    [void][datetime]::ParseExact($Time, 'HH:mm', [System.Globalization.CultureInfo]::InvariantCulture)
}
catch {
    throw "Time must use 24-hour HH:mm format, for example 02:00 or 23:30."
}

function Write-Step {
    param([string]$Message)
    Write-Host "[$(Get-Date -Format 'HH:mm:ss')] $Message"
}

# ---------------------------------------------------------------- pg client
if (-not (Test-Path -LiteralPath $pgDump -PathType Leaf)) {
    New-Item -ItemType Directory -Force -Path $toolsRoot | Out-Null

    $zipPath = Join-Path $toolsRoot "pgsql-$PgVersion.zip"
    $zipUrl = "https://get.enterprisedb.com/postgresql/postgresql-$PgVersion-1-windows-x64-binaries.zip"

    if (-not (Test-Path -LiteralPath $zipPath -PathType Leaf)) {
        Write-Step "Downloading PostgreSQL $PgVersion client tools (about 330 MB)..."
        Write-Step "  $zipUrl"
        Invoke-WebRequest -Uri $zipUrl -OutFile $zipPath -UseBasicParsing
    }
    else {
        Write-Step "Using existing download: $zipPath"
    }

    Write-Step 'Extracting pg_dump and pg_restore...'
    $tar = Get-Command 'tar.exe' -ErrorAction SilentlyContinue
    if ($tar) {
        & $tar.Source -xf $zipPath -C $toolsRoot
        if ($LASTEXITCODE -ne 0) {
            throw "tar.exe failed to extract $zipPath (exit code $LASTEXITCODE)."
        }
    }
    else {
        Expand-Archive -LiteralPath $zipPath -DestinationPath $toolsRoot -Force
    }

    if (-not (Test-Path -LiteralPath $pgDump -PathType Leaf)) {
        throw "Extraction finished but pg_dump.exe was not found at $pgDump."
    }

    Remove-Item -LiteralPath $zipPath -Force -ErrorAction SilentlyContinue
}

$dumpVersion = (& $pgDump --version 2>&1 | Out-String).Trim()
Write-Step "PostgreSQL client ready: $dumpVersion"

# ----------------------------------------------------------- scheduled task
$powerShellExe = Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0\powershell.exe'
$arguments = '-NoProfile -NonInteractive -ExecutionPolicy Bypass -File "{0}"' -f $backupScript

$action = New-ScheduledTaskAction -Execute $powerShellExe -Argument $arguments
$trigger = New-ScheduledTaskTrigger -Daily -At $Time
$settings = New-ScheduledTaskSettingsSet `
    -StartWhenAvailable `
    -AllowStartIfOnBatteries `
    -DontStopIfGoingOnBatteries `
    -ExecutionTimeLimit (New-TimeSpan -Hours 1) `
    -MultipleInstances IgnoreNew

$currentUser = [System.Security.Principal.WindowsIdentity]::GetCurrent().Name
$principal = New-ScheduledTaskPrincipal -UserId $currentUser -LogonType Interactive -RunLevel Limited

Write-Step "Registering scheduled task '$TaskName' for $currentUser at $Time daily..."
Register-ScheduledTask `
    -TaskName $TaskName `
    -Description 'Daily full PostgreSQL backup of the MediBook NEON database into E:\Medibook\backups.' `
    -Action $action `
    -Trigger $trigger `
    -Settings $settings `
    -Principal $principal `
    -Force | Out-Null

$task = Get-ScheduledTask -TaskName $TaskName
$taskInfo = Get-ScheduledTaskInfo -TaskName $TaskName
Write-Step "Task state: $($task.State)"
Write-Step "Next run:   $($taskInfo.NextRunTime)"

if ($RunNow) {
    Write-Step 'Running the first backup now...'
    & $backupScript -RetentionDays $RetentionDays
    if ($LASTEXITCODE -ne 0) {
        throw "The scheduled task was registered, but the first backup failed."
    }
}

Write-Step 'Done.'
Write-Step "Backups are written to: $(Join-Path $repoRoot 'backups')"
Write-Step "Manual run: powershell -NoProfile -ExecutionPolicy Bypass -File `"$backupScript`""
