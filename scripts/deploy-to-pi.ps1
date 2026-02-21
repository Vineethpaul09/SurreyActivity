# Deploy Surrey Activity Booking to Raspberry Pi
# Run this from your Windows PC in PowerShell
#
# Usage:
#   .\scripts\deploy-to-pi.ps1
#   .\scripts\deploy-to-pi.ps1 -PiHost "pi@192.168.1.50"

param(
    [string]$PiHost = "pi@192.168.137.116",
    [string]$PiDir = "/home/pi/SurreyActivity"
)

$ErrorActionPreference = "Stop"

$AppDir = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
Set-Location $AppDir

Write-Host ""
Write-Host "============================================" -ForegroundColor Cyan
Write-Host " Deploying to Raspberry Pi: $PiHost"
Write-Host "============================================" -ForegroundColor Cyan
Write-Host ""

# --- Step 1: Build TypeScript ---
Write-Host "[1/4] Building TypeScript..." -ForegroundColor Yellow
npm run build
if ($LASTEXITCODE -ne 0) { throw "Build failed" }
Write-Host "  Built to dist/" -ForegroundColor Green

# --- Step 2: Copy files to Pi using scp ---
Write-Host "[2/4] Copying files to Pi..." -ForegroundColor Yellow

# Create target directory on Pi
ssh $PiHost "mkdir -p $PiDir"

# Copy essential files (no src/, no node_modules, no .git)
$filesToCopy = @(
    "dist",
    "scripts",
    "package.json",
    "package-lock.json",
    "bookings.config.json",
    "schedule.config.json",
    ".env.example"
)

foreach ($item in $filesToCopy) {
    $sourcePath = Join-Path $AppDir $item
    if (Test-Path $sourcePath) {
        Write-Host "  Copying $item..."
        scp -r $sourcePath "${PiHost}:${PiDir}/"
    }
}
Write-Host "  Files copied" -ForegroundColor Green

# --- Step 3: Install production deps on Pi ---
Write-Host "[3/4] Installing production deps on Pi..." -ForegroundColor Yellow
ssh $PiHost "cd $PiDir; npm install --omit=dev"

# --- Step 4: Restart service ---
Write-Host "[4/4] Restarting service on Pi..." -ForegroundColor Yellow
ssh $PiHost "sudo systemctl restart surrey-booking; sudo systemctl status surrey-booking --no-pager"

Write-Host ""
Write-Host "============================================" -ForegroundColor Green
Write-Host " Deployment complete!"
Write-Host "============================================" -ForegroundColor Green
Write-Host ""
Write-Host " View live logs:" -ForegroundColor Cyan
Write-Host "   ssh $PiHost 'sudo journalctl -u surrey-booking -f'"
Write-Host ""
