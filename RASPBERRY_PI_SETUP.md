# Raspberry Pi 3 Production Setup Guide

Complete guide to run the **Surrey Activity Booking Scheduler** on a Raspberry Pi 3 (1GB RAM, 25GB SD card) in production mode.

## Key Approach: Build on PC, Run on Pi

Since Pi 3 has only **1GB RAM**, we **don't** install TypeScript/ts-node on the Pi. Instead:

1. **Build** (compile TypeScript to JavaScript) on your **Windows PC**
2. **Deploy** only the compiled `dist/` folder + production dependencies to the Pi
3. **Run** with plain `node` (saves ~200MB RAM vs `ts-node`)

```
Windows PC (Build)              Raspberry Pi 3 (Run)
┌─────────────────┐   deploy    ┌──────────────────────┐
│ TypeScript src/  │ ────────►  │ Compiled dist/       │
│ npm run build    │   scp/     │ node dist/scheduler  │
│ Full node_modules│  rsync     │ Production deps only │
└─────────────────┘             └──────────────────────┘
```

---

## Prerequisites

- **Raspberry Pi 3 Model B** (1GB RAM)
- **25GB MicroSD card** (Class 10 or better)
- **Raspberry Pi OS (32-bit) Lite** — Bullseye or Bookworm
- Ethernet or Wi-Fi connection
- SSH access enabled
- Your **Windows PC** for building and deploying

---

## Part A: One-Time Pi Setup

### Step 1: Flash Raspberry Pi OS

