<#
.SYNOPSIS
    Creates a full PostgreSQL backup of the MediBook database.

.DESCRIPTION
    Dumps every table (schema + data) from the database in frontend/.env to a
    PostgreSQL custom-format archive in E:\Medibook\backups, verifies the
    archive with pg_restore, and deletes dumps older than RetentionDays.

    Run manually:
        powershell -NoProfile -ExecutionPolicy Bypass -File scripts\backup\backup-medibook.ps1

    The scheduled task installed by install-backup-task.ps1 runs this daily.

.PARAMETER OutputDirectory
    Directory for the .dump files. Defaults to <repo>\backups.

.PARAMETER RetentionDays
    Delete medibook-*.dump files older than this many days. Default 30.

.PARAMETER EnvFile
    File that contains DATABASE_URL. Defaults to <repo>\frontend\.env.

.PARAMETER PgBin
    Directory containing pg_dump.exe / pg_restore.exe. Defaults to the bundled
    copy in <repo>\.tools\pgsql\bin, then PATH, then Program Files.
#>
[CmdletBinding()]
param(
    [string]$OutputDirectory = '',
    [ValidateRange(1, 3650)]
    [int]$RetentionDays = 30,
    [string]$EnvFile = '',
    [string]$PgBin = ''
)

$ErrorActionPreference = 'Stop'

$repoRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\..'))
if (-not $OutputDirectory) { $OutputDirectory = Join-Path $repoRoot 'backups' }
if (-not $EnvFile) { $EnvFile = Join-Path $repoRoot 'frontend\.env' }
$OutputDirectory = [System.IO.Path]::GetFullPath($OutputDirectory)

New-Item -ItemType Directory -Force -Path $OutputDirectory | Out-Null
$logPath = Join-Path $OutputDirectory 'backup.log'

function Write-Log {
    param([string]$Message)
    $line = '[{0}] {1}' -f (Get-Date -Format 'yyyy-MM-dd HH:mm:ss'), $Message
    Write-Host $line
    Add-Content -LiteralPath $logPath -Value $line -Encoding UTF8
}

function Resolve-PgTool {
    param(
        [Parameter(Mandatory = $true)][string]$Name,
        [switch]$Optional
    )

    $fileName = "$Name.exe"
    $candidates = New-Object System.Collections.Generic.List[string]

    if ($PgBin) { $candidates.Add((Join-Path $PgBin $fileName)) }
    if ($env:PG_BIN) { $candidates.Add((Join-Path $env:PG_BIN $fileName)) }
    $candidates.Add((Join-Path $repoRoot ".tools\pgsql\bin\$fileName"))

    $command = Get-Command $fileName -ErrorAction SilentlyContinue
    if ($command) { $candidates.Add($command.Source) }

    $installRoot = 'C:\Program Files\PostgreSQL'
    if (Test-Path -LiteralPath $installRoot) {
        Get-ChildItem -LiteralPath $installRoot -Directory -ErrorAction SilentlyContinue |
            Sort-Object -Property Name -Descending |
            ForEach-Object { $candidates.Add((Join-Path $_.FullName "bin\$fileName")) }
    }

    foreach ($candidate in $candidates) {
        if ($candidate -and (Test-Path -LiteralPath $candidate -PathType Leaf)) {
            return (Resolve-Path -LiteralPath $candidate).Path
        }
    }

    if ($Optional) { return $null }
    throw "Could not find $fileName. Run scripts\backup\install-backup-task.ps1 once, or install PostgreSQL client tools."
}

function Get-DatabaseUrl {
    if ($env:DATABASE_URL -and $env:DATABASE_URL.Trim()) {
        return $env:DATABASE_URL.Trim()
    }

    if (-not (Test-Path -LiteralPath $EnvFile -PathType Leaf)) {
        throw "DATABASE_URL is not set and $EnvFile does not exist."
    }

    $match = Select-String -LiteralPath $EnvFile -Pattern '^\s*(?:export\s+)?DATABASE_URL\s*=' |
        Select-Object -First 1
    if (-not $match) {
        throw "DATABASE_URL was not found in $EnvFile."
    }

    $value = ($match.Line -replace '^\s*(?:export\s+)?DATABASE_URL\s*=\s*', '').Trim()
    if (($value.StartsWith('"') -and $value.EndsWith('"')) -or
        ($value.StartsWith("'") -and $value.EndsWith("'"))) {
        $value = $value.Substring(1, $value.Length - 2)
    }

    if (-not $value) { throw "DATABASE_URL in $EnvFile is empty." }
    return $value
}

