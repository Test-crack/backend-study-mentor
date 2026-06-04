# Student Feature Data Reference
## For Institute Owner & Tutor Dashboard Design

This document describes every student-facing feature, what data it produces, and what metrics are available to surface on the Institute Owner and Tutor dashboards.

---

## 1. Diagnostics (Baseline Assessment)

**What it is:** A one-time, four-skill assessment (Listening, Reading, Writing, Speaking) taken when a student first joins. It establishes their starting band scores and sub-skill breakdown.

**Data stored:**
- One `AssessmentHistory` row per skill (mode = `DIAGNOSTIC`)
- `band_score` (0–9) per skill
- Sub-scores JSON:
  - **Listening / Reading:** `{ correct_answers, total_questions, accuracy_percentage }`
  - **Writing:** `{ grammarScore, vocabularyScore, coherenceScore, taskResponseScore, word_count, feedback }`
  - **Speaking:** `{ fluencyScore, vocabularyScore, grammarScore, pronunciationScore, feedback }`
- Feeds initial values into `StudentCompetencyMatrix`
- Marks `institute_students.isDiagnosed = true` when all 4 skills complete

**Metrics for dashboards:**
| Metric | Use case |
|---|---|
| Baseline band per skill | Show where each student started vs. now |
| Baseline sub-skill scores | Identify cohort-wide weak areas at intake |
| isDiagnosed flag | % of batch that has completed onboarding |
| Diagnostic completion date | Days since joining vs. start of learning journey |

**Key insight for tutors:** Filter the class by "not yet diagnosed" — those students haven't started the learning loop at all.

---

## 2. Daily Drill (DCS — Daily Competency Score)

**What it is:** Students complete up to 3 free drills per day (+ 1 purchasable with momentum). Each drill targets one `(skill, sub_skill)` pair with 5 questions. The Daily Competency Score (DCS) is the percentage of correct answers across all drills that day.

**Data stored (`DrillSession` table, one row per completed drill):**
- `skill`, `sub_skill`
- `correct_answers` / `total_questions` (always 5)
- `momentum_earned` (15 base + 10 per correct answer)
- `status`: STARTED → DRILL_DONE → APPLY_DONE
- `is_extra_session` (student paid 300 momentum for 4th drill)
- `reflection_text` (+25 momentum bonus if submitted)
- `created_at` (TIMESTAMPTZ, used for daily grouping in IST)

**Computed metrics:**
- **DCS today:** `(total correct today / total questions today) × 100` (0–100%)
- **Average DCS (lifetime):** Mean across all sub-skills' aggregated accuracy
- **Drills completed today:** 0–4

**Gate logic (critical for tutor visibility):**
- `dashboard_unlocked` = `drills_completed_today ≥ 2`
- IA eligibility requires `avg_dcs ≥ 40%`
- Extra drill requires `daily_dcs ≥ 40%` AND `momentum_score ≥ 300`

**`GET /api/student/daily-drill-state` returns:**
```
drills_completed_today, daily_dcs, dashboard_unlocked, next_action,
momentum_score, daily_streak, sessions_remaining, extra_sessions_today
```

**Metrics for dashboards:**
| Metric | Use case |
|---|---|
| DCS per student today | Who is on track vs. who hasn't drilled |
| Avg DCS over time | Learning velocity per student |
| Drills by sub-skill (aggregated) | Which sub-skills are being practised most/least per batch |
| `dashboard_unlocked` flag | How many students unlocked the platform today |
| DCS trend (7-day / 30-day) | Identify students plateauing or declining |
| next_action breakdown | Distribution of where batch is in the daily loop |

---

## 3. LexiGrid (Daily Vocabulary Game)

**What it is:** A daily word-matching game. Students solve 5 vocabulary words. Completing within 2 attempts per word earns a bonus.

**Data stored (`StudentGameScore`, one row per student per day):**
- `words_solved` (0–5)
- `total_attempts`
- `bonus_eligible` (all 5 solved ≤ 2 tries each)
- `momentum_earned` (15 per word + 5 if bonus)
- `completed` boolean
- `session_date` (IST calendar date)

**Metrics for dashboards:**
| Metric | Use case |
|---|---|
| Completion rate per day | % of batch that played LexiGrid today |
| Average words solved | Vocabulary breadth signal per cohort |
| Bonus rate | % achieving full accuracy — top performers |
| Momentum from LexiGrid | Contribution to overall momentum score |

**Note:** LexiGrid is the "gate-opener" in the daily loop — the dashboard only fully unlocks after Drill 1 + LexiGrid. Tracking LexiGrid completion rate shows how engaged the batch is with the daily habit.

