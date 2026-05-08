# Internal Assessment — Full Implementation Plan

**Date:** 6 May 2026 | **Branch:** `feature/ielts-flow` | **Follows:** `testcrack_gap_report_v3.md`

---

## Foundations (what we build on)

| Existing piece | How IA uses it |
|---|---|
| `DrillQuestion` table (MCQ, tagged by `sub_skill`) | Reference for question format only — IA gets its own table |
| `AssessmentHistory` table | Stores IA results (adding `INTERNAL_ASSESSMENT` to mode enum) |
| `StudentCompetencyMatrix` | Updated after each IA to track band progression |
| `DrillSession` table | Source data for sub-skill selection algorithm |
| `analyzeWriting` / `analyzeSpeaking` services | Reused for AI-scored sub-skills (Phase 2) |
| `AssessmentModeType` enum | Currently: DIAGNOSTIC, PRACTICE, MOCK — adding INTERNAL_ASSESSMENT |

---

## Stage 1 — Database Schema

### 1a. Enum changes
- Add `INTERNAL_ASSESSMENT` to `AssessmentModeType`
- Create new `IASessionStatus` enum: `PENDING | IN_PROGRESS | COMPLETED | MISSED`

### 1b. `ia_questions` table

| Column | Type | Notes |
|---|---|---|
| `id` | UUID PK | `uuid_generate_v4()` |
| `skill` | IeltsSkillType | LISTENING / READING / WRITING / SPEAKING |
| `sub_skill` | IeltsSubSkillType | GRAMMAR / VOCABULARY / READING / etc. |
| `question_type` | VARCHAR(30) | MCQ \| TFNG \| WRITING_PROMPT \| SPEAKING_PROMPT |
| `passage_id` | VARCHAR(50)? | Groups questions sharing one reading passage |
| `passage_text` | TEXT? | Reading passage (nullable) |
| `audio_url` | VARCHAR(500)? | For listening questions (nullable) |
| `prompt_text` | TEXT | The actual question |
| `options` | JSONB? | `["A. ...", "B. ..."]` for MCQ |
| `correct_answer` | VARCHAR(10)? | Null for AI-scored (writing/speaking) |
| `explanation` | TEXT? | Shown after answer is submitted |
| `band_level` | NUMERIC(2,1) | 5.5 / 6.5 / 7.5 |
| `is_active` | BOOLEAN | Default true |
| `created_at` | TIMESTAMPTZ | Default now() |

**Indexes:** `(skill, sub_skill)`, `(is_active)`

### 1c. `ia_sessions` table

| Column | Type | Notes |
|---|---|---|
| `id` | UUID PK | |
| `student_id` | UUID FK | → `institute_students.id` CASCADE |
| `ia_number` | INT | 1st, 2nd, 3rd IA in the student's schedule |
| `ia_date` | DATE | IST calendar date of this slot |
| `status` | IASessionStatus | Default PENDING |
| `selected_subskills` | JSONB | `["GRAMMAR", "VOCABULARY"]` |
| `question_ids` | JSONB | Ordered list of 20 question IDs served |
| `answers` | JSONB | `{ "q_id": "A" }` — updated per answer |
| `time_started_at` | TIMESTAMPTZ? | First time student opened the test |
| `time_submitted_at` | TIMESTAMPTZ? | |
| `window_closes_at` | TIMESTAMPTZ | IST midnight of ia_date |
| `scores` | JSONB? | `{ GRAMMAR: { band, correct, total } }` |
| `momentum_awarded` | INT? | |
| `carry_forward_subskills` | JSONB | Sub-skills to include in next IA if missed |
| `created_at` | TIMESTAMPTZ | Default now() |

**Unique constraint:** `(student_id, ia_date)` — one session per student per IA day  
**Indexes:** `(student_id)`, `(student_id, ia_date)`, `(status)`

---

## Stage 2 — Sub-skill Selection Algorithm

**File:** `src/lib/subskillSelector.ts`

**Inputs:** `DrillSession` table + `StudentCompetencyMatrix`

**Logic:**
```
For each sub_skill the student has drilled:
  drill_accuracy  = Σ(correct_answers) / Σ(total_questions)
  band_score      = from StudentCompetencyMatrix for parent skill

  weakness_score  = (1 - drill_accuracy) × 0.6
                  + (1 - band_score / 9.0) × 0.4

Sort by weakness_score DESC (highest = most broken)

Pick top 2, enforcing skill-domain diversity:
  - Never pick 2 sub-skills from the same parent skill
  - If top 2 are same domain, replace second with best from different domain

Fallback: if < 2 drilled sub-skills, fill from lowest band scores
  in StudentCompetencyMatrix
```

**Why this formula:** Drill accuracy (60% weight) captures current real performance. Band score (40% weight) grounds it in historical baseline. Diversity rule prevents the IA from being entirely one skill when the student drills unevenly.

---

## Stage 3 — `GET /api/ia/questions`

