# Institute Owner & Admin Dashboard — Implementation Plan

**Scope:** Phase 1 (Operational) + Phase 2 (Analytics) production-ready. Phase 3–5 rendered as locked "Coming Soon" previews in the UI.  
**Prerequisite reading:** `institute_dashboard_phase_plan.md`, `tutor_dashboard_data_reference.md`  
**These are the paying stakeholders. Quality standard matches or exceeds the tutor dashboard.**

---

## 1. Goals & Hard Constraints

- Institute Owner and Institute Admin must each have a complete, working dashboard on day one of launch — no "placeholder" sections in Phase 1 or 2 tabs
- Owner sees everything. Admin sees Phase 1 + 2 only. The UI enforces this via role-gated navigation, not separate apps
- Phase 3–5 tabs (Financial, Marketing, Career) are visible to the Owner but rendered as locked preview cards — aspirational, not broken
- All Phase 1 data comes from existing DB tables. Zero schema changes needed to ship Phase 1
- Phase 2 requires only new aggregation queries, no schema changes
- Backend endpoints follow the exact same auth + membership-check pattern as the instructor dashboard
- Frontend follows the exact same hooks + component pattern as `src/features/instructor/`

---

## 2. Role & Auth Architecture

### Role Resolution on Login

When a user logs in, the JWT contains their `UserRoleType`. The frontend router reads this and redirects:

```
INSTITUTE_OWNER  → /institute-owner/*
INSTITUTE_ADMIN  → /institute-admin/*
```

Both dashboards share the same component library. They differ only in:
- Which API namespace they call (`/api/institute-owner/` vs `/api/institute-admin/`)
- Which nav tabs are visible (admin never sees Financial, Marketing, Reports, Admin Mgmt)

### The "No Admin" Mode Switcher

When an Owner has zero admins assigned, the sidebar shows a **"Switch to Admin View"** toggle. This renders the operational (Phase 1+2) tabs exactly as the admin would see them — same components, same endpoints (owner endpoints accept both roles). It is purely a UX convenience, not a separate auth session.

Detection: `GET /api/institute-owner/admins` returning an empty array → show the switcher.

### Backend Auth Pattern (consistent with instructor dashboard)

Every new route follows this middleware stack:

```typescript
router.get('/path', requireAuth, ensureUser, authorize(ROLE), handler)
```

For **shared operational endpoints** (accessible by both Owner and Admin):
```typescript
authorize(UserRoleType.INSTITUTE_OWNER, UserRoleType.INSTITUTE_ADMIN)
```

For **owner-only endpoints** (Financial, Marketing, Admin Mgmt):
```typescript
authorize(UserRoleType.INSTITUTE_OWNER)
```

Every batch-scoped endpoint additionally verifies the batch belongs to the caller's institute:
```typescript
const institute = await getCallerInstitute(appUserId, role) // looks up institute_owners or institute_admins
if (batch.institute_id !== institute.id) throw 403
```

---

## 3. Navigation & Routing

### Route Structure

```
/institute-owner/
  overview          ← Phase 1: cross-batch KPIs + alerts
  batches           ← Phase 1: batch list + per-batch drill-down
  batches/:id       ← Phase 1: single batch detail (reuses tutor components)
  students          ← Phase 1: cross-batch student table
  students/:id      ← Phase 1: per-student deep-dive
  instructors       ← Phase 1: instructor roster
  analytics         ← Phase 2: cohort trends, comparison, effectiveness
  admins            ← Phase 1: already built
  financial         ← Phase 3: Coming Soon preview
  marketing         ← Phase 4: Coming Soon preview
  career            ← Phase 5: Coming Soon preview

/institute-admin/
  overview          ← Phase 1 (same components, admin-scoped endpoints)
  batches
  batches/:id
  students
  students/:id
  instructors
  analytics         ← Phase 2
  (no financial / marketing / career / admins tabs)
```

### Sidebar Navigation Spec

**Owner sidebar (all tabs):**

```
─── OPERATIONS ──────────────────
  Overview          /institute-owner/overview
  Batches           /institute-owner/batches
  Students          /institute-owner/students
  Instructors       /institute-owner/instructors

─── INSIGHTS ────────────────────
  Analytics         /institute-owner/analytics

─── MANAGEMENT ──────────────────
  Admin Management  /institute-owner/admins

─── COMING SOON ─────────────────
  Financial         /institute-owner/financial      [locked]
  Marketing         /institute-owner/marketing      [locked]
  Career Launch     /institute-owner/career         [locked]

─── ─────────────────────────────
  [Switch to Admin View]          (shown only if no admins exist)
  Settings
  Logout
```

**Admin sidebar (subset):**

```
─── OPERATIONS ──────────────────
  Overview
  Batches
  Students
  Instructors

─── INSIGHTS ────────────────────
  Analytics

─── ─────────────────────────────
  Settings
  Logout
```

