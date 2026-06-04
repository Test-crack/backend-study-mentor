# Instructor Dashboard — Full Revamp Plan v2
## Pilot-Ready, New System, Sellable

---

## Context: Why a Full Revamp

The current instructor dashboard is built entirely on the **old standalone assessment system**:
- `IeltsSpeakingAssessment` → standalone voice practice sessions
- `IeltsWritingAssessment` → manual writing tasks with instructor grading
- `IeltsReadingAssessment` → isolated reading speed tests
- `getBatchAnalytics` → aggregates these old models, hardcodes listening scores

**None of these are part of the active student learning path anymore.**

The new system that students are actually using:
- Daily Drill sessions with DCS scoring
- LexiGrid vocabulary game
- Internal Assessment (IA) — adaptive, 2 sub-skills per session, every 3 days
- Monthly Mock Test — full IELTS simulation
- StudentCompetencyMatrix — live band scores updated by IA/Mock
- Momentum score, daily streak, missed IA tracking

**The instructor dashboard needs to be rebuilt around what students are actually doing**, not what they used to do. The old Speaking/Reading/Writing progress tabs can be deprecated or replaced.

---

## Architecture Decision

**New backend endpoints** will NOT reuse `getBatchAnalytics` (old system). They'll be new controllers that aggregate from:
- `IASession`, `mockSessions`, `assessmentHistory` (new system)
- `drillSession`, `studentGameScore` (engagement)
- `StudentCompetencyMatrix`, `institute_students` (band scores, momentum, streak)
- `ielts_batch_students` → `institute_students` (linking batch → new system data)

The critical join: `ielts_batch_students.user_id` → `institute_students.user_id` → all new system tables.

### IST boundary rule (applies to ALL date-sensitive queries)
Any query that groups by "today" or "this week" **must** use `todayStartIST()` from `src/lib/timezone.ts` — NOT `new Date()` or `NOW()::date`. Using UTC midnight is wrong for India: a student drilling at 11pm IST on day N (= 5:30pm UTC) would fall into the previous UTC day, producing incorrect "today" counts. The existing `todayStartIST()` function already solves this — reuse it everywhere.

---

## Sidebar Navigation (Final)

```
Dashboard              ← rebuilt around new system
Batch Management       ← enhanced, new columns
Student Deep Dive      ← rebuilt around new system (renamed from "Student Progress")
Assessments            ← rebuilt as IA + Mock overview
Report                 ← new: batch performance PDF/summary
Settings               ← keep
──────────────────
[Workflow]             ← keep as-is, don't touch
```

Remove from sidebar: Course Management, Tech Prep, Alignment (already commented out — confirm removal).

---

## Page 1 — Dashboard (`/instructor/dashboard`)

### Current state
- 30% real (student comparison table from old analytics)
- 70% hardcoded: predicted dropoffs, course cards, at-risk table, recent activity, solutions, voice lab mock data
- Old system data even where "real"

### New layout — 5 sections

---

#### Section 1 — Header / Welcome
```
Welcome back, [Name]
[Batch selector pill tabs: Batch A | Batch B | Batch C]
```
- All sections below react to selected batch
- Default: first ACTIVE batch
- Batch data from existing `GET /api/instructor/batches`

---

#### Section 2 — Engagement Pulse (4 stat cards, today's data)

| Card | Metric | Source |
|---|---|---|
| Active Today | Students with ≥1 drill today | `drillSession.created_at` today |
| Avg DCS Today | Mean DCS across batch | `drillSession` today correct/total |
| Streaks Alive | Students with `daily_streak > 0` | `institute_students.daily_streak` |
| Platform Unlocked | Students with `drills_completed ≥ 2` today | `drillSession` today count |

Small trend arrow on each: vs. yesterday.

---

#### Section 3 — At-Risk Students (rule-based, real)

Replaces the hardcoded "Predicted Dropoff" alert entirely.

A list of students matching **any** of these conditions, with one-line reason:

