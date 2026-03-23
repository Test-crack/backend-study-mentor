-- ==========================================
-- 1. ROLLBACK PREVIOUS CHANGES
-- ==========================================

-- Drop the view and function that depend on the old tables
DROP VIEW IF EXISTS "diagnostic_status";
DROP FUNCTION IF EXISTS increment_assessments_count;

-- Drop the previously created tables safely
DROP TABLE IF EXISTS "AssessmentHistory" CASCADE;
DROP TABLE IF EXISTS "StudentCompetencyMatrix" CASCADE;
DROP TABLE IF EXISTS "students" CASCADE;

-- Note: We are LEAVING the enums ("IeltsSkillType" & "AssessmentModeType") 
-- because they were created correctly and we still need them.


-- ==========================================
-- 2. APPLY NEW CHANGES TO institute_students
-- ==========================================

-- Add the flags directly to your existing institute_students table
ALTER TABLE "institute_students"
ADD COLUMN "isDiagnosed" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "recommendationSeeded" BOOLEAN NOT NULL DEFAULT false;

-- ==========================================
-- 3. RECREATE DIAGNOSTIC ENGINE TABLES
-- ==========================================

-- Create StudentCompetencyMatrix mapped to institute_students
CREATE TABLE "StudentCompetencyMatrix" (
    "id" UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    "student_id" UUID NOT NULL,
    "skill" "IeltsSkillType" NOT NULL,
    "band_score" DECIMAL(2,1),
    "level" CHAR(1),
    "sub_scores" JSONB,
    "assessments_count" INTEGER NOT NULL DEFAULT 0,
    "last_updated" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StudentCompetencyMatrix_student_id_fkey" 
        FOREIGN KEY ("student_id") REFERENCES "institute_students"("id") 
        ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "StudentCompetencyMatrix_student_id_skill_key" ON "StudentCompetencyMatrix"("student_id", "skill");
CREATE INDEX "StudentCompetencyMatrix_student_id_idx" ON "StudentCompetencyMatrix"("student_id");


-- Create AssessmentHistory mapped to institute_students
CREATE TABLE "AssessmentHistory" (
    "id" UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    "student_id" UUID NOT NULL,
    "skill" "IeltsSkillType" NOT NULL,
    "mode" "AssessmentModeType" NOT NULL,
    "band_score" DECIMAL(2,1) NOT NULL,
    "sub_scores" JSONB,
    "feedback_json" JSONB,
    "transcript" TEXT,
    "raw_answers" JSONB,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AssessmentHistory_student_id_fkey" 
        FOREIGN KEY ("student_id") REFERENCES "institute_students"("id") 
        ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "AssessmentHistory_student_id_idx" ON "AssessmentHistory"("student_id");
CREATE INDEX "AssessmentHistory_skill_idx" ON "AssessmentHistory"("skill");
CREATE INDEX "AssessmentHistory_mode_idx" ON "AssessmentHistory"("mode");


-- ==========================================
-- 4. RECREATE VIEW & RPC FUNCTION
-- ==========================================

-- Create diagnostic_status view
CREATE OR REPLACE VIEW "diagnostic_status" AS
SELECT
  student_id,
  bool_or(skill = 'LISTENING' AND band_score IS NOT NULL)  AS listening_scored,
  bool_or(skill = 'READING'   AND band_score IS NOT NULL)  AS reading_scored,
  bool_or(skill = 'WRITING'   AND band_score IS NOT NULL)  AS writing_scored,
  bool_or(skill = 'SPEAKING'  AND band_score IS NOT NULL)  AS speaking_scored,
  (bool_or(skill = 'LISTENING' AND band_score IS NOT NULL)
   AND bool_or(skill = 'READING'  AND band_score IS NOT NULL)
   AND bool_or(skill = 'WRITING'  AND band_score IS NOT NULL)
   AND bool_or(skill = 'SPEAKING' AND band_score IS NOT NULL)) AS overall_complete
FROM "StudentCompetencyMatrix"
GROUP BY student_id;

-- Create RPC function increment_assessments_count
CREATE OR REPLACE FUNCTION increment_assessments_count(p_student_id UUID, p_skill "IeltsSkillType")
RETURNS void AS $$
BEGIN
  UPDATE "StudentCompetencyMatrix"
  SET "assessments_count" = "assessments_count" + 1
  WHERE "student_id" = p_student_id AND "skill" = p_skill;
END;
$$ LANGUAGE plpgsql;