Coming Soon items in the admin sidebar are hidden entirely — they are not locked, just absent.

---

## 4. Backend Implementation Spec — Phase 1

All endpoints created in `src/controllers/instituteOwnerController.ts` (new functions) and registered in `src/routes/instituteOwnerRoutes.ts` and a new `src/routes/instituteAdminRoutes.ts`.

The institute admin routes are thin wrappers — they call the same controller functions, just with a different `authorize()` call.

---

### 4.1 `GET /api/institute-owner/summary`

**Auth:** OWNER or ADMIN  
**Purpose:** Institute-level KPI row for the Overview landing page. Single call that aggregates across all batches.

**Controller logic:**
1. Resolve `institute_id` from `institute_owners` or `institute_admins`
2. Fetch all batches for the institute (`ielts_batches WHERE institute_id = ?`)
3. Fan out parallel queries across all batch IDs:
   - Total enrolled students (sum of `ielts_batch_students`)
   - Active today (DrillSession with `created_at >= today IST`)
   - Platform unlocked today (`daily-drill-state` equivalent per student)
   - At-risk count (students with any active flag — same logic as instructor `at_risk` but scoped to institute)
   - Avg band across all students (`StudentCompetencyMatrix` mean, non-zero bands)
   - IA completion last 7 days
4. Return aggregated object

**Response shape:**
```typescript
{
  institute_name: string,
  exam_types: string[],           // e.g. ['IELTS', 'GMAT'] — exam types present in batches
  total_students: number,
  active_today: number,           // drilled at least once today (IST)
  platform_unlocked_today: number,
  at_risk_count: number,
  total_batches: number,
  avg_band: number | null,        // mean across all students with non-zero competency bands
  ia_completion_last_7_days: {
    completed: number,
    total_eligible: number
  },
  mock_completed_this_month: number,
  admins_count: number            // for "no admin" mode switcher detection
}
```

---

### 4.2 `GET /api/institute-owner/batches`

**Auth:** OWNER or ADMIN  
**Purpose:** Batch list with per-batch health summary. Replaces the mock data in `BatchInsight.tsx` and is the data source for the Batches tab.

**Query params:** `?exam_type=IELTS` (optional filter)

**Response shape:**
```typescript
{
  data: [{
    id: string,
    name: string,
    exam_type: string,
    status: 'ACTIVE' | 'INACTIVE' | 'COMPLETED',
    student_count: number,
    max_students: number,
    capacity_pct: number,           // student_count / max_students * 100
    instructors: [{ userId, name, profileImage }],
    avg_band: number | null,
    at_risk_count: number,
    active_today: number,           // students who drilled today
    ia_completion_rate: number,     // 0–1, last 7 days
    start_date: string,             // YYYY-MM-DD
    end_date: string | null
  }]
}
```

---

### 4.3 `GET /api/institute-owner/batches/:batchId/dashboard-summary`

**Auth:** OWNER or ADMIN  
**Purpose:** Reuse the instructor batch summary logic, scoped by institute membership instead of instructor membership.

**Implementation:** Extract the core query logic from `instructorProgressController.getBatchDashboardSummary` into a shared util. Call the same util from both the instructor controller and this new owner controller. Only the membership check differs.

**Response shape:** Identical to `DashboardSummary` from the tutor dashboard — no new shape needed. Frontend can reuse tutor components directly.

---

### 4.4 `GET /api/institute-owner/students`

**Auth:** OWNER or ADMIN  
**Purpose:** Cross-batch student table. All students enrolled in the institute, with current band, streak, drill status today, and at-risk flag.

**Query params:** `?exam_type=IELTS&batch_id=xxx&at_risk=true` (all optional)

**Response shape:**
```typescript
{
  data: [{
    student_id: string,
    user_id: string,
    name: string,
    avatar: string | null,
    batch_id: string,
    batch_name: string,
    exam_type: string,
    current_band: number | null,
    target_band: number | null,
    gap: number | null,
    band_trend: 'up' | 'flat' | 'down' | null,
    daily_streak: number,
    drilled_today: boolean,
    drills_count_today: number,
    momentum_score: number,
    is_at_risk: boolean,
    primary_flag: string | null,
    last_active: string | null      // YYYY-MM-DD
  }],
  total: number
}
```

---

### 4.5 `GET /api/institute-owner/students/:studentId/full-progress`

**Auth:** OWNER or ADMIN  
**Purpose:** Per-student deep-dive. Verify the student belongs to the institute, then delegate to the same logic as `instructorProgressController.getStudentFullProgress`.

**Response shape:** Identical to `StudentFullProgress` from tutor dashboard. Reuse the shape and the frontend components.

---

### 4.6 `GET /api/institute-owner/at-risk`

