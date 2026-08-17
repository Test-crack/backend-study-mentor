# Sprint 1: Monorepo Foundation + Schema Migration

**Branch:** `platform/s1` (both repos)  
**Backend base:** `dev` | **Frontend base:** `main`  
**Target:** Wk 3–4 (~4 dev days)  
**Objective:** Remove every IELTS-coupling at the DB, code, and route level — without touching user-facing behaviour. When S1 merges, zero users notice a change. When S2 starts, OET has a clear runway.

---

## Pre-Conditions (Must Be True Before Starting)

- [ ] S0 diagnostic bug fixes (Diagnosis.tsx) committed and merged to `main` (currently uncommitted on `diagnostics/v2`)
- [ ] Mock timer section feature merged to `main`
- [ ] S0 prod VPS migrations applied (`MockSectionAttempt`, `diagnostic_status` VIEW, grants)
- [ ] **Supabase migration status confirmed** — if JWT auth migration is done, `packages/auth-client/` can be extracted in Phase 5. If not, skip Phase 5 and add it to S0 backlog.

---

## Work Sequence (Dependency Map)

```
Phase 1: Prisma schema migration
    ↓
Phase 2: Update 11 backend source files (enum renames + compiles)
    ↓
Phase 3: Route restructuring + file renames
    ↓
Phase 4: Monorepo root scaffold (parallel with Phase 3 if two devs)
    ↓
Phase 5: packages/ui skeleton [CONDITIONAL on Supabase migration]
    ↓
Phase 6: Frontend API route call updates
    ↓
Phase 7: Verification gate — both apps build, IELTS smoke test
    ↓
VPS: prisma db push (MANUALLY on VPS, not in CI)
```

---

## Phase 1 — Backend: Prisma Schema Migration

**Time estimate:** 2 days  
**Risk:** High (irreversible DB changes) — do this first, on its own PR if needed  
**Rule:** `prisma generate` locally. Do NOT run `prisma db push` until Phase 7 verification is complete on prod.

### 1.1 — Add `ExamType` enum

In `prisma/schema.prisma`, add before the existing enums:

```prisma
enum ExamType {
  IELTS
  OET
  GRE
  TOEFL
  PTE
}
```

### 1.2 — Rename `IeltsSkillType` → `SkillType`

Find (line ~992 in schema.prisma):
```prisma
enum IeltsSkillType {
  LISTENING
  READING
  WRITING
  SPEAKING
}
```

Replace with:
```prisma
enum SkillType {
  LISTENING
  READING
  WRITING
  SPEAKING
}
```

### 1.3 — Rename `IeltsSubSkillType` → `SubSkillType`

Find (line ~939 in schema.prisma):
```prisma
enum IeltsSubSkillType {
  LISTENING
  READING
  GRAMMAR
  VOCABULARY
  COHERENCE
  TASK_RESPONSE
  FLUENCY
  PRONUNCIATION
}
```

Replace with:
```prisma
enum SubSkillType {
  LISTENING
  READING
  GRAMMAR
  VOCABULARY
  COHERENCE
  TASK_RESPONSE
  FLUENCY
  PRONUNCIATION
}
```

### 1.4 — Update all enum references inside model bodies

These models reference the old enum names — update the field type annotations:

| Model | Field | Old type | New type |
|-------|-------|----------|----------|
| `StudentCompetencyMatrix` | `skill` | `IeltsSkillType` | `SkillType` |
| `AssessmentHistory` | `skill` | `IeltsSkillType` | `SkillType` |
| `RecommendationItem` | `skill_type` | `IeltsSkillType` | `SkillType` |
| `RecommendationItem` | `sub_skill` | `IeltsSubSkillType?` | `SubSkillType?` |
| `DrillSession` | `skill` | `IeltsSkillType` | `SkillType` |
| `DrillSession` | `sub_skill` | `IeltsSubSkillType` | `SubSkillType` |
| `DrillQuestion` | `skill` | `IeltsSkillType` | `SkillType` |
| `DrillQuestion` | `sub_skill` | `IeltsSubSkillType` | `SubSkillType` |
| `IAQuestion` | `skill` | `IeltsSkillType` | `SkillType` |
| `IAQuestion` | `sub_skill` | `IeltsSubSkillType` | `SubSkillType` |
| `mockquestions` | `skill` | `IeltsSkillType` | `SkillType` |
| `mockquestions` | `sub_skill` | `IeltsSubSkillType?` | `SubSkillType?` |
| `diagnostic_questions` | `skill` | `IeltsSkillType` | `SkillType` |

