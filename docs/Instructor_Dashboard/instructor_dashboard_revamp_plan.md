# Instructor Dashboard — Pilot Revamp Plan

## Guiding Principle
The current dashboard was built for a different product (Voice Lab, manual writing grading, course management). The new system is entirely drill → LexiGrid → IA → Mock → Band Score. This revamp discards the old mock data, keeps the pages that still make sense, and rebuilds the rest around real data from the student feature system.

**Pilot scope:** Insightful and accurate. Not feature-complete. Leave hooks for future integrations rather than building everything.

---

## What Stays, What Goes, What Gets Built

| Page | Current State | Pilot Action |
|---|---|---|
| **Dashboard** | ~30% real, full of hardcoded AI alerts | **Full rebuild** — real data, new layout |
| **Batch Management** | 100% real | **Keep as-is**, minor enhancement |
| **Student Progress** | Real but old system (Voice Lab, manual writing) | **Rebuild** — new system tabs |
| **Assessments** | 100% mock, no backend | **Repurpose** — show IA + Mock data per batch |
| **Report** | Unknown | **Defer** — placeholder for v2 |
| **Settings / Workflow / Tech Prep** | Legacy | **Keep but don't touch** |

---

## Page-by-Page Plan

---

### Page 1 — Dashboard (`/instructor/dashboard`)

**What it should show (pilot):**

#### Section A — Welcome Banner (real)
- "Welcome back, [name]"
- Dynamic subtitle: "You have **N students** across **M batches**. **K** haven't drilled today."
- Data: batch count + student count from existing `/api/instructor/batches`

#### Section B — Batch Selector
- Dropdown or tab pills to switch between instructor's batches
- All sections below filter by selected batch
- Default: first/most active batch

#### Section C — Today's Engagement Strip (new endpoint needed)
Four stat cards, all real:
| Card | Data Source |
|---|---|
| Drills Completed Today | Count of students with `drills_completed_today ≥ 2` |
| Avg DCS Today | Mean `daily_dcs` across batch |
| Students Active Today | Count who have any drill session today |
| Streak > 0 | Count of students with `daily_streak > 0` |

#### Section D — At-Risk Students (rule-based, real)
Replace the hardcoded "Predicted Dropoff" with real flags.
Show a list of students matching any of:
- `daily_streak = 0` AND `last_streak_date < 3 days ago`
- Missed ≥ 2 IAs (from `IASession` count where status=MISSED)
- `current_band` declining over last 3 IAs
- Not diagnosed yet (`isDiagnosed = false`)
- `dashboard_unlocked = false` for 3+ consecutive days (no drill data)

Each row: student name + avatar initials + **one-line reason** + "View Student →" link.

#### Section E — Batch Band Score Summary (real)
- A simple table or card grid: each student in selected batch with:
  - Name | Current Band | Target Band | Gap | Last IA date
- Sorted by gap (widest gap first)
- Replaces the hardcoded "At-risk students" table

#### Section F — IA & Mock Activity (real)
- This month's IA completion rate: `X / Y students completed their last IA`
- This month's mock status: `X / Y students completed mock for [month]`
- These are 2 numbers, not charts. Simple, factual.