| Condition | Flag Label |
|---|---|
| `daily_streak = 0` AND last drill > 3 days ago | "No activity for N days" |
| Missed ≥ 2 IAs (MISSED status count) | "Missed N internal assessments" |
| `current_band` dropped between last 2 IAs | "Band declining — was X, now Y" |
| `isDiagnosed = false` | "Not yet diagnosed" |
| `prerequisites_met = false` AND enrolled > 14 days | "IA prerequisites not met" |
| `momentum_score < 100` | "Low momentum — at disengagement risk" |

Each row:
```
[Avatar] Student Name    "Missed 3 internal assessments"    [View →]
```

Max 6 shown. Collapse if >6. Empty state: "All students in this batch are on track."

---

#### Section 4 — Batch Band Score Table

Replaces the hardcoded at-risk table. Shows every student in the batch:

| Student | Current Band | Target Band | Gap | Last IA | Trend |
|---|---|---|---|---|---|
| Arjun Mehta | 6.0 | 7.5 | −1.5 | 2 days ago | ↑ |
| Sneha Reddy | 5.5 | 7.0 | −1.5 | 5 days ago | → |

- Gap colored: rose (>2), amber (1–2), emerald (<1)
- Trend arrow: compare last 2 IA band scores (up/flat/down)
- Click row → opens Student Deep Dive page
- Sorted by gap (widest first by default)

---

#### Section 5 — Period Summary (2 simple fact rows)

```
Internal Assessments this week:   12 / 18 completed  (67%)   [View breakdown →]
Mock Tests this month:             5 / 18 completed  (28%)   [View breakdown →]
```

Not charts. Just numbers. Clean.

---

### Sections to REMOVE entirely
- Predicted Dropoff cards (hardcoded Voice Lab references)
- Course Overview cards (courses not in new system)
- Solutions for Tutors suggestions (generic, unhelpful)
- Recent Activity feed (no real source, adds noise)
- Voice Lab sessions table (old system)
- Trajectory/Topic/Session mock charts
- Student analytics modal (replaced by dedicated Student Deep Dive page)

---

### New backend endpoint

```
GET /api/instructor/batches/:batchId/dashboard-summary

Authorization: instructor must be assigned to this batch
  → verify ielts_batch_instructors row for (batchId, instructorId)

IST boundary: all "today" queries use todayStartIST() from lib/timezone.ts
  → DO NOT use new Date() or new Date().setHours(0,0,0,0) — these are UTC on server

Returns:
{
  engagement_today: {
    // "today" = drillSession.created_at >= todayStartIST()
    active_students: number,       // students with ≥1 drill session today
    avg_dcs: number,               // mean (correct/total × 100) across all today's drill sessions
    streaks_alive: number,         // students where institute_students.daily_streak > 0
    platform_unlocked: number,     // students with ≥2 drill sessions today
    // "yesterday" = [todayStartIST() - 24h, todayStartIST()) for trend arrows
    active_yesterday: number,
    avg_dcs_yesterday: number,
  },
  at_risk: [
    {
      student_id: string,
      name: string,
      avatar: string | null,
      flags: string[],           // e.g. ["Missed 3 IAs", "No activity 5 days"]
      primary_flag: string,      // worst/most actionable
      days_inactive: number,
      missed_ia_count: number,
      current_band: number | null,
    }
  ],
  band_overview: [
    {
      student_id: string,
      name: string,
      avatar: string | null,
      current_band: number | null,
      target_band: number | null,
      gap: number | null,
      last_ia_date: string | null,
      // Derived from last 2 COMPLETED IA band averages.
      // null when student has 0 or 1 completed IA — do NOT default to "flat".
      // Frontend: show no arrow when null.
      band_trend: "up" | "flat" | "down" | null,
    }
  ],
  period_summary: {
    // "last 7 days" = rolling IST: todayStartIST() - 7 days (not Mon–Sun calendar week)
    // Frontend label: "Last 7 days" not "This week"
    ia_completed_last_7_days: number,
    ia_total_students: number,
    mock_completed_this_month: number,   // month_year = current YYYY-MM
    mock_total_students: number,
  }
}
```

---

## Page 2 — Batch Management (`/instructor/batches`)

