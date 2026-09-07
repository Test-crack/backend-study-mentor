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
- [x] **D1 (LOCKED) — Subskills:** populated `oet.components[].subskills` with OET's **real** criteria
      (Writing 6: purpose/content/conciseness_clarity/genre_style/organisation_layout/language, marks
      3/7/7/7/7/7; Speaking 9: 4 linguistic ea. 0–6 + 5 clinical ea. 0–3). **NOT IELTS's** — verified,
      see `OET-NURSING-CONFIG-VERIFICATION.md`.
- [x] Kept `oet.status = "reserved"`; `legal._status = BLOCKED_ON_COUNSEL` unchanged (not `live`).
- [x] Confirmed `overall.mode = "per_component"`, `overall.components = []`.
- [x] `validateConfig` passes (0 errors; 15 pre-existing benign warnings) — verified standalone; boot-safe.
- [x] **DB `exams`** → `oet | Healthcare English Preparation | reserved` ✅.
- [x] **DB `exam_configs`** → `2.0.0`, `is_active=true` ✅.
- [ ] ⚠️ **Stale DB config blob (known, deferred).** `seedExamConfigs` only CREATEs a row for a *new*
      `config_version`; it never updates an existing one. The `exam_configs` blob for `oet@2.0.0` still
      holds the pre-edit (empty-subskill) config (verified: 0/0 subskills in the DB blob). **Runtime is
      unaffected** — the engine serves `getExamConfig` from the in-memory JSON cache, not the DB. Fix
      path: bump `config_version` at the real OET config release (that reseeds all exams' blobs + stamps
      new provenance). Leave stale until then; do **not** hand-edit the DB row.
- [ ] ⚠️ **Restart backend before OET endpoint work.** The running server's cache also predates the
      edit (nodemon watches `.ts`, not `.json`). A restart reloads the JSON into cache (Phase 2+).

---

## 2. DB-table verification (what the diagnostic will read/write)

Verified live against the dev DB (read-only introspection, 2026). No migration needed for the
**diagnostic slice**. **No destructive SQL run.**

- [x] **`exams` / `exam_configs`** — seeded (see §1).
- [x] **`diagnostic_questions` columns fit** — `exam_id`, `level Char(1)`, `skill SkillType`,
      `question_type VarChar(30)`, `set_id`, `passage_text`, `audio_url`, `prompt_text`,
      `options Json`, `correct_answer`, `min_words`, `sequence`. ✅
- [x] **D3 (RESOLVED) — `chk_dq_question_type`** allows `('MCQ','TFNG','WRITING_PROMPT','SPEAKING_PROMPT')`.
      OET maps cleanly: **MCQ** (Listening/Reading), **WRITING_PROMPT** (Writing), **SPEAKING_PROMPT**
      (Speaking roleplay). `chk_dq_level` allows `A/B/C` (our proficiency levels). **No ALTER needed**
      for the MCQ-based diagnostic. *(If we later add gap-fill/matching item types, that's a new value.)*
- [x] **`diagnostic_sessions`** — `@@unique([student_id, exam_id, skill])`, exam-scoped. No change.
- [x] **D4 (CONFIRMED) — score storage.** Verified: `band_score` is `numeric(2,1)` (max 9.9) on
      `assessment_history` + `student_competency_matrix` (and `mock_sessions.real_band_score`), each
      with a `CHECK (0 ≤ band_score ≤ 9.0)`. So `oet_500` (0–500) **cannot** be stored raw. **Decision
      (recommended): store real `{score, grade}` per component in `sub_scores` JSON; put a normalised
      0–9 in `band_score`** (fits type + CHECK; mirrors CEFR's ordinal reuse). **No schema change.**
      ← *needs your sign-off before Phase 3 scoring code.*
- [x] **`assessment_history`** — `mode='DIAGNOSTIC'`, `band_score numeric(2,1)`, `sub_scores`,
      `exam_id`, provenance. Same D4 rule. ✅
- [x] **CHECK constraints** — `chk_ah_band_range`, `chk_scm_band_range`, `chk_target_band_range` all
      `[0,9]`. With D4's normalised `band_score` → **no change needed**.
- [x] **`SkillType` enum** — `LISTENING/READING/WRITING/SPEAKING` ✅ (reused).
- [x] **`SubSkillType` enum** — `LISTENING, READING, GRAMMAR, VOCABULARY, COHERENCE, TASK_RESPONSE,
      FLUENCY, PRONUNCIATION, INTERACTION`. ⚠️ OET's real criteria (purpose/content/genre/intelligibility/
      appropriateness/relationship_building/…) **do NOT map** to these. **Not a diagnostic blocker:**
      like SE, OET stores its subskills in `sub_scores` JSON (per-component row), **not** as
      `SubSkillType` enum rows. Enum only matters if/when OET gets **drills** tagged by criterion —
      defer to the drills phase.
- [ ] **D2 (DEFERRED, not diagnostic-blocking) — per-component targets.** `institute_students` has a
      single `target_band double precision` (0–9 CHECK) + `exam_date` — **no** per-component target
      column. OET needs L/R/W/S targets. The diagnostic doesn't use targets (it measures baseline), so
      defer to the readiness/dashboard phase. Recommendation then: store a **regulator preset id**
      (e.g. `"nmc"`, which already lives in `oet.target.presets`) or add a `target_per_component` JSON —
      don't overload the single band.
- [ ] **`institute_exam_subscriptions`** — currently only `ielts` + `spoken_english` rows exist; **no
      OET row**. To test, insert one `TRIAL` OET row for the test institute (data insert, unique
      `[institute_id, exam_id]`). Done at test-student setup (Phase 3/DoD).

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
| **D1** | Writing/Speaking subskills | **OET's real criteria** — Writing 6, Speaking 4 linguistic + 5 clinical; grade all incl. clinical | ✅ locked |
| **D2** | Per-component target storage | Preset id (`nmc`) or `target_per_component` JSON | deferred (not diagnostic-blocking) |
| **D3** | `chk_dq_question_type` values for OET | MCQ / WRITING_PROMPT / SPEAKING_PROMPT all allowed — no ALTER | ✅ resolved |
| **D4** | `oet_500` score storage vs `numeric(2,1)` | Real `{score,grade}` in `sub_scores`; normalised 0–9 in `band_score` | recommended — **awaiting sign-off** |
| **D5** | Roleplay speaking grading/route | Reuse viva multi-recording pipeline | open (Phase 3) |
| **D6** | Go-live | Stay `reserved` (legal `BLOCKED_ON_COUNSEL`) | locked |

---

## Definition of done (diagnostic slice)

- [ ] Test student (`exam_id='oet'`, TRIAL sub) can complete L/R/W/S diagnostic end-to-end.
- [ ] `checkAndMarkDiagnosed` flips `is_diagnosed` only after **all 4** assessed components are scored.
- [ ] Each component produces an `oet_500` score + grade, stored per D4, provenance-stamped.
- [ ] No IELTS/SE regression (exam-aware branches, shared tables untouched in behaviour).
- [ ] Results readable via `competency-scores` (per-component, no invented overall).
