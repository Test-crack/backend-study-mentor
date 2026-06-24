# IA + Mock Test — Production Audit
**Date:** June 2026 · **Scope:** Internal Assessment + Mock Test (frontend / backend / DB)

---

## Summary

| Severity | Count | Meaning |
|---|---|---|
| **P0** | 11 | Crash, data loss, or student permanently locked out |
| **P1** | 19 | Silent wrong behavior — wrong scores, momentum, or results |
| **P2** | 11 | Edge-case failures with narrow trigger conditions |
| **P3** | 7  | Minor / cosmetic / dead code |
| **Total** | **48** | |

---

## Severity Key

- **P0** — Must fix before any production traffic. Causes crashes, corrupt data, or locks students out.
- **P1** — Wrong behavior in the normal flow. Scores wrong, momentum wrong, student confused.
- **P2** — Fails in edge cases (timing races, new students, cross-month, etc.).
- **P3** — Minor issues, dead code, cosmetic inconsistencies.

---

## Backend — Internal Assessment

### [P0] IA-B-01 · Race condition in `iaProcessor.ts` — double-grading doubles momentum and history
**File:** `iaProcessor.ts:187–292`

Both `lastSession` and `allPastSessions` query `status:"COMPLETED"` **before** the transaction marks the current session COMPLETED. If `processIASession` is called twice concurrently (student submit + miss-detector firing simultaneously), both calls see the session not yet COMPLETED, execute full grading, create `assessmentHistory` rows, upsert the competency matrix, and increment momentum — doubling rewards and polluting history.

**Fix:** Add idempotency guard inside the transaction:
```ts
const live = await tx.iASession.findUniqueOrThrow({ where: { id: sessionId } });
if (live.status === 'COMPLETED') return; // already processed
```

---

### [P0] IA-B-02 · `getIAQuestions` creates session without checking prerequisites or DCS
**File:** `iaController.ts:535–617`

`getIAQuestions` validates the IA calendar day but does **not** re-check `prerequisites_met` (≥6 drills, ≥2 days) or `dcs_eligible` (avg DCS ≥40%) before creating the `IN_PROGRESS` session row. A student who bypasses the UI can call `GET /api/ia/questions` directly and get a live session.

**Fix:** Add the same prerequisite + DCS guard inside `getIAQuestions` before session creation:
```ts
const dcs = await computeAverageDCS(student.id);
const drillCount = await prisma.drillSession.count({
  where: { student_id: student.id, status: { in: ['DRILL_DONE','APPLY_DONE'] } }
});
if (drillCount < DRILL_THRESHOLD || dcs < DCS_THRESHOLD)
  return res.status(403).json({ error: 'Eligibility gates not met.' });
```

---

### [P0] IA-B-03 · `iaMissDetector.ts` uses `toISOString()` — produces UTC date, wrong in IST midnight window
**File:** `iaMissDetector.ts:98–190`

`stale.ia_date.toISOString().split('T')[0]` returns a UTC date. In the 00:00–05:30 IST window this is the **previous calendar day**. The miss detector compares against IST date strings everywhere else, so it incorrectly skips or double-marks sessions created in that window. Same bug appears at lines 164–166 and 186–190.

**Fix:** Replace all three occurrences:
```ts
const dateStr = toISTDateString(stale.ia_date instanceof Date ? stale.ia_date : new Date(stale.ia_date));
```

---

### [P1] IA-B-04 · `Math.max(1, mcqScore)` floor inflates 0/N MCQ in mixed-section weighted average
**File:** `iaController.ts:~139`

`Math.max(1, Math.min(10, (correct / total) * 10))` means a student who answers 0/10 MCQs correctly gets raw score 1, not 0. In a mixed-skill section (MCQ + AI), this drags the weighted average higher than it should be.

**Fix:** Remove the floor: `const mcqScore = Math.min(10, (correct / total) * 10);`

---

### [P1] IA-B-05 · READING/LISTENING bands overwrite matrix value directly — no smoothing
**File:** `iaProcessor.ts:268–275`

WRITING and SPEAKING use weighted smoothing (`0.4 * existing + 0.6 * new`), but READING and LISTENING directly overwrite with `newSkillBand = s.band`. One bad test session immediately crashes the band. Inconsistent with the `computeNewMatrixBand` helper in the controller.

