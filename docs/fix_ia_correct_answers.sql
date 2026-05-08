-- Fix IAQuestion correct_answer JSONB format
-- Current: "\"C\"" (double-encoded JSON string)
-- Target: "C" (simple JSON string)

-- ═══════════════════════════════════════════════════════════════════════════════
-- OPTION 1: Fix all existing records (RECOMMENDED)
-- ═══════════════════════════════════════════════════════════════════════════════

-- This query removes the extra escaping from correct_answer field
-- It converts "\"C\"" to "C"

UPDATE ia_questions
SET correct_answer = 
    CASE 
        WHEN correct_answer IS NOT NULL 
        AND jsonb_typeof(correct_answer) = 'string'
        THEN to_jsonb(correct_answer #>> '{}')  -- Extract string value and re-encode as simple JSON string
        ELSE correct_answer
    END
WHERE correct_answer IS NOT NULL
  AND jsonb_typeof(correct_answer) = 'string'
  AND correct_answer #>> '{}' LIKE '"%"';  -- Only fix if the string contains quotes

-- Verify the fix
SELECT 
    id,
    prompt_text,
    correct_answer,
    correct_answer #>> '{}' as extracted_value,
    jsonb_typeof(correct_answer) as json_type
FROM ia_questions
WHERE correct_answer IS NOT NULL
LIMIT 20;

-- ═══════════════════════════════════════════════════════════════════════════════
-- OPTION 2: Fix specific records by ID (if you want to be selective)
-- ═══════════════════════════════════════════════════════════════════════════════

-- Example for specific question IDs
UPDATE ia_questions
SET correct_answer = to_jsonb(correct_answer #>> '{}')
WHERE id IN (
    '2158a3d0-3528-457e-9ea8-619243fe2c9b',
    '9a09e1e7-e5db-4b58-b4a9-835e41c1a45a',
    '36aa0ef6-4443-4a66-bfe9-707a5dc1601e'
    -- Add more IDs as needed
)
AND correct_answer IS NOT NULL
AND jsonb_typeof(correct_answer) = 'string';

-- ═══════════════════════════════════════════════════════════════════════════════
-- OPTION 3: Manual fix for each answer value
-- ═══════════════════════════════════════════════════════════════════════════════

-- If you want to manually set specific values:
UPDATE ia_questions SET correct_answer = '"A"' WHERE id = 'question-id-here';
UPDATE ia_questions SET correct_answer = '"B"' WHERE id = 'question-id-here';
UPDATE ia_questions SET correct_answer = '"C"' WHERE id = 'question-id-here';

-- ═══════════════════════════════════════════════════════════════════════════════
-- VERIFICATION QUERIES
-- ═══════════════════════════════════════════════════════════════════════════════

-- Check current format of correct_answer
SELECT 
    id,
    question_type,
    correct_answer,
    correct_answer::text as raw_text,
    correct_answer #>> '{}' as extracted_string,
    LENGTH(correct_answer #>> '{}') as string_length
FROM ia_questions
WHERE correct_answer IS NOT NULL
  AND question_type IN ('MCQ', 'TFNG')
ORDER BY created_at DESC
LIMIT 50;

-- Count questions with problematic format
SELECT 
    COUNT(*) as total_questions,
    COUNT(CASE WHEN correct_answer #>> '{}' LIKE '"%"' THEN 1 END) as needs_fixing,
    COUNT(CASE WHEN correct_answer #>> '{}' NOT LIKE '"%"' THEN 1 END) as already_correct
FROM ia_questions
WHERE correct_answer IS NOT NULL
  AND question_type IN ('MCQ', 'TFNG');

-- ═══════════════════════════════════════════════════════════════════════════════
-- EXPLANATION
-- ═══════════════════════════════════════════════════════════════════════════════

/*
The issue:
- Database stores: "\"C\"" (JSON string containing escaped quotes)
- When read by Prisma: "C" (string with literal quotes)
- Student answer: C (plain string)
- Comparison fails: "C" !== C

The fix:
- Use #>> '{}' operator to extract the raw string value from JSONB
- Re-encode it as a simple JSON string using to_jsonb()
- Result: "C" (simple JSON string) which extracts to C (plain string)

Example transformation:
Before: correct_answer = "\"C\""  →  extracts to: "C"
After:  correct_answer = "C"      →  extracts to: C
*/

-- ═══════════════════════════════════════════════════════════════════════════════
-- PREVENTION: How to insert correct_answer properly in the future
-- ═══════════════════════════════════════════════════════════════════════════════

-- CORRECT way to insert:
INSERT INTO ia_questions (skill, sub_skill, question_type, prompt_text, correct_answer, difficulty)
VALUES ('SPEAKING', 'FLUENCY', 'MCQ', 'Question text here', '"C"', 'INTERMEDIATE');

-- WRONG way (causes the issue):
INSERT INTO ia_questions (skill, sub_skill, question_type, prompt_text, correct_answer, difficulty)
VALUES ('SPEAKING', 'FLUENCY', 'MCQ', 'Question text here', '"\"C\""', 'INTERMEDIATE');

-- Using Prisma (correct way):
-- prisma.iAQuestion.create({
--   data: {
--     correct_answer: "C"  // Prisma will automatically JSON-encode this to "C"
--   }
-- })
