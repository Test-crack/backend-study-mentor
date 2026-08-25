-- ============================================================================
--  Make the band_score range CHECK exam-aware, so non-IELTS exams (e.g. Spoken
--  English, which stores a CEFR ordinal 0–6 in band_score) are allowed, while the
--  IELTS floor of 4.0 is preserved.
--
--  Supersedes band_range_4_9.sql's chk_ah_band_range / chk_scm_band_range.
--  Safe + idempotent: DROP IF EXISTS then ADD. No data is modified; existing IELTS
--  rows (band ≥ 4) still satisfy the widened rule. Run via the app's Prisma
--  connection (NOT prisma db push). Must be applied BEFORE a viva is submitted.
-- ============================================================================

BEGIN;

ALTER TABLE "AssessmentHistory" DROP CONSTRAINT IF EXISTS chk_ah_band_range;
ALTER TABLE "AssessmentHistory" ADD CONSTRAINT chk_ah_band_range
  CHECK (
    band_score >= 0.0 AND band_score <= 9.0
    AND (exam_id <> 'ielts' OR band_score >= 4.0)   -- IELTS keeps its 4.0 floor
  );

ALTER TABLE "StudentCompetencyMatrix" DROP CONSTRAINT IF EXISTS chk_scm_band_range;
ALTER TABLE "StudentCompetencyMatrix" ADD CONSTRAINT chk_scm_band_range
  CHECK (
    band_score IS NULL
    OR (
      band_score >= 0.0 AND band_score <= 9.0
      AND (exam_id <> 'ielts' OR band_score >= 4.0)
    )
  );

COMMIT;