### 1.5 — Add `exam_type` column to content and assessment models

Add `exam_type ExamType @default(IELTS)` to each model listed below. All existing rows default to IELTS — zero data migration needed.

**`StudentCompetencyMatrix`** — add after `id`:
```prisma
exam_type  ExamType  @default(IELTS)
```
Update `@@unique([student_id, skill])` → `@@unique([student_id, exam_type, skill])`

**`AssessmentHistory`** — add after `id`:
```prisma
exam_type  ExamType  @default(IELTS)
```
Add index: `@@index([exam_type])`

**`diagnostic_questions`** — add after `id`:
```prisma
exam_type  ExamType  @default(IELTS)
```
Update existing index: `@@index([level, skill, is_active])` → `@@index([exam_type, level, skill, is_active], map: "idx_dq_exam_level_skill_active")`

**`DrillQuestion`** — add after `id`:
```prisma
exam_type  ExamType  @default(IELTS)
```
Update index: `@@index([skill, sub_skill, level, is_active])` → `@@index([exam_type, skill, sub_skill, level, is_active])`

**`IAQuestion`** — add after `id`:
```prisma
exam_type  ExamType  @default(IELTS)
```

**`mockquestions`** — add after `id`:
```prisma
exam_type  ExamType  @default(IELTS)
```

**`DrillSession`** — add after `id`:
```prisma
exam_type  ExamType  @default(IELTS)
```

**`mocksessions`** — add after `id`:
```prisma
exam_type  ExamType  @default(IELTS)
```

**`IASession`** — add after `id`:
```prisma
exam_type  ExamType  @default(IELTS)
```

**`RecommendationItem`** — add after `id`:
```prisma
exam_type  ExamType  @default(IELTS)
```

### 1.6 — Rename `ielts_batches` → `batches` + add `exam_type`

Replace the three batch models entirely:

```prisma
model batches {
  id               String             @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  institute_id     String             @db.Uuid
  exam_type        ExamType           @default(IELTS)
  name             String             @db.VarChar(255)
  description      String?
  status           String             @default("ACTIVE") @db.VarChar(20)
  max_students     Int?
  created_by       String?            @db.Uuid
  created_at       DateTime           @default(now()) @db.Timestamptz(6)
  updated_at       DateTime           @default(now()) @db.Timestamptz(6)
  batch_instructors batch_instructors[]
  batch_students    batch_students[]
  User             User?              @relation(fields: [created_by], references: [id], onUpdate: NoAction)
  institutes       institutes         @relation(fields: [institute_id], references: [id], onDelete: Cascade, onUpdate: NoAction)

  @@index([institute_id], map: "idx_batches_institute")
  @@index([exam_type], map: "idx_batches_exam_type")
  @@index([status], map: "idx_batches_status")
}

model batch_instructors {
  id          String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  batch_id    String   @db.Uuid
  user_id     String   @db.Uuid
  assigned_at DateTime @default(now()) @db.Timestamptz(6)
  batches     batches  @relation(fields: [batch_id], references: [id], onDelete: Cascade, onUpdate: NoAction)
  User        User     @relation(fields: [user_id], references: [id], onDelete: Cascade, onUpdate: NoAction)

  @@unique([batch_id, user_id])
  @@index([batch_id], map: "idx_batch_instructors_batch")
  @@index([user_id], map: "idx_batch_instructors_user")
}

model batch_students {
  id          String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  batch_id    String   @db.Uuid
  user_id     String   @db.Uuid
  enrolled_at DateTime @default(now()) @db.Timestamptz(6)
  batches     batches  @relation(fields: [batch_id], references: [id], onDelete: Cascade, onUpdate: NoAction)
  User        User     @relation(fields: [user_id], references: [id], onDelete: Cascade, onUpdate: NoAction)

  @@unique([batch_id, user_id])
  @@index([batch_id], map: "idx_batch_students_batch")
  @@index([user_id], map: "idx_batch_students_user")
}
```

Update `User` model: replace the three `ielts_batch_*` relation fields with:
```prisma
batch_instructors  batch_instructors[]
batch_students     batch_students[]
batches            batches[]
```

Update `institutes` model: replace `ielts_batches ielts_batches[]` with `batches batches[]`

