-- ============================================================
-- S1 PRE-PUSH MIGRATION SCRIPT
-- Run this on VPS BEFORE running `npx prisma db push`
-- Safe to re-run (uses IF EXISTS / IF NOT EXISTS guards)
-- ============================================================

-- 1. Drop the diagnostic_status VIEW so its dependency on the
--    old table name doesn't block the upcoming table rename.
DROP VIEW IF EXISTS diagnostic_status;

-- 2. Rename tables: PascalCase → snake_case
--    prisma db push will ALSO attempt these if run first, but
--    running manually avoids any drop-recreate risk.

ALTER TABLE IF EXISTS "User"                     RENAME TO users;
ALTER TABLE IF EXISTS "Concept"                  RENAME TO concepts;
ALTER TABLE IF EXISTS "Content"                  RENAME TO content_items;
ALTER TABLE IF EXISTS "Course"                   RENAME TO courses;
ALTER TABLE IF EXISTS "CourseContentItem"        RENAME TO course_content_items;
ALTER TABLE IF EXISTS "CourseModule"             RENAME TO course_modules;
ALTER TABLE IF EXISTS "CourseOrder"              RENAME TO course_orders_legacy;
ALTER TABLE IF EXISTS "Domain"                   RENAME TO domains;
ALTER TABLE IF EXISTS "IeltsReadingAssessment"   RENAME TO ielts_reading_assessments;
ALTER TABLE IF EXISTS "IeltsSpeakingAssessment"  RENAME TO ielts_speaking_assessments;
ALTER TABLE IF EXISTS "IeltsSpeakingPractice"    RENAME TO ielts_speaking_practice;
ALTER TABLE IF EXISTS "IeltsSpeedReadingExercise" RENAME TO ielts_speed_reading_exercises;
ALTER TABLE IF EXISTS "IeltsSpeedReadingReport"  RENAME TO ielts_speed_reading_reports;
ALTER TABLE IF EXISTS "IeltsVoicePrompt"         RENAME TO ielts_voice_prompts;
ALTER TABLE IF EXISTS "IeltsWritingTask"         RENAME TO ielts_writing_tasks;
ALTER TABLE IF EXISTS "IeltsWritingAssessment"   RENAME TO ielts_writing_assessments;
ALTER TABLE IF EXISTS "Instructor"               RENAME TO instructors;
ALTER TABLE IF EXISTS "MCQ"                      RENAME TO mcqs;
ALTER TABLE IF EXISTS "Module"                   RENAME TO modules;
ALTER TABLE IF EXISTS "ModuleConcept"            RENAME TO module_concepts;
ALTER TABLE IF EXISTS "Note"                     RENAME TO notes;
ALTER TABLE IF EXISTS "ReadingAssessmentHistory" RENAME TO reading_assessment_history_legacy;
ALTER TABLE IF EXISTS "RecommendationItem"       RENAME TO recommendation_items;
ALTER TABLE IF EXISTS "StudentCompetencyMatrix"  RENAME TO student_competency_matrix;
ALTER TABLE IF EXISTS "AssessmentHistory"        RENAME TO assessment_history;
ALTER TABLE IF EXISTS "IAQuestion"               RENAME TO ia_questions;
ALTER TABLE IF EXISTS "IASession"                RENAME TO ia_sessions;
ALTER TABLE IF EXISTS mockquestions              RENAME TO mock_questions;
ALTER TABLE IF EXISTS mocksessions               RENAME TO mock_sessions;
ALTER TABLE IF EXISTS "UserConcept"              RENAME TO user_concepts;
ALTER TABLE IF EXISTS "UserContentProgress"      RENAME TO user_content_progress;
ALTER TABLE IF EXISTS "UserCourseEnrollment"     RENAME TO user_course_enrollments;
ALTER TABLE IF EXISTS "UserModuleProgress"       RENAME TO user_module_progress;
ALTER TABLE IF EXISTS "UserReadingProfile"       RENAME TO user_reading_profiles;
ALTER TABLE IF EXISTS "YouTubeTranscript"        RENAME TO youtube_transcripts;

-- 3. Column renames (camelCase → snake_case)
--    These must be done BEFORE prisma db push, which would otherwise
--    drop the old column and create a new empty one (data loss).

ALTER TABLE institute_students
  RENAME COLUMN IF EXISTS "isDiagnosed" TO is_diagnosed;

ALTER TABLE institute_students
  RENAME COLUMN IF EXISTS "recommendationSeeded" TO recommendation_seeded;

ALTER TABLE recommendation_items
  RENAME COLUMN IF EXISTS "createdAt" TO created_at;

ALTER TABLE recommendation_items
  RENAME COLUMN IF EXISTS "updatedAt" TO updated_at;

-- 4. Recreate the diagnostic_status VIEW against the renamed table.
CREATE OR REPLACE VIEW diagnostic_status AS
SELECT
  student_id,
  bool_or(skill = 'LISTENING' AND band_score IS NOT NULL) AS listening_scored,
  bool_or(skill = 'READING'   AND band_score IS NOT NULL) AS reading_scored,
  bool_or(skill = 'WRITING'   AND band_score IS NOT NULL) AS writing_scored,
  bool_or(skill = 'SPEAKING'  AND band_score IS NOT NULL) AS speaking_scored,
  (bool_or(skill = 'LISTENING' AND band_score IS NOT NULL)
   AND bool_or(skill = 'READING'  AND band_score IS NOT NULL)
   AND bool_or(skill = 'WRITING'  AND band_score IS NOT NULL)
   AND bool_or(skill = 'SPEAKING' AND band_score IS NOT NULL)) AS overall_complete
FROM student_competency_matrix
GROUP BY student_id;

-- ============================================================
-- After running this script, run:
--   npx prisma db push
-- Prisma will see the schema matches the DB and apply only
-- any remaining additive changes (no table drops).
-- ============================================================
