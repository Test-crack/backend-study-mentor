-- ============================================================================
--  Band/score range CHECKs — widened to [0, 9] so CEFR-scaled exams (Spoken
--  English stores a CEFR ordinal 0–6 in band_score) are accepted alongside IELTS
--  bands. The IELTS 4.0 floor is still enforced in the scoring code (toBand /
--  fractionToBand clamp to [4,9]); this is just the storage guard.
--
--  Uses the REAL (Prisma @@map) table names — the earlier band_range_4_9.sql used
--  "AssessmentHistory" / mocksessions which don't exist (they're assessment_history
--  / mock_sessions), so it never applied. mock_sessions has no exam_id.
--
--  Safe + idempotent: DROP IF EXISTS then ADD; [0,9] holds for all existing rows,
--  so no backfill and the ADD can't fail on legacy data. Run via the app's Prisma
--  connection (NOT prisma db push). Apply BEFORE submitting a viva.
-- ============================================================================

BEGIN;

-- Diagnostic / practice results (viva writes CEFR ordinal here) ----------------
ALTER TABLE assessment_history DROP CONSTRAINT IF EXISTS chk_ah_band_range;
ALTER TABLE assessment_history ADD  CONSTRAINT chk_ah_band_range
  CHECK (band_score >= 0.0 AND band_score <= 9.0);

-- Per-skill competency snapshot (viva upserts CEFR ordinal here) ---------------
ALTER TABLE student_competency_matrix DROP CONSTRAINT IF EXISTS chk_scm_band_range;
ALTER TABLE student_competency_matrix ADD  CONSTRAINT chk_scm_band_range
  CHECK (band_score IS NULL OR (band_score >= 0.0 AND band_score <= 9.0));

-- Student target (may be a CEFR target for a CEFR exam) ------------------------
ALTER TABLE institute_students DROP CONSTRAINT IF EXISTS chk_target_band_range;
ALTER TABLE institute_students ADD  CONSTRAINT chk_target_band_range
  CHECK (target_band IS NULL OR (target_band >= 0.0 AND target_band <= 9.0));

-- Mock sessions (no exam_id column; widen for a future CEFR mock) --------------
ALTER TABLE mock_sessions DROP CONSTRAINT IF EXISTS chk_mock_band_range;
ALTER TABLE mock_sessions ADD  CONSTRAINT chk_mock_band_range
  CHECK (real_band_score IS NULL OR (real_band_score >= 0.0 AND real_band_score <= 9.0));

COMMIT;