### Current state
100% real. Works. Just missing context from the new system.

### Enhancements only (no new endpoints needed — batch data already fetched)

**Add to each student row in the batch:**
- **Band pill**: fetched via `GET /api/instructor/batches/:batchId/dashboard-summary` (band_overview), show `current_band` as a colored chip
- **Streak**: 🔥 N or a grey dash
- **Last active**: "2 days ago" / "Today" / "7 days ago" — from `drillSession.created_at`
- **IA status**: green dot (completed this IA) / red dot (missed last IA) / grey (not yet eligible)

This enrichment comes from the `dashboard-summary` endpoint already planned for Page 1 — no extra backend call.

**Add a batch-level summary bar** above the student list:
```
18 students  ·  Avg Band: 6.2  ·  12 active this week  ·  3 at risk
```

---

## Page 3 — Student Deep Dive (`/instructor/batches/:batchId/students/:studentId/progress`)

### Current state
Built around `IeltsSpeakingAssessment`, `IeltsReadingAssessment`, `IeltsWritingAssessment` — old standalone practice sessions. These tabs (Speaking / Reading / Writing) show data from a system students aren't actively using.

### Full rebuild — 4 tabs

---

#### Tab 1 — Overview

**Top row — 4 stat cards:**
- Current Band (from competency matrix)
- Target Band (from institute_students)
- Momentum Score
- Daily Streak

**Band Radar / Bar Chart:**
- Listening | Reading | Writing | Speaking — current vs. target
- Simple horizontal bar chart (4 bars, current = filled, target = outline)

**IA Timeline strip:**
```
IA#1  IA#2  IA#3  IA#4  IA#5  IA#6  [future]
 ✓     ✓     ✗     ✓     ✗     ✓     •
```
- Green = COMPLETED, Red = MISSED, Grey dot = upcoming
- Hover shows date + band score

**Quick stats row:**
- IAs completed / total scheduled
- Average IA band score
- Drills this week
- Last active: N days ago

---

#### Tab 2 — Internal Assessments

**Table — one row per IA session:**

| IA # | Date | Status | Sub-skills | Band | Momentum | Trend |
|---|---|---|---|---|---|---|
| #7 | 2 Jun | Completed | Grammar · Fluency | 6.5 | +175 | ↑ |
| #6 | 29 May | Missed | — | — | −20 | — |
| #5 | 26 May | Completed | Vocabulary · Coherence | 6.0 | +100 | → |

**Expandable row** (on click):
- Sub-skill breakdown: each sub-skill with band + correct/total
- AI Feedback rationale (if ai_graded = true)
- Key Observations bullet list
- Carry-forward chips (if MISSED)

**At the bottom:**
- Sub-skill trend mini-chart: Grammar band over last 6 IAs (one line per sub-skill tracked)

---

#### Tab 3 — Mock Tests

**IELTS Overall band progression** — simple line chart (one dot per mock, x = month)

**Table — one row per mock:**

| Month | Type | Overall Band | L | R | W | S | Momentum |
|---|---|---|---|---|---|---|---|
| May 2026 | Standard | 6.5 | 7.0 | 7.0 | 6.0 | 6.0 | +150 |
| Apr 2026 | Earned | 6.0 | 6.5 | 6.5 | 5.5 | 5.5 | +150 |

**Expandable row:**
- Per-skill AI feedback summary
- Sub-skill scores where available

---

#### Tab 4 — Drills & Engagement

**DCS Trend — last 14 days:**
- Bar chart: each bar = one day, height = DCS% that day, color: rose(<40), amber(40–70), emerald(70+)
- Grey bar = no drill that day

**Sub-skill coverage donut/bar:**
- How many drills per sub-skill (Grammar: 12, Vocabulary: 8, Fluency: 6, ...)
- Shows tutor if student is avoiding certain sub-skills

**Engagement streak calendar:**
- 30-day grid, each cell = circle colored green (drilled) / grey (no drill)

**LexiGrid stats:**
- Games played last 14 days
- Average words solved
- Bonus rate %

---

### New backend endpoint