**Auth:** OWNER or ADMIN  
**Purpose:** Cross-batch at-risk list, sorted by severity. Used for the live alerts panel on the Overview tab.

**Response shape:**
```typescript
{
  data: [{
    student_id: string,
    user_id: string,
    name: string,
    avatar: string | null,
    batch_id: string,
    batch_name: string,
    exam_type: string,
    flags: string[],
    primary_flag: string,
    days_inactive: number,
    missed_ia_count: number,
    current_band: number | null,
    target_band: number | null
  }],
  total: number
}
```

**Flag priority and thresholds:** Same as tutor dashboard at-risk reference. No new logic — reuse the flag computation util.

---

### 4.7 `GET /api/institute-owner/instructors`

**Auth:** OWNER or ADMIN  
**Purpose:** Instructor roster for the institute, with batch assignments and basic performance data (Phase 2 adds deeper effectiveness metrics).

**Response shape:**
```typescript
{
  data: [{
    user_id: string,
    name: string,
    email: string,
    avatar: string | null,
    batches: [{
      id: string,
      name: string,
      exam_type: string,
      student_count: number
    }],
    total_students: number,
    exam_types: string[]
  }]
}
```

---

### 4.8 `GET /api/institute-owner/assessment-overview`

**Auth:** OWNER or ADMIN  
**Purpose:** Cross-batch version of the tutor's `assessment-overview`. Aggregates IA, Mock, and Diagnostic status across all students in the institute. Supports filtering by batch and exam type.

**Query params:** `?batch_id=xxx&exam_type=IELTS`

**Response shape:** Extends the tutor `AssessmentOverview` shape by adding `batch_name` and `exam_type` to each student row. Batch-level summaries become institute-level summaries.

```typescript
{
  ia_overview: [{
    student_id, user_id, name, avatar,
    batch_name, exam_type,
    ia_completed, ia_missed, last_ia_band,
    best_ia_band, avg_ia_band, last_ia_date, ia_eligible
  }],
  mock_overview: [{
    student_id, user_id, name, avatar,
    batch_name, exam_type,
    mock_count, latest_real_band, best_real_band, target_band
  }],
  diagnostic_overview: [{
    student_id, user_id, name, avatar,
    batch_name, exam_type,
    is_diagnosed, baseline_bands, diagnosed_at
  }],
  institute_ia_summary: {
    avg_band, completion_rate, high_miss_count
  },
  institute_mock_summary: {
    avg_real_band, at_or_above_target, no_mock_yet
  }
}
```

---

### 4.9 Institute Admin Routes

Create `src/routes/instituteAdminRoutes.ts`. Each route maps to the same controller function as the owner equivalent, only the `authorize()` call changes:

```typescript
// instituteAdminRoutes.ts
router.get('/summary',                        requireAuth, ensureUser, authorize(INST_ADMIN, INST_OWNER), getSummary)
router.get('/batches',                        requireAuth, ensureUser, authorize(INST_ADMIN, INST_OWNER), getBatches)
router.get('/batches/:batchId/dashboard-summary', requireAuth, ensureUser, authorize(INST_ADMIN, INST_OWNER), getBatchDashboardSummary)
router.get('/students',                       requireAuth, ensureUser, authorize(INST_ADMIN, INST_OWNER), getStudents)
router.get('/students/:studentId/full-progress', requireAuth, ensureUser, authorize(INST_ADMIN, INST_OWNER), getStudentFullProgress)
router.get('/at-risk',                        requireAuth, ensureUser, authorize(INST_ADMIN, INST_OWNER), getAtRisk)
router.get('/instructors',                    requireAuth, ensureUser, authorize(INST_ADMIN, INST_OWNER), getInstructors)
router.get('/assessment-overview',            requireAuth, ensureUser, authorize(INST_ADMIN, INST_OWNER), getAssessmentOverview)
```

**Membership check for admin:** Resolve institute via `institute_admins WHERE user_id = appUserId`, then use `institute_id` for all batch/student queries. Same institute scoping as owner, different resolution path.

---

## 5. Backend Implementation Spec — Phase 2

All six analytics endpoints under `/api/institute-owner/analytics/`. Admin can also call these (same authorize pattern as Phase 1).

---

### 5.1 `GET /api/institute-owner/analytics/cohort-progress`

**Purpose:** Monthly avg band score trend across all batches, last 6 months. Broken down by skill and exam type.

**Logic:**
- Pull all `IASession` and `MockSession` records for the institute, grouped by month
- Compute avg band per skill per month across all students
- Also compute avg `real_band_score` from mocks per month (overall IELTS readiness trend)

