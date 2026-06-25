# IA & Mock Tests — Production Readiness Review
**Date:** 2026-06-26 | **Branch:** feature/institute | **Status:** ⛔ NOT READY — fix P0/P1 before launch

---

## Summary

22 bugs resolved this session (IA-F-01–13, MK-B-06–11, MK-F-01–12, IN-01–06).  
**10 new issues found** in the post-fix deep review. 2 are production blockers.

| Severity | Count |
|----------|-------|
| P0 — Blocker | 2 |
| P1 — High | 5 |
| P2 — Medium | 3 |

---

## P0 — Blockers

### P0-1 · `persistAnswer` + `advanceToNextSection` read stale `sessionId` state
**File:** `FullMockAssessment.tsx:318, 422`

`handleSectionComplete` was fixed to use `sessionIdRef.current`, but two other paths were missed:

- `persistAnswer` (line 318) checks `if (!sessionId)` and passes `sessionId` in the POST body — answers saved in the React flush window after `beginMock` fire with `session_id: null` and are silently dropped.
- `advanceToNextSection` (line 422) reads `if (sessionId)` — same stale-state read means the section position never stamps to the backend if called before React flushes.

**Fix:**
```ts
// persistAnswer — line 318
if (!sessionIdRef.current) return;
body: JSON.stringify({ session_id: sessionIdRef.current, ... })

// advanceToNextSection — line 422
if (sessionIdRef.current) {
  body: JSON.stringify({ session_id: sessionIdRef.current, section_advance: nextIdx })
}
```

---

### P0-2 · Mock submit has no status guard in DB update — concurrent submits double-award momentum
**File:** `mockController.ts` — submit transaction

The `submitMock` endpoint's early `already_done` guard only catches sessions already `COMPLETED`. Two concurrent requests both see `status = 'IN_PROGRESS'`, both enter the transaction, both update to `COMPLETED`, both call `{ increment: momentumAwarded }`. The final momentum score is inflated by the full award amount for every race window.

**Fix:** Add a status guard to the DB update inside the transaction so only the first writer wins:
```ts
const updated = await tx.mocksessions.updateMany({
  where: { id: session_id, status: { in: ['IN_PROGRESS', 'PENDING'] } },
  data:  { status: 'COMPLETED', real_band_score: realBandScore, ... }
});
if (updated.count === 0) {
  // Already completed by a concurrent request — return cached result
  const s = await tx.mocksessions.findUnique({ where: { id: session_id } });
  return res.json({ success: true, already_done: true, real_band_score: s?.real_band_score });
}
```

---

## P1 — High Priority

### P1-1 · Timer effect re-registers every second — `timeLeft` in dep array
**Files:** `FullMockAssessment.tsx:289`, `Assessment.tsx:510`

Both files list `timeLeft` in the timer `useEffect`'s dependency array. Every second: state updates → effect re-runs → `clearInterval(old)` → `setInterval(new)`. The teardown/recreate cycle wastes CPU and introduces a ~0ms gap where no interval is running — under load this can cause skipped seconds. The `setTimeLeft(s => s - 1)` functional updater already needs no closure over `timeLeft`.

**Fix:**
```ts
// FullMockAssessment.tsx — remove timeLeft from deps
}, [phase]);          // was: [phase, timeLeft]

// Assessment.tsx — remove timeLeft from deps  
}, [phase, isLoadingSession]);   // was: [phase, timeLeft, isLoadingSession]
```

---

### P1-2 · Student lands on blank results screen if mock submit throws
**File:** `FullMockAssessment.tsx:399–413`

`setPhase("scoring")` fires first, then the submit is awaited inside try/catch. If `callBackend` throws (network, 5xx), the catch block logs and exits — but `setTimeout(() => setPhase("results"), 3500)` is **outside** the try block and always fires. The student transitions to `renderResults()` with `mockResults = null`: zero momentum, empty skill cards, no band score shown.

