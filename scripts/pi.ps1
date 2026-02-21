# Surrey Activity Booking - Raspberry Pi Management Commands
# Run from your Windows PC in PowerShell
#
# Usage:
#   .\scripts\pi.ps1 <command>
#
# Commands:
#   status    - Show service status
#   logs      - Show recent logs (last 50 lines)
#   logs-live - Follow logs in real-time (Ctrl+C to stop)
#   start     - Start the scheduler service
#   stop      - Stop the scheduler service
#   restart   - Restart the scheduler service
#   deploy    - Build + deploy to Pi + restart
#   test      - Run a test login (visible on VNC)
#   ssh       - Open SSH session to Pi
#   vnc       - Show VNC connection info
#   info      - Show Pi system info (CPU, RAM, disk, uptime)
#   schedules - Show configured booking schedules

param(
    [Parameter(Position = 0)]
    [string]$Command = "help",

    [string]$PiHost = "pi@192.168.137.116",
    [string]$PiDir = "/home/pi/SurreyActivity"
)

$ErrorActionPreference = "Stop"
$PiIP = $PiHost.Split("@")[1]

function Write-Header($text) {
    Write-Host ""
    Write-Host "════════════════════════════════════════" -ForegroundColor Cyan
    Write-Host "  $text" -ForegroundColor Cyan
    Write-Host "════════════════════════════════════════" -ForegroundColor Cyan
    Write-Host ""
}

function Write-Ok($text) {
    Write-Host "  ✅ $text" -ForegroundColor Green
}

function Write-Warn($text) {
    Write-Host "  ⚠️  $text" -ForegroundColor Yellow
}