**Fix:** Apply the same smoothing formula for READING/LISTENING:
```ts
const existingBand = existing?.band_score ? parseFloat(String(existing.band_score)) : null;
if (existingBand !== null) {
  let w = 0.4 * existingBand + 0.6 * s.band;
  const dev = w - existingBand;
  if (dev > 2) w = existingBand + 2;
  if (dev < -2) w = existingBand - 2;
  newSkillBand = Math.min(9, Math.max(0, Math.round(w * 2) / 2));
} else { newSkillBand = s.band; }
```

---

### [P1] IA-B-06 · Miss detector `eligibilityFloor` derived from first session row, not actual eligibility date
**File:** `iaMissDetector.ts:162–167`

If a student gets an IA session created before completing 6 drills (via IA-B-02), `eligibilityFloor` becomes an earlier date and retroactively marks pre-eligibility dates as MISSED.

**Fix:** Compute the floor as the date of the student's 6th completed drill:
```ts
const sixthDrill = await prisma.drillSession.findFirst({
  where: { student_id, status: { in: ['DRILL_DONE','APPLY_DONE'] } },
  orderBy: { created_at: 'asc' }, skip: 5
});
const eligibilityFloor = sixthDrill ? toISTDateString(sixthDrill.created_at) : null;
```

---

### [P2] IA-B-07 · Min window guard is 20 min but IA requires 40 min (two sections)
**File:** `iaController.ts:~529`

`IA_MIN_WINDOW_MS = 20 * 60 * 1000`. A student who starts with 25 min remaining passes the guard, completes section 1, then cannot finish section 2 — they're timed out and penalized −20 momentum unfairly.

**Fix:** `const IA_MIN_WINDOW_MS = 2 * SECTION_IA_MS; // 40 minutes`

---

### [P2] IA-B-08 · 14-day uniqueness window uses UTC rolling time, not IST calendar days
**File:** `iaController.ts:538–545`

`const cutoff14 = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000)` is a UTC-based rolling window. Inconsistent with all other IST date handling. A session at 11 PM IST on day −14 is in/out depending on which system reads it.

**Fix:** Convert to an IST calendar boundary:
```ts
const cutoff14ISTDate = toISTDateString(new Date(Date.now() - 14 * 24 * 60 * 60 * 1000));
// ia_date: { gte: new Date(cutoff14ISTDate + 'T00:00:00+05:30') }
```

---

### [P2] IA-B-09 · AI grading prompt uses 1–10 scale but IELTS is 0–9 — undocumented mapping
**File:** `iaGrading.ts:107–134`

Gemini outputs "integer 1–10" labeled as "Band 10 = IELTS 9.0", then the processor maps 1–10 → 0–9 via `(score−1)`. Intentional but undocumented. Gemini may weight outputs toward the middle of a 10-point scale, producing skew.

**Fix:** Add a clarifying sentence to the prompt: *"A score of 10 means IELTS 9.0 (native/expert level); reserve it only for truly exceptional responses."* Also extract the model name: `process.env.GEMINI_MODEL ?? 'gemini-2.5-flash'`.

---

### [P2] IA-B-10 · Miss sweep `updateMany` lacks status filter — TOCTOU can overwrite COMPLETED session
**File:** `iaMissDetector.ts:241–249`

The sweep finds expired sessions via `findMany` then calls `updateMany` by IDs without re-checking status. Between the two calls a student could submit (status → COMPLETED), and the `updateMany` overwrites it to MISSED.

**Fix:** Add status guard: `where: { id: { in: ids }, status: { in: ['PENDING','IN_PROGRESS'] } }`

---

### [P3] IA-B-11 · `SUB_SCORE_KEY_MAP` duplicated in `iaController.ts` and `iaProcessor.ts`

Extract to `lib/iaConstants.ts` and import from both files.

---

### [P3] IA-B-12 · `SectionScore.total` counts only MCQ questions

Misleading in the API response when a section has MCQ + SPEAKING_PROMPT. Rename to `mcq_total` or add a separate `ai_question_count` field.

---

### [P3] IA-B-13 · No auth middleware at router level — relies entirely on per-controller guards

`iaRoutes.ts` and `mockRoutes.ts` omit `router.use(authMiddleware)`. Add it at the top of both files or confirm it's applied globally before mounting.