$startedAt = Get-Date
$dumpFile = $null
$backupCompleted = $false
Write-Log '--- MediBook database backup started ---'

try {
    $databaseUrl = Get-DatabaseUrl
    $pgDump = Resolve-PgTool -Name 'pg_dump'
    $pgRestore = Resolve-PgTool -Name 'pg_restore' -Optional

    $dumpVersion = (& $pgDump --version 2>&1 | Out-String).Trim()
    Write-Log "Using $dumpVersion"
    if ($pgRestore) {
        $restoreVersion = (& $pgRestore --version 2>&1 | Out-String).Trim()
        Write-Log "Using $restoreVersion"
    }

    $stamp = Get-Date -Format 'yyyy-MM-dd_HH-mm-ss'
    $dumpFile = Join-Path $OutputDirectory "medibook-$stamp.dump"

    $env:PGCLIENTENCODING = 'UTF8'
    $env:PGCONNECT_TIMEOUT = '30'

    Write-Log "Writing $dumpFile"

    # Native stderr must not become a terminating error under EAP=Stop; capture
    # it, log it, and decide based on pg_dump's exit code instead.
    $previousErrorActionPreference = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'
    try {
        $dumpOutput = & $pgDump `
            --dbname $databaseUrl `
            --format=custom `
            --compress=9 `
            --no-owner `
            --no-privileges `
            --file $dumpFile 2>&1
        $dumpExitCode = $LASTEXITCODE
    }
    finally {
        $ErrorActionPreference = $previousErrorActionPreference
    }

    foreach ($line in @($dumpOutput)) {
        if ("$line".Trim()) { Write-Log "  $line" }
    }

    if ($dumpExitCode -ne 0) {
        if (Test-Path -LiteralPath $dumpFile) { Remove-Item -LiteralPath $dumpFile -Force -ErrorAction SilentlyContinue }
        throw "pg_dump failed with exit code $dumpExitCode."
    }

    $dumpItem = Get-Item -LiteralPath $dumpFile
    if ($dumpItem.Length -lt 1024) {
        Remove-Item -LiteralPath $dumpFile -Force -ErrorAction SilentlyContinue
        throw "pg_dump produced an unexpectedly small file ($($dumpItem.Length) bytes)."
    }

    if ($pgRestore) {
        $previousErrorActionPreference = $ErrorActionPreference
        $ErrorActionPreference = 'Continue'
        try {
            $archiveList = & $pgRestore --list $dumpFile 2>&1
            $restoreExitCode = $LASTEXITCODE
        }
        finally {
            $ErrorActionPreference = $previousErrorActionPreference
        }

        if ($restoreExitCode -ne 0) {
            throw 'pg_restore could not read the new archive; the backup is invalid.'
        }
        $tableSections = @($archiveList | Select-String -Pattern 'TABLE DATA').Count
        Write-Log "Verified with pg_restore: $tableSections table-data sections"
    }
    else {
        Write-Log 'WARNING: pg_restore not found; skipped archive verification.'
    }

    $sizeMb = [math]::Round($dumpItem.Length / 1MB, 2)
    $backupCompleted = $true
    Write-Log "Backup complete: $($dumpItem.Name) ($sizeMb MB)"

    $cutoff = (Get-Date).AddDays(-$RetentionDays)
    $expired = @(Get-ChildItem -LiteralPath $OutputDirectory -Filter 'medibook-*.dump' -File |
        Where-Object { $_.LastWriteTime -lt $cutoff })
    foreach ($old in $expired) {
        Remove-Item -LiteralPath $old.FullName -Force
        Write-Log "Deleted expired backup $($old.Name)"
    }

    $elapsed = [math]::Round(((Get-Date) - $startedAt).TotalSeconds, 1)
    Write-Log "--- Backup succeeded in $elapsed s ---"
    exit 0
}
catch {
    Write-Log "ERROR: $($_.Exception.Message)"
    if (-not $backupCompleted -and $dumpFile -and (Test-Path -LiteralPath $dumpFile -PathType Leaf)) {
        Remove-Item -LiteralPath $dumpFile -Force -ErrorAction SilentlyContinue
        Write-Log "Removed incomplete dump $dumpFile"
    }
    Write-Log '--- Backup failed ---'
    exit 1
}
