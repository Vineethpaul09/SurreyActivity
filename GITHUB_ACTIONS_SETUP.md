# GitHub Actions Setup Guide

This guide explains how to set up the Surrey Booking Automation to run on GitHub Actions with a virtual display (Xvfb), which properly handles payment iframes.

## Why GitHub Actions?

Payment iframes (like Moneris used by Surrey) **block headless browsers**. They use:
- GPU fingerprinting
- AudioContext analysis
- Canvas noise detection
- Event timing analysis

GitHub Actions with Xvfb provides a **real browser environment** without needing a physical display.

## Quick Setup

### 1. Push Code to GitHub

```bash
cd c:\Vineeth\SurreyActivity
git init  # If not already a git repo
git add .
git commit -m "Add GitHub Actions booking scheduler"
git remote add origin https://github.com/YOUR_USERNAME/SurreyActivity.git
git push -u origin main
```

### 2. Add Repository Secrets

Go to your GitHub repository → **Settings** → **Secrets and variables** → **Actions**

Add these secrets:

| Secret Name | Value |
|-------------|-------|
| `SURREY_EMAIL` | Your Surrey booking email |
| `SURREY_PASSWORD` | Your Surrey booking password |

### 3. Enable GitHub Actions

Actions are enabled by default. If disabled, go to:
**Settings** → **Actions** → **General** → Allow all actions

## Workflows

### 1. Manual Booking (`booking-scheduler.yml`)

Trigger a booking manually from GitHub:

1. Go to **Actions** tab
2. Select **Surrey Booking Scheduler**
3. Click **Run workflow**
4. Fill in:
   - Activity: `Drop In Badminton - 13+`
   - Date: `05-Feb-2026`
   - Time: `07:15 am`
   - Location: `Guildford`
   - Test only: ☐ (uncheck for real booking)

### 2. Test Booking (`test-booking.yml`)

Test without completing the booking:

1. Go to **Actions** tab
2. Select **Test Booking (Dry Run)**
3. Click **Run workflow**
4. Fill in parameters
5. Review screenshots in Artifacts

### 3. Scheduled Bookings (Automatic)

The scheduler runs automatically at these times (PST):

| Day | Time | Bookings Released |
|-----|------|-------------------|
| Tuesday | 9:00 AM | Friday slots |
| Wednesday | 9:00 AM | Saturday slots + Pickleball |
| Thursday | 9:00 AM | Sunday slots |
| Friday | 9:00 AM | Monday slots |
| Saturday | 9:00 AM | Tuesday slots |

## Schedule Configuration

### Current Schedules

```yaml
# In booking-scheduler.yml, matrix includes:

# Wednesday 9AM PST → Saturday bookings
- Badminton 7:15am @ Guildford
- Badminton 7:15am @ Bear Creek Park  
- Pickleball 1:15pm @ Cloverdale

# Thursday 9AM PST → Sunday bookings
- Badminton 6:45am @ Guildford

# Friday 9AM PST → Monday bookings
- Badminton 7:15am @ Guildford

# Saturday 9AM PST → Tuesday bookings
- Badminton 6:45am @ Guildford

# Tuesday 9AM PST → Friday bookings
- Badminton 7:15am @ Guildford
```

### Modifying Schedules

Edit `.github/workflows/booking-scheduler.yml`:

1. **Change cron times** in the `schedule:` section
2. **Add/remove bookings** in the `matrix.include` section

Cron format: `minute hour day month weekday` (UTC time)

PST to UTC: Add 8 hours (or 7 during DST)
- 9:00 AM PST = 17:00 UTC (5 PM)

### Adding a New Booking

Add to the appropriate `bookings` array in the matrix:

```yaml
- cron_match: '0 17 * * 3'  # Wednesday
  bookings: |
    [
      {"activity": "Drop In Badminton - 13+", "time": "07:15 am", "location": "Guildford", "days_ahead": 3},
      {"activity": "NEW ACTIVITY", "time": "10:00 am", "location": "NEW LOCATION", "days_ahead": 3}
    ]
```

## Monitoring

### View Run Results

1. Go to **Actions** tab
2. Click on a workflow run
3. View logs for each step
4. Download **Artifacts** for screenshots

### Email Notifications

GitHub sends emails on workflow failures by default.

To customize: **Settings** → **Notifications**

## Troubleshooting

### Workflow Not Running

- Check if Actions are enabled
- Verify secrets are set correctly
- Check cron syntax (use [crontab.guru](https://crontab.guru))

### Booking Fails

1. Download screenshots from Artifacts
2. Check the logs for error messages
3. Common issues:
   - Slot already booked
   - Activity not available on that date
   - Login credentials changed

### "Resource not accessible by integration"

- Ensure the workflow has write permissions
- Go to **Settings** → **Actions** → **General** → Workflow permissions → Read and write

## Cost

GitHub Actions is **free** for public repositories and includes:
- **2,000 minutes/month** for private repos (free tier)
- Each booking run uses ~3-5 minutes

For 7 bookings/week × 4 weeks = ~140 minutes/month (well within free tier)

## Security Notes

1. **Secrets are encrypted** and not visible in logs
2. **Never commit** `.env` files with credentials
3. **Use repository secrets** for all sensitive data
4. Screenshots may contain personal info - artifacts auto-delete after retention period

## Alternative: Self-Hosted Runner

For more control, you can set up a self-hosted runner on your own machine:

1. Go to **Settings** → **Actions** → **Runners**
2. Click **New self-hosted runner**
3. Follow the setup instructions

Benefits:
- No minute limits
- Faster execution
- Can use your own display

## Files Reference

```
.github/
  workflows/
    booking-scheduler.yml  # Main scheduler with manual + scheduled triggers
    test-booking.yml       # Test workflow (dry run only)
```

## Support

If you encounter issues:
1. Check the Actions logs
2. Review screenshots in Artifacts
3. Verify the website structure hasn't changed
4. Update Playwright if needed: `npm update playwright`
