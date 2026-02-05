# Badminton Schedule Analysis - Drop In Badminton Adult

## Scraping Summary

**Date**: January 2025  
**Source**: Surrey Recreation Booking Portal  
**Filter**: Drop In Badminton - Adult  
**Total Unique Recurring Patterns Found**: 22

## Location Priority (Thumb Rule)

🥇 **Priority 1**: Fraser Heights Recreation Centre  
🥈 **Priority 2**: Cloverdale Recreation Centre  
🥉 **Priority 3**: Guildford Recreation Centre  
⚪ **Priority 4**: Other locations

---

## Discovered Weekly Patterns

### Monday

- **6:30 PM** - Cloverdale Recreation Centre ✅ _Already in scheduler_

### Tuesday (6 slots available!)

- **6:30 PM** - Chuck Bailey Recreation Centre
- **7:00 PM** - Guildford Recreation Centre ✅ _Already in scheduler_ (as thursday-saturday-guildford-badminton)
- **7:15 PM** - South Surrey Recreation & Arts Centre
- **7:30 PM** - Princess Margaret Secondary School
- **8:15 PM** - Coyote Creek Elementary School

### Wednesday (3 slots)

- **9:15 AM** - Cloverdale Recreation Centre (Morning slot!)
- **6:15 PM** - Fraser Heights Recreation Centre ✅ _Already in scheduler_
- **7:45 PM** - Cloverdale Recreation Centre ✅ _Already in scheduler_

### Thursday (4 slots)

- **5:30 PM** - Clayton Community Centre
- **7:00 PM** - Guildford Recreation Centre
- **7:30 PM** - Princess Margaret Secondary School
- **8:15 PM** - Coyote Creek Elementary School

### Friday (3 slots)

- **11:00 AM** - Chuck Bailey Recreation Centre (Late morning!)
- **5:30 PM** - South Surrey Recreation & Arts Centre
- **6:30 PM** - Cloverdale Recreation Centre

### Saturday (2 slots)

- **10:00 AM** - Fraser Heights Recreation Centre ✅ _Already in scheduler_
- **6:00 PM** - Guildford Recreation Centre

### Sunday (4 slots)

- **8:30 AM** - Guildford Recreation Centre (Early morning!)
- **10:00 AM** - Fraser Heights Recreation Centre
- **10:45 AM** - Clayton Community Centre
- **2:00 PM** - Guildford Recreation Centre (Afternoon!)

---

## Current Scheduler Comparison

### ✅ Already Scheduled (in scheduler.ts)

1. **Monday 6:30 PM** - Cloverdale Recreation Centre
   - _ID_: `friday-monday-cloverdale-badminton`
   - _Release_: Friday 6:30 PM

2. **Tuesday 7:00 PM** - Guildford Recreation Centre
   - _ID_: `thursday-saturday-guildford-badminton`
   - _Release_: Saturday 6:00 PM
   - **Note**: Schedule ID says "thursday-saturday" but it's actually for Tuesday activity

3. **Wednesday 6:15 PM** - Fraser Heights Recreation Centre
   - _ID_: `wednesday-saturday-fraser-basketball`
   - **ISSUE**: This is labeled as basketball but should be badminton!
   - _Release_: Saturday 6:15 PM

4. **Wednesday 7:45 PM** - Cloverdale Recreation Centre
   - _ID_: `wednesday-wednesday-cloverdale-badminton`
   - _Release_: Wednesday 7:45 PM (same day)

5. **Saturday 10:00 AM** - Fraser Heights Recreation Centre
   - _ID_: `wednesday-saturday-fraser-basketball`
   - **ISSUE**: This is labeled as basketball but should be badminton!
   - _Release_: Wednesday 10:00 AM

### ⚠️ Issues Found in Current Scheduler

1. **Naming Confusion**: `wednesday-saturday-fraser-basketball` appears to be for badminton, not basketball
2. **Inconsistent Naming**: `thursday-saturday-guildford-badminton` is actually for Tuesday activity
3. **Missing Schedules**: Many badminton slots are not in the scheduler at all

---

## Registration Time Pattern Analysis

Based on existing schedules in scheduler.ts, the registration pattern seems to be:

- **Monday activities**: Register on **Friday** (2-3 days before)
- **Tuesday activities**: Register on **Saturday** (3-4 days before)
- **Wednesday activities**: Register on **Wednesday** (same day) or **Saturday** (3 days before)
- **Saturday activities**: Register on **Wednesday** (3 days before)

**Typical Release Times**:

- Morning activities (9-11 AM): Usually open for registration in the morning (10:00-11:00 AM) days before
- Evening activities (5-8 PM): Usually open for registration in the evening (6:00-7:00 PM) days before

---

## Recommendations (By Priority)

### 1. 🥇 PRIORITY 1: Fraser Heights Slots

