# IA Scores JSONB Format — Frontend Integration Guide

**Date:** 8 May 2026  
**For:** Frontend developers integrating IA results display  
**Location:** `ia_sessions.scores` field (JSONB)

---

## Overview

The `scores` field in `ia_sessions` table stores an **array of section scores** after an IA is completed. Each IA tests 2 sub-skills (one per section), so the array always contains **exactly 2 objects**.

---

## TypeScript Type Definition

```typescript
type SectionScore = {
    skill: string;              // "WRITING" | "SPEAKING" | "READING" | "LISTENING"
    sub_skill: string;          // "GRAMMAR" | "VOCABULARY" | "COHERENCE" | "TASK_RESPONSE" | "FLUENCY" | "PRONUNCIATION" | "READING" | "LISTENING"
    band: number;               // Final IELTS band (0-9 scale, 0.5 increments)
    correct: number;            // Number of MCQ/TFNG questions answered correctly
    total: number;              // Total number of MCQ/TFNG questions in this section
    ai_graded: boolean;         // Whether this section included AI-graded prompts
    ai_feedback?: {             // Present only if ai_graded = true
        rationale: string;      // Combined rationale from all AI prompts
        key_observations: string[];  // Flattened array of all observations
    };
};

type IAScores = SectionScore[];  // Always length = 2
```

---

## Example 1: WRITING (Coherence) + SPEAKING (Fluency)

### Scenario
- Section 1: WRITING - COHERENCE (8 MCQ + 2 Writing Prompts)
- Section 2: SPEAKING - FLUENCY (8 MCQ + 2 Speaking Prompts)

### JSON Structure

```json
[
  {
    "skill": "WRITING",
    "sub_skill": "COHERENCE",
    "band": 6.5,
    "correct": 6,
    "total": 8,
    "ai_graded": true,
    "ai_feedback": {
      "rationale": "The essay demonstrates clear overall progression with logical paragraphing and effective use of cohesive devices. | Minor spelling errors occasionally disrupt the flow but do not impede understanding.",
      "key_observations": [
        "Effective use of linking words like 'first', 'then', 'finally'",
        "Logical progression of ideas throughout the response",
        "Minor over-use of 'and' as a connector in some sentences",
        "Good variety in cohesive devices overall"
      ]
    }
  },
  {
    "skill": "SPEAKING",
    "sub_skill": "FLUENCY",
    "band": 5.5,
    "correct": 7,
    "total": 8,
    "ai_graded": true,
    "ai_feedback": {
      "rationale": "The student cannot respond without noticeable pauses and relies heavily on fillers, which significantly impedes the natural flow and coherence of speech. | Frequent hesitation and pauses with over-reliance on fillers like 'uh' and 'um'.",
      "key_observations": [
        "Excessive use of 'uh' (over 50 times) causes severe choppiness",
        "Repetition of ideas and phrases instead of developing new points",
        "Limited ability to link ideas effectively",
        "Struggles to maintain flow without fillers"
      ]
    }
  }
]
```

---

## Example 2: READING + LISTENING (No AI Grading)

### Scenario
- Section 1: READING (10 TFNG/MCQ questions)
- Section 2: LISTENING (10 MCQ questions)

### JSON Structure

```json
[
  {
    "skill": "READING",
    "sub_skill": "READING",
    "band": 7.0,
    "correct": 8,
    "total": 10,
    "ai_graded": false
  },
  {
    "skill": "LISTENING",
    "sub_skill": "LISTENING",
    "band": 6.5,
    "correct": 7,
    "total": 10,
    "ai_graded": false
  }
]
```

**Note:** READING and LISTENING sections have **no `ai_feedback`** field because they only contain MCQ/TFNG questions (no writing/speaking prompts).

---

## Example 3: Only MCQ Questions (Phase 1 Seed)

### Scenario
- Section 1: WRITING - GRAMMAR (8 MCQ, no prompts yet)
- Section 2: SPEAKING - VOCABULARY (8 MCQ, no prompts yet)

### JSON Structure

```json
[
  {
    "skill": "WRITING",
    "sub_skill": "GRAMMAR",
    "band": 6.0,
    "correct": 5,
    "total": 8,
    "ai_graded": false
  },
  {
    "skill": "SPEAKING",
    "sub_skill": "VOCABULARY",
    "band": 7.0,
    "correct": 7,
    "total": 8,
    "ai_graded": false
  }
]
```

**Note:** Even though these are WRITING/SPEAKING sub-skills, `ai_graded = false` because no prompts were included (Phase 1 seed limitation).

---

## Field Descriptions

### `skill`
**Type:** `string`  
**Values:** `"WRITING"` | `"SPEAKING"` | `"READING"` | `"LISTENING"`  
**Description:** The parent IELTS skill being tested.

