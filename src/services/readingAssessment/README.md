# Reading Assessment API

## Endpoints

### 1. Submit Assessment
**POST** `/api/reading/submit`

Submits assessment results and saves to database.

**Request Body:**
```json
{
  "passageId": "string",
  "readingTimeSeconds": 120,
  "answers": [
    {
      "questionId": "q1",
      "selectedOption": "A"
    }
  ],
  "focusData": {
    "focusRatio": 0.85,
    "tabSwitches": 2,
    "focusTime": 102,
    "totalSessionTime": 120
  }
}
```

**Response:**
```json
{
  "metrics": {
    "weightedWPM": 245.5,
    "accuracy": 80,
    "retention": 75,
    "speedLearningScore": 82
  },
  "baseMetrics": { ... },
  "feedback": "Excellent work!",
  "integrityFeedback": "✅ Excellent focus maintained",
  "integrityFlags": { ... },
  "answerReview": [ ... ],
  "passageInfo": { ... },
  "focusData": { ... },
  "isNewRecord": {
    "weightedWPM": true,
    "retention": false,
    "speedLearning": true
  }
}
```

### 2. Get User Profile
**GET** `/api/reading/profile`

Returns user's current and best reading stats.

**Response:**
```json
{
  "profile": {
    "current": {
      "weightedWPM": 245.5,
      "retention": 75,
      "speedLearning": 82,
      "focusRatio": 0.85,
      "integrityScore": 95
    },
    "best": {
      "weightedWPM": 280.3,
      "retention": 85,
      "speedLearning": 88
    },
    "stats": {
      "totalAssessments": 15,
      "lastAssessmentAt": "2025-12-15T10:30:00Z"
    }
  }
}
```

### 3. Get Assessment History
**GET** `/api/reading/history`

Returns user's assessment history with optional filters.

**Query Parameters:**
- `limit` (optional): Number of records (default: 50)
- `difficulty` (optional): Filter by difficulty (easy/medium/hard)
- `days` (optional): Get records from last N days

**Examples:**
- `/api/reading/history` - Last 50 assessments
- `/api/reading/history?limit=10` - Last 10 assessments
- `/api/reading/history?difficulty=hard` - All hard difficulty assessments
- `/api/reading/history?days=7` - Last 7 days of assessments
- `/api/reading/history?difficulty=medium&days=30&limit=20` - Combined filters

**Response:**
```json
{
  "history": [
    {
      "id": "uuid",
      "passageId": "passage-123",
      "difficulty": "medium",
      "category": "science",
      "wordCount": 500,
      "readingTimeSeconds": 120,
      "actualWPM": 250,
      "weightedWPM": 200,
      "accuracy": 80,
      "retention": 75,
      "speedLearningScore": 82,
      "focusRatio": 0.85,
      "integrityScore": 95,
      "tabSwitches": 2,
      "createdAt": "2025-12-15T10:30:00Z"
    }
  ],
  "total": 15,
  "filters": {
    "limit": 50,
    "difficulty": "all",
    "days": "all"
  }
}
```

## Database Tables

### UserReadingProfile
Stores current and best stats (one row per user).

### ReadingAssessmentHistory
Stores every assessment for trend analysis.

## Service Functions

### `saveAssessmentResults(input)`
Saves assessment to both tables in a transaction. Returns success status and new record flags.

### `getUserReadingProfile(userId)`
Fetches user's profile or returns null if not found.

### `getUserAssessmentHistory(userId, options)`
Fetches history with optional filters (limit, difficulty, fromDate).