### 1.7 — Add `institute_exam_subscriptions` model

Add after the `institutes` model:

```prisma
model institute_exam_subscriptions {
  id           String     @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  institute_id String     @db.Uuid
  exam_type    ExamType
  activated_at DateTime   @default(now()) @db.Timestamptz(6)
  is_active    Boolean    @default(true)
  institutes   institutes @relation(fields: [institute_id], references: [id], onDelete: Cascade, onUpdate: NoAction)

  @@unique([institute_id, exam_type])
  @@index([institute_id], map: "idx_institute_exam_subs_institute")
}
```

Add the relation to the `institutes` model:
```prisma
institute_exam_subscriptions institute_exam_subscriptions[]
```

### 1.8 — Run generate and check TypeScript compile

```bash
cd e:\FreeLance\edtech\backend-study-mentor
npx prisma generate
npx tsc --noEmit
```

The compile will fail until Phase 2 is done — that's expected. Fix each error file by file.

---

## Phase 2 — Backend: Update Source Files (Enum Renames)

**Time estimate:** 1.5 days  
**What to do:** Find every `IeltsSkillType` → replace with `SkillType`. Find every `IeltsSubSkillType` → replace with `SubSkillType`. Update all Prisma client imports that used the old names.

### 2.1 — Files to update (11 files confirmed by grep)

For each file: change `import { ..., IeltsSkillType, ... } from '@prisma/client'` → `import { ..., SkillType, ... } from '@prisma/client'`. Then fix every usage of `IeltsSkillType` → `SkillType` and `IeltsSubSkillType` → `SubSkillType`.

| File | Notes |
|------|-------|
| `src/controllers/diagnosticController.ts` | Uses `IeltsSkillType` for skill parameter typing |
| `src/controllers/drillController.ts` | Queries by `skill: IeltsSkillType` |
| `src/controllers/instituteAdminController.ts` | Filters by skill type |
| `src/controllers/instituteOwnerController.ts` | Filters by skill type |
| `src/controllers/instructorController.ts` | Progress queries by skill |
| `src/controllers/instructorProgressController.ts` | Progress breakdown by skill |
| `src/controllers/readingPracticeController.ts` | Uses `IeltsSkillType.READING` |
| `src/controllers/batchController.ts` | References `ielts_batches` → update to `batches` |
| `src/lib/studentNotify.ts` | Skill-typed notifications |
| `src/lib/subskillSelector.ts` | `ALL_IA_PAIRS` typed with both enums |
| `src/services/recommendationService.ts` | Queries `RecommendationItem` by `skill_type` |

### 2.2 — Update `batchController.ts` for model rename

In `src/controllers/batchController.ts`, every `prisma.ielts_batches` → `prisma.batches`, `prisma.ielts_batch_students` → `prisma.batch_students`, `prisma.ielts_batch_instructors` → `prisma.batch_instructors`.

Also update all other controllers that query `ielts_batches`:
```bash
# Find all files still referencing the old model names after the enum changes:
grep -r "ielts_batches\|ielts_batch_students\|ielts_batch_instructors" src/
```

### 2.3 — Rename `bandScale.ts` → `scoringUtils.ts` + add OET stubs

Rename `src/lib/bandScale.ts` → `src/lib/scoringUtils.ts`.

Add OET scoring stubs at the bottom of the file (do NOT implement yet — just the signatures so the file is ready for S2):

```typescript
// ── OET scoring (implemented in S2 / exams/oet/ module) ──────────────────

/** Map a 0..1 fraction onto the OET 0–500 numeric scale. Stub — implement in S2. */
export function fractionToOETScore(_frac: number): number {
  throw new Error('OET scoring not yet implemented — see exams/oet/scoringStrategy.ts');
}

/** Convert OET numeric score (0–500) to letter grade A–E. Stub — implement in S2. */
export function oetNumericToGrade(_score: number): 'A' | 'B' | 'C' | 'D' | 'E' {
  throw new Error('OET scoring not yet implemented — see exams/oet/scoringStrategy.ts');
}
```

Update all imports of `bandScale` across the codebase:
```bash
grep -r "from.*bandScale\|require.*bandScale" src/
```
Rename each import path from `'../lib/bandScale'` → `'../lib/scoringUtils'` (adjust depth as needed).

### 2.4 — Verify TypeScript compiles clean

```bash
npx tsc --noEmit
```

Zero errors before moving to Phase 3.

