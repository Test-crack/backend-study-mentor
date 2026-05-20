# Drill v2 Implementation Plan

**Date:** 2026-05-21  
**Status:** In Progress  
**Branch:** feature/report

---

## Overview

Three parallel workstreams to upgrade the drill system from a simple submit-at-end model to a proper lifecycle-tracked session (mirroring IA/Mock), add a rewarded reflection step, and re-calibrate the extra-drill economy.

---

## Execution Order

```
1. Schema migration  ←  run SQL in pgAdmin (DrillSessionStatus enum + new columns)
                        then: npx prisma db pull && npx prisma generate

2. Task 2 — EXTRA_SESSION_COST 75 → 150  (1-line backend change)

3. Task 1 — saveReflection endpoint + DrillResultCard toast + +25 pts

4. Task 3 — New session lifecycle endpoints + frontend wiring
```

---

## Task 1 — Reflection Save + +25 Momentum Toast

### What changes

| Layer | Change |
|---|---|
| DB | `reflection_text String?` on `DrillSession` (done in schema migration) |
| Backend | New `POST /api/drills/save-reflection` endpoint in `drillController.ts` |
| Backend | Register route in `drillRoutes.ts` |
| Frontend | `DrillScreen.tsx` — store session UUID from `saveDrillSession` response, pass as prop |
| Frontend | `DrillResultCard.tsx` — call save-reflection before navigating, fire Sonner toast |
| Frontend | `ApplyDrillScreen.tsx` — update total pts display: `initialScore + 25 + 30` |

### Backend: `saveReflection` controller

```typescript
// POST /api/drills/save-reflection
// Body: { session_id: string, reflection_text: string }
// Guards: student owns session, idempotent (skip award if already saved)
// Awards: +25 momentum on first save only
// Returns: { success, momentum_earned: 25, momentum_score }
```

### Frontend: Toast (Sonner)

```tsx
import { toast } from 'sonner';
// After successful API call:
toast.success('+25 momentum earned!', {
  description: 'Great reflection — keep the momentum going.',
  duration: 3500,
});
```

### Points summary after Task 1

| Step | Points |
|---|---|
| Drill MCQs | 15 base + 10 × correct_answers |
| Reflection submit | +25 (new) |
| Apply Drill complete | +30 |

---

## Task 2 — Extra Drill Cost: 75 → 150 pts

**Single constant change** in `gameScoreController.ts`:

```typescript
const EXTRA_SESSION_COST = 150;  // was 75
```

All UI is dynamic — `extra_session_cost` is returned from `GET /api/student/daily-drill-state`
and drives every label, so no frontend string hunts needed.

**Verify:** search for hardcoded `"75"` in any drill unlock UI copy and update if found.

---

## Task 3 — Proper Session State Storage

### New enum (added to schema.prisma + DB)

```prisma
enum DrillSessionStatus {
  STARTED       // questions loaded, student answering MCQs
  DRILL_DONE    // MCQs submitted, video + reflection gate active
  APPLY_DONE    // full session complete
}
```

### New columns on `DrillSession` (added in schema migration)

| Column | Type | Default | Purpose |
|---|---|---|---|
| `status` | `DrillSessionStatus` | `STARTED` | Lifecycle state |
| `question_ids` | `Json?` | null | UUID[] of questions served — locks the set |
| `answers` | `Json?` | null | `{ [questionId]: selectedAnswer }` — enables resume |
| `reflection_text` | `String?` | null | Student's reflection (Task 1) |
| `drill_completed_at` | `DateTime?` | null | When MCQs were submitted |
| `apply_completed_at` | `DateTime?` | null | When apply drill was submitted |

### New session lifecycle

```
POST /api/drills/start
  → Creates DrillSession(status=STARTED, question_ids=[...])
  → Returns { session_id, questions }
  → Replaces the separate GET /api/drills/questions call

POST /api/drills/session/:id/complete
  → status=STARTED → DRILL_DONE
  → Saves answers, correct_answers, drill_completed_at, momentum_earned
  → Awards base + per-correct momentum
  → Replaces POST /api/drills/session

POST /api/drills/session/:id/reflection        ← Task 1
  → Saves reflection_text
  → Awards +25 (idempotent)

POST /api/drills/session/:id/apply-done
  → status=DRILL_DONE → APPLY_DONE
  → Saves apply_completed_at
  → Awards +30
  → Replaces POST /api/drills/apply-complete

GET /api/drills/active?skill=X&sub_skill=Y    ← Resume support
  → Returns today's STARTED or DRILL_DONE session if one exists
  → Frontend uses this to detect mid-drill abandonment
```

### Frontend wiring

| File | Change |
|---|---|
| `DrillScreen.tsx` | Replace `fetchQuestions` + `saveSessionAndComplete` with `POST /api/drills/start` → get session_id + questions. On MCQ done → `POST /api/drills/session/:id/complete`. Pass `session_id` in URL to apply-drill. |
| `ApplyDrillScreen.tsx` | Read `session_id` from URL. `handleSubmit` → `POST /api/drills/session/:id/apply-done`. |
| `DrillResultCard.tsx` | `drillSessionId` prop used for reflection endpoint. |

### Abandoned session detection (future / miss-detection)

`DRILL_DONE` sessions from previous days (never reached `APPLY_DONE`) can be swept by a
background check in `getDailyDrillState` — same pattern as IA miss detection.

---

## Files Changed Summary

### Backend
- `prisma/schema.prisma` — new enum + new DrillSession columns
- `src/controllers/drillController.ts` — new endpoints: start, complete (replaces session), reflection, apply-done, active
- `src/controllers/gameScoreController.ts` — EXTRA_SESSION_COST = 150
- `src/routes/drillRoutes.ts` — register new routes

### Frontend
- `src/features/student/components/Drills/DrillScreen.tsx`
- `src/features/student/components/Drills/DrillResultCard.tsx`
- `src/features/student/components/Drills/ApplyDrillScreen.tsx`

---

## SQL for Execution Order 1

See the SQL queries provided separately in the session.  
Run in pgAdmin → then `npx prisma db pull && npx prisma generate`.