**Response shape:**
```typescript
{
  monthly: [{
    month: string,            // 'Jan 2026'
    avg_band: number | null,  // mean across all 4 skills, all batches
    by_skill: {
      LISTENING: number | null,
      READING:   number | null,
      WRITING:   number | null,
      SPEAKING:  number | null
    },
    mock_avg_band: number | null   // from real_band_score on mock sessions
  }],
  // 6 entries, oldest to newest
  exam_type_breakdown: [{
    exam_type: string,
    latest_avg_band: number | null,
    student_count: number
  }]
}
```

---

### 5.2 `GET /api/institute-owner/analytics/batch-comparison`

**Purpose:** Side-by-side batch snapshot — the core "which batch is performing best" view.

**Response shape:**
```typescript
{
  batches: [{
    id: string,
    name: string,
    exam_type: string,
    instructor_name: string,
    student_count: number,
    avg_band: number | null,
    diagnostic_avg_band: number | null,    // baseline at intake
    improvement: number | null,            // avg_band - diagnostic_avg_band
    ia_completion_rate: number,            // 0–1
    engagement_rate: number,               // % active today / student_count
    at_risk_pct: number,                   // at_risk_count / student_count
    at_or_above_target: number             // count of students meeting goal
  }]
}
```

---

### 5.3 `GET /api/institute-owner/analytics/instructor-effectiveness`

**Purpose:** Per-instructor performance view. Replaces `TutorEffective.tsx` mock data.

**Logic:**
- For each instructor in the institute, find all their students via `ielts_batch_instructors` → `ielts_batch_students`
- Compute avg band improvement: `mean(current_band - diagnostic_band)` per student
- Compute IA completion rate and at-risk count for their students

**Response shape:**
```typescript
{
  instructors: [{
    user_id: string,
    name: string,
    avatar: string | null,
    exam_types: string[],
    batch_count: number,
    student_count: number,
    avg_band_improvement: number | null,   // current - diagnostic, mean across students
    ia_completion_rate: number,            // 0–1
    at_risk_students: number,
    students_at_target: number,
    avg_student_streak: number
  }]
}
```

---

### 5.4 `GET /api/institute-owner/analytics/engagement-trends`

**Purpose:** Weekly time-series of engagement health metrics for the last 8 weeks.

**Logic:** Group `DrillSession` by IST calendar week. Per week: count distinct students who drilled, avg DCS, avg streak.

**Response shape:**
```typescript
{
  weeks: [{
    week_label: string,         // 'Jun 2 – Jun 8'
    active_pct: number,         // % of enrolled students who drilled at least once
    avg_dcs: number | null,
    avg_streak: number,
    platform_unlock_pct: number // % who completed ≥2 drills in at least one day that week
  }]
  // 8 entries, oldest to newest
}
```

---

### 5.5 `GET /api/institute-owner/analytics/goal-achievement`

**Purpose:** How many students are at or above their target band. The key outcome KPI.

**Response shape:**
```typescript
{
  total_students: number,
  with_target_set: number,
  below_target: number,          // current_band < target_band - 0.5
  near_target: number,           // within 0.5 bands
  at_or_above_target: number,    // current_band >= target_band
  exam_ready: number,            // at_or_above AND at least one mock cleared
  by_batch: [{
    batch_id: string,
    batch_name: string,
    exam_type: string,
    below_target: number,
    near_target: number,
    at_or_above_target: number
  }]
}
```

---

### 5.6 `GET /api/institute-owner/analytics/subskill-heatmap`

**Purpose:** Institute-wide sub-skill weakness map — which sub-skills are systematically weak across the institute.

**Logic:** Aggregate `DrillSession` accuracy by `(skill, sub_skill)` across all institute students.

**Response shape:**
```typescript
{
  heatmap: [{
    skill: string,
    sub_skill: string,
    avg_accuracy: number,     // 0–100
    drill_count: number,      // total drills on this sub-skill across institute
    student_count: number     // distinct students who drilled this sub-skill
  }]
}
```

---

## 6. Frontend Architecture

### Directory Structure