**Fix:**
```ts
setPhase("scoring");
let submitOk = false;
try {
  const res = await callBackend(...);
  if (res.success) { setMockResults(res); submitOk = true; }
} catch (err) { console.error(err); }

if (submitOk) {
  setTimeout(() => setPhase("results"), 3500);
} else {
  setPhase("submitError"); // new phase — show "Submission failed, tap to retry" UI
}
```

---

### P1-3 · Writing debounce not flushed before final section submit — last typed answer lost
**File:** `FullMockAssessment.tsx` — `handleSectionComplete`

`persistWritingDebounced` schedules a 1500ms timeout. When the student finishes typing a Writing prompt and immediately clicks "Submit Assessment", `handleSectionComplete` is called without flushing the pending debounce. The in-flight timeout fires 1.5s later against the old question ID — or never, if the component unmounts first. This same flush already exists in `handleNextQuestion` (line 440); it just needs to be applied to the submit path too.

**Fix:** Add at the top of `handleSectionComplete`:
```ts
const handleSectionComplete = useCallback(async () => {
  // Flush any pending writing save before advancing
  if (writingDebounceRef.current) { clearTimeout(writingDebounceRef.current); writingDebounceRef.current = null; }
  if (currentQ && answers[currentQ.id]) persistAnswer(currentQ.id, answers[currentQ.id]);
  if (!sections) return;
  // ... rest unchanged
}, [sections, currentSectionIdx]);
```

---

### P1-4 · Empty IA question pool silently creates a session — student scores band 1 with nothing to answer
**File:** `iaController.ts` — `getIAQuestions`

`fetchSectionQuestions` returns `{ questions: [] }` when the bank for a sub-skill is depleted. The controller proceeds to create an `IASession` with zero question IDs. On submit, `processIASession` grades zero MCQs and zero AI questions — scoring logic returns the minimum combined band. Student gets a band-1 score for a test they couldn't actually take. Their IA slot is consumed.

**Fix:** Reject before session creation:
```ts
if (rawSection1.questions.length === 0 || rawSection2.questions.length === 0) {
  return res.status(503).json({
    success: false,
    error: 'question_bank_insufficient',
    message: 'Question bank is being refreshed. Please try again in a few minutes.'
  });
}
```

---

### P1-5 · Gemini failure during mock grading leaves session `IN_PROGRESS` forever
**File:** `mockController.ts` — `submitMock` AI grading block

AI grading jobs run via `Promise.all(aiJobs)`. If any Gemini call throws (API quota, network error, missing key), the entire endpoint returns 500. The session status was never updated to `COMPLETED` — it stays `IN_PROGRESS`. On retry, the student hits the "active session found" guard and is redirected to resume. But the session has no graded answers to show. **The student's monthly mock slot is permanently locked.**

**Fix:** Catch AI grading failures and fall back to MCQ-only scoring — never leave the session stranded:
```ts
let aiResults: AiGradingResult[] = [];
try {
  aiResults = await Promise.all(aiJobs);
} catch (err) {
  console.error('[Mock] AI grading failed, scoring MCQ-only', err);
  // aiResults stays empty — skill bands computed from MCQ scores only
  // Session will still be completed — slot is not lost
}
// Continue to scoring transaction unconditionally
```

---

## P2 — Medium Priority

### P2-1 · Concurrent EARNED mock eligibility check race — momentum can go negative
**File:** `mockController.ts` — EARNED attempt path

The momentum threshold check (≥ `earned_mock_cost`) is done before the transaction. Two concurrent EARNED requests both read `momentum_score = 1500`, both pass the threshold, both create sessions, both decrement the cost. Final balance: `1500 − cost − cost`, potentially below zero or below the platform floor.

**Fix:** Move the check inside the transaction:
```ts
await prisma.$transaction(async (tx) => {
  const student = await tx.institute_students.findUniqueOrThrow({ where: { id } });
  if (student.momentum_score < earnedMockCost) throw new Error('insufficient_momentum');
  await tx.institute_students.update({ data: { momentum_score: { decrement: earnedMockCost } } });
  // create session inside same tx
});
```