#### Remove entirely:
- Predicted Dropoff AI alerts (replace with Section D above)
- Course Overview cards (courses aren't part of the new system)
- Solutions for Tutors suggestions (generic noise)
- Recent Activity feed (no real data source, defer to v2)
- Voice Lab metrics (old system)
- Topic/Session/Trajectory mock charts

**New backend endpoint needed:**
```
GET /api/instructor/batches/:batchId/daily-summary
Returns:
  - students_active_today: number
  - drills_completed_today: number   (count where drills≥2)
  - avg_dcs_today: number
  - streak_active_count: number
  - at_risk: StudentRiskFlag[]       (rule-based, see Section D)
  - ia_completion_this_period: { completed: number, total: number }
  - mock_completion_this_month: { completed: number, total: number }
  - band_overview: StudentBandRow[]  (name, current_band, target_band, last_ia_date)
```

---

### Page 2 — Batch Management (`/instructor/batches`)

**Current state:** 100% real — keep mostly as-is.

**Minor enhancements (no new backend):**
- Add a "Band" column to the student list table using competency data (already in existing batch analytics endpoint)
- Add a "Last Active" column (last drill `created_at`)
- Add a "Streak" badge next to student name
- Clicking a student navigates to the new Student Progress page

**No new backend needed** — existing `/api/instructor/batches` returns student data. Enhance the UI only.

---

### Page 3 — Student Progress (`/instructor/student/:studentId/progress`)

**Current state:** Built around old Voice Lab / manual writing system. Needs complete rebuild to show new system data.

**New layout — 4 tabs:**

#### Tab 1 — Overview
- Band Score radar/bar: Listening / Reading / Writing / Speaking vs. target
- Key stats row: Current Band | Momentum | Streak | Drills This Week
- IA Timeline: strip of IA #1, #2, #3… colored COMPLETED (green) / MISSED (red) / PENDING (grey)
- Next IA date + eligibility status (prerequisites met?)

#### Tab 2 — Internal Assessments (IA)
- Table of all IA sessions: Date | IA # | Status | Sub-skills tested | Band | Momentum
- Expandable row shows sub-skill scores + AI feedback
- MISSED rows show carry-forward sub-skills in rose chips
- "0 sessions" empty state if not yet started

#### Tab 3 — Mock Tests
- Table of all mock sessions: Month | Type | Band | L | R | W | S scores | Momentum
- Expandable row shows per-skill AI feedback
- Real band score shown prominently

#### Tab 4 — Drills & Engagement
- DCS trend: last 14 days as simple bar chart (date × DCS%)
- Sub-skill drill distribution: which sub-skills drilled most (horizontal bar)
- Daily streak history: consecutive days strip (last 30 days)
- LexiGrid completion rate: last 14 days

**New backend endpoint needed:**
```
GET /api/instructor/students/:studentId/full-progress
Returns:
  - competency: StudentCompetencyMatrix[]  (band per skill, sub-scores)
  - target_band: number
  - current_band: number
  - momentum_score: number
  - daily_streak: number
  - ia_sessions: IASession[]              (all, ordered newest first)
  - mock_sessions: MockSession[]          (all, ordered newest first)
  - drill_summary: {
      drills_last_14_days: { date, dcs, count }[],
      sub_skill_breakdown: { sub_skill, total_drills, avg_accuracy }[],
      streak_history: { date, active }[]   (last 30 days)
    }
  - ia_status: {
      prerequisites_met, next_ia_date, is_ia_day,
      avg_dcs, drills_completed
    }
```

Authorization: instructor must be in a batch with this student.

---

### Page 4 — Assessments (`/instructor/assessments`)

**Current state:** 100% mock. Needs full replacement.

**New purpose:** A batch-level view of IA and Mock performance — not an individual assessment grading tool (that lives in Student Progress).

**New layout:**

#### Sub-tab A — Internal Assessments
- Batch selector at top
- Table: one row per student
  - Student Name | IAs Completed | IAs Missed | Last IA Band | Best Band | Avg Band | Last IA Date
- Sortable columns
- Click row → goes to Student Progress > IA tab

#### Sub-tab B — Mock Tests
- Same batch selector
- Table: one row per student
  - Student Name | Mocks Taken | Latest Real Band | Best Real Band | Target Band | Gap
- Gap column colored: red (>1.5), amber (0.5–1.5), green (≤0.5)

#### Sub-tab C — Diagnostics
- Table: one row per student
  - Student Name | Diagnosed? | Baseline L/R/W/S bands | Diagnosis Date
- Quickly shows which students still haven't been diagnosed

**New backend endpoint needed:**
```
GET /api/instructor/batches/:batchId/assessment-overview
Returns:
  - ia_overview: {
      student_id, student_name, avatar,
      completed_count, missed_count,
      last_band, best_band, avg_band, last_ia_date
    }[]
  - mock_overview: {
      student_id, student_name, avatar,
      mock_count, latest_real_band, best_real_band, target_band
    }[]
  - diagnostic_overview: {
      student_id, student_name, is_diagnosed,
      baseline_bands: { L, R, W, S }, diagnosed_at
    }[]
```

---

## New Backend Endpoints Summary

| Endpoint | Purpose | Priority |
|---|---|---|
| `GET /api/instructor/batches/:batchId/daily-summary` | Dashboard page data | P0 |
| `GET /api/instructor/students/:studentId/full-progress` | Student progress page | P0 |
| `GET /api/instructor/batches/:batchId/assessment-overview` | Assessments page | P1 |

All three reuse data from existing student endpoints — they're aggregation/admin-scoped versions of what `/api/student/*` already returns. Key difference: they're called with the instructor's JWT but fetch another student's data (authorization via batch membership check).

---

## Sidebar Navigation Cleanup

Current sidebar items that need to stay for pilot:
```
Dashboard          ← rebuilt
Batch Management   ← kept as-is
Student Progress   ← rebuilt (accessed via batch/student drill-down)
Assessments        ← rebuilt
```

Current sidebar items to keep but deprioritize (don't rebuild, don't break):
```
Report      ← placeholder, link to "coming soon"
Settings    ← keep
Workflow    ← keep (if functional)
```

Items to remove from sidebar (old system):
```
Tech Prep   ← legacy, remove from nav
Alignment   ← legacy, remove from nav
```

---

## Implementation Order

### Phase 1 — Backend (3 endpoints, ~1 day)
1. `GET /api/instructor/batches/:batchId/daily-summary`
2. `GET /api/instructor/students/:studentId/full-progress`
3. `GET /api/instructor/batches/:batchId/assessment-overview`

### Phase 2 — Dashboard page rebuild (~1 day)
Replace hardcoded sections with real data from daily-summary endpoint.

### Phase 3 — Student Progress page rebuild (~1 day)
Replace old Voice Lab / manual writing tabs with new 4-tab layout.

### Phase 4 — Assessments page rebuild (~half day)
Replace mock table with real batch IA/Mock/Diagnostic overview.

### Phase 5 — Batch Management enhancements (~2 hours)
Add Band, Last Active, Streak columns. Wire student click to new progress page.

---

## What We're NOT Building (Pilot Scope)

- **AI Predicted Dropoffs** — the current hardcoded version references "Voice Lab latency" which doesn't exist in the new system. Real ML-based dropout prediction is v2. For pilot, rule-based at-risk flags are enough.
- **Real-time notifications** — no WebSocket push for "student just submitted IA". Static data refresh on page load.
- **Manual assessment grading** — the old offline grading modal (InstructorAssessmentPage) is dead code. Don't rebuild it yet; IA/Mock are auto-graded.
- **Course management** — not part of the current system.
- **Recommendation deployment** — the "Deploy" button on the current dashboard's alert cards. Defer to v2.
- **Batch creation/editing** — already in InstituteAdmin dashboard. Instructors are view-only on batch structure.

---

## Files to Create / Modify

### New files:
- `backend/src/controllers/instructorProgressController.ts` — 3 new endpoints
- `backend/src/routes/instructorRoutes.ts` — add 3 new routes

### Files to rewrite:
- `frontend/src/features/instructor/components/InstructorDashboardPage.tsx`
- `frontend/src/features/instructor/components/InstructorStudentProgressPage.tsx`
- `frontend/src/features/instructor/components/assessments/InstructorAssessmentPage.tsx`

### Files to enhance (smaller changes):
- `frontend/src/features/instructor/components/InstructorBatchView.tsx` — add columns

### Files to leave untouched:
- `InstructorCourseManagementPage.tsx`
- `TechPrepPage.tsx`
- `AlignmentPage.tsx`
- `InstructorReport.tsx`
- `Workflow.tsx`
