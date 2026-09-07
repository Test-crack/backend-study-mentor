# OET-Nursing — Build Requirements & Checklist

**Goal:** onboard **OET (profession: Nursing)** as an exam, reaching diagnostic parity with IELTS,
reusing the exam-agnostic platform. **Principle: reuse IELTS, never fork it** — OET has the *same 4
skills and the same subskills* as IELTS; the deltas are the **scale (`oet_500`)**, **per-component
scoring (no overall grade)**, **roleplay speaking**, and **nursing content**.

**Order of work (this doc):** 1) Config & registration → 2) DB-table verification → 3) Backend
logic → 4) Routes → 5) Content → 6) Frontend. Diagnostics come after 1–4 are green.

> Legend: `[ ]` todo · `[x]` done · **D#** = decision to lock before that step · ⚠️ = blocker/caveat

---

## 0. Scope, principles & known deltas

- **Variant:** Nursing only (launch scope). `oet.variants.default = "nursing"`; L/R are shared across
  professions, W/S are nursing-specific.
- **Status stays `reserved`.** ⚠️ Flipping `oet.status` → `"live"` is a **fatal boot error** while
  `legal._status` starts with `BLOCKED` (`validator.ts:176`), and OET's legal is
  `BLOCKED_ON_COUNSEL`. Access for dev/testing comes from an **`InstituteExamSubscription`**
  (TRIAL), not from `status` — so `reserved` is fine to build and test against.
- **Deltas vs IELTS** (everything else is reused):
  | Concern | IELTS | OET-Nursing |
  |---|---|---|
  | Scale | `ielts_band` (0–9) | **`oet_500`** (0–500, grade A–E per sub-test) |
  | Overall | `band_mean` headline | **`per_component`** — *OET issues no overall grade* |
  | Speaking delivery | `ielts_speaking` | **`roleplay`** (new UI + new grading entry) |
  | Target | single band | **per-component** (NMC preset: L350/R350/**W300**/S350) |
  | Content | general | **nursing scenarios** |
- **Subskills = IELTS's** (product decision, confirmed): Writing = `task_response`,
  `coherence_cohesion`, `lexical_resource`, `grammatical_range_accuracy`; Speaking =
  `fluency_coherence`, `lexical_resource`, `grammatical_range_accuracy`, `pronunciation`. This
  supersedes the config's `_subskill_todo` ("do not invent") — we are *borrowing IELTS's*, not
  inventing OET's.

---

## 1. Config & registration (`exams`, `exam_configs`)

The engine seeds **every** exam in `exam-engine-config.v2.json` into the `exam` + `exam_config`
tables on boot (`loader.ts → seedExamConfigs`, idempotent upsert). So registration = get the config
right + boot.

- [x] OET block exists in `src/exam-engine/exam-engine-config.v2.json` (all 4 components, `oet_500`,
      per_component overall, nursing variant, NMC targets).
- [ ] **D1 — Subskills:** populate `oet.components[].subskills` for **writing** and **speaking** with
      the IELTS subskill ids above (replaces the empty `[]` + `_subskill_todo`). *Config edit only.*
- [ ] Keep `oet.status = "reserved"`; keep `legal._status = BLOCKED_ON_COUNSEL`. Do **not** set
      `live`.
- [ ] Confirm `overall.mode = "per_component"`, `overall.components = []` (correct — no headline).
- [ ] Boot backend locally → confirm `validateConfig` passes (0 errors) with the subskill edit.
- [ ] **Verify DB seed:** `SELECT id, label, status FROM exams WHERE id='oet';` → 1 row, `reserved`.
- [ ] **Verify DB seed:** `SELECT exam_id, config_version, is_active FROM exam_configs WHERE
      exam_id='oet';` → `2.0.0`, `is_active=true`.
- [ ] Confirm `getExamConfig('oet')` returns the block from the in-memory cache at runtime.

---

## 2. DB-table verification (what the diagnostic will read/write)

No migration is expected (string `exam_id`, no `ExamType` enum). Verify each table supports
`exam_id='oet'` and the OET shapes. **Do not run destructive SQL** — verification is read-only;
any constraint change is a separate reviewed `ALTER`.

