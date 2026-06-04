# Phase 1 Implementation Report
## Instructor Dashboard Backend — New System Endpoints

**Status:** Complete  
**TypeScript:** 0 errors  
**Date:** 2026-06-05

---

## What Was Built

### New file: `src/controllers/instructorProgressController.ts`
### Modified file: `src/routes/instructorRoutes.ts`

---

## 3 New Endpoints

| Method | Route | Handler | Purpose |
|---|---|---|---|
| GET | `/api/instructor/batches/:batchId/dashboard-summary` | `getBatchDashboardSummary` | Dashboard page — engagement, at-risk, band overview, period totals |
| GET | `/api/instructor/batches/:batchId/students/:studentId/full-progress` | `getStudentFullProgress` | Student Deep Dive — IA, Mock, Drills, LexiGrid, eligibility |
| GET | `/api/instructor/batches/:batchId/assessment-overview` | `getBatchAssessmentOverview` | Assessments page — IA/Mock/Diagnostic tables per student |

All three sit behind the existing middleware chain: `requireAuth → ensureUser → authorize(INSTRUCTOR | ADMIN)`.

---

## Authorization Model

Every endpoint uses **batch-scoped auth** — the `batchId` is in the URL, so auth is a single index lookup, not a reverse scan.

**Dashboard summary / Assessment overview:**
```
ielts_batch_instructors.findFirst({ batch_id, user_id: appUserId })
→ 403 if not found
→ proceed and fetch all batch students
```

**Student full progress** (two-step):
```
Step 1: ielts_batch_instructors.findFirst({ batch_id, user_id: appUserId })
Step 2: ielts_batch_students.findFirst({ batch_id, user_id: studentId })
→ 403 if either is missing
```

This rejects any instructor trying to reach a student in a batch they're not assigned to, and any student ID that doesn't belong to this batch.

---

## Query Architecture — No N+1

All three functions resolve the student population once, then issue **batch IN-clause queries** for every subsequent concern. All independent queries run in `Promise.all`.

### `getBatchDashboardSummary` — 8 parallel queries after auth

```
1. prisma.user.findMany               — names/avatars for all batch students
2. prisma.drillSession.findMany       — today's drills (IST boundary)
3. prisma.drillSession.findMany       — yesterday's drills (for trend arrows)
4. prisma.iASession.groupBy           — missed IA count per student
5. prisma.drillSession.groupBy        — last drill date per student (days_inactive)
6. prisma.studentCompetencyMatrix.findMany — band scores for band_overview
7. prisma.iASession.findMany          — last 2 COMPLETED IAs per student (band_trend)
8. prisma.iASession.count             — IAs completed in rolling 7 IST days
9. prisma.mocksessions.count          — Mocks completed this calendar month
```
Total: 9 queries (1 user + 8 in Promise.all). No per-student loops.

### `getStudentFullProgress` — 6 parallel queries after auth

```
1. prisma.studentCompetencyMatrix.findMany  — 4 band rows
2. prisma.iASession.findMany                — full IA history
3. prisma.mocksessions.findMany             — full mock history
4. prisma.drillSession.findMany             — ALL-TIME drills (avg_dcs_lifetime + sub_skill_counts)
5. prisma.drillSession.findMany             — last 30 days (DCS chart + streak calendar)
6. prisma.studentGameScore.findMany         — LexiGrid last 14 days
```
Total: 2 auth checks + 2 user lookups + 6 data queries = 10 queries. `avg_dcs_lifetime` computed once from query 4 and reused directly in `ia_eligibility.avg_dcs` — no second aggregation.

### `getBatchAssessmentOverview` — 4 parallel queries after auth

```
1. prisma.iASession.findMany          — all IAs for all batch students
2. prisma.mocksessions.findMany       — all mocks for all batch students
3. prisma.assessmentHistory.findMany  — diagnostic entries (mode=DIAGNOSTIC)
4. prisma.drillSession.groupBy        — drill count/sum/min per student (ia_eligible)
```
Total: 1 auth + 1 user + 4 data queries = 6 queries.

---

## IST Date Handling

All date boundaries use `todayStartIST()` from `lib/timezone.ts`.

| Boundary | How computed | Used for |
|---|---|---|
| Today start | `todayStartIST()` | Drill "active today" window lower bound |
| Yesterday start | `todayStartIST() - 24h` | Trend arrow comparison |
| Rolling 7 days | `todayStartIST() - 7 × 24h` | `ia_completed_last_7_days` |
| Rolling 14 days | `todayStartIST() - 14 × 24h` | DCS chart, LexiGrid stats |
| Rolling 30 days | `todayStartIST() - 30 × 24h` | Streak calendar |
| Current month | `todayISTString().slice(0, 7)` | Mock `month_year` filter |

