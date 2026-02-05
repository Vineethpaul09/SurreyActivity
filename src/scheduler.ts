#!/usr/bin/env node
/**
 * Surrey Activity Booking Scheduler
 *
 * Runs scheduled cron jobs to automatically book Badminton Adult activities.
 * Starts 2 minutes before release time and polls/refreshes until Register button appears.
 *
 * Schedule:
 * - Friday 6:15 PM → Book Monday @ Cloverdale
 * - Saturday 6:30 PM → Book Tuesday @ Guildford
 * - Sunday 6:15 PM → Book Wednesday @ Fraser Heights
 * - Monday 7:00 PM → Book Thursday @ Guildford
 * - Wednesday 10:00 AM → Book Saturday @ Fraser Heights
 * - Thursday 10:00 AM → Book Sunday @ Fraser Heights
 */

import cron from "node-cron";
import {
  format,
  nextMonday,
  nextTuesday,
  nextWednesday,
  nextThursday,
  nextSaturday,
  nextSunday,
  getDay,
  setHours,
  setMinutes,
  addDays,
  isBefore,
} from "date-fns";
import { toZonedTime, fromZonedTime } from "date-fns-tz";
import { loadEnvConfig, loadBookingConfig } from "./config";
import { initializeLogger, getLogger, logSuccess, logError } from "./logger";
import { SurreyBookingAutomation } from "./booking";
import { BookingParams } from "./types";

// Pacific Time Zone (Vancouver/Surrey)
const TIMEZONE = "America/Vancouver";

/**
 * Get current time in PST/PDT (Pacific Time)
 */
function getNowPST(): Date {
  return toZonedTime(new Date(), TIMEZONE);
}

// Activity to book
const ACTIVITY = "Drop In Badminton - Adult";

// Locations
const LOCATIONS = {
  CLOVERDALE: "Cloverdale Recreation Centre",
  GUILDFORD: "Guildford Recreation Centre",
  FRASER_HEIGHTS: "Fraser Heights Recreation Centre",
};

// Schedule configuration
interface ScheduleConfig {
  id: string;
  activity: string; // Activity name e.g., "Drop In Badminton - Adult"
  cronExpression: string;
  cronDay: number; // 0=Sunday, 1=Monday, ..., 5=Friday, 6=Saturday
  releaseHour: number;
  releaseMinute: number;
  targetDay: (fromDate: Date) => Date;
  location: string;
  time: string; // Time slot to book e.g., "8:15 am"
  description: string;
  testOnly?: boolean; // If true, won't be scheduled automatically
}

/**
 * Calculate the next target date, accounting for whether the release time has passed.
 * If today is the cron day and release time has passed, get NEXT week's target.
 * All times are in PST (Pacific Time)
 */
function getNextTargetDate(
  schedule: ScheduleConfig,
  now: Date = getNowPST(),
): Date {
  const currentDay = getDay(now); // 0=Sunday, 1=Monday, ..., 6=Saturday
  const releaseTime = setMinutes(
    setHours(now, schedule.releaseHour),
    schedule.releaseMinute,
  );

  // Check if today is the cron day and release time has passed
  if (currentDay === schedule.cronDay && isBefore(releaseTime, now)) {
    // Release time passed - calculate from tomorrow to get next week's slot
    const tomorrow = addDays(now, 1);
    return schedule.targetDay(tomorrow);
  }

  // Release time hasn't passed yet, or it's not the cron day
  return schedule.targetDay(now);
}

