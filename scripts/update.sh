#!/bin/bash
# Surrey Activity Booking - Update Script
# Pulls latest code, installs dependencies, restarts service

set -e

APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$APP_DIR"

echo "📥 Pulling latest code..."
git pull origin main

echo "📦 Installing dependencies..."
npm install

echo "🔄 Restarting service..."
sudo systemctl restart surrey-booking

echo ""
echo "✅ Update complete!"
sudo systemctl status surrey-booking --no-pager
