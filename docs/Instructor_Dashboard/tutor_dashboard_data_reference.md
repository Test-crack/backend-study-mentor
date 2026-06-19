# Tutor Dashboard Data Reference
## For Instructor Dashboard Design

This document describes every backend data source powering the tutor (instructor) dashboard — what each endpoint returns, how data is computed, and which metrics to surface on each view. Read alongside `student_feature_data_reference.md` for the student-side data model.

> **Architecture note:** The tutor dashboard uses four purpose-built endpoints under `/api/instructor/`. The older practice-session analytics endpoints (`/analytics`, `/reading-analytics`, per-student history, manual grading) still exist in the backend and are routed under `/api/instructor/` — but they are **not used by the tutor dashboard frontend**. They currently serve the Institute Owner's `BatchAnalyticsView` component (which is itself still on mock data). They are documented separately at the end of this file for completeness. Do not build new tutor dashboard features on top of them.

---

## Active Endpoints (Tutor Dashboard)

These are the four endpoints the tutor dashboard frontend (`src/features/instructor/`) actually calls.

---

### 1. Batch List

**What it is:** Entry point — the tutor selects one of their assigned batches and all subsequent data is scoped to it.

**Endpoint:** `GET /api/instructor/batches`  
**Frontend hook:** `useInstructorBatches()`

**Returns:**
```typescript
data: [{
  id, name, description, status,
  maxStudents, createdAt,
  institute: { id, name },
  instructorCount, studentCount,
  instructors: [{ userId, name, email, profileImage }],
  students:    [{ userId, name, email, phone, profileImage, enrolledAt }]
}]
```

**Key fields:**
| Field | Use case |
|---|---|
| `studentCount` | Batch size chip in the selector |
| `students[]` | Populates student dropdowns and progress tables |
| `status` | Surface inactive/closed batches differently |
| `institute.name` | If tutor teaches across institutes |

**Auth:** `INSTRUCTOR` or `ADMIN` role. Returns only batches where the calling user appears in `ielts_batch_instructors`.

---

### 2. Batch Dashboard Summary

**What it is:** The primary landing view. Aggregates today's engagement pulse, at-risk students, band overview table, and a 7-day / monthly period summary in one API call.

**Endpoint:** `GET /api/instructor/batches/:batchId/dashboard-summary`  
**Frontend hook:** `useDashboardSummary(batchId)`  
**Components:** `EngagementPulseCards`, `PeriodSummaryRow`, `AtRiskStudentList`, `BandOverviewTable`, `StudentActivityGrid`

**Returns (`DashboardSummary`):**
```typescript
{
  engagement_today: {
    active_students:   number,   // drilled at least once today (IST)
    avg_dcs:           number,   // mean DCS across students who drilled today
    streaks_alive:     number,   // students with daily_streak ≥ 1
    platform_unlocked: number,   // students with dashboard_unlocked = true today
    active_yesterday:  number,   // for trend arrows
    avg_dcs_yesterday: number
  },
  at_risk: [{
    student_id, user_id, name, avatar,
    flags:           string[],   // e.g. ['inactive_5d', 'band_declining', 'missed_ia_2+']
    primary_flag:    string,     // worst flag — used as the headline reason
    days_inactive:   number,
    missed_ia_count: number,
    current_band:    number | null
  }],
  band_overview: [{
    student_id, user_id, name, avatar,
    current_band, target_band, gap,
    last_ia_date:       string,       // YYYY-MM-DD
    band_trend:         'up'|'flat'|'down'|null,
    drilled_today:      boolean,
    drills_count_today: number,
    streak:             number,
    lexigrid_done_today:  boolean,
    lexigrid_words_today: number,
    is_at_risk:           boolean,
    risk_primary_flag:    string | null
  }],
  period_summary: {
    ia_completed_last_7_days:  number,
    ia_total_students:         number,   // denominator for completion %
    mock_completed_this_month: number,
    mock_total_students:       number
  }
}
```

**Implementation note:** Nine parallel DB queries are fanned out and merged in the controller — drill state, competency matrix, IA sessions, mock sessions, streak data, LexiGrid state, at-risk flags, and period aggregates. Zero N+1 queries. All date anchoring uses IST.

