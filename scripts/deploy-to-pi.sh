#!/bin/bash
# Deploy Surrey Activity Booking to Raspberry Pi
# Run this from your Windows PC (Git Bash / WSL) or Mac/Linux
#
# Usage:
#   ./scripts/deploy-to-pi.sh [PI_HOST]
#
# Example:
#   ./scripts/deploy-to-pi.sh pi@192.168.1.50
#   ./scripts/deploy-to-pi.sh pi@surrey-booking.local

set -e

PI_HOST="${1:-pi@192.168.137.116}"
PI_DIR="/home/pi/SurreyActivity"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP_DIR="$(dirname "$SCRIPT_DIR")"
cd "$APP_DIR"

echo "============================================"
echo " Deploying to Raspberry Pi: $PI_HOST"
echo "============================================"
echo ""

# --- Step 1: Build TypeScript ---
echo "[1/4] Building TypeScript..."
npm run build
echo "  Built to dist/"

# --- Step 2: Sync files to Pi ---
echo "[2/4] Syncing files to Pi..."
rsync -avz --delete \
  --exclude 'node_modules' \
  --exclude '.git' \
  --exclude 'src' \
  --exclude '.env' \
  --exclude 'screenshots/*.png' \
  --exclude 'logs/*.log' \
  "$APP_DIR/" "$PI_HOST:$PI_DIR/"

echo "  Files synced"

# --- Step 3: Install production deps on Pi ---
echo "[3/4] Installing production deps on Pi..."
ssh "$PI_HOST" "cd $PI_DIR && npm install --omit=dev"

# --- Step 4: Restart service ---
echo "[4/4] Restarting service on Pi..."
ssh "$PI_HOST" "sudo systemctl restart surrey-booking && sudo systemctl status surrey-booking --no-pager"

echo ""
echo "============================================"
echo " Deployment complete!"
echo "============================================"
echo ""
echo " View live logs:  ssh $PI_HOST 'sudo journalctl -u surrey-booking -f'"
echo ""