const SCHEDULES: ScheduleConfig[] = [
  // ============ BADMINTON SCHEDULES ============
  {
    id: "friday-monday-cloverdale",
    activity: ACTIVITY,
    cronExpression: "28 18 * * 5", // Friday at 6:13 PM (2 min before 6:15 PM release)
    cronDay: 5, // Friday
    releaseHour: 18,
    releaseMinute: 30,
    targetDay: (d) => nextMonday(d),
    location: LOCATIONS.CLOVERDALE,
    time: "6:30 am",
    description: "Friday 6:30 PM → Book Monday @ Cloverdale",
  },
  {
    id: "saturday-tuesday-guildford",
    activity: ACTIVITY,
    cronExpression: "58 18 * * 6",
    cronDay: 6, // Saturday
    releaseHour: 19,
    releaseMinute: 0,
    targetDay: (d) => nextTuesday(d),
    location: LOCATIONS.GUILDFORD,
    time: "7:00 PM",
    description: "Saturday 7:00 PM → Book Tuesday @ Guildford",
  },
  {
    id: "sunday-wednesday-fraser",
    activity: ACTIVITY,
    cronExpression: "13 18 * * 0", // Sunday at 6:13 PM (2 min before 6:15 PM release)
    cronDay: 0, // Sunday
    releaseHour: 18,
    releaseMinute: 15,
    targetDay: (d) => nextWednesday(d),
    location: LOCATIONS.FRASER_HEIGHTS,
    time: "6:15 am",
    description: "Sunday 6:15 PM → Book Wednesday @ Fraser Heights",
  },
  {
    id: "monday-thursday-guildford",
    activity: ACTIVITY,
    cronExpression: "58 18 * * 1", // Monday at 6:58 PM (2 min before 7:00 PM release)
    cronDay: 1, // Monday
    releaseHour: 19,
    releaseMinute: 0,
    targetDay: (d) => nextThursday(d),
    location: LOCATIONS.GUILDFORD,
    time: "7:00 am",
    description: "Monday 7:00 PM → Book Thursday @ Guildford",
  },
  {
    id: "wednesday-saturday-fraser",
    activity: ACTIVITY,
    cronExpression: "58 9 * * 3", // Wednesday at 9:58 AM (2 min before 10:00 AM release)
    cronDay: 3, // Wednesday
    releaseHour: 10,
    releaseMinute: 0,
    targetDay: (d) => nextSaturday(d),
    location: LOCATIONS.FRASER_HEIGHTS,
    time: "10:00 am",
    description: "Wednesday 10:00 AM → Book Saturday @ Fraser Heights",
  },
  {
    id: "thursday-sunday-fraser",
    activity: ACTIVITY,
    cronExpression: "58 9 * * 4", // Thursday at 9:58 AM (2 min before 10:00 AM release)
    cronDay: 4, // Thursday
    releaseHour: 10,
    releaseMinute: 0,
    targetDay: (d) => nextSunday(d),
    location: LOCATIONS.FRASER_HEIGHTS,
    time: "10:00 am",
    description: "Thursday 10:00 AM → Book Sunday @ Fraser Heights",
  },
  {
    id: "wednesday-saturday-guildford",
    activity: ACTIVITY,
    cronExpression: "59 17 * * 3", // Wednesday at 5:58 PM (2 min before 6:00 PM release)
    cronDay: 3, // Wednesday
    releaseHour: 18,
    releaseMinute: 0,
    targetDay: (d) => nextSaturday(d),
    location: LOCATIONS.GUILDFORD,
    time: "6:30 pm",
    description: "Wednesday 6:30 PM → Book Saturday @ Guildford",
  },
  {
    id: "wednesday-saturday-fraser-basketball",
    activity: "Drop In Basketball - Adult",
    cronExpression: "49 17 * * 3", // Wednesday at 5:43 PM (2 min before 5:45 PM release)
    cronDay: 3, // Wednesday
    releaseHour: 17,
    releaseMinute: 49,
    targetDay: (d) => nextSaturday(d),
    location: LOCATIONS.FRASER_HEIGHTS,
    time: "03:15 pm",
    description:
      "Wednesday 03:15 pm → Book Saturday @ Fraser Heights (Basketball)",
  },
];

/**
 * Format date to DD-MMM-YYYY (e.g., "31-Jan-2026")
 */
function formatBookingDate(date: Date): string {
  return format(date, "dd-MMM-yyyy");
}

/**
 * Execute a booking using the working SurreyBookingAutomation
 */
