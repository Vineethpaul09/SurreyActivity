# Raspberry Pi Production Setup Guide

Complete guide to run the **Surrey Activity Booking Scheduler** on a Raspberry Pi 24/7 in production mode.

---

## Prerequisites

- Raspberry Pi 4 (2GB+ RAM recommended) or Raspberry Pi 5
- MicroSD card (16GB+, Class 10 or better)
- Raspberry Pi OS (64-bit recommended) — Bookworm or Bullseye
- Internet connection (Ethernet preferred for reliability)
- SSH access enabled

---

## Step 1: Flash Raspberry Pi OS

1. Download [Raspberry Pi Imager](https://www.raspberrypi.com/software/)
2. Flash **Raspberry Pi OS (64-bit) Lite** (no desktop needed for a headless server)
3. In Imager settings (gear icon), configure:
   - **Enable SSH** (password or key-based)
   - **Set username/password** (e.g., `pi` / `your-password`)
   - **Set Wi-Fi** (if not using Ethernet)
   - **Set hostname** (e.g., `surrey-booking`)
   - **Set timezone** to `America/Vancouver`
4. Insert SD card and boot the Pi

---

## Step 2: Initial Pi Setup (SSH In)

```bash
# SSH into your Pi (replace with your Pi's IP or hostname)
ssh pi@surrey-booking.local
# or
ssh pi@192.168.x.x
```

### Update the system

```bash
sudo apt update && sudo apt upgrade -y
```

### Set timezone to Pacific Time

```bash
sudo timedatectl set-timezone America/Vancouver
timedatectl  # Verify
```

### Install required system packages

```bash
sudo apt install -y git curl build-essential
```

---

## Step 3: Install Node.js (v20 LTS)

```bash
# Install Node.js via NodeSource (ARM64 supported)
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs

# Verify installation
node --version   # Should show v20.x.x
npm --version    # Should show 10.x.x
```

### Alternative: Using nvm (if you want multiple Node versions)

```bash
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash
source ~/.bashrc
nvm install 20
nvm use 20
nvm alias default 20
```

---

## Step 4: Install Playwright Dependencies

Playwright needs Chromium and system libraries. On Raspberry Pi (ARM), this requires special setup:

```bash
# Install Playwright's system dependencies
sudo apt install -y \
  libnss3 \
  libnspr4 \
  libatk1.0-0 \
  libatk-bridge2.0-0 \
  libcups2 \
  libdrm2 \
  libdbus-1-3 \
  libxkbcommon0 \
  libatspi2.0-0 \
  libxcomposite1 \
  libxdamage1 \
  libxfixes3 \
  libxrandr2 \
  libgbm1 \
  libpango-1.0-0 \
  libcairo2 \
  libasound2 \
  libwayland-client0 \
  fonts-liberation \
  fonts-noto-color-emoji \
  xvfb
```

> **Note:** On ARM-based Raspberry Pi, Playwright's bundled Chromium may not work. We'll use the system Chromium instead.

### Install system Chromium (ARM-compatible)

```bash
sudo apt install -y chromium-browser
# Verify
which chromium-browser   # Should show /usr/bin/chromium-browser
chromium-browser --version
```

---

## Step 5: Clone and Setup the Project

```bash
# Clone the repository (replace with your actual repo URL)
cd /home/pi
git clone https://github.com/YOUR_USERNAME/SurreyActivity.git
cd SurreyActivity

# Install Node.js dependencies
npm install

# Install Playwright (will download browser binaries)
npx playwright install chromium
```

### If Playwright's Chromium doesn't work on ARM, use system Chromium:

```bash
# Set environment variable to use system Chromium
export PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium-browser
```

---

## Step 6: Configure Environment Variables

```bash
# Create .env file from the example
cp .env.example .env
nano .env
```

### Set your `.env` file:

```env
# Login Credentials
SURREY_EMAIL=your-actual-email@example.com
SURREY_PASSWORD=your-actual-password

# Browser Settings — MUST be headless on Pi (no display)
HEADLESS=true
SLOW_MO=100

# Timeouts (in milliseconds)
NAVIGATION_TIMEOUT=30000
ACTION_TIMEOUT=10000

# Logging
LOG_LEVEL=info
LOG_TO_FILE=true
LOG_DIR=./logs
```

Save and exit (`Ctrl+X`, `Y`, `Enter` in nano).

---

## Step 7: Configure Playwright to Use System Chromium

Since Raspberry Pi uses ARM architecture, you need to point Playwright to the system-installed Chromium. Create a launch script:

```bash
nano /home/pi/SurreyActivity/start.sh
```

```bash
#!/bin/bash
# Surrey Activity Booking Scheduler - Production Startup

# Set working directory
cd /home/pi/SurreyActivity

# Use system Chromium on ARM (Raspberry Pi)
export PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium-browser

# Set timezone
export TZ=America/Vancouver

# Set Node.js memory limit (adjust based on your Pi's RAM)
# Pi 4 (2GB): use 512m | Pi 4 (4GB): use 1024m | Pi 4 (8GB): use 2048m
export NODE_OPTIONS="--max-old-space-size=512"

# Start the scheduler
exec npx ts-node src/scheduler.ts start
```

```bash
chmod +x /home/pi/SurreyActivity/start.sh
```

---

## Step 8: Update Booking Source Code for System Chromium

The `booking.ts` file needs to use the system Chromium when the environment variable is set. Update the browser launch:

```bash
nano /home/pi/SurreyActivity/src/booking.ts
```

Find the `chromium.launch` section and update it:

```typescript
this.browser = await chromium.launch({
  headless: this.envConfig.headless,
  slowMo: this.envConfig.slowMo,
  executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || undefined,
});
```

---

## Step 9: Test the Setup

```bash
cd /home/pi/SurreyActivity

# Set the Chromium path
export PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium-browser

# Test 1: List all schedules
npx ts-node src/scheduler.ts list

# Test 2: Test login
npm run start test-login

# Test 3: Start the scheduler briefly (Ctrl+C to stop)
npx ts-node src/scheduler.ts start
```

If all tests pass, proceed to set up the service.

---

## Step 10: Create a systemd Service (Auto-Start on Boot)

This ensures the scheduler runs automatically on boot, restarts on crash, and survives reboots.

```bash
sudo nano /etc/systemd/system/surrey-booking.service
```

Paste the following:

```ini
[Unit]
Description=Surrey Activity Booking Scheduler
Documentation=https://github.com/YOUR_USERNAME/SurreyActivity
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=pi
Group=pi
WorkingDirectory=/home/pi/SurreyActivity

# Environment variables
Environment=NODE_ENV=production
Environment=TZ=America/Vancouver
Environment=PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium-browser
Environment=NODE_OPTIONS=--max-old-space-size=512
Environment=DISPLAY=

# Use the startup script
ExecStart=/usr/bin/npx ts-node src/scheduler.ts start

# Restart policy
Restart=always
RestartSec=30
StartLimitInterval=600
StartLimitBurst=10

# Logging (stdout/stderr go to journalctl)
StandardOutput=journal
StandardError=journal
SyslogIdentifier=surrey-booking

# Security hardening
NoNewPrivileges=true
ProtectSystem=strict
ReadWritePaths=/home/pi/SurreyActivity/logs /home/pi/SurreyActivity/screenshots /tmp

[Install]
WantedBy=multi-user.target
```

### Enable and start the service:

```bash
# Reload systemd to pick up the new service
sudo systemctl daemon-reload

# Enable the service to start on boot
sudo systemctl enable surrey-booking.service

# Start the service now
sudo systemctl start surrey-booking.service

# Check status
sudo systemctl status surrey-booking.service
```

---

## Step 11: Monitoring & Logs

### View live logs

```bash
# Follow real-time logs
sudo journalctl -u surrey-booking -f

# View last 100 lines
sudo journalctl -u surrey-booking -n 100

# View logs for today
sudo journalctl -u surrey-booking --since today

# View logs for specific date
sudo journalctl -u surrey-booking --since "2026-02-20" --until "2026-02-21"
```

### Application logs (file-based)

```bash
# Application writes its own logs to the logs/ directory
ls -la /home/pi/SurreyActivity/logs/
tail -f /home/pi/SurreyActivity/logs/*.log
```

### Service management commands

```bash
# Stop the scheduler
sudo systemctl stop surrey-booking

# Restart the scheduler
sudo systemctl restart surrey-booking

# Disable auto-start on boot
sudo systemctl disable surrey-booking

# Check if running
sudo systemctl is-active surrey-booking
```

---

## Step 12: Log Rotation (Prevent Disk Full)

Create a logrotate config to prevent logs from filling up the SD card:

```bash
sudo nano /etc/logrotate.d/surrey-booking
```

```
/home/pi/SurreyActivity/logs/*.log {
    daily
    rotate 14
    compress
    delaycompress
    missingok
    notifempty
    create 0644 pi pi
    dateext
    dateformat -%Y%m%d
    maxsize 50M
}
```

---

## Step 13: Automatic Updates (Optional)

Create a script to pull the latest code and restart:

```bash
nano /home/pi/SurreyActivity/update.sh
```

```bash
#!/bin/bash
# Update Surrey Activity Booking from Git

cd /home/pi/SurreyActivity

echo "📥 Pulling latest code..."
git pull origin main

echo "📦 Installing dependencies..."
npm install

echo "🔄 Restarting service..."
sudo systemctl restart surrey-booking

echo "✅ Update complete!"
sudo systemctl status surrey-booking --no-pager
```

```bash
chmod +x /home/pi/SurreyActivity/update.sh
```

Run updates with: `~/SurreyActivity/update.sh`

---

## Step 14: Health Check & Watchdog (Optional)

Create a cron-based health check that restarts the service if it dies:

```bash
crontab -e
```

Add this line (checks every 5 minutes):

```cron
*/5 * * * * systemctl is-active --quiet surrey-booking || sudo systemctl restart surrey-booking
```

### Screenshot cleanup (remove screenshots older than 7 days):

```cron
0 3 * * * find /home/pi/SurreyActivity/screenshots -name "*.png" -mtime +7 -delete
```

---

## Step 15: Network Reliability

### Static IP (recommended for headless server)

```bash
sudo nmcli con mod "Wired connection 1" ipv4.addresses 192.168.1.100/24
sudo nmcli con mod "Wired connection 1" ipv4.gateway 192.168.1.1
sudo nmcli con mod "Wired connection 1" ipv4.dns "8.8.8.8 8.8.4.4"
sudo nmcli con mod "Wired connection 1" ipv4.method manual
sudo nmcli con up "Wired connection 1"
```

### Or edit dhcpcd config (older Raspberry Pi OS):

```bash
sudo nano /etc/dhcpcd.conf
```

Add:

```
interface eth0
static ip_address=192.168.1.100/24
static routers=192.168.1.1
static domain_name_servers=8.8.8.8 8.8.4.4
```

---

## Quick Reference

| Action          | Command                                                        |
| --------------- | -------------------------------------------------------------- |
| Start service   | `sudo systemctl start surrey-booking`                          |
| Stop service    | `sudo systemctl stop surrey-booking`                           |
| Restart service | `sudo systemctl restart surrey-booking`                        |
| View status     | `sudo systemctl status surrey-booking`                         |
| Live logs       | `sudo journalctl -u surrey-booking -f`                         |
| App logs        | `tail -f ~/SurreyActivity/logs/*.log`                          |
| List schedules  | `cd ~/SurreyActivity && npx ts-node src/scheduler.ts list`     |
| Run one now     | `cd ~/SurreyActivity && npx ts-node src/scheduler.ts run <id>` |
| Update code     | `~/SurreyActivity/update.sh`                                   |
| Check Pi temp   | `vcgencmd measure_temp`                                        |
| Check memory    | `free -h`                                                      |
| Check disk      | `df -h`                                                        |

---

## Troubleshooting

### Chromium crashes or won't start

```bash
# Check if system Chromium works
DISPLAY= chromium-browser --headless --no-sandbox --disable-gpu --dump-dom https://google.com

# If it fails, try installing chromium differently
sudo apt install -y chromium-browser chromium-codecs-ffmpeg
```

### Out of memory (OOM)

```bash
# Check memory usage
free -h

# Add swap space (2GB)
sudo dphys-swapfile swapoff
sudo sed -i 's/CONF_SWAPSIZE=.*/CONF_SWAPSIZE=2048/' /etc/dphys-swapfile
sudo dphys-swapfile setup
sudo dphys-swapfile swapon
```

### Service won't start

```bash
# Check for errors
sudo journalctl -u surrey-booking -n 50 --no-pager

# Test manually first
cd /home/pi/SurreyActivity
export PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium-browser
npx ts-node src/scheduler.ts start
```

### Playwright can't find Chromium

```bash
# Verify the path
which chromium-browser
ls -la /usr/bin/chromium-browser

# Try alternative paths
export PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium
# or
export PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=$(which chromium-browser)
```

### SD card wear protection

```bash
# Mount /tmp as tmpfs to reduce SD writes
echo "tmpfs /tmp tmpfs defaults,noatime,nosuid,nodev,size=256M 0 0" | sudo tee -a /etc/fstab

# Disable swap if you have enough RAM (4GB+)
sudo dphys-swapfile swapoff
sudo systemctl disable dphys-swapfile
```

---

## Architecture Overview

```
Raspberry Pi (always-on)
├── systemd service (surrey-booking)
│   └── Node.js (ts-node)
│       └── scheduler.ts
│           ├── Cron jobs (node-cron, PST timezone)
│           │   ├── Sunday 6:13 PM → Book Wed @ Fraser Heights
│           │   ├── Wednesday 9:58 AM → Book Sat @ Fraser Heights
│           │   ├── Thursday 9:58 AM → Book Sun @ Fraser Heights
│           │   ├── Friday 6:28 PM → Book Mon @ Cloverdale
│           │   ├── ... (all scheduled jobs)
│           │   └── Status updates every 30 seconds
│           └── Playwright (headless Chromium)
│               └── Automated booking on surrey.perfectmind.com
├── logs/ (auto-rotated)
├── screenshots/ (auto-cleaned)
└── .env (credentials)
```

---

## Estimated Resource Usage

| Resource                           | Usage                         |
| ---------------------------------- | ----------------------------- |
| CPU (idle)                         | ~1-3%                         |
| CPU (during booking)               | ~30-50%                       |
| RAM (idle scheduler)               | ~80-120 MB                    |
| RAM (during booking with Chromium) | ~300-500 MB                   |
| Disk space (app)                   | ~300 MB                       |
| Network                            | Minimal (only during booking) |

A **Raspberry Pi 4 (2GB)** is sufficient. 4GB is comfortable.