switch ($Command.ToLower()) {

    # ── Service Status ──────────────────────────────────────
    "status" {
        Write-Header "Service Status"
        ssh $PiHost "sudo systemctl status surrey-booking --no-pager"
    }

    # ── Show Recent Logs ────────────────────────────────────
    "logs" {
        Write-Header "Recent Logs (last 50)"
        ssh $PiHost "sudo journalctl -u surrey-booking --no-pager -n 50"
    }

    # ── Follow Logs Live ────────────────────────────────────
    "logs-live" {
        Write-Header "Live Logs (Ctrl+C to stop)"
        ssh $PiHost "sudo journalctl -u surrey-booking -f"
    }

    # ── Start Service ───────────────────────────────────────
    "start" {
        Write-Header "Starting Scheduler"
        ssh $PiHost "sudo systemctl start surrey-booking"
        Start-Sleep -Seconds 2
        ssh $PiHost "sudo systemctl status surrey-booking --no-pager"
        Write-Ok "Scheduler started"
    }

    # ── Stop Service ────────────────────────────────────────
    "stop" {
        Write-Header "Stopping Scheduler"
        ssh $PiHost "sudo systemctl stop surrey-booking"
        Write-Ok "Scheduler stopped"
    }

    # ── Restart Service ─────────────────────────────────────
    "restart" {
        Write-Header "Restarting Scheduler"
        ssh $PiHost "sudo systemctl restart surrey-booking"
        Start-Sleep -Seconds 2
        ssh $PiHost "sudo systemctl status surrey-booking --no-pager"
        Write-Ok "Scheduler restarted"
    }

    # ── Deploy: Build + Copy + Restart ──────────────────────
    "deploy" {
        Write-Header "Deploying to Pi ($PiIP)"

        # Step 1: Build
        Write-Host "[1/4] Building TypeScript..." -ForegroundColor Yellow
        Push-Location (Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path))
        npm run build
        if ($LASTEXITCODE -ne 0) { Pop-Location; throw "Build failed" }
        Write-Ok "Built to dist/"

        # Step 2: Copy files
        Write-Host "[2/4] Copying files to Pi..." -ForegroundColor Yellow
        ssh $PiHost "mkdir -p $PiDir/dist $PiDir/scripts $PiDir/logs $PiDir/screenshots"

        $filesToCopy = @("dist", "scripts", "package.json", "package-lock.json", "bookings.config.json", "schedule.config.json")
        foreach ($item in $filesToCopy) {
            if (Test-Path $item) {
                Write-Host "    Copying $item..." -ForegroundColor Gray
                scp -r $item "${PiHost}:${PiDir}/"
            }
        }
        Write-Ok "Files copied"
        Pop-Location

        # Step 3: Install deps
        Write-Host "[3/4] Installing production deps..." -ForegroundColor Yellow
        ssh $PiHost "cd $PiDir; npm install --omit=dev"
        Write-Ok "Dependencies installed"

        # Step 4: Restart
        Write-Host "[4/4] Restarting service..." -ForegroundColor Yellow
        ssh $PiHost "sudo systemctl restart surrey-booking"
        Start-Sleep -Seconds 2
        ssh $PiHost "sudo systemctl status surrey-booking --no-pager"

        Write-Header "Deployment Complete!"
    }

    # ── Test Login (visible on VNC) ─────────────────────────
    "test" {
        Write-Header "Test Login (watch on VNC)"
        Write-Host "  Stopping scheduler first..." -ForegroundColor Yellow
        ssh $PiHost "sudo systemctl stop surrey-booking"
        Write-Host "  Running test login with visible browser..." -ForegroundColor Yellow
        ssh $PiHost "cd $PiDir; DISPLAY=:0 HEADLESS=false PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium-browser NAVIGATION_TIMEOUT=15000 ACTION_TIMEOUT=10000 /usr/local/bin/node dist/cli.js test-login"
        Write-Host ""
        Write-Host "  Restarting scheduler..." -ForegroundColor Yellow
        ssh $PiHost "sudo systemctl start surrey-booking"
        Write-Ok "Scheduler restarted"
    }

    # ── Open SSH Session ────────────────────────────────────
    "ssh" {
        Write-Header "SSH to Pi ($PiIP)"
        ssh $PiHost
    }

    # ── VNC Info ────────────────────────────────────────────
    "vnc" {
        Write-Header "VNC Connection"
        Write-Host "  Address:  $PiIP" -ForegroundColor White
        Write-Host "  Port:     5900 (default)" -ForegroundColor White
        Write-Host "  Viewer:   RealVNC Viewer" -ForegroundColor White
        Write-Host ""
        Write-Host "  Connect with: $PiIP:5900" -ForegroundColor Green
        Write-Host ""
        ssh $PiHost "sudo systemctl status vncserver-x11-serviced --no-pager 2>/dev/null | head -5"
    }

    # ── Pi System Info ──────────────────────────────────────
    "info" {
        Write-Header "Pi System Info"
        ssh $PiHost "echo '── Uptime ──'; uptime; echo ''; echo '── Memory ──'; free -h; echo ''; echo '── Disk ──'; df -h / | tail -1; echo ''; echo '── CPU Temp ──'; vcgencmd measure_temp 2>/dev/null || echo 'N/A'; echo ''; echo '── Node ──'; node --version; echo '── OS ──'; cat /etc/os-release | head -1"
    }

    # ── Show Booking Schedules ──────────────────────────────
    "schedules" {
        Write-Header "Booking Schedules"
        ssh $PiHost "cd $PiDir; /usr/local/bin/node dist/scheduler.js list 2>/dev/null || cat schedule.config.json"
    }

    # ── Help ────────────────────────────────────────────────
    default {
        Write-Host ""
        Write-Host "  Surrey Activity Booking - Pi Commands" -ForegroundColor Cyan
        Write-Host "  -------------------------------------" -ForegroundColor Cyan
        Write-Host ""
        Write-Host "  Usage:  .\scripts\pi.ps1 [command]" -ForegroundColor Yellow
        Write-Host ""
        Write-Host "  Service:" -ForegroundColor Cyan
        Write-Host "    status      Show scheduler service status"
        Write-Host "    start       Start the scheduler"
        Write-Host "    stop        Stop the scheduler"
        Write-Host "    restart     Restart the scheduler"
        Write-Host ""
        Write-Host "  Logs:" -ForegroundColor Cyan
        Write-Host "    logs        Show recent logs (last 50 lines)"
        Write-Host "    logs-live   Follow logs in real-time"
        Write-Host ""
        Write-Host "  Deploy:" -ForegroundColor Cyan
        Write-Host "    deploy      Build + copy + install + restart"
        Write-Host "    test        Run test login (visible on VNC)"
        Write-Host ""
        Write-Host "  Info:" -ForegroundColor Cyan
        Write-Host "    info        Pi system info (CPU/RAM/disk)"
        Write-Host "    schedules   Show booking schedules"
        Write-Host "    vnc         VNC connection info"
        Write-Host "    ssh         Open SSH session"
        Write-Host ""
    }
}
