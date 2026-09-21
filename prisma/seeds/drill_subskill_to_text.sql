-- ============================================================================
-- drill_questions.sub_skill + drill_sessions.sub_skill : SubSkillType enum -> text
-- ============================================================================
-- Coordinated with the config-driven sub_skill code change (branch
-- feat/config-driven-subskills). Lets each exam key its drills on its OWN config
-- criterion ids (e.g. OET 'GENRE_STYLE') instead of the fixed 9-value enum.
--
-- The SubSkillType enum TYPE is intentionally RETAINED — IA (ia_questions.sub_skill)
-- and the verification/import pipeline still use it. Existing enum values on the two
-- drill columns are preserved verbatim as text (IELTS/SE unaffected).
--
-- ⚠️ RUN IN THE SAME DEPLOY WINDOW AS THE CODE. The previously-deployed code casts
-- `::"SubSkillType"` in its drill queries; once non-enum values (OET criteria) exist,
-- that cast errors. So: deploy the new code AND run this together.
--     psql "$DATABASE_URL" -f prisma/seeds/drill_subskill_to_text.sql
-- ============================================================================

ALTER TABLE drill_questions ALTER COLUMN sub_skill TYPE text USING sub_skill::text;
ALTER TABLE drill_sessions  ALTER COLUMN sub_skill TYPE text USING sub_skill::text;
