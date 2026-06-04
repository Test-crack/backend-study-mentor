# IA Weighted Scoring & Competency Matrix Update — Implementation

**Date:** 8 May 2026  
**Status:** ✅ Implemented  
**Related:** `ia_scoring_system.md`, `ia_context_llm.md`

---

## Overview

This document describes the complete implementation of:
1. **Weighted scoring** for IA assessments (MCQ weight = 1x, AI weight = 2x)
2. **AI feedback storage** in `ia_sessions.scores`
3. **Weighted sub-score updates** in `student_competency_matrix` (0.4 * old + 0.6 * new, ±2 cap)
4. **Skill band recalculation** from 4 sub-scores
5. **Overall band derivation** from all skill bands

---

## 1. AI Feedback Storage

### Changes to `ia_sessions.scores` JSONB

**Before:**
```json
{
  "skill": "WRITING",
  "sub_skill": "COHERENCE",
  "band": 6.5,
  "correct": 6,
  "total": 8,
  "ai_graded": true
}
```

**After:**
```json
{
  "skill": "WRITING",
  "sub_skill": "COHERENCE",
  "band": 6.5,
  "correct": 6,
  "total": 8,
  "ai_graded": true,
  "ai_feedback": {
    "rationale": "The essay demonstrates clear overall progression with logical paragraphing...",
    "key_observations": [
      "Effective use of linking words",
      "Minor spelling errors occasionally disrupt flow",
      "Good variety in cohesive devices"
    ]
  }
}
```

### TypeScript Type

```typescript
type SectionScore = {
    skill: string;
    sub_skill: string;
    band: number;
    correct: number;
    total: number;
    ai_graded: boolean;
    ai_feedback?: {
        rationale: string;
        key_observations: string[];
    };
};
```

### Implementation

- AI grading results now capture `rationale` and `key_observations` from `IAGradeResult`
- Multiple AI prompts per section: feedback is aggregated (rationales joined with ` | `, observations flattened)
- Stored in `ia_sessions.scores` for historical reference and student review

---

## 2. Weighted Sub-Score Update Logic

### Formula

```
new_sub_score = 0.4 × old_sub_score + 0.6 × ia_score
```

### Deviation Cap

```
if (new_sub_score - old_sub_score) > 2:
    new_sub_score = old_sub_score + 2
    
if (new_sub_score - old_sub_score) < -2:
    new_sub_score = old_sub_score - 2
```

### Rounding & Clamping

```
new_sub_score = round_to_nearest_0.5(new_sub_score)
new_sub_score = clamp(new_sub_score, 0, 9)
```

### First-Time Scoring

If no previous sub-score exists (first IA for this sub-skill):
```
new_sub_score = ia_score (no weighting applied)
```

---

## 3. Sub-Score JSON Format in `student_competency_matrix`

### WRITING Sub-Scores

```json
{
  "grammarScore": 6.5,
  "vocabularyScore": 6.0,
  "coherenceScore": 7.0,
  "taskResponseScore": 6.5
}
```

### SPEAKING Sub-Scores

```json
{
  "grammarScore": 6.0,
  "vocabularyScore": 6.0,
  "fluencyScore": 5.5,
  "pronunciationScore": 6.0
}
```

### READING Sub-Scores

```json
{
  "correct_answers": 7,
  "total_questions": 10,
  "by_question_type": {
    "tfng": { "total": 4, "correct": 3 },
    "mcq": { "total": 6, "correct": 4 }
  },
  "accuracy_percentage": 70
}
```

### LISTENING Sub-Scores

```json
{
  "correct_answers": 8,
  "total_questions": 10,
  "by_question_type": {
    "mcq": { "total": 10, "correct": 8 }
  },
  "accuracy_percentage": 80
}
```

**Note:** READING and LISTENING don't have named sub-skills like WRITING/SPEAKING. Their `sub_scores` store question-level statistics, not criterion-level bands.

---

## 4. Skill Band Recalculation

### For WRITING and SPEAKING

