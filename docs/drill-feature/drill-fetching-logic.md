# Drill Fetching Logic - Complete Documentation

## Overview
This document explains how drills are fetched, ordered, and prioritized for students in the frontend based on their competency scores.

---

## Primary Endpoint: Get Next Action Drill

**Endpoint:** `GET /api/student/next-action-drill`

**Purpose:** Returns a prioritized list of drills for the student to practice, ordered by weakest skills first.

---

## Step-by-Step Logic

### 1. Fetch Student's Competency Matrix
```typescript
const matrices = await prisma.studentCompetencyMatrix.findMany({
  where: { student_id: student.id }
});
```

**Competency Matrix Structure:**
- `skill`: WRITING, SPEAKING, READING, LISTENING
- `band_score`: Overall skill score (0-9)
- `sub_scores`: JSONB object with sub-skill scores
  - Writing: `grammarScore`, `coherenceScore`, `vocabularyScore`, `taskResponseScore`
  - Speaking: `fluencyScore`, `grammarScore`, `vocabularyScore`, `pronunciationScore`
  - Reading/Listening: Use overall `band_score`

---

### 2. Check Today's Completed Drills
```typescript
const practicedSessions = await prisma.drillSession.findMany({
  where: {
    student_id: student.id,
    status: { in: ['DRILL_DONE', 'APPLY_DONE'] },
    created_at: { gte: todayStartIST() }
  }
});
```

**Creates a Set:**
```typescript
const practicedSet = new Set(['WRITING-GRAMMAR', 'SPEAKING-FLUENCY', ...]);
```

---

### 3. Build Drill Items Array

**For Each Skill in Competency Matrix:**

#### Writing Skills
```typescript
items.push({
  skill: 'WRITING',
  sub_skill: 'GRAMMAR',
  skill_band_score: 5.5,
  sub_skill_score: 4.5  // from sub_scores.grammarScore
});
```

Sub-skills: `GRAMMAR`, `COHERENCE`, `VOCABULARY`, `TASK_RESPONSE`

#### Speaking Skills
```typescript
items.push({
  skill: 'SPEAKING',
  sub_skill: 'FLUENCY',
  skill_band_score: 6.0,
  sub_skill_score: 5.0  // from sub_scores.fluencyScore
});
```

Sub-skills: `FLUENCY`, `GRAMMAR`, `VOCABULARY`, `PRONUNCIATION`

#### Reading & Listening
```typescript
items.push({
  skill: 'READING',
  sub_skill: 'READING',
  skill_band_score: 6.5,
  sub_skill_score: 6.5  // same as band_score
});
```

---

### 4. Sort Items Within Each Skill

**Group by Skill:**
```typescript
const bySkill = {
  'WRITING': [item1, item2, item3, item4],
  'SPEAKING': [item1, item2, item3, item4],
  'READING': [item1],
  'LISTENING': [item1]
};
```

**Sort Each Skill's Items by Score (Ascending):**
```typescript
bySkill[skill].sort((a, b) => {
  // Primary: sub_skill_score (lowest first)
  if (a.sub_skill_score !== b.sub_skill_score) 
    return a.sub_skill_score - b.sub_skill_score;
  
  // Secondary: skill_band_score (lowest first)
  return a.skill_band_score - b.skill_band_score;
});
```

**Example After Sorting:**
```javascript
WRITING: [
  { sub_skill: 'GRAMMAR', sub_skill_score: 4.5 },      // Weakest
  { sub_skill: 'VOCABULARY', sub_skill_score: 5.0 },
  { sub_skill: 'COHERENCE', sub_skill_score: 5.5 },
  { sub_skill: 'TASK_RESPONSE', sub_skill_score: 6.0 }
]
```

---

### 5. Prioritize Skills by Weakest Score

**Sort Skill Queues:**
```typescript
const skillQueues = Object.values(bySkill).sort((a, b) => {
  // Compare the FIRST item (weakest) of each skill
  if (a[0].sub_skill_score !== b[0].sub_skill_score) 
    return a[0].sub_skill_score - b[0].sub_skill_score;
  
  if (a[0].skill_band_score !== b[0].skill_band_score) 
    return a[0].skill_band_score - b[0].skill_band_score;
  
  // Deterministic fallback
  return a[0].skill.localeCompare(b[0].skill);
});
```

