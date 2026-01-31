# City of Surrey Activity Booking - Automation Notes

## URL

https://cityofsurrey.perfectmind.com/23615/Clients/BookMe4BookingPages/Classes?widgetId=b4059e75-9755-401f-a7b5-d7c75361420d&calendarId=be083bfc-aeee-4c7a-aa26-07eb679e18a6&singleCalendarWidget=False

---

## 📋 Booking Rules

| Rule                     | Setting                                         |
| ------------------------ | ----------------------------------------------- |
| **Fee Selection**        | Always **"Rec Surrey Pass = Free"** (NEVER pay) |
| **Bookings per session** | **1 slot only**, single activity                |
| **Activities**           | Badminton Adult & Basketball Adult (same flow)  |
| **Location**             | User provides specific location                 |
| **Time**                 | User provides specific time slot                |
| **Cancel flow**          | Not needed                                      |

---

## 🔄 Complete Booking Flow

### Step 1: Navigate & Login

1. Navigate to booking URL
2. Click **"Login"** link (top right)
3. Redirects to Surrey.ca sign-in page
4. Enter **Email** → Enter **Password** → Click **"Sign In"**
5. Redirects back to booking page (logged in)

### Step 2: Set Date Filter

1. Click **"Date Range From"** combobox
2. Click **"select"** button to open calendar picker
3. Select target date (e.g., next Monday)
4. Calendar closes, page updates with filtered results

### Step 3: Filter by Activity

1. Click **"Service"** dropdown
2. Dropdown expands with checkbox list
3. Check desired activity (e.g., "Drop In Basketball - Adult")
4. Page auto-filters to show only that activity

### Step 4: Select Time Slot

1. Find desired time slot & location in results list
2. Check availability:
   - **"X spot(s) left"** → Click **"Register"** button
   - **"FULL - Waitlist Available"** → Click **"Waitlist"** button
3. Opens event details page

### Step 5: Event Details Page

1. Review event info (date, time, location, spots)
2. Click **"Register"** link (or "Add to Waitlist")

### Step 6: Attendees (Step 1/3)

1. Name auto-selected: "Paul Vineeth Penta Reddy (You)" ✓
2. Click **"Next"**

### Step 7: Fees & Extras (Step 2/3)

1. Fee options displayed
2. **ALWAYS select:** "CRS - Drop In Sport - Rec Surrey Pass" = **Free**
3. Total should be **$0.00**
4. Click **"Next"**

### Step 8: Checkout (Step 3/3)

1. Order summary shows $0.00 total
2. Payment method section (not charged for free orders)
3. Click **"Place My Order"**

### Step 9: Confirmation

1. "Thank you!" page displayed
2. Confirmation email sent to vineethreddy00009@gmail.com
3. Options: Add to calendar, Print Receipt, Book Another Event

---

## 🎯 Input Parameters for Booking

When requesting a booking, provide:

- 📅 **Date**: Specific date or "next Monday"
- 🏀 **Activity**: "badminton adult" or "basketball adult"
- 📍 **Location**: Recreation centre name
- 🕐 **Time**: Preferred time slot

---

## 🔧 Page Elements Reference

### Filter Panel

| Element         | Type                       | Purpose               |
| --------------- | -------------------------- | --------------------- |
| Keyword search  | textbox                    | Search by course code |
| Location        | listbox                    | Filter by rec centre  |
| **Service**     | listbox                    | **ACTIVITY FILTER**   |
| Date Range From | combobox + "select" button | Start date picker     |
| Date Range To   | combobox + "select" button | End date picker       |
| Days of week    | checkboxes                 | Filter by day         |

### Login Page (Surrey.ca)

| Element  | Type    |
| -------- | ------- |
| Email    | textbox |
| Password | textbox |
| Sign In  | button  |

---

## 📁 Environment Variables

Store in `.env` file:

```
SURREY_EMAIL=vineethreddy00009@gmail.com
SURREY_PASSWORD=<password>
```

---

## 📝 Activity Names (Service Dropdown)

### Badminton

- Drop In Badminton - 13+
- Drop In Badminton - Adult ← **Primary**
- Drop In Badminton - Family
- Drop In Badminton - Youth
- Drop In Badminton - Seniors Services

### Basketball

- Drop In Basketball - 13+
- Drop In Basketball - Adult ← **Primary**
- Drop In Basketball - Family
- Drop In Basketball - Youth

---

## 🏢 Recreation Centres

- Chuck Bailey Recreation Centre
- Clayton Community Centre
- Cloverdale Recreation Centre
- Fraser Heights Recreation Centre
- Guildford Recreation Centre
- Newton Recreation Centre
- South Surrey Recreation & Arts Centre

---

## ⏰ Future Automation (Phase 2)

Once testing is consistent, automate via cron with:

- Specific activity
- Specific location
- Specific time slot
- Scheduled trigger (e.g., booking opens at midnight for next week)
