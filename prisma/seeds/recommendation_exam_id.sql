-- Migration: make recommendation_items exam-aware.
-- Adds exam_id (existing rows are all IELTS videos → default 'ielts', so no data loss) and the
-- exam-scoped lookup index the recommendation service now uses. Idempotent — safe to re-run.
-- Apply MANUALLY on the VPS (never via CI/CD): psql "$DATABASE_URL" -f prisma/seeds/recommendation_exam_id.sql

ALTER TABLE recommendation_items
  ADD COLUMN IF NOT EXISTS exam_id VARCHAR(50) NOT NULL DEFAULT 'ielts';

CREATE INDEX IF NOT EXISTS recommendation_items_exam_lookup_idx
  ON recommendation_items (exam_id, skill_type, sub_skill, level, is_active);