---

## Backend — Mock Tests

### [P0] MK-B-01 · ABANDONED session causes unique constraint crash — student locked out for the month
**File:** `mockController.ts:379–427`

The monthly slot check only blocks re-creation when `status === 'COMPLETED'`. If a prior session is ABANDONED, the code proceeds to `prisma.mocksessions.create()`, which throws P2002 on `(student_id, month_year, attempt_type)`. The student is permanently locked out for that attempt type for the rest of the month.

**Fix:** Before creating a new session, delete any ABANDONED slot:
```ts
const existingSlot = await prisma.mocksessions.findFirst({
  where: { student_id: student.id, month_year: monthYear, attempt_type }
});
if (existingSlot?.status === 'ABANDONED') {
  await prisma.mocksessions.delete({ where: { id: existingSlot.id } });
} else if (existingSlot) {
  return res.status(409).json({ error: `${attemptType} mock already used this month.` });
}
```

---

### [P0] MK-B-02 · Abandoned sweep `updateMany` lacks status filter — can overwrite a just-submitted session
**File:** `mockController.ts:241–249`

Same TOCTOU pattern as IA-B-10. The sweep finds expired sessions via `findMany` then calls `updateMany` by IDs. A student who submits between the two calls has their COMPLETED session overwritten to ABANDONED.

**Fix:** `where: { id: { in: expiredIds }, status: { in: ['PENDING','IN_PROGRESS'] } }`

---

### [P1] MK-B-03 · ABANDONED slot counted as "not used" — dashboard shows false `can_start`, attempt then crashes
**File:** `mockController.ts:260–265`

`standardUsed = !!session && session.status === 'COMPLETED' || session.status === 'IN_PROGRESS'`. ABANDONED is excluded, so `can_start_mock` is true. When they try to start, MK-B-01 crashes the attempt.

**Fix:**
```ts
const standardUsed = !!standardSession && standardSession.status !== 'PENDING';
const earnedUsed   = !!earnedSession   && earnedSession.status   !== 'PENDING';
```

---

### [P1] MK-B-04 · AI grading key uses array index — breaks if section order differs
**File:** `mockController.ts:566, 630`

AI results are keyed as `` `${i}:${subSkill}` `` where `i` is the loop index. If the array order ever differs between session creation and submission, AI scores are silently attributed to wrong sub-skills.

**Fix:** Key by skill name: `` `${cfg.skill}:${subSkill}` ``

---

### [P1] MK-B-05 · `prevOverall` uses partial skill count — false threshold bonus for new students
**File:** `mockController.ts:725–728`

`prevMatrixBands.size` may be 1 for a new student. `prevOverall` is then just their one assessed skill, while `realBandScore` averages all 4. Delta triggers the 500-momentum "threshold crossed" bonus incorrectly.

**Fix:**
```ts
const prevOverall = MOCK_SKILL_ORDER.reduce(
  (sum, sk) => sum + (prevMatrixBands.get(sk) ?? 0), 0
) / MOCK_SKILL_ORDER.length;
```

---

### [P1] MK-B-06 · Submitting a COMPLETED session returns no score data — client cannot recover
**File:** `mockController.ts:533–534`

`return res.json({ success: true, already_done: true })` — no `real_band_score`, `scores`, or `momentum_awarded`. If the client lost state (page refresh after server wrote COMPLETED), the result is unrecoverable.

**Fix:**
```ts
return res.json({
  success: true, already_done: true,
  real_band_score: session.real_band_score,
  scores: session.scores,
  momentum_awarded: session.momentum_awarded
});
```

---

### [P1] MK-B-07 · Cross-month active sessions invisible to `/status` abandoned sweep
**File:** `mockController.ts:241–262`

`getMockStatus` filters by `month_year`, so a PENDING/IN_PROGRESS session from last month (window still open) is invisible. The student appears to have no active session and can start a second mock.

**Fix:** In the abandoned sweep, omit the `month_year` filter and query globally.

---

### [P1] MK-B-08 · `answer` accepts objects — silently coerces to `"[object Object]"`
**File:** `mockController.ts:482`

`current[question_id] = String(answer)` — if the client POSTs `{ answer: { text: "..." } }`, the stored answer is `"[object Object]"`.