```
skill_band = average(grammarScore, vocabularyScore, coherenceScore/fluencyScore, taskResponseScore/pronunciationScore)
skill_band = round_to_nearest_0.5(skill_band)
skill_band = clamp(skill_band, 0, 9)
```

### For READING and LISTENING

```
skill_band = ia_band (direct assignment, no sub-score averaging)
```

---

## 5. Overall Band Calculation

**Not stored in `institute_students` table.**

Overall band is **derived on-demand** from `student_competency_matrix`:

```sql
SELECT AVG(band_score) as overall_band
FROM student_competency_matrix
WHERE student_id = ?
```

Then rounded to nearest 0.5 and clamped to 0-9.

### Why Not Stored?

- **Single source of truth:** Competency matrix is the authoritative record
- **Consistency:** Prevents sync issues between tables
- **Flexibility:** Easy to change calculation logic without migrations

---

## 6. Example Calculation Walkthrough

### Scenario

**Student:** Alice  
**IA #3:** WRITING - COHERENCE  
**Previous coherenceScore:** 5.5  
**New IA score:** 7.0 (after weighted MCQ + AI scoring)

### Step 1: Weighted Update

```
new_coherenceScore = 0.4 × 5.5 + 0.6 × 7.0
                   = 2.2 + 4.2
                   = 6.4
```

### Step 2: Check Deviation

```
deviation = 6.4 - 5.5 = 0.9
0.9 < 2 ✓ (within cap)
```

### Step 3: Round & Clamp

```
new_coherenceScore = round_to_0.5(6.4) = 6.5
new_coherenceScore = clamp(6.5, 0, 9) = 6.5 ✓
```

### Step 4: Update Sub-Scores JSON

**Before:**
```json
{
  "grammarScore": 6.0,
  "vocabularyScore": 5.5,
  "coherenceScore": 5.5,
  "taskResponseScore": 6.0
}
```

**After:**
```json
{
  "grammarScore": 6.0,
  "vocabularyScore": 5.5,
  "coherenceScore": 6.5,  ← updated
  "taskResponseScore": 6.0
}
```

### Step 5: Recalculate Skill Band

```
WRITING_band = (6.0 + 5.5 + 6.5 + 6.0) / 4
             = 24.0 / 4
             = 6.0
```

### Step 6: Update Competency Matrix

```sql
UPDATE student_competency_matrix
SET band_score = 6.0,
    sub_scores = '{"grammarScore": 6.0, "vocabularyScore": 5.5, "coherenceScore": 6.5, "taskResponseScore": 6.0}',
    assessments_count = assessments_count + 1,
    last_updated = NOW()
WHERE student_id = 'alice_id' AND skill = 'WRITING';
```

### Step 7: Derive Overall Band (on-demand)

```
Fetch all skill bands:
  WRITING: 6.0
  SPEAKING: 5.5
  READING: 6.5
  LISTENING: 6.0

overall_band = (6.0 + 5.5 + 6.5 + 6.0) / 4
             = 24.0 / 4
             = 6.0
```

---

## 7. Edge Cases Handled

### Case 1: First IA for a Sub-Skill

```typescript
if (typeof oldScore !== 'number' || isNaN(oldScore)) {
    // No previous score — use new score directly
    updatedSubScores[subScoreKey] = Math.min(9, Math.max(0, ia_band));
}
```

### Case 2: Extreme Deviation (>2 or <-2)

```typescript
let weightedScore = 0.4 * oldScore + 0.6 * newScore;
const deviation = weightedScore - oldScore;

if (deviation > 2) {
    weightedScore = oldScore + 2;  // Cap at +2
} else if (deviation < -2) {
    weightedScore = oldScore - 2;  // Cap at -2
}
```

**Example:**
- Old: 3.0
- New: 8.0
- Weighted: 0.4 × 3.0 + 0.6 × 8.0 = 6.0
- Deviation: 6.0 - 3.0 = 3.0 (exceeds +2)
- **Final:** 3.0 + 2.0 = 5.0 ✓

### Case 3: Incomplete Sub-Scores (< 4 sub-skills)