async function executeBooking(schedule: ScheduleConfig): Promise<void> {
  const log = getLogger();
  const now = getNowPST();
  const targetDate = getNextTargetDate(schedule, now);
  const formattedDate = formatBookingDate(targetDate);

  log.info("═".repeat(60));
  log.info(`🎯 SCHEDULED BOOKING: ${schedule.description}`);
  log.info(`   Target Date: ${formattedDate}`);
  log.info(`   Location: ${schedule.location}`);
  log.info(`   Time: ${schedule.time}`);
  log.info(`   Activity: ${schedule.activity}`);
  log.info("═".repeat(60));

  const envConfig = loadEnvConfig();
  const bookingConfig = loadBookingConfig();

  const automation = new SurreyBookingAutomation(
    envConfig,
    bookingConfig.settings,
  );

  const bookingParams: BookingParams = {
    activity: schedule.activity,
    date: formattedDate,
    time: schedule.time,
    location: schedule.location,
    preferWaitlist: false,
  };

  try {
    // Use phased booking for scheduled bookings (not test-only)
    // This starts immediately, completes login/navigation during buffer time,
    // then waits at registration page until exact release time
    let result;
    if (!schedule.testOnly) {
      log.info("🚀 Starting PHASED booking (optimized for speed)...");
      log.info(
        `   ⏱️  Will prepare now, then wait until ${schedule.releaseHour}:${schedule.releaseMinute.toString().padStart(2, "0")} PST`,
      );
      result = await automation.bookWithPhases(
        bookingParams,
        schedule.releaseHour,
        schedule.releaseMinute,
      );
    } else {
      log.info("⚡ Test mode - using standard booking (no wait)");
      result = await automation.book(bookingParams);
    }

    if (result.success) {
      logSuccess(`✅ BOOKING SUCCESSFUL!`);
      logSuccess(`   Activity: ${result.activity}`);
      logSuccess(`   Date: ${result.date}`);
      logSuccess(`   Location: ${result.location}`);
      logSuccess(`   Time: ${result.time || "N/A"}`);
      if (result.waitlisted) {
        log.info(`   ⚠️ Added to WAITLIST`);
      }
    } else {
      logError(`❌ Booking failed: ${result.message}`);
      if (result.error) {
        logError(`   Error: ${result.error}`);
      }
    }
  } catch (error) {
    logError(`Booking error: ${(error as Error).message}`);
  }
}

/**
 * Start the scheduler
 */
function startScheduler(): void {
  const envConfig = loadEnvConfig();
  initializeLogger(envConfig.logLevel, envConfig.logToFile, envConfig.logDir);
  const log = getLogger();
  const dayNames = [
    "Sunday",
    "Monday",
    "Tuesday",
    "Wednesday",
    "Thursday",
    "Friday",
    "Saturday",
  ];

  log.info("═".repeat(60));
  log.info("🏸 SURREY ACTIVITY BOOKING SCHEDULER");
  log.info("═".repeat(60));
  log.info(`Timezone: ${TIMEZONE} (PST/PDT)`);
  log.info("");
  log.info("Scheduled Jobs:");
  log.info("─".repeat(60));

  // Filter out test-only schedules for display and auto-scheduling
  const activeSchedules = SCHEDULES.filter((s) => !s.testOnly);

  activeSchedules.forEach((schedule, index) => {
    const now = getNowPST();
    const targetDate = getNextTargetDate(schedule, now);
    const currentDay = getDay(now);
    const isToday = currentDay === schedule.cronDay;
    const releaseTime = setMinutes(
      setHours(now, schedule.releaseHour),
      schedule.releaseMinute,
    );
    const hasPassed = isToday && isBefore(releaseTime, now);
    const nextTrigger = getNextCronTrigger(schedule, now);
    const timeUntilTrigger = nextTrigger.getTime() - now.getTime();
    const triggerDayName = dayNames[getDay(nextTrigger)];

    log.info(`  ${index + 1}. ${schedule.description}`);
    log.info(`     Activity: ${schedule.activity}`);
    log.info(
      `     Target: ${formatBookingDate(targetDate)} @ ${schedule.location}`,
    );

    if (isToday && !hasPassed) {
      log.info(
        `     ⏰ STATUS: TODAY! Release at ${schedule.releaseHour}:${schedule.releaseMinute.toString().padStart(2, "0")} PST`,
      );
      log.info(
        `     ⏳ Time until trigger: ${formatTimeRemaining(timeUntilTrigger)}`,
      );
    } else if (hasPassed) {
      log.info(`     ✅ STATUS: Done for this week (time passed)`);
      log.info(
        `     📅 Next trigger: ${triggerDayName} ${format(nextTrigger, "dd-MMM-yyyy")} at ${format(nextTrigger, "h:mm a")} PST`,
      );
    } else {
      log.info(`     ⏸️  STATUS: Waiting`);
      log.info(
        `     📅 Next trigger: ${triggerDayName} ${format(nextTrigger, "dd-MMM-yyyy")} at ${format(nextTrigger, "h:mm a")} PST`,
      );
      log.info(`     ⏳ Time until: ${formatTimeRemaining(timeUntilTrigger)}`);
    }
    log.info("");

    // Validate cron expression
    if (!cron.validate(schedule.cronExpression)) {
      log.error(`Invalid cron expression: ${schedule.cronExpression}`);
      return;
    }

    // Schedule the job with PST timezone
    cron.schedule(
      schedule.cronExpression,
      async () => {
        log.info(`\n🔔 Cron triggered: ${schedule.id}`);
        await executeBooking(schedule);
      },
      {
        timezone: TIMEZONE,
      },
    );
  });

  log.info("─".repeat(60));
  log.info(`✅ Scheduler started (${TIMEZONE}). Press Ctrl+C to stop.`);
  log.info("═".repeat(60));

  // Update status every 30 seconds
  setInterval(() => {
    displayNextScheduleStatus(log, dayNames);
  }, 30000);
}