**Fix:** Validate type before casting: `if (typeof answer !== 'string' && typeof answer !== 'number') return res.status(400).json({ error: 'answer must be a string.' });`

---

### [P2] MK-B-09 · Audio/passage group may have fewer than required questions — silent test deficit
**File:** `mockController.ts:89–116`

No validation that each section meets the required question count. A 12-question pool produces a deficient session with no error.

**Fix:** After building sections, validate counts and return 503 if insufficient.

---

### [P2] MK-B-10 · Updated sub-skill bands computed twice independently — can diverge
**File:** `mockController.ts:686–774`

The response object and the DB transaction independently compute updated sub-skill bands. A `SUB_SCORE_KEY_MAP` miss silently skips the DB write but still includes the band in the response.

**Fix:** Compute once in a helper, reuse the result in both the DB write and the response.

---

### [P3] MK-B-11 · 3-hour duration not enforced server-side at submit time

Document the decision explicitly. If non-enforcement is intentional (72-hour window is the only server gate), note it in the codebase.

---

## Frontend — Internal Assessment

### [P0] IA-F-01 · `handleAutoSubmit` called before definition — stale closure crash on timer expiry
**File:** `InternalAssessmentPage.tsx:388, 445`

`checkEligibility` (line 336) calls `handleAutoSubmit` at line 388. `handleAutoSubmit` is defined via `useCallback` at line 445 — **below** `checkEligibility`. The closure captures `handleAutoSubmit` in the temporal dead zone. Also missing from `checkEligibility`'s dependency array, causing stale references on subsequent renders.

**Fix:** Move `handleAutoSubmit`'s definition above `checkEligibility`, and add it to `checkEligibility`'s dep array.

---

### [P0] IA-F-02 · Timer re-registers a new interval every second — auto-submit fires with stale `answers`
**File:** `InternalAssessmentPage.tsx:478–487`

The timer `useEffect` has `timeLeft` in its dep array, so it re-creates the interval every second. When the timer hits 0, `handleAutoSubmit(tracker, answers)` fires from the closing snapshot — if the student answered a question in the same tick, that last answer is dropped.

**Fix:** Use a latestRef pattern and remove `timeLeft` from the dep array:
```ts
const latestRef = useRef({ tracker, answers });
useEffect(() => { latestRef.current = { tracker, answers }; }, [tracker, answers]);

useEffect(() => {
  if (phase !== 'in_progress') return;
  const t = setInterval(() => {
    setTimeLeft(prev => {
      if (prev <= 1) {
        clearInterval(t);
        handleAutoSubmit(latestRef.current.tracker, latestRef.current.answers);
        return 0;
      }
      return prev - 1;
    });
  }, 1000);
  return () => clearInterval(t);
}, [phase, handleAutoSubmit]);
```

---

### [P0] IA-F-03 · `resumeDeadline` reset on every keypress — resume window extends indefinitely
**File:** `InternalAssessmentPage.tsx:526–543`

`handleAnswer` recalculates `resumeDeadline: addMinutes(now, 18)` on every answer. A student who types one character every 17 minutes never loses their session.

**Fix:** Only set `resumeDeadline` in `handleExitMidTest`. In `handleAnswer`, preserve the existing value:
```ts
resumeDeadline: w.inProgress?.resumeDeadline ?? addMinutes(now, 18), // preserve, don't recalculate
```

---

### [P0] IA-F-04 · `handleResetWindow` re-awards +50 Momentum on every reset cycle
**File:** `InternalAssessmentPage.tsx:590–597, 441`

`handleResetWindow` → `checkEligibility` → `addPoints(50, ...)` when creating a new `IAWindow`. A student who misses, resets, and becomes eligible again receives +50 on every cycle.

**Fix:** Guard the award with a first-time check:
```ts
if (!t.currentWindow) {
  addPoints(50, 'IA eligibility milestone reached');
}
```

---

### [P1] IA-F-05 · `handleNext` scores using stale `answers` — last answer may be excluded
**File:** `InternalAssessmentPage.tsx:546–568`

On the final question, `answers` captured in the closure is the state before the last `handleAnswer` re-render completes. The final answer may not be included in the score.

**Fix:** Read from `latestRef.current.answers` (introduced in IA-F-02) in `handleNext`.

---