```
// ⚠️  Route uses batchId — no reverse lookup needed, auth is O(1).
GET /api/instructor/batches/:batchId/students/:studentId/full-progress

Authorization:
  Step 1 → verify ielts_batch_instructors row for (batchId, instructorId)
  Step 2 → verify ielts_batch_students row for (batchId, studentId)
  Both must exist. If either is missing → 403.
  This is strictly more secure than a reverse lookup and makes
  the frontend URL self-documenting (the batch context is always known).

IST boundary: drill_stats day grouping uses todayStartIST() anchor,
  counting backward 14/30 days using IST calendar dates (YYYY-MM-DD strings).

Returns:
{
  student: { id, name, email, avatar },
  competency: StudentCompetencyMatrix[],  // 4 rows (L/R/W/S)
  target_band: number,
  current_band: number,
  momentum_score: number,
  daily_streak: number,
  ia_sessions: [
    {
      id, ia_number, ia_date, status,
      selected_subskills, scores,
      momentum_awarded, carry_forward_subskills,
      time_submitted_at
    }
  ],
  mock_sessions: [
    {
      id, month_year, attempt_type, status,
      scores, real_band_score, momentum_awarded,
      time_submitted_at
    }
  ],
  drill_stats: {
    last_14_days: [
      { date: "YYYY-MM-DD", dcs: number | null, count: number }
      // dcs = null means no drills that day (show grey bar on frontend)
      // Uses IST calendar dates, NOT UTC dates
    ],
    sub_skill_counts: [
      { sub_skill: string, count: number, avg_accuracy: number }
    ],
    streak_calendar: [
      { date: "YYYY-MM-DD", active: boolean }   // last 30 IST calendar days
    ],
    total_drills_all_time: number,
    avg_dcs_lifetime: number,   // mean across ALL drill sessions lifetime
  },
  lexigrid_stats: {
    games_last_14: number,
    avg_words_solved: number,
    bonus_rate: number,
  },
  ia_eligibility: {
    prerequisites_met: boolean,
    // avg_dcs here = same value as avg_dcs_lifetime above — do NOT recompute.
    // Derive from the drill_stats aggregation to keep one consistent number.
    avg_dcs: number,
    drills_completed: number,
    next_ia_date: string | null,
  }
}
```

---

## Page 4 — Assessments (`/instructor/assessments`)

### Current state
100% fake. 12 hardcoded students. "Add Offline Marks" modal saves to local state only.

### Full rebuild — 3 sub-tabs on a batch-aware layout

**Top bar:** Batch selector + Search students

---

#### Sub-tab A — Internal Assessments

Shows every student in the batch with their IA stats:

| Student | IAs Done | IAs Missed | Last Band | Best Band | Avg Band | Last IA | Action |
|---|---|---|---|---|---|---|---|
| Arjun Mehta | 6 | 1 | 6.5 | 7.0 | 6.2 | 2 Jun | View → |
| Sneha Reddy | 4 | 3 | 5.5 | 6.0 | 5.8 | 29 May | View → |
| Not started | 0 | 0 | — | — | — | — | Not eligible |

- Sortable by any column
- "Missed" count shown in rose if ≥ 2
- "View →" opens Student Deep Dive > IA tab
- "Not eligible" row shown for students who haven't met prerequisites

**Batch-level summary above table:**
```
Batch avg band: 6.1  ·  Completion rate: 72%  ·  3 students with ≥2 missed IAs
```

---

#### Sub-tab B — Mock Tests

| Student | Mocks Taken | Latest Band | Best Band | Target | Gap | Status |
|---|---|---|---|---|---|---|
| Arjun Mehta | 2 | 6.5 | 6.5 | 7.5 | −1.0 | On track |
| Sneha Reddy | 1 | 5.5 | 5.5 | 7.0 | −1.5 | At risk |
| Vikram Kumar | 0 | — | — | 6.5 | — | No mock yet |

- Gap column: color coded (rose > 2.0, amber 1.0–2.0, emerald < 1.0)
- "No mock yet" students shown with grey styling
- "View →" opens Student Deep Dive > Mock tab

