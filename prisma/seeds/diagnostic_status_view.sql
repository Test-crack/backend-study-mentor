-- ============================================================================
-- diagnostic_status VIEW — per-skill "has this skill been scored?" rollup used by
-- GET /api/diagnostic/status (diagnosticController.getDiagnosticStatus, line ~257).
-- ============================================================================
-- Prisma does NOT manage views, so this must be (re)created on every database by
-- hand. It was missing on testcrack_db_dev (created 2026-09-17), which 500'd the
-- status endpoint for every UNDIAGNOSED student (diagnosed students short-circuit
-- before the query, so it only surfaced with a fresh student, e.g. the first OET one).
--
-- Idempotent (CREATE OR REPLACE). Additive — reads student_competency_matrix, no
-- data is written. Run via the app's Prisma connection or psql:
--     psql "$DATABASE_URL" -f prisma/seeds/diagnostic_status_view.sql
-- ============================================================================

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