**Example:**
```javascript
[
  WRITING:   [Grammar: 4.5, Vocabulary: 5.0, ...],  // Weakest overall
  SPEAKING:  [Fluency: 5.0, Grammar: 5.5, ...],
  LISTENING: [Listening: 6.0],
  READING:   [Reading: 6.5]                         // Strongest
]
```

---

### 6. Interleave (Round Robin)

**Purpose:** Distribute drills across different skills to avoid repetition.

**Algorithm:**
```typescript
const interleaved = [];
while (any queue has items) {
  for (each skillQueue) {
    if (queue.length > 0) {
      interleaved.push(queue.shift());  // Take first item
    }
  }
}
```

**Result:**
```javascript
[
  { skill: 'WRITING', sub_skill: 'GRAMMAR', score: 4.5 },       // Round 1
  { skill: 'SPEAKING', sub_skill: 'FLUENCY', score: 5.0 },      // Round 1
  { skill: 'LISTENING', sub_skill: 'LISTENING', score: 6.0 },   // Round 1
  { skill: 'READING', sub_skill: 'READING', score: 6.5 },       // Round 1
  { skill: 'WRITING', sub_skill: 'VOCABULARY', score: 5.0 },    // Round 2
  { skill: 'SPEAKING', sub_skill: 'GRAMMAR', score: 5.5 },      // Round 2
  { skill: 'WRITING', sub_skill: 'COHERENCE', score: 5.5 },     // Round 3
  { skill: 'SPEAKING', sub_skill: 'VOCABULARY', score: 6.0 },   // Round 3
  ...
]
```

---

### 7. Filter Out Completed Drills

```typescript
const recommended_drills = interleaved.filter(item =>
  !practicedSet.has(`${item.skill}-${item.sub_skill}`)
);
```

**Removes drills already completed today.**

---

### 8. Response

```json
{
  "success": true,
  "recommended_drills": [
    {
      "skill": "WRITING",
      "sub_skill": "GRAMMAR",
      "skill_band_score": 5.5,
      "sub_skill_score": 4.5
    },
    {
      "skill": "SPEAKING",
      "sub_skill": "FLUENCY",
      "skill_band_score": 6.0,
      "sub_skill_score": 5.0
    }
  ],
  "daily_sessions_completed": 2,
  "message": "Here are your prioritised drills."
}
```

---

## Ordering Summary

### Priority Order (Highest to Lowest):
1. **Lowest sub_skill_score** across all skills
2. **Lowest skill_band_score** (tiebreaker)
3. **Round-robin distribution** across skills
4. **Alphabetical skill name** (deterministic fallback)

### Example Scenario:

**Student Scores:**
- Writing: 5.5 (Grammar: 4.5, Vocabulary: 5.0, Coherence: 5.5, Task Response: 6.0)
- Speaking: 6.0 (Fluency: 5.0, Grammar: 5.5, Vocabulary: 6.0, Pronunciation: 6.5)
- Reading: 6.5
- Listening: 6.0

**Drill Order:**
1. Writing - Grammar (4.5) ← Weakest
2. Writing - Vocabulary (5.0)
3. Speaking - Fluency (5.0)
4. Writing - Coherence (5.5)
5. Speaking - Grammar (5.5)
6. Listening - Listening (6.0)
7. Speaking - Vocabulary (6.0)
8. Writing - Task Response (6.0)
9. Reading - Reading (6.5)
10. Speaking - Pronunciation (6.5)

---

## Additional Endpoints

### Get Drill Recommendation (After Completing a Drill)

**Endpoint:** `GET /api/student/drill-recommendation?skill=WRITING&sub_skill=GRAMMAR`

**Purpose:** Returns ONE video recommendation after completing a drill.

**Matching Logic (Fallback Chain):**

1. **Exact Match:** skill + sub_skill + level + VIDEO type
2. **Skill + Sub-skill:** Any level, VIDEO type
3. **Skill + Level:** Any sub_skill, VIDEO type
4. **Skill Only:** Any level, any sub_skill, VIDEO type

**Level Calculation:**
```typescript
const band = matrix.band_score;
const level = band <= 4.5 ? 'BEGINNER' 
            : band <= 6.5 ? 'INTERMEDIATE' 
            : 'ADVANCED';
```

