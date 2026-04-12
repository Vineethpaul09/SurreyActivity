#!/usr/bin/env node
/**
 * Surrey Activity Booking Scheduler
 *
 * Runs scheduled cron jobs to automatically book Badminton Adult activities.
 * Starts 2 minutes before release time and polls/refreshes until Register button appears.
 *
 * Priority: Fraser Heights > Cloverdale > Guildford
 *
 * Schedule:
 * 🥇 Fraser Heights (Priority 1):
 *   - Sunday 6:15 PM → Book Wednesday 6:15 PM @ Fraser Heights
 *   - Wednesday 10:00 AM → Book Saturday 10:00 AM @ Fraser Heights
 *   - Thursday 10:00 AM → Book Sunday 10:00 AM @ Fraser Heights
 *
 * 🥈 Cloverdale (Priority 2):
 *   - Friday 6:30 PM → Book Monday 6:30 PM @ Cloverdale
 *   - Wednesday 7:45 PM → Book Wednesday 7:45 PM @ Cloverdale (same day)
 *   - Tuesday 6:30 PM → Book Friday 6:30 PM @ Cloverdale
 *   - Wednesday 9:15 AM → Book Wednesday 9:15 AM @ Cloverdale (same day)
 *
 * 🥉 Guildford (Priority 3):
 *   - Saturday 7:00 PM → Book Tuesday 7:00 PM @ Guildford
 *   - Monday 7:00 PM → Book Thursday 7:00 PM @ Guildford
 *   - Wednesday 6:00 PM → Book Saturday 6:00 PM @ Guildford
 *   - Thursday 8:30 AM → Book Sunday 8:30 AM @ Guildford
 *   - Thursday 2:00 PM → Book Sunday 2:00 PM @ Guildford
 */

