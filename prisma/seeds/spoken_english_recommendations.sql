-- ============================================================================
-- Spoken English — recommendation videos (YouTube) seed
-- ============================================================================
-- The SE recommendation engine matches videos by: exam_id + skill_type + sub_skill + level.
-- Run MANUALLY on the VPS (never via CI/CD):
--     psql "$DATABASE_URL" -f prisma/seeds/spoken_english_recommendations.sql
-- Prereqs (already applied on some envs — check first):
--   1. prisma/seeds/recommendation_exam_id.sql   (adds the exam_id column)
--   2. prisma/sql/add_interaction_subskill.sql   (adds INTERACTION to the SubSkillType enum)
--
-- Covers all 6 CEFR sub-skills × Beginner/Intermediate. A student at CEFR C (Advanced) for a
-- sub-skill falls back to any-level videos for that sub-skill (engine handles this), so no empty
-- sections. There is no unique constraint on url — run ONCE (re-running inserts duplicates).
-- ============================================================================

INSERT INTO recommendation_items
  (title, url, description, source, duration_min, type, skill_type, sub_skill, level, exam_id, is_active)
VALUES
  ('Medical Terminology MADE EASY', 'http://www.youtube.com/watch?v=78Rp1mcEsco', 'Teaches essential foundational root words, prefixes, and suffixes to easily decipher clinical and healthcare terminology.', 'The Paramedic Coach', 5, 'VIDEO', 'SPEAKING', 'VOCABULARY', 'BEGINNER', 'spoken_english', true),
  ('ADVANCED MEDICAL VOCABULARY 💊 | Words & Phrases You Should Know', 'http://www.youtube.com/watch?v=GMKRBzAnwRA', 'Introduces practical healthcare vocabulary, symptom descriptors, and idioms used during clinical consultations.', 'JForrest English', 12, 'VIDEO', 'SPEAKING', 'VOCABULARY', 'INTERMEDIATE', 'spoken_english', true),
  ('Speak Like a Nurse | Patient Admission Shadowing Practice (Repeat After Me)', 'http://www.youtube.com/watch?v=vrxbZCA3_vk', 'Practices fundamental question structures, polite directives, and present tense phrasing during hospital intake.', 'Fluent Nurse Medical English', 4, 'VIDEO', 'SPEAKING', 'GRAMMAR', 'BEGINNER', 'spoken_english', true),
  ('SBAR Nursing Example: Nurse-to-Physician Communication Report NCLEX', 'http://www.youtube.com/watch?v=ltloXhUvi1Y', 'Breaks down the SBAR framework to structure past, present, and modal recommendation statements when briefing doctors.', 'RegisteredNurseRN', 12, 'VIDEO', 'SPEAKING', 'GRAMMAR', 'INTERMEDIATE', 'spoken_english', true),
  ('Speak English Fluently - 5 Steps to Improve Your English Fluency', 'http://www.youtube.com/watch?v=KaA_mxga3PQ', 'Outlines five practical daily techniques to eliminate mental translation and speak in continuous English sentences.', 'Oxford Online English', 14, 'VIDEO', 'SPEAKING', 'FLUENCY', 'BEGINNER', 'spoken_english', true),
  ('Rhythm for English Speaking (How British People Really Speak English)', 'http://www.youtube.com/watch?v=ucz1R1WnnmQ', 'Explains sentence stress, weak forms, and conversational rhythm to develop smooth, natural pacing when speaking.', 'English with Lucy', 13, 'VIDEO', 'SPEAKING', 'FLUENCY', 'INTERMEDIATE', 'spoken_english', true),
  ('Conversation practice between caregiver and patient |Daily English conversation practice', 'http://www.youtube.com/watch?v=EfmUwevDKRc', 'Demonstrates foundational bedside etiquette, check-ins, and reassuring conversational responses with a patient.', 'Simple English With Anna', 3, 'VIDEO', 'SPEAKING', 'INTERACTION', 'BEGINNER', 'spoken_english', true),
  ('4 Tips for Natural English Conversation Responses - Improve English Speaking', 'http://www.youtube.com/watch?v=VCbfZRwSC7U', 'Teaches active listening responses, echo questions, and follow-up strategies to keep dialogues collaborative and engaging.', 'Oxford Online English', 10, 'VIDEO', 'SPEAKING', 'INTERACTION', 'INTERMEDIATE', 'spoken_english', true),
  ('How to use linking words in English - BBC English Masterclass', 'http://www.youtube.com/watch?v=BECe_ok1RI8', 'Illustrates how to logically connect basic thoughts and clauses using essential discourse markers and connectors.', 'BBC Learning English', 4, 'VIDEO', 'SPEAKING', 'COHERENCE', 'BEGINNER', 'spoken_english', true),
  ('Linking Words to Get Fluent in English', 'http://www.youtube.com/watch?v=-qge5j8NpCk', 'Teaches intermediate transitional markers to sequence events, contrast clinical observations, and justify clinical recommendations.', 'English Speaking Success', 13, 'VIDEO', 'SPEAKING', 'COHERENCE', 'INTERMEDIATE', 'spoken_english', true),
  ('Commonly MISPRONOUNCED MEDICAL TERMS', 'http://www.youtube.com/watch?v=pefL0K4EiRk', 'Drills the correct pronunciation, syllable stress, and common pitfalls of everyday medical and clinical vocabulary.', 'OET SLC', 7, 'VIDEO', 'SPEAKING', 'PRONUNCIATION', 'BEGINNER', 'spoken_english', true),
  ('English Pronunciation Lesson for Doctors - PRACTICE & Correct Commonly Mispronounced Medical Terms.', 'http://www.youtube.com/watch?v=mPqR5EA6Ixo', 'Detailed articulation, vowel nuance, and stress-placement training for multi-syllable healthcare terminology.', 'English Pronunciation with Georgie', 14, 'VIDEO', 'SPEAKING', 'PRONUNCIATION', 'INTERMEDIATE', 'spoken_english', true);
