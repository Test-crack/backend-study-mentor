# Student Lifecycle — Complete Platform Guide

**Audience:** Code review & testing team.
**Purpose:** This document describes every feature available to a student, how each behaves, and what the expected outcomes are — from the moment a student is invited to the platform through their entire daily learning journey. No prior knowledge of the platform is assumed. All numbers, formulas, and rules in this document are taken directly from the implemented system.

---

## 1. How a Student Joins the Platform

**A student can never sign up on their own.** There is no public registration. The only way a student account comes into existence is when an **institute** (the paying customer — a coaching center) adds them.

The flow:

1. An institute admin opens their dashboard and enters the student's **full name** and **email address**.
2. The platform immediately creates the student's account internally and marks them as enrolled in that institute.
3. The student receives an **invitation email**. Clicking the link lets them set a password, after which they land on the login page.
4. On first login, the student's account is automatically linked and activated — no extra steps needed.

**Rules to verify:**

- A student belongs to **exactly one institute**. If Institute A has enrolled a student, Institute B cannot add the same email — the attempt is rejected with a clear message ("already enrolled at another institute").
- The institute controls the student's profile: it can deactivate/reactivate the student and remove them entirely. A removed student keeps their login account but loses all institute access.
- If the same email already belongs to a tutor/admin account, enrollment is rejected ("email linked with a non-student account").
- Adding the same student twice to the same institute is rejected ("already enrolled in your institute").
- The invite email may occasionally already exist in the auth system (e.g., re-invite) — this is handled gracefully; the student is still enrolled.

---

## 2. The Diagnostic Test (One-Time, Mandatory)

After the first login, the student cannot see the dashboard. They are locked into the **Diagnostic Test** — a one-time baseline assessment that measures their current IELTS level. Everything the platform later personalizes (drills, assessments) starts from these scores.

### 2.1 Structure

Four sections, taken in sequence, one per IELTS skill:

| Section | Format | Question Count |
|---|---|---|
| Listening | Multiple choice, one audio clip | 6 questions |
| Reading | True/False/Not Given, one passage (~300 words) | 4 questions |
| Writing | One essay prompt (free text) | 1 prompt |
| Speaking | Spoken response, recorded (max ~90 seconds) | 1–3 prompts |

### 2.2 Difficulty Level

The questions the student sees depend on the **target band** they choose during onboarding:

- Target band **≤ 5.5** → Level A (foundation)
- Target band **between 5.5 and 7.0** → Level B (intermediate)
- Target band **≥ 7.0** → Level C (advanced)

### 2.3 Grading — How Each Section Is Scored

This is the most important part to verify.

**Listening & Reading (objective):**
- Band = (correct answers ÷ total questions) × 9, rounded to the nearest 0.5, capped at 9.0.
- Example: 5 of 6 listening correct → 7.5 band. 3 of 4 reading correct → 6.75 → rounds to **6.5**.

**Writing (AI-graded):**
- Graded by an AI model against the four official IELTS criteria: Task Achievement, Coherence & Cohesion, Lexical Resource, Grammatical Range & Accuracy.
- Final band = average of the four criteria scores, rounded to the nearest 0.5.
- **Anti-gaming rules** (verify these):
  - Fewer than 10 words → band 0.
  - Under the minimum word count (150 for Task 1 / 250 for Task 2) → Task Achievement capped at 5.0.
  - Off-topic or memorized template → capped at 2.0.
  - Copy-paste into the answer box is blocked.

**Speaking (AI-graded with hard safety caps):**
- The recording is transcribed and graded by AI on: Fluency & Coherence, Lexical Resource, Grammar, Pronunciation. Band = average of the four, rounded to 0.5.
- **Hard caps applied after AI grading** — these cannot be bypassed regardless of what the AI says:
  - Empty / noise-only / inaudible recording → 1.0 (and the student is asked to re-record).
  - Mumbling with fewer than 4 meaningful words → 1.5 max.
  - Off-topic answer → 2.0 max.
  - Very short answer (4–14 meaningful words) → 3.0 max.
- A recording smaller than 5 KB is rejected instantly as empty, without wasting an AI call.

**If AI grading fails** (network error, model outage): the student sees a retry prompt. **No score is saved and no fallback grade is assigned** — the section stays incomplete until a successful attempt.

### 2.4 Save & Resume

- Each of the 4 sections is **saved independently the moment it is scored**. A student can complete Listening today and Reading tomorrow.
- In-progress answers within a section (selected options, essay text, timer) survive a page refresh or browser close — the student returns exactly where they left off.
- Once a section is submitted and scored, it can never be re-entered.