- [ ] **`exams` / `exam_configs`** — seeded (see §1).
- [ ] **`institute_exam_subscription`** — create one `TRIAL` OET row for a test institute so a test
      student gets access (`examAccess.isSubscriptionAccessible` → TRIAL==ACTIVE).
- [ ] **`institute_students`** — set a test student `exam_id='oet'`. ⚠️ **D2 — per-component target:**
      `institute_students.target_band` is a *single* `Decimal(2,1)`; OET targets are **per-component**
      (L/R/W/S). Decide where the 4 targets live (recommend: `sub_scores`-style JSON or a small
      `target_per_component` JSON; do **not** overload the single band).
- [ ] **`diagnostic_questions`** (`diagnosticController` reads via exam-scoped pickers) — columns fit:
      `exam_id`, `level Char(1)`, `skill SkillType`, `question_type VarChar(30)`, `set_id`,
      `passage_text`, `audio_url`, `prompt_text`, `options Json`, `correct_answer`, `min_words`,
      `sequence`.
      - [ ] ⚠️ **D3 — `chk_dq_question_type` CHECK:** confirm the allowed `question_type` values.
            We hit this before (it rejected `VIVA_PROMPT`; `SPEAKING_PROMPT` was allowed). Confirm the
            set covers what OET needs: MCQ (L/R), the writing-task type, and the speaking/roleplay
            type — or plan an idempotent `ALTER` to add missing values.
- [ ] **`diagnostic_sessions`** — `@@unique([student_id, exam_id, skill])`, exam-scoped already. OK
      as-is; no change.
- [ ] **`student_competency_matrix`** — one row per `(student_id, skill)` (`@@unique`). L/R/W/S = 4
      rows. ⚠️ **D4 — score storage:** `band_score Decimal(2,1)` (max 9.9) **cannot** hold `oet_500`
      (0–500). Recommend: store the real per-component `{score, grade}` in `sub_scores` JSON; keep
      `band_score` as a **normalised 0–9** for the shared widgets (mirrors how CEFR reused
      `band_score` as an ordinal). Confirm no reader assumes band semantics for OET.
- [ ] **`assessment_history`** — `mode='DIAGNOSTIC'`, `band_score`, `sub_scores`, `exam_id`,
      provenance. Same **D4** storage rule.
- [ ] **CHECK constraints** — `chk_ah_band_range`, `chk_scm_band_range` are `[0,9]` (from
      `band_range_cefr.sql`). With D4's normalised `band_score` they need **no change**. (If D4 flips
      to "store raw 0–500", these must widen — separate `ALTER`.)
- [ ] **`SkillType` enum** — has `LISTENING/READING/WRITING/SPEAKING` (✓, reused).
- [ ] **`SubSkillType` enum** — verify it contains the IELTS Writing/Speaking subskill values we're
      reusing (e.g. task-response / coherence / lexical / grammar / fluency / pronunciation). Add any
      missing value via idempotent `ALTER TYPE ... ADD VALUE IF NOT EXISTS` (like `INTERACTION` was).

---

## 3. Backend logic

- [ ] **`checkAndMarkDiagnosed` (per_component fix).** ⚠️ Today it reads `overall.components`; for OET
      that is `[]` → it would mark a student diagnosed with **zero** assessments. Add a branch: when
      `overall.mode === 'per_component'`, required skills = all `components[]` with `assessed:true`
      (L/R/W/S). (`diagnosticController.ts:165`.)
- [ ] **`oet_500` scoring.** Add a component-level scorer: L/R objective fraction → 0–500 + grade band
      (`scales.oet_500.grade_bands`); W/S AI raw (1–10) → 0–500 + grade. No overall aggregation
      (per_component). Reuse `exam-engine/scoring.ts` primitives; add OET mapping.
- [ ] **Listening/Reading** — reuse `getDiagnosticQuestionsBySkill` + `submitDiagnosticAssessment`
      (already exam-scoped: `pickRandomSetId(level, skill, examId)`). Only the score mapping is
      OET-specific (→ `oet_500`, D4 storage).
- [ ] **Writing** — reuse the essay path + AI grading (`ieltsWritingService`/`iaGrading`) with the
      **IELTS writing subskills** but the **nursing referral-letter** genre in the prompt. Map to
      `oet_500`.
