# TestCrack `scripts/` — command reference

All commands run from the **repo root**. Default batch UUID used below
(`ielts batch 23`, IIIT Kottayam):

```
1d0fbdde-9d9e-4232-ba34-7cc044b915a9
```

> **Safety:** every seeder/bot write is scoped to `@seed.testcrack.dev` accounts and is
> reversible via `cleanSeed`. None of these touch real students or the `IAQuestion` bank.

---

## 0. Prerequisites

- **SSH tunnel up** — local `DATABASE_URL` → prod Postgres (`localhost:5433`). Required for
  anything that reads/writes the DB.
- **`GEMINI_API_KEY`** in `.env` — required for the bot and the AI-feedback generator.
- **Backend running** (`npm run dev` → `localhost:4000`) — required only for the **bot**
  (it calls the live API). Seeders and the feedback generator do NOT need it.

**After any Prisma schema change** (stop the dev server first, or you'll get an EPERM lock):

```bash
npx prisma generate
```

Then restart `npm run dev`. (This is what unblocked the bot after the `score_data` schema drift.)

---

## 1. Find your batch UUID

```bash
npx ts-node --project tsconfig.dev.json scripts/seeders/listBatches.ts
```

---

## 2. Seeder — templated (the proven fallback)

`scripts/seeders/` — writes the 12-persona cohort with hand-written feedback text. Fast,
deterministic, no Gemini.

```bash
# preview (writes nothing)
npx ts-node --project tsconfig.dev.json scripts/seeders/runSeed.ts --batch 1d0fbdde-9d9e-4232-ba34-7cc044b915a9 --dry-run

# wipe + reseed
npx ts-node --project tsconfig.dev.json scripts/seeders/runSeed.ts --batch 1d0fbdde-9d9e-4232-ba34-7cc044b915a9 --clean

# seed without wiping (only fills personas that don't exist yet)
npx ts-node --project tsconfig.dev.json scripts/seeders/runSeed.ts --batch 1d0fbdde-9d9e-4232-ba34-7cc044b915a9
```

---

## 3. Seeder — AI-graded (real Gemini feedback)

`scripts/seeders-ai/` — same cohort and same designed bands, but the diagnostic + IA
feedback **text** is real Gemini grading. See `scripts/seeders-ai/README.md` for details.

```bash
# STEP 1 — build the feedback cache (Gemini only; writes NO DB, no tunnel needed).
#          Idempotent + resumable: re-run to finish; skips already-cached personas.
npx ts-node --project tsconfig.dev.json scripts/seeders-ai/genSeedFeedback.ts

#   one persona / force-regenerate:
npx ts-node --project tsconfig.dev.json scripts/seeders-ai/genSeedFeedback.ts --email rahul.shetty@seed.testcrack.dev --force

# STEP 2 — seed using that cache. --clean is REQUIRED to replace existing seeded data
#          (the seeders skip personas that already have rows).
npx ts-node --project tsconfig.dev.json scripts/seeders-ai/runSeedAI.ts --batch 1d0fbdde-9d9e-4232-ba34-7cc044b915a9 --dry-run
npx ts-node --project tsconfig.dev.json scripts/seeders-ai/runSeedAI.ts --batch 1d0fbdde-9d9e-4232-ba34-7cc044b915a9 --clean
```

---

## 4. Clean up seeded students

```bash
# preview what would be deleted (safe, default)
npx ts-node --project tsconfig.dev.json scripts/seeders/cleanSeed.ts

# actually delete (only @seed.testcrack.dev accounts)
npx ts-node --project tsconfig.dev.json scripts/seeders/cleanSeed.ts --confirm
```

---

## 5. Student bot — drives the real API

`scripts/bot/` — logs in as each persona and runs drills / LexiGrid / IAs through the live
endpoints (real grading, real momentum/streak). Needs the **backend running** + tunnel.

```bash
# one-time: build the bot's pre-written IA answers (Gemini; calibrated per band)
npx ts-node --project tsconfig.dev.json scripts/bot/genIAAnswers.ts

# run the daily bot for the whole cohort
npx ts-node --project tsconfig.dev.json scripts/bot/dailyBot.ts

# run a single persona
npx ts-node --project tsconfig.dev.json scripts/bot/dailyBot.ts --email arjun.menon@seed.testcrack.dev
```

---

## 6. IA question-bank prompts (Grammar / Vocabulary gap) — needs sign-off

`scripts/seeders/seedIAPrompts.ts` — adds open-ended Writing/Speaking prompts for the
Grammar/Vocabulary sub-skills so those IA sections become AI-graded instead of MCQ-only.
⚠️ These write to the **real `IAQuestion` bank** (seen by live students), so this is
preview-by-default and needs Abhishek/Sarthak's OK before activating.

```bash
npx ts-node --project tsconfig.dev.json scripts/seeders/seedIAPrompts.ts                       # preview
npx ts-node --project tsconfig.dev.json scripts/seeders/seedIAPrompts.ts --confirm             # insert
npx ts-node --project tsconfig.dev.json scripts/seeders/seedIAPrompts.ts --deactivate --confirm # hide from live students
npx ts-node --project tsconfig.dev.json scripts/seeders/seedIAPrompts.ts --activate --confirm    # make servable
npx ts-node --project tsconfig.dev.json scripts/seeders/seedIAPrompts.ts --clean --confirm        # delete them
```

---

## 7. Read-only diagnostics

```bash
# N-day streak projection
npx ts-node --project tsconfig.dev.json scripts/seeders/simulateDays.ts
```

---

## Typecheck the scripts

`tsc -p tsconfig.dev.json` skips `scripts/` (its `include` is `src/**`), so check explicitly:

```bash
npx tsc --noEmit --esModuleInterop --skipLibCheck --strict --module commonjs \
  --moduleResolution node --target ESNext --resolveJsonModule \
  scripts/seeders/*.ts scripts/seeders-ai/*.ts scripts/bot/*.ts scripts/shared/*.ts
```

---

## Typical full reset (AI-graded demo)

```bash
# tunnel up; GEMINI_API_KEY set
npx ts-node --project tsconfig.dev.json scripts/seeders-ai/genSeedFeedback.ts              # build cache (once)
npx ts-node --project tsconfig.dev.json scripts/seeders-ai/runSeedAI.ts --batch 1d0fbdde-9d9e-4232-ba34-7cc044b915a9 --clean
# then, with `npm run dev` up, drive live activity:
npx ts-node --project tsconfig.dev.json scripts/bot/dailyBot.ts
```