**Batch-level summary:**
```
Batch avg real band: 6.1  ·  5/18 at or above target  ·  3 haven't taken mock yet
```

---

#### Sub-tab C — Diagnostics

| Student | Diagnosed | L | R | W | S | Baseline Date |
|---|---|---|---|---|---|---|
| Arjun Mehta | ✓ | 6.5 | 7.0 | 5.5 | 6.0 | 1 Apr 2026 |
| Sneha Reddy | ✗ | — | — | — | — | Not yet |

- One row per student
- Non-diagnosed students shown first, highlighted
- Useful for telling tutors "go push these 3 students to complete onboarding"

---

### New backend endpoint

```
GET /api/instructor/batches/:batchId/assessment-overview

Authorization: instructor must be in this batch

Returns:
{
  ia_overview: [
    {
      student_id, name, avatar,
      ia_completed: number,
      ia_missed: number,
      last_ia_band: number | null,
      best_ia_band: number | null,
      avg_ia_band: number | null,
      last_ia_date: string | null,
      ia_eligible: boolean,
    }
  ],
  mock_overview: [
    {
      student_id, name, avatar,
      mock_count: number,
      latest_real_band: number | null,
      best_real_band: number | null,
      target_band: number | null,
    }
  ],
  diagnostic_overview: [
    {
      student_id, name, avatar,
      is_diagnosed: boolean,
      baseline_bands: { L: number|null, R: number|null, W: number|null, S: number|null },
      diagnosed_at: string | null,
    }
  ],
  batch_ia_summary: {
    avg_band: number,
    completion_rate: number,
    high_miss_count: number,   // students with ≥2 missed
  },
  batch_mock_summary: {
    avg_real_band: number,
    at_or_above_target: number,
    no_mock_yet: number,
  }
}
```

---

## Page 5 — Report (`/instructor/reports`)

### Current state
Unknown — not in scope of audit.

### New: Batch Snapshot Report

A single-page printable/shareable summary for each batch. **Not a full analytics dashboard — just a snapshot.**

**Sections:**
1. Batch header: name, instructor(s), student count, **"Generated at [date] [time] IST"** — prominently displayed
2. Engagement last 7 days: active students, avg DCS, streak distribution
3. IA performance: completion rate, avg band, top 3 / bottom 3 by band
4. Mock performance: avg real band, students above/below target
5. At-risk list: students matching risk flags

**Implementation:** Render a clean card layout (printable with `window.print()`). Use data from `dashboard-summary` + `assessment-overview` endpoints — no new endpoint needed.

**⚠️ Report freshness note:** Both endpoints are live queries — the data shown is a point-in-time snapshot at the moment the page is opened. The "Generated at" timestamp must be stamped **client-side at render time** (not from the server), and displayed at the top of the report so anyone reading a printed copy knows exactly when the data was captured. This is critical for pilot demos where tutors share screenshots/printouts.

---

## Backend Implementation Plan

### New controller file: `instructorProgressController.ts`

Three functions, all with the same authorization pattern:
```typescript
// Auth check pattern for all three:
const instructor = /* look up instructor via appUserId */
const batch = await prisma.ielts_batches.findUnique({ where: { id: batchId } })
const isMember = await prisma.ielts_batch_instructors.findUnique({
  where: { batch_id_user_id: { batch_id: batchId, user_id: instructor.id } }
})
if (!isMember) return 403
```