### [P1] IA-F-06 · Timer progress bar uses full 20-min denominator during resume (shorter window)
**File:** `InternalAssessmentPage.tsx:777`

`const pct = timeLeft / IA_TIMER_SECONDS` always divides by 1200. On resume, `timeLeft` is ≤1080. The bar starts at >90% and amber/red urgency thresholds never fire meaningfully.

**Fix:**
```ts
const maxTimer = phase === 'resume' ? RESUME_TIMER_SECONDS : IA_TIMER_SECONDS;
const pct = timeLeft / maxTimer;
```

---

### [P1] IA-F-07 · `handleResume` does not restore `currentQ` — student restarts from Q0
**File:** `InternalAssessmentPage.tsx:581–588`

The "Resume" button handler doesn't call `setCurrentQ(w.inProgress!.currentQuestion)`. The student is always taken back to question 0 even though answers are preserved.

**Fix:** Add `setCurrentQ(w.inProgress!.currentQuestion);` to `handleResume`.

---

### [P1] IA-F-08 · `tutorFiredRef` never resets between IA cycles — Level 2 alert fires at most once per page lifetime
**File:** `InternalAssessmentPage.tsx:350–373`

`tutorFiredRef = useRef(false)` is component-level. If the Level 2 alert fires during a miss run (ref → true), it is permanently suppressed for subsequent miss runs until the page is reloaded.

**Fix:** Reset `tutorFiredRef.current = false` in three places: when creating a new `IAWindow`, when `consecutiveMisses` resets to 0, and in `handleResetWindow`.

---

### [P1] IA-F-09 · `IAScheduleWidget` casts `res` directly as `IAStatusSlim` — all fields undefined
**File:** `IAScheduleWidget.tsx:39–41`

`setStatus(res as IAStatusSlim)` — the `callBackend` wrapper nests the payload under `res.data`. Casting `res` directly means all widget fields are undefined. Widget silently hides itself.

**Fix:** `if (res.success && res.data) setStatus(res.data as IAStatusSlim);`

---

### [P1] IA-F-10 · Widget and IA page use different eligibility sources — can contradict each other
**File:** `IAScheduleWidget.tsx:54, 81` + `InternalAssessmentPage.tsx`

The widget reads `is_ia_day` from backend `/api/ia/status`. The IA page reads from localStorage. They can show contradictory states.

**Fix:** Pick one source of truth. The page should consume the same backend endpoint the widget uses.

---

### [P2] IA-F-11 · Empty `questions` array renders `null` — blank screen deadlock with no exit
**File:** `InternalAssessmentPage.tsx:773`

If `handleStartIA` sets `phase = 'in_progress'` but questions haven't loaded, the screen goes blank with no exit button (the Exit button is inside this same render branch).

**Fix:** Return a loading spinner instead of `null`.

---

### [P2] IA-F-12 · `renderCompleted` crashes if `w.result` is null — non-null assertion on nullable
**File:** `InternalAssessmentPage.tsx:934–935`

`const r = w.result!` — `w.result` is typed `IAWindowResult | null`. If partial localStorage corruption leaves the session completed but result missing, this throws.

**Fix:**
```tsx
if (!w.result) return <div>Result unavailable — please contact support.</div>;
const r = w.result;
```

---

### [P3] IA-F-13 · `IAScheduleWidget` returns `null` during loading — layout shift

Return a skeleton placeholder matching the widget's dimensions.

---

## Frontend — Mock Tests

### [P0] MK-F-01 · Stale `sessionId` in `handleSectionComplete` — submit fires with null session ID on timer expiry
**File:** `FullMockAssessment.tsx:392–412`

`handleSectionComplete` is wrapped in `useCallback` with `[sections, currentSectionIdx, sessionId]`. The timer-expiry `useEffect` has `[timeLeft, phase]`. If the component re-renders between `beginMock` setting `sessionId` and the callback being memoized, `handleSectionComplete` captures a stale null `sessionId`. POST fires with `{ session_id: null }`, backend rejects, student stuck on "scoring" forever.

**Fix:**
```ts
const sessionIdRef = useRef<string | null>(null);
// In beginMock: sessionIdRef.current = res.session_id; setSessionId(res.session_id);
// In handleSectionComplete: use sessionIdRef.current
```

---