---

## Phase 3 — Backend: Route + File Restructuring

**Time estimate:** 1.5 days  
**Goal:** Move IELTS-specific files into `src/exams/ielts/` and rename API route paths to be exam-prefixed.

### 3.1 — Create `src/exams/` directory structure

```
src/exams/
└── ielts/
    ├── controllers/
    ├── routes/
    └── services/
```

Create this directory structure. No files moved yet.

### 3.2 — Move IELTS-specific service files

Move (git mv — preserves history):

```bash
git mv src/services/ieltsWritingService.ts src/exams/ielts/services/writingService.ts
git mv src/services/ieltsSpeakingService.ts src/exams/ielts/services/speakingService.ts
```

Update internal imports inside the moved files if they reference `../../lib/...` (adjust depth to `../../../lib/...`).

Update all callers of these services — find them:
```bash
grep -r "ieltsWritingService\|ieltsSpeakingService" src/
```

### 3.3 — Move IELTS-specific controller files

```bash
git mv src/controllers/ieltsWritingController.ts src/exams/ielts/controllers/writingController.ts
git mv src/controllers/ieltsReadingController.ts src/exams/ielts/controllers/readingController.ts
```

Adjust import paths inside the moved files (`../../lib/` → `../../../lib/`).

### 3.4 — Move and rename route files

```bash
git mv src/routes/ieltsWritingRoutes.ts src/exams/ielts/routes/writingRoutes.ts
git mv src/routes/ieltsReadingRoutes.ts src/exams/ielts/routes/readingRoutes.ts
```

Update the controller imports inside the moved route files (path depth changes).

### 3.5 — Update route mounts in `src/index.ts`

Find (lines ~111 and ~118):
```typescript
import ieltsReadingRoutes from './routes/ieltsReadingRoutes';
import ieltsWritingRoutes from './routes/ieltsWritingRoutes';
// ...
app.use('/api/ielts-reading', ieltsReadingRoutes);
app.use('/api/ielts-writing', ieltsWritingRoutes);
```

Replace with:
```typescript
import ieltsReadingRoutes from './exams/ielts/routes/readingRoutes';
import ieltsWritingRoutes from './exams/ielts/routes/writingRoutes';
// ...
app.use('/api/ielts/reading', ieltsReadingRoutes);
app.use('/api/ielts/writing', ieltsWritingRoutes);
```

**Important:** The URL paths change from `/api/ielts-reading/` to `/api/ielts/reading/` — this is a breaking change for the frontend. Phase 6 updates the frontend to match.

### 3.6 — Final backend compile check

```bash
npx tsc --noEmit
npm run build  # or whatever the build command is
```

---

## Phase 4 — Monorepo Root Setup

**Time estimate:** 1 day  
**Location:** `e:\FreeLance\edtech\` (the parent directory containing both repos)

### 4.1 — Install pnpm (if not already installed)

```bash
npm install -g pnpm
```

### 4.2 — Create root `package.json`

Create `e:\FreeLance\edtech\package.json`:

```json
{
  "name": "testcrack-platform",
  "private": true,
  "version": "0.0.0",
  "scripts": {
    "dev": "turbo dev",
    "build": "turbo build",
    "lint": "turbo lint",
    "type-check": "turbo type-check"
  },
  "devDependencies": {
    "turbo": "^2.5.0"
  },
  "packageManager": "pnpm@9.0.0"
}
```

### 4.3 — Create `pnpm-workspace.yaml`

Create `e:\FreeLance\edtech\pnpm-workspace.yaml`:

```yaml
packages:
  - 'ai-study-mentor'
  - 'backend-study-mentor'
  - 'packages/*'
```

### 4.4 — Create `turbo.json`

Create `e:\FreeLance\edtech\turbo.json`:

```json
{
  "$schema": "https://turbo.build/schema.json",
  "tasks": {
    "build": {
      "dependsOn": ["^build"],
      "outputs": ["dist/**"]
    },
    "dev": {
      "cache": false,
      "persistent": true
    },
    "lint": {
      "dependsOn": ["^build"]
    },
    "type-check": {
      "dependsOn": ["^build"]
    }
  }
}
```

### 4.5 — Update `package.json` names in each repo

In `e:\FreeLance\edtech\ai-study-mentor\package.json`, change:
```json
"name": "vite_react_shadcn_ts"
```
to:
```json
"name": "@testcrack/ielts"
```

In `e:\FreeLance\edtech\backend-study-mentor\package.json`, change:
```json
"name": "backend-study-mentor"
```
to:
```json
"name": "@testcrack/backend"
```

### 4.6 — Create `packages/` directory structure

```
e:\FreeLance\edtech\packages\
├── ui\
│   ├── package.json
│   ├── tsconfig.json
│   └── src\
│       └── index.ts
└── exam-engine\
    ├── package.json
    ├── tsconfig.json
    └── src\
        └── index.ts
