# Institute Owner & Institute Admin Dashboard — Phase Plan

**Document purpose:** Feature scope, role split, data availability assessment, and phased implementation plan for the Institute Owner and Institute Admin dashboards. Intended to be shared with the full team before build begins.

**Related docs:**
- `student_feature_data_reference.md` — all student-side data
- `tutor_dashboard_data_reference.md` — tutor dashboard endpoints and data shapes

---

## 1. Role Architecture

### Two Roles, One Feature Set

The platform supports two institute-side roles:

| Role | DB table | UserRoleType |
|---|---|---|
| Institute Owner | `institute_owners` | `INSTITUTE_OWNER` |
| Institute Admin | `institute_admins` | `INSTITUTE_ADMIN` |

Both are already defined in the Prisma schema and Supabase. The owner manages admins — the `addAdmin` / `removeAdmin` flow is **already built and live**.

### The Two Operating Scenarios

**Scenario A — Owner + Admin (separate people):**
The owner handles strategy and finances. The admin handles day-to-day operations (batches, students, instructors). Each logs in and sees their own scoped view.

**Scenario B — Owner only (no admin assigned):**
The owner does everything. The UI surfaces a mode switcher: **Owner View** (strategic + financial) and **Admin View** (operational). This avoids duplicating the operational UI and lets small institutes run without adding an admin account.

### Role Access Matrix

| Feature Area | Institute Owner | Institute Admin |
|---|---|---|
| Cross-batch dashboard | ✅ | ✅ |
| At-risk alerts (all batches) | ✅ | ✅ |
| Batch health & student activity | ✅ | ✅ |
| Per-student progress (deep-dive) | ✅ | ✅ |
| Assessment overview (IA/Mock/Diagnostic) | ✅ | ✅ |
| Instructor roster & performance | ✅ | ✅ (view only) |
| Admin management (add/remove admins) | ✅ | ❌ |
| Cohort analytics & trends | ✅ | ✅ |
| Batch vs. batch comparison | ✅ | ✅ |
| Instructor effectiveness analytics | ✅ | read-only |
| Financial dashboard | ✅ | ❌ |
| Marketing & leads | ✅ | ❌ |
| Plan & subscription management | ✅ | ❌ |
| Strategic reports | ✅ | ❌ |
| Career / Hireflow pipeline | ✅ | ❌ |

> **Summary:** Admin = Phase 1 + Phase 2 only. Owner = all phases. The Admin dashboard is a scoped subset of the Owner dashboard, not a separate product.

---

## 2. Feature Inventory

Each feature is tagged with its data availability status:

- ✅ **Data exists** — can be built against live data today
- 🔧 **Needs endpoint** — data exists in the DB but no aggregation endpoint yet
- 🆕 **Needs new data** — requires new tables, integrations, or data collection

### 2.1 Operational (Phase 1)

| Feature | Status | Notes |
|---|---|---|
| Institute-level KPI row (active students, at-risk count, batch count, IA rate) | 🔧 | Data in DB; needs cross-batch aggregation endpoint |
| Exam-filtered view (IELTS / GMAT / PTE / AWS switcher) | 🔧 | Batch `exam_type` field exists; needs filtering |
| Batch list with health indicators (avg band, at-risk count, active today) | 🔧 | Needs `/institute-owner/batches` summary endpoint |
| Live alerts panel (cross-batch at-risk students) | 🔧 | Flag logic exists in instructor controller; needs owner-scoped version |
| Per-batch drill-down (links to tutor-style view) | ✅ | Reuse `useDashboardSummary()` with batch ID |
| Per-student deep-dive | ✅ | Reuse `useStudentFullProgress()` |
| Assessment overview (cross-batch IA/Mock/Diagnostic) | 🔧 | `useAssessmentOverview()` is batch-scoped; needs owner-scoped aggregation |
| Instructor roster (who teaches what, which batches) | 🔧 | `ielts_batch_instructors` table exists; needs listing endpoint |
| Admin management (add/remove institute admins) | ✅ | **Already live** — `GET/POST/DELETE /api/institute-owner/admins` |

### 2.2 Analytical (Phase 2)

