# Backend Study Mentor - Reading Assessment API

A Node.js/Express.js backend service for educational reading comprehension assessments with speed reading metrics.

## Features

- Reading passage delivery by module and difficulty
- Comprehensive assessment submission with metrics calculation
- Speed reading analysis (WPM, accuracy, retention scores)
- Personalized feedback generation
- Module-based content organization

## API Endpoints

### 1. Get Available Modules

Retrieve all available reading modules with their metadata.

**Endpoint:** `GET /api/reading/modules`

#### Request
```http
GET /api/reading/modules
```

#### Response
```json
{
  "modules": [
    {
      "id": "economics",
      "name": "Economics",
      "description": "Fundamental concepts in economics and market principles",
      "difficulties": ["easy"]
    },
    {
      "id": "life-sciences",
      "name": "Life Sciences", 
      "description": "Biology, ecology, and environmental topics",
      "difficulties": ["easy"]
    },
    {
      "id": "physical-sciences",
      "name": "Physical Sciences",
      "description": "Physics, astronomy, and space exploration",
      "difficulties": ["medium"]
    },
    {
      "id": "technology",
      "name": "Technology & Computing",
      "description": "Computer science, internet history, and emerging technologies",
      "difficulties": ["medium", "hard"]
    }
  ],
  "total": 4
}
```

### 2. Get Random Passage

Retrieve a random reading passage based on module and difficulty level.

**Endpoint:** `POST /api/reading/passage/random`

#### Request
```json
{
  "module": "technology",
  "difficulty": "hard"
}
```

**Request Fields:**
- `module` (string, required): Module ID (e.g., "economics", "life-sciences", "physical-sciences", "technology")
- `difficulty` (string, required): Difficulty level ("easy", "medium", "hard")

#### Response
```json
{
  "id": "hard-01",
  "title": "Quantum Computing: A Paradigm Shift",
  "category": "Technology",
  "difficulty": "hard",
  "text": "Quantum computing represents a fundamental departure from classical computing paradigms...",
  "wordCount": 274,
  "idealWPM": 300,
  "estimatedReadingTime": 55,
  "questions": [
    {
      "id": "q1",
      "stem": "What is the key difference between classical bits and qubits?",
      "options": [
        "Qubits are larger in size",
        "Qubits can exist in superposition, representing multiple states simultaneously",
        "Qubits are more expensive to produce",
        "Qubits only work at room temperature"
      ]
    },
    {
      "id": "q2",
      "stem": "Who proposed that quantum systems could simulate other quantum systems more efficiently?",
      "options": ["Albert Einstein", "Stephen Hawking", "Richard Feynman", "Niels Bohr"]
    }
  ]
}
```

**Response Fields:**
- `id`: Unique passage identifier
- `title`: Passage title
- `category`: Content category
- `difficulty`: Difficulty level
- `text`: Full reading passage text
- `wordCount`: Total words in passage
- `idealWPM`: Target reading speed
- `estimatedReadingTime`: Expected reading time in seconds
- `questions`: Array of comprehension questions (without correct answers)

#### Error Responses
```json
{
  "error": "Both module and difficulty are required"
}
```
```json
{
  "error": "Invalid difficulty level"
}
```
```json
{
  "error": "No passage found for the specified module and difficulty"
}
```

### 3. Submit Assessment

Submit reading assessment answers and receive detailed performance metrics.

**Endpoint:** `POST /api/reading/submit`

#### Request
```json
{
  "passageId": "hard-01",
  "readingTimeSeconds": 90,
  "answers": [
    {
      "questionId": "q1",
      "selectedOption": "Qubits can exist in superposition, representing multiple states simultaneously"
    },
    {
      "questionId": "q2",
      "selectedOption": "Richard Feynman"
    },
    {
      "questionId": "q3",
      "selectedOption": "The tendency of qubits to lose their quantum properties when interacting with their environment"
    },
    {
      "questionId": "q4",
      "selectedOption": "Photonic crystals"
    },
    {
      "questionId": "q5",
      "selectedOption": "Temperatures near absolute zero"
    },
    {
      "questionId": "q6",
      "selectedOption": "Qubits to become correlated such that one instantaneously influences another"
    }
  ]
}
```

