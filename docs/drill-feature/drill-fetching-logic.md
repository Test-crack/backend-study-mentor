# Drill Fetching Logic - Complete Documentation

## Overview
This document explains how drills are fetched, ordered, and prioritized for students in the frontend based on their competency scores using a **persistent cursor-based round-robin system**.

---

## Primary Endpoint: Get Next Action Drill

**Endpoint:** `GET /api/student/next-action-drill`

**Purpose:** Returns a prioritized list of drills for the student to practice, ordered by weakest skills first, with a rotating cursor that persists across days.

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

### 2. Count Completed Drills (All-Time & Today)
```typescript
const [totalCompleted, todayCompleted] = await Promise.all([
  // All-time completed drills (cursor position)
  prisma.drillSession.count({
    where: { 
      student_id: student.id, 
      status: { in: ['DRILL_DONE', 'APPLY_DONE'] } 
    }
  }),
  // Today's completed drills (daily limit check)
  prisma.drillSession.count({
    where: { 
      student_id: student.id, 
      status: { in: ['DRILL_DONE', 'APPLY_DONE'] },
      created_at: { gte: todayStartIST() }
    }
  })
]);
```

**Key Difference from Old Logic:**
- ❌ Old: Filtered out today's completed drills from the list
- ✅ New: Uses **all-time count as a persistent cursor** that advances with each completion

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

### 7. Apply Cursor-Based Rotation (NEW LOGIC)

**The Game-Changer:** Instead of filtering out completed drills, we use a **persistent cursor** that rotates through the entire drill array.

```typescript
const N = interleaved.length;  // Total drills (e.g., 10)
const MAX_DRILLS_PER_DAY = 4;  // 3 free + 1 purchasable extra

// Calculate remaining drills for today
const remainingToday = Math.max(0, MAX_DRILLS_PER_DAY - todayCompleted);

// Cursor position based on ALL-TIME completions
const startIndex = N > 0 ? totalCompleted % N : 0;

// Slice the next drills from cursor position
const recommended_drills = [];
for (let i = 0; i < remainingToday && N > 0; i++) {
  recommended_drills.push(interleaved[(startIndex + i) % N]);
}
```

**How It Works:**

**Day 1:** Student has completed 0 drills all-time
- Cursor: `0 % 10 = 0`
- Shows: Drills [0, 1, 2, 3]
- Student completes 2 drills → `totalCompleted = 2`

**Day 2:** Student has completed 2 drills all-time
- Cursor: `2 % 10 = 2`
- Shows: Drills [2, 3, 4, 5]
- Student completes 3 drills → `totalCompleted = 5`

**Day 3:** Student has completed 5 drills all-time
- Cursor: `5 % 10 = 5`
- Shows: Drills [5, 6, 7, 8]
- Student completes 4 drills → `totalCompleted = 9`

**Day 4:** Student has completed 9 drills all-time
- Cursor: `9 % 10 = 9`
- Shows: Drills [9, 0, 1, 2] ← Wraps around!

