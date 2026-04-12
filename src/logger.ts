/**
 * Logger utility for Surrey Activity Booking Automation
 */

import winston from "winston";
import DailyRotateFile from "winston-daily-rotate-file";
import path from "path";
import fs from "fs";

let logger: winston.Logger;

export function initializeLogger(
  logLevel: string,
  logToFile: boolean,
  logDir: string,
): winston.Logger {
  // Ensure log directory exists
  if (logToFile && !fs.existsSync(logDir)) {
    fs.mkdirSync(logDir, { recursive: true });
  }

  const transports: winston.transport[] = [
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.timestamp({ format: "YYYY-MM-DD HH:mm:ss" }),
        winston.format.printf(({ level, message, timestamp }) => {
          return `[${timestamp}] ${level}: ${message}`;
        }),
      ),
    }),
  ];

  if (logToFile) {
    // Daily rotation: one log file per day, auto-delete after 30 days
    const dailyRotateTransport = new DailyRotateFile({
      dirname: logDir,
      filename: "booking-%DATE%.log",
      datePattern: "YYYY-MM-DD",
      maxFiles: "30d",
      maxSize: "20m",
      format: winston.format.combine(
        winston.format.timestamp({ format: "YYYY-MM-DD HH:mm:ss" }),
        winston.format.printf(({ level, message, timestamp }) => {
          return `[${timestamp}] ${level.toUpperCase()}: ${message}`;
        }),
      ),
    });

    transports.push(dailyRotateTransport);
  }

  logger = winston.createLogger({
    level: logLevel,
    transports,
  });

  return logger;
}

export function getLogger(): winston.Logger {
  if (!logger) {
    // Default logger if not initialized
    return initializeLogger("info", false, "./logs");
  }
  return logger;
}

export function logBookingAttempt(params: {
  activity: string;
  date: string;
  time: string;
  location: string;
}): void {
  const log = getLogger();
  log.info("═".repeat(60));
  log.info("BOOKING ATTEMPT");
  log.info(`  Activity: ${params.activity}`);
  log.info(`  Date:     ${params.date}`);
  log.info(`  Time:     ${params.time}`);
  log.info(`  Location: ${params.location}`);
  log.info("═".repeat(60));
}

export function logSuccess(message: string): void {
  const log = getLogger();
  log.info(`✅ SUCCESS: ${message}`);
}

export function logError(message: string, error?: Error): void {
  const log = getLogger();
  log.error(`❌ ERROR: ${message}`);
  if (error) {
    log.error(`   Details: ${error.message}`);
    if (error.stack) {
      log.debug(`   Stack: ${error.stack}`);
    }
  }
}

export function logStep(step: number, message: string): void {
  const log = getLogger();
  log.info(`[Step ${step}] ${message}`);
}

export function logWarning(message: string): void {
  const log = getLogger();
  log.warn(`⚠️  ${message}`);
}

/**
 * Delete screenshots older than the specified number of days.
 */
export function cleanupOldScreenshots(
  screenshotDir: string,
  maxAgeDays: number = 30,
): void {
  const log = getLogger();
  if (!fs.existsSync(screenshotDir)) return;

  const cutoff = Date.now() - maxAgeDays * 24 * 60 * 60 * 1000;
  let deleted = 0;

  try {
    const files = fs.readdirSync(screenshotDir);
    for (const file of files) {
      if (!file.endsWith(".png")) continue;
      const filePath = path.join(screenshotDir, file);
      const stat = fs.statSync(filePath);
      if (stat.mtimeMs < cutoff) {
        fs.unlinkSync(filePath);
        deleted++;
      }
    }
    if (deleted > 0) {
      log.info(
        `🧹 Cleaned up ${deleted} screenshot(s) older than ${maxAgeDays} days`,
      );
    }
  } catch (error) {
    log.warn(`Failed to clean up screenshots: ${(error as Error).message}`);
  }
}

/**
 * Delete old log files not managed by DailyRotateFile (legacy cleanup).
 */
export function cleanupOldLogs(logDir: string, maxAgeDays: number = 30): void {
  const log = getLogger();
  if (!fs.existsSync(logDir)) return;

  const cutoff = Date.now() - maxAgeDays * 24 * 60 * 60 * 1000;
  let deleted = 0;

  try {
    const files = fs.readdirSync(logDir);
    for (const file of files) {
      if (!file.endsWith(".log")) continue;
      const filePath = path.join(logDir, file);
      const stat = fs.statSync(filePath);
      if (stat.mtimeMs < cutoff) {
        fs.unlinkSync(filePath);
        deleted++;
      }
    }
    if (deleted > 0) {
      log.info(
        `🧹 Cleaned up ${deleted} log file(s) older than ${maxAgeDays} days`,
      );
    }
  } catch (error) {
    log.warn(`Failed to clean up logs: ${(error as Error).message}`);
  }
}