/**
 * Display the next upcoming schedule status
 */
function displayNextScheduleStatus(
  log: ReturnType<typeof getLogger>,
  dayNames: string[],
): void {
  const now = getNowPST();

  // Find the next upcoming schedule (closest trigger time), excluding test-only
  let nextSchedule: ScheduleConfig | null = null;
  let minTimeUntil = Infinity;

  for (const schedule of SCHEDULES) {
    if (schedule.testOnly) continue; // Skip test-only schedules
    const nextTrigger = getNextCronTrigger(schedule, now);
    const timeUntil = nextTrigger.getTime() - now.getTime();
    if (timeUntil > 0 && timeUntil < minTimeUntil) {
      minTimeUntil = timeUntil;
      nextSchedule = schedule;
    }
  }

  if (nextSchedule) {
    const nextTrigger = getNextCronTrigger(nextSchedule, now);
    const triggerDayName = dayNames[getDay(nextTrigger)];
    const currentDay = getDay(now);
    const isToday = currentDay === nextSchedule.cronDay;
    const releaseTime = setMinutes(
      setHours(now, nextSchedule.releaseHour),
      nextSchedule.releaseMinute,
    );
    const hasPassed = isToday && isBefore(releaseTime, now);

    const timeStr = format(now, "h:mm:ss a");
    const statusIcon = isToday && !hasPassed ? "🔥" : "⏳";

    log.info(
      `${statusIcon} [${timeStr} PST] Next: ${nextSchedule.description} | ⏱️  ${formatTimeRemaining(minTimeUntil)}`,
    );
  }
}

/**
 * Run a specific schedule immediately (for testing)
 */
async function runNow(scheduleId: string): Promise<void> {
  const envConfig = loadEnvConfig();
  initializeLogger(envConfig.logLevel, envConfig.logToFile, envConfig.logDir);
  const log = getLogger();

  const schedule = SCHEDULES.find((s) => s.id === scheduleId);
  if (!schedule) {
    log.error(`Schedule not found: ${scheduleId}`);
    log.info("Available schedules:");
    SCHEDULES.forEach((s) => log.info(`  - ${s.id}`));
    process.exit(1);
  }

  await executeBooking(schedule);
}

/**
 * Get the next cron trigger date/time for a schedule (in PST)
 */
function getNextCronTrigger(
  schedule: ScheduleConfig,
  now: Date = getNowPST(),
): Date {
  const currentDay = getDay(now); // 0=Sunday, 6=Saturday
  const cronDay = schedule.cronDay;

  // Calculate days until next cron day
  let daysUntil = cronDay - currentDay;
  if (daysUntil < 0) {
    daysUntil += 7; // Next week
  }

  // If it's today, check if time has passed
  if (daysUntil === 0) {
    const triggerTime = setMinutes(
      setHours(now, schedule.releaseHour),
      schedule.releaseMinute - 2,
    ); // Cron runs 2 min before
    if (isBefore(triggerTime, now)) {
      daysUntil = 7; // Next week
    }
  }

  const triggerDate = addDays(now, daysUntil);
  return setMinutes(
    setHours(triggerDate, schedule.releaseHour),
    schedule.releaseMinute - 2,
  );
}

/**
 * Format time remaining in human readable format
 */
function formatTimeRemaining(ms: number): string {
  if (ms < 0) return "Now!";

  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) {
    return `${days}d ${hours % 24}h ${minutes % 60}m`;
  } else if (hours > 0) {
    return `${hours}h ${minutes % 60}m`;
  } else if (minutes > 0) {
    return `${minutes}m ${seconds % 60}s`;
  } else {
    return `${seconds}s`;
  }
}

/**
 * List all schedules (using PST timezone)
 */