**Benefits:**
- ✅ **Never repeats same position** across days
- ✅ **Ensures variety** in daily practice
- ✅ **Persists without DB column** (calculated on-the-fly)
- ✅ **Covers all skills** over time
- ✅ **Students can practice same drill** on different days (no daily filter)

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
    },
    {
      "skill": "LISTENING",
      "sub_skill": "LISTENING",
      "skill_band_score": 6.0,
      "sub_skill_score": 6.0
    },
    {
      "skill": "READING",
      "sub_skill": "READING",
      "skill_band_score": 6.5,
      "sub_skill_score": 6.5
    }
  ],
  "daily_sessions_completed": 2,
  "total_completed": 15,
  "message": "Here are your prioritised drills."
}
```

**Response Messages:**
- `remainingToday > 0`: "Here are your prioritised drills."
- `todayCompleted >= 4`: "Daily limit reached. Come back tomorrow for your next drills!"
- `remainingToday = 0` (other): "You have completed all available sub-skills for today!"

---

## Ordering Summary

### Priority Order (Highest to Lowest):
1. **Lowest sub_skill_score** across all skills
2. **Lowest skill_band_score** (tiebreaker)
3. **Round-robin distribution** across skills
4. **Alphabetical skill name** (deterministic fallback)
5. **Cursor-based rotation** (persists across days)

### Example Scenario:

**Student Scores:**
- Writing: 5.5 (Grammar: 4.5, Vocabulary: 5.0, Coherence: 5.5, Task Response: 6.0)
- Speaking: 6.0 (Fluency: 5.0, Grammar: 5.5, Vocabulary: 6.0, Pronunciation: 6.5)
- Reading: 6.5
- Listening: 6.0

**Master Drill Array (Interleaved):**
```javascript
[
  0: Writing - Grammar (4.5),           // Weakest overall
  1: Speaking - Fluency (5.0),
  2: Writing - Vocabulary (5.0),
  3: Listening - Listening (6.0),
  4: Writing - Coherence (5.5),
  5: Speaking - Grammar (5.5),
  6: Reading - Reading (6.5),
  7: Writing - Task Response (6.0),
  8: Speaking - Vocabulary (6.0),
  9: Speaking - Pronunciation (6.5)
]
```

**Day 1 (totalCompleted = 0):**
- Cursor: `0 % 10 = 0`
- Shows: [0, 1, 2, 3] → Grammar, Fluency, Vocabulary, Listening
- Student completes 2 → `totalCompleted = 2`

**Day 2 (totalCompleted = 2):**
- Cursor: `2 % 10 = 2`
- Shows: [2, 3, 4, 5] → Vocabulary, Listening, Coherence, Grammar (Speaking)
- Student completes 3 → `totalCompleted = 5`

**Day 3 (totalCompleted = 5):**
- Cursor: `5 % 10 = 5`
- Shows: [5, 6, 7, 8] → Grammar (Speaking), Reading, Task Response, Vocabulary (Speaking)
- Student completes 4 → `totalCompleted = 9`

**Day 4 (totalCompleted = 9):**
- Cursor: `9 % 10 = 9`
- Shows: [9, 0, 1, 2] → Pronunciation, Grammar (Writing), Fluency, Vocabulary (Writing)
- Wraps around to beginning!

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
- Always shows weakest skills first in the master array
- Updates based on latest competency scores

### ✅ Persistent Cursor System (NEW)
- **Cursor = totalCompleted % N**
- Advances with each drill completion (all-time)
- Never shows same starting position two days in a row
- No DB column needed (calculated on-the-fly)

### ✅ Daily Limit Enforcement
- **Max 4 drills per day** (3 free + 1 purchasable extra)
- `remainingToday = MAX_DRILLS_PER_DAY - todayCompleted`
- Resets at midnight IST

### ✅ Round-Robin Distribution
- Prevents skill fatigue
- Ensures variety in practice
- Covers all skills over time

### ✅ Sub-Skill Granularity
- Writing & Speaking: 4 sub-skills each
- Reading & Listening: Single skill

### ✅ Score-Based Ordering
- Primary: Sub-skill score (most important)
- Secondary: Overall skill band score
- Tertiary: Skill name (alphabetical)
- Quaternary: Cursor rotation (temporal)

---

## Frontend Integration

### Typical Flow:

1. **Student Opens Dashboard (Day 1, totalCompleted = 0)**
   ```javascript
   GET /api/student/next-action-drill
   // Response: 4 drills starting from index 0
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
   // totalCompleted increments to 1
   ```

5. **Show Recommendation**
   ```javascript
   GET /api/student/drill-recommendation?skill=WRITING&sub_skill=GRAMMAR
   // Display video recommendation
   ```

6. **Refresh Drill List (Still Day 1)**
   ```javascript
   GET /api/student/next-action-drill
   // Response: 3 remaining drills (same starting position)
   // todayCompleted = 1, remainingToday = 3
   ```

7. **Next Day (Day 2, totalCompleted = 2)**
   ```javascript
   GET /api/student/next-action-drill
   // Response: 4 NEW drills starting from index 2
   // Cursor advanced! Different drills shown.
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
- `recommended_drills: []`

### Daily Limit Reached (4 drills completed today)
```json
{
  "success": true,
  "recommended_drills": [],
  "daily_sessions_completed": 4,
  "total_completed": 27,
  "message": "Daily limit reached. Come back tomorrow for your next drills!"
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

### Cursor Wrap-Around
- When `totalCompleted >= N`, cursor wraps: `totalCompleted % N`
- Example: 10 drills, completed 23 → cursor at `23 % 10 = 3`
- Ensures infinite rotation through all drills

---

## Summary

**The drill fetching logic uses a persistent cursor-based rotation system:**

1. Fetches competency matrix (band scores + sub-scores)
2. Counts all-time completed drills (`totalCompleted`) and today's drills (`todayCompleted`)
3. Builds drill items for all skills/sub-skills
4. Sorts within each skill (weakest first)
5. Prioritizes skills by weakest score
6. Interleaves across skills (round-robin)
7. **Applies cursor rotation:** `startIndex = totalCompleted % N`
8. Returns next 4 drills (or remaining for today) from cursor position

**Result:** 
- ✅ Students always see their weakest areas first in the master array
- ✅ Cursor advances with each completion, ensuring variety across days
- ✅ Never repeats same starting position two days in a row
- ✅ Daily limit of 4 drills enforced
- ✅ Covers all skills over time through rotation

---

## Visual Example: Cursor Movement

```
Master Array (10 drills, sorted by weakness):
┌───┬───┬───┬───┬───┬───┬───┬───┬───┬───┐
│ 0 │ 1 │ 2 │ 3 │ 4 │ 5 │ 6 │ 7 │ 8 │ 9 │
└───┴───┴───┴───┴───┴───┴───┴───┴───┴───┘

Day 1 (totalCompleted = 0):
  ↓
┌───┬───┬───┬───┐
│ 0 │ 1 │ 2 │ 3 │  ← Shows these 4
└───┴───┴───┴───┘
Student completes 2 → totalCompleted = 2

Day 2 (totalCompleted = 2):
      ↓
    ┌───┬───┬───┬───┐
    │ 2 │ 3 │ 4 │ 5 │  ← Shows these 4
    └───┴───┴───┴───┘
Student completes 3 → totalCompleted = 5

Day 3 (totalCompleted = 5):
              ↓
            ┌───┬───┬───┬───┐
            │ 5 │ 6 │ 7 │ 8 │  ← Shows these 4
            └───┴───┴───┴───┘
Student completes 4 → totalCompleted = 9

Day 4 (totalCompleted = 9):
                      ↓
                    ┌───┬───┬───┬───┬───┐
                    │ 9 │ 0 │ 1 │ 2 │...│  ← Wraps around!
                    └───┴───┴───┴───┴───┘
```

**Key Insight:** The cursor position is **never stored in the database**—it's calculated on-the-fly using `totalCompleted % N`, making it stateless yet persistent!