```
src/features/InstituteOwner/
  components/
    InstitiuteOwnerSidebar.tsx    (exists — will be updated)
    InstituteOwnerTopbar.tsx      (exists — will be updated)
    ExamSwitcher.tsx              (new — shared IELTS/GMAT/PTE/AWS filter chip)
    ComingSoonTab.tsx             (new — Phase 3-5 locked preview component)
    RoleModeSwitcher.tsx          (new — Admin View / Owner View toggle)

  hooks/                          (new directory — mirrors src/features/instructor/hooks/)
    useInstituteSummary.ts
    useInstituteBatches.ts
    useBatchDashboardSummary.ts   (thin wrapper over owner endpoint, same shape as tutor hook)
    useInstituteStudents.ts
    useStudentFullProgress.ts     (thin wrapper)
    useAtRisk.ts
    useInstructors.ts
    useAssessmentOverview.ts      (thin wrapper)
    useAnalyticsCohortProgress.ts
    useBatchComparison.ts
    useInstructorEffectiveness.ts
    useEngagementTrends.ts
    useGoalAchievement.ts
    useSubskillHeatmap.ts

  pages/                          (new directory — top-level route pages)
    InstituteOverviewPage.tsx
    InstituteBatchesPage.tsx
    InstituteBatchDetailPage.tsx  (renders tutor-style batch view, owner-scoped)
    InstituteStudentsPage.tsx
    InstituteStudentDetailPage.tsx
    InstituteInstructorsPage.tsx
    InstituteAnalyticsPage.tsx
    InstituteAdminMgmtPage.tsx    (already built as InstituteAdmins.tsx — move here)
    InstituteFinancialPage.tsx    (Coming Soon shell only)
    InstituteMarketingPage.tsx    (Coming Soon shell only)
    InstituteCareersPage.tsx      (Coming Soon shell only)

  components/overview/            (Phase 1 widgets)
    InstituteSummaryKpiRow.tsx
    CrossBatchAlertPanel.tsx
    BatchHealthTable.tsx

  components/students/            (Phase 1 widgets)
    CrossBatchStudentTable.tsx

  components/instructors/         (Phase 1 widgets)
    InstructorRosterTable.tsx

  components/analytics/           (Phase 2 widgets)
    CohortProgressChart.tsx
    BatchComparisonTable.tsx
    InstructorEffectivenessTable.tsx
    EngagementTrendsChart.tsx
    GoalAchievementWidget.tsx
    SubskillHeatmapGrid.tsx
```

**Institute Admin** lives at:
```
src/features/InstituteAdmin/
  (no components — imports everything from InstituteOwner/components/)
  hooks/                          (same hooks but call /api/institute-admin/ endpoints)
    useInstituteSummary.ts
    useInstituteBatches.ts
    ... (identical signatures, different base URL)
  pages/
    (same pages as owner, minus Financial/Marketing/Career/AdminMgmt)
```

### Hook Pattern (mirrors instructor dashboard)

```typescript
// hooks/useInstituteSummary.ts
export function useInstituteSummary(role: 'owner' | 'admin') {
  const base = role === 'owner' ? '/api/institute-owner' : '/api/institute-admin'
  const [data, setData] = useState<InstituteSummary | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    callBackend(`${BACKEND}${base}/summary`)
      .then(setData)
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }, [base])

  return { data, loading, error }
}
```

All hooks follow this exact pattern. The `role` parameter is read from the auth context — one hook file, two backends.

### Exam Switcher (Global Filter)

The exam switcher from the reference design (`institute_dashboard.jsx`) is a shared context:

```typescript
// ExamSwitcherContext.tsx
const ExamSwitcherContext = createContext<{
  activeExam: string | 'ALL',
  setActiveExam: (exam: string) => void,
  availableExams: string[]
}>()
```

All pages consume this context and pass `?exam_type=activeExam` to their hooks. The switcher is rendered in the topbar, not the sidebar.

---

## 7. Component Spec — Phase 1

### 7.1 `InstituteOverviewPage`

**Data:** `useInstituteSummary` + `useAtRisk` + `useInstituteBatches`

**Layout:**
```
┌─ KPI Row ───────────────────────────────────────────────────────────┐
│  Total Students | Active Today | At-Risk | Avg Band | IA Rate       │
└─────────────────────────────────────────────────────────────────────┘

┌─ Live Alerts (1/3 width) ──┐  ┌─ Batch Health Table (2/3 width) ──┐
│ CrossBatchAlertPanel       │  │ BatchHealthTable                    │
│ - sorted by flag severity  │  │ columns: Batch · Exam · Instructor  │
│ - click → student detail   │  │   Students · Avg Band · At-Risk    │
│ - "View All" link          │  │   Active Today · Status            │
└────────────────────────────┘  └────────────────────────────────────┘
```

**`InstituteSummaryKpiRow` props:**
```typescript
{
  totalStudents: number
  activeToday: number
  atRiskCount: number
  avgBand: number | null
  iaCompletionRate: number    // 0–1
  totalBatches: number
}
```

Colour coding: at-risk chip goes red if `atRiskCount / totalStudents > 0.15`. IA rate chip goes amber if < 0.6.

---

### 7.2 `InstituteBatchesPage`

**Data:** `useInstituteBatches` (with exam filter applied from context)

**Layout:**
```
┌─ Filter bar ─────────────────────────────────────────────────────────┐
│ [Search batch name]   [Status: Active ▾]   [Sort: Avg Band ▾]        │
└──────────────────────────────────────────────────────────────────────┘

┌─ Batch card grid ────────────────────────────────────────────────────┐
│ Card per batch:                                                       │
│   Batch name + exam pill                                             │
│   Instructor name(s)                                                 │
│   Capacity bar (students / max)                                      │
│   KPI row: Avg Band · At-Risk · Active Today · IA Rate               │
│   [View Batch →] button → /batches/:id                               │
└──────────────────────────────────────────────────────────────────────┘
```

