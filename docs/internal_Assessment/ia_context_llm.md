# Internal Assessment — Full Implementation Context
**For LLM consumption. Last updated: 8 May 2026. Branch: `feature/ielts-flow`.**

---

## 1. Project Structure

Two repos, both TypeScript:

| Repo | Role | Key path |
|---|---|---|
| `backend-study-mentor` | Express + Prisma + Gemini API | `src/controllers/iaController.ts`, `src/lib/iaGrading.ts` |
| `ai-study-mentor` | Vite + React | `src/features/student/components/Assessment.tsx` |

Database: PostgreSQL via Prisma ORM. Auth: Supabase JWT (middleware extracts `appUserId`).

---

## 2. Database Schema (already migrated)

### New enums
```sql
IASessionStatus: PENDING | IN_PROGRESS | COMPLETED | MISSED
-- INTERNAL_ASSESSMENT added to existing AssessmentModeType enum
```

### `ia_questions` table (seeded by content team)
| Column | Type | Notes |
|---|---|---|
| `id` | UUID PK | |
| `skill` | IeltsSkillType | WRITING / SPEAKING / READING / LISTENING |
| `sub_skill` | IeltsSubSkillType | GRAMMAR / VOCABULARY / COHERENCE / TASK_RESPONSE / FLUENCY / PRONUNCIATION / READING / LISTENING |
| `question_type` | VARCHAR(30) | `MCQ` / `TFNG` / `WRITING_PROMPT` / `SPEAKING_PROMPT` |
| `passage_id` | VARCHAR(50)? | Groups READING questions by passage |
| `passage_text` | TEXT? | |
| `audio_url` | VARCHAR(500)? | LISTENING only |
| `prompt_text` | TEXT | The question text |
| `options` | JSONB? | `{ "A": "text", "B": "text" }` for MCQ |
| `correct_answer` | JSONB? | `"A"` — null for AI-scored |
| `explanation` | TEXT? | |
| `difficulty` | DifficultyType | BEGINNER / INTERMEDIATE / ADVANCED |
| `is_active` | BOOLEAN | Default true |

### `ia_sessions` table
| Column | Type | Notes |
|---|---|---|
| `id` | UUID PK | |
| `student_id` | UUID FK | → `institute_students.id` |
| `ia_number` | INT | Which IA slot (1st, 2nd, …) |
| `ia_date` | DATE | IST calendar date |
| `status` | IASessionStatus | PENDING → IN_PROGRESS → COMPLETED or MISSED |
| `selected_subskills` | JSONB | `[{ skill, sub_skill }, ...]` |
| `question_ids` | JSONB | `[{ skill, sub_skill, ids: string[] }, ...]` |
| `answers` | JSONB | `{ "q_uuid": "A", __meta: { current_section, section_started_at } }` |
| `time_started_at` | TIMESTAMPTZ? | First open |
| `time_submitted_at` | TIMESTAMPTZ? | |
| `window_closes_at` | TIMESTAMPTZ | IST midnight of ia_date |
| `scores` | JSONB? | `[{ skill, sub_skill, band, correct, total, ai_graded }]` |
| `momentum_awarded` | INT? | |
| `carry_forward_subskills` | JSONB | Set when MISSED; not yet used in next session creation |

**Unique constraint:** `(student_id, ia_date)`.

### Related tables (existing, modified by IA)
- `assessment_history` — one row per sub-skill on submit; `mode = INTERNAL_ASSESSMENT`
- `student_competency_matrix` — upserted per parent skill on submit
- `institute_students.momentum_score` — incremented on submit, decremented on miss

---

## 3. Constants (iaController.ts)

```typescript
IA_DRILL_THRESHOLD  = 6    // minimum drill sessions to unlock IA
IA_MIN_DAYS         = 2    // calendar days since first drill required
IA_DCS_THRESHOLD    = 40   // avg DCS % required on test day
IA_INTERVAL_DAYS    = 3    // IA schedule: firstDrill + 3, +6, +9 …
SECTION_IA_MS       = 20 * 60 * 1000  // 20 min per section (2 sections = 40 min total)
IST_OFFSET_MS       = 5.5 * 60 * 60 * 1000
```

