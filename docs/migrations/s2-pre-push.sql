-- ============================================================
-- S2 PRE-PUSH MIGRATION SCRIPT  (Phases 1, 2, 3)
-- Run this on VPS BEFORE running `npx prisma db push`
-- ============================================================
-- Deployment order:
--   1. psql "$DATABASE_URL" < docs/migrations/s2-pre-push.sql
--   2. npx prisma db push
--   3. pm2 restart backend
-- ============================================================

-- ── PHASE 1: Rename enum types ─────────────────────────────
-- PostgreSQL has no "CREATE OR REPLACE TYPE" or IF EXISTS for
-- RENAME.  If already renamed, the command errors — that's safe
-- to ignore ("type does not exist").
-- Must run BEFORE prisma db push; without this, Prisma would
-- try to DROP the old type (fails because columns still use it).

ALTER TYPE "IeltsSkillType"    RENAME TO "SkillType";
ALTER TYPE "IeltsSubSkillType" RENAME TO "SubSkillType";

-- ── PHASE 2: exam_type columns ─────────────────────────────
-- These are purely additive (new column + DEFAULT 'IELTS') so
-- prisma db push handles them automatically.  No manual SQL
-- needed here.  Zero data loss, zero downtime risk.

-- ── PHASE 3: Rename batch tables ───────────────────────────
-- Must run BEFORE prisma db push; without this, Prisma would
-- DROP the old tables and CREATE new ones (data loss).

ALTER TABLE IF EXISTS ielts_batches           RENAME TO batches;
ALTER TABLE IF EXISTS ielts_batch_students    RENAME TO batch_students;
ALTER TABLE IF EXISTS ielts_batch_instructors RENAME TO batch_instructors;

-- ── PHASE 3b: Rename PK constraints after table renames ────
-- PostgreSQL does NOT allow RENAME CONSTRAINT + ADD COLUMN in
-- a single ALTER TABLE statement — this is a Prisma limitation.
-- Renaming the constraints here means prisma db push only needs
-- ADD COLUMN (no RENAME CONSTRAINT), which is always safe to combine.
--
-- Constraint names default to {old_table_name}_pkey in Postgres.
-- If already renamed (re-run), the DO block silently skips.

DO $$
BEGIN
  ALTER TABLE batches           RENAME CONSTRAINT ielts_batches_pkey           TO batches_pkey;
EXCEPTION WHEN undefined_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE batch_students    RENAME CONSTRAINT ielts_batch_students_pkey    TO batch_students_pkey;
EXCEPTION WHEN undefined_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE batch_instructors RENAME CONSTRAINT ielts_batch_instructors_pkey TO batch_instructors_pkey;
EXCEPTION WHEN undefined_object THEN NULL;
END $$;

-- ── Then run: npx prisma db push ───────────────────────────
-- Prisma will:
--   • Create the ExamType enum
--   • Add exam_type column (ExamType DEFAULT IELTS) to 8 tables
--   • Confirm the renamed batch tables + constraints match schema
-- No interactive data-loss prompt expected — all changes are
-- additive or already prepared above.
-- ============================================================
