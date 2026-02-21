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

# Set Node.js memory limit (adjust based on Pi RAM: 512 for 2GB, 1024 for 4GB)
export NODE_OPTIONS="${NODE_OPTIONS:---max-old-space-size=512}"

# Force headless mode
export HEADLESS=true

echo "=== Surrey Activity Booking Scheduler ==="
echo "Working directory: $APP_DIR"
echo "Chromium path: $PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH"
echo "Timezone: $TZ"
echo "Node options: $NODE_OPTIONS"
echo "=========================================="

# Start the scheduler
exec npx ts-node src/scheduler.ts start