**Response:**
```json
{
  "success": true,
  "item": {
    "id": "uuid",
    "title": "Mastering Grammar Basics",
    "type": "VIDEO",
    "skill_type": "WRITING",
    "sub_skill": "GRAMMAR",
    "level": "INTERMEDIATE",
    "content_url": "https://youtube.com/watch?v=..."
  },
  "matched_level": "INTERMEDIATE"
}
```

---

## Key Features

### ✅ Adaptive Prioritization
- Always shows weakest skills first
- Updates based on latest competency scores

### ✅ Daily Reset
- Completed drills filter resets at midnight IST
- Students can practice same drills on different days

### ✅ Round-Robin Distribution
- Prevents skill fatigue
- Ensures variety in practice

### ✅ Sub-Skill Granularity
- Writing & Speaking: 4 sub-skills each
- Reading & Listening: Single skill

### ✅ Score-Based Ordering
- Primary: Sub-skill score (most important)
- Secondary: Overall skill band score
- Tertiary: Skill name (alphabetical)

---

## Frontend Integration

### Typical Flow:

1. **Student Opens Dashboard**
   ```javascript
   GET /api/student/next-action-drill
   ```

2. **Frontend Displays First Drill**
   ```javascript
   const nextDrill = recommended_drills[0];
   // Show: "Practice Writing - Grammar (Band 4.5)"
   ```

3. **Student Starts Drill**
   ```javascript
   POST /api/drills/start
   Body: { 
     skill: 'WRITING', 
     sub_skill: 'GRAMMAR', 
     level: 'INTERMEDIATE' 
   }
   ```

4. **Student Completes Drill**
   ```javascript
   POST /api/drills/session/:id/complete
   Body: { answers: {...}, correct_answers: 4 }
   ```

5. **Show Recommendation**
   ```javascript
   GET /api/student/drill-recommendation?skill=WRITING&sub_skill=GRAMMAR
   // Display video recommendation
   ```

6. **Refresh Drill List**
   ```javascript
   GET /api/student/next-action-drill
   // Now excludes completed WRITING-GRAMMAR
   ```

---

## Database Tables Involved

### StudentCompetencyMatrix
```sql
student_id    | skill    | band_score | sub_scores (JSONB)
------------- | -------- | ---------- | ------------------
uuid-123      | WRITING  | 5.5        | {"grammarScore": 4.5, ...}
uuid-123      | SPEAKING | 6.0        | {"fluencyScore": 5.0, ...}
```

### DrillSession
```sql
id      | student_id | skill    | sub_skill | status      | created_at
------- | ---------- | -------- | --------- | ----------- | ----------
uuid-1  | uuid-123   | WRITING  | GRAMMAR   | DRILL_DONE  | 2024-01-15
uuid-2  | uuid-123   | SPEAKING | FLUENCY   | APPLY_DONE  | 2024-01-15
```

### RecommendationItem
```sql
id      | skill_type | sub_skill | level        | type  | content_url
------- | ---------- | --------- | ------------ | ----- | -----------
uuid-a  | WRITING    | GRAMMAR   | INTERMEDIATE | VIDEO | https://...
```

---

## Edge Cases

### No Competency Matrix
- Returns empty array
- Message: "Complete diagnostic test first"

### All Drills Completed Today
```json
{
  "recommended_drills": [],
  "message": "You have completed all available sub-skills for today!"
}
```

### Same Scores Across Skills
- Uses alphabetical ordering (LISTENING → READING → SPEAKING → WRITING)
- Ensures deterministic results

### Missing Sub-Scores
- Falls back to overall `skill_band_score`
```typescript
sub_skill_score: Number(subScores[scoreKey] ?? skillBandScore)
```

---

## Summary

**The drill fetching logic prioritizes student weaknesses:**

1. Fetches competency matrix (band scores + sub-scores)
2. Builds drill items for all skills/sub-skills
3. Sorts within each skill (weakest first)
4. Prioritizes skills by weakest score
5. Interleaves across skills (round-robin)
6. Filters out today's completed drills
7. Returns ordered array to frontend

**Result:** Students always see their weakest areas first, with variety across different skills.