---

### `sub_skill`
**Type:** `string`  
**Values:**
- WRITING: `"GRAMMAR"` | `"VOCABULARY"` | `"COHERENCE"` | `"TASK_RESPONSE"`
- SPEAKING: `"GRAMMAR"` | `"VOCABULARY"` | `"FLUENCY"` | `"PRONUNCIATION"`
- READING: `"READING"` (skill-level, no sub-skills)
- LISTENING: `"LISTENING"` (skill-level, no sub-skills)

**Description:** The specific criterion being tested.

---

### `band`
**Type:** `number`  
**Range:** `0.0` to `9.0` (increments of 0.5)  
**Description:** Final IELTS band score for this sub-skill after weighted MCQ + AI scoring.

**Calculation:**
1. MCQ score: `(correct / total) × 10` → 1-10 scale
2. AI score: Already on 1-10 scale from Gemini grading
3. Weighted: `(MCQ_score × MCQ_count × 1 + AI_score × AI_count × 2) / total_weight`
4. Convert to IELTS: `(weighted_score - 1)` → 0-9 scale
5. Round to nearest 0.5

---

### `correct`
**Type:** `number`  
**Range:** `0` to `total`  
**Description:** Number of MCQ/TFNG questions answered correctly.

**Note:** This only counts auto-graded questions. AI-graded prompts are not included in this count.

---

### `total`
**Type:** `number`  
**Typical Values:** `8` (MCQ only) or `10` (READING/LISTENING)  
**Description:** Total number of MCQ/TFNG questions in this section.

**Note:** AI prompts are not included in this count. A section with 8 MCQ + 2 prompts will show `total: 8`.

---

### `ai_graded`
**Type:** `boolean`  
**Description:** Whether this section included AI-graded writing or speaking prompts.

**When `true`:** `ai_feedback` field will be present  
**When `false`:** `ai_feedback` field will be absent

---

### `ai_feedback` (optional)
**Type:** `object` or `undefined`  
**Present when:** `ai_graded = true`  
**Description:** Aggregated feedback from all AI-graded prompts in this section.

#### `ai_feedback.rationale`
**Type:** `string`  
**Description:** Combined rationale from all AI prompts, joined with ` | ` separator.

**Example:**
```
"The essay demonstrates clear overall progression with logical paragraphing. | Minor spelling errors occasionally disrupt the flow."
```

**Frontend Display:** Split by ` | ` to show as separate feedback points.

#### `ai_feedback.key_observations`
**Type:** `string[]`  
**Description:** Flattened array of all key observations from all AI prompts.

**Example:**
```json
[
  "Effective use of linking words like 'first', 'then', 'finally'",
  "Logical progression of ideas throughout the response",
  "Minor over-use of 'and' as a connector in some sentences"
]
```

**Frontend Display:** Show as bullet points or numbered list.

---

## API Response: `GET /api/ia/status`

When an IA is completed today, the status endpoint returns:

```json
{
  "success": true,
  "has_completed_session": true,
  "completed_session_scores": [
    {
      "skill": "WRITING",
      "sub_skill": "COHERENCE",
      "band": 6.5,
      "correct": 6,
      "total": 8,
      "ai_graded": true,
      "ai_feedback": {
        "rationale": "...",
        "key_observations": ["...", "..."]
      }
    },
    {
      "skill": "SPEAKING",
      "sub_skill": "FLUENCY",
      "band": 5.5,
      "correct": 7,
      "total": 8,
      "ai_graded": true,
      "ai_feedback": {
        "rationale": "...",
        "key_observations": ["..."]
      }
    }
  ],
  "completed_session_momentum": 175,
  "is_ia_day": true,
  "can_start_test": false,
  ...
}
```

**When to use:**
- Show "View Results" button if `has_completed_session = true`
- Display scores immediately without needing to call `/api/ia/submit` again

---

## API Response: `POST /api/ia/submit`

After submitting an IA, the response includes:

```json
{
  "success": true,
  "is_first_ia": false,
  "momentum_awarded": 175,
  "momentum_breakdown": [
    { "reason": "Participation", "points": 100 },
    { "reason": "Improved — Coherence", "points": 25 },
    { "reason": "Personal Best — Fluency", "points": 50 }
  ],
  "updated_momentum": 985,
  "section_scores": [
    {
      "skill": "WRITING",
      "sub_skill": "COHERENCE",
      "band": 6.5,
      "correct": 6,
      "total": 8,
      "ai_graded": true,
      "ai_feedback": {
        "rationale": "...",
        "key_observations": ["..."]
      },
      "previous_band": 5.5,
      "delta": 1.0
    },
    {
      "skill": "SPEAKING",
      "sub_skill": "FLUENCY",
      "band": 5.5,
      "correct": 7,
      "total": 8,
      "ai_graded": true,
      "ai_feedback": {
        "rationale": "...",
        "key_observations": ["..."]
      },
      "previous_band": 5.0,
      "delta": 0.5
    }
  ]
}
```