| Feature | Status | Notes |
|---|---|---|
| Cohort progress over time (avg band per month, all batches) | 🔧 | IA/Mock data exists; needs time-series aggregation |
| Batch vs. batch comparison table | 🔧 | Needs multi-batch summary endpoint |
| Diagnostic → current band improvement (institute outcome KPI) | 🔧 | `StudentCompetencyMatrix` + `AssessmentHistory` (mode=DIAGNOSTIC) |
| IA completion rate trend (weekly) | 🔧 | `IASession` data exists |
| Engagement health trends (avg streak, DCS, daily active %) | 🔧 | `DrillSession` + `institute_students` |
| Sub-skill weakness heatmap (aggregate across batch/institute) | 🔧 | Drill + IA data exists; needs aggregation |
| Instructor effectiveness (band improvement per instructor's students) | 🔧 | Join `ielts_batch_instructors` + `StudentCompetencyMatrix` improvement delta |
| Goal achievement rate (% students at or above target band) | 🔧 | `StudentCompetencyMatrix.band_score` vs `institute_students.target_band` |
| Students exam-ready (band ≥ target − 0.5, mock cleared) | 🔧 | Derived from competency + mock data |

### 2.3 Financial (Phase 3)

| Feature | Status | Notes |
|---|---|---|
| Monthly revenue | 🆕 | No payment/subscription tables yet |
| Revenue YTD & trend chart | 🆕 | |
| Revenue by exam type / batch | 🆕 | |
| Avg revenue per student | 🆕 | |
| Plan distribution (Starter / Growth / Enterprise) | 🆕 | |
| Student billing history | 🆕 | |
| Subscription management (upgrade/downgrade) | 🆕 | Payment integration needed |

### 2.4 Marketing & Leads (Phase 4)

| Feature | Status | Notes |
|---|---|---|
| Lead pipeline (leads this month, conversion rate) | 🆕 | No lead tracking table |
| Acquisition source breakdown (WhatsApp / Google / Walk-in etc.) | 🆕 | |
| Lead → Enrolment conversion funnel | 🆕 | |
| Cost per acquisition | 🆕 | Requires marketing spend input from institute |
| Social media / campaign performance | 🆕 | External integration (LinkedIn, Instagram, etc.) |

### 2.5 Career / Hireflow (Phase 5 — future product)

| Feature | Status | Notes |
|---|---|---|
| Students ready for placement | 🔧 | Derivable from competency + mock data |
| Placement pipeline funnel | 🆕 | New product — employer matching not built |
| Employer engagement | 🆕 | |

---

## 3. Current Codebase State

Before starting, it's important to know what exists and what is misleading:

### Frontend (`src/features/InstituteOwner/`)

| Component | State |
|---|---|
| `InstituteOwnerDashboard.tsx` | Hardcoded mock data — no API calls |
| `BatchAnalyticsView.tsx` | Real API calls to legacy `/analytics` + `/reading-analytics` endpoints (will be replaced in Phase 2) |
| `TutorEffective.tsx` | Hardcoded mock data |
| `RoiAnalytics.tsx` | Hardcoded mock data |
| `StrategicReport.tsx` | Hardcoded mock data |
| `AiCalibration.tsx` | Hardcoded mock data |
| `Performance.tsx` | Hardcoded mock data |
| `InstituteAdmins.tsx` | Real API calls — **live and working** |
| `BatchInsight.tsx` | Calls `/api/institute-admin/batches` — this route **does not exist** in the backend yet |
| `InstituteOwnerStudentProgressPage.tsx` | Calls wrong endpoint (`/api/instructor/students/…`) — needs to use owner-scoped route |

### Backend (`/api/institute-owner/`)

| Endpoint | State |
|---|---|
| `GET /admins` | Live |
| `POST /admins` | Live |
| `DELETE /admins/:userId` | Live |
| `GET /batches/:batchId/analytics` | Live (legacy, will be superseded) |
| `GET /batches/:batchId/reading-analytics` | Live (legacy, will be superseded) |

**No `/api/institute-admin/` routes exist yet.** The admin role has DB tables and auth but zero backend endpoints.

---

## 4. Phase Plan

---

### Phase 1 — Operational Foundation
**Scope:** Admin role goes live. Owner + Admin can monitor all batches, students, and instructors with real data. Everything in this phase is buildable from existing DB data.

**Who benefits:** Institute Owner (operational view) + Institute Admin (full access)

#### Backend work

| Endpoint (new) | What it returns |
|---|---|
| `GET /api/institute-owner/institute-summary` | Institute-level KPIs: total students, active today, at-risk count, batch count, IA completion rate, avg band across all batches |
| `GET /api/institute-owner/batches` | All batches for the institute with per-batch health: student count, avg band, at-risk count, active students today, exam type |
| `GET /api/institute-owner/batches/:batchId/dashboard-summary` | Delegate to instructor logic — same `DashboardSummary` shape, owner-auth instead of instructor-auth |
| `GET /api/institute-owner/students/:studentId/full-progress` | Same as `instructorProgressController.getStudentFullProgress` — owner-auth version |
| `GET /api/institute-owner/at-risk` | Cross-batch at-risk list: all flagged students across all institute batches, sorted by flag severity |
| `GET /api/institute-owner/instructors` | Instructor roster: name, batches assigned, student count, exam types |
| `GET /api/institute-admin/batches` | **Admin-scoped** batch list (same shape as owner version, filtered to admin's assigned institute) |
| `GET /api/institute-admin/batches/:batchId/dashboard-summary` | Admin-scoped batch summary |
| `GET /api/institute-admin/students/:studentId/full-progress` | Admin-scoped student deep-dive |
| `GET /api/institute-admin/at-risk` | Admin-scoped cross-batch at-risk list |

**Auth for admin routes:** `authorize(UserRoleType.INSTITUTE_ADMIN, UserRoleType.INSTITUTE_OWNER)` — owner can always access admin routes.

#### Frontend work

- Replace `InstituteOwnerDashboard.tsx` mock data with calls to `/institute-summary` + `/batches` + `/at-risk`
- Fix `BatchInsight.tsx` to use the new `/api/institute-admin/batches` (which will now exist)
- Fix `InstituteOwnerStudentProgressPage.tsx` to use owner-scoped endpoint
- Add exam-type switcher (IELTS / GMAT / PTE / AWS) to filter all batch/student views
- Build the Admin dashboard shell — same components as owner operational view, restricted navigation (no Financial / Marketing / Reports tabs)
- Implement Owner mode switcher: **Owner View** ↔ **Admin View** (shown only when no separate admin is assigned, or as a convenience toggle)

#### UI structure (Phase 1)

```
Institute Owner / Admin Dashboard
├── Top bar  — institute name · exam switcher · alert badge · role pill
├── Tab bar  — Overview | Batches | Students | Instructors | [Admin Mgmt — Owner only]
│
├── Overview tab
│   ├── KPI row: Total Students · Active Today · At-Risk · Avg Band · IA Rate
│   ├── Live Alerts panel (cross-batch at-risk, sorted by severity)
│   └── Batch Health table (one row per batch: name, exam, instructor, students, avg band, at-risk, status)
│
├── Batches tab
│   └── Each batch → click → opens tutor-style batch view (reusing Phase 1 instructor components)
│
├── Students tab
│   └── Cross-batch student table with band, streak, at-risk flag, drill status today
│
├── Instructors tab
│   └── Roster: name, exams taught, batches, student count
│
└── Admin Mgmt tab (Owner only)
    └── Already built — InstituteAdmins.tsx
```

---

### Phase 2 — Analytics & Cohort Insights
**Scope:** Trend data, batch comparison, instructor effectiveness, goal achievement. All derived from existing IA/Mock/Drill data — no new tables needed.

**Who benefits:** Owner (full) + Admin (read-only analytics)

#### Backend work

| Endpoint (new) | What it returns |
|---|---|
| `GET /api/institute-owner/analytics/cohort-progress` | Monthly avg band score trend across all batches (last 6 months). Broken down by skill (L/R/W/S) and by exam type. |
| `GET /api/institute-owner/analytics/batch-comparison` | Per-batch snapshot: avg band, diagnostic → current improvement, IA completion rate, engagement rate, at-risk %. Used for the batch vs. batch comparison table. |
| `GET /api/institute-owner/analytics/instructor-effectiveness` | Per instructor: student count, avg band improvement across their students, IA completion rate, at-risk students in their batches. |
| `GET /api/institute-owner/analytics/engagement-trends` | Weekly time series: avg DCS, active %, streak distribution, platform unlock rate. |
| `GET /api/institute-owner/analytics/goal-achievement` | % students at/above target band. Breakdown by batch, exam type. Students in "exam ready" zone (within 0.5 of target + mock cleared). |
| `GET /api/institute-owner/analytics/subskill-heatmap` | Institute-wide sub-skill weakness map: for each sub-skill, avg accuracy from drill + IA sessions. Aggregated across all batches. |

#### Frontend work

- Add **Analytics tab** to the dashboard (Owner + Admin)
- `CohortProgressChart` — line chart, avg band over time by skill
- `BatchComparisonTable` — sortable table, one row per batch, all key metrics side by side
- `InstructorEffectivenessTable` — replace `TutorEffective.tsx` mock data with real data
- `EngagementTrendsChart` — weekly active % + DCS trend
- `GoalAchievementWidget` — donut or progress bar: below / near / at target
- `SubskillHeatmap` — grid of sub-skills coloured by avg accuracy

#### UI structure addition (Phase 2)

```
Analytics tab (new)
├── KPI row: Avg Band · Improvement since Diagnostic · IA Completion Rate · Exam-Ready Count
├── Cohort Progress chart (avg band per skill, last 6 months)
├── Batch Comparison table
├── Instructor Effectiveness table
├── Engagement Trends (weekly DCS + active %)
├── Sub-skill Heatmap
└── Goal Achievement widget
```

---

### Phase 3 — Financial Dashboard
**Scope:** Revenue tracking, subscription/plan data, per-student billing. Requires new infrastructure.

**Who benefits:** Institute Owner only

#### New data infrastructure needed

| What | How |
|---|---|
| Payment / subscription table | Add `institute_subscriptions` table: plan_type, amount, billing_cycle, status, next_billing_date |
| Student payment records | Add `student_payments` table: student_id, institute_id, amount, plan_type, paid_at |
| Plan configuration | Either hardcode plan tiers (Starter / Growth / Enterprise) or add `plan_config` table |
| Revenue attribution | Tag each student enrollment with exam_type + plan_type for revenue breakdown |

#### Backend work (after data infrastructure)

| Endpoint (new) | What it returns |
|---|---|
| `GET /api/institute-owner/financial/summary` | Monthly revenue, YTD revenue, total enrolled students, avg revenue per student, MoM growth |
| `GET /api/institute-owner/financial/revenue-trend` | Monthly revenue time series (last 6–12 months), overlaid with student count |
| `GET /api/institute-owner/financial/plan-distribution` | Student count per plan tier (Starter / Growth / Enterprise) |
| `GET /api/institute-owner/financial/revenue-by-exam` | Revenue split by exam type (IELTS / GMAT / PTE / AWS) |
| `GET /api/institute-owner/financial/student-billing` | Per-student: name, plan, amount, enrolled date, status |

#### Frontend work

- Add **Financial tab** to Owner dashboard
- Replace `RoiAnalytics.tsx` mock data with real financial data
- `RevenueTrendChart` — dual-axis line chart (revenue + student count)
- `PlanDistributionPie`
- `RevenueByExamBreakdown` — coloured cards per exam type
- `StudentBillingTable` — sortable, filterable

---

### Phase 4 — Marketing & Lead Tracking
**Scope:** Lead pipeline, acquisition sources, conversion funnel. Requires new tables and possibly institute input for some data.

**Who benefits:** Institute Owner only

#### New data infrastructure needed

| What | How |
|---|---|
| Lead tracking table | `institute_leads`: source, name, phone, status (new/contacted/enrolled/lost), created_at |
| Acquisition source enum | WhatsApp Referral, Google Search, Institute Referral, Social Media, Walk-in, Other |
| Conversion events | Link lead_id → student enrollment when a lead converts |
| Marketing spend (optional) | `institute_marketing_spend`: source, amount, month — requires institute to input their spend |

#### Backend work

| Endpoint (new) | What it returns |
|---|---|
| `GET /api/institute-owner/marketing/summary` | Leads this month, conversion rate, cost per acquisition (if spend data exists) |
| `GET /api/institute-owner/marketing/lead-pipeline` | Monthly leads vs. conversions (last 4 months) |
| `GET /api/institute-owner/marketing/acquisition-sources` | Student count per acquisition source with % share |
| `POST /api/institute-owner/marketing/leads` | Add a new lead |
| `PATCH /api/institute-owner/marketing/leads/:id` | Update lead status |

#### Frontend work

- Add **Marketing tab** to Owner dashboard
- `LeadPipelineChart` — grouped bar chart (leads vs enrolled, monthly)
- `AcquisitionSourceBreakdown` — horizontal progress bars per source
- `LeadTable` — manage leads (add, update status)
- `MarketingKPIRow` — leads this month · conversion rate · cost per acquisition

---

### Phase 5 — Career Launch / Hireflow
**Scope:** Surface students ready for placement, feed into the employer matching product. This is a future product area — partially derivable from existing data, partially a new product.

**Who benefits:** Institute Owner only

#### What can be built from existing data

- **Exam-ready students list** — students where `current_band ≥ target_band − 0.5` AND at least one mock cleared
- **Sub-skill verified profiles** — students with ≥ 4 completed IAs have a verified sub-skill profile

#### New infrastructure needed

- `hireflow_profiles` table — activated when a student meets placement criteria
- Employer-facing product (out of scope for this document)

---

## 5. Data Gap Summary

| Module | New tables needed | Estimated complexity |
|---|---|---|
| Phase 1 — Operational | None | Low — new endpoints, existing data |
| Phase 2 — Analytics | None | Medium — aggregation queries across multiple tables |
| Phase 3 — Financial | `institute_subscriptions`, `student_payments` | High — payment integration, billing logic |
| Phase 4 — Marketing | `institute_leads`, optionally `institute_marketing_spend` | Medium — new CRM-lite feature |
| Phase 5 — Career | `hireflow_profiles` | High — new product area |

---

## 6. Build Order & Priorities

```
Phase 1 (build first — unblocked, delivers full admin role)
  └── Backend: 9 new endpoints (institute-owner + institute-admin routes)
  └── Frontend: Replace mock data, fix broken endpoints, build admin shell

Phase 2 (build second — analytics on real data)
  └── Backend: 6 analytics aggregation endpoints
  └── Frontend: Analytics tab with charts + tables

Phase 3 (after financial infrastructure decision)
  └── Requires product + payment decisions before backend starts

Phase 4 (parallel with or after Phase 3)
  └── Relatively self-contained, can start once lead table is added

Phase 5 (future — after core product stabilises)
```

---

## 7. API Namespace Convention

| Caller | Base path | Auth check |
|---|---|---|
| Institute Owner | `/api/institute-owner/` | `INSTITUTE_OWNER` |
| Institute Admin | `/api/institute-admin/` | `INSTITUTE_ADMIN` or `INSTITUTE_OWNER` |
| Both (shared) | Owner routes accept both roles via `authorize(INSTITUTE_OWNER, INSTITUTE_ADMIN)` on applicable routes |

Owner can always hit admin routes. Admin cannot hit owner-only routes (financial, marketing, admin management, reports).

---

## 8. Phase 1 Endpoint Checklist (Ready to Build)

These are all derivable from existing data. No schema changes needed.

- [ ] `GET /api/institute-owner/institute-summary`
- [ ] `GET /api/institute-owner/batches`
- [ ] `GET /api/institute-owner/batches/:batchId/dashboard-summary`
- [ ] `GET /api/institute-owner/students/:studentId/full-progress`
- [ ] `GET /api/institute-owner/at-risk`
- [ ] `GET /api/institute-owner/instructors`
- [ ] `GET /api/institute-admin/batches`
- [ ] `GET /api/institute-admin/batches/:batchId/dashboard-summary`
- [ ] `GET /api/institute-admin/students/:studentId/full-progress`
- [ ] `GET /api/institute-admin/at-risk`
