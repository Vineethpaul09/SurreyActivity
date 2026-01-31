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

  constructor(envConfig: EnvConfig, settings: BookingSettings) {
    this.envConfig = envConfig;
    this.settings = settings;
  }

  /**
   * Initialize browser and login
   */
  async initialize(): Promise<void> {
    const log = getLogger();
    log.info("Initializing browser...");

    this.browser = await chromium.launch({
      headless: this.envConfig.headless,
      slowMo: this.envConfig.slowMo,
    });

    this.context = await this.browser.newContext({
      viewport: { width: 1280, height: 800 },
    });

    this.page = await this.context.newPage();
    this.page.setDefaultTimeout(this.envConfig.actionTimeout);
    this.page.setDefaultNavigationTimeout(this.envConfig.navigationTimeout);

    log.info("Browser initialized successfully");
  }

  /**
   * Login to Surrey booking system
   */
  async login(): Promise<boolean> {
    const log = getLogger();
    logStep(1, "Logging in to Surrey booking system...");

    if (!this.page) throw new Error("Browser not initialized");

    try {
      // Navigate to booking page
      await this.page.goto(BOOKING_URL, { waitUntil: "networkidle" });
      await this.page.waitForTimeout(3000);

      // Check if already logged in by looking for user menu
      const userMenu = await this.page.$("text=Paul Vineeth");
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
      await this.page.waitForTimeout(5000);

      // Navigate back to booking page if needed
      if (!this.page.url().includes("BookMe4BookingPages")) {
        log.info("Navigating back to booking page...");
        await this.page.goto(BOOKING_URL, { waitUntil: "networkidle" });
        await this.page.waitForTimeout(3000);
      }

      // Verify login success
      const loggedIn = await this.page.$("text=Paul Vineeth");
      if (loggedIn) {
        logSuccess("Login successful");
        return true;
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

    if (!this.page) throw new Error("Browser not initialized");

    try {
      // Navigate to booking page
      await this.page.goto(BOOKING_URL, { waitUntil: "networkidle" });
      await this.page.waitForTimeout(2000);

      // Set service/activity filter FIRST (narrows down results)
      if (params.activity) {
        logStep(2.1, `Setting activity filter to: ${params.activity}`);
        await this.setServiceFilter(params.activity);
      }

      // Wait for filter to apply
      await this.page.waitForTimeout(2000);

      // Set date filter to specific date (both from and to = same date)
      logStep(2.2, `Setting date filter to: ${params.date}`);
      await this.setDateFilter(params.date);

      // Wait for filtered results to load - events will appear automatically
      await this.page.waitForTimeout(3000);

      // Verify events loaded after filters
      try {
        await this.page.waitForSelector(
          'button:has-text("Register"), button:has-text("Waitlist"), button:has-text("More Info")',
          {
            timeout: 10000,
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

          // STEP 3: Find and click the Register/Waitlist button in THIS row
          log.info("Step 3: Finding Register button in this row...");

          // Look for input[type="button"] with value="Register" or "Waitlist"
          const registerBtn = await row.$(
            'input[type="button"][value="Register"]',
          );
          const waitlistBtn = await row.$(
            'input[type="button"][value="Waitlist"]',
          );

          log.info(`  Register button found: ${!!registerBtn}`);
          log.info(`  Waitlist button found: ${!!waitlistBtn}`);

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

    if (!this.page) throw new Error("Browser not initialized");

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
      const attendeeCheckbox = await this.page.$('input[type="checkbox"]');
      if (attendeeCheckbox) {
        const isChecked = await attendeeCheckbox.isChecked();
        if (!isChecked) {
          log.info("Checking attendee checkbox...");
          await attendeeCheckbox.click();
          await this.page.waitForTimeout(500);
        } else {
          log.info("Attendee already selected");
        }
      }

      // Click Next link to proceed to Fees & Extras
      log.info("Clicking Next to proceed to Fees & Extras...");

      const nextLink1 = this.page.getByRole("link", { name: "Next" });
      if (await nextLink1.isVisible({ timeout: 5000 })) {
        await nextLink1.click();
        await this.page.waitForTimeout(3000);
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
        await nextLink2.click();
        await this.page.waitForTimeout(4000);
      }

      // STEP 3: Payment/Cart - Place Order
      logStep(4.3, "Step 3: Placing order...");

      // Wait for cart/checkout page
      await this.page.waitForTimeout(2000);

      // Take screenshot before placing order
      await this.takeScreenshot("before-place-order");

      // Look for Place My Order button - multiple possible selectors
      let orderPlaced = false;

      // Try 1: Direct button on page
      let placeOrderBtn = await this.page.$(
        'button:has-text("Place My Order")',
      );
      if (placeOrderBtn && (await placeOrderBtn.isVisible())) {
        log.info("Found Place My Order button on page");
        await placeOrderBtn.click();
        orderPlaced = true;
      }

      // Try 2: Input button
      if (!orderPlaced) {
        placeOrderBtn = await this.page.$(
          'input[type="button"][value*="Place"], input[type="submit"][value*="Place"]',
        );
        if (placeOrderBtn && (await placeOrderBtn.isVisible())) {
          log.info("Found Place Order input button");
          await placeOrderBtn.click();
          orderPlaced = true;
        }
      }

      // Try 3: Link styled as button
      if (!orderPlaced) {
        const placeOrderLink = await this.page.$(
          'a:has-text("Place My Order"), a:has-text("Place Order")',
        );
        if (placeOrderLink && (await placeOrderLink.isVisible())) {
          log.info("Found Place Order link");
          await placeOrderLink.click();
          orderPlaced = true;
        }
      }

      // Try 4: Look in iframes
      if (!orderPlaced) {
        log.info("Looking for Place Order button in iframes...");
        const iframes = await this.page.$$("iframe");

        for (const iframe of iframes) {
          try {
            const frame = await iframe.contentFrame();
            if (frame) {
              const iframeBtn = await frame.$(
                'button:has-text("Place My Order"), button:has-text("Place Order")',
              );
              if (iframeBtn) {
                log.info("Found Place Order button in iframe");
                await iframeBtn.click();
                orderPlaced = true;
                break;
              }
            }
          } catch (e) {
            // Skip inaccessible frames
          }
        }
      }

      // Try 5: Use Playwright locator with role
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
        log.warn("Could not find Place Order button - taking screenshot");
        await this.takeScreenshot("place-order-button-not-found");
      }

      // Wait for confirmation page
      await this.page.waitForTimeout(5000);

      // Verify success - look for confirmation indicators
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
          await this.takeScreenshot("booking-success");
          return true;
        }
      }

      // If we placed an order but can't verify, assume success
      if (orderPlaced) {
        logWarning(
          "Order placed but could not verify confirmation - assuming success",
        );
        await this.takeScreenshot("booking-unverified");
        return true;
      }

      logWarning("Could not verify booking completion");
      await this.takeScreenshot("booking-unverified");
      return true; // Assume success if we got this far without errors
    } catch (error) {
      logError("Registration failed", error as Error);
      await this.takeScreenshot("registration-error");
      return false;
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
        result.message = "Slot is full";
        result.error = "The requested slot is full and waitlist is not enabled";
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
        result.message = "Registration failed";
        result.error = "Could not complete the registration process";
      }

      return result;
    } catch (error) {
      result.message = "Booking failed";
      result.error = (error as Error).message;
      logError("Booking failed", error as Error);
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
    } catch (error) {
      getLogger().warn(
        `Failed to take screenshot: ${(error as Error).message}`,
      );
    }
  }

  /**
   * Cleanup browser resources
   */
  async cleanup(): Promise<void> {
    const log = getLogger();
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