**Metrics for widgets:**
| Metric | Widget | At-risk threshold |
|---|---|---|
| `active_students / studentCount` | Engagement rate chip | < 50% of batch |
| `avg_dcs` vs `avg_dcs_yesterday` | DCS trend arrow | Falling > 10 pts day-over-day |
| `platform_unlocked` | Unlocked count | < 40% of batch |
| `streaks_alive` | Streak pulse | < 60% of batch |
| `at_risk[]` count | Live alert badge | Any |
| `band_overview[].gap` | Per-student gap bar | > 1.5 bands |
| `band_overview[].band_trend = 'down'` | Declining indicator | Any |
| `ia_completed_last_7_days / ia_total_students` | IA participation % | < 60% |
| `mock_completed_this_month / mock_total_students` | Mock participation % | < 40% |

---

### 3. Student Full Progress (Deep Dive)

**What it is:** Per-student detail view. Returns the complete learning journey — competency bands, all IA and mock sessions, 14-day drill calendar, LexiGrid stats, and IA eligibility. Opened when a tutor clicks a student in the batch overview.

**Endpoint:** `GET /api/instructor/batches/:batchId/students/:studentId/full-progress`  
**Frontend hook:** `useStudentFullProgress()`  
**Component:** `InstructorStudentProgressPage`

**Returns (`StudentFullProgress`):**
```typescript
{
  student: { id, name, email, avatar },
  competency: [{ skill: 'LISTENING'|'READING'|'WRITING'|'SPEAKING', band_score }],
  target_band:    number,
  current_band:   number,     // mean of non-zero skill bands, rounded to nearest 0.5
  momentum_score: number,
  daily_streak:   number,

  ia_sessions: [{
    id, ia_number,
    ia_date:              string,     // YYYY-MM-DD
    status:               'PENDING'|'IN_PROGRESS'|'COMPLETED'|'MISSED',
    selected_subskills:   string[],
    scores:               SectionScore[],   // band, ai_graded, ai_feedback per sub-skill
    momentum_awarded:     number,
    carry_forward_subskills: string[],
    time_submitted_at:    string | null
  }],

  mock_sessions: [{
    id,
    month_year:       string,     // YYYY-MM
    attempt_type:     'STANDARD'|'EARNED',
    status:           string,
    scores:           MockSkillScore[],   // per-skill bands with sub_skill_scores[]
    real_band_score:  number,             // overall IELTS band, nearest 0.5
    momentum_awarded: number,
    time_submitted_at: string | null
  }],

  drill_stats: {
    last_14_days:      [{ date: string, dcs: number | null, count: number }],
    sub_skill_counts:  [{ skill, sub_skill, count, avg_accuracy }],
    streak_calendar:   [{ date: string, active: boolean }],
    total_drills_all_time: number,
    avg_dcs_lifetime:      number
  },

  lexigrid_stats: {
    games_last_14:    number,
    avg_words_solved: number,
    bonus_rate:       number    // 0–1 fraction
  },

  ia_eligibility: {
    prerequisites_met: boolean,
    avg_dcs:           number,
    drills_completed:  number,
    next_ia_date:      string | null    // YYYY-MM-DD
  }
}
```

**Widgets for the per-student view:**
| Widget | Data source | Notes |
|---|---|---|
| Band Radar (L/R/W/S vs. target) | `competency[]` + `target_band` | Visual gap per skill |
| Current band vs. target gap chip | `current_band`, `target_band` | Green ≤0.5 · Amber 0.5–1.5 · Red >1.5 |
| IA Timeline strip | `ia_sessions[]` | Colour by status; show band per completed IA |
| IA sub-skill heatmap | `ia_sessions[].scores[]` | Sub-skill strength over time |
| DCS sparkline (14-day) | `drill_stats.last_14_days` | Grey bars = no-drill day |
| Drill streak calendar | `drill_stats.streak_calendar` | GitHub-style activity grid |
| Sub-skill practice distribution | `drill_stats.sub_skill_counts` | Which sub-skills get drilled vs. neglected |
| Mock band trend | `mock_sessions[].real_band_score` | Monthly bar chart |
| Mock skill breakdown | `mock_sessions[].scores[]` | Per-skill bands per attempt |
| Momentum + streak | `momentum_score`, `daily_streak` | Engagement at-a-glance |
| LexiGrid habit | `lexigrid_stats.games_last_14` + `avg_words_solved` | Daily vocabulary signal |
| IA eligibility checklist | `ia_eligibility` | Show why a student can't start next IA |
| Next IA countdown | `ia_eligibility.next_ia_date` | Date chip |

