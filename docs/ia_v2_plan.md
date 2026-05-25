# IA V2 — Miss Handling & Carry-Forward Plan

## Current state (v1 baseline)

| Feature | Status |
|---|---|
| `submitIA` scoring pipeline | ✅ Done |
| `/api/ia/submit` route | ✅ Done |
| Miss detection in `getIAStatus` | ⚠️ Partial — flat `-20 × stale count`, no escalation |
| Missed IAs in history | ❌ Missing — `getIAHistory` returns COMPLETED only |
| Carry-forward in `getIAQuestions` | ❌ Missing — stored but never used |
| 2-week subskill uniqueness | ❌ Missing |
| Assessment.tsx dead code removal | ❌ ~350 lines of mock data still present |

---

## Data model (no schema change needed)

```
IASession
  status:                  PENDING | IN_PROGRESS | COMPLETED | MISSED
  selected_subskills:      [{ skill, sub_skill }]   ← what was scheduled
  carry_forward_subskills: [{ skill, sub_skill }]   ← copy of selected_subskills on MISSED
  scores:                  SectionScore[]            ← filled on COMPLETED only
  momentum_awarded:        Int                       ← filled on COMPLETED; negative on MISSED
```

---

## Phase 1 — Correct miss penalty (escalating)

**File:** `iaController.ts` → `getIAStatus` miss-detection block (lines 124–144)

### Rules
- 1st consecutive miss in current "streak": **−20 pts**
- 2nd+ consecutive miss in same streak: **−40 pts each**
- A "streak" resets when a session is COMPLETED between misses
- Multiple stale sessions found in one sweep → process each independently

### Algorithm
```
for each stale session:
  recentMissCount = count IASession where student_id=this, status=MISSED,
                    ia_date >= (stale.ia_date - 30 days), ia_date < stale.ia_date
  # "recent" looks behind from the missed session's own date
  penalty = recentMissCount >= 1 ? 40 : 20

  iASession.update → status=MISSED, carry_forward_subskills=selected_subskills,
                     momentum_awarded = -penalty

  institute_students.update → momentum_score: { decrement: penalty }

  # Clamp to 0 (never go negative)
  if student.momentum_score - penalty < 0:
    decrement only down to 0
```

### Response additions
`getIAStatus` should add to the returned payload:
```json
{
  "missed_count": 2,
  "penalties_applied": [
    { "ia_number": 1, "penalty": 20, "ia_date": "2026-05-10" },
    { "ia_number": 2, "penalty": 40, "ia_date": "2026-05-17" }
  ]
}
```

---

## Phase 2 — Missed IAs in history

**File:** `studentController.ts` → `getIAHistory`

### Change
- Include `status: { in: [COMPLETED, MISSED] }` instead of just COMPLETED
- Return `momentum_awarded` as-is (negative for MISSED sessions)
- Return `carry_forward_subskills` so UI can show "these will be retried"

### Frontend `AssessmentHistoryPage.tsx` — `IASessionCard`
For MISSED entries:
- Show red "Missed" badge instead of sub-skill count badge
- Show `−N Momentum` in rose/red instead of amber
- Show `carry_forward_subskills` as "Will be retried next IA" chips
- No expandable breakdown (no scores stored)
- Overall band area: show `—` with "No submission"

---

## Phase 3 — Carry-forward + 2-week uniqueness in `getIAQuestions`

**Files:** `iaController.ts` (getIAQuestions), `subskillSelector.ts`

### 2-week uniqueness rule
> A sub-skill that appeared in any COMPLETED session in the last 14 days should not
> be scheduled again. Sub-skills from MISSED sessions don't count as "covered" —
> they still need to be tested.

### Carry-forward rule
> Sub-skills from the most recent MISSED session(s) get scheduling priority in the
> next IA, unless that sub-skill was COMPLETED successfully in the last 14 days.

### Algorithm (inserted after stale-session sweep, before session creation)
```
Step A — gather context
  recentCompleted = iASession.findMany where status=COMPLETED, ia_date >= today-14
  recentlyTestedSubSkills = flatten(recentCompleted.map(s => s.selected_subskills))
                            as Set<sub_skill>

  lastMissed = iASession.findFirst where status=MISSED, order by ia_date DESC
  carryForward = (lastMissed?.carry_forward_subskills ?? [])
                 .filter(s => !recentlyTestedSubSkills.has(s.sub_skill))
                 // only carry forward if not already completed recently

Step B — build selectedSubskills (always exactly 2)
  if carryForward.length >= 2:
    selectedSubskills = carryForward.slice(0, 2)
  elif carryForward.length == 1:
    fresh = selectPrioritySubSkills(student.id, exclude = recentlyTestedSubSkills ∪ {carryForward[0].sub_skill})
    selectedSubskills = [carryForward[0], fresh.primary]
  else:
    fresh = selectPrioritySubSkills(student.id, exclude = recentlyTestedSubSkills)
    selectedSubskills = [fresh.primary, fresh.secondary]

Step C — dedup guard
  if selectedSubskills[0].sub_skill == selectedSubskills[1].sub_skill:
    replace second with next candidate from selectPrioritySubSkills
```

### `subskillSelector.ts` change
Add optional parameter: `excludeSubSkills?: Set<string>`
- Before ranking, filter out any `(skill, sub_skill)` pair where `sub_skill` is in `excludeSubSkills`
- Fallback still works: if all sub-skills are excluded, allow any

---

## Phase 4 — Frontend Assessment.tsx dead-code removal

**File:** `ai-study-mentor/src/features/student/components/Assessment.tsx`

Remove:
- Lines ~125–257: `LISTENING_POOLS`, `READING_DATA`, `WRITING_DATA`, `SPEAKING_DATA` constants
- Lines ~258–277: `generateMockResult()` function
- Lines ~434–475: `fetchAssessmentData()` and `initializeSessionState()` (never called in live path)

Live path: `beginFullTest()` → `GET /api/ia/questions` → real questions only.

---

## Phase 5 — Edge cases & guards

| Scenario | Handling |
|---|---|
| Momentum would go below 0 | Clamp: `Math.max(0, current - penalty)` |
| Student has no missed sessions | carry_forward = [], select fresh normally |
| All sub-skills recently completed | uniqueness relaxed — allow repeat of oldest |
| Same sub-skill in carry-forward twice (shouldn't happen) | dedup before storing |
| Student completes IA before status check runs | status stays IN_PROGRESS, no miss |
| Multiple sessions stale at once | Process each in order (ascending ia_date) for correct penalty escalation |

---

## Execution order

1. **Phase 1** — Fix miss penalty (backend only, `getIAStatus`)
2. **Phase 2** — Missed sessions in history (backend `getIAHistory` + frontend `IASessionCard`)
3. **Phase 3** — Carry-forward + uniqueness (`getIAQuestions` + `subskillSelector.ts`)
4. **Phase 4** — Frontend dead-code removal (`Assessment.tsx`)
5. **Phase 5** — Edge case verification pass

---

## Verification checklist

- [ ] Mark session MISSED manually (set ia_date to yesterday, status PENDING) → call `GET /api/ia/status` → confirm MISSED, -20 pts deducted
- [ ] Repeat for 2nd session → confirm -40 pts
- [ ] `GET /api/student/ia-history` includes MISSED entries with negative momentum
- [ ] Frontend shows "Missed" badge, rose momentum chip, carry-forward chips
- [ ] Take IA → complete → next IA doesn't repeat same sub-skills within 14 days
- [ ] Miss IA → next IA includes carry-forward sub-skills (if not recently completed)
- [ ] Momentum never goes below 0
- [ ] Assessment.tsx has no mock data constants