Clicking a batch opens `InstituteBatchDetailPage` which renders the tutor-style batch summary view (`EngagementPulseCards`, `StudentActivityGrid`, `AtRiskStudentList`, `PeriodSummaryRow`) using the `useBatchDashboardSummary` hook.

**Reuse principle:** The batch detail page imports and renders instructor components directly — `EngagementPulseCards`, `BandOverviewTable`, `AtRiskStudentList` from `src/features/instructor/components/`. No duplication.

---

### 7.3 `InstituteStudentsPage`

**Data:** `useInstituteStudents` (paginated, with batch + exam + at-risk filters)

**Layout:**
```
┌─ Filter bar ─────────────────────────────────────────────────────────┐
│ [Search name]  [Batch ▾]  [Exam ▾]  [At-Risk only ☐]  [Sort ▾]      │
└──────────────────────────────────────────────────────────────────────┘

┌─ CrossBatchStudentTable ─────────────────────────────────────────────┐
│ Name · Batch · Exam · Band · Target Gap · Streak · Drilled Today     │
│     · Momentum · Flag · Last Active                                  │
│ Row click → /students/:id deep-dive                                  │
└──────────────────────────────────────────────────────────────────────┘
```

`InstituteStudentDetailPage` renders the same full-progress view as the tutor dashboard (`InstructorStudentProgressPage`), importing components directly. Only the data hook differs.

---

### 7.4 `InstituteInstructorsPage`

**Data:** `useInstructors`

**Layout:**
```
┌─ Instructor cards ───────────────────────────────────────────────────┐
│ Card per instructor:                                                  │
│   Avatar initials · Name · Email                                     │
│   Exam type pills                                                    │
│   Batches assigned (chip list)                                       │
│   Total students                                                     │
│   [Phase 2: effectiveness metrics appear here once analytics built]  │
└──────────────────────────────────────────────────────────────────────┘
```

In Phase 1, this is a roster view only. In Phase 2, each card gains band improvement, IA rate, and at-risk count derived from `useInstructorEffectiveness`.

---

### 7.5 Assessment Tab (within Batch Detail)

The `assessment-overview` endpoint is surfaced inside the Batch Detail page as a tab — same pattern as the tutor dashboard's `InstructorAssessmentPage`. Import and reuse that component directly, swap the data hook.

---

## 8. Component Spec — Phase 2

All Phase 2 components live under `components/analytics/` and are rendered in `InstituteAnalyticsPage`.

### `InstituteAnalyticsPage` layout:

```
┌─ Analytics KPI Row ──────────────────────────────────────────────────┐
│  Avg Band · Improvement Since Diagnostic · IA Rate · Exam-Ready      │
└──────────────────────────────────────────────────────────────────────┘

┌─ Cohort Progress (full width) ───────────────────────────────────────┐
│  CohortProgressChart — line chart, avg band per skill, 6 months      │
└──────────────────────────────────────────────────────────────────────┘

┌─ Goal Achievement (1/3) ─┐  ┌─ Engagement Trends (2/3) ────────────┐
│  GoalAchievementWidget   │  │  EngagementTrendsChart               │
│  Donut: Below/Near/At    │  │  Area chart: active % + DCS, 8 weeks  │
└──────────────────────────┘  └──────────────────────────────────────┘

┌─ Batch Comparison (full width) ──────────────────────────────────────┐
│  BatchComparisonTable — sortable by any metric                       │
└──────────────────────────────────────────────────────────────────────┘

┌─ Instructor Effectiveness (full width) ──────────────────────────────┐
│  InstructorEffectivenessTable — replaces TutorEffective.tsx mock     │
└──────────────────────────────────────────────────────────────────────┘

┌─ Sub-skill Heatmap (full width) ─────────────────────────────────────┐
│  SubskillHeatmapGrid — grid coloured by avg accuracy                 │
└──────────────────────────────────────────────────────────────────────┘
```

### Chart library: Recharts (already installed and used throughout the app)

| Component | Chart type | Data source |
|---|---|---|
| `CohortProgressChart` | `LineChart` with 4 lines (one per skill) | `useAnalyticsCohortProgress` |
| `EngagementTrendsChart` | `AreaChart` dual-axis (active % + DCS) | `useEngagementTrends` |
| `GoalAchievementWidget` | `PieChart` with 3 segments | `useGoalAchievement` |
| `BatchComparisonTable` | Sortable table | `useBatchComparison` |
| `InstructorEffectivenessTable` | Sortable table + mini progress bars | `useInstructorEffectiveness` |
| `SubskillHeatmapGrid` | CSS grid with colour-coded cells | `useSubskillHeatmap` |

---

## 9. Coming Soon — Phase 3, 4, 5

