# Railway Deployment Guide

## Quick Setup

1. **Push to GitHub** (if not already)

   ```bash
   git add .
   git commit -m "Add Railway deployment"
   git push
   ```

2. **Create Railway Project**
   - Go to [railway.app](https://railway.app)
   - Click "New Project" → "Deploy from GitHub repo"
   - Select your SurreyActivity repository

3. **Set Environment Variables** in Railway Dashboard:

   ```
   SURREY_EMAIL=your-real-email@gmail.com
   SURREY_PASSWORD=your-real-password
   HEADLESS=true
   SLOW_MO=50
   NAVIGATION_TIMEOUT=60000
   ACTION_TIMEOUT=15000
   LOG_LEVEL=info
   LOG_TO_FILE=false
   TZ=America/Vancouver
   ```

4. **Deploy** - Railway auto-detects Dockerfile and deploys!

## Important Notes

- **HEADLESS=true** is required (no display on Railway)
- **Logs** are visible in Railway dashboard (LOG_TO_FILE=false recommended)
- **Timezone** is set to Vancouver/Pacific in Dockerfile
- **Scheduler runs 24/7** - will trigger at configured cron times

## View Logs

Railway Dashboard → Your Project → Deployments → View Logs

You'll see:

- Scheduler startup with all scheduled jobs
- 30-second status updates
- Booking attempts and results

## Cost

Railway offers:

- Free tier: 500 hours/month (may not be enough for 24/7)
- Hobby plan: $5/month (recommended for always-on scheduler)

## Troubleshooting

**Browser crashes?**

- The Playwright Docker image includes all browser dependencies
- If issues persist, increase NAVIGATION_TIMEOUT

**Timezone wrong?**

- Verify TZ=America/Vancouver is set
- Check logs show PST times

**Missing bookings?**

- Check Railway logs around cron trigger times
- Verify environment variables are set correctly
