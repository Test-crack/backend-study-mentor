-- ============================================================================
--  Spoken English — diagnostic viva prompts  (diagnostic_questions seed)
-- ----------------------------------------------------------------------------
--  Idempotent: fixed UUIDs + ON CONFLICT (id) DO UPDATE. Safe to re-run; it
--  never deletes or drops anything. Run against the app DB via the app's Prisma
--  connection (same as the diagnostic_status view), NOT prisma db push.
--
--  MODEL
--   * One row per (form, prompt). Two alternate forms — set_id se_spoken_v1 /
--     se_spoken_v2 — so a student is pinned to one coherent form in
--     diagnostic_sessions (getDiagnosticVivaPrompts picks a random form).
--   * Per-prompt timing / warm-up / task type live in `options` (JSON), which the
--     backend maps to prepSeconds / speakSeconds / isWarmup / type.
--   * audio_url = the stimulus the student hears (read-aloud model / voice message),
--     served from the FRONTEND public folder: /diagnostics/spoken-english/...
--   * passage_text is only for the read-aloud task (prompt 2).
--
--  ⚠️  prompt_text / passage_text below are DRAFTS placed from the folder topics.
--      REPLACE them with the content team's finalised sheet so the on-screen text
--      matches what each audio actually says. Everything else (paths, sequence,
--      timing, wiring) is production-ready.
-- ============================================================================

INSERT INTO diagnostic_questions
  (id, level, skill, question_type, set_id, passage_text, audio_url, prompt_text, options, min_words, sequence, is_active, exam_id)
