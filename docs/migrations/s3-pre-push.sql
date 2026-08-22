-- ============================================================
-- S3 PRE-PUSH MIGRATION  (Phase 5 · Step 0 — Exam table + exam_id retype)
-- Run on the DB BEFORE `npx prisma db push`.
-- Turns the `ExamType` enum into a string `exam_id` referencing an `exams`
-- registry table (decision D2). All current data is 'IELTS', but the mapping
-- is written defensively so a Spoken-English subscription row survives.
-- ============================================================
-- Order:
--   1. psql "$DATABASE_URL" -f docs/migrations/s3-pre-push.sql
--   2. npx prisma db push        (creates exam_configs, provenance cols, indexes)
--   3. B1 seeds exam_configs from exam-engine-config.v2.json
-- ============================================================

BEGIN;

-- ── 1. Exam registry table + seed (matches the Prisma `Exam` model) ─────────
CREATE TABLE IF NOT EXISTS exams (
  id     varchar(40)  PRIMARY KEY,
  label  varchar(120) NOT NULL,
  status varchar(20)  NOT NULL DEFAULT 'reserved'
);

INSERT INTO exams (id, label, status) VALUES
  ('ielts',          'IELTS Preparation',                     'live'),
  ('spoken_english', 'Spoken English (CEFR-aligned)',         'live'),
  ('oet',            'Healthcare English Preparation',        'reserved'),
  ('gre',            'Graduate Admissions Test Preparation',  'reserved'),
  ('gmat',           'Business School Admissions Preparation','reserved')
ON CONFLICT (id) DO NOTHING;

-- ── 2. Retype exam_type (ExamType enum) → exam_id (text) ─────────────────────
-- Mapping: SPOKEN → spoken_english; everything else → lower(enum value).
-- Idempotent + cross-state-safe: skips tables not present in this environment
-- (e.g. Phase-4 tables like viva_sessions on a Phase-3.5 dev DB — prisma db push
-- creates those with exam_id) and skips columns already retyped (safe re-run).

-- 2a. Tables that carried @default(IELTS) → exam_id default 'ielts'
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'batches','institute_students','student_competency_matrix','assessment_history',
    'mock_questions','ia_questions','drill_questions','diagnostic_questions'
  ] LOOP
    IF to_regclass('public.'||t) IS NULL THEN CONTINUE; END IF;            -- table absent → db push creates it
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_schema='public' AND table_name=t AND column_name='exam_type') THEN CONTINUE; END IF;  -- already retyped
    EXECUTE format('ALTER TABLE %I ADD COLUMN IF NOT EXISTS exam_id text', t);
    EXECUTE format($f$UPDATE %I SET exam_id =
        CASE exam_type::text WHEN 'SPOKEN' THEN 'spoken_english' ELSE lower(exam_type::text) END
        WHERE exam_id IS NULL$f$, t);
    EXECUTE format('ALTER TABLE %I ALTER COLUMN exam_id SET DEFAULT ''ielts''', t);
    EXECUTE format('ALTER TABLE %I ALTER COLUMN exam_id SET NOT NULL', t);
    EXECUTE format('ALTER TABLE %I DROP COLUMN exam_type', t);
  END LOOP;
END $$;

-- 2b. Tables with NO default (value always set explicitly) → NOT NULL, no default
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['viva_sessions','institute_exam_subscriptions'] LOOP
    IF to_regclass('public.'||t) IS NULL THEN CONTINUE; END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_schema='public' AND table_name=t AND column_name='exam_type') THEN CONTINUE; END IF;
    EXECUTE format('ALTER TABLE %I ADD COLUMN IF NOT EXISTS exam_id text', t);
    EXECUTE format($f$UPDATE %I SET exam_id =
        CASE exam_type::text WHEN 'SPOKEN' THEN 'spoken_english' ELSE lower(exam_type::text) END
        WHERE exam_id IS NULL$f$, t);
    EXECUTE format('ALTER TABLE %I ALTER COLUMN exam_id SET NOT NULL', t);
    EXECUTE format('ALTER TABLE %I DROP COLUMN exam_type', t);
  END LOOP;
END $$;
-- Dropping exam_type auto-drops the old UNIQUE(institute_id, exam_type) index on
-- institute_exam_subscriptions; prisma db push recreates it as (institute_id, exam_id).

-- ── 3. Provenance columns (nullable, additive; guard tables that may not exist) ─
DO $$
BEGIN
  IF to_regclass('public.assessment_history') IS NOT NULL THEN
    ALTER TABLE assessment_history ADD COLUMN IF NOT EXISTS engine_version varchar(20);
    ALTER TABLE assessment_history ADD COLUMN IF NOT EXISTS config_version varchar(40);
  END IF;
  IF to_regclass('public.viva_answers') IS NOT NULL THEN   -- absent on a Phase-3.5 DB; db push creates it with these cols
    ALTER TABLE viva_answers ADD COLUMN IF NOT EXISTS engine_version varchar(20);
    ALTER TABLE viva_answers ADD COLUMN IF NOT EXISTS config_version varchar(40);
  END IF;
END $$;

-- ── 4. Drop the now-unused enum type (safe once no column references it) ─────
DROP TYPE IF EXISTS "ExamType";

COMMIT;

-- ── Then: npx prisma db push ────────────────────────────────────────────────
-- db push will create the `exam_configs` table (+ FK to exams + indexes),
-- confirm the exam_id columns match the schema, and add the new
-- UNIQUE(institute_id, exam_id) on institute_exam_subscriptions.
-- No data-loss prompt expected.
-- ============================================================
