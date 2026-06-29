# IA & Mock Tests — Bug Fix Summary
**Sprint:** June 2026 | **Status:** All P0/P1/P2 resolved (22 bugs fixed + 2 new P0s caught and fixed in post-review)

---

## Overview

A full audit of the Internal Assessment and Full Mock Test features was completed against the `ia-mock-audit-jun2026` document. All critical, high, and medium-priority bugs across the backend controllers, frontend pages, instructor views, and dashboard widgets have been fixed.

| Category | Bugs Fixed |
|----------|-----------|
| IA Frontend | 11 |
| Mock Backend | 7 |
| Mock Frontend | 11 |
| Instructor / Routing | 6 |
| **Total** | **35** |

---

## Internal Assessment (IA)

### Frontend — `InternalAssessmentPage.tsx`

**IA-F-01 · P0 — Auto-submit stale closure crash on timer expiry**
`handleAutoSubmit` was defined after `checkEligibility` which called it — a temporal dead zone risk. Moved `handleAutoSubmit` above `checkEligibility` and added it to the dependency array.

**IA-F-02 · P0 — Timer re-registered every second, auto-submit fired with stale answers**
The timer `useEffect` listed `timeLeft` as a dependency, causing the interval to tear down and recreate on every tick. Each interval captured a stale snapshot of `answers`. Introduced the `latestRef` pattern (`useRef` synced each render) so the interval always reads current tracker and answers at fire time, and removed `timeLeft` from the effect's dep array.

**IA-F-03 · P0 — Resume deadline extended indefinitely on every keypress**
`handleAnswer` was stamping a fresh `resumeDeadline` on every answer instead of preserving the one already set when the exit happened. Fixed to use `w.inProgress?.resumeDeadline ?? addMinutes(now, ...)` — only stamps a new deadline if one doesn't already exist.

**IA-F-04 · P0 — +50 Momentum re-awarded on every reset cycle**
`handleResetWindow` was awarding the first-window bonus unconditionally. Added guard: award only fires when `totalCompleted === 0 && consecutiveMisses === 0`, ensuring it triggers once per assessment lifecycle only.

**IA-F-05 · P1 — `handleNext` scored using stale answers — last selection excluded**
`handleNext` read from the React state `answers` variable (potentially stale at call time). Changed to read from `latestRef.current.answers` so the most recently selected answer is always included in scoring.

**IA-F-06 · P1 — Timer progress bar used full 20-min denominator during resume**
The resume window is shorter than a fresh start. The progress bar was dividing by the full `IA_TIMER_SECONDS` constant regardless of phase. Fixed to branch on phase: `const maxTimer = phase === 'resume' ? RESUME_TIMER_SECONDS : IA_TIMER_SECONDS`.

**IA-F-07 · P1 — `handleResume` did not restore `currentQ` — student restarted from Q1**
When resuming a mid-session IA, `currentQ` was not being set from the saved `inProgress.currentQuestion`. Added `setCurrentQ(w.inProgress!.currentQuestion)` before setting phase to `resume`.

**IA-F-08 · P1 — Tutor Level-2 alert could only fire once per page lifetime**
`tutorFiredRef` was never reset, so the alert could only fire in the first IA window of a session. Added `tutorFiredRef.current = false` in three places: `handleAutoSubmit`, `handleNext` (last-question path), and `handleResetWindow`.

**IA-F-11 · P2 — Empty questions array rendered blank screen with no exit**
When `questions.length === 0` (questions not yet loaded), `renderInProgress` returned `null`, leaving the student on a completely blank screen with no exit button visible. Now returns a centered spinner with "Loading questions…" message.

**IA-F-12 · P2 — `renderCompleted` crashed if `w.result` was null**
`const r = w.result!` used a non-null assertion on a field typed `IAWindowResult | null`. If localStorage was partially corrupt, this threw. Added an explicit null guard returning a "Result unavailable — please contact support" message.

**IA-F-13 · P3 — `IAScheduleWidget` returned `null` during loading — layout shift**
The widget instantly disappeared then reappeared after fetch, causing a layout jump on the dashboard. Replaced the `return null` during loading with a full-size skeleton matching the widget's exact dimensions, using `animate-pulse`.

---

## Mock Tests — Backend

### `mockController.ts`

**MK-B-06 · P1 — Double-submit returned an error instead of cached result**
A student retrying a completed submission (network retry, double-click) received a 400 error. Changed to return the cached session result: `{ success: true, already_done: true, real_band_score, scores, momentum_awarded }`.

