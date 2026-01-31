# Surrey Activity Booking Automation - Complete System Documentation

## Table of Contents

1. [Overview](#overview)
2. [System Architecture](#system-architecture)
3. [Booking Rules & Constraints](#booking-rules--constraints)
4. [Schedule Configuration](#schedule-configuration)
5. [How the Booking Process Works](#how-the-booking-process-works)
6. [File Structure](#file-structure)
7. [Configuration Files](#configuration-files)
8. [Commands Reference](#commands-reference)
9. [Deployment (Railway)](#deployment-railway)
10. [Troubleshooting](#troubleshooting)

---

## Overview

This system automates booking drop-in sports activities (Badminton, Pickleball, Basketball) at City of Surrey recreation centres through their online booking portal.

### Why Automation is Needed

- Surrey releases booking slots **3 days in advance** at specific times
- Popular slots (especially morning Badminton) fill up within **seconds**
- Manual booking is nearly impossible due to competition

### What This System Does

1. **Schedules cron jobs** to trigger 2 minutes before release time
2. **Waits** until the exact release moment
3. **Automatically books** the desired slot using Playwright browser automation
4. **Logs results** for tracking

---

## System Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        SCHEDULER (scheduler.ts)                  │
│  - Runs 24/7 on Railway                                         │
│  - node-cron manages scheduled jobs                              │
│  - All times in PST (America/Vancouver)                          │
└─────────────────────────────────────────────────────────────────┘
                              │
                              │ Triggers 2 min before release
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                    WAIT FOR RELEASE TIME                         │
│  - Polls every 5 seconds                                         │
│  - Waits until exact release hour:minute                         │
└─────────────────────────────────────────────────────────────────┘
                              │
                              │ Release time reached!
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                  BOOKING AUTOMATION (booking.ts)                 │
│  1. Launch browser (headless on Railway)                         │
│  2. Navigate to booking URL                                      │
│  3. Login with credentials                                       │
│  4. Apply filters (Activity, Date, Location)                     │
│  5. Find and click target time slot                              │
│  6. Complete registration                                        │
│  7. Confirm booking                                              │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                         RESULT                                   │
│  ✅ SUCCESS: Booking confirmed                                   │
│  ⚠️  WAITLIST: Added to waitlist (if preferWaitlist=true)        │
│  ❌ FAILED: Slot unavailable or error                            │
└─────────────────────────────────────────────────────────────────┘
```

---

## Booking Rules & Constraints

### 🕐 Release Time Rules (City of Surrey)

Slots are released **3 days in advance** at these times:

| Day to Book | Release Day | Release Time (PST) |
| ----------- | ----------- | ------------------ |
| Monday      | Friday      | 6:15 PM            |
| Tuesday     | Saturday    | 6:30 PM            |
| Wednesday   | Sunday      | 6:15 PM            |
| Thursday    | Monday      | 7:00 PM            |
| Friday      | Tuesday     | 6:15 PM            |
| Saturday    | Wednesday   | 10:00 AM           |
| Sunday      | Thursday    | 10:00 AM           |

### 📍 Available Locations

| Code           | Full Name                        |
| -------------- | -------------------------------- |
| CLOVERDALE     | Cloverdale Recreation Centre     |
| GUILDFORD      | Guildford Recreation Centre      |
| FRASER_HEIGHTS | Fraser Heights Recreation Centre |

### 🏸 Activities

- `Drop In Badminton - Adult`
- `Drop In Pickleball - Adult`
- `Drop In Basketball - Adult`
- (and more available on the Surrey portal)

### ⚠️ Important Constraints

1. **Speed is critical** - slots fill in seconds after release
2. **One booking per person per activity per day** - can't double-book
3. **Must be logged in** - credentials required
4. **Fee selection** - must select "Rec Surrey Pass" or other fee type
5. **Headless mode required** on servers (no display)

---

## Schedule Configuration

### Current Active Schedules

| ID                                         | Activity   | Trigger     | Release  | Books For | Location       | Time    |
| ------------------------------------------ | ---------- | ----------- | -------- | --------- | -------------- | ------- |
| `wednesday-saturday-cloverdale-pickleball` | Pickleball | Wed 8:58 AM | 9:00 AM  | Saturday  | Cloverdale     | 9:00 am |
| `friday-monday-cloverdale`                 | Badminton  | Fri 6:13 PM | 6:15 PM  | Monday    | Cloverdale     | 8:15 am |
| `saturday-tuesday-guildford`               | Badminton  | Sat 6:28 PM | 6:30 PM  | Tuesday   | Guildford      | 8:15 am |
| `sunday-wednesday-fraser`                  | Badminton  | Sun 6:13 PM | 6:15 PM  | Wednesday | Fraser Heights | 8:15 am |
| `monday-thursday-guildford`                | Badminton  | Mon 6:58 PM | 7:00 PM  | Thursday  | Guildford      | 8:15 am |
| `wednesday-saturday-fraser`                | Badminton  | Wed 9:58 AM | 10:00 AM | Saturday  | Fraser Heights | 8:15 am |
| `thursday-sunday-fraser`                   | Badminton  | Thu 9:58 AM | 10:00 AM | Sunday    | Fraser Heights | 8:15 am |

### Schedule Configuration Interface

```typescript
interface ScheduleConfig {
  id: string; // Unique identifier
  activity: string; // e.g., "Drop In Badminton - Adult"
  cronExpression: string; // Cron format, triggers 2 min before release
  cronDay: number; // 0=Sunday, 1=Monday, ..., 6=Saturday
  releaseHour: number; // Hour when slots release (24h format)
  releaseMinute: number; // Minute when slots release
  targetDay: (d: Date) => Date; // Function to calculate booking date
  location: string; // Full recreation centre name
  time: string; // Desired time slot (e.g., "8:15 am")
  description: string; // Human-readable description
  testOnly?: boolean; // If true, won't auto-schedule
}
```

### Cron Expression Format

```
┌───────────── minute (0 - 59)
│ ┌─────────── hour (0 - 23)
│ │ ┌───────── day of month (1 - 31)
│ │ │ ┌─────── month (1 - 12)
│ │ │ │ ┌───── day of week (0 - 6, Sunday = 0)
│ │ │ │ │
* * * * *

Example: "58 9 * * 3" = 9:58 AM every Wednesday
```

### Adding a New Schedule

1. **Determine release time** for the day you want to book
2. **Set cron to trigger 2 minutes before** release
3. **Add to SCHEDULES array** in `scheduler.ts`:

```typescript
{
  id: "descriptive-id",
  activity: "Drop In Badminton - Adult",
  cronExpression: "13 18 * * 5",  // 2 min before 6:15 PM Friday
  cronDay: 5,                      // Friday
  releaseHour: 18,
  releaseMinute: 15,
  targetDay: (d) => nextMonday(d), // Books for Monday
  location: LOCATIONS.CLOVERDALE,
  time: "8:15 am",
  description: "Friday 6:15 PM → Book Monday @ Cloverdale",
}
```

---

## How the Booking Process Works

### Step-by-Step Flow

#### 1. Scheduler Triggers (2 min before release)

```
[6:13 PM] 🔔 Cron triggered: friday-monday-cloverdale
```

#### 2. Wait for Exact Release Time

```
⏰ Waiting for release time 18:15 PST
   ⏳ Waiting... 1m 45s until 18:15 PST
   ⏳ Waiting... 1m 40s until 18:15 PST
   ...
🚀 Release time reached! Current PST: 18:15:00
```

#### 3. Launch Browser & Navigate

- Opens Chromium (headless on server)
- Goes to booking URL
- Waits for page load

#### 4. Login

- Enters email and password
- Clicks Sign In
- Waits for dashboard

#### 5. Apply Filters

```typescript
// Set activity filter
await page.locator('[data-filter="service"]').click();
await page.getByText("Drop In Badminton - Adult").click();

// Set date filter
await page.locator('[data-filter="date"]').fill("03-Feb-2026");

// Set location filter (optional)
await page.locator('[data-filter="location"]').click();
await page.getByText("Cloverdale Recreation Centre").click();
```

#### 6. Find & Select Time Slot

- Scans results for matching time (e.g., "8:15 am")
- Clicks "Register" button on that row
- Falls back to waitlist if slot full (if enabled)

#### 7. Complete Registration

- Selects fee type ("Rec Surrey Pass")
- Confirms registration
- Handles any confirmation dialogs

#### 8. Result Logging

```
✅ BOOKING SUCCESSFUL!
   Activity: Drop In Badminton - Adult
   Date: 03-Feb-2026
   Location: Cloverdale Recreation Centre
   Time: 8:15 am
```

---

## File Structure

```
SurreyActivity/
├── src/
│   ├── scheduler.ts      # Cron scheduler - main entry point for automation
│   ├── booking.ts        # SurreyBookingAutomation class - browser automation
│   ├── cli.ts            # Command-line interface for manual bookings
│   ├── config.ts         # Configuration loader (env, booking config)
│   ├── logger.ts         # Winston logger setup
│   └── types.ts          # TypeScript interfaces
├── .env                  # Credentials (GITIGNORED - never commit!)
├── .env.example          # Template for .env
├── bookings.config.json  # Manual booking configurations
├── schedule.config.json  # Schedule configurations (JSON format)
├── package.json          # Dependencies
├── tsconfig.json         # TypeScript config
├── Dockerfile            # Docker build for Railway
├── railway.toml          # Railway deployment config
└── README.md             # Basic readme
```

---

## Configuration Files

### .env (Credentials - NEVER COMMIT)

```env
# Login Credentials
SURREY_EMAIL=your-email@example.com
SURREY_PASSWORD=your-password

# Browser Settings
HEADLESS=true              # true for server, false for debugging
SLOW_MO=100                # Milliseconds between actions (debugging)

# Timeouts
NAVIGATION_TIMEOUT=30000   # Page load timeout (ms)
ACTION_TIMEOUT=10000       # Click/type timeout (ms)

# Logging
LOG_LEVEL=info             # debug, info, warn, error
LOG_TO_FILE=false          # true to save logs to files
LOG_DIR=./logs
```

### bookings.config.json (Manual Bookings)

Used for one-time CLI bookings with specific dates:

```json
{
  "description": "Manual booking configurations",
  "bookings": [
    {
      "id": "monday-badminton",
      "enabled": true,
      "activity": "Drop In Badminton - Adult",
      "date": "03-Feb-2026",
      "time": "8:15 am",
      "location": "Cloverdale Recreation Centre",
      "preferWaitlist": false
    }
  ],
  "settings": {
    "feePreference": "Rec Surrey Pass",
    "maxRetries": 3,
    "retryDelayMs": 5000
  }
}
```

### schedule.config.json (Recurring Schedules)

JSON representation of schedules (for external config):

```json
{
  "schedules": [
    {
      "id": "friday-monday-cloverdale",
      "activity": "Drop In Badminton - Adult",
      "description": "Friday 6:15 PM → Book Monday @ Cloverdale",
      "cronDay": "Friday",
      "cronTime": "18:13",
      "cronExpression": "13 18 * * 5",
      "bookForDay": "Monday",
      "location": "Cloverdale Recreation Centre",
      "timeSlot": "8:15 am",
      "enabled": true
    }
  ]
}
```

---

## Commands Reference

### Scheduler Commands

```bash
# List all schedules with status
npx ts-node src/scheduler.ts list

# Start the scheduler (runs 24/7)
npx ts-node src/scheduler.ts start

# Run a specific schedule immediately (testing)
npx ts-node src/scheduler.ts run <schedule-id>
npx ts-node src/scheduler.ts run wednesday-saturday-cloverdale-pickleball
```

### CLI Commands (Manual Booking)

```bash
# Book a single activity
npx ts-node src/cli.ts book \
  --activity "Drop In Badminton - Adult" \
  --date "03-Feb-2026" \
  --time "8:15 am" \
  --location "Cloverdale Recreation Centre"

# Book all enabled bookings from config
npx ts-node src/cli.ts book-all

# Test login only
npx ts-node src/cli.ts test-login

# List available activities
npx ts-node src/cli.ts list-activities
```

### NPM Scripts

```bash
npm run scheduler        # Start scheduler
npm run book:all         # Book all from config
npm run book:all -- --headless  # Book in headless mode
```

---

## Deployment (Railway)

### Why Railway?

- Runs 24/7 without your computer on
- Free tier available (500 hrs/month)
- Easy GitHub integration
- Logs visible in dashboard

### Setup Steps

1. **Push to GitHub**

   ```bash
   git add .
   git commit -m "Deploy to Railway"
   git push
   ```

2. **Create Railway Project**
   - Go to [railway.app](https://railway.app)
   - New Project → Deploy from GitHub
   - Select your repository

3. **Set Environment Variables** (Railway Dashboard → Variables)

   ```
   SURREY_EMAIL=your-email@gmail.com
   SURREY_PASSWORD=your-password
   HEADLESS=true
   SLOW_MO=50
   NAVIGATION_TIMEOUT=60000
   ACTION_TIMEOUT=15000
   LOG_LEVEL=info
   LOG_TO_FILE=false
   TZ=America/Vancouver
   ```

4. **Deploy** - Railway auto-builds and starts

### Railway Configuration Files

**Dockerfile:**

```dockerfile
FROM mcr.microsoft.com/playwright:v1.40.0-jammy
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build || true
ENV TZ=America/Vancouver
CMD ["npx", "ts-node", "src/scheduler.ts", "start"]
```

**railway.toml:**

```toml
[build]
builder = "dockerfile"

[deploy]
startCommand = "npx ts-node src/scheduler.ts start"
restartPolicyType = "always"
```

### Monitoring on Railway

1. **View Logs:** Railway Dashboard → Deployments → View Logs
2. **30-second updates:** Shows next scheduled job countdown
3. **Booking results:** Success/failure logged in real-time

---

## Troubleshooting

### Common Issues

| Issue              | Cause                         | Solution                                                     |
| ------------------ | ----------------------------- | ------------------------------------------------------------ |
| Login failed       | Wrong credentials             | Check SURREY_EMAIL and SURREY_PASSWORD                       |
| Slot not found     | Sold out or wrong time format | Verify time matches exactly (e.g., "8:15 am" not "08:15 AM") |
| Browser crash      | Missing dependencies          | Use Playwright Docker image                                  |
| Wrong timezone     | TZ not set                    | Set TZ=America/Vancouver                                     |
| Booking too slow   | SLOW_MO too high              | Reduce SLOW_MO to 50 or 0                                    |
| Healthcheck failed | Railway expects HTTP server   | Remove healthcheckPath from railway.toml                     |

### Debug Mode

Run locally with visible browser:

```bash
# In .env
HEADLESS=false
LOG_LEVEL=debug

# Then run
npx ts-node src/scheduler.ts run <schedule-id>
```

### Logs Location

- **Local:** Console output + `./logs/` directory (if LOG_TO_FILE=true)
- **Railway:** Dashboard → Deployments → View Logs

---

## Thumb Rules & Best Practices

### ✅ DO

1. **Trigger 2 minutes before release** - gives time to load browser and login
2. **Wait for exact release time** - don't try to book early (slots not available)
3. **Use headless mode on servers** - no display available
4. **Keep credentials in .env** - never commit to git
5. **Test locally first** - use `run <schedule-id>` before deploying
6. **Monitor Railway logs** - check around release times

### ❌ DON'T

1. **Don't set cron exactly at release time** - browser needs time to load
2. **Don't use SLOW_MO > 100 for production** - booking will be too slow
3. **Don't commit .env file** - security risk
4. **Don't run multiple instances** - may cause duplicate bookings
5. **Don't ignore timezone** - always use America/Vancouver (PST)

### 📝 Date/Time Formats

| Type | Format             | Example       |
| ---- | ------------------ | ------------- |
| Date | DD-MMM-YYYY        | 31-Jan-2026   |
| Time | HH:MM am/pm        | 8:15 am       |
| Cron | min hour \* \* day | 13 18 \* \* 5 |

---

## Quick Reference Card

```
┌─────────────────────────────────────────────────────────────┐
│ SURREY ACTIVITY BOOKING - QUICK REFERENCE                   │
├─────────────────────────────────────────────────────────────┤
│ Start Scheduler:  npx ts-node src/scheduler.ts start        │
│ List Schedules:   npx ts-node src/scheduler.ts list         │
│ Run Now:          npx ts-node src/scheduler.ts run <id>     │
├─────────────────────────────────────────────────────────────┤
│ Timezone:         America/Vancouver (PST/PDT)               │
│ Cron Trigger:     2 minutes BEFORE release time             │
│ Date Format:      DD-MMM-YYYY (e.g., 31-Jan-2026)          │
│ Time Format:      HH:MM am/pm (e.g., 8:15 am)              │
├─────────────────────────────────────────────────────────────┤
│ Railway Deploy:   Push to GitHub → Auto-deploys             │
│ Railway Vars:     SURREY_EMAIL, SURREY_PASSWORD, HEADLESS   │
│ Railway Logs:     Dashboard → Deployments → View Logs       │
└─────────────────────────────────────────────────────────────┘
```

---

## Version History

| Version | Date     | Changes                                  |
| ------- | -------- | ---------------------------------------- |
| 1.0     | Jan 2026 | Initial release with Badminton schedules |
| 1.1     | Jan 2026 | Added Pickleball @ Cloverdale schedule   |
| 1.2     | Jan 2026 | Added Railway deployment support         |

---

_Last Updated: January 31, 2026_
