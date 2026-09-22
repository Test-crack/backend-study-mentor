# Config Verification & Interpretation (Stage 0)

> **The point in one line:** there is *one* interpreter that turns an exam config into a
> plain-English account — and it is the **same resolution the platform runs on**. So what a
> superadmin reads when they verify a config is exactly what the app will do with it. No
> divergence, no "the config looks right, why isn't it working — go ask a developer."

See also: [platform-vision.md](../architecture/platform-vision.md) (why exams are data, not code).

## Why this exists

An exam is a JSON config (see the exam engine). A non-technical admin can't read JSON and be
sure the engine understood it the way they intended — especially across wildly different
exams (IELTS has an overall band; OET has none; GRE has scaled sections; a future JEE/NEET is
negative-marked MCQ). If the admin's mental model and the engine's actual resolution drift,
you get silent misconfiguration that only surfaces as a runtime bug.

Config Verification closes that gap with two layers, mirroring the question-verification
engine:

- **Layer 1 — structural.** *Will the engine run this config at all?* Wraps the existing
  `validateConfig` (the real boot-time gate) and reports errors/warnings as findings.
- **Layer 2 — interpretation.** *What does this config MEAN?* Runs the interpreter and renders
  a plain-English "read it back" — exam name, skills/sub-skills, how it's scored (described,
  never computed), delivery, targets — plus observations a human should question.

## The interpreter is the keystone

`interpretConfig(exam, scales) → ExamInterpretation` in
[`src/exam-engine/interpret.ts`](../../src/exam-engine/interpret.ts) is a **pure, exam-agnostic**
function. It classifies the scoring model (`aggregate` / `per_component` / `unknown`),
enumerates components (assessed vs practice-only), sub-skills (with groups + max points where
present), scales (numeric bands / ordinal levels / graded), targets, variants and modules —
without special-casing any exam id. `describeInterpretation()` renders it to markdown.

**Design intent:** this is *not* a throwaway "explainer." It is meant to be the canonical
resolution layer the **runtime** also consults, so the admin's confirmed understanding and the
app's behaviour are guaranteed to be the same object. It is deliberately distinct from
`publicConfig.toPublicConfig` (which *strips* scoring internals for the browser); the
interpreter *describes* scoring, for the internal superadmin surface.

Proven against all five configs in the repo — IELTS (aggregate `band_mean`), Spoken English
(aggregate `cefr_hybrid`, 1 assessed + 3 practice), OET (per-component, grouped criteria, no
headline), GRE + GMAT (per-component, scaled sections).

## File map

| Layer | File |
|---|---|
| Interpreter (keystone) | `src/exam-engine/interpret.ts` · dogfood `src/exam-engine/interpret.check.ts` |
| Verification engine | `src/Verification/config/{types,layer1,layer2,verify,cli}.ts` |
| API | `src/controllers/superadminController.ts` (`verifyExistingExamConfig`, `verifyCandidateConfig`) · `src/routes/superadminRoutes.ts` |
| Frontend page | `ai-study-mentor/src/features/TestCrackSuperAdmin/dashboard/ConfigVerification.tsx` |
| Frontend service | `…/services/superadminService.ts` (`verifyExamConfig`, `verifyCandidateConfig`, types) |

## API (SUPERADMIN-only, read-only)

- `GET  /api/superadmin/exams/:id/verify` — verify a **loaded** exam config.
- `POST /api/superadmin/config/verify` — verify a **candidate** config before it is seeded.
  Body: an exam-config object, or `{ "exam": {…}, "scales": {…} }` when it brings its own scales.

Both return `{ data: ConfigVerifyResult }` = `{ examId, outcome, layer1, layer2 }`, where
`outcome` is the worst of the two layers (`pass` / `warn` / `fail`) and
`layer2.plainEnglish` is the rendered read-back.

## CLI (dogfood / ops)

```bash
npx tsx src/Verification/config/cli.ts                       # every exam in the file
npx tsx src/Verification/config/cli.ts --exam oet_nursing    # one exam
npx tsx src/Verification/config/cli.ts --file candidate.json # a pasted candidate
```

## Frontend

Superadmin → **Config Verify** (`/superadmin/examconfigs/verify`). Pick a live exam or paste a
candidate → Layer 1 findings + the Layer 2 plain-English card. State persists across refresh
(`usePersistentState`).

## Scope

- **In:** structural validation surfaced to the UI; plain-English interpretation of any config
  shape; verifying existing + candidate configs.
- **Parked (deliberately):** the scoring *computation* (stays in the strategy registry);
  exam-specific dashboard-unlock logic (editable later via the exam page); **draft persistence
  + publish** (Segment E — authoring a brand-new config through draft → validate → publish).

## Next

- **Segment E:** persist candidate configs as drafts, then a safe publish flow (per the
  Stage-0 safety model: built-ins file-locked, new exams DB-authored, versioned, four-eyes).
- **Runtime convergence:** progressively route runtime config resolution through
  `interpretConfig` (or a shared core) so the "one interpretation" guarantee holds everywhere,
  not just in the admin panel.
