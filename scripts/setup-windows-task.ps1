<#
.SYNOPSIS
    Manages the Surrey Activity Booking Scheduler in Windows Task Scheduler.

.DESCRIPTION
    Creates, removes, starts, stops, or checks the status of the scheduled task
    that keeps the booking automation running in the background.

    The task is configured to:
    - Start automatically when you log in
    - Restart if it crashes (every 1 minute, up to 3 times)
    - Run hidden (no visible window)
    - Run whether or not you are logged on (optional)

.PARAMETER Action
    install   - Create the Windows Scheduled Task
    uninstall - Remove the Scheduled Task
    start     - Start the task immediately
    stop      - Stop the running task
    status    - Show current task status
    logs      - Show recent log output
    build     - Rebuild the project (compile TypeScript)

.EXAMPLE
    .\setup-windows-task.ps1 install
    .\setup-windows-task.ps1 status
    .\setup-windows-task.ps1 start
    .\setup-windows-task.ps1 logs
#>

param(
    [Parameter(Position = 0)]
    [ValidateSet("install", "uninstall", "start", "stop", "status", "logs", "build")]
    [string]$Action = "status"
)

# ─── Config ──────────────────────────────────────────────────────────────
$TaskName        = "SurreyActivityBookingScheduler"
$TaskDescription = "Runs the Surrey Activity Booking Scheduler (node-cron) to automatically book badminton slots."
$ProjectDir      = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$LauncherScript  = Join-Path $ProjectDir "scripts\run-scheduler.ps1"
$LogDir          = Join-Path $ProjectDir "logs"
$DistScheduler   = Join-Path $ProjectDir "dist\scheduler.js"

# ─── Helpers ─────────────────────────────────────────────────────────────
function Write-Header {
    param([string]$Text)
    Write-Host ""
    Write-Host ("=" * 60) -ForegroundColor Cyan
    Write-Host "  $Text" -ForegroundColor White
    Write-Host ("=" * 60) -ForegroundColor Cyan
}

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
    if (Test-BuildRequired) {
        if (Test-Path $DistScheduler) {
            Write-Host "  Source files changed after the last build. Rebuilding..." -ForegroundColor Yellow
        } else {
            Write-Host "  dist/scheduler.js not found. Building..." -ForegroundColor Yellow
        }
        Push-Location $ProjectDir
        try {
            npm run build
            $exitCode = $LASTEXITCODE
        } finally {
            Pop-Location
        }
        if ($exitCode -ne 0 -or -not (Test-Path $DistScheduler)) {
            Write-Host "  [ERROR] Build failed!" -ForegroundColor Red
            return $false
        }
        Write-Host "  Build complete." -ForegroundColor Green
    }
    return $true
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

