#!/bin/bash
# Surrey Activity Booking - Pi Management Commands
# Run this directly on the Raspberry Pi
#
# Usage:
#   sudo ./scripts/pi-cmd.sh <command>
#
# Commands:
#   status    - Show service status
#   logs      - Show recent logs (last 50 lines)
#   logs-live - Follow logs in real-time (Ctrl+C to stop)
#   start     - Start the scheduler service
#   stop      - Stop the scheduler service
#   restart   - Restart the scheduler service
#   test      - Run a test login (visible on VNC)
#   info      - Show Pi system info (CPU, RAM, disk, uptime)
#   schedules - Show configured booking schedules
#   env       - Show current .env config (hides password)
#   env-edit  - Edit .env file with nano

APP_DIR="/home/pi/SurreyActivity"
SERVICE="surrey-booking"
NODE="/usr/local/bin/node"

header() {
    echo ""
    echo "════════════════════════════════════════"
    echo "  $1"
    echo "════════════════════════════════════════"
    echo ""
}

case "${1:-help}" in

    # ── Service Status ──────────────────────────────────────
    status)
        header "Service Status"
        systemctl status $SERVICE --no-pager
        ;;

    # ── Show Recent Logs ────────────────────────────────────
    logs)
        header "Recent Logs (last 50)"
        journalctl -u $SERVICE --no-pager -n 50
        ;;

    # ── Follow Logs Live ────────────────────────────────────
    logs-live)
        header "Live Logs (Ctrl+C to stop)"
        journalctl -u $SERVICE -f
        ;;

    # ── Start Service ───────────────────────────────────────
    start)
        header "Starting Scheduler"
        systemctl start $SERVICE
        sleep 2
        systemctl status $SERVICE --no-pager
        echo ""
        echo "  ✅ Scheduler started"
        ;;

    # ── Stop Service ────────────────────────────────────────
    stop)
        header "Stopping Scheduler"
        systemctl stop $SERVICE
        echo "  ✅ Scheduler stopped"
        ;;

    # ── Restart Service ─────────────────────────────────────
    restart)
        header "Restarting Scheduler"
        systemctl restart $SERVICE
        sleep 2
        systemctl status $SERVICE --no-pager
        echo ""
        echo "  ✅ Scheduler restarted"
        ;;

    # ── Test Login (visible on VNC) ─────────────────────────
    test)
        header "Test Login (watch on VNC)"
        echo "  Stopping scheduler first..."
        systemctl stop $SERVICE
        echo "  Running test login with visible browser..."
        cd "$APP_DIR"
        DISPLAY=:0 HEADLESS=false \
          PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium-browser \
          NAVIGATION_TIMEOUT=15000 ACTION_TIMEOUT=10000 \
          $NODE dist/cli.js test-login
        echo ""
        echo "  Restarting scheduler..."
        systemctl start $SERVICE
        echo "  ✅ Scheduler restarted"
        ;;

    # ── Pi System Info ──────────────────────────────────────
    info)
        header "Pi System Info"
        echo "── Uptime ──"
        uptime
        echo ""
        echo "── Memory ──"
        free -h
        echo ""
        echo "── Disk ──"
        df -h /
        echo ""
        echo "── CPU Temp ──"
        vcgencmd measure_temp 2>/dev/null || echo "N/A"
        echo ""
        echo "── Node ──"
        $NODE --version
        echo ""
        echo "── OS ──"
        cat /etc/os-release | head -2
        echo ""
        echo "── Service ──"
        systemctl is-active $SERVICE
        ;;

    # ── Show Booking Schedules ──────────────────────────────
    schedules)
        header "Booking Schedules"
        cd "$APP_DIR"
        $NODE dist/scheduler.js list 2>/dev/null || cat schedule.config.json
        ;;

    # ── Show .env config ────────────────────────────────────
    env)
        header "Environment Config"
        if [ -f "$APP_DIR/.env" ]; then
            sed 's/\(PASSWORD=\).*/\1******/' "$APP_DIR/.env"
        else
            echo "  ⚠️  No .env file found at $APP_DIR/.env"
        fi
        ;;

    # ── Edit .env file ──────────────────────────────────────
    env-edit)
        nano "$APP_DIR/.env"
        ;;

    # ── Help ────────────────────────────────────────────────
    *)
        echo ""
        echo "  Surrey Activity Booking - Pi Commands"
        echo "  -------------------------------------"
        echo ""
        echo "  Usage:  sudo ./scripts/pi-cmd.sh [command]"
        echo ""
        echo "  Service:"
        echo "    status      Show scheduler service status"
        echo "    start       Start the scheduler"
        echo "    stop        Stop the scheduler"
        echo "    restart     Restart the scheduler"
        echo ""
        echo "  Logs:"
        echo "    logs        Show recent logs (last 50 lines)"
        echo "    logs-live   Follow logs in real-time"
        echo ""
        echo "  Test:"
        echo "    test        Run test login (visible on VNC)"
        echo ""
        echo "  Info:"
        echo "    info        Pi system info (CPU/RAM/disk)"
        echo "    schedules   Show booking schedules"
        echo "    env         Show .env config (hides password)"
        echo "    env-edit    Edit .env file"
        echo ""
        ;;
esac