**Additional fields in submit response:**
- `previous_band`: Previous score for this sub-skill (null if first time)
- `delta`: Change from previous score (null if first time)

---

## Frontend Display Recommendations

### Result Card Layout

```
┌─────────────────────────────────────────────────────┐
│ WRITING — Coherence                                 │
│                                                     │
│ Band Score: 6.5  ↑ +1.0 vs Last IA                 │
│ MCQ Accuracy: 6/8 (75%)                            │
│                                                     │
│ AI Feedback:                                        │
│ • The essay demonstrates clear overall progression  │
│   with logical paragraphing.                        │
│ • Minor spelling errors occasionally disrupt flow.  │
│                                                     │
│ Key Observations:                                   │
│ ✓ Effective use of linking words                   │
│ ✓ Logical progression of ideas                     │
│ ⚠ Minor over-use of 'and' as connector            │
└─────────────────────────────────────────────────────┘
```

### Conditional Rendering

```typescript
// TypeScript example
function renderSectionScore(score: SectionScore) {
  return (
    <div className="section-card">
      <h3>{score.skill} — {formatSubSkill(score.sub_skill)}</h3>
      <div className="band-score">Band: {score.band}</div>
      
      {/* MCQ accuracy - always present */}
      <div className="mcq-accuracy">
        MCQ: {score.correct}/{score.total} ({Math.round(score.correct/score.total * 100)}%)
      </div>
      
      {/* AI feedback - conditional */}
      {score.ai_graded && score.ai_feedback && (
        <div className="ai-feedback">
          <h4>AI Feedback</h4>
          {score.ai_feedback.rationale.split(' | ').map((r, i) => (
            <p key={i}>{r}</p>
          ))}
          
          <h4>Key Observations</h4>
          <ul>
            {score.ai_feedback.key_observations.map((obs, i) => (
              <li key={i}>{obs}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
```

---

## Edge Cases

### Case 1: No AI Feedback (READING/LISTENING)
```json
{
  "skill": "READING",
  "sub_skill": "READING",
  "band": 7.0,
  "correct": 8,
  "total": 10,
  "ai_graded": false
  // No ai_feedback field
}
```

**Frontend:** Don't render AI feedback section. Show only band and MCQ accuracy.

---

### Case 2: AI Graded but Empty Observations
```json
{
  "skill": "WRITING",
  "sub_skill": "GRAMMAR",
  "band": 6.0,
  "correct": 5,
  "total": 8,
  "ai_graded": true,
  "ai_feedback": {
    "rationale": "The response demonstrates adequate grammatical range.",
    "key_observations": []
  }
}
```

**Frontend:** Show rationale but hide "Key Observations" section if array is empty.

---

### Case 3: Multiple Rationales (2 Prompts)
```json
{
  "ai_feedback": {
    "rationale": "First prompt feedback here. | Second prompt feedback here.",
    "key_observations": ["Obs from prompt 1", "Obs from prompt 2", "Another obs from prompt 2"]
  }
}
```

**Frontend:** Split rationale by ` | ` and display as separate paragraphs or cards.

---

## Validation Checklist

When consuming `ia_sessions.scores`:

- [ ] Check if `scores` is an array with length 2
- [ ] Validate `band` is between 0 and 9
- [ ] Validate `correct` ≤ `total`
- [ ] Check `ai_graded` before accessing `ai_feedback`
- [ ] Handle missing `ai_feedback` gracefully
- [ ] Handle empty `key_observations` array
- [ ] Split `rationale` by ` | ` for multi-prompt sections
- [ ] Display "No previous score" if `previous_band` is null (submit response only)

---

## Summary Table

| Field | Type | Always Present? | Notes |
|---|---|---|---|
| `skill` | string | ✅ Yes | Parent skill |
| `sub_skill` | string | ✅ Yes | Specific criterion |
| `band` | number | ✅ Yes | 0-9 scale, 0.5 increments |
| `correct` | number | ✅ Yes | MCQ correct count |
| `total` | number | ✅ Yes | MCQ total count |
| `ai_graded` | boolean | ✅ Yes | Whether AI prompts included |
| `ai_feedback` | object | ❌ Conditional | Only if `ai_graded = true` |
| `ai_feedback.rationale` | string | ❌ Conditional | Combined with ` \| ` |
| `ai_feedback.key_observations` | string[] | ❌ Conditional | May be empty array |

---

**Last Updated:** 8 May 2026  
**Version:** 1.0  
**Status:** ✅ Production Ready