---

## 4. Daily Streak

**What it is:** A consecutive-days counter that increments each day the student completes ≥ 2 drills. Resets if more than 1 IST day passes without qualifying.

**Data stored (`institute_students`):**
- `daily_streak` (integer)
- `last_streak_date` (IST calendar date of last qualifying drill day)

**Validation on read:** `getValidatedStreak()` checks if `last_streak_date ≥ yesterday IST`. If stale (gap > 1 day), resets to 0.

**Metrics for dashboards:**
| Metric | Use case |
|---|---|
| Current streak per student | Engagement & habit formation indicator |
| Distribution: 0 / 1–6 / 7+ day streaks | Cohort health at a glance |
| Students with streak = 0 | At-risk / disengaged list |
| Longest streak achieved | Gamification leaderboard |
| Batch average streak | Overall batch engagement KPI |

---

## 5. Momentum Score

**What it is:** A cumulative points score. Acts as currency (for extra drills, earned mocks) and as a performance signal.

**Data stored (`institute_students.momentum_score`):** Single integer, never negative (clamped to 0).

**Earned from:**
| Source | Points |
|---|---|
| Per drill (base) | 15 |
| Per correct drill answer | +10 |
| Reflection submitted | +25 |
| Apply drill completed | +30 |
| LexiGrid: per word solved | +15 |
| LexiGrid bonus (all 5 perfect) | +5 |
| IA completion (base) | +100 |
| IA improved vs. last band | +25 per sub-skill |
| IA personal best | +50 per sub-skill |
| Mock completion (band ≥ 6.0) | +150 |
| Mock completion (band < 6.0) | +100 |

**Deducted for:**
| Source | Points |
|---|---|
| Extra drill purchase | −300 |
| Missed IA (per session) | −20 |

**Metrics for dashboards:**
| Metric | Use case |
|---|---|
| Total momentum per student | Overall engagement composite score |
| Momentum distribution per batch | Identify high vs. low performers |
| Momentum trend over time | Is the student accelerating or stalling? |
| Momentum from IA vs. drills | Which activity is driving engagement |
| Students with momentum < 100 | Low engagement signal |

---

## 6. Internal Assessment (IA)

**What it is:** A biweekly (every 3 days from first drill) 40-minute test. Two sub-skills are assessed per session. Questions are adaptive (difficulty based on current band score). The system auto-detects missed IAs and applies penalties.

**Schedule logic:** `first_drill_date + (N × 3 days)` for N = 1, 2, 3…

**Data stored (`IASession`, one per scheduled date):**
- `ia_number`, `ia_date`, `status` (PENDING / IN_PROGRESS / COMPLETED / MISSED)
- `selected_subskills`: which 2 sub-skills were tested
- `carry_forward_subskills`: sub-skills from most recent MISSED session
- `scores`: `SectionScore[]` — band, correct/total, ai_graded flag, ai_feedback
- `momentum_awarded` (positive on COMPLETED, −20 on MISSED)
- `time_started_at`, `time_submitted_at`, `window_closes_at`

**Eligibility prerequisites:**
- ≥ 6 drills completed (lifetime)
- ≥ 2 days since first drill
- `avg_dcs ≥ 40%`
- Today must be a scheduled IA day

**Sub-skill selection logic (carry-forward + uniqueness):**
- Missed sub-skills get priority in the next IA
- Sub-skills tested in the last 14 days via COMPLETED sessions are excluded
- Ensures variety and targets weak areas

**`GET /api/student/ia-history` returns (per session):**
```
id, ia_number, ia_date, status, time_submitted_at, scores[], momentum_awarded,
carry_forward_subskills
```

**`GET /api/ia/status` returns:**
```
missed_count, penalties_applied, has_schedule, prerequisites_met, avg_dcs,
is_ia_day, can_start_test, current_ia_number, next_ia, upcoming_ias,
progress.drills_completed, progress.cond_drills, progress.cond_days, progress.cond_dcs
```

**Metrics for dashboards:**
| Metric | Use case |
|---|---|
| IAs completed vs. scheduled per student | Participation rate |
| Missed IA count | At-risk indicator; compounding momentum loss |
| Band score per sub-skill over IA history | Learning progression graph |
| Average band per IA (batch level) | Cohort performance trend |
| IA completion rate per batch | Which batches are most active |
| Sub-skills most frequently tested | Coverage gaps |
| Sub-skills with declining band | Who needs intervention |
| AI graded flag | Which students are answering writing/speaking prompts |
| Prerequisites met % | How many students are eligible but haven't started |

---

## 7. Mock Tests