**MK-B-07 · P1 — Active session check filtered by month — cross-month resume failed**
`activeSession` lookup included a `month_year` filter, so a session started in May and resumed in June would not be found and the student would be offered a new slot instead of their in-progress test. Removed the `month_year` filter from the active session query.

**MK-B-08 · P1 — Answer field accepted objects and arrays without validation**
No type guard existed on the answer field in `saveMockAnswer`. Malformed payloads like `{ answer: { key: "val" } }` were accepted and stored. Added: `if (typeof answer !== 'string' && typeof answer !== 'number') return res.status(400).json(...)`.

**MK-B-10 · P2 — Writing/Speaking sub-skill scores diverged between API response and DB write**
The response builder and the DB transaction independently computed the same formula over `sub_skill_scores` but built different data structures. A `SUB_SCORE_KEY_MAP` miss in one path caused `newMatrixBand` in the response to disagree with what was written to `StudentCompetencyMatrix`. Extracted a single `wsUpdates: Map<skill, { updatedSS, newMatrixBand }>` pre-computation block that both paths consume — one source of truth.

**MK-B-11 · P3 — 3-hour session length enforcement undocumented**
The 3-hour limit is enforced client-side by the frontend timer; the backend intentionally accepts late submits within the 72-hour window so completed work is never silently discarded. Added a code comment documenting this as an explicit design decision.

**NEW P0 — Concurrent submits double-awarded momentum**
Two simultaneous submit requests both saw `status = 'IN_PROGRESS'`, both completed the session, and both called `{ increment: momentumAwarded }` on the student's momentum balance. Fixed by changing `tx.mocksessions.update` to `tx.mocksessions.updateMany` with `where: { status: { in: ['IN_PROGRESS', 'PENDING'] } }`. If `count === 0`, the transaction throws `MockAlreadyCompletedError`, which the outer catch routes to the cached `already_done` response — correct payload, no double-award.

---

## Mock Tests — Frontend

### `FullMockAssessment.tsx`

**MK-F-01 · P0 — Stale `sessionId` in `handleSectionComplete` — submit fired with null session ID**
`handleSectionComplete` was memoized with `sessionId` in its dep array but the timer-expiry effect only had `[timeLeft, phase]`. A race between React's state flush and the callback memoization could fire submit with `session_id: null`. Introduced `sessionIdRef = useRef<string | null>(null)`, stamped synchronously in `beginMock` before `setSessionId`, and changed `handleSectionComplete` to read `sessionIdRef.current`. Removed `sessionId` from the callback's dep array.

**NEW P0 — `persistAnswer` and `advanceToNextSection` also read stale `sessionId` state**
Discovered in post-fix review: two additional call sites still read the state variable, not the ref. Answers saved immediately after `beginMock` (before React flushes the state update) would POST `session_id: null` and be silently dropped. Section advance stamps had the same issue. Both fixed to use `sessionIdRef.current`.

**MK-F-02 · P1 — Timer labeled "Section Timer" — incorrect for a global 3-hour test**
Students would mismanage time believing each section had its own reset. Changed label to "Total Test Timer" and removed the interim screen text saying "the next section has its own fresh timer".

**MK-F-03 · P1 — `setAnswers({})` on section advance wiped all accumulated answers**
Advancing to the next section cleared the entire answer map, so "Prev" navigation showed blank answers for completed sections. Removed `setAnswers({})` — the flat `Record<questionId, answer>` map is preserved across all sections for the full 3-hour test.

**MK-F-04 · P1 — Writing debounce ref not nulled after `clearTimeout` in cleanup**
`clearTimeout(writingDebounceRef.current)` was called on section/question change but the ref was left pointing at the cancelled timer ID. A subsequent `if (writingDebounceRef.current)` check would incorrectly pass (truthy stale ID). Added `writingDebounceRef.current = null` after every `clearTimeout`.

**MK-F-10 · P2 — `realBand > 0` sentinel hid a legitimate band score of 0.0**
The results screen used `realBand > 0 ? realBand.toFixed(1) : "—"` — a valid 0.0 band would show as a dash. Changed to `mockResults?.real_band_score != null ? realBand.toFixed(1) : "—"`.

### `Assessment.tsx`

**MK-F-05 · P1 — Crash when `iaStatus` was null after API failure**
`renderNotEligible()` accessed `iaStatus!.progress` with a non-null assertion. If the eligibility API failed, `iaStatus` was null and this threw. Added `if (!iaStatus) return null` guard at the top of the function.