function listSchedules(): void {
  const now = getNowPST();
  const dayNames = [
    "Sunday",
    "Monday",
    "Tuesday",
    "Wednesday",
    "Thursday",
    "Friday",
    "Saturday",
  ];

  // Separate regular and test schedules
  const regularSchedules = SCHEDULES.filter((s) => !s.testOnly);
  const testSchedules = SCHEDULES.filter((s) => s.testOnly);

  console.log("\n🏸 Surrey Activity Booking Schedule:");
  console.log(`   Timezone: ${TIMEZONE} (PST/PDT)`);
  console.log("═".repeat(75));
  console.log("");

  regularSchedules.forEach((schedule, index) => {
    const targetDate = getNextTargetDate(schedule, now);
    const releaseTimeStr = `${schedule.releaseHour}:${schedule.releaseMinute.toString().padStart(2, "0")}`;
    const currentDay = getDay(now);
    const isToday = currentDay === schedule.cronDay;
    const releaseTime = setMinutes(
      setHours(now, schedule.releaseHour),
      schedule.releaseMinute,
    );
    const hasPassed = isToday && isBefore(releaseTime, now);

    // Calculate next trigger
    const nextTrigger = getNextCronTrigger(schedule, now);
    const timeUntilTrigger = nextTrigger.getTime() - now.getTime();
    const triggerDayName = dayNames[getDay(nextTrigger)];

    console.log(`${index + 1}. ${schedule.description}`);
    console.log(`   ID: ${schedule.id}`);
    console.log(`   Activity: ${schedule.activity}`);
    console.log(
      `   Target date: ${formatBookingDate(targetDate)} @ ${schedule.location}`,
    );

    // Status
    if (isToday && !hasPassed) {
      console.log(
        `   ⏰ STATUS: TODAY! Release at ${releaseTimeStr} PST - BE READY!`,
      );
      console.log(
        `   ⏳ Time until trigger: ${formatTimeRemaining(timeUntilTrigger)}`,
      );
    } else if (hasPassed) {
      console.log(
        `   ✅ STATUS: Completed for this week (release time passed)`,
      );
      console.log(
        `   📅 Next trigger: ${triggerDayName} ${format(nextTrigger, "dd-MMM-yyyy")} at ${format(nextTrigger, "h:mm a")} PST`,
      );
      console.log(
        `   ⏳ Time until next: ${formatTimeRemaining(timeUntilTrigger)}`,
      );
    } else {
      console.log(
        `   ⏸️  STATUS: Waiting for ${dayNames[schedule.cronDay]} ${releaseTimeStr} PST`,
      );
      console.log(
        `   📅 Next trigger: ${triggerDayName} ${format(nextTrigger, "dd-MMM-yyyy")} at ${format(nextTrigger, "h:mm a")} PST`,
      );
      console.log(
        `   ⏳ Time until trigger: ${formatTimeRemaining(timeUntilTrigger)}`,
      );
    }
    console.log("");
  });

  // Show test schedules
  if (testSchedules.length > 0) {
    console.log("─".repeat(75));
    console.log("🧪 TEST SCHEDULES (run manually with 'run' command):");
    console.log("");
    testSchedules.forEach((schedule) => {
      const targetDate = getNextTargetDate(schedule, now);
      console.log(`   • ${schedule.description}`);
      console.log(`     ID: ${schedule.id}`);
      console.log(`     Activity: ${schedule.activity}`);
      console.log(
        `     Target: ${formatBookingDate(targetDate)} @ ${schedule.location} @ ${schedule.time}`,
      );
      console.log("");
    });
  }

  console.log("═".repeat(75));
  console.log("");
  console.log("Commands:");
  console.log("  Start scheduler:  npx ts-node src/scheduler.ts start");
  console.log(
    "  Run now:          npx ts-node src/scheduler.ts run <schedule-id>",
  );
  console.log("  List schedules:   npx ts-node src/scheduler.ts list");
  console.log("");
}

// CLI
const args = process.argv.slice(2);
const command = args[0];

switch (command) {
  case "start":
    startScheduler();
    break;
  case "run":
    const scheduleId = args[1];
    if (!scheduleId) {
      console.error("Usage: npx ts-node src/scheduler.ts run <schedule-id>");
      console.log(
        "Run 'npx ts-node src/scheduler.ts list' to see available schedule IDs",
      );
      process.exit(1);
    }
    runNow(scheduleId).then(() => process.exit(0));
    break;
  case "list":
  default:
    listSchedules();
    break;
}
