#!/usr/bin/env node
/**
 * Surrey Activity Booking CLI
 *
 * Command-line interface for booking Surrey drop-in sports activities.
 *
 * Usage:
 *   npm run book -- --activity "Drop In Basketball - Adult" --date "31-Jan-2026" --time "08:15 am" --location "Guildford Recreation Centre"
 *   npm run book:all
 */

import { Command } from "commander";
import { SurreyBookingAutomation } from "./booking";
import {
  loadEnvConfig,
  loadBookingConfig,
  validateBookingParams,
} from "./config";
import { initializeLogger, getLogger, logSuccess, logError } from "./logger";
import { BookingParams, BookingResult } from "./types";

const program = new Command();

program
  .name("surrey-booking")
  .description("Automated booking for City of Surrey drop-in sports activities")
  .version("1.0.0");

/**
 * Book a single activity
 */
program
  .command("book")
  .description("Book a single activity")
  .requiredOption(
    "-a, --activity <activity>",
    'Activity name (e.g., "Drop In Basketball - Adult")',
  )
  .requiredOption(
    "-d, --date <date>",
    'Date in DD-MMM-YYYY format (e.g., "31-Jan-2026")',
  )
  .requiredOption(
    "-t, --time <time>",
    'Time in HH:MM am/pm format (e.g., "08:15 am")',
  )
  .requiredOption("-l, --location <location>", "Recreation centre name")
  .option("-w, --waitlist", "Join waitlist if slot is full", false)
  .option("--headless", "Run browser in headless mode")
  .action(async (options) => {
    const envConfig = loadEnvConfig();

    // Override headless from CLI if provided
    if (options.headless !== undefined) {
      envConfig.headless = options.headless;
    }

    // Initialize logger
    initializeLogger(envConfig.logLevel, envConfig.logToFile, envConfig.logDir);
    const log = getLogger();

    const params: BookingParams = {
      activity: options.activity,
      date: options.date,
      time: options.time,
      location: options.location,
      preferWaitlist: options.waitlist,
    };

    // Validate parameters
    const errors = validateBookingParams(params);
    if (errors.length > 0) {
      log.error("Invalid parameters:");
      errors.forEach((e) => log.error(`  - ${e}`));
      process.exit(1);
    }

    // Load settings from config
    const bookingConfig = loadBookingConfig();

    // Create booking automation
    const automation = new SurreyBookingAutomation(
      envConfig,
      bookingConfig.settings,
    );

    try {
      const result = await automation.book(params);
      printResult(result);
      process.exit(result.success ? 0 : 1);
    } catch (error) {
      logError("Booking failed", error as Error);
      process.exit(1);
    }
  });

/**
 * Book all activities from config file
 */
program
  .command("book-all")
  .description("Book all enabled activities from config file")
  .option("-c, --config <path>", "Path to config file", "bookings.config.json")
  .option("--headless", "Run browser in headless mode")
  .action(async (options) => {
    const envConfig = loadEnvConfig();

    if (options.headless !== undefined) {
      envConfig.headless = options.headless;
    }

    initializeLogger(envConfig.logLevel, envConfig.logToFile, envConfig.logDir);
    const log = getLogger();

    let bookingConfig;
    try {
      bookingConfig = loadBookingConfig(options.config);
    } catch (error) {
      logError("Failed to load config", error as Error);
      process.exit(1);
    }

    const enabledBookings = bookingConfig.bookings.filter(
      (b) => b.enabled !== false,
    );

    if (enabledBookings.length === 0) {
      log.warn("No enabled bookings found in config");
      process.exit(0);
    }

    log.info(`Found ${enabledBookings.length} booking(s) to process`);
    log.info("═".repeat(60));

    const results: BookingResult[] = [];

    for (const booking of enabledBookings) {
      // Validate each booking
      const errors = validateBookingParams(booking);
      if (errors.length > 0) {
        log.error(
          `Skipping booking "${booking.id || booking.activity}": Invalid parameters`,
        );
        errors.forEach((e) => log.error(`  - ${e}`));
        results.push({
          success: false,
          activity: booking.activity,
          date: booking.date,
          time: booking.time,
          location: booking.location,
          message: "Invalid parameters",
          error: errors.join(", "),
          timestamp: new Date(),
        });
        continue;
      }

      const automation = new SurreyBookingAutomation(
        envConfig,
        bookingConfig.settings,
      );

      try {
        const result = await automation.book(booking);
        results.push(result);
      } catch (error) {
        results.push({
          success: false,
          activity: booking.activity,
          date: booking.date,
          time: booking.time,
          location: booking.location,
          message: "Booking failed",
          error: (error as Error).message,
          timestamp: new Date(),
        });
      }

      // Wait between bookings
      if (enabledBookings.indexOf(booking) < enabledBookings.length - 1) {
        log.info("Waiting 5 seconds before next booking...");
        await new Promise((resolve) => setTimeout(resolve, 5000));
      }
    }

    // Print summary
    printSummary(results);

    const allSuccess = results.every((r) => r.success);
    process.exit(allSuccess ? 0 : 1);
  });