**Request Fields:**
- `passageId` (string, required): ID of the passage that was read
- `readingTimeSeconds` (number, required): Time taken to read the passage in seconds
- `answers` (array, required): Array of answer objects containing:
  - `questionId` (string): Question identifier
  - `selectedOption` (string): Selected answer option

#### Response
```json
{
  "metrics": {
    "wpm": 183,
    "accuracy": 100,
    "retention": 61,
    "speedLearningScore": 84
  },
  "feedback": "Great comprehension! Try to increase your reading speed gradually.",
  "answerReview": [
    {
      "questionId": "q1",
      "selectedOption": "Qubits can exist in superposition, representing multiple states simultaneously",
      "correctAnswer": "Qubits can exist in superposition, representing multiple states simultaneously",
      "isCorrect": true
    },
    {
      "questionId": "q2",
      "selectedOption": "Richard Feynman",
      "correctAnswer": "Richard Feynman",
      "isCorrect": true
    }
  ],
  "passageInfo": {
    "id": "hard-01",
    "title": "Quantum Computing: A Paradigm Shift",
    "difficulty": "hard"
  }
}
```

**Response Fields:**
- `metrics`: Performance metrics object
  - `wpm`: Words per minute reading speed
  - `accuracy`: Percentage of correct answers
  - `retention`: Retention score based on speed and accuracy
  - `speedLearningScore`: Overall performance score (0-100)
- `feedback`: Personalized feedback message
- `answerReview`: Detailed review of each answer
  - `questionId`: Question identifier
  - `selectedOption`: User's selected answer
  - `correctAnswer`: The correct answer
  - `isCorrect`: Boolean indicating if answer was correct
- `passageInfo`: Basic passage information

#### Error Responses
```json
{
  "error": "Invalid request data"
}
```
```json
{
  "error": "Invalid passage ID"
}
```

## Metrics Calculation

### Reading Speed (WPM)
```
WPM = Word Count ÷ (Reading Time in Seconds ÷ 60)
```

### Accuracy (%)
```
Accuracy = (Correct Answers ÷ Total Questions) × 100
```

### Retention Score (%)
```
Speed Factor = min(1, WPM ÷ Ideal WPM)
Retention = (Accuracy ÷ 100) × Speed Factor × 100
```

### Speed Learning Score (0-100)
```
Speed Component = min(100, (WPM ÷ Ideal WPM) × 100)
Speed Learning Score = (0.6 × Accuracy) + (0.4 × Speed Component)
```

## Available Modules & Difficulties

| Module | ID | Difficulties Available |
|--------|----|-----------------------|
| Economics | `economics` | easy |
| Life Sciences | `life-sciences` | easy |
| Physical Sciences | `physical-sciences` | medium |
| Technology & Computing | `technology` | medium, hard |

## Usage Examples

### cURL Examples

**Get modules:**
```bash
curl -X GET http://localhost:4000/api/reading/modules
```

**Get random passage:**
```bash
curl -X POST http://localhost:4000/api/reading/passage/random \
  -H "Content-Type: application/json" \
  -d '{"module": "technology", "difficulty": "hard"}'
```

**Submit assessment:**
```bash
curl -X POST http://localhost:4000/api/reading/submit \
  -H "Content-Type: application/json" \
  -d '{
    "passageId": "hard-01",
    "readingTimeSeconds": 90,
    "answers": [
      {"questionId": "q1", "selectedOption": "Qubits can exist in superposition, representing multiple states simultaneously"}
    ]
  }'
```

## Installation & Setup

1. Clone the repository
2. Install dependencies: `npm install`
3. Start the server: `npm start` or `npm run dev`
4. Server runs on `http://localhost:4000`

## Tech Stack

- Node.js
- Express.js
- TypeScript
- JSON-based data storage
