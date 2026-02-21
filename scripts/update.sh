#!/bin/bash
# Surrey Activity Booking - Update Script for Raspberry Pi
# Pulls latest code (with pre-compiled dist/), installs production deps, restarts service

set -e

APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$APP_DIR"

echo "Pulling latest code..."
git pull origin main

# Verify compiled JS exists after pull
if [ ! -f dist/scheduler.js ]; then
  echo ""
  echo "  ERROR: dist/scheduler.js not found after pull!"
  echo "  Make sure you built and committed from your PC:"
  echo "    npm run build"
  echo "    git add dist/ && git commit -m 'build' && git push"
  exit 1
fi

echo "Installing production dependencies..."
npm install --omit=dev

echo "Restarting service..."
sudo systemctl restart surrey-booking

echo ""
echo "Update complete!"
sudo systemctl status surrey-booking --no-pager
