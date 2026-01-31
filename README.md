# Surrey Activity Booking Automation

Automated booking system for City of Surrey drop-in sports activities using Playwright.

## 🚀 Quick Start

### 1. Install Dependencies

```bash
npm install
```

### 2. Configure Credentials

Edit the `.env` file with your credentials:

```env
SURREY_EMAIL=your-email@example.com
SURREY_PASSWORD=your-password
HEADLESS=true
```

### 3. Run a Booking

**Single booking via CLI:**

```bash
npm run book -- --activity "Drop In Basketball - Adult" --date "31-Jan-2026" --time "08:15 am" --location "Guildford Recreation Centre"
```

**Multiple bookings from config:**

```bash
npm run book:all
```

## 📖 Usage

### CLI Commands

| Command                         | Description                                  |
| ------------------------------- | -------------------------------------------- |
| `npm run book`                  | Book a single activity with CLI parameters   |
| `npm run book:all`              | Book all enabled activities from config file |
| `npm run start test-login`      | Test login functionality                     |
| `npm run start list-activities` | List available activities and locations      |

### CLI Options

```bash
npm run book -- [options]

Options:
  -a, --activity <activity>    Activity name (required)
  -d, --date <date>           Date in DD-MMM-YYYY format (required)
  -t, --time <time>           Time in HH:MM am/pm format (required)
  -l, --location <location>   Recreation centre name (required)
  -w, --waitlist              Join waitlist if slot is full
  --headless                  Run browser in headless mode
```

### Configuration File

Edit `bookings.config.json` to set up multiple bookings:

```json
{
  "bookings": [
    {
      "id": "saturday-basketball",
      "enabled": true,
      "activity": "Drop In Basketball - Adult",
      "date": "31-Jan-2026",
      "time": "08:15 am",
      "location": "Guildford Recreation Centre",
      "preferWaitlist": true
    }
  ],
  "settings": {
    "feePreference": "Rec Surrey Pass",
    "maxRetries": 3,
    "screenshotOnError": true
  }
}
```

## 🏀 Available Activities

- Drop In Badminton - 13+/Adult/Children with Adult/Family/Youth
- Drop In Basketball - 13+/Adult/Children with Adult/Family/Youth
- Drop In Indoor Soccer - 13+
- Drop In Pickleball - 13+/Adult/Family
- Drop In Table Tennis - 13+/Family/Seniors Services
- Drop In Volleyball - 13+/Adult/Family

## 📍 Recreation Centres

- Bridgeview Community Centre
- Chuck Bailey Recreation Centre
- Clayton Community Centre
- Cloverdale Recreation Centre
- Fleetwood Community Centre
- Fraser Heights Recreation Centre
- Guildford Recreation Centre
- Newton Recreation Centre - Wave Pool
- South Surrey Recreation & Arts Centre

## ⚙️ Environment Variables

| Variable             | Description                       | Default  |
| -------------------- | --------------------------------- | -------- |
| `SURREY_EMAIL`       | Login email                       | -        |
| `SURREY_PASSWORD`    | Login password                    | -        |
| `HEADLESS`           | Run browser headless              | `false`  |
| `SLOW_MO`            | Slow down actions (ms)            | `100`    |
| `NAVIGATION_TIMEOUT` | Page navigation timeout (ms)      | `30000`  |
| `ACTION_TIMEOUT`     | Action timeout (ms)               | `10000`  |
| `LOG_LEVEL`          | Log level (debug/info/warn/error) | `info`   |
| `LOG_TO_FILE`        | Save logs to file                 | `true`   |
| `LOG_DIR`            | Log directory                     | `./logs` |

## 📝 Booking Rules

1. **Fee Selection**: Always uses "Rec Surrey Pass = Free" ($0.00)
2. **Single Slot**: One activity per booking session
3. **Waitlist**: Optionally join waitlist if slot is full

## 🔧 Development

```bash
# Build TypeScript
npm run build

# Run with ts-node (development)
npm run start

# Install Playwright browsers
npx playwright install chromium
```

## 📁 Project Structure

```
SurreyActivity/
├── src/
│   ├── booking.ts      # Main booking automation
│   ├── cli.ts          # Command-line interface
│   ├── config.ts       # Configuration loader
│   ├── logger.ts       # Logging utility
│   └── types.ts        # TypeScript types
├── logs/               # Log files (auto-created)
├── screenshots/        # Error screenshots (auto-created)
├── .env                # Environment variables
├── bookings.config.json # Booking configuration
├── package.json
├── tsconfig.json
└── README.md
```

## 🤖 Automation for Cron Jobs

For scheduled automation, run in headless mode:

```bash
# Run all bookings in headless mode
npm run book:all -- --headless

# Or set HEADLESS=true in .env
```

## ⚠️ Disclaimer

This tool is for personal use. Please use responsibly and in accordance with City of Surrey's terms of service.
