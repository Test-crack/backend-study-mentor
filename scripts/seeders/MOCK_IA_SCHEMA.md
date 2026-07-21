# Mock Test & IA — Schema + Seed Format (for Abhishek)

Everything below is copied **verbatim from the codebase** — the Prisma models (`prisma/schema.prisma`) and the TypeScript types the controllers actually write (`mockController.ts`, `iaProcessor.ts`). The JSONB columns must match these shapes exactly.

> **Real example rows live in the database, not the repo.** To get genuine existing data, run the SQL at the bottom of this file against the DB and paste the rows in — those are the literal "examples from the existing."

---

## Enums (allowed string values)

- `IeltsSkillType`: `LISTENING`, `READING`, `WRITING`, `SPEAKING`
- `IeltsSubSkillType`: `LISTENING`, `READING`, `GRAMMAR`, `VOCABULARY`, `COHERENCE`, `TASK_RESPONSE`, `FLUENCY`, `PRONUNCIATION`
- `MockAttemptType`: `STANDARD`, `EARNED`
- `MockSessionStatus`: `PENDING`, `IN_PROGRESS`, `COMPLETED`, `ABANDONED`
- `IASessionStatus`: `PENDING`, `IN_PROGRESS`, `COMPLETED`, `MISSED`
- `DifficultyType`: `BEGINNER`, `INTERMEDIATE`, `ADVANCED`

---

## Content to generate — paste-and-fill templates

Abhishek authors the **question banks** (`IAQuestion`, `mockquestions`). The fields below are **all you fill in** — the DB auto-generates the rest, so **do NOT include** these:
- `id` (auto UUID), `created_at` (auto timestamp).

