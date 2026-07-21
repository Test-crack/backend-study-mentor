# AI-graded seeder (`scripts/seeders-ai/`)

An **experimental variant** of `scripts/seeders/` that replaces the templated diagnostic/IA
feedback with **real Gemini grading**, while keeping every persona's **designed band** so the
at-risk gradient stays intact.

The original `scripts/seeders/` is untouched and remains the **fallback** — if this variant's
output isn't good enough, just run the original `runSeed.ts` instead.

## What's different vs the original

| Piece | Original (`scripts/seeders/`) | This variant |
|---|---|---|
| Diagnostic Writing/Speaking feedback | templated strings | **real Gemini** (`analyzeWriting`, `gradeIASpeakingPrompt`) |
| IA Writing/Speaking `ai_feedback` | templated strings | **real Gemini** (`gradeIAWritingPrompt`/`gradeIASpeakingPrompt`) |
| Stored band scores | designed | **designed (unchanged)** — protects the gradient |
| Listening/Reading | MCQ accuracy | MCQ accuracy (unchanged) |
| Students, drills, streaks, cleanup | — | **reused as-is** from `../seeders` |

Only the feedback **prose** is real; all **numbers** remain the hand-tuned persona bands.
We can't make Gemini author authentically band-3 prose, so `genSeedFeedback` calibrates the
generated answers (injecting band-appropriate weaknesses) to keep the feedback coherent.

## How to run

```bash
# 1) One-time: build the real-feedback cache (needs GEMINI_API_KEY + DB tunnel).
#    Idempotent + resumable; re-run only regenerates missing entries (or pass --force).
npx ts-node --project tsconfig.dev.json scripts/seeders-ai/genSeedFeedback.ts
#    single persona / force:
npx ts-node --project tsconfig.dev.json scripts/seeders-ai/genSeedFeedback.ts --email rahul.shetty@seed.testcrack.dev --force

# 2) Seed (same flags as runSeed). Reads seedFeedback.json — fast, no Gemini.
npx ts-node --project tsconfig.dev.json scripts/seeders-ai/runSeedAI.ts --batch <batchId> --dry-run
npx ts-node --project tsconfig.dev.json scripts/seeders-ai/runSeedAI.ts --batch <batchId> --clean

# Fallback to the proven templated seeder at any time:
npx ts-node --project tsconfig.dev.json scripts/seeders/runSeed.ts --batch <batchId> --clean
```

## Files

- `genSeedFeedback.ts` — one-time Gemini batch → `seedFeedback.json` (the cache). Calibrated
  answer generation + retry/backoff on transient 503s.
- `iaPlan.ts` — shared IA schedule/band logic (kept identical to `seedIASessions`).
- `seedDiagnosticsAI.ts` / `seedIASessionsAI.ts` — drop-in score builders that read the cache;
  fall back to templated feedback if an entry is missing.
- `runSeedAI.ts` — orchestrator; reuses `createStudents`/`seedDrills`/`cleanStudents`.
- `seedFeedback.json` — generated cache (safe to delete; just re-run the generator).

## Safety

- Writes only to `@seed.testcrack.dev` rows (same scope as the original). Never touches the
  `IAQuestion` bank or real students.
- Fully reversible: `scripts/seeders/cleanSeed.ts --confirm`.
- `genSeedFeedback.ts` writes **nothing** to the DB — only the local JSON cache.
