# TestCrack Persona Seeder

This script creates 12 realistic student accounts in the staging database for demos, dashboard validation, and feature testing. One command fills an entire instructor dashboard with a convincing cohort. A companion **daily tick** then keeps that cohort evolving day by day, so it behaves like live users.

---

## How it works (the workflow)

Three jobs: **seed** a cohort once, **evolve** it daily, **clean** it up. Everything is driven by one config file.

```
personas.ts ──► runSeed.ts ──► writes the 12-student snapshot to the DB
 (the config)   (orchestrator)      ├─ createStudents   (User + institute_students + batch enrolment)
                                    ├─ seedDiagnostics  (4 band scores/student + competency radar)
                                    ├─ seedDrills       (drill history, recent consecutive days)
                                    └─ seedIASessions   (internal assessments)

dailyTick.ts ──► run once a day ──► appends "today's" drills + LexiGrid for active students
cleanSeed.ts ──► deletes the 12 seeded students (and all their data, via cascade)
```

**1. `personas.ts` — the single source of truth.** 12 behaviour profiles (not fixed rows). Every number in the DB is derived from a persona + a seeded RNG. Change a persona, re-seed, and their whole footprint changes.

**2. `runSeed.ts` — the seeder.** Runs four steps in FK-safe order:

| Step | Writes | Notes |
|---|---|---|
| `createStudents` | `User` (fake `supabaseuserid` — no Supabase), `institute_students`, `ielts_batch_students` | institute resolved from the `--batch` UUID |
| `seedDiagnostics` | 4× `AssessmentHistory` + `StudentCompetencyMatrix` per student, sets `isDiagnosed` | the band radar |
| `seedDrills` | `drill_sessions` | one per consecutive day ending today; `daily_streak` = drillCount |
| `seedIASessions` | `IASession` | Kiran gets an abandoned IN_PROGRESS one; Group C get a declining 2nd IA |

Key fact: every assessment row points to `institute_students.id`, **not** `User.id`. `User` = login identity; `institute_students` = the profile everything hangs off.

**3. The personas map onto the dashboard's at-risk rules** (`momentum < 100`, no activity 3+ days, streak broken, band declining):
- High performers → high bands, momentum ≥ 100, long streaks → **not** at-risk
- Strugglers (Group C) → low bands + a **declining 2nd IA** → stay at-risk even while actively drilling
- Kiran → the one true **dropout** (abandoned IA, goes silent)
- Anjali → skill asymmetry (strong L/R, weak W/S); Lena → erratic/oscillating

**4. `dailyTick.ts` — makes it live.** Run once a day. Each student rolls against their `activityRate`: if active, it writes 2 drills + a LexiGrid game and advances momentum/streak exactly like the real app; if idle, nothing (streak breaks naturally). Idempotent — already drilled today → skipped.

**Safety model (everywhere):** only ever touches `@seed.testcrack.dev` accounts; cascade deletes clean up children; every writing/deleting script prints the `Database:` line at startup; risky commands have dry-run/preview modes.

---

## Prerequisites

Before running:

1. You need a `.env` file at the project root with `DATABASE_URL` pointing to the staging database.
2. A batch must already exist in the staging database. Ask Sarthak for the batch UUID.
3. You need Node.js installed and the project dependencies installed (`npm install`).

---

## Step-by-step: How to run

**First, always do a dry run.** This shows what would be inserted without touching the database:

```bash
npx ts-node --project tsconfig.dev.json scripts/seeders/runSeed.ts --batch YOUR_BATCH_ID --dry-run
```

Review the output with Sarthak. Once it looks right, run for real:

```bash
npx ts-node --project tsconfig.dev.json scripts/seeders/runSeed.ts --batch YOUR_BATCH_ID
```

Replace `YOUR_BATCH_ID` with the UUID Sarthak gives you (looks like `abc12345-...`).

---

## How to verify after running

Open the staging instructor dashboard and check:

| What to look for | Where to look |
|---|---|
| 12 student names in the batch | Instructor Dashboard → Batch Management |
| High, mid, and low bands all present | Batch Overview → Band Distribution chart |
| Rahul, Priya, Vishnu flagged as at-risk | Instructor Dashboard → At-Risk Students |
| Arjun and Divya NOT in at-risk list | Same list — confirm they are absent |
| Kiran shows 1 completed + 1 incomplete IA | Student Deep-Dive → Assessment Overview |
| Drill activity over the past 14 days | Instructor Dashboard → Activity Heatmap |
| Anjali shows green L/R, red W/S radar | Student Deep-Dive → Competency Radar |

---

## How to clean up (re-run from scratch)

To wipe all seeded data and re-seed:

```bash
npx ts-node --project tsconfig.dev.json scripts/seeders/runSeed.ts --batch YOUR_BATCH_ID --clean
```

**Safety:** `--clean` only deletes accounts whose email ends with `@seed.testcrack.dev`. It will never delete real users.

To delete the seeded students **without** re-seeding, use `cleanSeed.ts` (previews first, deletes only with `--confirm`):

```bash
npx ts-node --project tsconfig.dev.json scripts/seeders/cleanSeed.ts            # preview — deletes nothing
npx ts-node --project tsconfig.dev.json scripts/seeders/cleanSeed.ts --confirm  # actually delete
```