1. Download [Raspberry Pi Imager](https://www.raspberrypi.com/software/)
2. Flash **Raspberry Pi OS (32-bit) Lite** (no desktop — saves RAM)
3. In Imager settings (gear icon), configure:
   - **Enable SSH** (password or key-based)
   - **Set username/password** (e.g., `pi` / `your-password`)
   - **Set Wi-Fi** (if not using Ethernet)
   - **Set hostname** (e.g., `surrey-booking`)
   - **Set timezone** to `America/Vancouver`
4. Insert SD card and boot the Pi

### Step 2: SSH into the Pi

```bash
ssh pi@surrey-booking.local
# or
ssh pi@192.168.x.x
```

### Step 3: Update system & install dependencies

```bash
# Update the system
sudo apt update && sudo apt upgrade -y

# Set timezone
sudo timedatectl set-timezone America/Vancouver

# Install Node.js 20
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs

# Install system Chromium (ARM-compatible) and dependencies
sudo apt install -y \
  chromium-browser \
  libnss3 libnspr4 libatk1.0-0 libatk-bridge2.0-0 \
  libcups2 libdrm2 libdbus-1-3 libxkbcommon0 \
  libatspi2.0-0 libxcomposite1 libxdamage1 libxfixes3 \
  libxrandr2 libgbm1 libpango-1.0-0 libcairo2 \
  libasound2 libwayland-client0 \
  fonts-liberation fonts-noto-color-emoji xvfb

# Verify
node --version          # v20.x.x
chromium-browser --version
```

### Step 4: Add swap (MANDATORY for 1GB RAM)

```bash
sudo dphys-swapfile swapoff
sudo sed -i 's/CONF_SWAPSIZE=.*/CONF_SWAPSIZE=2048/' /etc/dphys-swapfile
sudo dphys-swapfile setup
sudo dphys-swapfile swapon
free -h  # Verify swap shows 2GB
```

### Step 5: Reduce SD card wear

```bash
# Mount /tmp in RAM to reduce SD writes
echo "tmpfs /tmp tmpfs defaults,noatime,nosuid,nodev,size=128M 0 0" | sudo tee -a /etc/fstab
```

### Step 6: Create the app directory

```bash
mkdir -p /home/pi/SurreyActivity
```

---

## Part B: Build & Deploy from Your Windows PC

### Step 1: Build the project on your PC

Open PowerShell in your project folder:

```powershell
cd C:\Vineeth\SurreyActivity

# Build TypeScript to JavaScript
npm run build

# Verify dist/ was created
dir dist\
# Should show: booking.js, cli.js, config.js, logger.js, scheduler.js, types.js
```

### Step 2: Deploy to Pi (choose one method)

#### Option A: PowerShell Deploy Script (Recommended)

```powershell
# One-command deploy from your PC
.\scripts\deploy-to-pi.ps1 -PiHost "pi@192.168.x.x"
```

This builds, copies files, installs production deps, and restarts the service automatically.

#### Option B: Manual SCP

```powershell
$PI = "pi@192.168.x.x"
$DIR = "/home/pi/SurreyActivity"

# Copy compiled code + config (NOT src/, NOT full node_modules)
scp -r dist $PI`:$DIR/
scp package.json $PI`:$DIR/
scp package-lock.json $PI`:$DIR/
scp bookings.config.json $PI`:$DIR/
scp schedule.config.json $PI`:$DIR/
scp .env.example $PI`:$DIR/
scp -r scripts $PI`:$DIR/

# SSH in and install production deps
ssh $PI "cd $DIR && npm install --omit=dev"
```

### Step 3: Configure credentials on the Pi

```bash
ssh pi@192.168.x.x
cd /home/pi/SurreyActivity

# Create .env from template
cp .env.example .env
nano .env
```

Set your `.env`:

```env
SURREY_EMAIL=your-actual-email@example.com
SURREY_PASSWORD=your-actual-password
HEADLESS=false
SLOW_MO=100
NAVIGATION_TIMEOUT=30000
ACTION_TIMEOUT=10000
LOG_LEVEL=info
LOG_TO_FILE=true
LOG_DIR=./logs
```

### Step 4: Test on the Pi

```bash
cd /home/pi/SurreyActivity

# Set environment for testing
export PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium-browser
export LOW_MEMORY_MODE=true

# Test 1: List schedules
node dist/scheduler.js list

# Test 2: Start scheduler briefly (Ctrl+C to stop)
node dist/scheduler.js start
```

---

## Part C: Set Up Auto-Start Service

### Step 1: Install the systemd service

```bash
# The service file is already in scripts/
sudo cp /home/pi/SurreyActivity/scripts/surrey-booking.service /etc/systemd/system/

# Reload, enable, and start
sudo systemctl daemon-reload
sudo systemctl enable surrey-booking.service
sudo systemctl start surrey-booking.service

# Check it's running
sudo systemctl status surrey-booking.service
```

### Step 2: Set up log rotation (25GB SD card protection)

```bash
sudo tee /etc/logrotate.d/surrey-booking > /dev/null <<EOF
/home/pi/SurreyActivity/logs/*.log {
    daily
    rotate 7
    compress
    delaycompress
    missingok
    notifempty
    create 0644 pi pi
    dateext
    maxsize 10M
}
EOF
```

### Step 3: Set up health check & cleanup cron

```bash
crontab -e
```

Add:

```cron
# Restart service if it crashes (check every 5 min)
*/5 * * * * systemctl is-active --quiet surrey-booking || sudo systemctl restart surrey-booking

# Clean screenshots older than 3 days (save disk space)
0 3 * * * find /home/pi/SurreyActivity/screenshots -name "*.png" -mtime +3 -delete
```

---

## Deploying Updates

When you make code changes on your Windows PC:

```powershell
# On your Windows PC — one command does everything:
.\scripts\deploy-to-pi.ps1 -PiHost "pi@192.168.x.x"
```

Or manually:

```powershell
npm run build
scp -r dist pi@192.168.x.x:/home/pi/SurreyActivity/
ssh pi@192.168.x.x "sudo systemctl restart surrey-booking"
```

---

## Quick Reference

| Action          | Command (on Pi)                                          |
| --------------- | -------------------------------------------------------- |
| Start service   | `sudo systemctl start surrey-booking`                    |
| Stop service    | `sudo systemctl stop surrey-booking`                     |
| Restart service | `sudo systemctl restart surrey-booking`                  |
| View status     | `sudo systemctl status surrey-booking`                   |
| Live logs       | `sudo journalctl -u surrey-booking -f`                   |
| App logs        | `tail -f ~/SurreyActivity/logs/*.log`                    |
| List schedules  | `cd ~/SurreyActivity && node dist/scheduler.js list`     |
| Run one now     | `cd ~/SurreyActivity && node dist/scheduler.js run <id>` |
| Check Pi temp   | `vcgencmd measure_temp`                                  |
| Check memory    | `free -h`                                                |
| Check disk      | `df -h`                                                  |

| Action    | Command (on Windows PC)                            |
| --------- | -------------------------------------------------- |
| Build     | `npm run build`                                    |
| Deploy    | `.\scripts\deploy-to-pi.ps1 -PiHost "pi@IP"`       |
| SSH in    | `ssh pi@192.168.x.x`                               |
| View logs | `ssh pi@IP "sudo journalctl -u surrey-booking -f"` |

---

## Troubleshooting

### Out of memory (OOM kills)

```bash
# Check memory
free -h

# Ensure swap is active (2GB)
sudo swapon --show

# If not, re-enable
sudo dphys-swapfile swapon
```

### Chromium crashes

```bash
# Test Chromium manually
DISPLAY= chromium-browser --headless --no-sandbox --disable-gpu --dump-dom https://google.com

# If fails, reinstall
sudo apt install -y chromium-browser chromium-codecs-ffmpeg
```

### Service won't start

```bash
# Check errors
sudo journalctl -u surrey-booking -n 50 --no-pager

# Test manually
cd /home/pi/SurreyActivity
export PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium-browser
export LOW_MEMORY_MODE=true
node dist/scheduler.js start
```

### dist/scheduler.js not found

```bash
# You forgot to build on your PC! On Windows:
npm run build
# Then redeploy
.\scripts\deploy-to-pi.ps1 -PiHost "pi@IP"
```

### Disk space running low

```bash
df -h
# Clean up
sudo journalctl --vacuum-size=50M
rm -f ~/SurreyActivity/screenshots/*.png
rm -f ~/SurreyActivity/logs/*.log
```

---

## What's on the Pi (Disk Usage ~200MB)

```
/home/pi/SurreyActivity/        # ~200MB total
├── dist/                        # ~50KB  (compiled JS)
│   ├── scheduler.js
│   ├── booking.js
│   ├── cli.js
│   ├── config.js
│   ├── logger.js
│   └── types.js
├── node_modules/                # ~180MB (production deps only)
├── scripts/                     # Service & deploy scripts
├── logs/                        # Auto-rotated logs
├── screenshots/                 # Auto-cleaned
├── .env                         # Your credentials
├── bookings.config.json
├── schedule.config.json
└── package.json
```

**NOT on the Pi** (saves space + RAM):

- `src/` (TypeScript source — not needed)
- `typescript`, `ts-node`, `@types/*` (dev dependencies — not needed)

---

## Estimated Resource Usage (Pi 3, 1GB RAM)

| Resource      | Idle            | During Booking |
| ------------- | --------------- | -------------- |
| CPU           | ~1-3%           | ~40-60%        |
| RAM (Node.js) | ~40-60 MB       | ~300-500 MB    |
| Swap used     | ~0 MB           | ~100-200 MB    |
| Disk (app)    | ~200 MB of 25GB |                |
| Network       | Minimal         | Active         |

The Pi 3 will handle this fine with the 2GB swap. The scheduler idles at very low resource usage and only spins up Chromium briefly when a booking triggers.