```typescript
// Add these to scheduler.ts SCHEDULES array:

// Sunday 10:00 AM Fraser Heights (HIGHEST PRIORITY - Weekend morning)
{
  id: 'thursday-sunday-fraser-badminton',
  cronExpression: '58 9 * * 4', // Thursday 9:58 AM (2 min buffer)
  cronDay: 4, // Thursday
  releaseHour: 10,
  releaseMinute: 0,
  targetDay: nextSunday,
  location: 'Fraser Heights Recreation Centre',
  time: '10:00 am',
  description: 'Sunday 10:00am Badminton at Fraser Heights (registers Thursday 10:00am)'
}

// Note: Wednesday 6:15 PM and Saturday 10:00 AM Fraser Heights already in scheduler
```

### 2. 🥈 PRIORITY 2: Cloverdale Slots

```typescript
// Friday 6:30 PM Cloverdale (End of week slot)
{
  id: 'tuesday-friday-cloverdale-badminton',
  cronExpression: '28 18 * * 2', // Tuesday 6:28 PM (2 min buffer)
  cronDay: 2, // Tuesday
  releaseHour: 18,
  releaseMinute: 30,
  targetDay: nextFriday,
  location: 'Cloverdale Recreation Centre',
  time: '6:30 pm',
  description: 'Friday 6:30pm Badminton at Cloverdale (registers Tuesday 6:30pm)'
}

// Wednesday 9:15 AM Cloverdale (Morning slot)
{
  id: 'wednesday-wednesday-cloverdale-badminton-morning',
  cronExpression: '13 9 * * 3', // Wednesday 9:13 AM (2 min buffer)
  cronDay: 3, // Wednesday
  releaseHour: 9,
  releaseMinute: 15,
  targetDay: nextWednesday,
  location: 'Cloverdale Recreation Centre',
  time: '9:15 am',
  description: 'Wednesday 9:15am Badminton at Cloverdale (registers Wednesday 9:15am)'
}

// Note: Monday 6:30 PM and Wednesday 7:45 PM Cloverdale already in scheduler
```

### 3. 🥉 PRIORITY 3: Guildford Slots

```typescript
// Thursday 7:00 PM Guildford
{
  id: 'monday-thursday-guildford-badminton',
  cronExpression: '58 18 * * 1', // Monday 6:58 PM (2 min buffer)
  cronDay: 1, // Monday
  releaseHour: 19,
  releaseMinute: 0,
  targetDay: nextThursday,
  location: 'Guildford Recreation Centre',
  time: '7:00 pm',
  description: 'Thursday 7:00pm Badminton at Guildford (registers Monday 7:00pm)'
}

// Saturday 6:00 PM Guildford
{
  id: 'wednesday-saturday-guildford-badminton-evening',
  cronExpression: '58 17 * * 3', // Wednesday 5:58 PM (2 min buffer)
  cronDay: 3, // Wednesday
  releaseHour: 18,
  releaseMinute: 0,
  targetDay: nextSaturday,
  location: 'Guildford Recreation Centre',
  time: '6:00 pm',
  description: 'Saturday 6:00pm Badminton at Guildford (registers Wednesday 6:00pm)'
}

// Sunday 8:30 AM Guildford (Early morning)
{
  id: 'thursday-sunday-guildford-badminton-morning',
  cronExpression: '28 8 * * 4', // Thursday 8:28 AM (2 min buffer)
  cronDay: 4, // Thursday
  releaseHour: 8,
  releaseMinute: 30,
  targetDay: nextSunday,
  location: 'Guildford Recreation Centre',
  time: '8:30 am',
  description: 'Sunday 8:30am Badminton at Guildford (registers Thursday 8:30am)'
}

// Sunday 2:00 PM Guildford (Afternoon)
{
  id: 'thursday-sunday-guildford-badminton-afternoon',
  cronExpression: '58 13 * * 4', // Thursday 1:58 PM (2 min buffer)
  cronDay: 4, // Thursday
  releaseHour: 14,
  releaseMinute: 0,
  targetDay: nextSunday,
  location: 'Guildford Recreation Centre',
  time: '2:00 pm',
  description: 'Sunday 2:00pm Badminton at Guildford (registers Thursday 2:00pm)'
}

// Note: Tuesday 7:00 PM Guildford already in scheduler
```

### 4. Fix Existing Schedule Issues

- Rename `wednesday-saturday-fraser-basketball` to `wednesday-saturday-fraser-badminton`
- Fix description to clarify it's for badminton, not basketball
- Rename `thursday-saturday-guildford-badminton` to `saturday-tuesday-guildford-badminton` for clarity

---

## Next Steps

1. **Verify Registration Times**: Click on "More Info" for a few events to confirm actual release times
2. **Update scheduler.ts**: Add new schedules based on priorities
3. **Fix Naming**: Correct existing schedule IDs and descriptions
4. **Test**: Use `npx ts-node src/scheduler.ts run <schedule-id>` to test new schedules

---

## Data Files

- **Raw scraped data**: `badminton-schedule-scraped.json`
- **This analysis**: `BADMINTON_SCHEDULE_ANALYSIS.md`