---

## 4. Backend Endpoints

All under `/api/ia/`. Auth middleware injects `appUserId` (Supabase UUID) and the route resolves `student_id` via `institute_students.user_id`.

### `GET /api/ia/status`
**Purpose:** Single source of truth for the IA gate screen and dashboard widget.

**What it does:**
1. Runs miss detection — finds `ia_sessions` for this student where `ia_date < today(IST)` AND `status IN (PENDING, IN_PROGRESS)`. Marks each MISSED, sets `carry_forward_subskills = selected_subskills`, decrements student `momentum_score` by 20 per missed session. Idempotent (MISSED sessions are filtered out on next call).
2. Builds the IA schedule: `firstDrillDate + n × 3 days` for n = 1..30.
3. Checks prerequisites: `drills ≥ 6`, `days ≥ 2`, `avg_dcs ≥ 40`.
4. Checks `has_active_session` — queries for PENDING/IN_PROGRESS session on today's IA date (drives "Continue Assessment" vs "Start Assessment" button text).
5. If `can_start_test`, calls `selectPrioritySubSkills` for a preview of today's focus areas.

**Response shape:**
```json
{
  "success": true,
  "missed_count": 0,
  "has_active_session": false,
  "has_schedule": true,
  "prerequisites_met": true,
  "avg_dcs": 58,
  "dcs_required": 40,
  "dcs_eligible": true,
  "is_ia_day": true,
  "current_ia_number": 7,
  "can_start_test": true,
  "suggested_subskills": [{ "skill": "SPEAKING", "sub_skill": "FLUENCY" }, ...],
  "next_ia": { "number": 8, "date": "2026-05-10", "date_formatted": "Sat, 10 May", "days_away": 3 },
  "upcoming_ias": [...],
  "reasons": [],
  "progress": { "drills_completed": 8, ... }
}
```

---

### `GET /api/ia/eligibility`
Thin backward-compat wrapper — delegates to `getIAStatus`. Kept for old frontend references.

---

### `GET /api/ia/questions`
**Purpose:** Start new session or resume existing one.

**What it does:**
1. Validates today is a scheduled IA day (`daysSinceFirst % 3 === 0 && daysSinceFirst > 0`).
2. Checks for existing `ia_sessions` row for today:
   - **COMPLETED / MISSED** → returns `{ already_done: true }`. Frontend re-fetches status.
   - **PENDING / IN_PROGRESS** → resumes. Reads `answers.__meta` for `{ current_section, section_started_at }`, computes `time_remaining_ms = max(0, 20min - elapsed)` for the CURRENT section. Updates PENDING → IN_PROGRESS.
   - **None** → creates new session.
