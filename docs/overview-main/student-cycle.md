# TestCrack — Student Lifecycle & Feature Behaviour Reference

> A complete, non-technical walkthrough of everything a student can do on the platform, and exactly how each feature is expected to behave.

**Prepared for:** Code Review & QA / Testing Team
**Author:** Sarthak
**Purpose:** Read this first. No prior knowledge of the platform is assumed. By the end you should understand every screen a student reaches, what unlocks it, and the exact rules a tester should verify.

---

## Contents

- [How to Read This Document](#how-to-read-this-document)
- [1. Getting an Account: Invite-Only](#1-getting-an-account-invite-only)
- [2. The Diagnostic Test (One-Time, Mandatory)](#2-the-diagnostic-test-one-time-mandatory)
- [3. The Daily Loop (What Happens Every Day)](#3-the-daily-loop-what-happens-every-day)
- [4. Drills](#4-drills)
- [5. LexiGrid](#5-lexigrid)
- [6. Band Scores: Skills & Sub-skills](#6-band-scores-skills--sub-skills)
- [7. Internal Assessment (IA)](#7-internal-assessment-ia)
- [8. Mock Test](#8-mock-test)
- [9. Missed Assessments & Auto-Submit (Critical Edge Cases)](#9-missed-assessments--auto-submit-critical-edge-cases)
- [10. Quick Reference: The Whole Journey](#10-quick-reference-the-whole-journey)

---

## How to Read This Document

The platform is an IELTS preparation system used by students who belong to a coaching institute. This document follows a single student from the moment their account is created through their entire day-to-day usage, describing each feature in the order the student actually encounters it.

Two kinds of information appear throughout. **Behaviour** describes what the student sees and what the system does. **> Tester's note** blocks highlight the exact rules, thresholds, and edge cases that should be verified during testing. When a note gives a number (e.g. a threshold or a time limit), that number is the intended, authoritative value.

> **Key terms used everywhere**
>
> - **Skill** — one of the four IELTS skills: Listening, Reading, Writing, Speaking (often abbreviated L, R, W, S).
> - **Sub-skill** — a finer competency inside a skill. There are 10 in total: Listening has one (Listening); Reading has one (Reading); Writing has four (Coherence, Grammar, Vocabulary, Task Response); Speaking has four (Pronunciation, Fluency, Grammar, Vocabulary).
> - **Band score** — the standard IELTS 0–9 scale (in 0.5 steps). The platform tracks a band per skill and per sub-skill, and one overall "real band score" for the student.
> - **Momentum** — an in-app points balance the student earns by practising. It is both a motivation signal and a currency used to unlock a few optional things. It never goes below zero.
> - **Streak** — a count of consecutive days the student has completed their required daily activity.

---

## 1. Getting an Account: Invite-Only

Students cannot sign up on their own. There is no public "create account" option for students. **A student account exists only because an institute created it.**

**How it works**

1. The institute (the student's coaching centre) adds the student and sends an invitation.
2. The student receives an email invitation.
3. The student follows the invite and logs in for the first time. Their profile and access are owned and controlled by the institute — the institute can manage the student's participation.

> **Tester's note**
> - A student attempting to self-register or self-signup should not be able to create a usable student account.
> - Access to a student's data is scoped to the institute that owns them. A student belonging to Institute A must never be visible to, or reachable by, Institute B.
> - First-time login should route the student into onboarding (the Diagnostic), not the main dashboard.

---

## 2. The Diagnostic Test (One-Time, Mandatory)

Immediately after first login the student must take a **Diagnostic Test**. Its purpose is to measure the student's current IELTS standing across all four skills, so the platform knows their starting level and where they are weakest. **It is taken exactly once per student, ever.** Until it is finished, the student cannot reach the dashboard or any daily feature.

### Structure — four sections, saved independently

The Diagnostic has four sections, one per skill (Listening, Reading, Writing, Speaking). Each section is saved to the student's state on its own, so the student can complete one section, leave, and return later to continue where they left off. The Diagnostic is only "complete" once all four sections have been submitted.

### Question types per section

| Section | Format | What the student does |
|---|---|---|
| Listening | MCQ | Answers multiple-choice questions. |
| Reading | MCQ | Answers multiple-choice questions. |
| Writing | Prompt | Is given a writing topic and writes a response (with a minimum word count). |
| Speaking | Prompt | Is given a speaking prompt and records a spoken response (audio). |

### Grading mechanism (verify explicitly)

Grading differs by section, because the answer types differ. This is one of the most important areas to test.

| Section | How it is graded | Band produced |
|---|---|---|
| Listening & Reading | Automatically scored by correct answers. The band is the proportion correct scaled onto the 0–9 band scale (i.e. correct ÷ total, mapped to a 0–9 band). | 0–9, rounded to nearest 0.5 |
| Writing | The written response is graded by AI against the given topic, producing a band plus sub-scores/feedback. | 0–9, rounded to nearest 0.5 |
| Speaking | The recorded audio is transcribed, then the transcript is graded by AI against the prompt. | 0–9, rounded to nearest 0.5 |

> **Tester's note**
> - Every section's band must end up on the 0–9 scale, rounded to the nearest 0.5, and never above 9.0 or below 0.
> - Each section must save independently: complete Listening, leave the app, return — Listening should still be recorded and only the remaining sections should be pending.
> - The Diagnostic flips the student to "diagnosed" **only after all four sections are complete**. At that moment, and not before, dashboard access is granted.
> - Because Speaking depends on audio transcription then AI grading, verify the accuracy path: a real spoken answer should transcribe and grade sensibly; an empty or failed recording should not silently produce a passing band.
> - The Diagnostic must be genuinely one-time — a diagnosed student should have no way to retake it.

---

## 3. The Daily Loop (What Happens Every Day)

Once diagnosed, the student enters the normal daily rhythm. Each day, **the dashboard starts locked** and the student must complete a short required sequence to unlock it. This is deliberate: it guarantees the student practises before they browse their stats.

### The required daily sequence

1. **Complete the first Drill.** A Drill is a short set of MCQs targeted at one sub-skill (details in Section 4).
2. **Play LexiGrid.** A gamified word-learning activity. This step can be skipped by spending momentum (details in Section 5).
3. **Complete a second Drill.** One more Drill is required after LexiGrid.
4. **Dashboard unlocks**, and the daily streak increases by 1.

> **Tester's note**
> - The dashboard must remain locked until the full sequence (Drill → LexiGrid → Drill) is done. Skipping ahead should not be possible.
> - Completing the sequence must increment the daily streak by exactly 1 for that day, and only once per day.
> - If the student misses a day, the streak should reset according to the streak rules (a broken chain does not keep counting).

---

## 4. Drills

A Drill is a short practice set of multiple-choice questions focused on a single sub-skill. Drills are the core daily practice unit and the main way a student earns momentum.

### Which sub-skill a Drill targets (round-robin on weakness)

The system chooses the sub-skill the student is currently weakest at, but rotates so the same sub-skill is not served repeatedly. The effect: drills keep pushing the student's weak areas while spreading practice across sub-skills rather than hammering one.

### Daily limits and momentum

| Rule | Behaviour |
|---|---|
| Drills per day | A limited number of drills per day (a small daily cap, including a purchasable extra). The student cannot drill unlimited times in one day. |
| Momentum for drills | Momentum is earned for completing a drill, scaled by how many answers were correct. This is the student's primary momentum source. |
| Extra drill | Beyond the free daily drills, one additional drill can be unlocked by spending momentum (a paid "extra"). |
| Repeat protection | Re-submitting the same drill (same skill + sub-skill) should not re-award momentum a second time. |

> **Tester's note**
> - Verify the daily drill cap holds: after the day's allowed drills are used, further free drills should be refused with a clear "come back tomorrow" style message.
> - Momentum should be awarded once per genuine drill completion and scale with correct answers; a duplicate submission of the same drill should award zero additional momentum.
> - Spending momentum for an extra drill should deduct the correct amount and never allow the balance to go negative.
> - Sub-skill selection should visibly rotate — the same sub-skill should not be served every single time.

---

## 5. LexiGrid

LexiGrid is a gamified vocabulary-learning feature that sits in the middle of the daily sequence, between the two required drills. It teaches word pairs in a game format.

| Rule | Behaviour |
|---|---|
| Play count | The student may play LexiGrid any number of times per day — there is no daily cap like drills have. |
| Momentum | Momentum is awarded only for the first LexiGrid play of the day. Additional plays are allowed but do not earn more momentum. |
| Skippable | The LexiGrid step in the daily sequence can be skipped by spending momentum, letting the student move straight to the second drill. |

> **Tester's note**
> - First play of the day earns momentum; second and later plays the same day earn none — verify the boundary.
> - Skipping LexiGrid with momentum should deduct momentum and advance the daily sequence; if the student lacks enough momentum, the skip should be refused.

---

## 6. Band Scores: Skills & Sub-skills

Once on the dashboard, the student can see their band scores. The platform maintains bands at two levels of detail:

- **Four skill bands** — one each for Listening, Reading, Writing, Speaking.
- **Ten sub-skill bands** — the finer breakdown listed in the key terms.

These bands start from the Diagnostic and are then updated over time by the two assessment features — Internal Assessment and Mock Test. Importantly, bands are **never overwritten by a single new result**; they move gradually using a weighted formula (explained in Sections 7 and 8), so one unusually good or bad session does not swing a band wildly.

---

## 7. Internal Assessment (IA)

The Internal Assessment is a periodic mini-exam that happens **once every 3 days**. It re-measures two of the student's sub-skills and updates their real band score. It is the main engine that keeps the student's bands current between the bigger monthly Mock Tests.

### When it becomes available (prerequisites)

An IA does not appear immediately. Several conditions must be met before the student can start one:

| Prerequisite | Requirement |
|---|---|
| Drills completed | At least 6 drills completed in total. |
| Days since starting | At least 2 calendar days since the student's first drill. |
| DCS score | An average "Daily Consistency" style score of at least 40% — this gates the actual Start button on an IA day. |
| Schedule (the IA day) | IAs are scheduled at first drill + 3 days, + 6 days, + 9 days, and so on. The Start option is only offered on an actual scheduled IA day. |

*So a student can start an IA only when: it is a scheduled IA day, the drill/day prerequisites are met, and the DCS threshold is met.*

### Which two sub-skills it tests

The IA picks two sub-skills using a weakness-based logic that also ensures the student has drilled that sub-skill enough for improvement to be meaningful — it prioritises weak areas the student has actually been practising, rather than testing something untouched.

### Format and timing

| Aspect | Behaviour |
|---|---|
| Sections | Two sections (one per selected sub-skill). |
| Time | 20 minutes per section, so 40 minutes total. |
| Save state | The IA saves progress consistently — the student can resume an in-progress IA rather than losing work. |
| Grading | Writing and Speaking parts are graded by AI; Listening and Reading parts are multiple-choice and auto-scored. |

### How the IA updates the band score (formula, not overwrite)

The IA does **not** replace a sub-skill band with the new result. It blends the two using a weighted formula:

```
new band = (0.4 × old band) + (0.6 × new IA result)
```

The new result is weighted more heavily (60%) than the existing band (40%), so bands move toward recent performance but are cushioned against one-off swings. The result is clamped to the 0–9 range and rounded to the nearest 0.5.

### Momentum for completing an IA

Completing an IA awards momentum: a participation reward, plus bonuses for improving a sub-skill and for setting a personal best. The exact amounts are internal, but the principle to verify is that completion is rewarded and improvement is rewarded more.

> **Tester's note**
> - Before prerequisites are met, the IA must not be startable, and the not-eligible screen should show the student exactly which conditions are outstanding (drills, days, DCS).
> - IAs should appear on the correct schedule: first drill + 3, + 6, + 9 days, etc.
> - If too little time remains in the day's IA window to finish, starting a new IA should be blocked with a clear message rather than starting a test the student can't complete.
> - Confirm the band-update uses the 40/60 weighting and does not directly overwrite the old band.
> - An in-progress IA should resume with prior answers intact, not restart from the beginning.

---

## 8. Mock Test

The Mock Test is a full-length IELTS simulation. It is the largest assessment and the strongest update to the student's real band score. It is available **once per month**.

### Free vs. earned mock

| Type | Behaviour |
|---|---|
| Standard (free) mock | One free mock per calendar month. |
| Earned (extra) mock | A second mock in the same month can be unlocked by spending momentum — but only if additional eligibility is met (enough momentum, enough IAs completed, and enough days on the platform). It is not simply "pay and go." |

### Timing: a 3-hour test inside a 72-hour window

There are two separate clocks, and testers should not confuse them:

| Clock | Meaning |
|---|---|
| 3-hour test timer | The actual test is 3 hours long. This is a single global timer for the whole mock, not a per-section reset. |
| 72-hour window | From the moment the mock is started, the student has a 72-hour window in which the session stays valid. This lets the student begin the mock and finish it at a convenient time. |

### Grading and how it updates the real band score

The mock covers all four skills (Listening, Reading, Writing, Speaking). Listening and Reading are auto-scored from correct answers; Writing and Speaking are AI-graded. Each skill's band is built up from its sub-skill results, and — as with the IA — the student's stored bands are updated with a weighted formula rather than overwritten:

```
new band = (0.6 × mock band) + (0.4 × current band)
```

The overall "real band score" is then the average of the updated skill bands, clamped to 0–9 and rounded to the nearest 0.5.

Momentum is awarded for completing a mock, with a sizeable bonus if the student's overall real band score crosses a new half-band threshold (i.e. genuine measurable improvement).

> **Tester's note**
> - Only one free mock per month; the earned mock must require its full eligibility (momentum + IA count + days), not just a momentum payment.
> - Spending momentum on the earned mock must deduct correctly and never allow a negative balance.
> - The 3-hour timer governs the test itself; the 72-hour window governs how long the session stays open. Verify both independently.
> - Confirm the 60/40 mock weighting and that the real band score is the average of the updated skill bands (rounded to 0.5).

---

## 9. Missed Assessments & Auto-Submit (Critical Edge Cases)

These are the special cases that most need careful testing, because they involve the system acting on the student's behalf.

### 9.1 Missing an Internal Assessment

If a student does not complete a scheduled IA, the system records it as **Missed** and applies a momentum penalty. The student is shown messaging about the miss. "Missed" covers a few situations:

- The scheduled IA was never started by the time its day passed.
- The IA was started but no real answers were given, and its time passed.
- A scheduled IA day passed with no session at all — a missed record is created retroactively so the student's history and notifications reflect it.

> **Missed-IA behaviour**
> - **Penalty: a flat momentum deduction per missed IA.**
> - The momentum deduction never pushes the student's balance below zero.
> - An IA that was genuinely started and completed is NOT treated as missed and carries no penalty.
> - The miss check is safe to run repeatedly — a single missed IA should only ever be counted and penalised once, never doubled.

### 9.2 Forgetting to Submit an IA or Mock (Auto-Submit)

If a student starts an IA or a Mock but forgets to submit, the system **auto-submits once the allotted time passes**, so the work the student did is captured and graded rather than lost. In short: the timer running out is treated as a submission.

| Assessment | What triggers auto-submit | Result |
|---|---|---|
| Internal Assessment | The section/test time (20 min per section) elapses without a manual submit. | The IA is submitted and graded on whatever answers exist at that point. |
| Mock Test | The 3-hour test timer elapses (or the 72-hour session window closes) without a manual submit. | The mock is finalised; an expired unsubmitted mock session is closed out. Note: a mock that lapses this way costs the student their monthly slot, but (unlike a missed IA) carries no momentum penalty. |

> **Tester's note**
> - Verify auto-submit fires from the timer expiry itself, and that the answers captured are the student's most recent ones (the last answer entered should not be dropped).
> - A student who refreshes or loses their connection after the server has recorded a completion should still be able to see their result, not be stuck on a scoring screen.
> - Auto-submit must never double-award momentum or double-record a result if it and a manual submit race each other.
> - Distinguish the two mock clocks in testing: a test whose 3 hours ran out vs. a session whose 72-hour window closed.

---

## 10. Quick Reference: The Whole Journey

| Stage | Trigger / Rule | Result |
|---|---|---|
| Account created | Institute invites the student (no self-signup). | Student receives email, logs in. |
| Diagnostic | Mandatory, one-time, 4 sections (L/R MCQ, W/S prompts). | Bands initialised; dashboard unlocked. |
| Daily loop | Drill → LexiGrid → Drill. | Dashboard unlocks; streak +1. |
| Drills | Weakest sub-skill, rotated; limited per day. | Earns momentum; feeds sub-skill practice. |
| LexiGrid | Unlimited plays; momentum on first only; skippable with momentum. | Vocabulary practice. |
| Internal Assessment | Every 3 days; needs 6 drills, 2 days, DCS ≥ 40%. | Updates 2 sub-skills via 40/60 formula. |
| Mock Test | Once a month (free) + earned; 3-hour test in 72-hour window. | Updates all skills via 60/40 formula; sets real band. |
| Missed IA | IA not completed on schedule. | Marked missed; momentum penalty (once). |
| Auto-submit | IA/Mock timer expires unsubmitted. | Work captured and graded automatically. |

---

*End of document · TestCrack — Student Lifecycle & Feature Behaviour Reference · Prepared by Sarthak*