---

### 4. Batch Assessment Overview

**What it is:** Three per-student tables — IA, Mock, and Diagnostic — with batch-level summary statistics. Used for the assessment participation tab: who has done what, who is falling behind.

**Endpoint:** `GET /api/instructor/batches/:batchId/assessment-overview`  
**Frontend hook:** `useAssessmentOverview()`  
**Component:** `InstructorAssessmentPage`

**Returns (`AssessmentOverview`):**
```typescript
{
  ia_overview: [{
    student_id, user_id, name, avatar,
    ia_completed: number,
    ia_missed:    number,
    last_ia_band: number | null,
    best_ia_band: number | null,
    avg_ia_band:  number | null,
    last_ia_date: string | null,    // YYYY-MM-DD
    ia_eligible:  boolean
  }],

  mock_overview: [{
    student_id, user_id, name, avatar,
    mock_count:       number,
    latest_real_band: number | null,
    best_real_band:   number | null,
    target_band:      number
  }],

  diagnostic_overview: [{
    student_id, user_id, name, avatar,
    is_diagnosed:   boolean,
    baseline_bands: { L: number, R: number, W: number, S: number },
    diagnosed_at:   string | null    // YYYY-MM-DD
  }],

  batch_ia_summary: {
    avg_band:        number,
    completion_rate: number,    // 0–1
    high_miss_count: number     // students with ≥ 2 missed IAs
  },

  batch_mock_summary: {
    avg_real_band:      number,
    at_or_above_target: number,    // count of students meeting goal
    no_mock_yet:        number
  }
}
```

**Metrics for dashboard:**
| Metric | Use case |
|---|---|
| `ia_missed ≥ 2` | Highlight red — compounding momentum loss |
| `ia_eligible = false` | Students locked out of IA |
| `avg_ia_band` across students | Batch-level band health |
| `latest_real_band` vs `target_band` | Goal proximity per student |
| `no_mock_yet` | Who has never sat a mock |
| `is_diagnosed = false` | Who hasn't started the learning loop |
| `batch_ia_summary.completion_rate` | IA participation health |
| `batch_mock_summary.at_or_above_target` | Goal achievement KPI |

---

## At-Risk Flag Reference

Flags are computed server-side inside `/dashboard-summary`. The `at_risk[]` array in that response is the only place they appear — no client-side flag logic.

| Flag key | Trigger | Data source |
|---|---|---|
| `inactive_3d` | No drill for 3 consecutive IST days | `DrillSession.created_at` |
| `inactive_5d` | No drill for 5 consecutive IST days | `DrillSession.created_at` |
| `inactive_7d` | No drill for 7+ consecutive IST days | `DrillSession.created_at` |
| `band_declining` | `current_band` lower than previous IA band | `StudentCompetencyMatrix` + `IASession.scores` |
| `missed_ia_2+` | `IASession.status = MISSED` count ≥ 2 | `IASession` |
| `low_momentum` | `momentum_score < 100` | `institute_students.momentum_score` |
| `streak_broken` | `daily_streak = 0` after previously having ≥ 3 | `institute_students.daily_streak` |
| `not_diagnosed` | `isDiagnosed = false` | `institute_students.isDiagnosed` |
| `ia_not_eligible` | `prerequisites_met = false` after ≥ 14 days enrolled | computed from ia_eligibility fields |
| `stale_band` | `competency_matrix.last_updated > 14 days ago` | `StudentCompetencyMatrix.last_updated` |

**`primary_flag` priority order (most → least severe):**  
`inactive_7d → inactive_5d → missed_ia_2+ → band_declining → inactive_3d → low_momentum → streak_broken → not_diagnosed → stale_band`

---

## Data Flow (Tutor Perspective)