### Strategy

These tabs are **visible and clickable** in the Owner sidebar. Clicking them renders a `ComingSoonTab` component — not an error, not a redirect, but a rich preview of what's coming. This is a product decision: paying clients should feel the roadmap, not hit a wall.

### `ComingSoonTab` Component Spec

```typescript
interface ComingSoonTabProps {
  phase: 3 | 4 | 5
  title: string
  subtitle: string
  eta: string                    // e.g. 'Q3 2026'
  features: {
    icon: string
    title: string
    description: string
  }[]
  previewImageSrc?: string       // optional static screenshot/mockup
}
```

**Layout:**

```
┌─────────────────────────────────────────────────────────────────────┐
│  🔒  [Phase badge]  "Coming in Q3 2026"                             │
│                                                                     │
│  Financial Dashboard                                                │
│  "Revenue tracking, subscription analytics, and billing insights   │
│   for your institute — all in one place."                           │
│                                                                     │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐             │
│  │ 📊            │  │ 💰            │  │ 📈            │             │
│  │ Monthly       │  │ Revenue by   │  │ Plan          │             │
│  │ Revenue       │  │ Exam Type    │  │ Distribution  │             │
│  │ Trend         │  │              │  │               │             │
│  └──────────────┘  └──────────────┘  └──────────────┘             │
│                                                                     │
│  [Notify me when this launches →]                                   │
└─────────────────────────────────────────────────────────────────────┘
```

Feature preview cards are rendered at reduced opacity with a subtle blur — they show the concept without being interactive.

### Coming Soon Content Per Phase

**Phase 3 — Financial Dashboard** (ETA: Q3 2026)
- Monthly Revenue Trend
- Revenue by Exam Type
- Plan Distribution (Starter / Growth / Enterprise)
- Student Billing Overview
- Subscription Management

**Phase 4 — Marketing & Leads** (ETA: Q4 2026)
- Lead Pipeline
- Acquisition Source Breakdown
- Conversion Funnel
- Campaign Performance

**Phase 5 — Career Launch / Hireflow** (ETA: 2027)
- Students Ready for Placement
- Sub-skill Verified Profiles
- Employer Matching Pipeline
- Placement Cell Analytics

---

## 10. Files to Fix Before Phase 1 Build Starts

These are existing bugs in the current codebase that must be corrected as part of Phase 1:

| File | Problem | Fix |
|---|---|---|
| `BatchInsight.tsx` | Calls `/api/institute-admin/batches` which does not exist | Replace with `useInstituteBatches` hook once endpoint is live |
| `InstituteOwnerStudentProgressPage.tsx` | Calls `/api/instructor/students/:id/reading-history` — wrong role | Replace with owner-scoped `useStudentFullProgress` |
| `BatchAnalyticsView.tsx` | Calls legacy analytics endpoints that will be superseded | Replace with Phase 2 analytics hooks in `InstituteAnalyticsPage` |
| `TutorEffective.tsx` | Entirely mock data | Replace with `InstructorEffectivenessTable` + `useInstructorEffectiveness` in Phase 2 |
| `RoiAnalytics.tsx` | Entirely mock data | Move to Phase 3 Coming Soon tab |
| `StrategicReport.tsx` | Entirely mock data | Move to Phase 3 Coming Soon tab |
| `AiCalibration.tsx` | Entirely mock data | Move to Phase 3/4 Coming Soon tab |
| `Performance.tsx` | Entirely mock data | Fold into Phase 2 analytics page with real data |
| `InstitiuteOwnerSidebar.tsx` | Navigation items don't match new route structure | Rebuild with new structure from Section 3 of this doc |

---

## 11. Build Sequence

Build in this order. Each step is independently shippable.

### Backend (do first — frontend blocks on this)

```
Step 1  instituteOwnerController: getSummary, getBatches, getAtRisk
Step 2  instituteOwnerController: getStudents, getStudentFullProgress, getInstructors
Step 3  instituteOwnerController: getBatchDashboardSummary, getAssessmentOverview
Step 4  instituteOwnerRoutes: register all Phase 1 routes
Step 5  instituteAdminRoutes: create file, register same endpoints with dual-role authorize
Step 6  Analytics endpoints: cohortProgress, batchComparison
Step 7  Analytics endpoints: instructorEffectiveness, engagementTrends
Step 8  Analytics endpoints: goalAchievement, subskillHeatmap
```

### Frontend (begin after Step 4 — can use /owner routes before /admin routes exist)

