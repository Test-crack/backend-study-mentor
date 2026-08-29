-- ============================================================================
--  Spoken English — diagnostic viva prompts, batch 2 (diagnostic_questions seed)
-- ----------------------------------------------------------------------------
--  Adds new versions to the 7 existing prompt slots seeded in
--  spoken_english_viva.sql. Same conventions as that file:
--  idempotent (fixed UUIDs + ON CONFLICT DO UPDATE), additive only.
--
--  New versions added:
--   * Slot 1 (Warm-up)      — v3, v4 (audio)
--   * Slot 2 (Read-aloud)   — v3       (text only, no audio)
--   * Slot 3 (Narration)    — v3, v4 (audio)
--   * Slot 4 (Opinion)      — v3, v4 (audio)
--   * Slot 5 (Roleplay)     — v3, v4 (audio)
--   * Slot 6 (Reply task)   — v6, v7, v8 (audio, listen_first)
--   * Slot 7 (Proposal)     — v3, v4 (audio)
-- ============================================================================

INSERT INTO diagnostic_questions
  (id, level, skill, question_type, set_id, passage_text, audio_url, prompt_text, options, min_words, sequence, is_active, exam_id)
VALUES
  -- ── Prompt 1 · Introductions (warm-up, audio) ──────────────────────────────
  ('5efab1e0-0000-4000-8000-000000000103', 'A', 'SPEAKING', 'SPEAKING_PROMPT', 'se_spoken', NULL,
    '/diagnostics/spoken-english/Prompt_1_Introductions/se_diag_v3_p1_stimulus.wav',
    'Hi, thanks for joining. Could you tell me your name, the city you live in, and one thing you enjoy doing on your day off?',
    '{"version":3,"prep_seconds":0,"speak_seconds":45,"is_warmup":true,"task_type":"Warm-up","display":"audio"}'::jsonb, 5, 1, TRUE, 'spoken_english'),
  ('5efab1e0-0000-4000-8000-000000000104', 'A', 'SPEAKING', 'SPEAKING_PROMPT', 'se_spoken', NULL,
    '/diagnostics/spoken-english/Prompt_1_Introductions/se_diag_v4_p1_stimulus.wav',
    'Let''s start with the basics — tell me a bit about yourself, your background, and what you''re currently doing, whether that''s work or studying.',
    '{"version":4,"prep_seconds":0,"speak_seconds":45,"is_warmup":true,"task_type":"Warm-up","display":"audio"}'::jsonb, 5, 1, TRUE, 'spoken_english'),

  -- ── Prompt 2 · Read-aloud (text shown, no audio; graded phonology+fluency) ──
  ('5efab1e0-0000-4000-8000-000000000203', 'A', 'SPEAKING', 'SPEAKING_PROMPT', 'se_spoken',
    'Learning a new language becomes easier when you practise speaking every day and are not afraid of making mistakes along the way.',
    NULL,
    'Read the sentence on screen aloud, clearly and at a natural pace.',
    '{"version":3,"prep_seconds":20,"speak_seconds":60,"is_warmup":false,"task_type":"Read aloud","display":"text","scored_subskills":["phonology","fluency"]}'::jsonb, 8, 2, TRUE, 'spoken_english'),

  -- ── Prompt 3 · Narrative (audio) ───────────────────────────────────────────
  ('5efab1e0-0000-4000-8000-000000000303', 'A', 'SPEAKING', 'SPEAKING_PROMPT', 'se_spoken', NULL,
    '/diagnostics/spoken-english/Prompt_3_Narrative/se_diag_v3_p3_stimulus.wav',
    'Think about a time you learned a new skill or hobby. Describe what it was, how you learned it, and what was the hardest part about getting started.',
    '{"version":3,"prep_seconds":15,"speak_seconds":75,"is_warmup":false,"task_type":"Narration","display":"audio"}'::jsonb, 25, 3, TRUE, 'spoken_english'),
  ('5efab1e0-0000-4000-8000-000000000304', 'A', 'SPEAKING', 'SPEAKING_PROMPT', 'se_spoken', NULL,
    '/diagnostics/spoken-english/Prompt_3_Narrative/se_diag_v4_p3_stimulus.wav',
    'Describe a moment when you had to make a quick decision under pressure. What happened, and how did things turn out?',
    '{"version":4,"prep_seconds":15,"speak_seconds":75,"is_warmup":false,"task_type":"Narration","display":"audio"}'::jsonb, 25, 3, TRUE, 'spoken_english'),

  -- ── Prompt 4 · Opinion (audio) ─────────────────────────────────────────────
  ('5efab1e0-0000-4000-8000-000000000403', 'A', 'SPEAKING', 'SPEAKING_PROMPT', 'se_spoken', NULL,
    '/diagnostics/spoken-english/Prompt_4_Opinion/se_diag_v3_p4_stimulus.wav',
    'Some people think social media has made communication easier, while others think it has made people more isolated. What''s your opinion, and why?',
    '{"version":3,"prep_seconds":20,"speak_seconds":90,"is_warmup":false,"task_type":"Opinion","display":"audio"}'::jsonb, 25, 4, TRUE, 'spoken_english'),
  ('5efab1e0-0000-4000-8000-000000000404', 'A', 'SPEAKING', 'SPEAKING_PROMPT', 'se_spoken', NULL,
    '/diagnostics/spoken-english/Prompt_4_Opinion/se_diag_v4_p4_stimulus.wav',
    'Do you think it''s better to specialize in one skill deeply, or to be good at many different things? Explain your view.',
    '{"version":4,"prep_seconds":20,"speak_seconds":90,"is_warmup":false,"task_type":"Opinion","display":"audio"}'::jsonb, 25, 4, TRUE, 'spoken_english'),

  -- ── Prompt 5 · Workplace / functional roleplay (audio) ─────────────────────
  ('5efab1e0-0000-4000-8000-000000000503', 'A', 'SPEAKING', 'SPEAKING_PROMPT', 'se_spoken', NULL,
    '/diagnostics/spoken-english/Prompt_5_Workplace/se_diag_v3_p5_stimulus.wav',
    'You booked a hotel room for a work trip, but on arrival they have no record of your booking and the hotel is full. Call reservations, explain calmly, and ask them to fix it.',
    '{"version":3,"prep_seconds":20,"speak_seconds":90,"is_warmup":false,"task_type":"Roleplay","display":"audio"}'::jsonb, 25, 5, TRUE, 'spoken_english'),
  ('5efab1e0-0000-4000-8000-000000000504', 'A', 'SPEAKING', 'SPEAKING_PROMPT', 'se_spoken', NULL,
    '/diagnostics/spoken-english/Prompt_5_Workplace/se_diag_v4_p5_stimulus.wav',
    'You bought a pair of headphones online, but they stopped working after three days. Call customer support, describe the issue, and ask for a replacement or refund.',
    '{"version":4,"prep_seconds":20,"speak_seconds":90,"is_warmup":false,"task_type":"Roleplay","display":"audio"}'::jsonb, 25, 5, TRUE, 'spoken_english'),

  -- ── Prompt 6 · Voice message reply (audio; 3 new variants) ─────────────────
  ('5efab1e0-0000-4000-8000-000000000606', 'A', 'SPEAKING', 'SPEAKING_PROMPT', 'se_spoken', NULL,
    '/diagnostics/spoken-english/Prompt_6_VoiceMessage/se_diag_v6_p6_stimulus.wav',
    'The student heard this voice message from a friend asking for advice and must reply with their advice and reasons. Message: "Hey, can I ask you something? My younger sibling wants to start a small business and asked me to lend a big chunk of my savings. I want to help, but I''m scared I might not get it back. What would you do?"',
    '{"version":6,"prep_seconds":20,"speak_seconds":90,"is_warmup":false,"task_type":"Reply task","display":"audio","listen_first":true}'::jsonb, 25, 6, TRUE, 'spoken_english'),
  ('5efab1e0-0000-4000-8000-000000000607', 'A', 'SPEAKING', 'SPEAKING_PROMPT', 'se_spoken', NULL,
    '/diagnostics/spoken-english/Prompt_6_VoiceMessage/se_diag_v7_p6_stimulus.wav',
    'The student heard this voice message from a friend asking for advice and must reply with their advice and reasons. Message: "Hey, I need your honest opinion. I never finished my degree, and now at this age I''m thinking of going back to complete it, even if it means stepping back from my job for a while. Is that a crazy idea?"',
    '{"version":7,"prep_seconds":20,"speak_seconds":90,"is_warmup":false,"task_type":"Reply task","display":"audio","listen_first":true}'::jsonb, 25, 6, TRUE, 'spoken_english'),
  ('5efab1e0-0000-4000-8000-000000000608', 'A', 'SPEAKING', 'SPEAKING_PROMPT', 'se_spoken', NULL,
    '/diagnostics/spoken-english/Prompt_6_VoiceMessage/se_diag_v8_p6_stimulus.wav',
    'The student heard this voice message from a friend asking for advice and must reply with their advice and reasons. Message: "Hey, I don''t know what to do. A close friend broke a promise that really hurt me, but confronting them might damage the friendship for good. Should I say something or just let it go?"',
    '{"version":8,"prep_seconds":20,"speak_seconds":90,"is_warmup":false,"task_type":"Reply task","display":"audio","listen_first":true}'::jsonb, 25, 6, TRUE, 'spoken_english'),

  -- ── Prompt 7 · Proposal (audio) ────────────────────────────────────────────
  ('5efab1e0-0000-4000-8000-000000000703', 'A', 'SPEAKING', 'SPEAKING_PROMPT', 'se_spoken', NULL,
    '/diagnostics/spoken-english/Prompt_7_Proposal/se_diag_v3_p7_stimulus.wav',
    'Traffic congestion near the local school has been getting worse every morning, causing safety concerns for children walking in. Present a proposal to the town council outlining two practical changes to fix this.',
    '{"version":3,"prep_seconds":25,"speak_seconds":105,"is_warmup":false,"task_type":"Proposal","display":"audio"}'::jsonb, 25, 7, TRUE, 'spoken_english'),
  ('5efab1e0-0000-4000-8000-000000000704', 'A', 'SPEAKING', 'SPEAKING_PROMPT', 'se_spoken', NULL,
    '/diagnostics/spoken-english/Prompt_7_Proposal/se_diag_v4_p7_stimulus.wav',
    'New employees at your company have been struggling to settle in and often leave within the first few months. Propose two concrete steps HR could take to improve onboarding and retention.',
    '{"version":4,"prep_seconds":25,"speak_seconds":105,"is_warmup":false,"task_type":"Proposal","display":"audio"}'::jsonb, 25, 7, TRUE, 'spoken_english')

ON CONFLICT (id) DO UPDATE SET
  level = EXCLUDED.level, skill = EXCLUDED.skill, question_type = EXCLUDED.question_type,
  set_id = EXCLUDED.set_id, passage_text = EXCLUDED.passage_text, audio_url = EXCLUDED.audio_url,
  prompt_text = EXCLUDED.prompt_text, options = EXCLUDED.options, min_words = EXCLUDED.min_words,
  sequence = EXCLUDED.sequence, is_active = EXCLUDED.is_active, exam_id = EXCLUDED.exam_id;

-- Verify:
--   SELECT sequence, (options->>'version') AS ver, (options->>'display') AS disp, prompt_text
--   FROM diagnostic_questions WHERE exam_id = 'spoken_english' ORDER BY sequence, ver;