---

### P2-2 · `transcriptAccumRef` not cleared on section/question change — prior speech bleeds into next question
**File:** `FullMockAssessment.tsx:304–312`

The section-change cleanup effect stops recognition and nulls `recognitionRef`, but leaves `transcriptAccumRef.current` intact. If the browser fires a delayed `onresult` event after cleanup (common in Chrome/Safari), the accumulator appends it. When the next speaking question starts recording, `transcriptAccumRef.current` already contains the tail of the previous answer — it prepends to the new transcript.

**Fix:** One additional line in the cleanup effect:
```ts
if (recognitionRef.current) {
  try { recognitionRef.current.stop(); } catch { }
  recognitionRef.current = null;
}
transcriptAccumRef.current = "";  // ← add this
setLiveTranscript("");
```

---

### P2-3 · `carry_forward_subskills` not Array-checked before `.filter()` — throws on corrupt DB row
**File:** `iaController.ts:572`

`lastMissed?.carry_forward_subskills` is typed as `Prisma.JsonValue` and cast directly as `any[]`. If the JSON field is a string, number, or null (possible via data migration, early records, or manual DB edit), calling `.filter()` on it throws a runtime TypeError. This crashes `getIAQuestions` for **any student whose last IA was a miss** — they can never start a new IA.

**Fix:**
```ts
const carryForward = Array.isArray(lastMissed?.carry_forward_subskills)
  ? (lastMissed.carry_forward_subskills as SubSkillRef[]).filter(s => !recentlyTestedSet.has(s.sub_skill))
  : [];
```

---

## Already Fixed This Session

| ID | Description |
|----|-------------|
| IA-F-01 | `handleAutoSubmit` stale closure on timer expiry |
| IA-F-02 | Timer re-registers every second · latestRef pattern introduced |
| IA-F-03 | `resumeDeadline` extended on every keypress |
| IA-F-04 | +50 momentum re-awarded on every reset cycle |
| IA-F-05 | `handleNext` scored using stale `answers` |
| IA-F-06 | Progress bar used full 20-min denominator during resume |
| IA-F-07 | `handleResume` didn't restore `currentQ` |
| IA-F-08 | `tutorFiredRef` never reset between IA cycles |
| IA-F-11 | Empty questions array rendered `null` — blank screen deadlock |
| IA-F-12 | `w.result!` non-null assertion on nullable |
| IA-F-13 | `IAScheduleWidget` returned `null` during load — layout shift |
| MK-B-06 | Double-submit returned error instead of cached result |
| MK-B-07 | Active session check filtered by month — missed cross-month resume |
| MK-B-08 | Answer field type not validated — object/array accepted |
| MK-B-10 | W/S sub-skill score divergence between response and DB write |
| MK-B-11 | Documented intentional 3-hour client-side enforcement |
| MK-F-01 | Stale `sessionId` in `handleSectionComplete` — `sessionIdRef` pattern |
| MK-F-02–03 | Misleading timer labels · `setAnswers({})` wipe on section advance |
| MK-F-04 | Writing debounce ref not nulled after `clearTimeout` |
| MK-F-05, 07–08 | `iaStatus` null crash · `awardMomentum` stub · dead widget render branch |
| MK-F-10–12 | `realBand > 0` sentinel · `isRestoring` dead state · wrong CTA label |
| IN-01–06 | Missing redirect · slug-based navigation · `band` null types · average skew · sort NaN · duplicate routes |

---

## Intentionally Skipped

| ID | Reason |
|----|--------|
| MK-F-06 | Section timer ignoring backend remaining time — requires `section_time_remaining_ms` in advance response. Backend change needed. |
| IA-F-10 | Widget vs. IA page using different eligibility sources — architectural refactor, out of scope for this sprint. |
