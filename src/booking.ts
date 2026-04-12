/**
 * Surrey Activity Booking Automation - Main Booking Engine
 *
 * Automates the booking process for City of Surrey drop-in sports activities.
 */

import { chromium, Browser, Page, BrowserContext } from "playwright";
import {
  BookingParams,
  BookingResult,
  EnvConfig,
  BookingSettings,
  SlotInfo,
  SlotStatus,
} from "./types";
import { BOOKING_URL } from "./config";
import {
  getLogger,
  logStep,
  logSuccess,
  logError,
  logWarning,
  logBookingAttempt,
} from "./logger";
import fs from "fs";
import path from "path";

export class SurreyBookingAutomation {
  private browser: Browser | null = null;
  private context: BrowserContext | null = null;
  private page: Page | null = null;
  private envConfig: EnvConfig;
  private settings: BookingSettings;
  private traceLog: import("./types").TraceEntry[] = [];
  private traceStartTime: number = 0;

  constructor(envConfig: EnvConfig, settings: BookingSettings) {
    this.envConfig = envConfig;
    this.settings = settings;
  }

  private trace(
    type: import("./types").TraceEntry["type"],
    detail: Record<string, unknown>,
  ): void {
    if (!this.envConfig.traceEnabled) return;
    this.traceLog.push({
      timestamp: new Date().toISOString(),
      elapsed: Date.now() - this.traceStartTime,
      type,
      detail,
    });
  }

  /**
   * Initialize browser and login
   */
  async initialize(): Promise<void> {
    const log = getLogger();
    log.info("Initializing browser...");

    const launchOptions: Record<string, unknown> = {
      headless: this.envConfig.headless,
      slowMo: this.envConfig.slowMo,
    };

    // Support system Chromium on ARM (Raspberry Pi)
    if (process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH) {
      launchOptions.executablePath =
        process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH;
      log.info(
        `Using system Chromium: ${process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH}`,
      );
    }

    // Memory-saving Chromium args for low-RAM devices (e.g., Raspberry Pi 3 with 1GB)
    if (process.env.LOW_MEMORY_MODE === "true") {
      launchOptions.args = [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        "--disable-gpu",
        "--disable-software-rasterizer",
        "--disable-extensions",
        "--disable-background-networking",
        "--disable-default-apps",
        "--disable-sync",
        "--disable-translate",
        "--no-first-run",
        "--no-zygote",
        "--single-process",
        "--disable-features=site-per-process",
        "--js-flags=--max-old-space-size=128",
      ];
      log.info("Low-memory mode enabled (Raspberry Pi 3 optimizations)");
    }

    this.browser = await chromium.launch(launchOptions);

    this.context = await this.browser.newContext({
      viewport: { width: 1280, height: 800 },
    });

    this.page = await this.context.newPage();
    this.page.setDefaultTimeout(this.envConfig.actionTimeout);
    this.page.setDefaultNavigationTimeout(this.envConfig.navigationTimeout);

    // Register network trace listeners when trace mode is enabled
    if (this.envConfig.traceEnabled) {
      this.traceStartTime = Date.now();
      this.traceLog = [];
      this.trace("action", { action: "browser_initialized" });

      this.page.on("request", (request) => {
        this.trace("request", {
          method: request.method(),
          url: request.url(),
          resourceType: request.resourceType(),
          headers: request.headers(),
        });
      });

      this.page.on("response", (response) => {
        this.trace("response", {
          status: response.status(),
          url: response.url(),
          statusText: response.statusText(),
          headers: response.headers(),
        });
      });

      this.page.on("framenavigated", (frame) => {
        this.trace("navigation", {
          url: frame.url(),
          name: frame.name(),
          isMain: frame === this.page?.mainFrame(),
        });
      });

      this.page.on("requestfailed", (request) => {
        this.trace("error", {
          url: request.url(),
          method: request.method(),
          failure: request.failure()?.errorText || "unknown",
        });
      });

      log.info("Trace mode ENABLED - capturing all network calls and actions");
    }

    log.info("Browser initialized successfully");
  }

  private getNavigationTimeoutMs(): number {
    return Math.max(this.envConfig.navigationTimeout, 15000);
  }