---

## Making it dynamic (the daily tick)

After seeding once, `dailyTick.ts` evolves the cohort each day so it looks like live usage.

```bash
# Preview today's activity (writes nothing):
npx ts-node --project tsconfig.dev.json scripts/seeders/dailyTick.ts --dry-run

# Apply today's activity:
npx ts-node --project tsconfig.dev.json scripts/seeders/dailyTick.ts
```

Per student, per day: roll against `activityRate` → if active, write 2 drills + a LexiGrid game and advance momentum/streak; if idle, do nothing. High performers climb, strugglers grind inconsistently (but stay at-risk via their declining IA), Kiran stays silent. Idempotent (already drilled today → skipped).

**Preview the future without writing** — `simulateDays.ts` fast-forwards N days in memory and prints each student's projected streak trajectory:

```bash
npx ts-node --project tsconfig.dev.json scripts/seeders/simulateDays.ts            # 14 days
npx ts-node --project tsconfig.dev.json scripts/seeders/simulateDays.ts --days 30
```

### Automating the tick (runs on the SERVER, not a laptop)

The tick must run on the always-on VPS (a laptop sleeps and its DB tunnel drops). The scripts must be deployed to the server first. Then schedule with PM2:

```bash
pm2 start npx --name daily-tick --no-autorestart --cron "30 0 * * *" \
  -- ts-node --project tsconfig.dev.json scripts/seeders/dailyTick.ts
pm2 save
```

`"30 0 * * *"` = every day at 00:30 (minute hour day-of-month month day-of-week; `*` = every). Confirm the server timezone (UTC vs IST) so "today's" rows land on the expected date.

---

## All commands at a glance

| Script | What it does | Writes? |
|---|---|---|
| `listBatches.ts` | List batch UUIDs (to find `--batch`) | No |
| `runSeed.ts --batch <id> --dry-run` | Preview the full seed | No |
| `runSeed.ts --batch <id>` | Seed the 12-student cohort | Yes |
| `runSeed.ts --batch <id> --clean` | Wipe seeded students, then re-seed | Yes |
| `cleanSeed.ts` / `--confirm` | Preview / delete seeded students | Only with `--confirm` |
| `dailyTick.ts --dry-run` / (none) | Preview / apply one day of activity | Only without `--dry-run` |
| `simulateDays.ts [--days N]` | Project streaks N days forward | No |

---

## How to add a new persona

Open `scripts/seeders/personas.ts` and add an entry to the `PERSONAS` array. Each persona needs:

| Field | Description |
|---|---|
| `name` | Full name shown in the dashboard |
| `email` | Must end with `@seed.testcrack.dev` |
| `password` | Can be anything (not used — no Supabase auth) |
| `group` | `HIGH`, `MID`, `LOW`, or `EDGE` |
| `diagnosticBand` | Band scores for LISTENING, READING, WRITING, SPEAKING (0.0–9.0). Vary across skills for asymmetry/oscillation. |
| `targetBandOffset` | Added to max diagnostic band to set the student's goal (usually 1.0) |
| `accuracyRate` | 0–1 decimal, baseline drill accuracy (e.g. 0.75 = 75%) |
| `skillAccuracy` | *Optional.* Per-skill accuracy override `{ LISTENING, READING, WRITING, SPEAKING }` for asymmetric students (e.g. Anjali: strong L/R, weak W/S). Overrides `accuracyRate` per skill. |
| `drillCount` | Number of drill sessions to generate (8–10 for high, 3–5 for struggling) |
| `iaCount` | Number of completed IA sessions (Kiran gets +1 abandoned session automatically) |
| `momentumBase` | Momentum points stored on each IA session row |
| `momentumScore` | **Final `momentum_score` on the student.** Must be **≥ 100** for students who should NOT be flagged at-risk, **< 100** for at-risk students (dashboard threshold). |
| `dailyStreak` | `daily_streak` value. Use **> 0** for active students, **0** for at-risk (triggers "Streak broken"). |
| `atRisk` | `true` → student appears in the instructor at-risk list (low momentum + stale, 3+ day-old drills + streak 0). `false` → momentum ≥ 100, a drill dated today, and a positive streak, so they show zero risk flags. |
| `isDropout` | Set to `true` only for Kiran Das — creates an abandoned IN_PROGRESS IA + declining/abandoned drills |
| `isErratic` | Set to `true` for Lena Joseph — generates oscillating drill accuracy |

> **At-risk separation:** the instructor dashboard flags a student at-risk if `momentum_score < 100`, OR no drill activity for 3+ days, OR `daily_streak === 0` while inactive. To keep a high performer *out* of the list, give them `atRisk: false`, `momentumScore ≥ 100`, and `dailyStreak > 0`.

---

## Known limitations

- AI feedback text is static (from a lookup table), not real Gemini output. This is intentional — calling Gemini for 48 diagnostic records would be slow and expensive.
- Passwords set on the persona config are not used anywhere. These accounts bypass Supabase auth entirely. They exist only in the PostgreSQL database.
- The seeder does not seed mock test sessions (`mocksessions`). Add `seedMocks.ts` if needed.