**What it is:** A full IELTS simulation (all 4 skills). One standard mock available per calendar month. Students can unlock additional "Earned" mocks with 1,500 momentum (requires ≥4 completed IAs and ≥14 days of study).

**Data stored (`mocksessions`, one per attempt):**
- `month_year` (YYYY-MM), `attempt_type` (STANDARD / EARNED)
- `status` (PENDING / IN_PROGRESS / COMPLETED / ABANDONED)
- `scores`: `MockSkillScore[]` — band per skill with nested `sub_skill_scores[]`
  - Each sub-skill includes: `band`, `ai_band`, `correct`, `total_mcq`, `ai_feedback`
- `real_band_score`: overall IELTS band (0–9, rounded to nearest 0.5)
- `momentum_awarded`
- `time_started_at`, `time_submitted_at`, `window_closes_at` (72h from creation)

**`GET /api/student/mock-history` returns (per session):**
```
id, month_year, attempt_type, time_submitted_at, scores[], real_band_score, momentum_awarded
```

**Metrics for dashboards:**
| Metric | Use case |
|---|---|
| Real band score per mock | Simulated IELTS readiness over time |
| Band score per skill per mock | Skill-level progression |
| Mock attempts per student | Effort signal |
| Standard vs. Earned ratio | Identifies high-motivation students |
| Batch average real band score | Institute-level performance KPI |
| Band score trend (monthly) | Are students improving toward target? |
| Sub-skill AI scores | Granular speaking/writing quality signal |
| students with real_band ≥ target_band | Goal achievement rate |

---

## 8. Band Score / Competency Matrix

**What it is:** A live snapshot of each student's IELTS readiness, updated after every IA or Mock using weighted smoothing (40% old score, 60% new score, capped at ±2 per update).

**Data stored (`StudentCompetencyMatrix`, 4 rows per student — one per skill):**
- `band_score` (latest overall band for this skill)
- `sub_scores` JSON (per skill):
  - Writing: `grammarScore, vocabularyScore, coherenceScore, taskResponseScore`
  - Speaking: `grammarScore, vocabularyScore, fluencyScore, pronunciationScore`
  - Listening/Reading: skill-level only (no sub-scores)
- `assessments_count` (how many times updated)
- `last_updated`

**`GET /api/student/competency-scores` returns:**
```
data: StudentCompetencyMatrix[],
target_band, current_band (mean across skills, rounded to 0.5),
momentum_score, daily_streak
```

**`current_band` formula:**
```
mean of non-zero band_scores across all 4 skills → round to nearest 0.5
```

**Metrics for dashboards:**
| Metric | Use case |
|---|---|
| `current_band` per student | Live IELTS readiness score |
| `target_band` vs. `current_band` gap | Distance to goal per student |
| Band per skill (L/R/W/S) | Identify skill imbalances |
| Sub-skill scores (Grammar, Vocabulary, etc.) | Granular weakness identification |
| `assessments_count` | How much assessment data underpins the score |
| Cohort average `current_band` | Institute performance vs. target band |
| Distribution: below / at / above target | Goal achievement segmentation |
| Students where last_updated > 14 days ago | Stale data — student hasn't taken IA/Mock recently |

---

## 9. Speaking Practice (Separate from IA)

**What it is:** Standalone IELTS speaking practice sessions. Students record their answers to speaking prompts; AI grades fluency, WPM, keywords, and filler words.

**Data stored (`IeltsSpeakingAssessment`):**
- `topicId`, `band` (level)
- `fluencyScore`, `weightedWpm`
- `keywordsHit / totalKeywords`
- `pass1Data`, `pass2Data` (filler word counts per pass)
- `createdAt`

**`GET /api/student/speaking-history` returns (per session):**
```
topicTitle, bandLevel, fluencyScore, weightedWpm, keywordsHit, totalKeywords,
frequentFillers (top 3 filler words with counts), pass1Data, pass2Data, createdAt
```

**Metrics for dashboards:**
| Metric | Use case |
|---|---|
| Fluency score trend | Speaking improvement over time |
| WPM over sessions | Delivery confidence signal |
| Keyword hit rate | Content accuracy and topic knowledge |
| Top filler words | Coaching target for tutors |
| Session frequency | Student self-practice effort |

---

## 10. Missed IA Tracking (Auto-Detection)