  private async safeGoto(url: string, context: string): Promise<void> {
    if (!this.page) throw new Error("Browser not initialized");
    const log = getLogger();
    const timeoutMs = this.getNavigationTimeoutMs();
    const maxAttempts = 2;

    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      try {
        await this.page.goto(url, {
          waitUntil: "domcontentloaded",
          timeout: timeoutMs,
        });

        try {
          await this.page.waitForLoadState("networkidle", { timeout: 5000 });
        } catch {
          log.warn(
            `${context}: Network idle wait timed out; continuing with DOM ready.`,
          );
        }

        return;
      } catch (error) {
        log.warn(
          `${context}: Navigation attempt ${attempt}/${maxAttempts} failed: ${(error as Error).message}`,
        );
        if (attempt < maxAttempts) {
          await this.page.waitForTimeout(1000 * attempt);
        } else {
          throw error;
        }
      }
    }
  }

  private async safeReload(context: string): Promise<void> {
    if (!this.page) throw new Error("Browser not initialized");
    const log = getLogger();
    const timeoutMs = this.getNavigationTimeoutMs();

    await this.page.reload({
      waitUntil: "domcontentloaded",
      timeout: timeoutMs,
    });

    try {
      await this.page.waitForLoadState("networkidle", { timeout: 5000 });
    } catch {
      log.warn(
        `${context}: Network idle wait timed out after reload; continuing with DOM ready.`,
      );
    }
  }

  /**
   * Login to Surrey booking system
   */
  async login(): Promise<boolean> {
    const log = getLogger();
    logStep(1, "Logging in to Surrey booking system...");
    this.trace("action", { action: "login_start" });

    if (!this.page) throw new Error("Browser not initialized");

    try {
      // Navigate to booking page
      await this.safeGoto(BOOKING_URL, "Login: open booking page");
      await this.page.waitForTimeout(1000);

      // Check if already logged in by looking for user menu
      const userDisplayName = this.envConfig.email.split("@")[0];
      const userMenu =
        (await this.page.$(`text=${userDisplayName}`)) ||
        (await this.page.$('[class*="user"]')) ||
        (await this.page.$('[class*="account"]')) ||
        (await this.page.$("text=My Account")) ||
        (await this.page.$("text=Sign Out"));
      if (userMenu) {
        logSuccess("Already logged in");
        return true;
      }

      // Click login link - look for the Login menuitem/link
      log.info("Looking for Login link...");
      const loginLink =
        (await this.page.$('a:has-text("Login")')) ||
        (await this.page.$('[role="menuitem"]:has-text("Login")')) ||
        (await this.page.$("text=Login"));

      if (loginLink) {
        await loginLink.click();
        await this.page.waitForTimeout(3000);
      } else {
        log.warn("Login link not found, checking if on login page already...");
      }

      // Wait for Surrey.ca sign-in page
      log.info("Waiting for sign-in form...");

      // The Surrey sign-in uses specific form fields
      // Try to wait for the email input
      await this.page.waitForSelector(
        '#UserName, input[name="UserName"], input[type="email"]',
        { timeout: 15000 },
      );

      // Fill email - Surrey uses #UserName
      log.info("Filling email...");
      const emailField =
        (await this.page.$("#UserName")) ||
        (await this.page.$('input[name="UserName"]')) ||
        (await this.page.$('input[type="email"]'));

      if (emailField) {
        await emailField.fill(this.envConfig.email);
      } else {
        throw new Error("Email field not found");
      }

      // Fill password - Surrey uses #Password
      log.info("Filling password...");
      const passwordField =
        (await this.page.$("#Password")) ||
        (await this.page.$('input[name="Password"]')) ||
        (await this.page.$('input[type="password"]'));

      if (passwordField) {
        await passwordField.fill(this.envConfig.password);
      } else {
        throw new Error("Password field not found");
      }

      // Click sign in button - try multiple approaches
      log.info("Clicking Sign In...");

      // First try: input[type="submit"] with value "Sign In"
      let signInButton = await this.page.$(
        'input[type="submit"][value="Sign In"]',
      );

      if (!signInButton) {
        // Second try: button with text Sign In
        signInButton = await this.page.$('button:has-text("Sign In")');
      }

      if (!signInButton) {
        // Third try: any submit button
        signInButton =
          (await this.page.$('input[type="submit"]')) ||
          (await this.page.$('button[type="submit"]'));
      }

      if (signInButton) {
        // Check if button is visible
        const isVisible = await signInButton.isVisible();
        if (isVisible) {
          await signInButton.click();
        } else {
          // If not visible, try pressing Enter on password field
          log.info("Submit button not visible, pressing Enter...");
          await passwordField?.press("Enter");
        }
      } else {
        // Fallback: press Enter to submit the form
        log.info("No submit button found, pressing Enter to submit...");
        await passwordField?.press("Enter");
      }

      // Wait for redirect back to booking page
      log.info("Waiting for login to complete...");

      // Wait for navigation to settle (Pi 3 can be slow)
      try {
        await this.page.waitForLoadState("domcontentloaded", {
          timeout: this.getNavigationTimeoutMs(),
        });
      } catch {
        log.warn("Load state wait timed out after login, continuing...");
      }
      await this.page.waitForTimeout(3000);

      // Navigate back to booking page if needed
      try {
        if (!this.page.url().includes("BookMe4BookingPages")) {
          log.info("Navigating back to booking page...");
          await this.safeGoto(BOOKING_URL, "Login: return to booking page");
          await this.page.waitForTimeout(3000);
        }
      } catch {
        log.warn("Navigation check failed, navigating to booking page...");
        await this.safeGoto(BOOKING_URL, "Login: return to booking page");
        await this.page.waitForTimeout(3000);
      }

      // Verify login success (retry a few times for slow devices)
      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          // Check for login error messages first
          const errorSelectors = [
            "text=Invalid username or password",
            "text=Account is locked",
            "text=Too many attempts",
            "text=Account has been locked",
            "text=incorrect password",
            ".validation-summary-errors",
            ".error-message",
          ];
          for (const errSel of errorSelectors) {
            const errEl = await this.page.$(errSel);
            if (errEl) {
              const errText = await errEl.textContent().catch(() => errSel);
              logError(`Login failed: ${errText}`);
              return false;
            }
          }

          const loggedInName = this.envConfig.email.split("@")[0];
          const loggedIn = await this.page.$(`text=${loggedInName}`);
          if (loggedIn) {
            logSuccess("Login successful");
            return true;
          }
          // Also check for any logged-in indicator (user menu, account link, etc.)
          const altLoggedIn =
            (await this.page.$('[class*="user"]')) ||
            (await this.page.$('[class*="account"]')) ||
            (await this.page.$("text=My Account")) ||
            (await this.page.$("text=Sign Out"));
          if (altLoggedIn) {
            logSuccess("Login successful (alt check)");
            return true;
          }
        } catch {
          log.warn(`Login verify attempt ${attempt + 1} failed, retrying...`);
        }
        if (attempt < 2) {
          await this.page.waitForTimeout(2000);
        }
      }

      logError("Login verification failed");
      return false;
    } catch (error) {
      logError("Login failed", error as Error);
      await this.takeScreenshot("login-error");
      return false;
    }
  }

  /**
   * Navigate to booking page and apply filters
   */
  async navigateAndFilter(params: BookingParams): Promise<boolean> {
    const log = getLogger();
    logStep(2, "Navigating to booking page and applying filters...");
    this.trace("action", {
      action: "navigate_and_filter_start",
      activity: params.activity,
      date: params.date,
      location: params.location,
    });

    if (!this.page) throw new Error("Browser not initialized");

    try {
      // Navigate to booking page
      await this.safeGoto(BOOKING_URL, "Filters: open booking page");
      await this.page.waitForTimeout(1000);

      // Set service/activity filter FIRST (narrows down results)
      if (params.activity) {
        logStep(2.1, `Setting activity filter to: ${params.activity}`);
        await this.setServiceFilter(params.activity);
      }

      // Wait for filter to apply
      await this.page.waitForTimeout(1000);

      // Set date filter to specific date (both from and to = same date)
      logStep(2.2, `Setting date filter to: ${params.date}`);
      await this.setDateFilter(params.date);

      // Wait for filtered results to load - events will appear automatically
      await this.page.waitForTimeout(1000);

      // Verify events loaded after filters
      try {
        await this.page.waitForSelector(
          'button:has-text("Register"), button:has-text("Waitlist"), button:has-text("More Info")',
          {
            timeout: 2000,
          },
        );
        log.info("Filtered events loaded successfully");
      } catch {
        log.warn(
          "No events found after filtering - may need to verify date/activity",
        );
      }

      logSuccess("Filters applied successfully");
      return true;
    } catch (error) {
      logError("Failed to apply filters", error as Error);
      await this.takeScreenshot("filter-error");
      return false;
    }
  }

  /**
   * Set the date range filter (both from and to dates)
   */
  private async setDateFilter(date: string): Promise<void> {
    if (!this.page) throw new Error("Browser not initialized");
    const log = getLogger();

    try {
      // The date inputs are combobox elements - use Playwright locator with role
      log.info("Setting Date range from...");

      // Try to find and click on the date from field
      const dateFromField = this.page.getByRole("combobox", {
        name: "Date range from",
      });
      if (await dateFromField.isVisible({ timeout: 1000 })) {
        await dateFromField.click();
        await this.page.waitForTimeout(500);
        // Triple-click to select all, then type
        await dateFromField.click({ clickCount: 3 });
        await this.page.keyboard.type(date, { delay: 50 });
        // Press Enter to confirm the date selection
        await this.page.keyboard.press("Enter");
        await this.page.waitForTimeout(1000);
        log.info(`Date range from set to: ${date}`);
      } else {
        log.warn("Date range from field not visible");
      }

      // Set the "Date range to" field (same date for single day filter)
      log.info("Setting Date range to...");
      const dateToField = this.page.getByRole("combobox", {
        name: "Date range to",
      });
      if (await dateToField.isVisible({ timeout: 1000 })) {
        await dateToField.click();
        await this.page.waitForTimeout(500);
        // Triple-click to select all, then type
        await dateToField.click({ clickCount: 3 });
        await this.page.keyboard.type(date, { delay: 50 });
        // Press Enter to confirm and trigger filter
        await this.page.keyboard.press("Enter");
        await this.page.waitForTimeout(1000);
        log.info(`Date range to set to: ${date}`);
      } else {
        log.warn("Date range to field not visible");
      }

      // Press Escape to close any dropdowns and trigger filter (works in both headed/headless)
      await this.page.keyboard.press("Escape");
      await this.page.waitForTimeout(500);

      // Also try clicking on the page heading which is safe in any viewport
      const pageHeading = await this.page.$(
        'h1:has-text("Drop In Sports"), h1, .bm-calendar-title',
      );
      if (pageHeading) {
        await pageHeading.click().catch(() => {});
      }

      // Wait for the page to reload with filtered results
      log.info("Waiting for filtered results to load...");
      await this.page.waitForTimeout(1000);
      log.info(
        "Done Waiting for filtered results to load... Now look for buttons",
      );
      // Try to wait for Register buttons to appear (events loaded)
      try {
        await this.page.waitForSelector(
          'button:has-text("Register"), button:has-text("Waitlist")',
          {
            timeout: 2000,
          },
        );
        log.info("Events loaded after date filter");
      } catch {
        log.warn(
          "No events found after date filter - may need to check if date has events",
        );
      }
    } catch (error) {
      log.warn(`Could not set date filter: ${(error as Error).message}`);
    }
  }

  /**
   * Set the service/activity filter
   */
  private async setServiceFilter(activity: string): Promise<void> {
    if (!this.page) throw new Error("Browser not initialized");
    const log = getLogger();

    try {
      // Click service dropdown listbox to expand it
      log.info("Looking for Service dropdown...");
      const serviceDropdown =
        (await this.page.$('listbox[aria-label="Service"]')) ||
        (await this.page.$('[role="listbox"]:has-text("Service")')) ||
        (await this.page.locator("text=Service").first());

      if (serviceDropdown) {
        await serviceDropdown.click();
        await this.page.waitForTimeout(1500);

        // The Service filter uses checkboxes in a list
        // Look for the checkbox or label with the activity name
        log.info(`Selecting activity: ${activity}`);

        // Try to find and click the checkbox or its label
        const checkboxLabel =
          (await this.page.$(`text="${activity}"`)) ||
          (await this.page.$(`span:has-text("${activity}")`)) ||
          (await this.page.$(`generic:has-text("${activity}")`));

        if (checkboxLabel) {
          await checkboxLabel.click();
          await this.page.waitForTimeout(1000);
          log.info("Activity checkbox clicked");
        } else {
          // Try clicking directly by accessible name
          const checkbox = await this.page
            .locator(`checkbox[name="${activity}"]`)
            .first();
          if (await checkbox.isVisible()) {
            await checkbox.click();
            await this.page.waitForTimeout(1000);
            log.info("Activity checkbox clicked via locator");
          } else {
            log.warn(`Activity checkbox "${activity}" not found`);
          }
        }

        // Click outside to close dropdown and apply filter
        await this.page.keyboard.press("Escape");
        await this.page.waitForTimeout(1000);
        log.info("Activity filter applied");
      } else {
        log.warn("Service dropdown not found");
      }
    } catch (error) {
      log.warn(`Failed to set service filter: ${(error as Error).message}`);
    }
  }

  /**
   * Find and select the target slot
   *
   * HTML Structure (from actual page):
   * - table#classes.bm-classes-grid contains all events
   * - tr.bm-class-row is each event row
   * - div.bm-class-container has the event details
   * - h3.bm-class-title span contains activity name
   * - span[aria-label^="Event time"] has the time
   * - div.location-block span has location
   * - input[type="button"][value="Register"] or [value="Waitlist"] is the action button
   */
  async findAndSelectSlot(params: BookingParams): Promise<SlotInfo> {
    const log = getLogger();
    logStep(3, `Finding slot: ${params.time} at ${params.location}...`);
    this.trace("action", {
      action: "find_slot_start",
      time: params.time,
      location: params.location,
    });

    if (!this.page) throw new Error("Browser not initialized");

    try {
      // Wait for the events table to load
      log.info("Waiting for events table to load...");
      try {
        await this.page.waitForSelector("table#classes tr.bm-class-row", {
          timeout: 15000,
        });
        log.info("Events table loaded");
      } catch {
        // Try alternate selector
        try {
          await this.page.waitForSelector(
            'input[type="button"][value="Register"], input[type="button"][value="Waitlist"]',
            { timeout: 10000 },
          );
          log.info("Register/Waitlist buttons found");
        } catch {
          log.warn("No events found - table may be empty");
        }
      }

      // Additional wait for dynamic content
      await this.page.waitForTimeout(2000);

      // Normalize search parameters
      const targetTime = params.time.toLowerCase().replace(/\s+/g, " ").trim();
      const targetLocation = params.location.toLowerCase();
      const targetActivity = params.activity.toLowerCase();

      log.info(
        `Searching for: activity="${targetActivity}" time="${targetTime}" location="${targetLocation}"`,
      );

      // STEP 1: Find all event rows in table#classes
      log.info("Step 1: Finding event rows in table#classes...");
      const eventRows = await this.page.$$("table#classes tr.bm-class-row");
      log.info(`Found ${eventRows.length} event rows`);

      // STEP 2: Find the matching event row
      log.info("Step 2: Finding matching event...");

      for (let i = 0; i < eventRows.length; i++) {
        const row = eventRows[i];
        const rowText = ((await row.textContent()) || "")
          .toLowerCase()
          .replace(/\s+/g, " ")
          .trim();

        // Skip rows that are too short
        if (rowText.length < 30) continue;

        // Check if this row matches our criteria
        const matchesActivity = rowText.includes(targetActivity);
        const matchesTime = rowText.includes(targetTime);
        const matchesLocation = rowText.includes(targetLocation.split(" ")[0]); // First word of location

        log.info(
          `Row ${i + 1}: activity=${matchesActivity}, time=${matchesTime}, location=${matchesLocation}`,
        );

        if (matchesActivity && matchesTime && matchesLocation) {
          log.info(`✓ Found matching event row ${i + 1}!`);
          log.info(`  Preview: ${rowText.substring(0, 120)}...`);

          // STEP 3: Find and click the Register/Waitlist/More Info button in THIS row
          log.info("Step 3: Finding action button in this row...");

          // Look for input[type="button"] with value="Register", "Waitlist", or "More Info"
          const registerBtn = await row.$(
            'input[type="button"][value="Register"]',
          );
          const waitlistBtn = await row.$(
            'input[type="button"][value="Waitlist"]',
          );
          const moreInfoBtn = await row.$(
            'input[type="button"][value="More Info"]',
          );

          log.info(`  Register button found: ${!!registerBtn}`);
          log.info(`  Waitlist button found: ${!!waitlistBtn}`);
          log.info(`  More Info button found: ${!!moreInfoBtn}`);

          if (registerBtn) {
            const ariaLabel = await registerBtn.getAttribute("aria-label");
            log.info(`  Register button aria-label: "${ariaLabel}"`);

            logSuccess(`Found available slot - clicking Register button`);
            await registerBtn.scrollIntoViewIfNeeded();
            await this.page.waitForTimeout(500);
            await registerBtn.click();
            await this.page.waitForTimeout(2000);
            return { status: "available", buttonRef: "register" };
          }

          if (moreInfoBtn) {
            const ariaLabel = await moreInfoBtn.getAttribute("aria-label");
            log.info(`  More Info button aria-label: "${ariaLabel}"`);

            logSuccess(
              `Found More Info button (before release time) - clicking it`,
            );
            await moreInfoBtn.scrollIntoViewIfNeeded();
            await this.page.waitForTimeout(500);
            await moreInfoBtn.click();
            await this.page.waitForTimeout(2000);
            return { status: "more-info", buttonRef: "more-info" };
          }

          if (waitlistBtn) {
            const ariaLabel = await waitlistBtn.getAttribute("aria-label");
            log.info(`  Waitlist button aria-label: "${ariaLabel}"`);

            if (params.preferWaitlist) {
              logWarning(`Slot full - clicking Waitlist button`);
              await waitlistBtn.scrollIntoViewIfNeeded();
              await this.page.waitForTimeout(500);
              await waitlistBtn.click();
              await this.page.waitForTimeout(2000);
              return { status: "waitlist", buttonRef: "waitlist" };
            }
            logWarning(`Slot is full, waitlist available but not preferred`);
            return { status: "waitlist" };
          }

          log.warn("Matching row found but no Register/Waitlist button inside");
        }
      }

      // If no rows found, log diagnostic info
      if (eventRows.length === 0) {
        log.warn("No event rows found. Taking screenshot for debugging.");
        log.info("Checking if there are any input buttons on page...");
        const allInputButtons = await this.page.$$('input[type="button"]');
        log.info(`Total input buttons on page: ${allInputButtons.length}`);
      }

      logError(
        `Slot not found: ${params.activity} at ${params.time} - ${params.location}`,
      );
      await this.takeScreenshot("slot-not-found");
      return { status: "not-found" };
    } catch (error) {
      logError("Error finding slot", error as Error);
      await this.takeScreenshot("slot-search-error");
      return { status: "not-found" };
    }
  }

  /**
   * Complete the registration process (3-step flow)
   * Flow: Event Details -> Step 1: Attendees -> Step 2: Fees & Extras -> Step 3: Payment/Cart
   */
  async completeRegistration(): Promise<boolean> {
    const log = getLogger();
    logStep(4, "Completing registration...");
    this.trace("action", { action: "registration_start" });

    if (!this.page) throw new Error("Browser not initialized");

    // 5-minute hold timer starts when we enter registration.
    // We must keep trying until this expires — NEVER give up early.
    const HOLD_DURATION_MS = 5 * 60 * 1000; // 5 minutes
    const holdStartTime = Date.now();
    const holdDeadline = holdStartTime + HOLD_DURATION_MS;

    const isHoldActive = () => Date.now() < holdDeadline;
    const holdRemaining = () =>
      Math.max(0, Math.round((holdDeadline - Date.now()) / 1000));

    try {
      // Wait for page to load
      await this.page.waitForTimeout(3000);

      // Check if we're on event details page (need to click Register link)
      const eventPageRegister = await this.page.$(
        'a[href*="BookMe4EventParticipants"]:has-text("Register")',
      );
      if (eventPageRegister) {
        log.info("On event details page, clicking Register link...");
        await eventPageRegister.click();
        await this.page.waitForTimeout(3000);
      }

      // STEP 1: Attendees - User should be pre-selected
      logStep(4.1, "Step 1: Confirming attendee selection...");

      // Wait for attendee selection page - look for the heading
      try {
        await this.page.waitForSelector("text=Who would you like to book", {
          timeout: 10000,
        });
        log.info("Attendee selection page loaded");
      } catch {
        log.info(
          "Attendee prompt not found, checking if already past this step",
        );
      }

      // Verify attendee checkbox is checked (should be auto-selected for logged-in user)
      // Check for "Already Registered" which means user is already booked for this slot
      const alreadyRegistered = await this.page.$("text=Already Registered");
      if (alreadyRegistered) {
        log.info("User is already registered for this slot — nothing to book");
        await this.takeScreenshot("already-registered");
        return true; // Already booked = success
      }

      const attendeeCheckbox = await this.page.$('input[type="checkbox"]');
      if (attendeeCheckbox) {
        const isChecked = await attendeeCheckbox.isChecked();
        if (!isChecked) {
          // Check if checkbox is enabled before clicking
          const isDisabled = await attendeeCheckbox
            .isDisabled()
            .catch(() => false);
          if (isDisabled) {
            log.warn("Attendee checkbox is disabled — cannot select");
            await this.takeScreenshot("attendee-checkbox-disabled");
            return false;
          }
          log.info("Checking attendee checkbox...");
          await attendeeCheckbox.click({ timeout: 5000 });
          await this.page.waitForTimeout(500);
        } else {
          log.info("Attendee already selected");
        }
      }

      // Click Next link to proceed to Fees & Extras
      log.info("Clicking Next to proceed to Fees & Extras...");

      const navTimeout = this.getNavigationTimeoutMs();
      const nextLink1 = this.page.getByRole("link", { name: "Next" });
      if (await nextLink1.isVisible({ timeout: 5000 })) {
        await Promise.all([
          this.page.waitForNavigation({
            timeout: navTimeout,
            waitUntil: "domcontentloaded",
          }),
          nextLink1.click({ timeout: navTimeout }),
        ]);
        await this.page.waitForLoadState("networkidle").catch(() => {});
        await this.page.waitForTimeout(1000);
      }

      // STEP 2: Fees & Extras - Select fee option (Rec Surrey Pass = Free is usually auto-selected)
      logStep(4.2, "Step 2: Selecting fee option...");

      // Wait for fees page
      try {
        await this.page.waitForSelector("text=Select a FEE to pay", {
          timeout: 10000,
        });
        log.info("Fees & Extras page loaded");
      } catch {
        log.info("Fees page heading not found, may be on different step");
      }

      // Check if "Rec Surrey Pass" (Free) radio is already selected
      const recPassRadio = await this.page.$('input[type="radio"]:checked');
      if (recPassRadio) {
        log.info("Fee option already selected");
      } else {
        // Try to select Rec Surrey Pass option
        const recPassOption = await this.page.$("text=Rec Surrey Pass");
        if (recPassOption) {
          await recPassOption.click();
          await this.page.waitForTimeout(500);
          log.info("Selected Rec Surrey Pass option");
        }
      }

      // Click Next link to proceed to Payment/Cart
      log.info("Clicking Next to proceed to Payment...");
      const nextLink2 = this.page.getByRole("link", { name: "Next" });
      if (await nextLink2.isVisible({ timeout: 5000 })) {
        await Promise.all([
          this.page.waitForNavigation({
            timeout: navTimeout,
            waitUntil: "domcontentloaded",
          }),
          nextLink2.click({ timeout: navTimeout }),
        ]);
        await this.page.waitForLoadState("networkidle").catch(() => {});
      }

      // STEP 3: Payment/Cart - Place Order
      // CRITICAL: The spot is held for 5 minutes. We MUST keep retrying
      // within that window — never give up until the hold expires.
      logStep(4.3, "Step 3: Placing order...");
      this.trace("action", { action: "place_order_start" });

      let orderPlaced = false;
      let bookingConfirmed = false;
      let placeOrderAttempt = 0;

      while (isHoldActive() && !bookingConfirmed) {
        placeOrderAttempt++;
        log.info(
          `Place Order attempt ${placeOrderAttempt} (hold time remaining: ${holdRemaining()}s)...`,
        );

        // ── FIND & CLICK Place Order button ──
        if (!orderPlaced) {
          // Search in iframes first (proven path — button is always in cross-origin iframe)
          log.info("Searching for Place Order button in payment iframe...");
          const iframeSearchStart = Date.now();
          const iframeTimeout = Math.min(
            60000,
            holdDeadline - Date.now() - 5000,
          ); // Leave 5s buffer

          while (
            Date.now() - iframeSearchStart < iframeTimeout &&
            !orderPlaced
          ) {
            const iframes = await this.page.$$("iframe");
            for (const iframe of iframes) {
              try {
                const frame = await iframe.contentFrame();
                if (!frame) continue;
                try {
                  await frame.waitForSelector(
                    'button:has-text("Place My Order"), button:has-text("Place Order")',
                    { state: "visible", timeout: 3000 },
                  );
                  const iframeBtn = await frame.$(
                    'button:has-text("Place My Order"), button:has-text("Place Order")',
                  );
                  if (iframeBtn) {
                    const isDisabled = await iframeBtn
                      .isDisabled()
                      .catch(() => false);
                    if (isDisabled) {
                      log.warn(
                        "Place Order button DISABLED — waiting for it to enable...",
                      );
                      this.trace("action", {
                        action: "button_disabled",
                        elapsed: Date.now() - iframeSearchStart,
                      });
                      continue;
                    }
                    const elapsed = Date.now() - iframeSearchStart;
                    log.info(
                      `Found Place Order button in iframe (${elapsed}ms)`,
                    );
                    this.trace("iframe", {
                      action: "button_found_in_iframe",
                      elapsed,
                    });
                    await this.takeScreenshot("before-place-order");
                    await iframeBtn.click();
                    orderPlaced = true;
                    break;
                  }
                } catch {
                  // Button not in this iframe yet
                }
              } catch {
                // Skip inaccessible frames
              }
            }
            if (orderPlaced) break;
            await this.page.waitForTimeout(1000);
          }

          // Fallback: check main page
          if (!orderPlaced) {
            log.info("Button not in iframes, checking main page...");
            const mainPageSelectors = [
              'button:has-text("Place My Order")',
              'input[type="button"][value*="Place"], input[type="submit"][value*="Place"]',
              'a:has-text("Place My Order"), a:has-text("Place Order")',
            ];
            for (const selector of mainPageSelectors) {
              const btn = await this.page.$(selector);
              if (btn && (await btn.isVisible())) {
                log.info(`Found Place Order on main page: ${selector}`);
                this.trace("action", {
                  action: "button_found_main_page",
                  selector,
                });
                await btn.click();
                orderPlaced = true;
                break;
              }
            }
          }

          // Last resort: role-based search
          if (!orderPlaced) {
            try {
              const placeOrderByRole = this.page.getByRole("button", {
                name: /place.*order/i,
              });
              if (await placeOrderByRole.isVisible({ timeout: 3000 })) {
                log.info("Found Place Order button by role");
                await placeOrderByRole.click();
                orderPlaced = true;
              }
            } catch {
              log.info("Place Order button not found by role");
            }
          }

          if (!orderPlaced) {
            log.warn(
              `Place Order button not found on attempt ${placeOrderAttempt} (hold: ${holdRemaining()}s remaining)`,
            );
            this.trace("error", {
              action: "place_order_button_not_found",
              attempt: placeOrderAttempt,
              holdRemaining: holdRemaining(),
            });
            await this.takeScreenshot(
              `place-order-not-found-attempt-${placeOrderAttempt}`,
            );

            if (isHoldActive()) {
              log.info("Refreshing page and retrying within hold window...");
              try {
                await this.page.reload({
                  waitUntil: "domcontentloaded",
                  timeout: 15000,
                });
                await this.page.waitForLoadState("networkidle").catch(() => {});
              } catch {
                log.warn("Page refresh failed, continuing anyway...");
              }
              await this.page.waitForTimeout(2000);
              continue; // Retry from top of while loop
            }
          }
        }

        // ── WAIT FOR POST-CLICK PROCESSING ──
        if (orderPlaced) {
          // Wait for navigation to ThankYou page
          try {
            await this.page.waitForLoadState("domcontentloaded", {
              timeout: 15000,
            });
          } catch {
            log.warn(
              "Page load after Place Order timed out, checking anyway...",
            );
          }

          // Wait for processing spinner
          try {
            const processingSpinner = await this.page.$(
              "text=Processing transaction",
            );
            if (processingSpinner) {
              log.info("Processing transaction in progress, waiting...");
              const spinnerTimeout = Math.min(30000, holdDeadline - Date.now());
              await this.page
                .waitForSelector("text=Processing transaction", {
                  state: "hidden",
                  timeout: spinnerTimeout,
                })
                .catch(() => log.warn("Processing spinner did not disappear"));
            }
          } catch {
            // No spinner found, fine
          }
          await this.page.waitForTimeout(3000);

          // ── CHECK FOR SERVER ERRORS ──
          const errorMsg = await this.page.$(
            "text=An unexpected error occurred",
          );
          if (errorMsg) {
            log.warn(
              `Server error on attempt ${placeOrderAttempt} (hold: ${holdRemaining()}s remaining) — retrying...`,
            );
            await this.takeScreenshot(
              `place-order-error-attempt-${placeOrderAttempt}`,
            );
            orderPlaced = false; // Reset so we re-find and re-click the button
            await this.page.waitForTimeout(2000);

            if (isHoldActive()) {
              continue; // Retry from top of while loop
            }
          }

          // ── CHECK FOR SUCCESS ──
          const successIndicators = [
            "text=Thank you",
            "text=thank you",
            "text=Booking Confirmed",
            "text=Registration Complete",
            "text=was booked",
            "text=confirmation has been sent",
            "text=successfully registered",
            'h1:has-text("Thank")',
            ".confirmation-message",
            '[class*="success"]',
          ];

          for (const selector of successIndicators) {
            const element = await this.page.$(selector);
            if (element) {
              logSuccess("Registration completed successfully!");
              this.trace("action", {
                action: "booking_confirmed",
                indicator: selector,
              });
              await this.takeScreenshot("booking-success");
              bookingConfirmed = true;
              break;
            }
          }

          if (bookingConfirmed) break;

          // Order was clicked but no confirmation and no error — could be slow.
          // Keep waiting within the hold window.
          if (isHoldActive()) {
            log.info(
              `No confirmation yet, rechecking... (hold: ${holdRemaining()}s remaining)`,
            );
            await this.page.waitForTimeout(3000);
            continue;
          }
        }

        // If hold has expired and nothing worked, break
        if (!isHoldActive()) break;
      }

      // ── FINAL RESULT ──
      if (bookingConfirmed) {
        return true;
      }

      if (orderPlaced) {
        logWarning(
          "Order placed but could not verify confirmation within hold window - assuming success",
        );
        await this.takeScreenshot("booking-unverified");
        return true;
      }

      logError(
        `Could not place order — hold window expired after ${Math.round((Date.now() - holdStartTime) / 1000)}s`,
      );
      await this.takeScreenshot("hold-expired-no-order");
      return false;
    } catch (error) {
      logError("Registration failed", error as Error);
      await this.takeScreenshot("registration-error");
      return false;
    }
  }

  /**
   * PHASE 1: Prepare for booking (login, navigate, find slot, click register)
   * This is executed during the 2-minute buffer before release time
   */
  async prepareForBooking(params: BookingParams): Promise<{
    success: boolean;
    slotInfo?: SlotInfo;
    message: string;
  }> {
    const log = getLogger();
    log.info("═".repeat(60));
    log.info("🚀 PHASE 1: Preparing for booking (during buffer time)");
    log.info("═".repeat(60));

    try {
      // Initialize browser
      await this.initialize();

      // Login
      const loginSuccess = await this.login();
      if (!loginSuccess) {
        return { success: false, message: "Login failed" };
      }

      // Navigate and filter
      const filterSuccess = await this.navigateAndFilter(params);
      if (!filterSuccess) {
        return { success: false, message: "Failed to apply filters" };
      }

      // Find and select slot (clicks Register button)
      const slotInfo = await this.findAndSelectSlot(params);

      if (slotInfo.status === "not-found") {
        return { success: false, message: "Slot not found" };
      }

      if (slotInfo.status === "full" && !params.preferWaitlist) {
        return { success: false, message: "Slot is full" };
      }

      log.info("✅ Phase 1 complete: Ready at registration page");
      return { success: true, slotInfo, message: "Ready for booking" };
    } catch (error) {
      logError("Phase 1 failed", error as Error);
      return { success: false, message: (error as Error).message };
    }
  }

  /**
   * PHASE 2: Wait until release time, refresh, and complete registration
   */
  async waitAndCompleteBooking(
    releaseHour: number,
    releaseMinute: number,
  ): Promise<boolean> {
    const log = getLogger();
    if (!this.page) throw new Error("Browser not initialized");

    log.info("═".repeat(60));
    log.info("⏰ PHASE 2: Waiting for release time, then completing booking");
    log.info("═".repeat(60));

    // Wait until release time
    await this.waitUntilReleaseTime(releaseHour, releaseMinute);

    // Refresh and find Register button (with retry using response interception)
    let registerFound = false;
    const maxRetries = 6;
    const registerSelector =
      'input[type="button"][value="Register"], button:has-text("Register")';
    const registerLinkSelector =
      'a[href*="BookMe4EventParticipants"]:has-text("Register")';

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      log.info(
        `🔄 Refresh attempt ${attempt}/${maxRetries} - looking for Register button...`,
      );

      try {
        // Use response interception instead of timeout-based waitUntil.
        // We listen for the document (HTML) response from the server, which
        // tells us the page data has arrived — no guessing with networkidle.
        const responsePromise = this.page.waitForResponse(
          (resp) =>
            resp.url().includes(this.page!.url().split("?")[0]) &&
            resp.status() === 200 &&
            (resp.request().resourceType() === "document" ||
              resp.headers()["content-type"]?.includes("text/html")),
          { timeout: 20000 },
        );

        // Kick off the reload without waiting for any load state
        this.page.reload().catch(() => {
          /* reload promise rejection handled via responsePromise timeout */
        });

        // Wait for the server to respond with the HTML document
        const response = await responsePromise;
        log.info(
          `📡 Attempt ${attempt}: Server responded with status ${response.status()}`,
        );

        // Now wait for DOM to be ready (HTML is parsed)
        await this.page.waitForLoadState("domcontentloaded", {
          timeout: 10000,
        });
      } catch (interceptErr) {
        log.warn(
          `Attempt ${attempt}: Response intercept/DOM failed: ${(interceptErr as Error).message}`,
        );
        // Fall back: just wait a bit and check the DOM anyway
        await this.page.waitForTimeout(2000);
      }

      // Small pause for any client-side JS rendering
      await this.page.waitForTimeout(500);

      // Look for Register button or link
      const registerBtn = await this.page.$(registerSelector);
      const registerLink = await this.page.$(registerLinkSelector);

      if (registerBtn || registerLink) {
        log.info(`✅ Register button/link found on attempt ${attempt}!`);

        if (registerLink) {
          log.info("Clicking Register link...");
          await registerLink.click();
          await this.page.waitForTimeout(2000);
        } else if (registerBtn) {
          log.info("Clicking Register button...");
          await registerBtn.click();
          await this.page.waitForTimeout(2000);
        }

        registerFound = true;
        break;
      } else {
        log.warn(`Register button not found on attempt ${attempt}`);
        if (attempt < maxRetries) {
          const delay = attempt <= 2 ? 1000 : 2000;
          log.info(`Waiting ${delay}ms before retry...`);
          await this.page.waitForTimeout(delay);
        }
      }
    }

    if (!registerFound) {
      logError("Register button not found after all refresh attempts");
      await this.takeScreenshot("register-button-not-found");
      return false;
    }

    // Complete registration
    const success = await this.completeRegistration();

    return success;
  }

  /**
   * Wait until the exact release time
   */
  private async waitUntilReleaseTime(
    releaseHour: number,
    releaseMinute: number,
  ): Promise<void> {
    const log = getLogger();
    const TIMEZONE = "America/Vancouver";
    const { toZonedTime } = require("date-fns-tz");

    const getNowPST = () => toZonedTime(new Date(), TIMEZONE);

    log.info("═".repeat(50));
    log.info(
      `⏰ Waiting for release time ${releaseHour}:${releaseMinute.toString().padStart(2, "0")} PST`,
    );
    log.info("═".repeat(50));

    while (true) {
      const now = getNowPST();
      const currentHour = now.getHours();
      const currentMinute = now.getMinutes();
      const currentSecond = now.getSeconds();

      // Check if we've reached or passed release time
      if (
        currentHour > releaseHour ||
        (currentHour === releaseHour && currentMinute >= releaseMinute)
      ) {
        log.info(
          `🚀 Release time reached! Current PST: ${currentHour}:${currentMinute.toString().padStart(2, "0")}:${currentSecond.toString().padStart(2, "0")}`,
        );
        break;
      }

      // Calculate time remaining
      const releaseDate = getNowPST();
      releaseDate.setHours(releaseHour, releaseMinute, 0, 0);
      const msRemaining = releaseDate.getTime() - now.getTime();
      const secRemaining = Math.ceil(msRemaining / 1000);

      log.info(
        `   ⏳ Waiting at registration page... ${Math.floor(secRemaining / 60)}m ${secRemaining % 60}s until ${releaseHour}:${releaseMinute.toString().padStart(2, "0")} PST`,
      );

      // Adaptive polling: 5s when >30s away, 1s when 5-30s, 100ms when <5s
      let waitTime: number;
      if (msRemaining > 30000) {
        waitTime = 5000;
      } else if (msRemaining > 5000) {
        waitTime = 1000;
      } else {
        waitTime = 100;
      }
      await new Promise((resolve) =>
        setTimeout(resolve, Math.max(waitTime, 100)),
      );
    }
  }

  /**
   * Fallback: attempt to join the waitlist after a failed booking.
   * Navigates back to the listing, finds the slot, and clicks the Waitlist button.
   */
  private async attemptWaitlistFallback(
    params: BookingParams,
  ): Promise<boolean> {
    const log = getLogger();
    log.info("═".repeat(60));
    log.info(
      "🔄 WAITLIST FALLBACK: Booking failed — attempting to join waitlist...",
    );
    log.info("═".repeat(60));
    this.trace("action", { action: "waitlist_fallback_start" });

    try {
      // Navigate back to the booking listings page
      await this.safeGoto(BOOKING_URL, "Waitlist fallback: return to listings");
      await this.page!.waitForTimeout(2000);

      // Re-apply filters
      const filterSuccess = await this.navigateAndFilter(params);
      if (!filterSuccess) {
        log.warn("Waitlist fallback: could not re-apply filters");
        return false;
      }

      // Find the slot — but this time force waitlist mode
      const waitlistParams = { ...params, preferWaitlist: true };
      const slotInfo = await this.findAndSelectSlot(waitlistParams);

      if (slotInfo.status === "waitlist") {
        log.info(
          "Waitlist button clicked — completing waitlist registration...",
        );
        const success = await this.completeRegistration();
        if (success) {
          logSuccess("Successfully joined the WAITLIST!");
          this.trace("action", { action: "waitlist_fallback_success" });
          return true;
        }
      } else if (slotInfo.status === "available") {
        // Slot became available again — complete the booking!
        log.info("Slot is available again — completing booking...");
        const success = await this.completeRegistration();
        if (success) {
          logSuccess("Booking completed on waitlist fallback attempt!");
          this.trace("action", { action: "waitlist_fallback_booked" });
          return true;
        }
      } else {
        log.warn(
          `Waitlist fallback: slot status is "${slotInfo.status}" — cannot join waitlist`,
        );
      }

      await this.takeScreenshot("waitlist-fallback-failed");
      return false;
    } catch (error) {
      logError("Waitlist fallback failed", error as Error);
      await this.takeScreenshot("waitlist-fallback-error");
      return false;
    }
  }

  /**
   * Main phased booking method - for scheduled bookings with buffer time
   */
  async bookWithPhases(
    params: BookingParams,
    releaseHour: number,
    releaseMinute: number,
  ): Promise<BookingResult> {
    logBookingAttempt(params);

    const result: BookingResult = {
      success: false,
      activity: params.activity,
      date: params.date,
      time: params.time,
      location: params.location,
      message: "",
      timestamp: new Date(),
    };

    try {
      // Phase 1: Prepare (login, navigate, click register)
      const prepareResult = await this.prepareForBooking(params);

      if (!prepareResult.success) {
        result.message = prepareResult.message;
        result.error = `Phase 1 failed: ${prepareResult.message}`;
        return result;
      }

      // Phase 2: Wait and complete
      const registrationSuccess = await this.waitAndCompleteBooking(
        releaseHour,
        releaseMinute,
      );

      if (registrationSuccess) {
        result.success = true;
        result.waitlisted = prepareResult.slotInfo?.status === "waitlist";
        result.message =
          prepareResult.slotInfo?.status === "waitlist"
            ? "Successfully added to waitlist"
            : "Booking completed successfully";
      } else {
        // Registration failed — try joining the waitlist as fallback
        const waitlistSuccess = await this.attemptWaitlistFallback(params);
        if (waitlistSuccess) {
          result.success = true;
          result.waitlisted = true;
          result.message = "Booking failed but successfully joined waitlist";
        } else {
          result.message =
            "Registration failed and waitlist fallback also failed";
          result.error =
            "Could not complete the registration or join the waitlist";
        }
      }

      return result;
    } catch (error) {
      result.message = "Booking failed";
      result.error = (error as Error).message;
      logError("Booking failed", error as Error);

      // Even on crash, try waitlist as last resort
      try {
        if (this.page) {
          const waitlistSuccess = await this.attemptWaitlistFallback(params);
          if (waitlistSuccess) {
            result.success = true;
            result.waitlisted = true;
            result.message = "Booking crashed but successfully joined waitlist";
            return result;
          }
        }
      } catch {
        logError("Waitlist fallback also crashed");
      }

      return result;
    } finally {
      await this.cleanup();
    }
  }

  /**
   * Main booking method - orchestrates the entire booking flow
   */
  async book(params: BookingParams): Promise<BookingResult> {
    logBookingAttempt(params);

    const result: BookingResult = {
      success: false,
      activity: params.activity,
      date: params.date,
      time: params.time,
      location: params.location,
      message: "",
      timestamp: new Date(),
    };

    try {
      // Initialize browser
      await this.initialize();

      // Login
      const loginSuccess = await this.login();
      if (!loginSuccess) {
        result.message = "Login failed";
        result.error = "Could not login to Surrey booking system";
        return result;
      }

      // Navigate and filter
      const filterSuccess = await this.navigateAndFilter(params);
      if (!filterSuccess) {
        result.message = "Failed to apply filters";
        result.error = "Could not navigate to booking page or apply filters";
        return result;
      }

      // Find and select slot
      const slotInfo = await this.findAndSelectSlot(params);

      if (slotInfo.status === "not-found") {
        result.message = "Slot not found";
        result.error = `Could not find slot for ${params.activity} at ${params.time} - ${params.location}`;
        return result;
      }

      if (slotInfo.status === "full" && !params.preferWaitlist) {
        // Slot is full — automatically try waitlist as fallback
        logWarning("Slot is full — automatically attempting waitlist...");
        const waitlistParams = { ...params, preferWaitlist: true };
        const wlSlotInfo = await this.findAndSelectSlot(waitlistParams);
        if (wlSlotInfo.status === "waitlist") {
          const success = await this.completeRegistration();
          if (success) {
            result.success = true;
            result.waitlisted = true;
            result.message = "Slot was full — successfully joined waitlist";
            return result;
          }
        }
        result.message = "Slot is full and could not join waitlist";
        result.error = "The requested slot is full";
        return result;
      }

      // Complete registration
      const registrationSuccess = await this.completeRegistration();

      if (registrationSuccess) {
        result.success = true;
        result.waitlisted = slotInfo.status === "waitlist";
        result.message =
          slotInfo.status === "waitlist"
            ? "Successfully added to waitlist"
            : "Booking completed successfully";
      } else {
        // Registration failed — try joining the waitlist as fallback
        const waitlistSuccess = await this.attemptWaitlistFallback(params);
        if (waitlistSuccess) {
          result.success = true;
          result.waitlisted = true;
          result.message = "Booking failed but successfully joined waitlist";
        } else {
          result.message =
            "Registration failed and waitlist fallback also failed";
          result.error =
            "Could not complete the registration or join the waitlist";
        }
      }

      return result;
    } catch (error) {
      result.message = "Booking failed";
      result.error = (error as Error).message;
      logError("Booking failed", error as Error);

      // Even on crash, try waitlist as last resort
      try {
        if (this.page) {
          const waitlistSuccess = await this.attemptWaitlistFallback(params);
          if (waitlistSuccess) {
            result.success = true;
            result.waitlisted = true;
            result.message = "Booking crashed but successfully joined waitlist";
            return result;
          }
        }
      } catch {
        logError("Waitlist fallback also crashed");
      }

      return result;
    } finally {
      await this.cleanup();
    }
  }

  /**
   * Take a screenshot for debugging
   */
  private async takeScreenshot(name: string): Promise<void> {
    if (!this.page || !this.settings.screenshotOnError) return;

    try {
      const screenshotDir = this.settings.screenshotDir;
      if (!fs.existsSync(screenshotDir)) {
        fs.mkdirSync(screenshotDir, { recursive: true });
      }

      const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
      const filename = `${name}-${timestamp}.png`;
      await this.page.screenshot({
        path: path.join(screenshotDir, filename),
        fullPage: true,
      });

      getLogger().info(`Screenshot saved: ${filename}`);
      this.trace("screenshot", { name, filename });
    } catch (error) {
      getLogger().warn(
        `Failed to take screenshot: ${(error as Error).message}`,
      );
    }
  }

  /**
   * Save trace log to JSON file
   */
  private saveTrace(): void {
    if (!this.envConfig.traceEnabled || this.traceLog.length === 0) return;
    const log = getLogger();
    try {
      const traceDir = this.envConfig.logDir || "./logs";
      if (!fs.existsSync(traceDir)) {
        fs.mkdirSync(traceDir, { recursive: true });
      }
      const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
      const filename = `trace-${timestamp}.json`;
      const filePath = path.join(traceDir, filename);

      // Build summary stats
      const requests = this.traceLog.filter((e) => e.type === "request");
      const responses = this.traceLog.filter((e) => e.type === "response");
      const errors = this.traceLog.filter((e) => e.type === "error");
      const actions = this.traceLog.filter((e) => e.type === "action");
      const navigations = this.traceLog.filter((e) => e.type === "navigation");

      const summary = {
        totalEntries: this.traceLog.length,
        totalRequests: requests.length,
        totalResponses: responses.length,
        failedRequests: errors.length,
        actions: actions.length,
        navigations: navigations.length,
        durationMs:
          this.traceLog.length > 0
            ? this.traceLog[this.traceLog.length - 1].elapsed
            : 0,
        responseStatusCounts: responses.reduce(
          (acc, r) => {
            const status = String(r.detail.status);
            acc[status] = (acc[status] || 0) + 1;
            return acc;
          },
          {} as Record<string, number>,
        ),
        uniqueDomains: [
          ...new Set(
            requests.map((r) => {
              try {
                return new URL(String(r.detail.url)).hostname;
              } catch {
                return "unknown";
              }
            }),
          ),
        ],
      };

      const traceOutput = { summary, entries: this.traceLog };
      fs.writeFileSync(filePath, JSON.stringify(traceOutput, null, 2));
      log.info(
        `Trace saved: ${filename} (${this.traceLog.length} entries, ${summary.durationMs}ms)`,
      );
    } catch (error) {
      log.warn(`Failed to save trace: ${(error as Error).message}`);
    }
  }

  /**
   * Cleanup browser resources
   */
  async cleanup(): Promise<void> {
    const log = getLogger();

    // Save trace before closing browser
    this.saveTrace();

    log.info("Cleaning up browser resources...");

    if (this.page) {
      await this.page.close().catch(() => {});
    }
    if (this.context) {
      await this.context.close().catch(() => {});
    }
    if (this.browser) {
      await this.browser.close().catch(() => {});
    }

    this.page = null;
    this.context = null;
    this.browser = null;

    log.info("Cleanup complete");
  }
}

export default SurreyBookingAutomation;