### [P1] MK-F-02 · Timer labeled "Section Timer" and interim screen says "fresh timer per section" — both false
**File:** `FullMockAssessment.tsx:736, 912`

FullMock uses a single global 3-hour timer. Students will mismanage their time.

**Fix:** Line 736: change label to "Total Test Timer". Line 912: remove "the next section has its own fresh timer."

---

### [P1] MK-F-03 · `setAnswers({})` on section advance wipes all accumulated answers — Prev shows blanks
**File:** `FullMockAssessment.tsx:425`

All prior-section answers are dropped from local state on every section advance.

**Fix:** Remove `setAnswers({})`. Keep the flat `Record<questionId, answer>` map and never clear it.

---

### [P1] MK-F-04 · Writing debounce ref not nulled in cleanup — stale POST may fire against wrong question ID
**File:** `FullMockAssessment.tsx:308–309`

`clearTimeout(writingDebounceRef.current)` is called in cleanup but the ref is not nulled. A debounce in-flight when the student presses "Next" could fire with the previous question's ID and the new textarea content.

**Fix:** `clearTimeout(writingDebounceRef.current); writingDebounceRef.current = null;`

---

### [P1] MK-F-05 · `Assessment.tsx` crashes when `iaStatus` is null after API failure
**File:** `Assessment.tsx:1492, 558`

`iaStatus!.progress` is dereferenced in `renderNotEligible()` without a null check. When the API fails, `iaStatus` is null and this throws.

**Fix:** Add `if (!iaStatus) return <ErrorState message="Could not load assessment status." />;` before the eligibility check.

---

### [P1] MK-F-06 · Section advance resets timer to full 20 min regardless of backend window time
**File:** `Assessment.tsx:490`

`setTimeLeft(20 * 60)` always gives a fresh 20 minutes, ignoring the backend's per-section remaining window. A student who takes 18 min on section 1 should have 2 min left, but gets a full 20 min.

**Fix:** Re-fetch remaining time from the backend on section advance, or include `section_time_remaining_ms` in the section-advance response and use it.

---

### [P1] MK-F-07 · `awardMomentum()` is an exported stub — never hits the backend
**File:** `Assessment.tsx:13–22`

Returns a fake Promise after a 1s delay. Any module importing it expects real behavior.

**Fix:** Delete the stub. If other modules import it, replace with the real `addPoints` / `syncMomentum` calls.

---

### [P1] MK-F-08 · `MockStatusWidget` has a dead render path — blank body for `eligible && !can_start && !used_month`
**File:** `MockStatusWidget.tsx:64–66, 114–240`

None of the four render branches triggers for this state combination. Widget renders a header-only shell with no CTA.

**Fix:** Add a fallback:
```tsx
{!hasActive && !canStart && !usedMonth && !notEligible && (
  <div>Assessment not available yet — check back soon.</div>
)}
```

---

### [P2] MK-F-09 · SPEAKING `canProceed` is truthy for sentinel `"[no transcript]"`
**File:** `FullMockAssessment.tsx:699`

Students on Firefox/Safari get the Web Speech API unavailable sentinel, which is truthy, so they advance with zero actual speaking input.

**Fix:** `canProceed = !!(answers[id]?.trim()) && answers[id] !== '[no transcript]';`

---

### [P2] MK-F-10 · `realBand > 0` check hides legitimate band 0.0 as "—"
**File:** `FullMockAssessment.tsx:951–972`

**Fix:** `{mockResults?.real_band_score != null ? realBand.toFixed(1) : '—'}`

---

### [P3] MK-F-11 · `isRestoring` state is always false — dead code
**File:** `Assessment.tsx:294, 521, 547`

Remove `isRestoring` and all its references.

---

### [P3] MK-F-12 · "View Results →" CTA navigates to mock gate screen, not results

Relabel to "Go to Mock →" until a real results page exists.

---

## Instructor / Routing

### [P0] IN-01 · No `/student/assessment` route — any deep link hits 404
**File:** `App.tsx`

The student IA route is `/student/internal`. No `/student/assessment` redirect exists. Any notification, email, or external link targeting `/student/assessment` hits `NotFoundPage`.

**Fix:**
```tsx
<Route path="/student/assessment" element={<Navigate to="/student/internal" replace />} />
```

---

