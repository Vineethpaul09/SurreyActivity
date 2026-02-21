#!/bin/bash
# Surrey Activity Booking - Raspberry Pi One-Click Setup
# Run this script on your Raspberry Pi after cloning the repo:
#   chmod +x scripts/setup-pi.sh && ./scripts/setup-pi.sh

set -e

echo ""
echo "============================================"
echo " Surrey Activity Booking - Pi Setup"
echo "============================================"
echo ""

APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$APP_DIR"

# --- Step 1: Set timezone ---
echo "[1/7] Setting timezone to America/Vancouver..."
sudo timedatectl set-timezone America/Vancouver

# --- Step 2: Install system packages ---
echo "[2/7] Installing system dependencies..."
sudo apt update
sudo apt install -y \
  git curl build-essential \
  chromium-browser \
  libnss3 libnspr4 libatk1.0-0 libatk-bridge2.0-0 \
  libcups2 libdrm2 libdbus-1-3 libxkbcommon0 \
  libatspi2.0-0 libxcomposite1 libxdamage1 libxfixes3 \
  libxrandr2 libgbm1 libpango-1.0-0 libcairo2 \
  libasound2 libwayland-client0 \
  fonts-liberation fonts-noto-color-emoji \
  xvfb

# --- Step 3: Install Node.js 20 (if not already installed) ---
if ! command -v node &> /dev/null || [[ "$(node --version)" != v20* ]]; then
  echo "[3/7] Installing Node.js 20..."
  curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
  sudo apt install -y nodejs
else
  echo "[3/7] Node.js $(node --version) already installed. Skipping."
fi

# --- Step 4: Install npm dependencies ---
echo "[4/7] Installing npm dependencies..."
npm install

# --- Step 5: Install Playwright browsers ---
echo "[5/7] Installing Playwright browsers..."
npx playwright install chromium || echo "  ⚠ Playwright Chromium install failed (will use system Chromium)"

# --- Step 6: Create .env file if not exists ---
if [ ! -f .env ]; then
  echo "[6/7] Creating .env from .env.example..."
  cp .env.example .env
  echo ""
  echo "  ⚠ IMPORTANT: Edit .env with your credentials:"
  echo "    nano $APP_DIR/.env"
  echo ""
else
  echo "[6/7] .env file already exists. Skipping."
fi

# --- Step 7: Install systemd service ---
echo "[7/7] Installing systemd service..."
sudo cp scripts/surrey-booking.service /etc/systemd/system/surrey-booking.service

# Update WorkingDirectory in service file to match actual path
sudo sed -i "s|WorkingDirectory=.*|WorkingDirectory=$APP_DIR|g" /etc/systemd/system/surrey-booking.service
sudo sed -i "s|User=.*|User=$USER|g" /etc/systemd/system/surrey-booking.service
sudo sed -i "s|Group=.*|Group=$USER|g" /etc/systemd/system/surrey-booking.service
sudo sed -i "s|ReadWritePaths=.*|ReadWritePaths=$APP_DIR/logs $APP_DIR/screenshots /tmp|g" /etc/systemd/system/surrey-booking.service

sudo systemctl daemon-reload
sudo systemctl enable surrey-booking.service

# --- Step 8: Create swap if needed ---
TOTAL_MEM=$(free -m | awk '/^Mem:/{print $2}')
if [ "$TOTAL_MEM" -lt 3000 ]; then
  echo ""
  echo "  ℹ Your Pi has ${TOTAL_MEM}MB RAM. Adding 2GB swap..."
  sudo dphys-swapfile swapoff 2>/dev/null || true
  sudo sed -i 's/CONF_SWAPSIZE=.*/CONF_SWAPSIZE=2048/' /etc/dphys-swapfile
  sudo dphys-swapfile setup
  sudo dphys-swapfile swapon
fi

# --- Setup logrotate ---
echo "Setting up log rotation..."
sudo tee /etc/logrotate.d/surrey-booking > /dev/null <<EOF
$APP_DIR/logs/*.log {
    daily
    rotate 14
    compress
    delaycompress
    missingok
    notifempty
    create 0644 $USER $USER
    dateext
    dateformat -%Y%m%d
    maxsize 50M
}
EOF

# --- Done ---
echo ""
echo "============================================"
echo " ✅ Setup Complete!"
echo "============================================"
echo ""
echo " Next steps:"
echo ""
echo "   1. Edit your credentials:"
echo "      nano $APP_DIR/.env"
echo ""
echo "   2. Test the scheduler:"
echo "      cd $APP_DIR"
echo "      export PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium-browser"
echo "      npx ts-node src/scheduler.ts list"
echo ""
echo "   3. Start the service:"
echo "      sudo systemctl start surrey-booking"
echo ""
echo "   4. Check logs:"
echo "      sudo journalctl -u surrey-booking -f"
echo ""
echo "============================================"
