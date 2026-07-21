# Project Context — TestCrack Seeder & Student Bot (handoff for a fresh chat)

Paste this whole file into a new chat to bring it up to speed. It captures the goal, what's built, key decisions, the current blocker, and next steps.

---

## Who / what

- **User:** intern (Shalom) on the **TestCrack** backend — Node/Express/TypeScript/Prisma/PostgreSQL/Supabase-auth. New-ish to TS; explain clearly.
- **Repo root:** `C:\Users\JOEL E SAM\OneDrive\Desktop\Projects\backend-study-mentor`
- **People:** Sarthak = backend lead (owns repo/VPS/prod). Paul = product. Abhishek = generating IA/mock question content.
- **Run scripts with:** `npx ts-node --project tsconfig.dev.json <path>`
- **Typecheck the scripts** (IMPORTANT — `tsc -p tsconfig.dev.json` skips `scripts/` because tsconfig `include` is only `src/**`):
  ```
  npx tsc --noEmit --esModuleInterop --skipLibCheck --strict --module commonjs --moduleResolution node --target ESNext --resolveJsonModule scripts/seeders/*.ts scripts/bot/*.ts
  ```

## Environment (critical)

- **There is NO staging DB.** Everything runs against **production**, reached via an **SSH tunnel**: local `DATABASE_URL` points at `localhost:5433` → prod Postgres `study_mentor_db`. Supabase auth is the real cloud project.
- `.env` has: `DATABASE_URL`, `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `GEMINI_API_KEY` (model used: `gemini-2.5-flash`), etc. Gemini cost is **not** a concern (already paying).
- The bot hits the **local** backend (`npm run dev` → `localhost:4000`) which uses main's code + the tunneled prod DB.
- Seeded batch in use: **`ielts batch 23`** = `1d0fbdde-9d9e-4232-ba34-7cc044b915a9` (institute: IIIT Kottayam). Find batches with `scripts/seeders/listBatches.ts`.

---

## The two deliverables

### 1) Seeder (`scripts/seeders/`) — a 12-persona demo cohort
Original Week-1 task. Writes fake students + their history directly to the DB so the instructor dashboard shows a believable cohort.

**Key corrections vs the original task doc (all intended):**
- **No Supabase in the seeder** — emails are fake (`@seed.testcrack.dev`), so it inserts `User` rows directly with a fake `supabaseuserid`. (Sarthak's call.)
- **FK chain:** every assessment row → `institute_students.id`, NOT `User.id`. `institute_students` needs `institute_id` (looked up from the `--batch` UUID); batch enrollment is a separate `ielts_batch_students` row.
- **At-risk dashboard rule** (in `src/controllers/instructorProgressController.ts`): a student is flagged at-risk if `momentum_score < 100`, OR no drill 3+ days, OR `daily_streak===0` while inactive, OR IA band trend "down". → non-at-risk personas are seeded with momentum ≥ 100, streak > 0, recent drills.
- **`last_streak_date` must = YESTERDAY** (not today), else the next real drill resets the streak to 1 instead of continuing it.
- **IA dates must sit on the app's schedule** (`firstDrill + 3,6,9…`, `IA_INTERVAL_DAYS=3`). The miss-detector (`src/lib/iaMissDetector.ts`) retroactively marks any past scheduled day with no session as MISSED (−20). So the seeder seeds a COMPLETED IA on every past scheduled day; Kiran (dropout) gets only his oldest → app marks the rest MISSED (his dropout signal).
- Seeded RNG (`utils.ts seededRand`) uses **FNV-1a + avalanche** (a weak hash made daily activity rolls constant — fixed).

**Seeder files:**
- `personas.ts` — 12 persona configs (the single source of truth). Fields incl. `diagnosticBand`, `accuracyRate`, `skillAccuracy?`, `drillCount`, `iaCount` (now vestigial — IA count is schedule-derived), `momentumScore`, `dailyStreak` (== drillCount for active), `atRisk`, `activityRate?`, `isDropout`, `isErratic`.
  - Groups: HIGH (Arjun, Divya, Rohan), MID (Meena, Arun, Sneha), LOW/struggling/at-risk (Rahul, Priya, Vishnu), EDGE (Anjali = skill-asymmetry strong L/R weak W/S; Kiran = the ONLY dropout; Lena = erratic).
  - Group C (Rahul/Priya/Vishnu) have `iaCount: 2` and a **declining** newest IA so they stay at-risk via "Band score declining" *while still active*.
- `utils.ts` — `seededRand`, `roundBand`, `noisyBand`, `daysAgo`, `today`, `yesterday`, `dbHostLabel`, feedback builders (`writingFeedback`/`speakingFeedback` match production shapes), `fakeSupabaseId`.
- `tickBehavior.ts` — shared `activityRate(persona)` + `rollActive(persona, daySeed)` (used by both the old tick and the bot). Strugglers/dropout currently 0 in the OLD tick; in the BOT, Group C = 0.6 (trying), Kiran = 0.
- `createStudents.ts` — User + institute_students + batch enrollment; `cleanStudents(dryRun)`.
- `seedDiagnostics.ts` — 4 AssessmentHistory + StudentCompetencyMatrix/student; production-correct JSONB shapes (L/R use `accuracy_percentage`+`by_question_type`; W/S use structured `feedback`).
- `seedDrills.ts` — drills on consecutive days ending today (active) / stale (at-risk).
- `seedIASessions.ts` — schedule-aligned completed IAs; Group C declining; Kiran 1 completed + app-marked misses.
- `runSeed.ts` — orchestrator. `--batch <uuid>` (required), `--dry-run`, `--clean`. Prints `Database:` line.
- `cleanSeed.ts` — wipe-only; **previews by default**, deletes only with `--confirm`. Only ever touches `@seed.testcrack.dev`.
- `listBatches.ts` — read-only; lists batch UUIDs.
- `simulateDays.ts` — read-only N-day streak projection (caught the RNG bug).
- `README.md`, `MOCK_IA_SCHEMA.md` — docs (the latter is the schema+examples handoff for Abhishek).

### 2) Student Bot (`scripts/bot/`) — Paul's "real" version
Paul's critique (correct): the seeder writes rows *around* the app, exercises zero app code, can't catch bugs. The bot instead **logs in as each persona and drives the REAL endpoints** (drills, LexiGrid, IA) → real grading, real momentum/streak, and doubles as a regression test. Keep the persona config; only the execution layer changes.

**Auth unlock:** `supabaseAdmin.auth.admin.createUser({email,password,email_confirm:true})` → `signInWithPassword` → real JWT (no OTP/email needed). First API call links the seeded `User` to the new Supabase identity via `ensureUser` (by email) — so the bot operates on the existing seeded students. Password login also works on the website (email + `Seed@1234`) if the UI offers password auth.

**Bot files:**
- `botClient.ts` — `getToken(persona)` (login → JWT), `api(method,path,token,body)` (fetch wrapper), `cleanAnswer` (JSON-decode `correct_answer`). `API_BASE` from env, default `localhost:4000`.
- `flows.ts` — `doDrill` (start→complete→apply-done; `/start` returns `correct_answer` so the bot answers to the persona's accuracy), `doLexiGrid` (`POST /api/student/game-score`).
- `iaFlow.ts` — `doIA`: **self-gates** on `GET /api/ia/status` (`is_ia_day`, `can_start_test`, `has_active_session`, `has_completed_session`) so ONLY students whose IA is actually due do it. MCQ answers looked up from `IAQuestion` via Prisma (the API strips `correct_answer`); W/S prompts use pre-built answers from `iaAnswers.json` (fallback: live `generateAnswer`). Flow: `/questions` → per-section `/answer` (+`section_advance`) → `/submit`.
- `genAnswer.ts` — Gemini generator for an on-topic IELTS answer at a target band (used as fallback + by the batch).
- `genIAAnswers.ts` — **one-time batch**: for every WRITING_PROMPT/SPEAKING_PROMPT in the bank, generate 3 tiered answers (low/mid/high) → save `iaAnswers.json`. Idempotent + resumable. Re-run when new prompts are added. (This avoids per-run Gemini generation cost; grading on submit is still Gemini and unavoidable.)
- `dailyBot.ts` — the orchestrator / entry point (replaces the old `dailyTick`). Per persona: `rollActive` → if active, idempotency-guarded drills (only does `max(0, 2 - drills_done_today)`) + LexiGrid; then `doIA` for non-dropouts (self-gates). Per-persona try/catch. `--email <addr>` to run one.
- `runBot.ts` — single-persona, single-drill tester (slice 1+2 proof).

---

## Current status — what works (verified on prod)

- Seeder: 12 students seed cleanly; instructor at-risk list shows exactly Rahul/Priya/Vishnu/Kiran; Arjun's student view is demo-clean (10-day streak continues, IAs on-schedule with **0 missed**, full sub-scores render).
- Bot: real auth ✓, real drills ✓ (momentum/streak computed by the app), LexiGrid ✓, idempotency guard ✓ (re-run = no-op), IA self-gating ✓ (Divya/Rahul did real IAs).
- Realistic split: high performers active, Group C "trying but slipping" (active + declining IA → stay at-risk), Kiran idle/dropout.

## 🔴 CURRENT BLOCKER (where we stopped)

`dailyBot` now 500s on `GET /api/student/daily-drill-state`. Backend stack trace:
```
PrismaClientKnownRequestError P2022:
The column `student_game_scores.score_data` does not exist in the current database.
(getDailyDrillState → prisma.studentGameScore.findFirst)
```
**Root cause: schema drift.** main's Prisma schema + code expect `student_game_scores.score_data`, but the **prod DB doesn't have that column** — a migration in main was never applied to prod (also why "main changes aren't reflecting on the live site"). NOT our bug.

**Fix direction = ADD the column to prod (do NOT `prisma db pull`, which would remove it and break `saveGameScore`):**
```sql
ALTER TABLE student_game_scores ADD COLUMN IF NOT EXISTS score_data jsonb;
```
Run via tunnel/pgAdmin (it's prod — confirm with Sarthak), restart `npm run dev`, re-run the bot. If another column throws P2022, same gap — add it too, or have Sarthak run the proper migration / redeploy the VPS. The live site will hit the same 500 once deployed, so Sarthak needs to reconcile prod ↔ main regardless.

---

## Open items / next steps

1. **Unblock the 500** (above) — add `score_data` to prod, retry the bot.
2. **IA prompt-coverage gap** (content, Abhishek's job): the `IAQuestion` bank has WRITING_PROMPT/SPEAKING_PROMPT only for **Coherence, Task Response, Fluency, Pronunciation** — **none for Grammar or Vocabulary**. So IA sections on Grammar/Vocab are MCQ-only → not AI-graded (this is why Rahul's IA wasn't AI-graded; Divya's was). Fix: add `WRITING_PROMPT` (Grammar, Vocabulary) + `SPEAKING_PROMPT` (Grammar, Vocabulary), ~6 each. Prompt text is reusable across sub-skills (the grader applies the sub-skill lens). Then re-run `genIAAnswers.ts`.
3. **Regression mode** (not built): make the bot assert each response (status 2xx, momentum increased, bands 0–9, scores present) and fail loudly — Paul's "catch bugs before users."
4. **Deploy + schedule** (Sarthak): the `scripts/` are **untracked / local-only** (`git status` shows `?? scripts/`) — never committed/pushed, so the VPS doesn't have them. To automate: commit `scripts/` → deploy to VPS → schedule `dailyBot.ts` with PM2 cron (`pm2 start npx --name daily-bot --no-autorestart --cron "30 0 * * *" -- ts-node --project tsconfig.dev.json scripts/bot/dailyBot.ts; pm2 save`). Must run on the always-on VPS, not the laptop. Confirm server TZ vs IST.
5. **Mock** is explicitly out of scope (not built yet).

## Key commands

```
# find batch UUIDs
npx ts-node --project tsconfig.dev.json scripts/seeders/listBatches.ts
# seed / re-seed (wipe+reseed) the 12 personas
npx ts-node --project tsconfig.dev.json scripts/seeders/runSeed.ts --batch 1d0fbdde-9d9e-4232-ba34-7cc044b915a9 --clean
# remove seeded students (preview, then confirm)
npx ts-node --project tsconfig.dev.json scripts/seeders/cleanSeed.ts
npx ts-node --project tsconfig.dev.json scripts/seeders/cleanSeed.ts --confirm
# build the IA answer bank (one-time; needs DB tunnel + GEMINI_API_KEY)
npx ts-node --project tsconfig.dev.json scripts/bot/genIAAnswers.ts
# run the daily bot (needs `npm run dev` backend + tunnel up)
npx ts-node --project tsconfig.dev.json scripts/bot/dailyBot.ts
npx ts-node --project tsconfig.dev.json scripts/bot/dailyBot.ts --email arjun.menon@seed.testcrack.dev
```

## Behaviours / gotchas to remember
- Drill `/complete` trusts a client-reported `correct_answers` COUNT (no server re-grade). Diagnostics & IA MCQ are server-graded → bot looks up the key (DB). IA/Mock Speaking is graded from a **text transcript** (no audio); only the standalone Diagnostic-speaking endpoint needs an audio upload.
- Streak only advances when a student completes **2 drills in a day** (then continues iff `last_streak_date == yesterday`, else resets to 1).
- All seed/bot writes are scoped to `@seed.testcrack.dev` and reversible via `cleanSeed`. We never modified app code or the question bank — only added `scripts/`. (The bot did create 12 Supabase auth users — harmless; `cleanSeed` doesn't remove those.)
- `iaCount` in personas.ts is now unused (IA count is schedule-derived).
