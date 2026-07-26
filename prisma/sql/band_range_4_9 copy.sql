-- ============================================================================
-- Band-range migration [0,9] → [4,9]  (band-range-4-9-plan.md §4)
--
-- Order matters: backfill sub-4 rows FIRST, then add the range CHECKs.
-- Ships in lockstep with the scoring-code rescale (fractionToBand /
-- internalToBand / toBand) — code no longer writes bands below 4.0.
-- Idempotent: safe to run multiple times.
-- ============================================================================

BEGIN;

-- 1) Backfill: floor any historical sub-4 bands at the new 4.0 minimum ---------
UPDATE "StudentCompetencyMatrix" SET band_score      = 4.0 WHERE band_score      IS NOT NULL AND band_score      < 4.0;
UPDATE "AssessmentHistory"       SET band_score      = 4.0 WHERE band_score      < 4.0;
UPDATE mocksessions              SET real_band_score = 4.0 WHERE real_band_score IS NOT NULL AND real_band_score < 4.0;
UPDATE institute_students        SET target_band     = 4.0 WHERE target_band     IS NOT NULL AND target_band     < 4.0;

-- Also floor the W/S per-sub-skill JSON scores stored in the matrix ------------
UPDATE "StudentCompetencyMatrix"
SET sub_scores = (
  SELECT jsonb_object_agg(
           key,
           CASE
             WHEN jsonb_typeof(value) = 'number' AND (value)::text::numeric < 4.0 THEN to_jsonb(4.0)
             ELSE value
           END
         )
  FROM jsonb_each(sub_scores)
)
WHERE sub_scores IS NOT NULL
  AND jsonb_typeof(sub_scores) = 'object'
  AND EXISTS (
    SELECT 1 FROM jsonb_each(sub_scores)
    WHERE jsonb_typeof(value) = 'number' AND (value)::text::numeric < 4.0
  );

-- 2) Range CHECK constraints (now safe to add) ---------------------------------
ALTER TABLE "StudentCompetencyMatrix" DROP CONSTRAINT IF EXISTS chk_scm_band_range;
ALTER TABLE "StudentCompetencyMatrix" ADD CONSTRAINT chk_scm_band_range
  CHECK (band_score IS NULL OR (band_score >= 4.0 AND band_score <= 9.0));

ALTER TABLE "AssessmentHistory" DROP CONSTRAINT IF EXISTS chk_ah_band_range;
ALTER TABLE "AssessmentHistory" ADD CONSTRAINT chk_ah_band_range
  CHECK (band_score >= 4.0 AND band_score <= 9.0);

ALTER TABLE mocksessions DROP CONSTRAINT IF EXISTS chk_mock_band_range;
ALTER TABLE mocksessions ADD CONSTRAINT chk_mock_band_range
  CHECK (real_band_score IS NULL OR (real_band_score >= 4.0 AND real_band_score <= 9.0));

ALTER TABLE institute_students DROP CONSTRAINT IF EXISTS chk_target_band_range;
ALTER TABLE institute_students ADD CONSTRAINT chk_target_band_range
  CHECK (target_band IS NULL OR (target_band >= 4.0 AND target_band <= 9.0));

COMMIT;