`DrillSession.created_at` is `TIMESTAMPTZ` — correctly compared against `todayStartIST()` UTC instant.  
`IASession.ia_date` is `DATE` — compared against the UTC-midnight version of the same IST date.  
`mocksessions.month_year` is a `VARCHAR(7)` string — compared against `"YYYY-MM"` derived from IST.

---

## Key Computed Fields

### `band_trend`
Derived from the last 2 COMPLETED `IASession` rows per student.  
- Average band per session = mean of all `scores[].band` values in that session.  
- Threshold: `±0.25` to avoid noise from IELTS half-band rounding.  
- Returns `null` when student has < 2 completed IAs. **Never returns `"flat"` for single-IA students.**

```typescript
if (last2.length < 2)     return null;
if (newer > older + 0.25) return 'up';
if (newer < older - 0.25) return 'down';
return 'flat';
```

### `avg_dcs_lifetime`
Single aggregation: `SUM(correct_answers) / SUM(total_questions) × 100` across all `DrillSession` rows for the student. This value is:
- Returned as `drill_stats.avg_dcs_lifetime`
- Reused directly as `ia_eligibility.avg_dcs`
- **Not recomputed separately** — one query, one result, two references.

### `ia_eligible` (in assessment-overview)
Computed per student from the `drillSession.groupBy` result:
```
eligible = drill_count ≥ 6  AND  days_since_first_drill ≥ 2  AND  avg_dcs ≥ 40%
```
The groupBy returns `_count.id`, `_sum.correct_answers`, `_sum.total_questions`, `_min.created_at` — all needed fields in one query.

### `current_band`
Mean of non-null, non-zero `band_score` values across the student's 4 `StudentCompetencyMatrix` rows, rounded to nearest 0.5:
```typescript
Math.round(mean * 2) / 2
```
Returns `null` if no competency data exists (student not yet diagnosed).

### `diagnostic_overview.baseline_bands`
Uses a `seenDiag` Set to keep only the **oldest** `AssessmentHistory` row per `(student_id, skill)` pair, since `assessmentHistory` is queried `orderBy: { created_at: 'asc' }`. This is the correct diagnostic baseline — it never picks up IA or Mock history by accident because `mode = 'DIAGNOSTIC'` filter is applied.

---

## Serialization Notes

Two Prisma types require explicit conversion before JSON response:

| Field | Prisma type | Serialized as |
|---|---|---|
| `real_band_score` | `Decimal` | `parseFloat(String(value))` |
| `ia_date` | `Date` (from `@db.Date`) | `.toISOString().split('T')[0]` → `"YYYY-MM-DD"` |
| `band_score` in competency | `Decimal` | `parseFloat(String(value))` |

Returning raw Prisma `Decimal` objects would cause serialization to `{}` in JSON — this is handled explicitly in all three functions.

---

## Response Shapes

### `GET /batches/:batchId/dashboard-summary`
```typescript
{
  success: true,
  data: {
    engagement_today: {
      active_students: number,    // students with ≥1 drill today
      avg_dcs: number,            // 0–100, IST today
      streaks_alive: number,      // daily_streak > 0
      platform_unlocked: number,  // ≥2 drills today
      active_yesterday: number,
      avg_dcs_yesterday: number,
    },
    at_risk: [{
      student_id, name, avatar,
      flags: string[],            // all matching risk conditions
      primary_flag: string,       // first/worst flag
      days_inactive: number,      // -1 = never drilled
      missed_ia_count: number,
      current_band: number | null,
    }],                           // max 6, sorted: undiagnosed first, then days_inactive desc
    band_overview: [{
      student_id, name, avatar,
      current_band: number | null,
      target_band: number | null,
      gap: number | null,         // target - current, positive = behind
      last_ia_date: "YYYY-MM-DD" | null,
      band_trend: "up" | "flat" | "down" | null,  // null if < 2 IAs
    }],                           // sorted by gap desc (widest first)
    period_summary: {
      ia_completed_last_7_days: number,   // rolling IST, not Mon–Sun
      ia_total_students: number,
      mock_completed_this_month: number,  // current YYYY-MM
      mock_total_students: number,
    }
  }
}
```

