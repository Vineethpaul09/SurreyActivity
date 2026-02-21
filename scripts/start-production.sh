#!/bin/bash
# Surrey Activity Booking Scheduler - Raspberry Pi Production Startup
# Usage: ./scripts/start-production.sh

set -e

# Resolve script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP_DIR="$(dirname "$SCRIPT_DIR")"

cd "$APP_DIR"

# Use system Chromium on ARM (Raspberry Pi)
export PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH="${PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH:-/usr/bin/chromium-browser}"

# Set timezone to Pacific
export TZ=America/Vancouver

# Set Node.js memory limit
# Pi 3 (1GB RAM): use 256m | Pi 4 (2GB): use 512m | Pi 4 (4GB+): use 1024m
export NODE_OPTIONS="${NODE_OPTIONS:---max-old-space-size=256}"

# Force headless mode
export HEADLESS=true

# Enable low-memory Chromium optimizations (essential for Pi 3 with 1GB RAM)
export LOW_MEMORY_MODE="${LOW_MEMORY_MODE:-true}"

echo "=== Surrey Activity Booking Scheduler ==="
echo "Working directory: $APP_DIR"
echo "Chromium path: $PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH"
echo "Timezone: $TZ"
echo "Node options: $NODE_OPTIONS"
echo "=========================================="

# Start the scheduler (pre-compiled JS — no ts-node needed)
exec node dist/scheduler.js start