### 2.5 Completion

- When **all four skills have a score**, the student is marked as *diagnosed* and the dashboard unlocks automatically.
- A summary screen shows the four band scores and the overall average.
- **The diagnostic can never be retaken.** There is no retake button and no API to reset it.

---

## 3. The Daily Loop (Every Day After Diagnosis)

This is the core habit engine of the platform. Every day (IST calendar day), the dashboard starts **locked**, and the student must earn access by completing a fixed sequence:

```
Day starts (IST midnight)
   │
   ▼
Drill 1  ──►  LexiGrid (word game — play it OR skip for 150 momentum)
   │                         │
   ▼                         ▼
              Drill 2  ──►  DASHBOARD UNLOCKS + streak +1
                              │
                              ▼
              Drill 3 (optional) ──► Extra Drill (optional, costs 300 momentum)
```

### 3.1 Drills

A **drill** is a 5-question MCQ session focused on one specific sub-skill.

**How the sub-skill is chosen** — the system targets the student's weakest areas without repeating the same one endlessly:
- Every (skill, sub-skill) pair the student has drilled is ranked by a *weakness score* = 60% weight on recent drill accuracy + 40% weight on current band. The weakest ranks first.
- Selection alternates across skills (round-robin) so the student doesn't get e.g. Writing/Grammar five times in a row.
- Brand-new students with no history default to Writing/Grammar and Speaking/Vocabulary.

**Daily limits:**
- 3 free drills per day, plus a maximum of 1 purchased extra = **4 per day absolute cap**.
- The extra (4th) drill must be purchased with **300 momentum points**, and is only offered if the student's **daily accuracy is ≥ 40%** — a low-performing student can't grind points.

**Momentum earned per drill:** 15 base + 10 per correct answer (max 65 for a perfect 5/5).
Additional awards: +25 for writing a reflection after the drill, +30 for completing the "Apply" stage.

### 3.2 LexiGrid (Word Game Gate)

After Drill 1, the student must pass through **LexiGrid**, a gamified vocabulary puzzle:

- 5 words per session. Each solved word = 15 momentum; solving **all 5, each within two attempts**, earns a +5 bonus (max 80 per day).
- **Momentum is only awarded for the first (gate) session of the day.** The student can replay LexiGrid any number of times in standalone mode for practice, but replays never award momentum (scores are protected by a server-signed session token, so inflated scores from a tampered client are rejected).
- **Skip option:** the student can skip the gate entirely by spending **150 momentum points**. Skipping marks the gate as passed (recorded distinctly as "skipped" in data — 0 words, 0 momentum earned) and unlocks Drill 2. Skipping twice in a day is impossible — a second attempt is recognized and no second deduction happens.
- A student who cannot afford 150 points simply cannot skip — the request is rejected server-side even if the button is somehow enabled.

### 3.3 Dashboard Unlock & Streak

- The dashboard unlocks the moment the **2nd drill of the day is completed**.
- At that same moment, the **daily streak** updates: if the student also completed the loop yesterday, streak +1; if yesterday was missed, streak resets and restarts at 1.
- The streak resets to 0 automatically whenever a day is skipped (checked on every page load).

### 3.4 Band Scores (What the Student Sees on the Dashboard)

- Four skill-level bands: Listening, Reading, Writing, Speaking (0–9 scale, 0.5 steps).
- Writing and Speaking each break down into 4 sub-skills:
  - Writing: Grammar, Vocabulary, Coherence, Task Response
  - Speaking: Grammar, Vocabulary, Fluency, Pronunciation
- The student's **current band** shown in the UI is the average of all skill bands, rounded to 0.5.
- **Band scores never jump from a single event** — see the smoothing formula in §4.4 and §5.4.

---

## 4. Internal Assessment (IA) — Every 3 Days

The IA is a short, recurring checkpoint exam that formally measures improvement and updates band scores.

### 4.1 When an IA Becomes Available

- IAs are scheduled every 3 days, anchored to the student's **first drill date**: first drill + 3 days, +6, +9, and so on.
- Each IA is open for **one IST calendar day** (midnight to midnight).
- An IA cannot be started if fewer than 40 minutes remain before the window closes (prevents an 11:58 PM start).

### 4.2 Prerequisites (all must be met before the first IA unlocks)

1. At least **6 completed drills**
2. At least **2 calendar days** since the first drill
3. Average drill accuracy (DCS) of at least **40%**

### 4.3 Structure & Content

