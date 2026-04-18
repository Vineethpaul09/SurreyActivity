<#
.SYNOPSIS
    Launches the Surrey Activity Booking scheduler on Windows.

.DESCRIPTION
    Keeps the scheduled task attached to the real Node.js process so Windows
    Task Scheduler can report an accurate state and restart the task if the
    scheduler exits. Also rebuilds when source files are newer than dist.
#>

$ErrorActionPreference = "Stop"

$ProjectDir = Split-Path -Parent $PSScriptRoot
$DistScheduler = Join-Path $ProjectDir "dist\scheduler.js"

function Get-LatestSourceItem {
    $sourceItems = @()
    $srcDir = Join-Path $ProjectDir "src"

    if (Test-Path $srcDir) {
        $sourceItems += Get-ChildItem -Path $srcDir -Filter "*.ts" -File -Recurse -ErrorAction SilentlyContinue
    }

    foreach ($relativePath in @("package.json", "tsconfig.json")) {
        $fullPath = Join-Path $ProjectDir $relativePath
        if (Test-Path $fullPath) {
            $sourceItems += Get-Item $fullPath
        }
    }

    return $sourceItems | Sort-Object LastWriteTimeUtc -Descending | Select-Object -First 1
}

function Test-BuildRequired {
    if (-not (Test-Path $DistScheduler)) {
        return $true
    }

    $distWriteTime = (Get-Item $DistScheduler).LastWriteTimeUtc
    $latestSource = Get-LatestSourceItem

    return $latestSource -and $latestSource.LastWriteTimeUtc -gt $distWriteTime
}

function Ensure-Built {
    if (-not (Test-BuildRequired)) {
        return
    }

    if (Test-Path $DistScheduler) {
        Write-Host "Source files changed after the last build. Rebuilding..." -ForegroundColor Yellow
    } else {
        Write-Host "dist/scheduler.js not found. Building..." -ForegroundColor Yellow
    }

    Push-Location $ProjectDir
    try {
        npm run build
        if ($LASTEXITCODE -ne 0) {
            throw "Build failed with exit code $LASTEXITCODE."
        }
    } finally {
        Pop-Location
    }

    if (-not (Test-Path $DistScheduler)) {
        throw "Build completed but dist/scheduler.js was not generated."
    }
}

function Get-SchedulerNodeProcesses {
    $escapedSchedulerPath = [regex]::Escape($DistScheduler)

    Get-CimInstance Win32_Process -Filter "Name = 'node.exe'" -ErrorAction SilentlyContinue |
        Where-Object {
            $_.CommandLine -and
            $_.CommandLine -match $escapedSchedulerPath -and
            $_.CommandLine -match '\sstart(\s|$)'
        }
}

Set-Location $ProjectDir

# Preserve the existing scheduled runtime behavior.
$env:HEADLESS = "false"
$env:LOG_TO_FILE = "true"

$runningScheduler = Get-SchedulerNodeProcesses
if ($runningScheduler) {
    $processIds = ($runningScheduler | Select-Object -ExpandProperty ProcessId) -join ", "
    Write-Host "Scheduler is already running (PID: $processIds). Exiting launcher." -ForegroundColor Yellow
    exit 0
}

Ensure-Built

Write-Host "Starting Surrey Activity Booking Scheduler..." -ForegroundColor Cyan
& node $DistScheduler start
exit $LASTEXITCODE