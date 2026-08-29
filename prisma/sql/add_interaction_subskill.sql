-- ============================================================================
--  Add INTERACTION to the SubSkillType enum, so Spoken English's 'interaction'
--  (Responsiveness) subskill drills can be tagged with their own value instead of
--  overloading TASK_RESPONSE.
--
--  Run this AS A SINGLE STATEMENT, NOT inside a transaction block — Postgres does
--  not allow a newly added enum value to be used in the same transaction, and some
--  tooling wraps scripts in a transaction. Run it on its own.
--
--  Safe + idempotent (Postgres 12+): ADD VALUE IF NOT EXISTS. No data changes.
--  After this: `prisma generate` (so the client knows INTERACTION), then re-run the
--  content team's drill import for the 24 interaction questions.
-- ============================================================================

ALTER TYPE "SubSkillType" ADD VALUE IF NOT EXISTS 'INTERACTION';