```
Step A  Rebuild InstitiuteOwnerSidebar with correct nav structure
Step B  Build ExamSwitcher context + topbar integration
Step C  Build hooks directory (useInstituteSummary, useInstituteBatches, useAtRisk)
Step D  Build InstituteOverviewPage (KPI row + alert panel + batch health table)
Step E  Build InstituteBatchesPage + InstituteBatchDetailPage (reuse tutor components)
Step F  Build InstituteStudentsPage + InstituteStudentDetailPage (reuse tutor components)
Step G  Build InstituteInstructorsPage (roster only — Phase 2 enriches it)
Step H  Build ComingSoonTab component + Financial/Marketing/Career pages
Step I  Owner routing complete — test all Owner flows end-to-end
Step J  Build Admin hooks (same signatures, /institute-admin/ base URL)
Step K  Build Admin sidebar + routing
Step L  Test Admin flows end-to-end (incl. role gate — admin cannot hit /institute-owner/admins)
Step M  Build Phase 2 analytics hooks
Step N  Build CohortProgressChart, EngagementTrendsChart, GoalAchievementWidget
Step O  Build BatchComparisonTable, InstructorEffectivenessTable, SubskillHeatmapGrid
Step P  Wire InstituteAnalyticsPage, replace mock data in Performance.tsx and TutorEffective.tsx
```

---

## 12. API Quick-Reference (all new endpoints)

### Phase 1

| Method | Path | Auth | Purpose |
|---|---|---|---|
| GET | `/api/institute-owner/summary` | OWNER or ADMIN | Institute KPI row |
| GET | `/api/institute-owner/batches` | OWNER or ADMIN | Batch list with health |
| GET | `/api/institute-owner/batches/:batchId/dashboard-summary` | OWNER or ADMIN | Single batch detail |
| GET | `/api/institute-owner/students` | OWNER or ADMIN | Cross-batch student table |
| GET | `/api/institute-owner/students/:studentId/full-progress` | OWNER or ADMIN | Student deep-dive |
| GET | `/api/institute-owner/at-risk` | OWNER or ADMIN | Cross-batch alert list |
| GET | `/api/institute-owner/instructors` | OWNER or ADMIN | Instructor roster |
| GET | `/api/institute-owner/assessment-overview` | OWNER or ADMIN | IA/Mock/Diagnostic tables |
| GET | `/api/institute-admin/batches` | ADMIN or OWNER | Admin-scoped batch list |
| GET | `/api/institute-admin/batches/:batchId/dashboard-summary` | ADMIN or OWNER | Admin batch detail |
| GET | `/api/institute-admin/students` | ADMIN or OWNER | Admin student table |
| GET | `/api/institute-admin/students/:studentId/full-progress` | ADMIN or OWNER | Admin student detail |
| GET | `/api/institute-admin/at-risk` | ADMIN or OWNER | Admin alert list |
| GET | `/api/institute-admin/instructors` | ADMIN or OWNER | Admin instructor roster |
| GET | `/api/institute-admin/assessment-overview` | ADMIN or OWNER | Admin assessment tables |
| GET | `/api/institute-admin/summary` | ADMIN or OWNER | Admin KPI row |

### Phase 2

| Method | Path | Auth | Purpose |
|---|---|---|---|
| GET | `/api/institute-owner/analytics/cohort-progress` | OWNER or ADMIN | Band trend 6 months |
| GET | `/api/institute-owner/analytics/batch-comparison` | OWNER or ADMIN | Batch vs. batch |
| GET | `/api/institute-owner/analytics/instructor-effectiveness` | OWNER or ADMIN | Per-instructor metrics |
| GET | `/api/institute-owner/analytics/engagement-trends` | OWNER or ADMIN | Weekly engagement |
| GET | `/api/institute-owner/analytics/goal-achievement` | OWNER or ADMIN | Target band KPIs |
| GET | `/api/institute-owner/analytics/subskill-heatmap` | OWNER or ADMIN | Weakness map |

> Admin can access all analytics via the owner endpoints — the `authorize()` call accepts both roles. No separate `/api/institute-admin/analytics/` namespace needed since analytics are read-only for admin anyway.

---

## 13. Definition of Done

Phase 1 is **done** when:
- [ ] All 16 Phase 1 endpoints return real data (zero mock objects in responses)
- [ ] Institute Owner can navigate all Phase 1 tabs with real data
- [ ] Institute Admin can navigate all their tabs with real data
- [ ] Admin cannot access `/institute-owner/admins` — returns 403
- [ ] Owner without admins sees the mode switcher in the sidebar
- [ ] Exam switcher filters all data correctly on Overview, Batches, Students tabs
- [ ] Phase 3/4/5 tabs render the ComingSoonTab component with no errors
- [ ] All 9 broken/mock-data files from Section 10 are either fixed or replaced

Phase 2 is **done** when:
- [ ] All 6 analytics endpoints return real data
- [ ] `InstituteAnalyticsPage` renders all 6 charts/tables with live data
- [ ] `TutorEffective.tsx` and `Performance.tsx` mock data replaced
- [ ] `BatchAnalyticsView.tsx` legacy endpoints replaced with Phase 2 analytics
