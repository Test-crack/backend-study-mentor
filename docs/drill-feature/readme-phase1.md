# Drill Session: Phase 1 — Next Action Drill API

This plan outlines the creation of the `/student/next-action-drill` route to serve an intelligent, rotating queue of drill recommendations.

## User Review Required
> [!IMPORTANT]
> - The API will now return a **list** of remaining drills, not a single item. This enables the frontend to display a "queue" or carousel of next actions.
> - **24-Hour Cooldown Filter**: To rigorously prevent repetitive drills, any `sub_skill` completed in a `DrillSession` within the last 24 hours will be entirely stripped from the returned list.
> - If all 10 subskills were practiced in 24 hours, the frontend receives an empty array and a success message.

## Proposed Changes

---

### Controller & Business Logic

#### [NEW] [drillController.ts](file:///e:/FreeLance/edtech/backend-study-mentor/src/controllers/drillController.ts)
- **Method `getNextActionDrill`**:
  1. Fetch `student_id` via auth middleware.
  2. **Query Competency Matrix:** Fetch all 4 skill entries for the student to extract `band_score` and `sub_scores`.
  3. **Query DrillSessions:** Fetch all `DrillSession` records for this student where `created_at` > `NOW() - 24 HOURS`. Extract a composite key (e.g. `Writing-grammar`) to form a "Practiced Set".
  4. **Extract & Flatten (The 10 Base Subskills):** Map the matrix data into a flat array of 10 items:
     - 4 for Writing (`grammar`, `coherence`, `vocabulary`, `taskResponse`)
     - 4 for Speaking (`fluency`, `grammar`, `vocabulary`, `pronunciation`)
     - 1 for Reading (`Reading`)
     - 1 for Listening (`Listening`)
  5. **Sort & Alternate Rank:**
     - First, order flat items by `subscore` (Ascending, so lowest scores appear first).
     - Second, break ties by `skill_band_score` (Ascending). 
     - Third, apply an **Alternator Logic**: if multiple items are tied perfectly, interleave them so that we don't return "4 Writing subskills" back-to-back at the front. (e.g. Writing-grammar, then Speaking-fluency, then Writing-coherence).
  6. **Apply the 24-Hour Filter:** Remove any item from the sorted list if its `Skill-SubSkill` combination exists in the "Practiced Set".
  7. **Return Payload:** Send back the filtered, prioritized list.
     ```json
     {
        "recommended_drills": [
             { "skill": "Writing", "sub_skill": "grammar", "skill_band_score": 5.0, "sub_skill_score": 4.5 },
             { "skill": "Speaking", "sub_skill": "fluency", "skill_band_score": 5.5, "sub_skill_score": 4.5 },
             // ... Remaining Unpracticed items (max 10)
        ],
        "message": "Drills available for today." // Or "You have completed all 10 recommended drills for today!" if empty.
     }
     ```

## Open Questions
> [!WARNING]
> - Since listening and reading have no subskills right now, I am artificially injecting them as `{skill: "Reading", sub_skill: "Reading"}`. This maintains identical shape on the frontend. Is that suitable?
> - The alternator logic is somewhat complex to build perfectly, but a simple tie-breaker using Alphabetical Skill Name (e.g., Reading -> Speaking -> Writing) mixed with the subscores works mathematically. I'll construct a simple round-robin sorter for ties. Let me know if that is exactly what you envisioned!

## Verification Plan
1. Send `GET /student/next-action-drill` -> Receive array of 10 items grouped by lowest weakness.
2. Manually insert `DrillSession` for Writing-grammar 2 hours ago.
3. Call `GET /student/next-action-drill` -> Receive array of 9 items, missing Writing-grammar.
4. Manually insert 9 more `DrillSession`s.
5. Call `GET /student/next-action-drill` -> Receive empty array and completion message.
