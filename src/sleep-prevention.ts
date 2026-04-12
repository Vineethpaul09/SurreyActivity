/**
 * Windows Sleep Prevention Module
 *
 * Prevents the system from sleeping during booking windows by calling
 * the Windows SetThreadExecutionState API via a background PowerShell process.
 *
 * - Keeps the system AND display awake (useful for headed Playwright browser)
 * - Automatically resets when the process is killed
 * - Refreshes the execution state every 30 seconds for reliability
 * - Only works on Windows (no-op on other platforms)
 *
 * Lid-close behavior is handled at the OS level:
 *   - AC (docking station): Do nothing — laptop stays awake with lid closed
 *   - Battery: Sleep — normal laptop behavior
 * This is set via powercfg and does NOT need dynamic toggling.
 */

import { ChildProcess, spawn } from "child_process";
import { getLogger } from "./logger";

let preventSleepProcess: ChildProcess | null = null;

// PowerShell script that calls SetThreadExecutionState to prevent sleep.
// ES_CONTINUOUS (0x80000000) | ES_SYSTEM_REQUIRED (0x1) | ES_DISPLAY_REQUIRED (0x2) = 0x80000003
// Refreshes every 30 seconds so Windows never resets the state.
const PS_PREVENT_SLEEP_SCRIPT = `
Add-Type @"
using System;
using System.Runtime.InteropServices;
public class SleepPrev {
    [DllImport("kernel32.dll", SetLastError = true)]
    public static extern uint SetThreadExecutionState(uint esFlags);
}
"@
while ($true) {
    [SleepPrev]::SetThreadExecutionState(0x80000003) | Out-Null
    Start-Sleep -Seconds 30
}
`;

/**
 * Prevent Windows from entering sleep/hibernate.
 * Spawns a background PowerShell process that holds the system awake.
 * Also keeps the display on (for headed Playwright browser visibility).
 *
 * Safe to call multiple times - only one process is created.
 */
export function preventSleep(): void {
  if (preventSleepProcess && !preventSleepProcess.killed) {
    return; // Already active
  }

  if (process.platform !== "win32") {
    try {
      const log = getLogger();
      log.info(
        "Sleep prevention skipped (only supported on Windows). On Linux/Pi, the system stays awake by default.",
      );
    } catch {
      // Logger not initialized yet
    }
    return;
  }

  try {
    const log = getLogger();

    preventSleepProcess = spawn(
      "powershell.exe",
      [
        "-NoProfile",
        "-WindowStyle",
        "Hidden",
        "-Command",
        PS_PREVENT_SLEEP_SCRIPT,
      ],
      {
        stdio: "ignore",
        windowsHide: true,
      },
    );

    preventSleepProcess.on("error", (err) => {
      log.warn(`Sleep prevention process error: ${err.message}`);
      preventSleepProcess = null;
    });

    preventSleepProcess.on("exit", (code) => {
      if (code !== null && code !== 0 && code !== 1) {
        log.warn(
          `Sleep prevention process exited unexpectedly (code: ${code})`,
        );
      }
      preventSleepProcess = null;
    });

    // Unref so it doesn't block Node.js from exiting
    preventSleepProcess.unref();

    log.info("🛡️ Sleep prevention ENABLED — system + display will stay awake");
  } catch (error) {
    try {
      const log = getLogger();
      log.warn(
        `Could not enable sleep prevention: ${(error as Error).message}`,
      );
    } catch {
      // Logger not initialized
    }
    preventSleepProcess = null;
  }
}

/**
 * Allow Windows to sleep again by terminating the prevention process.
 * The system automatically restores normal sleep behavior when the process exits.
 */
export function allowSleep(): void {
  if (!preventSleepProcess) {
    return;
  }

  try {
    preventSleepProcess.kill();
    preventSleepProcess = null;

    const log = getLogger();
    log.info("😴 Sleep prevention DISABLED — system can sleep normally");
  } catch (error) {
    preventSleepProcess = null;
    try {
      const log = getLogger();
      log.warn(`Error disabling sleep prevention: ${(error as Error).message}`);
    } catch {
      // Logger not initialized
    }
  }
}

/**
 * Check if sleep prevention is currently active.
 */
export function isSleepPrevented(): boolean {
  return preventSleepProcess !== null && !preventSleepProcess.killed;
}

/**
 * Set up process exit handlers to ensure sleep prevention is always cleaned up.
 * Call this once during scheduler initialization.
 */
export function setupSleepCleanup(): void {
  const cleanup = () => {
    if (isSleepPrevented()) {
      try {
        preventSleepProcess?.kill();
      } catch {
        // Best effort
      }
      preventSleepProcess = null;
    }
  };

  process.on("exit", cleanup);
  process.on("SIGINT", () => {
    cleanup();
    process.exit(0);
  });
  process.on("SIGTERM", () => {
    cleanup();
    process.exit(0);
  });
}
