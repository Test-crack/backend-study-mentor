# Fix: Completed IA Session Not Displaying

**Issue:** After completing today's IA, the gate screen still shows "Ready to test your limits?" instead of showing the completed session with scores.

**Root Cause:** Backend returns incomplete data structure. Frontend expects `today_completed_session` object but backend returns separate fields.

---

## Backend Fix Required

**File:** `backend-study-mentor/src/controllers/iaController.ts`

**Function:** `getIAStatus()`

### Current Code (BROKEN):

```typescript
const todayCompletedSession = is_ia_day
  ? await prisma.iASession.findFirst({
      where: { student_id: student.id, ia_date: new Date(todayStr), status: 'COMPLETED' as any },
      select: { scores: true, momentum_awarded: true }  // ← INCOMPLETE
    })
  : null;

return res.json({
  success: true,
  missed_count: staleSessions.length,
  has_active_session: !!todayActiveSession,
  has_completed_session: !!todayCompletedSession,
  completed_session_scores: todayCompletedSession?.scores ?? null,  // ← WRONG STRUCTURE
  completed_session_momentum: todayCompletedSession?.momentum_awarded ?? null,
  // ...
});
```

### Fixed Code (CORRECT):

```typescript
const todayCompletedSession = is_ia_day
  ? await prisma.iASession.findFirst({
      where: { student_id: student.id, ia_date: new Date(todayStr), status: 'COMPLETED' as any },
      select: { 
        id: true,
        ia_number: true,
        scores: true, 
        momentum_awarded: true,
        time_submitted_at: true
      }
    })
  : null;

return res.json({
  success: true,
  missed_count: staleSessions.length,
  has_active_session: !!todayActiveSession,
  today_completed_session: todayCompletedSession ? {
    session_id: todayCompletedSession.id,
    ia_number: todayCompletedSession.ia_number,
    scores: todayCompletedSession.scores,
    momentum_awarded: todayCompletedSession.momentum_awarded,
    time_submitted_at: todayCompletedSession.time_submitted_at.toISOString()
  } : null,
  // ... rest of the response
});
```

---

## Changes Required

### 1. Update the Query

**Location:** Line ~180 in `iaController.ts` (inside `getIAStatus` function)

**Change:**
```typescript
// OLD
select: { scores: true, momentum_awarded: true }

// NEW
select: { 
  id: true,
  ia_number: true,
  scores: true, 
  momentum_awarded: true,
  time_submitted_at: true
}
```

### 2. Update the Response

**Location:** Line ~200 in `iaController.ts` (inside `getIAStatus` function)

**Remove these lines:**
```typescript
has_completed_session: !!todayCompletedSession,
completed_session_scores: todayCompletedSession?.scores ?? null,
completed_session_momentum: todayCompletedSession?.momentum_awarded ?? null,
```

**Add this instead:**
```typescript
today_completed_session: todayCompletedSession ? {
  session_id: todayCompletedSession.id,
  ia_number: todayCompletedSession.ia_number,
  scores: todayCompletedSession.scores,
  momentum_awarded: todayCompletedSession.momentum_awarded,
  time_submitted_at: todayCompletedSession.time_submitted_at.toISOString()
} : null,
```

---

## Complete Fixed Function

Here's the complete section that needs to be updated:

```typescript
// Inside getIAStatus() function, around line 180-200

// Check for completed session today
const todayCompletedSession = is_ia_day
  ? await prisma.iASession.findFirst({
      where: { 
        student_id: student.id, 
        ia_date: new Date(todayStr), 
        status: 'COMPLETED' as any 
      },
      select: { 
        id: true,
        ia_number: true,
        scores: true, 
        momentum_awarded: true,
        time_submitted_at: true
      }
    })
  : null;

// ... later in the return statement ...

return res.json({
  success: true,
  missed_count: staleSessions.length,
  has_active_session: !!todayActiveSession,
  today_completed_session: todayCompletedSession ? {
    session_id: todayCompletedSession.id,
    ia_number: todayCompletedSession.ia_number,
    scores: todayCompletedSession.scores,
    momentum_awarded: todayCompletedSession.momentum_awarded,
    time_submitted_at: todayCompletedSession.time_submitted_at.toISOString()
  } : null,
  has_schedule: true,
  first_drill_date: firstDrillDateStr,
  prerequisites_met,
  avg_dcs,
  dcs_required: IA_DCS_THRESHOLD,
  dcs_eligible: avg_dcs >= IA_DCS_THRESHOLD,
  is_ia_day,
  current_ia_number: is_ia_day ? currentIANumber : null,
  can_start_test: is_ia_day && prerequisites_met && avg_dcs >= IA_DCS_THRESHOLD && !todayActiveSession && !todayCompletedSession,
  suggested_subskills: (is_ia_day && prerequisites_met && avg_dcs >= IA_DCS_THRESHOLD && !todayActiveSession && !todayCompletedSession)
    ? await selectPrioritySubSkills(student.id)
    : null,
  next_ia: nextIA,
  upcoming_ias: upcomingIAs,
  reasons,
  progress: {
    drills_completed: drills_completed,
    drills_required: IA_DRILL_THRESHOLD,
    days_since_first_drill: daysSinceFirst,
    min_days_required: IA_MIN_DAYS,
    avg_dcs,
    dcs_required: IA_DCS_THRESHOLD,
    cond_drills: drills_completed >= IA_DRILL_THRESHOLD,
    cond_days: daysSinceFirst >= IA_MIN_DAYS,
    cond_dcs: avg_dcs >= IA_DCS_THRESHOLD
  }
});
```

---

## Testing After Fix

1. **Complete an IA successfully**
2. **Return to `/student/internal` page**
3. **Expected:** Should see completed session screen with:
   - ✅ "IA #X Complete" header
   - ✅ "Assessment Completed Today" banner
   - ✅ Submission timestamp
   - ✅ Momentum earned
   - ✅ Two score cards with bands and deltas
   - ✅ Next IA date

4. **Check browser console:**
   - Should see `today_completed_session` object in API response
   - Should NOT see "Ready to test your limits?" screen

5. **Check API response:**
```bash
# Call the status endpoint
curl http://localhost:4000/api/ia/status \
  -H "Authorization: Bearer YOUR_TOKEN"

# Should return:
{
  "success": true,
  "today_completed_session": {
    "session_id": "uuid",
    "ia_number": 7,
    "scores": [...],
    "momentum_awarded": 175,
    "time_submitted_at": "2026-05-08T14:30:00.000Z"
  },
  // ... other fields
}
```

---

## Why This Happened

The backend code was partially implemented:
- ✅ Query for completed session exists
- ✅ Frontend render function exists (`renderCompletedToday`)
- ✅ Frontend routing logic exists (checks `iaStatus.today_completed_session`)
- ❌ Backend returns wrong field names and incomplete data

The fix aligns the backend response with what the frontend expects.

---

## Related Files

- **Backend:** `backend-study-mentor/src/controllers/iaController.ts` (getIAStatus function)
- **Frontend:** `src/features/student/components/Assessment.tsx` (renderCompletedToday function)
- **Type Definition:** `src/features/student/components/Assessment.tsx` (IAStatusResponse interface)
- **Documentation:** `docs/frontend/IA_COMPLETED_SESSION_DISPLAY.md`

---

**Priority:** P0 - Critical Bug  
**Impact:** Students cannot see their completed IA results  
**Estimated Fix Time:** 5 minutes  
**Status:** Ready to apply