### [P1] IN-02 · `goToStudent` navigates to slug-based URL — progress page may fail to resolve
**File:** `IAOverviewTab.tsx, MockOverviewTab.tsx:82, 94`

`navigate(`/instructor/students/${slug}/progress`, { state: ... })` uses a name-based slug. If `InstructorStudentProgressPage` reads `params.studentSlug` instead of `location.state.studentId`, it queries by slug and finds nothing.

**Fix:** Navigate to the ID-based route: `` `/instructor/batches/${batchId}/students/${row.user_id}/progress` ``

---

### [P1] IN-03 · `SectionScore.band` typed as `number` — 0 used as null sentinel, skews averages
**File:** `IASessionsTab.tsx:25`, `types.ts`

Zero is used to mean "unscored." The `band > 0` filter silently excludes valid 0.0 bands. Same issue in `MockSubSkillScore`.

**Fix:** Change both to `number | null` in `types.ts`. Update all `> 0` guards to `!== null`.

---

### [P1] IN-04 · Average band includes null `real_band_score` as 0 — drags average below actual
**File:** `MockSessionsTab.tsx:213–215`

`completed.reduce((sum, s) => sum + (s.real_band_score ?? 0), 0) / completed.length` — deferred AI grading sessions contribute 0 to the sum.

**Fix:**
```ts
const scored = completed.filter(s => s.real_band_score !== null);
const avg = scored.length > 0
  ? scored.reduce((s, x) => s + x.real_band_score!, 0) / scored.length
  : null;
```

---

### [P2] IN-05 · `last_ia_date` null sort assigns `Infinity` (number) then falls through to string subtraction → NaN
**File:** `IAOverviewTab.tsx:68–76`

Rows with `null` dates produce NaN comparisons, silently breaking sort order.

**Fix:** Use string sentinels:
```ts
av = a.last_ia_date ?? (sortDir === 'asc' ? '' : '9999-99-99');
bv = b.last_ia_date ?? (sortDir === 'asc' ? '' : '9999-99-99');
return sortDir === 'asc' ? av.localeCompare(bv) : bv.localeCompare(av);
```

---

### [P2] IN-06 · Three overlapping student progress routes with conflicting param contracts
**File:** `App.tsx:322–324`

`/instructor/student/:studentSlug/progress` (legacy), `/instructor/students/:studentSlug/progress`, and `/instructor/batches/:batchId/students/:studentId/progress` all resolve differently. The progress page must handle multiple param shapes.

**Fix:** Deprecate the first two. Update all navigation to the batch-scoped path.

---

### [P3] IN-07 · Band color amber threshold inconsistency: 5.5 in overview, 6.0 in sessions tab

Extract a canonical `BAND_COLOR_THRESHOLDS` constant and import it in both files.

---

### [P3] IN-08 · Completion rate denominator includes PENDING sessions

`compRate = completed / sessions.length` includes future-PENDING sessions, lowering the rate for on-track students. Use `completed / (completed + missed)`.

---

### [P3] IN-09 · Mock sessions not sorted client-side — render order depends on API response

Sort before render: `[...sessions].sort((a,b) => b.month_year.localeCompare(a.month_year)).map(...)`

---

## Fix Priority Order

### Ship blockers (fix before any user traffic)
1. **MK-B-01** — student locked out for the month
2. **IA-F-02** — timer fires auto-submit with stale answers
3. **MK-F-01** — submit fires with null session ID
4. **IA-B-01** — race condition doubles momentum
5. **IA-B-02** — session created without eligibility check
6. **IA-B-03** — IST date bug in miss detector
7. **IA-F-01** — handleAutoSubmit called before definition
8. **IA-F-03** — resumeDeadline extends on every keypress
9. **IA-F-04** — +50 momentum re-awarded on every reset
10. **IN-01** — missing route → 404 deep links
11. **MK-B-02** — abandoned sweep can overwrite COMPLETED session

### Important (ship soon)
- IA-B-04, IA-B-05, IA-B-06 (scoring and band accuracy)
- MK-B-03–08 (mock flow correctness)
- IA-F-05–10, IA-F-11–12 (IA page correctness)
- MK-F-02–08 (mock page correctness)
- IN-02–04 (instructor data accuracy)

### Lower priority (can batch into a maintenance PR)
- All P2 and P3 items