3. New session: calls `selectPrioritySubSkills(student.id)` → two `{ skill, sub_skill }` pairs. Fetches questions via `fetchSectionQuestions` (10 per sub-skill, difficulty matched to student's current band). Creates session with `answers = { __meta: { current_section: 0, section_started_at: Date.now() } }`.
4. Strips `correct_answer` and `explanation` from all questions before returning.

**Response shape:**
```json
{
  "success": true,
  "session_id": "uuid",
  "ia_number": 7,
  "resume": false,
  "current_section_idx": 0,
  "selected_subskills": [{ "skill": "SPEAKING", "sub_skill": "FLUENCY" }, ...],
  "sections": [
    {
      "skill": "SPEAKING",
      "sub_skill": "FLUENCY",
      "section_type": "MCQ_MIX",
      "audio_url": null,
      "passage_text": null,
      "passage_id": null,
      "questions": [{ "id": "uuid", "question_type": "MCQ", "prompt_text": "...", "options": { "A": "...", "B": "..." } }, ...]
    },
    ...
  ],
  "saved_answers": { "q_uuid": "A" },
  "window_closes_at": "2026-05-07T18:29:59.999Z",
  "time_remaining_ms": 1200000
}
```

**`fetchSectionQuestions` logic:**
- LISTENING: groups questions by `audio_url`, picks one random group (all share the same audio clip)
- READING: groups by `passage_id`, picks one random passage group
- WRITING / SPEAKING sub-skills: 8 MCQ + 2 WRITING_PROMPT or SPEAKING_PROMPT; graceful fallback to cross-difficulty pool if not enough at target difficulty

---

### `POST /api/ia/answer`
**Purpose:** Persist one answer (fire-and-forget from frontend).

**Body:** `{ session_id, question_id, answer }` — or `{ session_id, section_advance: 1 }` for section transition.

**Normal answer:** merges `answers[question_id] = answer` into the session JSONB.

**Section advance** (`section_advance` key present, no `question_id` needed): writes `answers.__meta = { current_section: nextIdx, section_started_at: Date.now() }`. This stamps the real-world start time of Section 2 so the backend can reconstruct per-section `time_remaining_ms` on resume.

**Validation:** session must exist, belong to student, not COMPLETED/MISSED, and `now < window_closes_at`.

---

### `POST /api/ia/submit`
**Purpose:** Grade, score, award momentum, update competency matrix.

**Body:** `{ session_id }`

**Full pipeline:**

1. **Load** — fetch `question_ids` config (which IDs belong to which sub-skill), all `ia_questions` rows (includes `prompt_text` for AI grading), strip `__meta` from `answers`.

2. **Parallel AI grading** — for every WRITING_PROMPT or SPEAKING_PROMPT across both sections, launch a `gradeIAWritingPrompt` or `gradeIASpeakingPrompt` call concurrently (`Promise.all`). These call Gemini 2.5 Flash with a sub-skill-specific prompt (see §6). Returns `{ band, rationale, key_observations }`.

3. **Score each section:**
   - MCQ/TFNG: count correct (case-insensitive trim compare against `correct_answer`). `mcqBand = (correct/total) × 9`.
   - AI prompts: average of all AI bands for this section (`aiAvgBand`).
   - Combined: `(mcqBand × nMCQ + aiAvgBand × nAI) / (nMCQ + nAI)`. Rounded to nearest 0.5, capped at 9.0.

4. **Pre-fetch previous bands** — reads `student_competency_matrix.sub_scores` for each affected parent skill BEFORE the transaction, for delta calculation.

5. **Momentum calculation:**
   - Always: `+100` (participation)
   - Per sub-skill: `+25` if `newBand > lastIABand` (from most recent completed session)
   - Per sub-skill: `+50` if `newBand > allTimeBest` (max across all past sessions)
   - Both can apply to the same sub-skill (e.g., new personal best = +75)
   - `momentumBreakdown` array built for display: `[{ reason: "Participation", points: 100 }, ...]`

6. **DB transaction:**
   - `ia_sessions` → status = COMPLETED, scores = sectionScores, momentum_awarded, time_submitted_at
   - `assessment_history` → one row per tested sub-skill; mode = INTERNAL_ASSESSMENT
   - `student_competency_matrix` → **precise update**: fetch existing `sub_scores`, overwrite ONLY the tested sub-skill key, recalculate `band_score = mean(all known sub-skill values)`, upsert. Other sub-skills untouched.
   - `institute_students.momentum_score += momentumAwarded`

7. **Response:**
```json
{
  "success": true,
  "is_first_ia": false,
  "momentum_awarded": 175,
  "momentum_breakdown": [
    { "reason": "Participation", "points": 100 },
    { "reason": "Personal Best — Fluency", "points": 50 },
    { "reason": "Improved — Grammar", "points": 25 }
  ],
  "updated_momentum": 985,
  "section_scores": [
    {
      "skill": "SPEAKING", "sub_skill": "FLUENCY",
      "band": 6.5, "correct": 6, "total": 8, "ai_graded": true,
      "previous_band": 5.5, "delta": 1.0
    },
    ...
  ]
}
```

---

## 5. Sub-skill Selector (`src/lib/subskillSelector.ts`)

Selects 2 `{ skill, sub_skill }` pairs targeting the student's weakest areas.

**Weakness score formula:**
```
weakness_score = (1 - drill_accuracy) × 0.60 + (1 - sub_skill_band / 9.0) × 0.40
```

**Selection priority:**
1. ≥ 2 drilled pairs → top 2 by weakness score with diversity rule (no 2 from same parent skill)
2. 1 drilled pair → use that + weakest undrilled from competency matrix
3. 0 drilled → 2 weakest from competency matrix
4. No data → hardcoded defaults: WRITING/GRAMMAR + SPEAKING/VOCABULARY

**IA target pairs:**
- WRITING: GRAMMAR, VOCABULARY, COHERENCE, TASK_RESPONSE
- SPEAKING: GRAMMAR, VOCABULARY, FLUENCY, PRONUNCIATION
- READING: READING (skill-level)
- LISTENING: LISTENING (skill-level)

---

## 6. IA Grading Library (`src/lib/iaGrading.ts`)

Two exported functions:

### `gradeIAWritingPrompt(subSkill, questionPrompt, response)`
### `gradeIASpeakingPrompt(subSkill, questionPrompt, transcript)`

Each sends a focused Gemini 2.5 Flash prompt grading **only the one IELTS criterion** matching the sub-skill:

| Sub-skill | Criterion graded |
|---|---|
| GRAMMAR | Grammatical Range and Accuracy |
| VOCABULARY | Lexical Resource |
| COHERENCE | Coherence and Cohesion (writing only) |
| TASK_RESPONSE | Task Achievement / Task Response (writing only) |
| FLUENCY | Fluency and Coherence (speaking only) |
| PRONUNCIATION | Pronunciation (speaking only) |

Returns `{ band: number (0.5 increments), rationale: string, key_observations: string[] }`.

**Fallbacks:**
- Empty response → band 0, no API call made
- GEMINI_API_KEY missing → throws
- API/parse failure → band 0, logs error, does not crash the submit pipeline

---

## 7. Frontend — `Assessment.tsx`

**Phases:** `"gate"` → `"session"` → `"interim"` → `"session"` (Section 2) → `"scoring"` → `"results"`

### State variables (key)
| Variable | Purpose |
|---|---|
| `iaStatus` | Full status response from GET /api/ia/status |
| `iaSessionId` | UUID of the active session |
| `iaSections` | Array of section objects from GET /api/ia/questions |
| `currentSectionIdx` | 0 or 1 |
| `currentIdx` | Current question index within section |
| `answers` | `Record<questionId, answerString>` — MCQ option key, writing text, or speaking transcript |
| `timeLeft` | Seconds remaining for current section |
| `isRecording` | Whether speech recognition is active |
| `liveTranscript` | Real-time transcript display (not persisted — cleared on stop) |
| `recognitionRef` | Web Speech API instance ref |
| `transcriptAccumRef` | Accumulated final transcript during recording |
| `writingDebounceRef` | setTimeout handle for writing auto-save |
| `iaResults` | Full submit response stored for result screen |
| `sessionMomentumAward` | Cached momentum total for display |

### Timer architecture
- Per-section: 20 minutes each (total 40 min for 2-section IA)
- `timeLeft` starts at `SECTION_IA_MS / 1000` for new sessions; restored from `time_remaining_ms` (computed server-side) for resumes
- On section advance (`advanceToNextSection`): resets `timeLeft = 20 * 60`, fires `POST /api/ia/answer { section_advance: 1 }` to stamp section start time in DB
- On expiry (`timeLeft === 0`): `handleSectionComplete()` → advances to next section or auto-submits last section
- Timer only ticks in `phase === "session"` and `!isLoadingSession`

### State persistence (Path B — mid-exit resume)
- Every MCQ/TFNG answer: `POST /api/ia/answer` on "Next Question" click
- Writing text: debounced `POST /api/ia/answer` 1.5s after typing stops (also saves on "Next Question")
- Speaking transcript: `POST /api/ia/answer` immediately on "Stop & Save" click
- Section transition: `POST /api/ia/answer { section_advance: 1 }` (stamps new section start time)
- On resume (`GET /api/ia/questions` with `resume: true`):
  - `current_section_idx` → restores which section to render
  - `time_remaining_ms` → computed from `Date.now() - section_started_at`, accounts for time elapsed while browser was closed
  - `saved_answers` → pre-populates ALL answers (writing textarea, speaking transcript, MCQ selections)

### Speaking recording (Web Speech API)
- `startSpeakingRecording(questionId)`: checks for `window.SpeechRecognition || window.webkitSpeechRecognition`. If available, creates a `continuous=true, interimResults=true` instance. Seeds `transcriptAccumRef.current` from any existing `answers[questionId]` (so re-recording starts from prior transcript). Shows live transcript from `onresult` events.
- `stopSpeakingRecording(questionId)`: stops recognition, persists final transcript to `answers[questionId]` and to backend. Shows "Response Saved" + transcript preview.
- On resume: `answers[questionId]` has the transcript → shows "Response Saved" state immediately without re-recording.
- Fallback: Chrome/Edge only; Firefox shows recording UI but no transcript; a browser hint is shown.
- Cleanup: recording stopped whenever `currentIdx` or `currentSectionIdx` changes.

### Writing auto-save
- `persistWritingDebounced(questionId, text)`: clears and resets a 1.5s timeout on every keystroke. After 1.5s silence → `POST /api/ia/answer`.
- On resume: `saved_answers[questionId]` has the text → textarea is pre-populated (`value={answers[currentQ.id] || ""}`).

### `canProceed` logic
- MCQ/TFNG: `!!answers[currentQ.id]`
- WRITING_PROMPT: word count ≥ 10
- SPEAKING_PROMPT: `!!answers[currentQ.id]?.trim()` (has a non-empty transcript)

### Gate screen
- `iaStatus.has_active_session` → button reads "Continue Assessment →"; else "Start Assessment →"
- Routes to one of four render functions: `renderGate`, `renderNotEligible`, `renderScheduled`, `renderIaDayLowDCS`

### Result screen
- Shows per sub-skill band, delta vs previous (colored ↑/↓), "vs Last IA" or "vs Diagnostic" label
- Momentum banner with total and breakdown pills
- Competency matrix update note

---

## 8. Sub-score Key Mapping

Used in both backend (competency matrix) and frontend (display labels):

```typescript
// Backend SUB_SCORE_KEY_MAP (iaController.ts)
GRAMMAR       → 'grammarScore'
VOCABULARY    → 'vocabularyScore'
COHERENCE     → 'coherenceScore'
TASK_RESPONSE → 'taskResponseScore'
FLUENCY       → 'fluencyScore'
PRONUNCIATION → 'pronunciationScore'
// READING and LISTENING → no sub-score key; only band_score updated
```

---

## 9. Momentum Rules (from testcrack_flow_v3.html)

| Event | Points |
|---|---|
| IA participation (base) | +100 |
| Improved vs last IA (per sub-skill) | +25 |
| New personal best (per sub-skill) | +50 |
| First IA miss | −20 |
| Second consecutive miss | −40 cumulative |

"Improved vs last IA" = `newBand > lastSession.scores[sub_skill].band`
"Personal best" = `newBand > max(all past sessions for this sub_skill)`
Both can apply to the same sub-skill in one session (+75 total).
On first IA (no past sessions): no +25 (no last IA to compare), but +50 applies if band > 0.

---

## 10. What Is Complete ✅

| Feature | Status |
|---|---|
| DB schema migration (ia_questions, ia_sessions, enums) | ✅ |
| Question seed (GRAMMAR, VOCABULARY, READING, LISTENING) | ✅ seeded |
| Sub-skill selector (`subskillSelector.ts`) | ✅ |
| `GET /api/ia/status` with miss detection + `has_active_session` | ✅ |
| `GET /api/ia/questions` (new + resume) | ✅ |
| `POST /api/ia/answer` (MCQ + writing + section advance) | ✅ |
| `POST /api/ia/submit` with mixed MCQ+AI grading | ✅ |
| IA-specific Gemini grader (`iaGrading.ts`) per sub-skill | ✅ |
| Competency matrix precise sub-skill update | ✅ |
| Momentum calculation (participation + improvement + personal best) | ✅ |
| Per-section 20-min timer (40 min total) | ✅ |
| Path B (mid-exit resume with correct timer) | ✅ |
| Path C (miss detection, −20 momentum) | ✅ |
| Writing auto-save (debounced 1.5s) | ✅ |
| Speaking recording (Web Speech API → transcript → persisted) | ✅ |
| LISTENING audio integration (frontend public folder) | ✅ |
| Gate screen "Continue" vs "Start" button | ✅ |
| Result screen: band scores + delta + momentum breakdown | ✅ |
| Remove "Gemini is evaluating" message | ✅ |
| Encoding fix for Assessment.tsx (PowerShell UTF-8 issue) | ✅ |
| TypeScript compile clean on both repos | ✅ |

---

## 11. What Is NOT Done (Phase 2) ⚠️

| Gap | Notes |
|---|---|
| `carry_forward_subskills` wired into next session | Stored on MISSED sessions but `selectPrioritySubSkills` does not yet read it. Next IA ignores carry-forward sub-skills. |
| `analyzeSpeaking` audio-file path (existing service) | The old `ieltsSpeakingService.ts` uses `fs.readFileSync(audioFilePath)` — not used by IA. IA uses transcripts exclusively. |
| `analyzeWriting` full diagnostic (existing service) | Still used by the diagnostic flow. IA uses the new focused `gradeIAWritingPrompt`. |
| SPEAKING_PROMPT + WRITING_PROMPT questions seeded | Phase 1 seed only has MCQ/TFNG. AI grading path is implemented and tested; requires seed data. |
| Result screen: "no delta" state polish | When `previous_band = null` (genuinely no prior data), the delta column is hidden. Could show a "—" badge. |
| Firefox speech recording fallback | On Firefox, `SpeechRecognition` is undefined. UI shows recording state but produces no transcript. Student cannot proceed on speaking questions unless they type (no fallback text input). Consider adding a textarea fallback for unsupported browsers. |
| `window_closes_at` per-section enforcement | Currently the overall window closes at IST midnight (end of IA day). Per-section timers are enforced client-side only. If the student bypasses the frontend, they could submit after section timer expiry. Low priority since `window_closes_at` still blocks day-old submissions. |
| Second consecutive miss penalty (−40) | Current miss detection decrements −20 flat per missed session. Does not check consecutive count. |
| Mock test integration | Separate feature; IA scores update `student_competency_matrix` which mock test already reads. |

---

## 12. File Index

| File | What it does |
|---|---|
| `backend/src/controllers/iaController.ts` | All 5 IA endpoints + shared helpers (IST utilities, question fetcher, session helpers) |
| `backend/src/routes/iaRoutes.ts` | Wires 5 routes to controller functions |
| `backend/src/lib/subskillSelector.ts` | Weakness-score algorithm, selects 2 sub-skills for the session |
| `backend/src/lib/iaGrading.ts` | Focused Gemini grader per IELTS sub-skill criterion |
| `backend/src/lib/dcs.ts` | Daily + average DCS computation (used by eligibility gate) |
| `backend/prisma/schema.prisma` | `IAQuestion`, `IASession` models; `IASessionStatus` enum |
| `frontend/src/features/student/components/Assessment.tsx` | Full IA UI: gate, session, interim, scoring, results |
| `frontend/src/features/student/utils/iaAudioUtils.ts` | Audio URL transformation utilities for LISTENING sections |
| `frontend/src/features/student/components/dashboard/IAScheduleWidget.tsx` | Dashboard schedule widget (calls GET /api/ia/status) |
| `frontend/docs/ia_implementation_plan.md` | Original design doc (reference only; may be slightly stale) |
| `frontend/docs/ia_testing_checklist.md` | Step-by-step testing guide for all 3 paths + edge cases |
| `frontend/docs/frontend/IA_AUDIO_INTEGRATION.md` | Complete audio integration guide (frontend perspective) |
| `frontend/docs/backend/IA_AUDIO_BACKEND_SETUP.md` | Backend setup guide for serving audio files |
| `frontend/docs/ia_context_llm.md` | **This file** |
| `backend/docs/ia-question-seeding-requirements.md` | Seed spec: 300 questions, format per type |