### `GET /batches/:batchId/students/:studentId/full-progress`
```typescript
{
  success: true,
  data: {
    student: { id, name, email, avatar },
    competency: StudentCompetencyMatrix[],  // band_score as number
    target_band: number | null,
    current_band: number | null,
    momentum_score: number,
    daily_streak: number,
    ia_sessions: [{
      id, ia_number, ia_date,    // ia_date as "YYYY-MM-DD"
      status, selected_subskills, scores,
      momentum_awarded, carry_forward_subskills, time_submitted_at
    }],
    mock_sessions: [{
      id, month_year, attempt_type, status,
      scores, real_band_score,   // as number
      momentum_awarded, time_submitted_at
    }],
    drill_stats: {
      last_14_days: [{ date: "YYYY-MM-DD", dcs: number | null, count: number }],
      sub_skill_counts: [{ sub_skill, count, avg_accuracy }],  // sorted by count desc
      streak_calendar: [{ date: "YYYY-MM-DD", active: boolean }],  // 30 entries
      total_drills_all_time: number,
      avg_dcs_lifetime: number,
    },
    lexigrid_stats: { games_last_14, avg_words_solved, bonus_rate },
    ia_eligibility: {
      prerequisites_met: boolean,
      avg_dcs: number,           // same value as drill_stats.avg_dcs_lifetime
      drills_completed: number,
      next_ia_date: "YYYY-MM-DD" | null,
    }
  }
}
```

### `GET /batches/:batchId/assessment-overview`
```typescript
{
  success: true,
  data: {
    ia_overview: [{
      student_id, name, avatar,
      ia_completed, ia_missed,
      last_ia_band: number | null,
      best_ia_band: number | null,
      avg_ia_band: number | null,
      last_ia_date: "YYYY-MM-DD" | null,
      ia_eligible: boolean,
    }],
    mock_overview: [{
      student_id, name, avatar,
      mock_count,
      latest_real_band: number | null,
      best_real_band: number | null,
      target_band: number | null,
    }],
    diagnostic_overview: [{
      student_id, name, avatar,
      is_diagnosed: boolean,
      baseline_bands: { L, R, W, S },   // null if skill not diagnosed
      diagnosed_at: "YYYY-MM-DD" | null,
    }],                           // sorted: undiagnosed first
    batch_ia_summary: {
      avg_band, completion_rate,  // completion_rate = % who have ≥1 IA done
      high_miss_count,            // students with ≥2 missed IAs
    },
    batch_mock_summary: {
      avg_real_band,
      at_or_above_target,
      no_mock_yet,
    }
  }
}
```

---

## Edge Cases Handled

| Scenario | Handling |
|---|---|
| Empty batch (no students enrolled) | Returns empty arrays + zero counts immediately, no downstream queries |
| Student not in `institute_students` | Gracefully excluded from aggregation (left join via `instStudents.map`) |
| Student has 0 IAs | `last_ia_band`, `best_ia_band`, `avg_ia_band` all return `null` |
| Student has 1 IA completed | `band_trend` returns `null` — never `"flat"` |
| Student has never drilled | `days_inactive` returns `-1` (sentinel for "never") |
| `band_score` is `null` in competency | Excluded from `current_band` mean; returns `null` if all are null |
| `real_band_score` Decimal type | Serialized with `parseFloat(String(v))` before response |
| `ia_date` Date type | Serialized with `.toISOString().split('T')[0]` |
| LexiGrid no data in 14 days | Returns `{ games_last_14: 0, avg_words_solved: 0, bonus_rate: 0 }` |
| All sub-skills excluded in DCS | `avg_dcs_lifetime` returns `0` when `lifetimeQuestions === 0` |
| Next IA date computation | Scans up to 60 future slots from first drill — if no future slot found returns `null` |

---

## What Was Intentionally Left Out

- **`ia_eligible` full accuracy in `full-progress`:** The field is computed there from all-time drill stats (correct per the plan). In `assessment-overview`, it uses `drillSession.groupBy` which gives count/sum/min in one shot — same logic, same result, different query shape. Consistent.

- **Legacy endpoint untouched:** `GET /batches/:batchId/analytics` (old `getBatchAnalytics`) is still wired. It uses `IeltsSpeakingAssessment` / `IeltsWritingAssessment` which the old dashboard uses. It was not deleted or modified — Phase 2 will simply stop calling it from the frontend.

- **No caching layer:** These endpoints are read-only aggregations. For the pilot with small batch sizes (< 50 students), the query load is negligible. Caching is a v2 concern.

- **No pagination:** All endpoints return full datasets. For the pilot this is fine. Pagination becomes necessary at > 200 students per batch.

---

## Files Changed

| File | Type | Lines |
|---|---|---|
| `src/controllers/instructorProgressController.ts` | **New** | ~420 |
| `src/routes/instructorRoutes.ts` | **Modified** | +13 lines (3 imports, 3 routes, comments) |

---

## Phase 2 Prerequisites Met

Phase 2 (Dashboard Page Rebuild) can start immediately. The frontend will call:

```typescript
GET /api/instructor/batches/:batchId/dashboard-summary
```

with `callBackend()` + the instructor's JWT, replacing the current calls to:
- `GET /api/instructor/batches` (still used for batch selector)
- `GET /api/instructor/batches/:batchId/analytics` (to be retired from dashboard)

The batch list endpoint (`GET /api/instructor/batches`) is unchanged and still provides the batch selector data. The new `dashboard-summary` endpoint provides everything else the dashboard needs.