```
Student joins batch
       ↓
Diagnostic → baseline band scores established · isDiagnosed = true
       ↓
Daily Loop (IST):
  Drill 1 → LexiGrid → Drill 2 → platform unlocked → Drill 3/4 (optional)
  DCS calculated · momentum awarded · streak updated
       ↓  (every 3 days from first drill)
IA Scheduled → PENDING
  Completes → COMPLETED → competency matrix updated (weighted smoothing)
  Misses    → MISSED    → −20 momentum · carry-forward sub-skills set
       ↓  (monthly)
Mock Test → all 4 skills → real_band_score computed
       ↓
Tutor dashboard reads:
  /dashboard-summary  →  engagement pulse · at-risk list · band overview · period summary
  /full-progress      →  per-student IA timeline · mock history · drill calendar · eligibility
  /assessment-overview →  IA / Mock / Diagnostic participation tables
```

---

## API Quick-Reference

All endpoints require `Authorization: Bearer <supabase_jwt>` + `INSTRUCTOR` or `ADMIN` role.  
Batch-scoped endpoints verify instructor membership via `ielts_batch_instructors`.  
Student-scoped endpoints additionally verify the student is enrolled in that batch.

| Endpoint | Purpose | Hook / Component |
|---|---|---|
| `GET /api/instructor/batches` | All instructor's batches | `useInstructorBatches()` |
| `GET /api/instructor/batches/:batchId/dashboard-summary` | Engagement · at-risk · band overview | `useDashboardSummary(batchId)` |
| `GET /api/instructor/batches/:batchId/students/:studentId/full-progress` | Student deep-dive | `useStudentFullProgress()` |
| `GET /api/instructor/batches/:batchId/assessment-overview` | IA / Mock / Diagnostic tables | `useAssessmentOverview()` |

---

## Key At-Risk Patterns for Tutor Intervention

| Pattern | Signals | Recommended action |
|---|---|---|
| Never started | `not_diagnosed` | Direct message — complete diagnostic |
| Drilled once and quit | `inactive_5d` + total drills < 5 | Check if onboarding was completed |
| IA locked out | `ia_not_eligible` after 2 weeks | Check DCS — student may be rushing drills |
| Consecutive IA misses | `missed_ia_2+` | Schedule catch-up; review `carry_forward_subskills` |
| Band plateauing | `band_trend = 'flat'` for 2+ IAs | Sub-skill heatmap — look for neglected areas |
| Band declining | `band_declining` | Check drill sub-skill mix — too many easy drills? |
| Disengaged entirely | `inactive_7d` + `streak = 0` + `momentum < 100` | Escalate to institute owner |
| Mock-ready but no mock | mock_count = 0 + `current_band ≥ target_band − 0.5` | Prompt to schedule mock |

---

---

## Appendix: Unused Backend Endpoints

> These endpoints exist in the backend under `/api/instructor/` and `/api/institute-owner/` but are **not called by the tutor dashboard frontend**. They were part of an earlier analytics design. They currently back `BatchAnalyticsView.tsx` in the `InstituteOwner` feature, which is itself still rendering mostly mock data. Do not use these as a reference when building new tutor dashboard features.

### Batch Analytics (Legacy)

`GET /api/instructor/batches/:batchId/analytics`  
`GET /api/institute-owner/batches/:batchId/analytics`

Returns speaking/reading/writing/listening trend charts and leaderboards derived from standalone practice sessions (`IeltsSpeakingAssessment`, `ReadingPracticeSession`, `WritingAssessment`, `ListeningPractice`) — not from IA or Mock data.

### Reading Analytics (Legacy)

`GET /api/instructor/batches/:batchId/reading-analytics`  
`GET /api/institute-owner/batches/:batchId/reading-analytics`

Returns WPM trends and a reading speed leaderboard from `ReadingPracticeSession`.

### Per-Student Practice Histories (Legacy)

`GET /api/instructor/students/:studentId/speaking-history`  
`GET /api/instructor/students/:studentId/reading-history`  
`GET /api/instructor/students/:studentId/writing-history`

Session-level logs for standalone practice. These were intended for a drill-down from the legacy leaderboards.

### Manual Writing Grade (Legacy)

`PATCH /api/instructor/writing-assessment/:assessmentId/grade`  
Body: `{ bandScore: number, feedback: string }`

Instructor override for AI writing scores. Was paired with the writing history view.