**What it is:** The system automatically detects and records missed IAs on every dashboard load — including sessions that were never created (student didn't log in that day). Each miss applies a −20 momentum penalty.

**Detection cases:**
1. `PENDING` session with past `ia_date` → MISSED
2. `IN_PROGRESS` session with answers → auto-graded → COMPLETED (no penalty)
3. `IN_PROGRESS` session with no answers → MISSED
4. Scheduled IA date with no session row → retroactive MISSED row created

**Data produced:**
- `IASession.status = MISSED`, `momentum_awarded = -20`
- `carry_forward_subskills` set for next IA prioritisation
- Returned in `getPendingNotifications()` as `IA_MISSED` notifications (last 7 days, max 3)

**Metrics for dashboards:**
| Metric | Use case |
|---|---|
| Total missed IAs per student | Engagement red flag |
| Consecutive miss streak | Intervention trigger |
| Missed IAs this month | Batch attendance report |
| Students with ≥ 2 misses | Batch-level at-risk list |
| Carry-forward sub-skills | Shows which skills are never getting tested |

---

## Cross-Feature Data Flow (for dashboard designers)

```
First Drill
    ↓
Diagnostic (baseline band scores set)
    ↓
Daily Loop: Drill → LexiGrid → Drill 2 → (optional Drill 3/4)
    ↓
DCS unlocks dashboard when ≥2 drills done
    ↓  (every 3 days from first drill)
Internal Assessment (IA) — 2 sub-skills tested, band scores updated
    ↓
Competency Matrix updated (weighted smoothing)
    ↓  (monthly)
Mock Test — all 4 skills, real IELTS band score
    ↓
Target Band gap closes over time
```

---

## API Quick-Reference for Dashboard Queries

All endpoints require `Authorization: Bearer <supabase_jwt>`.

For institute owner / tutor dashboards, these will be called with the student's ID (not the logged-in user's token), via new admin-scoped endpoints to be built:

| Endpoint | Purpose |
|---|---|
| `GET /api/student/competency-scores` | Current band, momentum, streak |
| `GET /api/student/diagnostic-report` | Baseline diagnostic per skill |
| `GET /api/student/ia-history` | All IA sessions with scores and momentum |
| `GET /api/student/mock-history` | All mock sessions with real band scores |
| `GET /api/student/assessment-history` | Combined IA + Mock entries |
| `GET /api/student/daily-drill-state` | Today's drill progress, DCS, next action |
| `GET /api/student/speaking-history` | Speaking fluency sessions |
| `GET /api/student/pending-notifications` | Active IA/Mock alerts |
| `GET /api/ia/status` | IA schedule, eligibility, next IA date |
| `GET /api/student/recommendations` | AI-matched learning resources |

---

## Suggested Tutor Dashboard Widgets

Based on the data available, here are the widgets that would be most useful:

### Per-Student View
- **Band Score Radar Chart** — Listening / Reading / Writing / Speaking vs. target
- **Current Band vs. Target Band** — gap indicator with trend arrow
- **IA Timeline** — strip of IA #1, #2, #3… colored by COMPLETED / MISSED / PENDING
- **DCS Sparkline** — 7-day DCS trend
- **Daily Streak + Momentum** — engagement indicators
- **Sub-skill Heatmap** — which sub-skills are strong / weak from IA history
- **Next IA Date + Eligibility Status** — is the student on track?
- **Speaking WPM + Filler Trend** — coaching signal

### Batch Overview (Tutor)
- **Batch DCS Distribution** today — bar chart of DCS buckets
- **Drills Completed Today** — who has and hasn't logged in
- **IA Participation Rate** — % completed vs. missed this period
- **Average Current Band** — batch-level IELTS readiness
- **At-Risk Students** — filter: streak = 0, missed ≥ 2 IAs, band declining
- **Top Performers** — streak ≥ 7, band ≥ target

### Institute Owner View
- **Cohort Progress Over Time** — avg band score per month across all batches
- **Batch vs. Batch Comparison** — which batches are performing better
- **Diagnostic → Current Band Improvement** — institute-level outcome
- **IA Completion Rate** — across all students, trending
- **Engagement Health** — % with streak > 0, avg daily drills, DCS distribution
- **Goal Achievement** — % of students who have hit or exceeded target band

---

## Key Flags to Surface (At-Risk Signals)

| Flag | Data source | Threshold |
|---|---|---|
| Not diagnosed | `isDiagnosed = false` | Any |
| Dashboard never unlocked | `daily_dcs = 0` consistently | 3+ days |
| Missed IAs | `IASession.status = MISSED` | ≥ 2 consecutive |
| Streak broken | `daily_streak = 0` | After having streak |
| Band declining | `current_band` trend | Negative for 2+ IAs |
| Not eligible for IA | `prerequisites_met = false` | After 2 weeks enrollment |
| Momentum collapsing | `momentum_score < 100` | Any |
| Last assessment > 14 days | `competency_matrix.last_updated` | > 14 days ago |
