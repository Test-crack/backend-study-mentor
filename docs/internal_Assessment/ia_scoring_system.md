# Internal Assessment Scoring System

## Overview
The IA scoring system evaluates student performance across multiple question types with weighted scoring to reflect the importance of different assessment components.

---

## Scoring Components

### 1. MCQ/TFNG Questions (Multiple Choice / True/False/Not Given)
- **Raw Score**: `(correct answers / total questions) × 10`
- **Scale**: 1-10
- **Weight**: 1x per question
- **Auto-graded**: Exact string match (case-insensitive)

### 2. Writing/Speaking Prompts (AI-Graded)
- **Raw Score**: AI evaluation using Gemini 2.5 Flash
- **Scale**: 1-10 (integer bands)
- **Weight**: 2x per question (double the weight of MCQ)
- **Criteria Evaluated**:
  - **Writing**: Grammar, Vocabulary, Coherence, Task Response
  - **Speaking**: Grammar, Vocabulary, Fluency, Pronunciation

---

## Weighted Scoring Formula

For each sub-skill section:

```
Combined Score = (MCQ_Score × MCQ_Weight + AI_Score × AI_Weight) / Total_Weight

Where:
- MCQ_Weight = number_of_mcq_questions × 1
- AI_Weight = number_of_ai_questions × 2
- Total_Weight = MCQ_Weight + AI_Weight
```

### Example Calculation

**Section: Writing - Coherence**
- 8 MCQ questions: 6 correct → MCQ Score = (6/8) × 10 = 7.5
- 2 Writing prompts: AI scores = [8, 7] → AI Average = 7.5

```
MCQ_Weight = 8 × 1 = 8
AI_Weight = 2 × 2 = 4
Total_Weight = 8 + 4 = 12

Combined Score = (7.5 × 8 + 7.5 × 4) / 12
               = (60 + 30) / 12
               = 7.5
```

---

## Final Band Conversion

The combined score (1-10 scale) is converted to IELTS band scale (0-9):

```
IELTS_Band = (Combined_Score - 1)
Rounded to nearest 0.5
```

### Conversion Table

| Combined Score (1-10) | IELTS Band (0-9) |
|----------------------|------------------|
| 10.0                 | 9.0              |
| 9.5                  | 8.5              |
| 9.0                  | 8.0              |
| 8.5                  | 7.5              |
| 8.0                  | 7.0              |
| 7.5                  | 6.5              |
| 7.0                  | 6.0              |
| 6.5                  | 5.5              |
| 6.0                  | 5.0              |
| 5.5                  | 4.5              |
| 5.0                  | 4.0              |
| 4.5                  | 3.5              |
| 4.0                  | 3.0              |
| 3.5                  | 2.5              |
| 3.0                  | 2.0              |
| 2.5                  | 1.5              |
| 2.0                  | 1.0              |
| 1.5                  | 0.5              |
| 1.0                  | 0.0              |

---

## AI Grading Criteria

### Evaluation Factors (in priority order)

1. **Relevance to Question** (Primary)
   - Off-topic: Maximum band 3
   - Partially relevant: Cap at band 5-6
   - Fully relevant: Eligible for bands 7-10

2. **Response Length** (Secondary)
   - Writing: < 30 words → max band 4; 30-80 words → bands 5-8; > 80 words → full range
   - Speaking: < 20 words → max band 4; 20-50 words → bands 5-8; > 50 words → full range

3. **Sub-Skill Quality** (Core Assessment)
   - Evaluated against IELTS band descriptors (1-10 scale)
   - Specific to the criterion being tested

4. **Holistic IELTS Standards**
   - Strict but fair grading
   - Evidence-based scoring
   - Bands 8-10 reserved for exceptional work

### AI Response Format

```json
{
  "band": 7,
  "rationale": "The response demonstrates good coherence with clear organization...",
  "key_observations": [
    "Effective use of linking words like 'first', 'then', 'finally'",
    "Logical progression of ideas throughout the response",
    "Minor over-use of 'and' as a connector in some sentences"
  ]
}
```

---

## Edge Cases

### Only MCQ Questions
```
Combined Score = MCQ_Score
IELTS_Band = (MCQ_Score - 1), rounded to 0.5
```

### Only AI Questions
```
Combined Score = AI_Average_Score
IELTS_Band = (AI_Average_Score - 1), rounded to 0.5
```

### No Questions (shouldn't happen)
```
Combined Score = 1
IELTS_Band = 0.0
```

### Empty Response
- AI grading returns band 1 with error message
- Treated as minimum score in weighted calculation

---

## Database Storage

### `ia_sessions.scores` Field (JSONB)

```json
[
  {
    "skill": "WRITING",
    "sub_skill": "COHERENCE",
    "band": 6.5,
    "correct": 6,
    "total": 8,
    "ai_graded": true
  },
  {
    "skill": "SPEAKING",
    "sub_skill": "FLUENCY",
    "band": 7.0,
    "correct": 7,
    "total": 8,
    "ai_graded": true
  }
]
```

### `student_competency_matrix.band_score`
- Updated with the final IELTS band (0-9 scale)
- Recalculated as mean of all known sub-skill scores
- Clamped to 0-9 range to prevent database overflow

---

## Rationale for 2x Weight on AI Questions

1. **Depth of Assessment**: Writing/speaking prompts require comprehensive language production vs. recognition in MCQs
2. **IELTS Alignment**: Actual IELTS exam weights productive skills more heavily
3. **Skill Demonstration**: Open-ended responses better demonstrate true language proficiency
4. **Grading Complexity**: AI evaluation considers multiple factors (relevance, length, quality) vs. binary correct/incorrect

---

## Implementation Files

- **Grading Logic**: `src/lib/iaGrading.ts`
- **Scoring Calculation**: `src/controllers/iaController.ts` (submitIA function)
- **Band Descriptors**: Defined in `iaGrading.ts` for each sub-skill (1-10 scale)

---

**Last Updated**: May 8, 2026  
**Version**: 2.0 (Weighted Scoring System)
