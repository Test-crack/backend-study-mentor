# Testcrack B2B Migration & Feature Architecture Plan

## 1. Vision: Transition to Institute-Centric Platform

Testcrack is evolving from a **direct-to-consumer (B2C)** model into a **B2B institute-centric digital campus platform**.

Institutes become primary customers and manage their own:

* Students
* Instructors
* Courses
* Analytics
* Licenses

Each institute will operate as its own **tenant** inside Testcrack.

---

# 2. Role Hierarchy & Capabilities

## 🏫 Institute Admin (Primary Customer)

**Role:** Owner of institute account

**Capabilities**

* Purchase/manage licenses
* Add/remove instructors & students (bulk upload/invite)
* View institute-wide analytics
* Manage branding & settings
* Monitor engagement & usage

---

## 👨‍🏫 Instructor (Facilitator)

**Role:** Manages learning for students

**Capabilities**

* Create/manage courses & assessments
* Track student progress
* Assign work & grade
* View cohort analytics
* Identify at-risk students

---

## 🎓 Student (End User)

**Role:** Learner inside institute

**Capabilities**

* Access assigned courses & assessments
* Practice tools (reading, speaking, etc.)
* View performance analytics
* Optional access to public content library

---

# 3. Core User Flows

### 🏫 Institute Onboarding

1. Institute signs up
2. Completes profile
3. Adds instructors
4. Bulk uploads students via CSV

---

### 📅 Daily Usage

**Student**

* Logs in → sees institute dashboard
* Access assigned courses/tasks
* Practice + analytics

**Instructor**

* Logs in → class performance dashboard
* Review assignments & grading
* Monitor student progress

**Institute Admin**

* Logs in → institute dashboard
* View usage, licenses, engagement

---

# 4. Technical Architecture (High Level)

## 4.1 Multi-Tenancy Model

Introduce **Institute as Tenant**

### Institute Model

```prisma
model Institute {
  id          String   @id @default(dbgenerated("uuid_generate_v4()")) @db.Uuid
  name        String   @db.VarChar(255)
  code        String   @unique @db.VarChar(50)
  domain      String?
  logo        String?
  address     String?
  contactInfo Json?
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  users       User[]
  courses     Course[]
  licenses    License[]
}
```

---

## 4.2 User Model Update

```prisma
model User {
  id            String @id @default(dbgenerated("uuid_generate_v4()")) @db.Uuid
  email         String @unique
  instituteId   String? @db.Uuid
  studentId     String?

  Institute     Institute? @relation(fields: [instituteId], references: [id])
}
```

### Role Scoping Logic

| Role                     | Meaning         |
| ------------------------ | --------------- |
| ADMIN + instituteId      | Institute Admin |
| ADMIN + null instituteId | Super Admin     |
| INSTRUCTOR               | Instructor      |
| STUDENT                  | Student         |

---

## 4.3 Course Visibility

```prisma
model Course {
  id          String @id @default(uuid())
  title       String
  instituteId String? // null = global/public

  Institute   Institute? @relation(fields: [instituteId], references: [id])
}
```

---

# 5. Authentication & Authorization

### Login Logic

Option 1: Institute Code login
Option 2: Auto detect via email domain

### Middleware Enforcement

Every API must filter by institute:

```
where: { instituteId: user.instituteId }
```

Ensures:

> Institute A cannot access Institute B data

---

# 6. API Layer Changes

## New Endpoints

### Institute

```
POST /api/institutes
GET /api/institutes/:id/dashboard
POST /api/institutes/:id/users/bulk
GET /api/analytics/institute
```

### Modified

```
GET /api/courses → public + institute courses
GET /api/users → scoped by institute
```

---

# 7. Frontend Architecture (Next.js)

## New Dashboards

### Institute Admin Dashboard

```
/institute/admin
```

Features:

* User management
* License usage
* Analytics
* Branding settings

### Instructor Dashboard

```
/instructor/dashboard
```

Features:

* Class analytics
* Grading
* Progress tracking

### Student Dashboard

```
/student/dashboard
```

Features:

* Assigned courses
* Practice modules
* Institute branding

---

# 8. Migration Strategy

### Phase 1 — DB Migration

* Create Institute table
* Create default public institute
* Link existing users to default

### Phase 2 — Admin Tools

* Create institute
* Add users
* Invite flows

### Phase 3 — Enforcement

* Add institute middleware scoping

### Phase 4 — Pilot Rollout

* Onboard first institute
* Monitor usage
* Optimize

---

# 9. Interactive Practice Modules (Lovable-Style UX)

## 📖 Reading Practice Module

**Route:** `/student/reading-practice`

### UX

* Zen mode reader
* Inline comprehension questions
* Real-time feedback
* Focus tracking

### Tech

* Scroll tracking
* Focus tracking
* Time-per-paragraph metrics
* Enhanced reading analytics

---

## 🎤 Spoken English Practice

**Route:** `/student/spoken-english`

### UX

* Conversational interface
* Scenario based speaking
* Record → AI feedback
* Pronunciation highlighting

### Tech

* MediaRecorder API
* Whisper / Google STT
* Pronunciation scoring
* Real-time feedback

---

# 10. Speaking Analytics Schema

```prisma
model SpeakingAssessmentHistory {
  id                 String   @id @default(uuid())
  userId             String
  scenarioId         String
  recordingUrl       String?
  transcript         String
  expectedText       String?

  pronunciationScore Float
  fluencyScore       Float
  grammarScore       Float
  completenessScore  Float

  feedback           Json?
  createdAt          DateTime @default(now())

  User User @relation(fields: [userId], references: [id])
}
```

---

# 11. Analytics Strategy (All Dashboards)

| Metric   | Student         | Instructor        | Institute          |
| -------- | --------------- | ----------------- | ------------------ |
| Reading  | Personal growth | Class avg         | Institute avg      |
| Speaking | Skill feedback  | Fluency heatmap   | Participation rate |
| Activity | Daily practice  | Inactive students | Total hours        |

### Implementation

Use:

* Aggregated tables
* Materialized views
* Nightly cron aggregation

For fast dashboards without heavy queries.

---

# 12. Strategic Outcome

After migration Testcrack becomes:

### 🚀 Institute Operating System for Learning

Not just a test tool.

### Revenue Channels

* Institute SaaS subscriptions
* Course marketplace
* Premium AI practice modules
* Analytics dashboards

