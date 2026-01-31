/**
 * Type definitions for Surrey Activity Booking Automation
 */

export interface BookingParams {
  id?: string;
  enabled?: boolean;
  activity: string;
  date: string; // Format: "DD-MMM-YYYY" e.g., "31-Jan-2026"
  time: string; // Format: "HH:MM am/pm" e.g., "08:15 am"
  location: string; // e.g., "Guildford Recreation Centre"
  preferWaitlist?: boolean;
}

export interface BookingConfig {
  description: string;
  bookings: BookingParams[];
  settings: BookingSettings;
}

export interface BookingSettings {
  feePreference: string;
  maxRetries: number;
  retryDelayMs: number;
  screenshotOnError: boolean;
  screenshotDir: string;
}

export interface EnvConfig {
  email: string;
  password: string;
  headless: boolean;
  slowMo: number;
  navigationTimeout: number;
  actionTimeout: number;
  logLevel: string;
  logToFile: boolean;
  logDir: string;
}

export interface BookingResult {
  success: boolean;
  bookingId?: string;
  activity: string;
  date: string;
  time: string;
  location: string;
  message: string;
  error?: string;
  timestamp: Date;
  waitlisted?: boolean;
}

export type SlotStatus = "available" | "waitlist" | "full" | "not-found";

export interface SlotInfo {
  status: SlotStatus;
  spotsLeft?: number;
  elementRef?: string;
  buttonRef?: string;
}

// Activity names available in the system
export const ACTIVITIES = [
  "Drop In Badminton - 13+",
  "Drop In Badminton - Adult",
  "Drop In Badminton - Children with Adult",
  "Drop In Badminton - Family",
  "Drop In Badminton - Youth",
  "Drop In Basketball - 13+",
  "Drop In Basketball - Adult",
  "Drop In Basketball - Children with Adult",
  "Drop In Basketball - Family",
  "Drop In Basketball - Youth",
  "Drop In Indoor Soccer - 13+",
  "Drop In Pickleball - 13+",
  "Drop In Pickleball - Adult",
  "Drop In Pickleball - Family",
  "Drop In Table Tennis - 13+",
  "Drop In Table Tennis - Family",
  "Drop In Table Tennis - Seniors Services",
  "Drop In Volleyball - 13+",
  "Drop In Volleyball - Adult",
  "Drop In Volleyball - Family",
] as const;

// Recreation centres
export const LOCATIONS = [
  "Bridgeview Community Centre",
  "Chuck Bailey Recreation Centre",
  "Clayton Community Centre",
  "Cloverdale Recreation Centre",
  "Fleetwood Community Centre",
  "Fraser Heights Recreation Centre",
  "Guildford Recreation Centre",
  "Newton Recreation Centre - Wave Pool",
  "South Surrey Recreation & Arts Centre",
] as const;