1. Run sub-skill selection → `[subSkill1, subSkill2]`
2. For each sub-skill, fetch 10 random `ia_questions` (`ORDER BY RANDOM() LIMIT 10`)
3. Strip `correct_answer` + `explanation` before sending
4. Create or resume `ia_sessions` row:
   - None exists → create with `status=PENDING`, store `selected_subskills`, `question_ids`, `window_closes_at`
   - `IN_PROGRESS` → return with `saved_answers` + `time_remaining_ms` (resume)
   - `COMPLETED` or `MISSED` → `{ already_done: true }`
5. Set `status=IN_PROGRESS`, `time_started_at` on first open

**Response:**
```json
{
  "session_id": "uuid",
  "ia_number": 3,
  "selected_subskills": ["GRAMMAR", "VOCABULARY"],
  "sections": [
    { "sub_skill": "GRAMMAR", "questions": [...] },
    { "sub_skill": "VOCABULARY", "questions": [...] }
  ],
  "saved_answers": { "q1": "A" },
  "window_closes_at": "2026-05-06T18:29:59.999Z",
  "time_remaining_ms": 847000
}
```

---

## Stage 4 — `POST /api/ia/answer`

Body: `{ session_id, question_id, answer }`

- Validate: session is `IN_PROGRESS`, belongs to student, window not expired
- Merge answer into `ia_sessions.answers` JSONB
- Returns `{ saved: true }`

This is the mid-exit resume mechanism — every answer selection is persisted immediately.

---

## Stage 5 — `POST /api/ia/submit` (Scoring Pipeline)

```
For each sub_skill in selected_subskills:

  MCQ / TFNG questions:
    correct = compare student_answer to correct_answer (case-insensitive)
    band    = (correct / 10) × 9.0
    subScores = { correct, total: 10, accuracy_pct }

  WRITING_PROMPT (Phase 2):
    call analyzeWriting(prompt, studentText)
    band = analysis.bandScore

  SPEAKING_PROMPT (Phase 2):
    call analyzeSpeaking(prompt, audioFile)
    band = analysis.bandScore

Update AssessmentHistory: mode=INTERNAL_ASSESSMENT

Update StudentCompetencyMatrix: upsert sub_scores for parent skill

Momentum:
  +100 base (participation)
  +25  if new band > last IA band for this sub-skill
  +50  if personal best band ever for this sub-skill

Update ia_sessions: status=COMPLETED, scores=..., momentum_awarded=..., time_submitted_at=now()
```

---

## Stage 6 — Miss Detection (Path C)

Runs inside `GET /api/ia/status` on every call:

```
Find ia_sessions WHERE student_id = X
  AND ia_date < today(IST)
  AND status IN (PENDING, IN_PROGRESS)

For each found:
  SET status = MISSED
  SET carry_forward_subskills = selected_subskills
  UPDATE institute_students SET momentum_score -= 20
```

`/api/ia/status` response gains `missed_penalty_applied: true` so dashboard can show a banner.

---

## Stage 7 — 3 Paths Summary

| Path | Trigger | Outcome |
|---|---|---|
| **A — Complete** | Student submits before window closes | Scores computed, competency updated, momentum awarded |
| **B — Mid-exit** | Student exits mid-test | Answers saved per question; on re-entry same day, resume from last answer with remaining time |
| **C — Missed** | Window closes with no submission | Status = MISSED, -20 momentum, sub-skills carried to next IA |

---

## Question Seed Plan

**Phase 1 (auto-scorable MCQ — no AI/audio needed):**
- GRAMMAR: 30 questions — subject-verb agreement, tense, conditionals, articles
- VOCABULARY: 30 questions — synonym selection, word-in-context, collocations
- READING: 30 questions — 3 passages × 10 TFNG/MCQ each

**Phase 2 (AI-scored, after Phase 1 is live):**
- COHERENCE / TASK_RESPONSE: writing prompts → `analyzeWriting`
- FLUENCY / PRONUNCIATION: speaking prompts → `analyzeSpeaking`
- LISTENING: audio questions (needs audio files)

Seed file: `prisma/seed-ia-questions.ts`

---

## Execution Order

| Step | What | Blocker for |
|---|---|---|
| 1 | Run SQL migrations in pgAdmin (enums + 2 tables) | Everything |
| 2 | Seed GRAMMAR + VOCABULARY questions (30 each) | Stage 3 |
| 3 | `lib/subskillSelector.ts` — selection algorithm | Stage 3 |
| 4 | `GET /api/ia/questions` endpoint | Frontend |
| 5 | `POST /api/ia/answer` endpoint | Path B |
| 6 | `POST /api/ia/submit` + scoring pipeline | Path A |
| 7 | Miss detection added to `GET /api/ia/status` | Path C |
| 8 | Wire `Assessment.tsx` to real endpoints | — |
| 9 | Seed READING questions + Phase 2 AI sub-skills | Optional |
