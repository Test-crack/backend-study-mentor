-- ============================================================================
--  Spoken English — SAMPLE daily-drill MCQs (18: 3 per subskill).
--  Lets the daily-drill / unlock gate / LexiGrid flow work end-to-end for SE
--  before the data team's full 144. The drill infra is already exam-scoped, so
--  no backend code change — just this content.
--
--  Subskill → SubSkillType enum mapping (the 6 CEFR subskills reuse existing values):
--    range→VOCABULARY  accuracy→GRAMMAR  fluency→FLUENCY
--    interaction→TASK_RESPONSE  coherence→COHERENCE  phonology→PRONUNCIATION
--  All INTERMEDIATE (b1–b2) for the cohort-1 test student. correct_answer = the
--  option text (JSON string), matching the drill UI's comparison.
--
--  Idempotent: ON CONFLICT (source_key) DO UPDATE. Run via the app's Prisma
--  connection, NOT prisma db push.
-- ============================================================================

INSERT INTO drill_questions
  (skill, sub_skill, level, drill_type, prompt_text, options, correct_answer, explanation, is_active, exam_id, source_key)
VALUES
  -- range → VOCABULARY
  ('SPEAKING','VOCABULARY','INTERMEDIATE','MCQ','Choose the word closest in meaning to ''exhausted''.',
    '["tired","angry","hungry","late"]'::jsonb,'"tired"'::jsonb,'''Exhausted'' means very tired.',TRUE,'spoken_english','se_drill_range_int_01'),
  ('SPEAKING','VOCABULARY','INTERMEDIATE','MCQ','Which word best completes the sentence: ''She has a very ___ vocabulary and can discuss any topic.''',
    '["wide","tall","heavy","loud"]'::jsonb,'"wide"'::jsonb,'''A wide vocabulary'' is the natural collocation.',TRUE,'spoken_english','se_drill_range_int_02'),
  ('SPEAKING','VOCABULARY','INTERMEDIATE','MCQ','Pick the more formal synonym for ''important''.',
    '["big","significant","nice","okay"]'::jsonb,'"significant"'::jsonb,'''Significant'' is the higher-register choice.',TRUE,'spoken_english','se_drill_range_int_03'),

  -- accuracy → GRAMMAR
  ('SPEAKING','GRAMMAR','INTERMEDIATE','MCQ','Which sentence is correct?',
    '["He don''t like coffee","He doesn''t likes coffee","He doesn''t like coffee","He not like coffee"]'::jsonb,'"He doesn''t like coffee"'::jsonb,'Third-person negative uses ''doesn''t'' + base verb.',TRUE,'spoken_english','se_drill_accuracy_int_01'),
  ('SPEAKING','GRAMMAR','INTERMEDIATE','MCQ','Choose the correct past tense: ''Yesterday I ___ to the market.''',
    '["go","went","gone","going"]'::jsonb,'"went"'::jsonb,'''Went'' is the simple past of ''go''.',TRUE,'spoken_english','se_drill_accuracy_int_02'),
  ('SPEAKING','GRAMMAR','INTERMEDIATE','MCQ','Which is correct?',
    '["I have lived here since three years","I have lived here for three years","I am living here since three years"]'::jsonb,'"I have lived here for three years"'::jsonb,'Use ''for'' with a duration, ''since'' with a start point.',TRUE,'spoken_english','se_drill_accuracy_int_03'),

  -- fluency → FLUENCY
  ('SPEAKING','FLUENCY','INTERMEDIATE','MCQ','Which response sounds most natural?',
    '["I went there to buy some fruits","I go there for buying some fruits","I going there buy fruits"]'::jsonb,'"I went there to buy some fruits"'::jsonb,'Natural past + infinitive of purpose.',TRUE,'spoken_english','se_drill_fluency_int_01'),
  ('SPEAKING','FLUENCY','INTERMEDIATE','MCQ','Pick the most natural linking phrase: ''I love travelling. ___, I visited Japan last year.''',
    '["For example","Because of","In spite","Due to"]'::jsonb,'"For example"'::jsonb,'''For example'' introduces an illustration smoothly.',TRUE,'spoken_english','se_drill_fluency_int_02'),
  ('SPEAKING','FLUENCY','INTERMEDIATE','MCQ','Which sounds most natural when you need a moment to think?',
    '["That''s a good question, let me see","Question good, wait","I no know now"]'::jsonb,'"That''s a good question, let me see"'::jsonb,'A natural stalling phrase keeps you fluent.',TRUE,'spoken_english','se_drill_fluency_int_03'),

  -- interaction → TASK_RESPONSE
  ('SPEAKING','TASK_RESPONSE','INTERMEDIATE','MCQ','A colleague says: ''Could you help me with this report?'' Which reply is most appropriate?',
    '["Sure, I''d be happy to help","Why should I","No","Whatever, maybe later"]'::jsonb,'"Sure, I''d be happy to help"'::jsonb,'Polite, willing, appropriate register.',TRUE,'spoken_english','se_drill_interaction_int_01'),
  ('SPEAKING','TASK_RESPONSE','INTERMEDIATE','MCQ','Your friend asks advice about a job offer. Which response best shows engagement?',
    '["That''s a tough one — have you thought about the pay and the move?","I don''t care","Do what you want"]'::jsonb,'"That''s a tough one — have you thought about the pay and the move?"'::jsonb,'It acknowledges and asks a relevant follow-up.',TRUE,'spoken_english','se_drill_interaction_int_02'),
  ('SPEAKING','TASK_RESPONSE','INTERMEDIATE','MCQ','A customer complains politely. Which is the most appropriate professional reply?',
    '["I''m sorry to hear that. Let me help you resolve it","That''s not my problem","Please calm down"]'::jsonb,'"I''m sorry to hear that. Let me help you resolve it"'::jsonb,'Empathy + offer to help.',TRUE,'spoken_english','se_drill_interaction_int_03'),

  -- coherence → COHERENCE
  ('SPEAKING','COHERENCE','INTERMEDIATE','MCQ','Choose the best linking word: ''I was tired; ___, I finished the report.''',
    '["however","because","so","and"]'::jsonb,'"however"'::jsonb,'''However'' signals the contrast (tired vs finished).',TRUE,'spoken_english','se_drill_coherence_int_01'),
  ('SPEAKING','COHERENCE','INTERMEDIATE','MCQ','Which connector shows the reason: ''I stayed home ___ it was raining.''',
    '["because","but","although","however"]'::jsonb,'"because"'::jsonb,'''Because'' introduces the cause.',TRUE,'spoken_english','se_drill_coherence_int_02'),
  ('SPEAKING','COHERENCE','INTERMEDIATE','MCQ','Put the steps in the most logical order: (a) Finally, we ate. (b) First, we cooked. (c) Then, we set the table.',
    '["b, c, a","a, b, c","c, a, b"]'::jsonb,'"b, c, a"'::jsonb,'First → then → finally is the coherent sequence.',TRUE,'spoken_english','se_drill_coherence_int_03'),

  -- phonology → PRONUNCIATION
  ('SPEAKING','PRONUNCIATION','INTERMEDIATE','MCQ','Which word has the same vowel sound as ''ship''?',
    '["sheep","chip","shape","shop"]'::jsonb,'"chip"'::jsonb,'''Ship'' and ''chip'' share the short /ɪ/ sound.',TRUE,'spoken_english','se_drill_phonology_int_01'),
  ('SPEAKING','PRONUNCIATION','INTERMEDIATE','MCQ','Where is the main stress in ''photograph''?',
    '["PHO-to-graph","pho-TO-graph","pho-to-GRAPH"]'::jsonb,'"PHO-to-graph"'::jsonb,'''Photograph'' is stressed on the first syllable.',TRUE,'spoken_english','se_drill_phonology_int_02'),
  ('SPEAKING','PRONUNCIATION','INTERMEDIATE','MCQ','Which pair are minimal pairs (differ by only one sound)?',
    '["ship / sheep","cat / dog","run / jump"]'::jsonb,'"ship / sheep"'::jsonb,'They differ only in the vowel /ɪ/ vs /iː/.',TRUE,'spoken_english','se_drill_phonology_int_03')

ON CONFLICT (source_key) DO UPDATE SET
  skill = EXCLUDED.skill, sub_skill = EXCLUDED.sub_skill, level = EXCLUDED.level,
  drill_type = EXCLUDED.drill_type, prompt_text = EXCLUDED.prompt_text, options = EXCLUDED.options,
  correct_answer = EXCLUDED.correct_answer, explanation = EXCLUDED.explanation,
  is_active = EXCLUDED.is_active, exam_id = EXCLUDED.exam_id;

-- Verify:  SELECT sub_skill, count(*) FROM drill_questions
--          WHERE exam_id='spoken_english' GROUP BY sub_skill;
