# TestCrack — System Architecture & Technical Overview
**Document Type:** Internal Reference  
**Audience:** TestCrack Core Team  
**Last Updated:** June 2026  

---

## Table of Contents
1. [Product Overview](#1-product-overview)
2. [Infrastructure — Hostinger VPS](#2-infrastructure--hostinger-vps)
3. [Application Architecture](#3-application-architecture)
4. [User Interfaces & Roles](#4-user-interfaces--roles)
5. [API & Orchestration Layer](#5-api--orchestration-layer)
6. [AI / ML Stack](#6-ai--ml-stack)
7. [Data Layer](#7-data-layer)
8. [Third-Party Integrations](#8-third-party-integrations)
9. [Security & Access Control](#9-security--access-control)
10. [Current State & Known Gaps](#10-current-state--known-gaps)

---

## 1. Product Overview

**TestCrack** is a B2B SaaS platform purpose-built for IELTS coaching centers. It gives institutes a full digital infrastructure to manage students, run AI-graded assessments, track competency progression, and deliver structured practice — all in one place.

**Primary Users**
| Role | Who They Are |
|---|---|
| Institute Owner | Owns a coaching center; purchases access, manages the institute |
| Institute Admin | Manages day-to-day operations (enrollment, batch setup) |
| Instructor | Conducts assessments, monitors student performance |
| Student | Practices, takes assessments, tracks their IELTS band progression |
| SuperAdmin | TestCrack team; manages all institutes on the platform |

**Core Feature Set**
- Diagnostic Assessment (baseline band mapping across L/R/W/S)
- Internal Assessments (IA) — skill-targeted, AI-graded, carry-forward logic
- Mock Tests — full IELTS simulation, AI-graded writing and speaking
- Drill Engine — daily skill drills with DCS (Drill Competency Score) tracking
- LexiGrid — vocabulary game
- Smart Notes — AI-powered study notes from YouTube videos and uploads
- Voice Lab — speaking practice with AI scoring
- Instructor Dashboard — student risk monitoring, assessment oversight, progress analytics
- Institute Owner Dashboard — batch management, instructor management
- Payment via Razorpay (course/subscription purchases)

---

## 2. Infrastructure — Hostinger VPS

### Server Specifications

| Property | Value |
|---|---|
| Provider | Hostinger |
| Plan | KVM 2 |
| Location | India — Mumbai |
| IP Address | 72.60.221.118 |
| OS | Ubuntu 24.04 LTS |
| CPU | 2 vCores |
| RAM | 8 GB |
| Disk | 100 GB SSD |
| Bandwidth | 8 TB/month |
| Backup Schedule | Weekly (2 snapshots retained) |
| Plan Expiry | 2027-10-28 (auto-renewal: ON) |

### Current Resource Utilisation (baseline)
| Metric | Current |
|---|---|
| CPU Usage | ~1% |
| Memory Usage | ~11% (~900 MB of 8 GB) |
| Disk Used | 10 GB / 100 GB |
| Network (incoming) | 1.9 MB |
| Network (outgoing) | 0.3 MB |

> Platform is well within capacity for current scale. Significant headroom exists before an upgrade is needed.

### Server Stack Diagram

```
Internet
    │
    ▼
┌─────────────────────────────────────────────┐
│             Nginx (Reverse Proxy)           │
│  Port 80 → redirect to 443 (HTTPS/SSL)      │
│  Port 443 → routes:                         │
│    /api/*  → Node.js Backend (PM2, :4000)   │
│    /*      → React Static Build             │
└─────────────────────────────────────────────┘
    │                      │
    ▼                      ▼
Node.js API          Static Frontend
(Express, PM2)       (/var/www or similar)
    │
    ▼
PostgreSQL (local, port 5432)
```

### Deployment Setup
- **Process Manager:** PM2 — keeps the Node.js API process alive, auto-restarts on crash, starts on server reboot
- **Web Server:** Nginx — handles SSL termination, serves the React static build, proxies `/api` requests to Express
- **Frontend:** React app compiled to static HTML/JS/CSS, served directly by Nginx (no Node.js for frontend)
- **Database:** PostgreSQL running locally on the VPS (same machine as API)
- **CDN:** None currently — all assets served directly from VPS
- **CI/CD:** Manual deploys (SSH → pull → build → pm2 restart). GitHub Actions planned for a future phase.

---

## 3. Application Architecture

TestCrack is a **monolithic full-stack application** split into two repos:

### 3.1 Frontend — `ai-study-mentor`
| Property | Details |
|---|---|
| Framework | React 18 + TypeScript |
| Build Tool | Vite |
| Styling | Tailwind CSS |
| Routing | React Router v6 |
| State | Local React state + custom hooks (`useStudentFullProgress`, `useInstructorBatches`, etc.) |
| Auth Client | Supabase JS SDK |
| API Communication | Custom `callBackend()` wrapper (attaches Supabase JWT to every request) |
| Charts | Recharts |

**Feature Modules**
```
src/features/
├── auth/              # Supabase login, signup, callback
├── student/           # Student dashboard, drill engine, progress
├── instructor/        # Instructor dashboard, student deep-dive, assessment overview
├── institute/         # Owner & admin dashboards, batch/instructor management
├── superadmin/        # Platform-wide management
├── courses/           # Course browsing, enrollment, module progress
├── notes/             # Smart Notes (YouTube analyzer, PDF upload, AI summaries)
├── drills/            # Drill runner UI
├── mocks/             # Mock test runner
├── voice-lab/         # Speaking practice with AI scoring
├── reading-assessment/# IELTS reading assessment
├── payment/           # Razorpay checkout flow
└── profile/           # User profile, settings
```

### 3.2 Backend — `backend-study-mentor`
| Property | Details |
|---|---|
| Runtime | Node.js (Express) |
| Language | TypeScript |
| ORM | Prisma |
| Database | PostgreSQL |
| Auth Middleware | Supabase JWT verification (`requireAuth`) |
| User Sync | `ensureUser` middleware — syncs Supabase auth user into local `User` table on first call |
| Process Manager | PM2 |

**Controller Structure**
```
src/controllers/
├── authController             # User registration, profile
├── instructorProgressController # Student full-progress, assessment overview
├── instructorDashboardController# Batch stats, at-risk students, activity
├── drillController            # Drill sessions, DCS scoring
├── iaController               # Internal Assessment sessions
├── mockController             # Mock test sessions
├── diagnosticController       # Diagnostic assessment (baseline)
├── courseController           # Course/module/content management
├── notesController            # Smart Notes + YouTube summarizer
├── paymentController          # Razorpay order creation & verification
├── instituteController        # Institute/batch/instructor management
└── superAdminController       # Cross-institute admin operations
```

---

## 4. User Interfaces & Roles

### 4.1 Student Interface
The student-facing product — accessed after login, scoped to their enrolled institute's batch.

| Section | What it does |
|---|---|
| Dashboard | Streak, momentum score, competency bands (L/R/W/S), upcoming IA, quick-drill CTA |
| Diagnostic | One-time entry-level assessment across all 4 IELTS skills; sets the baseline band |
| Drills | Daily skill-targeted practice; DCS (accuracy %) tracked; drives IA eligibility |
| Internal Assessment (IA) | Scheduled assessments; skill + sub-skill targeted; AI grading for writing/speaking |
| Mock Tests | Full IELTS simulation; AI-graded; real band score returned; momentum awarded |
| Voice Lab | Speaking practice; audio recorded, transcribed, AI-scored per IELTS criterion |
| Smart Notes | Paste a YouTube link or upload a PDF → AI generates structured study notes |
| LexiGrid | Vocabulary game — word grid challenges, timed, bonus scoring |
| Courses | Enroll in courses, track module completion |
| Profile | Target band, personal settings |

### 4.2 Instructor Interface
Used by teachers within an institute to manage and monitor their students.

| Section | What it does |
|---|---|
| Dashboard | Batch overview — competency radar, band distribution table, at-risk student list, activity heatmap |
| Student Deep-Dive | Per-student: Overview (radar, eligibility, LexiGrid stats), IA history + AI feedback, Mock history + AI feedback, Diagnostic full report, Drill analytics |
| Assessment Overview | Batch-level view of all IA/Mock/Diagnostic results; per-student status, completion %, avg bands |

### 4.3 Institute Owner / Admin Interface
Manages the institute as a business unit.

| Section | What it does |
|---|---|
| Batch Management | Create/manage batches, enroll students, assign instructors |
| Instructor Management | Add/remove instructors, assign to batches |
| Student Management | View enrolled students, track overall progress |
| Subscription / Billing | Manage plan, view payment history |

### 4.4 SuperAdmin Interface
TestCrack internal — manages all institutes on the platform.

| Section | What it does |
|---|---|
| Institute Management | Create institutes, assign owners |
| User Management | Cross-platform user lookup and role management |
| Content Management | Manage the shared question bank, courses, and drill content |
| Platform Analytics | Usage across all institutes |

---

## 5. API & Orchestration Layer

### 5.1 API Design
- **Style:** RESTful (Express.js)
- **Base URL:** `https://<domain>/api`
- **Auth:** All protected routes require `Authorization: Bearer <supabase_jwt>` header
- **Multi-tenancy:** Routes scoped to institute/batch via URL params (e.g., `/api/instructor/batches/:batchId/students/:studentId/full-progress`)

### 5.2 Key API Route Groups

| Route Group | Purpose |
|---|---|
| `POST /api/auth/*` | Registration, profile update |
| `GET /api/instructor/batches/:id/*` | Instructor data — dashboard, student progress, assessment overview |
| `POST /api/drills/*` | Drill session start, answer submission, completion |
| `POST /api/ia/*` | IA session management, score submission |
| `POST /api/mock/*` | Mock test submission and scoring |
| `POST /api/diagnostic/*` | Diagnostic assessment per skill |
| `GET/POST /api/courses/*` | Course catalog, enrollment, module progress |
| `POST /api/notes/*` | Smart Notes generation (YouTube/PDF) |
| `POST /api/payment/*` | Razorpay order creation and webhook verification |
| `GET/POST /api/institute/*` | Batch/instructor/student management |
| `GET/POST /api/superadmin/*` | Platform-level management |

### 5.3 AI Orchestration Flow

There is no dedicated orchestration layer or API gateway today. AI calls are made **synchronously within the Express request lifecycle**:

```
Student submits writing/speaking answer
        │
        ▼
Express Controller
        │
        ├─► Validate answer, store raw_answers to DB
        │
        ├─► Call Gemini 2.5 Flash API (grading)
        │       └─► Returns: band_score, sub_skill_scores,
        │                     ai_feedback { rationale, key_observations }
        │
        ├─► Call Google Speech-to-Text (speaking only)
        │       └─► Returns: transcript text
        │
        ├─► Store results to AssessmentHistory / IASession
        │
        └─► Return response to frontend
```

**Implication:** AI grading latency is inline with the HTTP response. If Gemini is slow, the user waits. This works at current scale but is a known item to address with async processing (job queues) as volume grows.

### 5.4 Automated Workflows
Currently **no background workers, cron jobs, or job queues** are in use. All processing is request-driven. Planned additions:
- Weekly batch progress summary emails
- IA scheduling automation
- CI/CD pipeline (GitHub Actions)

---

## 6. AI / ML Stack

TestCrack uses AI for assessment grading, feedback generation, and content enrichment. All AI interactions are **server-side** — the API key is never exposed to the frontend.

### 6.1 AI Models in Use

| Model | Provider | Used For |
|---|---|---|
| **Gemini 2.5 Flash** | Google (Gemini API) | IELTS Writing grading (band + sub-skill scores + AI feedback) |
| **Gemini 2.5 Flash** | Google (Gemini API) | IELTS Speaking evaluation (band + fluency/grammar/vocab/pronunciation scores) |
| **Gemini 2.5 Flash** | Google (Gemini API) | IELTS concept generation for drill content |
| **Gemini 2.5 Flash** | Google (Gemini API) | YouTube video summarization → Smart Notes |
| **Google Speech-to-Text** | Google Cloud | Audio transcription for Speaking assessments |

### 6.2 What AI Grades

**Writing Assessment**
- Sub-skills scored: Task Response, Coherence & Cohesion, Grammatical Range & Accuracy, Lexical Resource
- Output: Band (0–9) per sub-skill + overall band + `rationale` (paragraph) + `key_observations` (bullet list)

**Speaking Assessment**
- Sub-skills scored: Fluency & Coherence, Lexical Resource, Grammatical Range & Accuracy, Pronunciation
- Process: Audio → Google STT → transcript → Gemini scoring
- Output: Band per sub-skill + `rationale` + `key_observations`

**Diagnostic Assessment**
- Covers all 4 skills (L/R/W/S) independently
- Listening & Reading: MCQ-based (accuracy-driven band)
- Writing & Speaking: AI-graded (same pipeline as above)
- Output stored in `AssessmentHistory` with `sub_scores` + `feedback_json`

### 6.3 AI Cost Profile
- Gemini 2.5 Flash is Google's cost-efficient model — suitable for high-frequency grading
- All calls are per-submission (no embeddings, no vector search, no fine-tuning)
- Cost scales linearly with number of writing/speaking submissions

---

## 7. Data Layer

### 7.1 Database
- **Engine:** PostgreSQL (local on VPS, same machine as API)
- **ORM:** Prisma (schema-first, migrations managed via `prisma migrate`)
- **Access:** Via Prisma Client in Node.js — no direct DB access from frontend

### 7.2 Core Data Models

**Identity & Roles**
| Model | Description |
|---|---|
| `User` | Core user record (id, name, email, role); synced from Supabase auth |
| `institute_owners` | Links User → Institute with OWNER role |
| `institute_admins` | Links User → Institute with ADMIN role |
| `institute_instructors` | Links User → Institute as instructor |
| `institute_students` | Links User → Institute batch as student; holds target_band, momentum_score, daily_streak |

**Assessment & Progress**
| Model | Description |
|---|---|
| `AssessmentHistory` | All diagnostic assessment results — `skill`, `band_score`, `sub_scores (JSONB)`, `feedback_json (JSONB)`, `raw_answers (JSONB)`, `transcript` |
| `IASession` | Internal Assessment session — `ia_number`, `ia_date`, `status`, `selected_subskills`, `scores (JSONB)`, `carry_forward_subskills`, `momentum_awarded` |
| `mocksessions` | Mock test session — `month_year`, `attempt_type`, `status`, `scores (JSONB)`, `real_band_score`, `momentum_awarded` |
| `DrillSession` | Individual drill attempt — `skill`, `sub_skill`, `correct_answers`, `total_questions`, DCS derivable |
| `StudentCompetencyMatrix` | Latest competency snapshot per student per skill — `band_score`, `sub_scores`, `assessments_count`, `last_updated` |

**Score JSON Shapes (JSONB fields)**

*IASession.scores:*
```json
[
  {
    "skill": "WRITING",
    "sub_skill": "GRAMMAR",
    "band": 6.5,
    "correct": 3,
    "total": 4,
    "ai_graded": true,
    "ai_feedback": {
      "rationale": "...",
      "key_observations": ["...", "..."]
    }
  }
]
```

*mocksessions.scores:*
```json
[
  {
    "skill": "WRITING",
    "band": 5.5,
    "total": 16,
    "correct": 8,
    "ai_graded": true,
    "sub_skill_scores": [
      {
        "sub_skill": "GRAMMAR",
        "band": 5.0,
        "ai_band": 5.0,
        "correct": 2,
        "total_mcq": 4,
        "ai_feedback": { "rationale": "...", "key_observations": ["..."] }
      }
    ]
  }
]
```

*AssessmentHistory.sub_scores (Writing):*
```json
{
  "word_count": 280,
  "grammarScore": 6.0,
  "vocabularyScore": 5.5,
  "coherenceScore": 6.0,
  "taskResponseScore": 6.5,
  "feedback": { "grammar": "...", "coherence": "...", ... }
}
```

**Content & Learning**
| Model | Description |
|---|---|
| `Course` | Top-level course (title, description, price) |
| `Module` | Chapter/unit within a course |
| `Content` | Individual content item (video, text, PDF) |
| `UserContentProgress` | Tracks student completion per content item |
| `CourseOrder` | Payment record — `razorpayOrderId`, `razorpayPaymentId`, `status` |
| `StudentGameScore` | LexiGrid game scores — `words_solved`, `bonus_eligible`, `completed`, `session_date` |

**Institute Structure**
| Model | Description |
|---|---|
| `Institute` | Institute record (name, plan, owner) |
| `Batch` | Group of students within an institute — `name`, `target_band`, `start_date`, `status` |

### 7.3 File Storage

| File Type | Storage Location |
|---|---|
| Profile images | Cloudinary |
| Course media (thumbnails, video thumbnails) | Cloudinary |
| Speaking assessment audio recordings | Local VPS disk |
| Smart Notes uploads (PDFs) | Local VPS disk |

> **Note:** Local VPS storage for audio and PDFs means these files are not replicated and would be lost if the VPS is rebuilt without a backup restore. This is a known gap to address.

### 7.4 Competency Matrix — How Bands Are Computed

The `StudentCompetencyMatrix` stores the **current band** per student per skill. It is updated after each completed assessment (IA, Mock, or Diagnostic). The band shown to instructors in dashboards derives from this table.

```
New Assessment Completed
        │
        ▼
AI returns band_score per skill/sub-skill
        │
        ▼
AssessmentHistory record written
        │
        ▼
StudentCompetencyMatrix updated:
  - band_score = latest assessment band (or weighted average, per skill logic)
  - assessments_count incremented
  - last_updated = now
```

---

## 8. Third-Party Integrations

| Service | Provider | What We Use It For | Auth Method |
|---|---|---|---|
| **Authentication** | Supabase (Cloud) | User signup/login, JWT issuance, session management | `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` |
| **Transactional Email** | Resend (via Supabase) | Welcome emails, password reset, notifications | Configured inside Supabase Auth settings |
| **AI Grading & Feedback** | Google Gemini API | Writing/Speaking IELTS scoring, concept generation, Smart Notes | `GEMINI_API_KEY` |
| **Speech-to-Text** | Google Cloud STT | Transcribing student speaking audio before AI scoring | Google Cloud credentials |
| **Media Storage** | Cloudinary | Profile images, course media | Cloudinary API key/secret |
| **Payment Processing** | Razorpay | Course/subscription purchases | Razorpay Key ID + Secret |
| **YouTube Data** | YouTube Data API + `ytdlp-nodejs` + `youtubei.js` | Extracting video transcripts for Smart Notes feature (three fallback methods) | `YOUTUBE_API_KEY` |

---

## 9. Security & Access Control

### 9.1 Authentication Flow
```
User logs in via Supabase (email/password or OAuth)
        │
        ▼
Supabase issues signed JWT (access token)
        │
        ▼
Frontend stores token (Supabase SDK manages refresh)
        │
        ▼
All API calls: Authorization: Bearer <token>
        │
        ▼
Backend: requireAuth middleware validates token via Supabase
        │
        ▼
ensureUser middleware: syncs Supabase user → local User table
        │
        ▼
Controller executes with verified req.appUserId
```

### 9.2 Role-Based Access Control (RBAC)
- User roles stored in `User.role` (`STUDENT`, `INSTRUCTOR`, `INSTITUTE_OWNER`, `INSTITUTE_ADMIN`, `ADMIN`, `SUPERADMIN`)
- Controllers verify role before executing sensitive operations
- Multi-tenancy enforced at query level — instructors can only access students within their institute's batches

### 9.3 Current Security Notes
| Item | Status |
|---|---|
| HTTPS / SSL | Nginx with SSL (Let's Encrypt or manual cert) |
| Firewall rules | 0 custom rules configured (Hostinger panel shows 0) — relies on OS-level UFW |
| Malware scanner | Not installed |
| DB access | PostgreSQL local-only (no external port exposed) |
| API keys | Stored as environment variables on VPS (`.env`), not committed to repo |
| Weekly backups | 2 snapshots retained by Hostinger |

> **Gaps to address:** Firewall rules should be configured (allow only 22, 80, 443), malware scanner should be installed, and a `.env` secrets rotation process should be documented.

---

## 10. Current State & Known Gaps

### What's Working Well
- Full assessment pipeline (Diagnostic → Drills → IA → Mock) is end-to-end functional with AI grading
- Instructor dashboard gives real-time visibility into student risk, competency, and assessment history
- Multi-tenant architecture supports multiple institutes on one codebase/deployment
- Low resource usage at current scale — plenty of headroom on the VPS

### Known Gaps & Planned Work

| Gap | Impact | Priority |
|---|---|---|
| No CI/CD pipeline | Manual deploys risk downtime and human error | High |
| Audio/PDF files on local VPS disk | Lost if VPS rebuilt; not scalable | High |
| No background job queue | AI grading is inline — slow Gemini calls block HTTP responses | Medium |
| No CDN | Static assets served from VPS — adds latency for non-Mumbai users | Medium |
| No automated DB backups beyond weekly Hostinger snapshot | Data loss window of up to 7 days | Medium |
| No monitoring/alerting | Outages not detected until a user reports | Medium |
| Resend email via Supabase only | Limited email customization and analytics | Low |

### Recommended Next Steps (Technical Roadmap)
2. **Short-term:** Set up GitHub Actions CI/CD (test → build → deploy via SSH)
3. **Short-term:** Move audio recordings to Cloudinary or S3 (remove local disk dependency)
4. **Medium-term:** Add a job queue (BullMQ + Redis) so AI grading runs async — improves UX response times
5. **Medium-term:** Add application monitoring (PM2 metrics + UptimeRobot or Betterstack for uptime alerts)
6. **Long-term:** CDN layer (Cloudflare free tier works) for static assets

---

*Document maintained by the TestCrack engineering team. Update when infrastructure or integrations change.*
