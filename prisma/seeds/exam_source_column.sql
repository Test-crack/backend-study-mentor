-- ============================================================================
-- Stage 0 keystone: exams.source — provenance so the engine can serve DB-authored
-- exams while built-ins stay file-sourced & file-locked.
-- ============================================================================
-- Additive + backward-compatible (NOT NULL with a DEFAULT) — a safe "expand":
-- the currently-deployed code ignores the column; the new code reads it. So this
-- can be applied in the same deploy window, BEFORE the new code goes live.
--   psql "$DBURL" -f prisma/seeds/exam_source_column.sql
--
-- Every existing row becomes source='file' (correct — they were all seeded from
-- exam-engine-config.v2.json). That includes the stale 'oet' ghost, which the new
-- engine therefore NEVER serves from the DB (built-ins resolve from the file), so
-- it is inert; it can be tidied later without urgency.
-- ============================================================================

ALTER TABLE exams ADD COLUMN IF NOT EXISTS source varchar(20) NOT NULL DEFAULT 'file';