- [ ] **Speaking (roleplay).** ⚠️ **D5 — grading path.** The scenario is a recorded roleplay (mockup:
      ~4 prompts). Recommend **reuse the viva multi-recording pipeline** (`services/viva` +
      `/viva/submit` shape) with an OET roleplay rubric scored on the **IELTS speaking subskills**,
      rather than building a new grader. Decide: viva-reuse vs a bespoke roleplay grader.
- [ ] **Provenance** — stamp `...provenance()` on every `assessment_history` + matrix write (as SE/IELTS do).

---

## 4. Routes

The diagnostic routes are **already exam-agnostic** — verify, don't rebuild.

- [ ] `GET /api/diagnostic/status` — works for `exam_id='oet'` (per-component completion via §3 fix).
- [ ] `GET /api/diagnostic/questions/:skill` — L/R/W served for OET (exam-scoped picker). ✓ expected.
- [ ] `POST /api/diagnostic/submit/:skill` — L/R/W submit (JSON). ✓ expected; score→`oet_500`.
- [ ] **Speaking roleplay endpoint** — **D5**: if viva-reuse, use `GET /viva/prompts` +
      `POST /viva/submit` (multi-recording, already built). If bespoke, add
      `GET /diagnostic/roleplay/prompts` + `POST /diagnostic/roleplay/submit` (multipart). Prefer
      viva-reuse → **no new routes**.
- [ ] Confirm auth/entitlement middleware chain passes for an OET-subscribed student.

---

## 5. Content (data team / seed) — `diagnostic_questions`, `exam_id='oet'`, nursing

- [ ] **Listening** — audio item-sets (OET Part A/B/C style), MCQ, `audio_url`, `set_id`, per level.
- [ ] **Reading** — passage item-sets (ward notices, extracts), MCQ, `set_id`, per level.
- [ ] **Writing** — 1 referral/discharge-letter task: `passage_text` = case notes, `prompt_text` =
      instruction, `min_words` (~180–200).
- [ ] **Speaking (roleplay)** — 2–4 roleplay prompts: setting + nurse role + patient/task; audio for
      any interlocutor line if used.
- [ ] Conventions: `set_id`, `level Char(1)`, `sequence`, `source_key`-style idempotent seeding.
- [ ] Content must be **original** (not copied from real OET material — trademark/IP).

---

## 6. Frontend (other dev — concept mockup already exists)

- [ ] Pages per mockup: Intro (nursing) → Listening MCQ → Reading MCQ → Writing (case notes→letter)
      → Speaking roleplay recorder.
- [ ] **Roleplay recorder** — the one genuinely new UI (`SpeakingFormat` reserved, never built).
- [ ] Result surface: **per-component grades** (A–E / 0–500), **no overall** headline.
- [ ] `EXAM_DISPLAY.oet` config entry (scale label, per-component, disclaimer, nursing).
- [ ] Reuse IELTS diagnostic components/styling (exam-aware, IELTS untouched).

---

## Decisions to lock (tracker)

| ID | Decision | Recommendation | Status |
|---|---|---|---|
| **D1** | Writing/Speaking subskills | Adopt IELTS's (config edit) | proposed |
| **D2** | Per-component target storage | JSON `target_per_component`, not the single band | open |
| **D3** | `chk_dq_question_type` values for OET | Confirm set; `ALTER` if missing | open |
| **D4** | `oet_500` score storage vs `Decimal(2,1)` | Store raw in `sub_scores`, normalised 0–9 in `band_score` | open |
| **D5** | Roleplay speaking grading/route | Reuse viva multi-recording pipeline | open |
| **D6** | Go-live | Stay `reserved` (legal `BLOCKED_ON_COUNSEL`) | locked |

---

## Definition of done (diagnostic slice)

- [ ] Test student (`exam_id='oet'`, TRIAL sub) can complete L/R/W/S diagnostic end-to-end.
- [ ] `checkAndMarkDiagnosed` flips `is_diagnosed` only after **all 4** assessed components are scored.
- [ ] Each component produces an `oet_500` score + grade, stored per D4, provenance-stamped.
- [ ] No IELTS/SE regression (exam-aware branches, shared tables untouched in behaviour).
- [ ] Results readable via `competency-scores` (per-component, no invented overall).
