@echo off
REM ============================================================
REM  Surrey Activity Booking - Scheduler Launcher for Windows
REM  This script is called by Windows Task Scheduler.
REM  It builds the project (if needed), then runs the scheduler
REM  as a long-running background process using node-cron.
REM ============================================================

REM Set UTF-8 code page so emojis and Unicode render correctly in logs
chcp 65001 >nul

cd /d "%~dp0.."
set "PROJECT_DIR=%cd%"

echo [%date% %time%] Starting Surrey Activity Booking Scheduler...
echo Project directory: %PROJECT_DIR%

REM Load .env manually so Node can pick it up (dotenv does this too, but belt-and-suspenders)
if exist "%PROJECT_DIR%\.env" (
    echo Loading .env file...
    for /f "usebackq tokens=1,* delims==" %%A in ("%PROJECT_DIR%\.env") do (
        REM Skip comments and blank lines
        echo %%A | findstr /r "^#" >nul 2>&1 || (
            if not "%%A"=="" set "%%A=%%B"
        )
    )
)

REM Ensure we use headless mode when running from Task Scheduler
set HEADLESS=true
set LOG_TO_FILE=true

REM Build if dist/scheduler.js is missing or older than src/scheduler.ts
if not exist "%PROJECT_DIR%\dist\scheduler.js" (
    echo Building project...
    call npm run build
    if errorlevel 1 (
        echo [ERROR] Build failed!
        exit /b 1
    )
    echo Build complete.
)

REM Run the scheduler (long-running process with node-cron)
echo Starting scheduler process...
node "%PROJECT_DIR%\dist\scheduler.js" start

echo [%date% %time%] Scheduler process exited.