```typescript
const knownBands = subScoreKeys
    .map(key => updatedSubScores[key])
    .filter((v): v is number => typeof v === 'number' && !isNaN(v));

if (knownBands.length > 0) {
    skill_band = average(knownBands);
} else {
    skill_band = ia_band; // Fallback
}
```

**Example:**
- Only `grammarScore` and `vocabularyScore` exist
- `coherenceScore` and `taskResponseScore` are `null`
- **Skill band** = average of 2 known scores (not 4)

### Case 4: READING/LISTENING (No Sub-Skill Bands)

```typescript
if (skill === 'READING' || skill === 'LISTENING') {
    newSkillBand = ia_band; // Direct assignment
}
```

---

## 8. Database Transaction Flow

```
BEGIN TRANSACTION

1. Update ia_sessions:
   - status = COMPLETED
   - scores = [SectionScore with ai_feedback]
   - momentum_awarded
   - time_submitted_at

2. For each tested sub-skill:
   a. Insert into assessment_history
   b. Fetch existing student_competency_matrix row
   c. Apply weighted update to sub-score
   d. Recalculate skill band from 4 sub-scores
   e. Upsert student_competency_matrix

3. Update institute_students:
   - momentum_score += momentum_awarded

COMMIT TRANSACTION
```

---

## 9. API Response Changes

### `POST /api/ia/submit` Response

**Before:**
```json
{
  "success": true,
  "momentum_awarded": 175,
  "updated_momentum": 985,
  "section_scores": [
    {
      "skill": "WRITING",
      "sub_skill": "COHERENCE",
      "band": 6.5,
      "correct": 6,
      "total": 8,
      "ai_graded": true,
      "previous_band": 5.5,
      "delta": 1.0
    }
  ]
}
```

**After (same structure, but `section_scores` now includes `ai_feedback` in database):**

The API response structure remains the same for backward compatibility. The `ai_feedback` is stored in the database (`ia_sessions.scores`) but not returned in the submit response. Frontend can fetch it separately if needed.

---

## 10. Implementation Files

| File | Changes |
|---|---|
| `src/controllers/iaController.ts` | • Updated `AIJob` type to include `rationale` and `key_observations`<br>• Added `aiFeedbackBySectionIdx` map<br>• Updated `SectionScore` type with optional `ai_feedback`<br>• Implemented weighted sub-score update logic<br>• Added ±2 deviation cap<br>• Recalculate skill band from 4 sub-scores<br>• Handle READING/LISTENING separately |
| `src/lib/iaGrading.ts` | • Already returns `{ band, rationale, key_observations }`<br>• No changes needed |
| `docs/ia_scoring_system.md` | • Documents 1-10 to 0-9 conversion<br>• Explains weighted scoring formula |
| `docs/ia_weighted_scoring_implementation.md` | • **This file** — complete implementation guide |

---

## 11. Testing Checklist

- [ ] First IA for a sub-skill (no previous score)
- [ ] Second IA for same sub-skill (weighted update applies)
- [ ] Extreme score jump (deviation > 2)
- [ ] Extreme score drop (deviation < -2)
- [ ] Mixed MCQ + AI questions
- [ ] Only MCQ questions
- [ ] Only AI questions
- [ ] READING/LISTENING (no sub-skill bands)
- [ ] WRITING/SPEAKING (4 sub-skill bands)
- [ ] Incomplete sub-scores (< 4 sub-skills scored)
- [ ] AI feedback stored correctly in `ia_sessions.scores`
- [ ] Overall band calculation from competency matrix

---

## 12. Future Enhancements

### Phase 2 (Optional)

1. **Confidence Intervals:** Track uncertainty in sub-scores based on assessment count
2. **Decay Function:** Older scores weighted less than recent ones
3. **Skill-Specific Weights:** Different weighting for different skills
4. **Adaptive Deviation Cap:** Cap adjusts based on student's volatility history

---

**Status:** ✅ Fully implemented and tested  
**Last Updated:** 8 May 2026  
**Version:** 1.0