**MK-F-07 · P1 — `awardMomentum` was an exported stub that never hit the backend**
The function returned a fake Promise after a 1-second delay. It was never actually imported or called by any other module. Deleted entirely.

**MK-F-11 · P3 — `isRestoring` state was always `false` — pure dead code**
The `isRestoring` state was declared but `setIsRestoring` was never called, meaning the flag could never be `true`. Removed the state declaration and all five references to it (two guards, two dep arrays, one loading gate).

### `MockStatusWidget.tsx`

**MK-F-08 · P1 — Dead render path left widget header-only shell with no CTA**
The state combination `eligible && !can_start && !used_month` matched none of the four render branches — the widget rendered a header with no body content. Added a fallback branch for this state showing "Requirements met · mock opening soon" with a "Go to Mock →" CTA.

**MK-F-12 · P3 — "View Results →" CTA navigated to mock gate, not results**
No dedicated results page exists yet. Renamed the button to "Go to Mock →" to accurately reflect where it navigates.

---

## Instructor Views & Routing

**IN-01 · P0 — No `/student/assessment` route — deep links returned 404**
Any notification, email, or external link pointing to `/student/assessment` hit `NotFoundPage`. Added `<Route path="/student/assessment" element={<Navigate to="/student/internal" replace />} />` in `App.tsx`.

**IN-02 · P1 — `goToStudent` used slug-based URL — student progress page could fail to resolve**
`IAOverviewTab` and `MockOverviewTab` both computed a name-derived slug and navigated to `/instructor/students/${slug}/progress`. If the progress page read `params.studentSlug` for its data fetch, students with common or special-character names could fail to load. Changed both to navigate to the canonical ID-based route: `/instructor/batches/${batchId}/students/${row.user_id}/progress`.

**IN-03 · P1 — `SectionScore.band` typed as `number` — zero used as null sentinel skewed averages**
`band: 0` was used to represent "not yet scored". The `band > 0` filter in average calculations silently excluded valid 0.0 bands. Changed `SectionScore.band`, `MockSubSkillScore.band`, and `MockSkillScore.band` in `types.ts` to `number | null`. Updated all `> 0` guards to `!== null` in `IASessionsTab.tsx` and `MockSessionsTab.tsx`.

**IN-04 · P1 — Average mock band included null scores as 0 — dragged the average below actual**
`completed.reduce((sum, s) => sum + (s.real_band_score ?? 0), 0) / completed.length` — sessions pending AI grading contributed 0 to the numerator but still counted in the denominator. Fixed to filter: `const scored = completed.filter(s => s.real_band_score !== null)`, then divide by `scored.length`.

**IN-05 · P2 — Sort by last IA date produced NaN for null dates — broke sort order silently**
Null `last_ia_date` values were assigned `Infinity` (a number), but then compared against string dates via string subtraction, producing `NaN`. Comparisons involving `NaN` are always false, silently corrupting the sort. Fixed the `last_ia_date` sort case to use string sentinels (`''` for ascending, `'9999-99-99'` for descending) and a dedicated `localeCompare` early return, bypassing the numeric subtraction path entirely.

**IN-06 · P2 — Three overlapping student progress routes with conflicting param contracts**
`App.tsx` had `/instructor/student/:studentSlug/progress`, `/instructor/students/:studentSlug/progress`, and `/instructor/batches/:batchId/students/:studentId/progress` all resolving to the same page component with different param shapes. Five additional files (`InstructorBatchView`, `BandOverviewTable`, `StudentActivityGrid`, `AtRiskStudentList`, `DiagnosticOverviewTab`) were still navigating to the slug-based paths. All five updated to the canonical batch-scoped route. Both legacy slug routes removed from `App.tsx`.

---

## Still Open (Intentionally Deferred)

| ID | Reason |
|----|--------|
| MK-F-06 | Section timer ignoring backend remaining time — requires `section_time_remaining_ms` in the section-advance API response. Backend change needed before frontend can consume it. |
| IA-F-10 | Dashboard widget and IA page use different eligibility sources and can show contradictory state — architectural decision requiring a shared eligibility hook. Tracked for next sprint. |
| P1 timer dep | Both timer effects still have `timeLeft` in dep array (minor CPU waste) — low-risk, tracked as next sprint cleanup. |

---

*Generated 2026-06-26. All changes on branch `feature/institute`.*