**Function 1: `getBatchDashboardSummary`**
Data joins needed:
- `ielts_batch_students` → `institute_students` (streak, momentum, isDiagnosed)
- `drillSession` (today's drills, DCS)
- `IASession` (missed count, last band, trend)
- `StudentCompetencyMatrix` (current_band, target_band)

**Function 2: `getStudentFullProgress`**
Data joins needed:
- `institute_students` → `StudentCompetencyMatrix`
- `IASession` (all for student)
- `mockSessions` (all for student)
- `drillSession` (last 14 days grouped by date)
- `studentGameScore` (LexiGrid last 14 days)

**Function 3: `getBatchAssessmentOverview`**
Data joins needed:
- `ielts_batch_students` → `institute_students` (isDiagnosed, target_band)
- `IASession` (count by status, last/best/avg band)
- `mockSessions` (count, latest/best real_band_score)
- `assessmentHistory` (diagnostic baseline)
- `StudentCompetencyMatrix` (current_band)

### Route additions to `instructorRoutes.ts`
```typescript
GET  /batches/:batchId/dashboard-summary                    → getBatchDashboardSummary
GET  /batches/:batchId/students/:studentId/full-progress    → getStudentFullProgress
GET  /batches/:batchId/assessment-overview                  → getBatchAssessmentOverview
```

### Implementation notes per function

**getBatchDashboardSummary:**
- `engagement_today`: use `todayStartIST()` as the lower bound for `drillSession.created_at >= X`. For "yesterday" use `[todayStartIST() - 24h, todayStartIST())` as the window.
- `band_trend`: query last 2 `IASession` rows where `status = COMPLETED`, ordered by `ia_date DESC`. If count < 2 → return `null`. If avg_band[0] > avg_band[1] + 0.25 → `"up"`. If avg_band[0] < avg_band[1] - 0.25 → `"down"`. Otherwise `"flat"`. The 0.25 threshold avoids noise from rounding.
- `period_summary`: use rolling 7 IST days (`todayStartIST() - 7 days`). Return field name `ia_completed_last_7_days`, not `ia_completed_this_week`.

**getStudentFullProgress:**
- Auth: two-step check — instructor in batch AND student in batch (both via `ielts_batch_instructors` / `ielts_batch_students`).
- `drill_stats.avg_dcs_lifetime`: compute once as `SUM(correct_answers) / SUM(total_questions) × 100` across all drillSessions for this student. Reuse this value in `ia_eligibility.avg_dcs` — **do not run a second aggregation query**.
- `drill_stats.last_14_days`: iterate IST calendar dates from today-13 to today. For each date, sum correct/total from drillSessions on that IST day. Missing days → `{ date, dcs: null, count: 0 }`. Use `toISTDateString()` from `lib/timezone.ts` for consistent date keys.

**getBatchAssessmentOverview:**
- Same two-step auth: instructor in batch → get all studentIds from batch → query their data.
- `ia_overview.last_band`: from the most recent COMPLETED `IASession` for this student (average of that session's `scores[].band`).
- `ia_overview.avg_band`: mean of all COMPLETED IASession average bands.
- `diagnostic_overview.baseline_bands`: from `assessmentHistory` where `mode = DIAGNOSTIC`, one row per skill, take the oldest (first) per skill.

---

## What Happens to the Old System

| Old endpoint | Status | Action |
|---|---|---|
| `GET /batches/:batchId/analytics` | Keep but deprecate | Leave it — doesn't break anything. Unused after revamp. |
| `GET /students/:studentId/speaking-history` | Keep | Powers old speaking tab if we keep it as a legacy tab |
| `GET /students/:studentId/reading-history` | Keep | Same — legacy |
| `GET /students/:studentId/writing-history` | Keep | Same — legacy |
| `PATCH /writing-assessment/:id/grade` | Keep | Manual grading still valid for old writing tasks |

The old StudentProgress tabs (Speaking / Reading / Writing) can be either:
- **Option A:** Remove entirely — students aren't actively using these features
- **Option B:** Keep as a collapsed "Legacy Practice History" section at the bottom of the new Overview tab

**Recommendation: Option B for pilot** — preserves historical data visibility, adds zero development work, no risk of breaking existing functionality.

---

## Frontend Component Plan

### New files to create:
```
src/features/instructor/components/
  InstructorDashboardPage.tsx               ← full rewrite
  InstructorStudentProgressPage.tsx         ← full rewrite (4 tabs)
    // Route: /instructor/batches/:batchId/students/:studentId/progress
    // batchId in URL → passed to backend for O(1) auth, no reverse lookup
  assessments/InstructorAssessmentPage.tsx  ← full rewrite (3 sub-tabs)

  dashboard/
    BatchSelector.tsx                  ← reusable batch pill tabs
    EngagementPulseCards.tsx           ← 4 stat cards
    AtRiskStudentList.tsx              ← rule-based flags list
    BandOverviewTable.tsx              ← student band table
    PeriodSummaryRow.tsx               ← IA/Mock completion numbers

  student-progress/
    ProgressOverviewTab.tsx            ← radar + IA timeline + quick stats
    IAHistoryTab.tsx                   ← IA table + expandable rows
    MockHistoryTab.tsx                 ← Mock table + band progression
    DrillEngagementTab.tsx             ← DCS bars + sub-skill coverage + calendar

  assessments/
    IAOverviewTab.tsx
    MockOverviewTab.tsx
    DiagnosticsTab.tsx
```

### Modified files:
```
InstructorBatchView.tsx     ← add band/streak/last-active/IA-status columns
InstructorSidebar.tsx       ← update nav labels (rename "Student Assessments" → "Assessments")
```

---

## Implementation Order (Phases)

### Phase 1 — Backend (1.5 days)
1. `instructorProgressController.ts` — 3 functions
2. Wire to `instructorRoutes.ts`
3. Test each endpoint with Postman

### Phase 2 — Dashboard Page Rebuild (1 day)
1. Section 2: Engagement Pulse cards (real data)
2. Section 3: At-Risk list (rule-based)
3. Section 4: Band Overview table
4. Section 5: Period Summary row
5. Remove all hardcoded sections

### Phase 3 — Student Deep Dive Rebuild (1.5 days)
1. Tab 1: Overview (radar + IA timeline)
2. Tab 2: Internal Assessments table
3. Tab 3: Mock Tests table
4. Tab 4: Drills & Engagement

### Phase 4 — Assessments Page Rebuild (1 day)
1. Sub-tab A: IA overview
2. Sub-tab B: Mock overview
3. Sub-tab C: Diagnostics

### Phase 5 — Batch Management Enhancements (0.5 day)
1. Add band/streak/last-active/IA-status to student rows
2. Add batch summary bar

### Phase 6 — Report Page (0.5 day)
1. Static render of batch snapshot using existing endpoint data
2. Print stylesheet

**Total estimate: ~6 developer days**

---

## Design Tokens (to match student dashboard aesthetic)

The instructor dashboard should use the same design language as the student dashboard:
- `bg-white dark:bg-slate-900` cards
- `rounded-2xl border border-slate-200 dark:border-slate-800`
- Rose/Amber/Emerald for risk/caution/good
- Indigo for IA, Purple for Mock, Sky for Drill
- Zap icon for momentum, Flame for streak
- `font-black` headings, `font-semibold` body

---

## Pilot Readiness Checklist

**Functionality:**
- [ ] Dashboard shows real batch data, no hardcoded names
- [ ] At-risk list uses rule-based detection from DB
- [ ] Band overview table has all batch students with real scores
- [ ] Student Deep Dive shows IA + Mock + Drill history
- [ ] Assessments page has IA + Mock + Diagnostic overview per batch
- [ ] Batch Management has band/streak columns
- [ ] No "Predicted Dropoff" fake AI alerts
- [ ] No hardcoded student names (Sneha Reddy, Arjun Mehta etc.)
- [ ] No old system Voice Lab / Reading Speed / Writing tabs as primary UX
- [ ] All pages handle empty states (no data yet)
- [ ] Loading skeletons on all data-fetching sections

**Correctness (from flag review):**
- [ ] Student Deep Dive route is `/instructor/batches/:batchId/students/:studentId/progress` (batchId in URL, not reverse lookup)
- [ ] `band_trend` returns `null` when student has < 2 completed IAs — frontend shows no arrow
- [ ] All "today" queries use `todayStartIST()` from `lib/timezone.ts` — no UTC midnight
- [ ] Dashboard period summary field is `ia_completed_last_7_days` (rolling IST, not Mon–Sun)
- [ ] `ia_eligibility.avg_dcs` reuses `drill_stats.avg_dcs_lifetime` — no second aggregation query
- [ ] Report page stamps client-side "Generated at [datetime] IST" prominently