- **2 sections, 20 minutes each — 40 minutes total.**
- Each section tests one sub-skill, chosen by the same weakness logic as drills, with two refinements:
  - Sub-skills tested in the **last 14 days are excluded** (no immediate repeats).
  - If the student **missed** the previous IA, the sub-skills from that missed IA are carried forward with priority.
- Section content: Listening/Reading = 10 MCQs; Writing/Speaking = 8 MCQs + 2 free-response prompts.
- **Save & resume:** progress (answers, current section, section timer) is stored server-side. The student can close the browser and resume any time within the same day's window; the section timer continues from real elapsed time, not from where they paused.

### 4.4 Grading & Band Update (verify carefully)

- MCQs are auto-scored. Free-response prompts are AI-graded (same model and rubric family as the diagnostic; short/off-topic answers are capped: under-length → max band 4, off-topic → max 3).
- For Writing/Speaking sections that have both MCQs and AI-graded prompts, the AI grade is weighted **2×** and the MCQ grade **1×** when combining.
- **The new score never overwrites the old band directly.** Instead:

  > new band = 40% × old band + 60% × IA result, **capped at ±2 bands of movement**, rounded to 0.5

  This means a single spectacular (or disastrous) IA moves the band gradually. A brand-new sub-skill with no prior score adopts the IA result directly.

- **Momentum awards:** +100 for completing the IA, +25 per sub-skill that improved vs. the previous IA, +50 per sub-skill that set an all-time personal best. Maximum possible: 250.

### 4.5 Missed IA (important edge case)

If a scheduled IA day passes and the student didn't complete it:

- The IA is recorded as **MISSED** — even if the student never opened the IA page at all (the system creates the missed record retroactively).
- **Penalty: −20 momentum per missed IA**, never taking the balance below zero.
- The student sees which IAs were missed and the penalties applied.
- Detection is **not** a background job — it runs whenever the student next loads their IA status. So a student who disappears for a week sees all accumulated misses (and deductions) on return.

### 4.6 Abandoned-But-Answered IA (auto-submit)

If a student **starts** an IA, answers some questions, and forgets to submit:

- Once the window has passed, the system **auto-grades whatever was answered** the next time IA status is checked. The session becomes COMPLETED with real scores — **no miss penalty**.
- If the student opened the IA but answered **nothing**, it counts as MISSED with the −20 penalty.
- A late submit attempt after the window closes is rejected; the auto-grade path handles the answers instead.

---

## 5. Mock Test — Once a Month

The mock is a full-length simulated IELTS exam and the most authoritative input to the student's **real band score**.

### 5.1 Frequency & Slots

- **1 free mock per calendar month** (the "standard" slot), opening on the 1st.
- **1 additional mock per month** can be bought for **1500 momentum points** (the "earned" slot).
- Slots are enforced strictly: one standard + one earned per month, no exceptions. A used, expired, or abandoned slot is consumed for that month.

### 5.2 Eligibility

The free mock unlocks only when the student has genuinely progressed:
1. At least **6 completed IAs**,
2. IA coverage across **all four skills**,
3. At least one skill band improved **≥ 0.5** from the diagnostic baseline.

The paid (earned) mock additionally requires ≥ 1500 momentum, ≥ 4 completed IAs, and ≥ 14 days on the platform.

### 5.3 Structure & Timing

- **All 4 skills, 80 questions total** — Listening (20 MCQ), Reading (20 MCQ), Writing (16 MCQ + 4 prompts), Speaking (16 MCQ + 4 prompts). Writing and Speaking cover all 4 of their sub-skills.
- **3-hour global timer** — no per-section limits. The student can start any time; once started they have 3 hours of test time.
- **72-hour submission window** — the session stays resumable for up to 72 hours after starting. Answers save continuously; a browser crash loses nothing.
- If the 72-hour window passes without submission, the session is marked **ABANDONED**: the month's slot is consumed, but **no momentum penalty** is applied (unlike a missed IA).

### 5.4 Grading & Real Band Score Update (the critical formula)

- Listening/Reading: band = (correct ÷ 20) × 9, rounded to 0.5.
- Writing/Speaking: each of the 4 sub-skills is scored (MCQ 1× + AI-graded prompt 2×, same combination as IA), then the skill band = average of its 4 sub-skill bands.
- **Skill band update:** new band = **60% mock result + 40% existing band**, rounded to 0.5, clamped 0–9.
- **Real band score** (the headline number) = average of the four updated skill bands, rounded to 0.5.
- **Momentum:** +200 for completing a mock; if the real band score crosses a 0.5 boundary vs. before (e.g., 6.0 → 6.5), a **+500 bonus** applies (700 total).

---

## 6. Momentum — The Platform Currency (Quick Reference)