```

**`packages/ui/package.json`:**
```json
{
  "name": "@testcrack/ui",
  "version": "0.0.0",
  "private": true,
  "main": "./src/index.ts",
  "types": "./src/index.ts",
  "exports": {
    ".": "./src/index.ts"
  }
}
```

**`packages/ui/src/index.ts`** — empty for now. Populated in S3 when OET app actually needs it.

**`packages/exam-engine/package.json`:**
```json
{
  "name": "@testcrack/exam-engine",
  "version": "0.0.0",
  "private": true,
  "main": "./src/index.ts",
  "types": "./src/index.ts"
}
```

**`packages/exam-engine/src/index.ts`:**
```typescript
// Exam-agnostic interfaces — implemented per-exam in apps/*/src/exams/

export type ExamType = 'IELTS' | 'OET' | 'GRE' | 'TOEFL' | 'PTE';

export type SkillType = 'LISTENING' | 'READING' | 'WRITING' | 'SPEAKING';

export interface ExamConfig {
  examType: ExamType;
  skills: SkillType[];
  scoringStrategy: ScoringStrategy;
}

export interface ScoringStrategy {
  examType: ExamType;
  /** Convert a 0..1 mastery fraction to the exam's native score format */
  fractionToScore(frac: number): number;
  /** Format the score for display (e.g. "6.5" for IELTS, "B (350)" for OET) */
  formatScore(score: number): string;
}
```

### 4.7 — Install workspace dependencies

```bash
cd e:\FreeLance\edtech
pnpm install
```

This generates `pnpm-lock.yaml` at root and links the workspace packages. The existing `node_modules` in each repo can be deleted — pnpm will reinstall at the workspace level.

**Note:** Delete `package-lock.json` files in both repos after pnpm takes over. Add a `.npmrc` at root to enforce pnpm:
```
engine-strict=true
```

---

## Phase 5 — Frontend: packages/ui Skeleton [CONDITIONAL]

**Time estimate:** 0.5 days  
**Condition:** Only do this if Supabase migration (S0) is confirmed complete. If not, skip and note as S0 backlog item.

**What this phase does NOT do:** Move the 51 shadcn components yet. That happens in S3 when the OET app is scaffolded and needs them. Phase 5 just creates the package structure and ensures the workspace link resolves.

### 5.1 — Verify workspace resolves

After `pnpm install` in Phase 4, check that `@testcrack/ui` and `@testcrack/exam-engine` resolve as workspace packages:

```bash
cd e:\FreeLance\edtech\ai-study-mentor
node -e "require.resolve('@testcrack/ui')"
```

Should resolve without error. That's Phase 5 complete.

**The actual shadcn component extraction (moving 51 files + updating imports) is S3 work** — it only makes sense to do when the OET app is being built and needs to import from the shared package. Doing it now would require updating ~355 frontend files with no benefit until S3.

---

## Phase 6 — Frontend: Update API Route Calls

**Time estimate:** 0.5 days  
**Goal:** Update the frontend to match Phase 3's route rename (`/api/ielts-reading/` → `/api/ielts/reading/`).

### 6.1 — Files to update (8 files found by grep)

```
src/features/student/services/ieltsReadingService.ts
src/features/student/services/ieltsWritingService.ts
src/features/student/services/ieltsSpeakingService.ts
src/features/student/services/readingPracticeService.ts
src/features/student/services/speedReadingService.ts
src/features/student/components/IeltsWriting.tsx
src/features/student/components/StudentReadingAssessmentPage.tsx
src/features/student/components/StudentSpeakingHistoryPage.tsx
```

### 6.2 — Route replacements

In each file, replace:
- `/api/ielts-reading/` → `/api/ielts/reading/`
- `/api/ielts-writing/` → `/api/ielts/writing/`

Verify with grep after:
```bash
grep -r "ielts-reading\|ielts-writing" src/
# Should return 0 matches
```

### 6.3 — Frontend TypeScript compile check

```bash
cd e:\FreeLance\edtech\ai-study-mentor
npx tsc --noEmit
npm run build
```

Zero errors.

---

## Phase 7 — Verification Gate

**Do not merge or deploy until all boxes are checked.**

### Backend checks

- [ ] `npx tsc --noEmit` — zero errors
- [ ] `npm run build` completes successfully
- [ ] No remaining references to `IeltsSkillType` or `IeltsSubSkillType` in source:
  ```bash
  grep -r "IeltsSkillType\|IeltsSubSkillType" src/
  # Must return 0 results
  ```
- [ ] No remaining references to `ielts_batches` Prisma model in source:
  ```bash
  grep -r "ielts_batches\|ielts_batch_students\|ielts_batch_instructors" src/
  # Must return 0 results
  ```
- [ ] No remaining references to old route names in source:
  ```bash
  grep -r "ielts-reading\|ielts-writing" src/
  # Must return 0 results
  ```
- [ ] `prisma generate` completes with new schema

### Frontend checks

- [ ] `npx tsc --noEmit` — zero errors
- [ ] `npm run build` completes successfully
- [ ] No remaining references to old API paths:
  ```bash
  grep -r "ielts-reading\|ielts-writing" src/
  # Must return 0 results
  ```

### Smoke test (run backend + frontend locally)

- [ ] Student login works
- [ ] Institute admin login works  
- [ ] Diagnostic flow starts (Listening → Reading → Writing → Speaking)
- [ ] Drill session loads
- [ ] IA session loads
- [ ] Mock test loads
- [ ] Batch list loads in admin panel
- [ ] IELTS Reading speed test loads (new URL: `/api/ielts/reading/topics`)
- [ ] IELTS Writing submission works (new URL: `/api/ielts/writing/submit`)

---

## VPS Deployment (AFTER Verification Gate)

**Do this manually on the VPS — never in CI.**

```bash
ssh <prod-vps>
cd /var/www/testcrack/backend-main
git pull origin platform/s1   # only after PR is merged to main
npx prisma db push
pm2 restart backend-main
```

**What `prisma db push` does in this migration:**
1. Renames enum `IeltsSkillType` → `SkillType` and `IeltsSubSkillType` → `SubSkillType` in PostgreSQL
2. Adds `exam_type` column (with `IELTS` default) to 10 tables — zero data loss
3. Renames `ielts_batches` → `batches`, `ielts_batch_students` → `batch_students`, `ielts_batch_instructors` → `batch_instructors` — data preserved
4. Creates new `institute_exam_subscriptions` table

**After push:** Seed the first `institute_exam_subscriptions` row for every existing institute:
```sql
INSERT INTO institute_exam_subscriptions (institute_id, exam_type, is_active)
SELECT id, 'IELTS', true FROM institutes
ON CONFLICT (institute_id, exam_type) DO NOTHING;
```

---

## Definition of Done

S1 is complete when all of the following are true:

1. Both repos compile with zero TypeScript errors on `platform/s1`
2. The monorepo root (`e:\FreeLance\edtech\`) has `turbo.json`, `pnpm-workspace.yaml`, `package.json`, and `packages/` directory
3. No file anywhere in backend source contains `IeltsSkillType`, `IeltsSubSkillType`, `ielts_batches`, `ielts_batch_students`, or `ielts_batch_instructors`
4. API routes are exam-prefixed: `/api/ielts/reading/`, `/api/ielts/writing/`
5. Frontend API calls match the new route paths
6. Both apps build in the Turborepo pipeline (`pnpm turbo build`)
7. Smoke test checklist passes on local dev environment
8. PRs created on both repos from `platform/s1` into `main`
9. VPS migrations applied after merge

---

## Not In Scope — Deferred to Later Sprints

| Item | Sprint |
|------|--------|
| Move 51 shadcn components into `packages/ui/` + update imports | S3 (when OET app needs them) |
| Extract `packages/auth-client/` (useAuth, callBackend) | S0 cleanup (after Supabase migration) |
| OET-specific routes, controllers, services in `src/exams/oet/` | S2 |
| OET diagnostic questions seeded in DB | S2 |
| OET frontend app `apps/oet/` | S3 |
| GRE/TOEFL exam modules | S5+ |
| Supabase migration (if not done in S0) | S0 backlog — blocks auth-client extraction |