/**
 * Test login functionality
 */
program
  .command("test-login")
  .description("Test login to Surrey booking system")
  .action(async () => {
    const envConfig = loadEnvConfig();
    initializeLogger(envConfig.logLevel, envConfig.logToFile, envConfig.logDir);
    const log = getLogger();

    log.info("Testing login...");

    const bookingConfig = loadBookingConfig();
    const automation = new SurreyBookingAutomation(
      envConfig,
      bookingConfig.settings,
    );

    try {
      await automation.initialize();
      const success = await automation.login();

      if (success) {
        logSuccess("Login test passed!");
        process.exit(0);
      } else {
        logError("Login test failed");
        process.exit(1);
      }
    } catch (error) {
      logError("Login test error", error as Error);
      process.exit(1);
    } finally {
      await automation.cleanup();
    }
  });

/**
 * List available activities
 */
program
  .command("list-activities")
  .description("List available activities and locations")
  .action(() => {
    console.log("\n📋 Available Activities:");
    console.log("─".repeat(50));
    const activities = [
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
    ];
    activities.forEach((a) => console.log(`  • ${a}`));

    console.log("\n📍 Recreation Centres:");
    console.log("─".repeat(50));
    const locations = [
      "Bridgeview Community Centre",
      "Chuck Bailey Recreation Centre",
      "Clayton Community Centre",
      "Cloverdale Recreation Centre",
      "Fleetwood Community Centre",
      "Fraser Heights Recreation Centre",
      "Guildford Recreation Centre",
      "Newton Recreation Centre - Wave Pool",
      "South Surrey Recreation & Arts Centre",
    ];
    locations.forEach((l) => console.log(`  • ${l}`));
    console.log();
  });

/**
 * Print a single booking result
 */
function printResult(result: BookingResult): void {
  const log = getLogger();

  console.log("\n" + "═".repeat(60));
  console.log("BOOKING RESULT");
  console.log("═".repeat(60));
  console.log(`  Activity:  ${result.activity}`);
  console.log(`  Date:      ${result.date}`);
  console.log(`  Time:      ${result.time}`);
  console.log(`  Location:  ${result.location}`);
  console.log(`  Status:    ${result.success ? "✅ SUCCESS" : "❌ FAILED"}`);
  if (result.waitlisted) {
    console.log(`  Note:      Added to waitlist`);
  }
  console.log(`  Message:   ${result.message}`);
  if (result.error) {
    console.log(`  Error:     ${result.error}`);
  }
  console.log("═".repeat(60) + "\n");
}

/**
 * Print summary of multiple bookings
 */
function printSummary(results: BookingResult[]): void {
  const successful = results.filter((r) => r.success).length;
  const failed = results.filter((r) => !r.success).length;
  const waitlisted = results.filter((r) => r.waitlisted).length;

  console.log("\n" + "═".repeat(60));
  console.log("BOOKING SUMMARY");
  console.log("═".repeat(60));
  console.log(`  Total:      ${results.length}`);
  console.log(`  Successful: ${successful} ✅`);
  console.log(`  Waitlisted: ${waitlisted} ⏳`);
  console.log(`  Failed:     ${failed} ❌`);
  console.log("─".repeat(60));

  results.forEach((result, index) => {
    const status = result.success
      ? result.waitlisted
        ? "⏳ WAITLIST"
        : "✅ SUCCESS"
      : "❌ FAILED";
    console.log(`  ${index + 1}. ${result.activity}`);
    console.log(`     ${result.date} ${result.time} @ ${result.location}`);
    console.log(`     Status: ${status}`);
    if (result.error) {
      console.log(`     Error: ${result.error}`);
    }
  });

  console.log("═".repeat(60) + "\n");
}

// Parse command line arguments
program.parse();
