@echo off
REM ============================================================
REM  Surrey Activity Booking - Scheduler Launcher for Windows
REM  Thin wrapper around the PowerShell launcher.
REM  Keeps manual launches aligned with the scheduled-task path.
REM ============================================================

REM Set UTF-8 code page so emojis and Unicode render correctly in logs
chcp 65001 >nul

cd /d "%~dp0"
powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -File "%~dp0run-scheduler.ps1"
exit /b %errorlevel%
