/**
 * Configuration loader for Surrey Activity Booking Automation
 */

import dotenv from "dotenv";
import fs from "fs";
import path from "path";
import { BookingConfig, EnvConfig, BookingParams } from "./types";

// Load environment variables
dotenv.config();

export function loadEnvConfig(): EnvConfig {
  return {
    email: process.env.SURREY_EMAIL || "",
    password: process.env.SURREY_PASSWORD || "",
    headless: process.env.HEADLESS === "true",
    slowMo: parseInt(process.env.SLOW_MO || "100", 10),
    navigationTimeout: parseInt(process.env.NAVIGATION_TIMEOUT || "30000", 10),
    actionTimeout: parseInt(process.env.ACTION_TIMEOUT || "10000", 10),
    logLevel: process.env.LOG_LEVEL || "info",
    logToFile: process.env.LOG_TO_FILE === "true",
    logDir: process.env.LOG_DIR || "./logs",
  };
}

export function loadBookingConfig(configPath?: string): BookingConfig {
  const defaultPath = path.join(process.cwd(), "bookings.config.json");
  const filePath = configPath || defaultPath;

  if (!fs.existsSync(filePath)) {
    throw new Error(`Booking config file not found: ${filePath}`);
  }

  const content = fs.readFileSync(filePath, "utf-8");
  const config: BookingConfig = JSON.parse(content);

  // Validate config
  if (!config.bookings || !Array.isArray(config.bookings)) {
    throw new Error("Invalid booking config: missing bookings array");
  }

  return config;
}

export function validateBookingParams(params: BookingParams): string[] {
  const errors: string[] = [];

  if (!params.activity) {
    errors.push("Activity is required");
  }

  if (!params.date) {
    errors.push("Date is required");
  } else if (!isValidDateFormat(params.date)) {
    errors.push(
      `Invalid date format: ${params.date}. Expected: DD-MMM-YYYY (e.g., 31-Jan-2026)`,
    );
  }

  if (!params.time) {
    errors.push("Time is required");
  } else if (!isValidTimeFormat(params.time)) {
    errors.push(
      `Invalid time format: ${params.time}. Expected: HH:MM am/pm (e.g., 08:15 am)`,
    );
  }

  if (!params.location) {
    errors.push("Location is required");
  }

  return errors;
}

function isValidDateFormat(date: string): boolean {
  // Format: DD-MMM-YYYY (e.g., 31-Jan-2026)
  const regex = /^\d{2}-[A-Z][a-z]{2}-\d{4}$/;
  return regex.test(date);
}

function isValidTimeFormat(time: string): boolean {
  // Format: HH:MM am/pm (e.g., 08:15 am)
  const regex = /^\d{2}:\d{2}\s*(am|pm)$/i;
  return regex.test(time);
}

export const BOOKING_URL =
  "https://cityofsurrey.perfectmind.com/23615/Clients/BookMe4BookingPages/Classes?widgetId=b4059e75-9755-401f-a7b5-d7c75361420d&calendarId=be083bfc-aeee-4c7a-aa26-07eb679e18a6&singleCalendarWidget=False";

export const LOGIN_URL =
  "https://cityofsurrey.perfectmind.com/23615/auth/login";