# ─── Actions ─────────────────────────────────────────────────────────────
switch ($Action) {

    "install" {
        Write-Header "Installing Windows Scheduled Task"

        # Build first
        if (-not (Ensure-Built)) { exit 1 }

        try {
            # Remove existing task if present
            $existing = Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
            if ($existing) {
                Write-Host "  Removing existing task..." -ForegroundColor Yellow
                Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false -ErrorAction Stop
            }

            # Create the task action - run the PowerShell launcher directly so the
            # scheduled task stays attached to the real scheduler process.
            $taskAction = New-ScheduledTaskAction `
                -Execute "powershell.exe" `
                -Argument "-NoProfile -NonInteractive -WindowStyle Hidden -ExecutionPolicy Bypass -File `"$LauncherScript`"" `
                -WorkingDirectory $ProjectDir

            # Triggers: At user logon AND at system startup (covers restart/power-on)
            $triggerLogon = New-ScheduledTaskTrigger -AtLogOn
            $triggerStartup = New-ScheduledTaskTrigger -AtStartup

            # Settings - ensure it works on battery (laptops) and survives sleep/hibernate
            $settings = New-ScheduledTaskSettingsSet `
                -AllowStartIfOnBatteries `
                -DontStopIfGoingOnBatteries `
                -StartWhenAvailable `
                -RestartCount 3 `
                -RestartInterval (New-TimeSpan -Minutes 1) `
                -ExecutionTimeLimit (New-TimeSpan -Days 365) `
                -MultipleInstances IgnoreNew

            # Hide the console window
            $principal = New-ScheduledTaskPrincipal -UserId $env:USERNAME -LogonType Interactive -RunLevel Limited

            # Register the task with BOTH triggers
            Register-ScheduledTask `
                -TaskName $TaskName `
                -Description $TaskDescription `
                -Action $taskAction `
                -Trigger @($triggerLogon, $triggerStartup) `
                -Settings $settings `
                -Principal $principal `
                -Force `
                -ErrorAction Stop | Out-Null
        } catch {
            Write-Host "  [ERROR] Unable to update the scheduled task: $($_.Exception.Message)" -ForegroundColor Red
            Write-Host "  Run this command from an elevated PowerShell session to update the task registration." -ForegroundColor Yellow
            exit 1
        }

        # Verify
        $task = Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
        if ($task) {
            Write-Host ""
            Write-Host "  Task '$TaskName' installed successfully!" -ForegroundColor Green
            Write-Host ""
            Write-Host "  The scheduler will:" -ForegroundColor White
            Write-Host "    - Start automatically on login AND on system startup/restart" -ForegroundColor Gray
            Write-Host "    - Keep Task Scheduler attached to the real scheduler process" -ForegroundColor Gray
            Write-Host "    - Keep running on battery power (laptop-safe)" -ForegroundColor Gray
            Write-Host "    - Auto-restart up to 3 times if it crashes" -ForegroundColor Gray
            Write-Host "    - Log output to: $LogDir" -ForegroundColor Gray
            Write-Host ""
            Write-Host "  To start it NOW (without re-logging):  .\setup-windows-task.ps1 start" -ForegroundColor Yellow
            Write-Host "  To check status:                       .\setup-windows-task.ps1 status" -ForegroundColor Yellow
            Write-Host "  To view logs:                          .\setup-windows-task.ps1 logs" -ForegroundColor Yellow
        } else {
            Write-Host "  [ERROR] Task creation failed!" -ForegroundColor Red
            exit 1
        }
    }

    "uninstall" {
        Write-Header "Removing Windows Scheduled Task"

        $existing = Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
        if ($existing) {
            # Stop if running
            if ($existing.State -eq "Running") {
                Stop-ScheduledTask -TaskName $TaskName
                Write-Host "  Stopped running task." -ForegroundColor Yellow
            }
            Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false
            Write-Host "  Task '$TaskName' removed." -ForegroundColor Green
        } else {
            Write-Host "  Task '$TaskName' not found - nothing to remove." -ForegroundColor Yellow
        }
    }

    "start" {
        Write-Header "Starting Scheduler"

        if (-not (Ensure-Built)) { exit 1 }

        $existing = Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
        if (-not $existing) {
            Write-Host "  Task not installed. Run '.\setup-windows-task.ps1 install' first." -ForegroundColor Red
            exit 1
        }

        $nodeProcs = Get-SchedulerNodeProcesses
        if ($nodeProcs) {
            Write-Host "  Scheduler node process is already running (PID: $($nodeProcs.ProcessId -join ', '))." -ForegroundColor Yellow
            if ($existing.State -ne "Running") {
                Write-Host "  Task state is '$($existing.State)' because it was launched by the older detached wrapper." -ForegroundColor DarkYellow
            }
        } elseif ($existing.State -eq "Running") {
            Write-Host "  Scheduler is already running." -ForegroundColor Yellow
        } else {
            Start-ScheduledTask -TaskName $TaskName
            Start-Sleep -Seconds 2
            $task = Get-ScheduledTask -TaskName $TaskName
            $nodeProcs = Get-SchedulerNodeProcesses
            if ($nodeProcs) {
                Write-Host "  Scheduler started. State: $($task.State). PID: $($nodeProcs.ProcessId -join ', ')" -ForegroundColor Green
            } else {
                Write-Host "  Scheduler start requested. State: $($task.State)" -ForegroundColor Yellow
            }
        }
    }

    "stop" {
        Write-Header "Stopping Scheduler"

        $existing = Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
        if (-not $existing) {
            Write-Host "  Task not found." -ForegroundColor Yellow
            exit 0
        }

        $taskWasRunning = $existing.State -eq "Running"
        $nodeProcs = Get-SchedulerNodeProcesses

        if ($taskWasRunning) {
            Stop-ScheduledTask -TaskName $TaskName
            Start-Sleep -Seconds 2
        }

        if ($nodeProcs) {
            $nodeProcs | ForEach-Object {
                Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue
            }
            Write-Host "  Scheduler stopped. Terminated PID: $($nodeProcs.ProcessId -join ', ')" -ForegroundColor Green
        } elseif ($taskWasRunning) {
            Write-Host "  Scheduler task stopped." -ForegroundColor Green
        } else {
            Write-Host "  Scheduler is not running (state: $($existing.State))." -ForegroundColor Yellow
        }
    }

    "status" {
        Write-Header "Scheduler Status"

        $existing = Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
        if (-not $existing) {
            Write-Host "  Task '$TaskName' is NOT installed." -ForegroundColor Red
            Write-Host "  Run '.\setup-windows-task.ps1 install' to set it up." -ForegroundColor Yellow
            exit 0
        }

        $taskInfo = Get-ScheduledTaskInfo -TaskName $TaskName -ErrorAction SilentlyContinue

        Write-Host "  Task Name:       $TaskName" -ForegroundColor White
        Write-Host "  State:           $($existing.State)" -ForegroundColor $(if ($existing.State -eq "Running") { "Green" } else { "Yellow" })
        if ($taskInfo) {
            Write-Host "  Last Run:        $($taskInfo.LastRunTime)" -ForegroundColor Gray
            Write-Host "  Last Result:     $($taskInfo.LastTaskResult)" -ForegroundColor Gray
            Write-Host "  Next Run:        $($taskInfo.NextRunTime)" -ForegroundColor Gray
        }
        Write-Host "  Project Dir:     $ProjectDir" -ForegroundColor Gray
        Write-Host "  Launcher:        $LauncherScript" -ForegroundColor Gray
        Write-Host "  Log Dir:         $LogDir" -ForegroundColor Gray

        $nodeProcs = Get-SchedulerNodeProcesses
        if ($nodeProcs) {
            Write-Host "  Node Process:    Running (PID: $($nodeProcs.ProcessId -join ', '))" -ForegroundColor Green
            if ($nodeProcs.Count -gt 1) {
                Write-Host "  Warning:         Multiple scheduler processes are running." -ForegroundColor Yellow
            }
            if ($existing.State -ne "Running") {
                Write-Host "  Note:            Task state is '$($existing.State)' because an older detached scheduler process is still active." -ForegroundColor DarkYellow
            }
        } elseif ($existing.State -eq "Running") {
            Write-Host "  Node Process:    Not detected yet (task wrapper is active)." -ForegroundColor Yellow
        }

        # Show latest log
        if (Test-Path $LogDir) {
            $latestLog = Get-ChildItem -Path $LogDir -Filter "*.log" -ErrorAction SilentlyContinue |
                Sort-Object LastWriteTime -Descending | Select-Object -First 1
            if ($latestLog) {
                $sizeStr = '{0:N0}' -f $latestLog.Length
                Write-Host "  Latest Log:      $($latestLog.Name) - $sizeStr bytes" -ForegroundColor Gray
            }
        }
    }

    "logs" {
        Write-Header "Recent Scheduler Logs"

        if (-not (Test-Path $LogDir)) {
            Write-Host "  No log directory found at: $LogDir" -ForegroundColor Yellow
            exit 0
        }

        # Find the latest .log file
        $latestLog = Get-ChildItem -Path $LogDir -Filter "*.log" -ErrorAction SilentlyContinue |
            Sort-Object LastWriteTime -Descending | Select-Object -First 1

        if ($latestLog) {
            # Set console to UTF-8 so emojis and Unicode render correctly
            [Console]::OutputEncoding = [System.Text.Encoding]::UTF8
            $oldCodePage = [Console]::OutputEncoding
            chcp 65001 | Out-Null

            Write-Host "  File: $($latestLog.FullName)" -ForegroundColor Gray
            Write-Host "  Modified: $($latestLog.LastWriteTime)" -ForegroundColor Gray
            Write-Host ("-" * 60) -ForegroundColor DarkGray
            Get-Content $latestLog.FullName -Tail 50 -Encoding UTF8
        } else {
            Write-Host "  No .log files found in $LogDir" -ForegroundColor Yellow
        }
    }

    "build" {
        Write-Header "Building Project"
        Push-Location $ProjectDir
        npm run build
        Pop-Location
        if (Test-Path (Join-Path $ProjectDir "dist\scheduler.js")) {
            Write-Host "  Build successful!" -ForegroundColor Green
        } else {
            Write-Host "  Build failed!" -ForegroundColor Red
            exit 1
        }
    }
}

Write-Host ""