VALUES
  -- ── Form v1 (set_id = se_spoken_v1) ────────────────────────────────────────
  ('5efab1e0-0000-4000-8000-000000000101', 'A', 'SPEAKING', 'VIVA_PROMPT', 'se_spoken_v1',
    NULL,
    '/diagnostics/spoken-english/Prompt_1_Introductions/se_diag_v1_p1_stimulus.wav',
    'Tell us about yourself — your name, where you''re from, and what you do.',
    '{"prep_seconds":0,"speak_seconds":45,"is_warmup":true,"task_type":"Warm-up"}'::jsonb, 5, 1, TRUE, 'spoken_english'),

  ('5efab1e0-0000-4000-8000-000000000102', 'A', 'SPEAKING', 'VIVA_PROMPT', 'se_spoken_v1',
    '[[REPLACE: the exact passage the Prompt-2 (v1) audio reads aloud]]',
    '/diagnostics/spoken-english/Prompt_2_ReadAloud/se_diag_v1_p2_stimulus.wav',
    'Read the following passage aloud, clearly and at a natural pace.',
    '{"prep_seconds":20,"speak_seconds":60,"is_warmup":false,"task_type":"Read aloud","scored_subskills":["phonology","fluency"]}'::jsonb, 20, 2, TRUE, 'spoken_english'),

  ('5efab1e0-0000-4000-8000-000000000103', 'A', 'SPEAKING', 'VIVA_PROMPT', 'se_spoken_v1',
    NULL,
    '/diagnostics/spoken-english/Prompt_3_Narrative/se_diag_v1_p3_stimulus.wav',
    'Tell us about a journey or a day you remember clearly. What happened, and why has it stayed with you?',
    '{"prep_seconds":15,"speak_seconds":75,"is_warmup":false,"task_type":"Narration"}'::jsonb, 25, 3, TRUE, 'spoken_english'),

  ('5efab1e0-0000-4000-8000-000000000104', 'A', 'SPEAKING', 'VIVA_PROMPT', 'se_spoken_v1',
    NULL,
    '/diagnostics/spoken-english/Prompt_4_Opinion/se_diag_v1_p4_stimulus.wav',
    'If you could change one thing about the place you live, what would it be and why?',
    '{"prep_seconds":20,"speak_seconds":90,"is_warmup":false,"task_type":"Opinion"}'::jsonb, 25, 4, TRUE, 'spoken_english'),

  ('5efab1e0-0000-4000-8000-000000000105', 'A', 'SPEAKING', 'VIVA_PROMPT', 'se_spoken_v1',
    NULL,
    '/diagnostics/spoken-english/Prompt_5_Workplace/se_diag_v1_p5_stimulus.wav',
    'Describe your workplace or a place where you study. What is it like, and what do you usually do there?',
    '{"prep_seconds":20,"speak_seconds":90,"is_warmup":false,"task_type":"Description"}'::jsonb, 25, 5, TRUE, 'spoken_english'),

  ('5efab1e0-0000-4000-8000-000000000106', 'A', 'SPEAKING', 'VIVA_PROMPT', 'se_spoken_v1',
    NULL,
    '/diagnostics/spoken-english/Prompt_6_VoiceMessage/se_diag_v1_p6_stimulus.wav',
    'Listen to the voice message from your friend, then reply. Give them your advice and your reasons.',
    '{"prep_seconds":20,"speak_seconds":90,"is_warmup":false,"task_type":"Reply task","listen_first":true}'::jsonb, 25, 6, TRUE, 'spoken_english'),

  ('5efab1e0-0000-4000-8000-000000000107', 'A', 'SPEAKING', 'VIVA_PROMPT', 'se_spoken_v1',
    NULL,
    '/diagnostics/spoken-english/Prompt_7_Proposal/se_diag_v1_p7_stimulus.wav',
    'Propose one idea to improve your town or workplace. What would you propose, and how would you convince others it is worth doing?',
    '{"prep_seconds":25,"speak_seconds":105,"is_warmup":false,"task_type":"Proposal"}'::jsonb, 25, 7, TRUE, 'spoken_english'),

  -- ── Form v2 (set_id = se_spoken_v2) — same prompts, alternate stimulus set ──
  ('5efab1e0-0000-4000-8000-000000000201', 'A', 'SPEAKING', 'VIVA_PROMPT', 'se_spoken_v2',
    NULL,
    '/diagnostics/spoken-english/Prompt_1_Introductions/se_diag_v2_p1_stimulus.wav',
    'Tell us about yourself — your name, where you''re from, and what you do.',
    '{"prep_seconds":0,"speak_seconds":45,"is_warmup":true,"task_type":"Warm-up"}'::jsonb, 5, 1, TRUE, 'spoken_english'),

  ('5efab1e0-0000-4000-8000-000000000202', 'A', 'SPEAKING', 'VIVA_PROMPT', 'se_spoken_v2',
    '[[REPLACE: the exact passage the Prompt-2 (v2) audio reads aloud]]',
    '/diagnostics/spoken-english/Prompt_2_ReadAloud/se_diag_v2_p2_stimulus.wav',
    'Read the following passage aloud, clearly and at a natural pace.',
    '{"prep_seconds":20,"speak_seconds":60,"is_warmup":false,"task_type":"Read aloud","scored_subskills":["phonology","fluency"]}'::jsonb, 20, 2, TRUE, 'spoken_english'),

  ('5efab1e0-0000-4000-8000-000000000203', 'A', 'SPEAKING', 'VIVA_PROMPT', 'se_spoken_v2',
    NULL,
    '/diagnostics/spoken-english/Prompt_3_Narrative/se_diag_v2_p3_stimulus.wav',
    'Tell us about a journey or a day you remember clearly. What happened, and why has it stayed with you?',
    '{"prep_seconds":15,"speak_seconds":75,"is_warmup":false,"task_type":"Narration"}'::jsonb, 25, 3, TRUE, 'spoken_english'),

  ('5efab1e0-0000-4000-8000-000000000204', 'A', 'SPEAKING', 'VIVA_PROMPT', 'se_spoken_v2',
    NULL,
    '/diagnostics/spoken-english/Prompt_4_Opinion/se_diag_v2_p4_stimulus.wav',
    'If you could change one thing about the place you live, what would it be and why?',
    '{"prep_seconds":20,"speak_seconds":90,"is_warmup":false,"task_type":"Opinion"}'::jsonb, 25, 4, TRUE, 'spoken_english'),

  ('5efab1e0-0000-4000-8000-000000000205', 'A', 'SPEAKING', 'VIVA_PROMPT', 'se_spoken_v2',
    NULL,
    '/diagnostics/spoken-english/Prompt_5_Workplace/se_diag_v2_p5_stimulus.wav',
    'Describe your workplace or a place where you study. What is it like, and what do you usually do there?',
    '{"prep_seconds":20,"speak_seconds":90,"is_warmup":false,"task_type":"Description"}'::jsonb, 25, 5, TRUE, 'spoken_english'),

  ('5efab1e0-0000-4000-8000-000000000206', 'A', 'SPEAKING', 'VIVA_PROMPT', 'se_spoken_v2',
    NULL,
    '/diagnostics/spoken-english/Prompt_6_VoiceMessage/se_diag_v2_p6_stimulus.wav',
    'Listen to the voice message from your friend, then reply. Give them your advice and your reasons.',
    '{"prep_seconds":20,"speak_seconds":90,"is_warmup":false,"task_type":"Reply task","listen_first":true}'::jsonb, 25, 6, TRUE, 'spoken_english'),

  ('5efab1e0-0000-4000-8000-000000000207', 'A', 'SPEAKING', 'VIVA_PROMPT', 'se_spoken_v2',
    NULL,
    '/diagnostics/spoken-english/Prompt_7_Proposal/se_diag_v2_p7_stimulus.wav',
    'Propose one idea to improve your town or workplace. What would you propose, and how would you convince others it is worth doing?',
    '{"prep_seconds":25,"speak_seconds":105,"is_warmup":false,"task_type":"Proposal"}'::jsonb, 25, 7, TRUE, 'spoken_english')

ON CONFLICT (id) DO UPDATE SET
  level         = EXCLUDED.level,
  skill         = EXCLUDED.skill,
  question_type = EXCLUDED.question_type,
  set_id        = EXCLUDED.set_id,
  passage_text  = EXCLUDED.passage_text,
  audio_url     = EXCLUDED.audio_url,
  prompt_text   = EXCLUDED.prompt_text,
  options       = EXCLUDED.options,
  min_words     = EXCLUDED.min_words,
  sequence      = EXCLUDED.sequence,
  is_active     = EXCLUDED.is_active,
  exam_id       = EXCLUDED.exam_id;

-- Verify:
--   SELECT set_id, sequence, prompt_text, audio_url FROM diagnostic_questions
--   WHERE exam_id = 'spoken_english' ORDER BY set_id, sequence;