Momentum is earned by doing work and spent on conveniences. It can never go below 0.

| Action | Momentum |
|---|---|
| Complete a drill | +15 base, +10 per correct answer (max +65) |
| Drill reflection | +25 |
| Apply-stage completion | +30 |
| LexiGrid (first session of the day only) | +15 per word, +5 perfect bonus (max +80) |
| Complete an IA | +100 base, +25 per improved sub-skill, +50 per personal best |
| Complete a mock | +200; +500 bonus if overall band crosses a 0.5 threshold |
| **Skip LexiGrid gate** | **−150** |
| **Buy extra (4th) drill** | **−300** (requires ≥40% daily accuracy) |
| **Buy extra mock** | **−1500** |
| **Miss an IA** | **−20 per missed IA** |

---

## 7. Edge Cases & Expected Behaviors (Testing Checklist)

| # | Scenario | Expected behavior |
|---|---|---|
| 1 | Institute adds a student already at another institute | Rejected with a clear message; no partial data written |
| 2 | Admin double-clicks "Enroll" | Exactly one enrollment; second attempt gets a friendly duplicate message |
| 3 | Student closes browser mid-diagnostic | Resumes at the same section with answers intact |
| 4 | Speaking recording is silent or noise | Band capped at 1.0 and student prompted to re-record |
| 5 | AI grading service is down during Writing/Speaking submit | Student sees a retry prompt; nothing is saved; no fallback score |
| 6 | Student tries to open dashboard before finishing diagnostic | Redirected to the diagnostic |
| 7 | Student completes only 1 drill and tries the dashboard | Still locked; LexiGrid is the next required step |
| 8 | Student skips LexiGrid with exactly 150 momentum | Allowed (≥150 passes); balance goes to 0 |
| 9 | Student with 149 momentum clicks skip | Rejected server-side; no deduction |
| 10 | Skip request sent twice (double-tap / retry) | One deduction only; second call reports "already done" |
| 11 | Student replays LexiGrid after the daily gate | Playable, but no momentum awarded for replays |
| 12 | Student completes 2nd drill | Dashboard unlocks + streak increments at that exact moment |
| 13 | Student misses a full day | Streak reads 0 on next visit |
| 14 | Buying the 4th drill with <40% daily accuracy | Blocked regardless of momentum balance |
| 15 | IA day arrives but student has done only 5 drills | IA stays locked until all prerequisites are met |
| 16 | Student starts IA at 11:55 PM | Blocked — fewer than 40 minutes remain in the window |
| 17 | Student answers half an IA and never submits | Auto-graded from saved answers on next status check; counted as completed; no penalty |
| 18 | Student never opens a scheduled IA | Marked MISSED retroactively; −20 momentum; shown in messages |
| 19 | Student misses 3 IAs while away | All 3 marked missed on return; −60 total (floored at 0 balance) |
| 20 | An excellent IA result (e.g., +3 bands) | Band rises by at most 2 (smoothing cap), not the full jump |
| 21 | Student attempts a 2nd free mock in the same month | Rejected — slot already consumed |
| 22 | Mock started but never submitted within 72h | Marked ABANDONED; slot consumed; no momentum penalty |
| 23 | Mock submitted late but within the 72h window (past 3h timer) | Accepted — the 3-hour timer is a client-side pacing limit; 72h is the hard server limit |
| 24 | Real band crosses 6.0 → 6.5 via mock | +700 momentum (200 base + 500 threshold bonus) |
| 25 | All timers/dates | Computed on IST (Indian Standard Time) calendar days, not UTC |

---

## 8. Glossary

| Term | Meaning |
|---|---|
| **Band / Band Score** | IELTS proficiency scale, 0–9 in 0.5 steps |
| **Diagnostic** | One-time entry test that sets the student's baseline bands |
| **Drill** | 5-question daily practice session on one sub-skill |
| **LexiGrid** | Daily vocabulary puzzle gate between Drill 1 and Drill 2 |
| **Momentum** | Platform points currency — earned by activity, spent on skips/extras |
| **DCS** | Drill Composite Score — the student's average drill accuracy (%) |
| **Streak** | Consecutive days the student completed the 2-drill daily loop |
| **IA (Internal Assessment)** | 40-minute checkpoint exam every 3 days on the 2 weakest sub-skills |
| **Mock** | Full 4-skill simulated IELTS exam, once per month |
| **Real Band Score** | The student's headline band — updated only by IAs and mocks through weighted formulas, never directly |
| **Sub-skill** | A finer-grained competency within a skill (e.g., Writing → Coherence) |
