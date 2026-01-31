/**
 * Logger utility for Surrey Activity Booking Automation
 */

import winston from "winston";
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

  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const logFileName = `booking-${timestamp}.log`;

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
    transports.push(
      new winston.transports.File({
        filename: path.join(logDir, logFileName),
        format: winston.format.combine(
          winston.format.timestamp({ format: "YYYY-MM-DD HH:mm:ss" }),
          winston.format.printf(({ level, message, timestamp }) => {
            return `[${timestamp}] ${level.toUpperCase()}: ${message}`;
          }),
        ),
      }),
    );
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