(The **session** tables — `IASession`, `mocksessions` — are *not* hand-authored content; they're produced when a student takes a test or by the seeder. Schema for them is further down for reference only.)

> `correct_answer` is JSON-encoded. In existing rows a TFNG answer appears as `"\"TRUE\""` (i.e. the value is the quoted string `"TRUE"`). Match the existing convention; confirm with Sarthak whether that double-quoting is intentional.

### `IAQuestion` — fields to fill (real examples, id/created_at removed)
```json
[
  {
    "skill": "WRITING",
    "sub_skill": "TASK_RESPONSE",
    "question_type": "WRITING_PROMPT",
    "passage_id": null,
    "passage_text": null,
    "audio_url": null,
    "prompt_text": "Write a short paragraph (80–100 words) describing your favourite hobby. Explain what you do and why you enjoy it.",
    "options": null,
    "correct_answer": null,
    "explanation": null,
    "difficulty": "BEGINNER",
    "is_active": true
  },
  {
    "skill": "READING",
    "sub_skill": "READING",
    "question_type": "MCQ",
    "passage_id": "ia_reading_001",
    "passage_text": "<full passage text here>",
    "audio_url": null,
    "prompt_text": "According to the passage, what is the main cause of X?",
    "options": { "A": "First", "B": "Second", "C": "Third", "D": "Fourth" },
    "correct_answer": "B",
    "explanation": "Paragraph 2 states ...",
    "difficulty": "INTERMEDIATE",
    "is_active": true
  }
]
```

### `mockquestions` — fields to fill (real example, id/created_at removed)
```json
[
  {
    "skill": "READING",
    "sub_skill": "GRAMMAR",
    "question_type": "TFNG",
    "task_type": null,
    "passage_id": "mock_reading_001",
    "passage_text": "The Science of Habit Formation\n\n<full passage text — shared by all questions with this passage_id>",
    "audio_url": null,
    "prompt_text": "Wendy Wood is described in the passage as a psychologist.",
    "options": null,
    "correct_answer": "TRUE",
    "explanation": "Paragraph 1 directly calls her \"psychologist Wendy Wood\".",
    "is_active": true
  },
  {
    "skill": "LISTENING",
    "sub_skill": "LISTENING",
    "question_type": "MCQ",
    "task_type": null,
    "passage_id": null,
    "passage_text": null,
    "audio_url": "<url to the audio clip>",
    "prompt_text": "What time does the library close on weekdays?",
    "options": { "A": "6 PM", "B": "8 PM", "C": "9 PM", "D": "10 PM" },
    "correct_answer": "C",
    "explanation": null,
    "is_active": true
  }
]
```

Notes for generating: reading questions share one `passage_text` via a common `passage_id`; listening questions reference an `audio_url`; `WRITING_PROMPT`/`SPEAKING_PROMPT` have `options`/`correct_answer` = `null`; `sub_skill` need not equal `skill`.

---

## IA TABLES

### `IAQuestion` (question bank) — verbatim from `prisma/schema.prisma`
```prisma
model IAQuestion {
  id             String            @id @default(dbgenerated("uuid_generate_v4()")) @db.Uuid
  skill          IeltsSkillType
  sub_skill      IeltsSubSkillType
  question_type  String            @db.VarChar(30)
  passage_id     String?           @db.VarChar(50)
  passage_text   String?
  audio_url      String?           @db.VarChar(500)
  prompt_text    String
  options        Json?
  correct_answer Json?
  explanation    String?
  difficulty     DifficultyType
  is_active      Boolean           @default(true)
  created_at     DateTime          @default(now()) @db.Timestamptz(6)
}
```

### `IASession` (one attempt per student) — verbatim
```prisma
model IASession {
  id                      String             @id @default(dbgenerated("uuid_generate_v4()")) @db.Uuid
  student_id              String             @db.Uuid
  ia_number               Int
  ia_date                 DateTime           @db.Date
  status                  IASessionStatus    @default(PENDING)
  selected_subskills      Json               @default("[]")
  question_ids            Json               @default("[]")
  answers                 Json               @default("{}")
  time_started_at         DateTime?          @db.Timestamptz(6)
  time_submitted_at       DateTime?          @db.Timestamptz(6)
  window_closes_at        DateTime           @db.Timestamptz(6)
  scores                  Json?
  momentum_awarded        Int?
  carry_forward_subskills Json               @default("[]")
  created_at              DateTime           @default(now()) @db.Timestamptz(6)
  @@unique([student_id, ia_date])
}
```

### `IASession.scores` — element type, verbatim from `src/lib/iaProcessor.ts`
```ts
// one object per scored sub-skill
{
  skill:        string;
  sub_skill:    string;
  band:         number;
  correct:      number;
  total:        number;
  ai_graded:    boolean;
  ai_feedback?: { rationale: string; key_observations: string[] };
}
```

### `IASession.question_ids` — written shape (from `iaProcessor.ts`)
```ts
Array<{ skill: string; sub_skill: string; ids: string[] }>
```

`answers` = `{ "<questionId>": "<submitted answer / essay text>", "__meta": { "current_section": 1, "section_started_at": 1781763002064 } }` — note the optional **`__meta`** key (the app strips it before grading). `selected_subskills` = array of **objects** `[{ "skill": "WRITING", "sub_skill": "COHERENCE" }]` (NOT plain strings). `carry_forward_subskills` = same object shape (often `[]`).

---

## MOCK TABLES

### `mockquestions` (question bank) — verbatim from `prisma/schema.prisma`
```prisma
model mockquestions {
  id             String             @id(map: "pk_mock_questions") @default(dbgenerated("uuid_generate_v4()")) @db.Uuid
  skill          IeltsSkillType
  sub_skill      IeltsSubSkillType?
  question_type  String             @db.VarChar(30)
  task_type      String?            @db.VarChar(20)
  passage_id     String?            @db.VarChar(50)
  passage_text   String?
  audio_url      String?            @db.VarChar(500)
  prompt_text    String
  options        Json?
  correct_answer Json?
  explanation    String?
  is_active      Boolean            @default(true)
  created_at     DateTime           @default(now()) @db.Timestamptz(6)
}
```

### `mocksessions` (one attempt per student) — verbatim
```prisma
model mocksessions {
  id                 String             @id(map: "pk_mock_sessions") @default(dbgenerated("uuid_generate_v4()")) @db.Uuid
  student_id         String             @db.Uuid
  attempt_type       MockAttemptType    @default(STANDARD)
  month_year         String             @db.VarChar(7)
  status             MockSessionStatus  @default(PENDING)
  question_ids       Json               @default("[]")
  answers            Json               @default("{}")
  time_started_at    DateTime?          @db.Timestamptz(6)
  time_submitted_at  DateTime?          @db.Timestamptz(6)
  window_closes_at   DateTime           @db.Timestamptz(6)
  scores             Json?
  real_band_score    Decimal?           @db.Decimal(2, 1)
  momentum_awarded   Int?
  created_at         DateTime           @default(now()) @db.Timestamptz(6)
  @@unique([student_id, month_year, attempt_type])
}
```

### `mocksessions.scores` — element types, verbatim from `src/controllers/mockController.ts`
```ts
// scores = MockSkillScore[]  (one per skill)
type MockSkillScore = {
    skill:             string;
    band:              number;  // overall skill band (avg of sub-skills for W/S, direct MCQ for L/R)
    correct:           number;
    total:             number;
    ai_graded:         boolean;
    sub_skill_scores?: MockSubSkillScore[];  // only W/S
};

type MockSubSkillScore = {
    sub_skill:  string;
    band:       number;  // 0-9 IELTS, combined MCQ+AI
    correct:    number;
    total_mcq:  number;
    ai_band:    number | null;  // 0-9 IELTS equivalent of AI score
    ai_feedback?: { rationale: string; key_observations: string[] };
};
```

### `mocksessions.question_ids` — written shape (from `mockController.ts`)
```ts
Array<{ skill: string; ids: string[] }>   // NOTE: no sub_skill here (unlike IA)
```

`answers` = `{ "<questionId>": "<answer>", "__meta": { "current_section": 3 } }` (same `__meta` convention as IA). `real_band_score` = overall mock band, `Decimal(2,1)` e.g. `6.5`.

---

## `options` / `correct_answer` (both question tables)
Both are `Json`. `correct_answer` is stored as a **JSON-encoded string**, so in the raw column it shows *with* quotes (e.g. `"TRUE"`). By question type:
```json
// MCQ      → options = { "A": "...", "B": "...", "C": "...", "D": "..." },  correct_answer = "B"
// TFNG     → options = null,                                               correct_answer = "TRUE" | "FALSE" | "NOT GIVEN"
// WRITING_PROMPT / SPEAKING_PROMPT → options = null, correct_answer = null  (AI-graded, no key)
```
Note: `sub_skill` is **not** always equal to `skill` — e.g. a `READING` question may be tagged `sub_skill: "GRAMMAR"`. Follow whatever the existing rows use.

---

## Get the REAL example rows (run against the DB)

These pull genuine existing data — paste the output back and it becomes the canonical examples:

```sql
-- one of each question type, both banks
SELECT * FROM "IAQuestion"   WHERE is_active = true LIMIT 3;
SELECT * FROM mockquestions  WHERE is_active = true LIMIT 3;

-- one completed session of each (these have populated scores JSONB)
SELECT * FROM "IASession"    WHERE status = 'COMPLETED' AND scores IS NOT NULL LIMIT 1;
SELECT * FROM mocksessions   WHERE status = 'COMPLETED' AND scores IS NOT NULL LIMIT 1;
```

(Table names: `IAQuestion` and `IASession` are quoted because they're mixed-case; `mockquestions`/`mocksessions` are lowercase.)

---

## Reminders for generated data
- Session rows reference `institute_students.id`, **not** `User.id`.
- `window_closes_at` is **required** on both session tables.
- Bands are IELTS half-steps 0.0–9.0; `real_band_score` is `Decimal(2,1)`.
- IA `question_ids` carry `sub_skill`; mock `question_ids` do **not**.
- IA `scores` are per **sub-skill**; mock `scores` are per **skill** with nested `sub_skill_scores[]` for W/S only.