import cron from "node-cron";
import {
  format,
  nextMonday,
  nextTuesday,
  nextWednesday,
  nextThursday,
  nextFriday,
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
import {
  initializeLogger,
  getLogger,
  logSuccess,
  logError,
  cleanupOldScreenshots,
  cleanupOldLogs,
} from "./logger";
import { SurreyBookingAutomation } from "./booking";
import { BookingParams } from "./types";
import {
  preventSleep,
  allowSleep,
  isSleepPrevented,
  setupSleepCleanup,
} from "./sleep-prevention";

// How many minutes before a booking to prevent sleep
const SLEEP_PREVENTION_WINDOW_MS = 10 * 60 * 1000;
// Max time after release to attempt recovery for missed bookings
const MISSED_BOOKING_RECOVERY_MS = 15 * 60 * 1000;
// Whether a booking is currently in progress (prevents disabling sleep)
let bookingInProgress = false;
// Real wall-clock time of last interval check (for sleep gap detection)
let lastCheckRealTime = Date.now();

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
  CHUCK_BAILEY: "Chuck Bailey Recreation Centre",
  CLAYTON: "Clayton Community Centre",
  COYOTE_CREEK: "Coyote Creek Elementary School",
  PRINCESS_MARGARET: "Princess Margaret Secondary School",
  SOUTH_SURREY: "South Surrey Recreation & Arts Centre",
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
  // 🥇 PRIORITY 1: Fraser Heights
  {
    id: "sunday-wednesday-fraser-badminton",
    activity: ACTIVITY,
    cronExpression: "13 18 * * 0", // Sunday at 6:13 PM (2 min before 6:15 PM release)
    cronDay: 0, // Sunday
    releaseHour: 18,
    releaseMinute: 15,
    targetDay: (d) => nextWednesday(d),
    location: LOCATIONS.FRASER_HEIGHTS,
    time: "6:15 pm",
    description: "Sunday 6:15 PM → Book Wednesday 6:15 PM @ Fraser Heights",
  },
  {
    id: "wednesday-saturday-fraser-badminton",
    activity: ACTIVITY,
    cronExpression: "58 9 * * 3", // Wednesday at 9:58 AM (2 min before 10:00 AM release)
    cronDay: 3, // Wednesday
    releaseHour: 10,
    releaseMinute: 0,
    targetDay: (d) => nextSaturday(d),
    location: LOCATIONS.FRASER_HEIGHTS,
    time: "10:00 am",
    description: "Wednesday 10:00 AM → Book Saturday 10:00 AM @ Fraser Heights",
  },
  {
    id: "thursday-sunday-fraser-badminton",
    activity: ACTIVITY,
    cronExpression: "58 9 * * 4", // Thursday at 9:58 AM (2 min before 10:00 AM release)
    cronDay: 4, // Thursday
    releaseHour: 10,
    releaseMinute: 0,
    targetDay: (d) => nextSunday(d),
    location: LOCATIONS.FRASER_HEIGHTS,
    time: "10:00 am",
    description: "Thursday 10:00 AM → Book Sunday 10:00 AM @ Fraser Heights",
  },

  // 🥈 PRIORITY 2: Cloverdale
  {
    id: "friday-monday-cloverdale-badminton",
    activity: ACTIVITY,
    cronExpression: "28 18 * * 5", // Friday at 6:28 PM (2 min before 6:30 PM release)
    cronDay: 5, // Friday
    releaseHour: 18,
    releaseMinute: 30,
    targetDay: (d) => nextMonday(d),
    location: LOCATIONS.CLOVERDALE,
    time: "6:30 pm",
    description: "Friday 6:30 PM → Book Monday 6:30 PM @ Cloverdale",
  },
  {
    id: "wednesday-wednesday-cloverdale-badminton-evening",
    activity: ACTIVITY,
    cronExpression: "43 19 * * 3", // Wednesday at 7:43 PM (2 min before 7:45 PM release)
    cronDay: 3, // Wednesday
    releaseHour: 19,
    releaseMinute: 45,
    targetDay: (d) => nextWednesday(d),
    location: LOCATIONS.CLOVERDALE,
    time: "7:45 pm",
    description: "Wednesday 7:45 PM → Book Wednesday 7:45 PM @ Cloverdale",
  },
  {
    id: "tuesday-friday-cloverdale-badminton",
    activity: ACTIVITY,
    cronExpression: "28 18 * * 2", // Tuesday at 6:28 PM (2 min before 6:30 PM release)
    cronDay: 2, // Tuesday
    releaseHour: 18,
    releaseMinute: 30,
    targetDay: (d) => addDays(nextWednesday(d), 2), // Next Friday
    location: LOCATIONS.CLOVERDALE,
    time: "6:30 pm",
    description: "Tuesday 6:30 PM → Book Friday 6:30 PM @ Cloverdale",
  },
  {
    id: "wednesday-wednesday-cloverdale-badminton-morning",
    activity: ACTIVITY,
    cronExpression: "13 9 * * 3", // Wednesday at 9:13 AM (2 min before 9:15 AM release)
    cronDay: 3, // Wednesday
    releaseHour: 9,
    releaseMinute: 15,
    targetDay: (d) => nextWednesday(d),
    location: LOCATIONS.CLOVERDALE,
    time: "9:15 am",
    description: "Wednesday 9:15 AM → Book Wednesday 9:15 AM @ Cloverdale",
  },

  // 🥉 PRIORITY 3: Guildford
  {
    id: "saturday-tuesday-guildford-badminton",
    activity: ACTIVITY,
    cronExpression: "58 18 * * 6", // Saturday at 6:58 PM (2 min before 7:00 PM release)
    cronDay: 6, // Saturday
    releaseHour: 19,
    releaseMinute: 0,
    targetDay: (d) => nextTuesday(d),
    location: LOCATIONS.GUILDFORD,
    time: "7:00 pm",
    description: "Saturday 7:00 PM → Book Tuesday 7:00 PM @ Guildford",
  },
  {
    id: "monday-thursday-guildford-badminton",
    activity: ACTIVITY,
    cronExpression: "58 18 * * 1", // Monday at 6:58 PM (2 min before 7:00 PM release)
    cronDay: 1, // Monday
    releaseHour: 19,
    releaseMinute: 0,
    targetDay: (d) => nextThursday(d),
    location: LOCATIONS.GUILDFORD,
    time: "7:00 pm",
    description: "Monday 7:00 PM → Book Thursday 7:00 PM @ Guildford",
  },
  {
    id: "wednesday-saturday-guildford-badminton-evening",
    activity: ACTIVITY,
    cronExpression: "58 17 * * 3", // Wednesday at 5:58 PM (2 min before 6:00 PM release)
    cronDay: 3, // Wednesday
    releaseHour: 18,
    releaseMinute: 0,
    targetDay: (d) => nextSaturday(d),
    location: LOCATIONS.GUILDFORD,
    time: "6:00 pm",
    description: "Wednesday 6:00 PM → Book Saturday 6:00 PM @ Guildford",
  },
  {
    id: "thursday-sunday-guildford-badminton-morning",
    activity: ACTIVITY,
    cronExpression: "28 8 * * 4", // Thursday at 8:28 AM (2 min before 8:30 AM release)
    cronDay: 4, // Thursday
    releaseHour: 8,
    releaseMinute: 30,
    targetDay: (d) => nextSunday(d),
    location: LOCATIONS.GUILDFORD,
    time: "8:30 am",
    description: "Thursday 8:30 AM → Book Sunday 8:30 AM @ Guildford",
  },
  {
    id: "thursday-sunday-guildford-badminton-afternoon",
    activity: ACTIVITY,
    cronExpression: "58 13 * * 4", // Thursday at 1:58 PM (2 min before 2:00 PM release)
    cronDay: 4, // Thursday
    releaseHour: 14,
    releaseMinute: 0,
    targetDay: (d) => nextSunday(d),
    location: LOCATIONS.GUILDFORD,
    time: "2:00 pm",
    description: "Thursday 2:00 PM → Book Sunday 2:00 PM @ Guildford",
  },

  // ⚪ PRIORITY 4: Other Locations
  {
    id: "saturday-tuesday-chuck-bailey-badminton",
    activity: ACTIVITY,
    cronExpression: "28 18 * * 6", // Saturday at 6:28 PM (2 min before 6:30 PM release)
    cronDay: 6, // Saturday
    releaseHour: 18,
    releaseMinute: 30,
    targetDay: (d) => nextTuesday(d),
    location: LOCATIONS.CHUCK_BAILEY,
    time: "6:30 pm",
    description: "Saturday 6:30 PM → Book Tuesday 6:30 PM @ Chuck Bailey",
  },
  {
    id: "saturday-friday-chuck-bailey-badminton-morning",
    activity: ACTIVITY,
    cronExpression: "58 10 * * 6", // Saturday at 10:58 AM (2 min before 11:00 AM release)
    cronDay: 6, // Saturday
    releaseHour: 11,
    releaseMinute: 0,
    targetDay: (d) => nextFriday(d),
    location: LOCATIONS.CHUCK_BAILEY,
    time: "11:00 am",
    description: "Saturday 11:00 AM → Book Friday 11:00 AM @ Chuck Bailey",
  },
  {
    id: "monday-thursday-clayton-badminton",
    activity: ACTIVITY,
    cronExpression: "28 17 * * 1", // Monday at 5:28 PM (2 min before 5:30 PM release)
    cronDay: 1, // Monday
    releaseHour: 17,
    releaseMinute: 30,
    targetDay: (d) => nextThursday(d),
    location: LOCATIONS.CLAYTON,
    time: "5:30 pm",
    description: "Monday 5:30 PM → Book Thursday 5:30 PM @ Clayton",
  },
  {
    id: "thursday-sunday-clayton-badminton-morning",
    activity: ACTIVITY,
    cronExpression: "43 10 * * 4", // Thursday at 10:43 AM (2 min before 10:45 AM release)
    cronDay: 4, // Thursday
    releaseHour: 10,
    releaseMinute: 45,
    targetDay: (d) => nextSunday(d),
    location: LOCATIONS.CLAYTON,
    time: "10:45 am",
    description: "Thursday 10:45 AM → Book Sunday 10:45 AM @ Clayton",
  },
  {
    id: "monday-thursday-princess-margaret-badminton",
    activity: ACTIVITY,
    cronExpression: "28 19 * * 1", // Monday at 7:28 PM (2 min before 7:30 PM release)
    cronDay: 1, // Monday
    releaseHour: 19,
    releaseMinute: 30,
    targetDay: (d) => nextThursday(d),
    location: LOCATIONS.PRINCESS_MARGARET,
    time: "7:30 pm",
    description: "Monday 7:30 PM → Book Thursday 7:30 PM @ Princess Margaret",
  },
  {
    id: "saturday-tuesday-princess-margaret-badminton",
    activity: ACTIVITY,
    cronExpression: "28 19 * * 6", // Saturday at 7:28 PM (2 min before 7:30 PM release)
    cronDay: 6, // Saturday
    releaseHour: 19,
    releaseMinute: 30,
    targetDay: (d) => nextTuesday(d),
    location: LOCATIONS.PRINCESS_MARGARET,
    time: "7:30 pm",
    description: "Saturday 7:30 PM → Book Tuesday 7:30 PM @ Princess Margaret",
  },
  {
    id: "monday-thursday-coyote-creek-badminton",
    activity: ACTIVITY,
    cronExpression: "13 20 * * 1", // Monday at 8:13 PM (2 min before 8:15 PM release)
    cronDay: 1, // Monday
    releaseHour: 20,
    releaseMinute: 15,
    targetDay: (d) => nextThursday(d),
    location: LOCATIONS.COYOTE_CREEK,
    time: "8:15 pm",
    description: "Monday 8:15 PM → Book Thursday 8:15 PM @ Coyote Creek",
  },
  {
    id: "saturday-tuesday-coyote-creek-badminton",
    activity: ACTIVITY,
    cronExpression: "13 20 * * 6", // Saturday at 8:13 PM (2 min before 8:15 PM release)
    cronDay: 6, // Saturday
    releaseHour: 20,
    releaseMinute: 15,
    targetDay: (d) => nextTuesday(d),
    location: LOCATIONS.COYOTE_CREEK,
    time: "8:15 pm",
    description: "Saturday 8:15 PM → Book Tuesday 8:15 PM @ Coyote Creek",
  },
  {
    id: "saturday-tuesday-south-surrey-badminton",
    activity: ACTIVITY,
    cronExpression: "13 19 * * 6", // Saturday at 7:13 PM (2 min before 7:15 PM release)
    cronDay: 6, // Saturday
    releaseHour: 19,
    releaseMinute: 15,
    targetDay: (d) => nextTuesday(d),
    location: LOCATIONS.SOUTH_SURREY,
    time: "7:15 pm",
    description: "Saturday 7:15 PM → Book Tuesday 7:15 PM @ South Surrey",
  },
  {
    id: "tuesday-friday-south-surrey-badminton",
    activity: ACTIVITY,
    cronExpression: "28 17 * * 2", // Tuesday at 5:28 PM (2 min before 5:30 PM release)
    cronDay: 2, // Tuesday
    releaseHour: 17,
    releaseMinute: 30,
    targetDay: (d) => nextFriday(d),
    location: LOCATIONS.SOUTH_SURREY,
    time: "5:30 pm",
    description: "Tuesday 5:30 PM → Book Friday 5:30 PM @ South Surrey",
  },

  // ============ BASKETBALL SCHEDULES ============
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

  // Ensure system stays awake during the entire booking process
  bookingInProgress = true;
  if (!isSleepPrevented()) {
    log.info("🛡️ Preventing sleep for active booking...");
    preventSleep();
  }

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
  } finally {
    bookingInProgress = false;

    // Release sleep prevention if no upcoming booking within the window
    const nowAfter = getNowPST();
    if (
      !hasUpcomingBooking(nowAfter, SLEEP_PREVENTION_WINDOW_MS) &&
      isSleepPrevented()
    ) {
      allowSleep();
    }
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

  // Set up sleep prevention cleanup on exit
  setupSleepCleanup();

  // Clean up old logs and screenshots (>30 days) on startup
  const bookingConfig = loadBookingConfig();
  cleanupOldLogs(envConfig.logDir, 30);
  cleanupOldScreenshots(bookingConfig.settings.screenshotDir, 30);

  // Schedule daily cleanup at midnight PST
  cron.schedule(
    "0 0 * * *",
    () => {
      log.info("Running daily cleanup...");
      cleanupOldLogs(envConfig.logDir, 30);
      cleanupOldScreenshots(bookingConfig.settings.screenshotDir, 30);
    },
    { timezone: TIMEZONE },
  );

  // Check if sleep prevention is needed right away
  manageSleepPrevention(getNowPST());

  // Update status, manage sleep, and detect missed bookings every 30 seconds
  setInterval(async () => {
    const realTimeNow = Date.now();
    const sleepGapMs = realTimeNow - lastCheckRealTime;
    lastCheckRealTime = realTimeNow;

    const now = getNowPST();

    // Detect sleep/suspend gap (expected ~30s; if >90s we likely slept)
    if (sleepGapMs > 90_000) {
      log.info(
        `⚡ System WAKE detected! (gap: ${Math.round(sleepGapMs / 1000)}s, expected ~30s)`,
      );
      await handleMissedBookings(now, sleepGapMs);
    }

    // Manage sleep prevention based on upcoming bookings
    manageSleepPrevention(now);

    displayNextScheduleStatus(log, dayNames);
  }, 30_000);
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
 * Check if any booking is upcoming within the given time window.
 */
function hasUpcomingBooking(now: Date, withinMs: number): boolean {
  for (const schedule of SCHEDULES) {
    if (schedule.testOnly) continue;
    const nextTrigger = getNextCronTrigger(schedule, now);
    const timeUntil = nextTrigger.getTime() - now.getTime();
    if (timeUntil > 0 && timeUntil <= withinMs) {
      return true;
    }
  }
  return false;
}

/**
 * Enable or disable sleep prevention based on proximity to the next booking.
 * - Prevents sleep if a booking is within SLEEP_PREVENTION_WINDOW_MS (10 min)
 * - Allows sleep if no booking is near and no booking is in progress
 */
function manageSleepPrevention(now: Date): void {
  // Never touch sleep state while a booking is actively running
  if (bookingInProgress) return;

  const upcoming = hasUpcomingBooking(now, SLEEP_PREVENTION_WINDOW_MS);

  if (upcoming && !isSleepPrevented()) {
    const log = getLogger();
    log.info(
      "🛡️ Booking window approaching (< 10 min) — preventing system sleep",
    );
    preventSleep();
  } else if (!upcoming && isSleepPrevented()) {
    allowSleep();
  }
}

/**
 * Detect and recover from missed bookings after the system wakes from sleep.
 * Checks if any cron triggers fell within the sleep gap and attempts recovery
 * if the booking's release time was within the last 15 minutes.
 */
async function handleMissedBookings(
  now: Date,
  sleepGapMs: number,
): Promise<void> {
  const log = getLogger();
  const sleepStartMs = now.getTime() - sleepGapMs;

  const missedSchedules: ScheduleConfig[] = [];

  for (const schedule of SCHEDULES) {
    if (schedule.testOnly) continue;

    const currentDay = getDay(now);
    if (currentDay !== schedule.cronDay) continue;

    // Parse cron expression to get the exact fire time today
    const cronParts = schedule.cronExpression.split(" ");
    const cronMin = parseInt(cronParts[0], 10);
    const cronHour = parseInt(cronParts[1], 10);

    const cronFireTime = setMinutes(setHours(now, cronHour), cronMin);
    const cronFireMs = cronFireTime.getTime();

    // Was this cron supposed to fire during the sleep gap?
    if (cronFireMs >= sleepStartMs && cronFireMs <= now.getTime()) {
      const releaseTime = setMinutes(
        setHours(now, schedule.releaseHour),
        schedule.releaseMinute,
      );
      const timeSinceRelease = now.getTime() - releaseTime.getTime();

      if (
        timeSinceRelease >= 0 &&
        timeSinceRelease <= MISSED_BOOKING_RECOVERY_MS
      ) {
        missedSchedules.push(schedule);
        log.warn(
          `🔄 MISSED: ${schedule.description} (release was ${Math.round(timeSinceRelease / 60000)} min ago — within recovery window)`,
        );
      } else if (timeSinceRelease > MISSED_BOOKING_RECOVERY_MS) {
        log.warn(
          `⏰ TOO LATE to recover: ${schedule.description} (release was ${Math.round(timeSinceRelease / 60000)} min ago, max: ${MISSED_BOOKING_RECOVERY_MS / 60000} min)`,
        );
      }
    }
  }

  // Execute missed bookings sequentially
  for (const schedule of missedSchedules) {
    log.info(`🚨 RECOVERY ATTEMPT: ${schedule.description}`);
    log.info(
      "   If browser opens (headed mode), you can manually complete the booking if automation fails.",
    );
    await executeBooking(schedule);
  }

  if (missedSchedules.length === 0) {
    log.info("   No bookings were missed during sleep.");
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
