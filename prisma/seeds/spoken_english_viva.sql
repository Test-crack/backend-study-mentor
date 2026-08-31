-- ============================================================================
--  Spoken English — diagnostic viva prompts  (diagnostic_questions seed)
-- ----------------------------------------------------------------------------
--  Idempotent: fixed UUIDs + ON CONFLICT (id) DO UPDATE. Safe to re-run; never
--  deletes/drops. Run via the app's Prisma connection (like the diagnostic_status
--  view), NOT prisma db push.
--
--  MODEL (per-prompt version selection)
--   * 7 prompt "sets" (sequence 1..7); each has N alternate versions
--     (options.version). p1–p5,p7 have 2; p6 (voice message) has 5.
--   * The server picks ONE version per prompt → a student answers 7 questions,
--     randomly mixed. The chosen version vector is pinned in diagnostic_sessions
--     so serve/submit agree. All rows share set_id 'se_spoken' (just a label).
--   * DISPLAY: options.display = 'audio' → the student only HEARS the question
--     (audio_url), replayable, no text shown. 'text' (read-aloud only) → the
--     passage_text is shown, no audio.
--   * GRADING: prompt_text is the grader's context (server-side only, never shown
--     for audio prompts). Read-aloud rows set scored_subskills=[phonology,fluency].
--     Prompt-text values are the Gemini transcripts of each stimulus .wav.
-- ============================================================================

INSERT INTO diagnostic_questions
  (id, level, skill, question_type, set_id, passage_text, audio_url, prompt_text, options, min_words, sequence, is_active, exam_id)
VALUES
  -- ── Prompt 1 · Introductions (warm-up, audio) ──────────────────────────────
  ('5efab1e0-0000-4000-8000-000000000101', 'A', 'SPEAKING', 'SPEAKING_PROMPT', 'se_spoken', NULL,
    '/diagnostics/spoken-english/Prompt_1_Introductions/se_diag_v1_p1_stimulus.wav',
    'Hello and welcome to your speaking assessment. To start off, please tell me a little bit about yourself, where you are from, and what a typical day looks like for you.',
    '{"version":1,"prep_seconds":0,"speak_seconds":45,"is_warmup":true,"task_type":"Warm-up","display":"audio"}'::jsonb, 5, 1, TRUE, 'spoken_english'),
  ('5efab1e0-0000-4000-8000-000000000102', 'A', 'SPEAKING', 'SPEAKING_PROMPT', 'se_spoken', NULL,
    '/diagnostics/spoken-english/Prompt_1_Introductions/se_diag_v2_p1_stimulus.wav',
    'Hi there. Let''s begin with a quick introduction. Could you introduce yourself, mention your hometown or current city, and describe what you enjoy doing in your free time?',
    '{"version":2,"prep_seconds":0,"speak_seconds":45,"is_warmup":true,"task_type":"Warm-up","display":"audio"}'::jsonb, 5, 1, TRUE, 'spoken_english'),

  -- ── Prompt 2 · Read-aloud (text shown, no audio; graded phonology+fluency) ──
  ('5efab1e0-0000-4000-8000-000000000201', 'A', 'SPEAKING', 'SPEAKING_PROMPT', 'se_spoken',
    'Effective communication requires not only speaking fluently, but also listening attentively and adapting your message to your audience.',
    '/diagnostics/spoken-english/Prompt_2_ReadAloud/se_diag_v1_p2_stimulus.wav',
    'Read the sentence on screen aloud, clearly and at a natural pace.',
    '{"version":1,"prep_seconds":20,"speak_seconds":60,"is_warmup":false,"task_type":"Read aloud","display":"text","scored_subskills":["phonology","fluency"]}'::jsonb, 8, 2, TRUE, 'spoken_english'),
  ('5efab1e0-0000-4000-8000-000000000202', 'A', 'SPEAKING', 'SPEAKING_PROMPT', 'se_spoken',
    'Developing strong professional relationships depends on clear expectations, mutual respect, and consistent follow-through on every project.',
    '/diagnostics/spoken-english/Prompt_2_ReadAloud/se_diag_v2_p2_stimulus.wav',
    'Read the sentence on screen aloud, clearly and at a natural pace.',
    '{"version":2,"prep_seconds":20,"speak_seconds":60,"is_warmup":false,"task_type":"Read aloud","display":"text","scored_subskills":["phonology","fluency"]}'::jsonb, 8, 2, TRUE, 'spoken_english'),

  -- ── Prompt 3 · Narrative (audio) ───────────────────────────────────────────
  ('5efab1e0-0000-4000-8000-000000000301', 'A', 'SPEAKING', 'SPEAKING_PROMPT', 'se_spoken', NULL,
    '/diagnostics/spoken-english/Prompt_3_Narrative/se_diag_v1_p3_stimulus.wav',
    'Think about a memorable trip or journey you took recently. Describe where you went, who was with you, and one unexpected event that made the trip memorable.',
    '{"version":1,"prep_seconds":15,"speak_seconds":75,"is_warmup":false,"task_type":"Narration","display":"audio"}'::jsonb, 25, 3, TRUE, 'spoken_english'),
  ('5efab1e0-0000-4000-8000-000000000302', 'A', 'SPEAKING', 'SPEAKING_PROMPT', 'se_spoken', NULL,
    '/diagnostics/spoken-english/Prompt_3_Narrative/se_diag_v2_p3_stimulus.wav',
    'Think about a challenging goal you worked hard to achieve. Describe what the goal was, the steps you took to accomplish it, and how you felt when it was finished.',
    '{"version":2,"prep_seconds":15,"speak_seconds":75,"is_warmup":false,"task_type":"Narration","display":"audio"}'::jsonb, 25, 3, TRUE, 'spoken_english'),

  -- ── Prompt 4 · Opinion (audio) ─────────────────────────────────────────────
  ('5efab1e0-0000-4000-8000-000000000401', 'A', 'SPEAKING', 'SPEAKING_PROMPT', 'se_spoken', NULL,
    '/diagnostics/spoken-english/Prompt_4_Opinion/se_diag_v1_p4_stimulus.wav',
    'Some people believe that working remotely from home is much more productive than working in a traditional office, while others prefer face-to-face collaboration. What is your opinion and why?',
    '{"version":1,"prep_seconds":20,"speak_seconds":90,"is_warmup":false,"task_type":"Opinion","display":"audio"}'::jsonb, 25, 4, TRUE, 'spoken_english'),
  ('5efab1e0-0000-4000-8000-000000000402', 'A', 'SPEAKING', 'SPEAKING_PROMPT', 'se_spoken', NULL,
    '/diagnostics/spoken-english/Prompt_4_Opinion/se_diag_v2_p4_stimulus.wav',
    'Many students now prefer online courses over classroom learning. Do you think digital learning can completely replace traditional education? Give reasons to support your view.',
    '{"version":2,"prep_seconds":20,"speak_seconds":90,"is_warmup":false,"task_type":"Opinion","display":"audio"}'::jsonb, 25, 4, TRUE, 'spoken_english'),

  -- ── Prompt 5 · Workplace / functional roleplay (audio) ─────────────────────
  ('5efab1e0-0000-4000-8000-000000000501', 'A', 'SPEAKING', 'SPEAKING_PROMPT', 'se_spoken', NULL,
    '/diagnostics/spoken-english/Prompt_5_Workplace/se_diag_v1_p5_stimulus.wav',
    'You ordered an important laptop for work, but it arrived two weeks late with a damaged screen. Call the customer support service, explain the issue politely, and request an immediate replacement or refund.',
    '{"version":1,"prep_seconds":20,"speak_seconds":90,"is_warmup":false,"task_type":"Roleplay","display":"audio"}'::jsonb, 25, 5, TRUE, 'spoken_english'),
  ('5efab1e0-0000-4000-8000-000000000502', 'A', 'SPEAKING', 'SPEAKING_PROMPT', 'se_spoken', NULL,
    '/diagnostics/spoken-english/Prompt_5_Workplace/se_diag_v2_p5_stimulus.wav',
    'You need to ask your team manager for a three-day leave next week to attend a family wedding during a busy sprint. Leave a professional voicemail explaining your plan to cover your tasks beforehand.',
    '{"version":2,"prep_seconds":20,"speak_seconds":90,"is_warmup":false,"task_type":"Roleplay","display":"audio"}'::jsonb, 25, 5, TRUE, 'spoken_english'),

  -- ── Prompt 6 · Voice message reply (audio; 5 variants) ─────────────────────
  --   prompt_text embeds the message transcript so the grader can judge the reply's
  --   relevance (Responsiveness). The student only hears the audio and replies.
  ('5efab1e0-0000-4000-8000-000000000601', 'A', 'SPEAKING', 'SPEAKING_PROMPT', 'se_spoken', NULL,
    '/diagnostics/spoken-english/Prompt_6_VoiceMessage/se_diag_v1_p6_stimulus.wav',
    'The student heard this voice message from a friend asking for advice and must reply with their advice and reasons. Message: "Hey, it''s me. I need your advice. I''ve been offered a new job in another city. The pay is better and it''s a real step up for my career, but it means leaving my family and all my friends here. I keep going back and forth. What do you think I should do?"',
    '{"version":1,"prep_seconds":20,"speak_seconds":90,"is_warmup":false,"task_type":"Reply task","display":"audio","listen_first":true}'::jsonb, 25, 6, TRUE, 'spoken_english'),
  ('5efab1e0-0000-4000-8000-000000000602', 'A', 'SPEAKING', 'SPEAKING_PROMPT', 'se_spoken', NULL,
    '/diagnostics/spoken-english/Prompt_6_VoiceMessage/se_diag_v2_p6_stimulus.wav',
    'The student heard this voice message from a friend asking for advice and must reply with their advice and reasons. Message: "Hey, do you have a minute? I really need your take on something. My friend asked me to partner with him on a new startup. It sounds really exciting and has huge potential, but I''d have to leave my stable company job. I just can''t decide. What would you do if you were me?"',
    '{"version":2,"prep_seconds":20,"speak_seconds":90,"is_warmup":false,"task_type":"Reply task","display":"audio","listen_first":true}'::jsonb, 25, 6, TRUE, 'spoken_english'),
  ('5efab1e0-0000-4000-8000-000000000603', 'A', 'SPEAKING', 'SPEAKING_PROMPT', 'se_spoken', NULL,
    '/diagnostics/spoken-english/Prompt_6_VoiceMessage/se_diag_v3_p6_stimulus.wav',
    'The student heard this voice message from a friend asking for advice and must reply with their advice and reasons. Message: "Hey, I wanted to ask your advice about something. I just got accepted into a master''s program abroad. It''s a fantastic university and a great opportunity, but I''d have to take out a big loan and pause my career. I''m really torn. Do you think I should go for it?"',
    '{"version":3,"prep_seconds":20,"speak_seconds":90,"is_warmup":false,"task_type":"Reply task","display":"audio","listen_first":true}'::jsonb, 25, 6, TRUE, 'spoken_english'),
  ('5efab1e0-0000-4000-8000-000000000604', 'A', 'SPEAKING', 'SPEAKING_PROMPT', 'se_spoken', NULL,
    '/diagnostics/spoken-english/Prompt_6_VoiceMessage/se_diag_v4_p6_stimulus.wav',
    'The student heard this voice message from a friend asking for advice and must reply with their advice and reasons. Message: "Hey, can I get your opinion on a big decision? I found a great apartment right in the center of the city. It cuts my commute to five minutes, but the rent is almost double what I pay now. I keep hesitating. Is it worth paying more for the convenience?"',
    '{"version":4,"prep_seconds":20,"speak_seconds":90,"is_warmup":false,"task_type":"Reply task","display":"audio","listen_first":true}'::jsonb, 25, 6, TRUE, 'spoken_english'),
  ('5efab1e0-0000-4000-8000-000000000605', 'A', 'SPEAKING', 'SPEAKING_PROMPT', 'se_spoken', NULL,
    '/diagnostics/spoken-english/Prompt_6_VoiceMessage/se_diag_v5_p6_stimulus.wav',
    'The student heard this voice message from a friend asking for advice and must reply with their advice and reasons. Message: "Hey, are you free to chat for a second? I was offered a promotion to team lead at work. The title and salary look amazing, but it means working weekends and taking on constant overtime. I''m really not sure. Should I take the promotion or protect my free time?"',
    '{"version":5,"prep_seconds":20,"speak_seconds":90,"is_warmup":false,"task_type":"Reply task","display":"audio","listen_first":true}'::jsonb, 25, 6, TRUE, 'spoken_english'),

  -- ── Prompt 7 · Proposal (audio) ────────────────────────────────────────────
  ('5efab1e0-0000-4000-8000-000000000701', 'A', 'SPEAKING', 'SPEAKING_PROMPT', 'se_spoken', NULL,
    '/diagnostics/spoken-english/Prompt_7_Proposal/se_diag_v1_p7_stimulus.wav',
    'Your company noticed that employee engagement in weekly meetings has dropped significantly. Present a structured proposal to your team outlining two practical changes that would make meetings more interactive and productive.',
    '{"version":1,"prep_seconds":25,"speak_seconds":105,"is_warmup":false,"task_type":"Proposal","display":"audio"}'::jsonb, 25, 7, TRUE, 'spoken_english'),
  ('5efab1e0-0000-4000-8000-000000000702', 'A', 'SPEAKING', 'SPEAKING_PROMPT', 'se_spoken', NULL,
    '/diagnostics/spoken-english/Prompt_7_Proposal/se_diag_v2_p7_stimulus.wav',
    'Your college community wants to launch a green sustainability initiative to reduce plastic waste and conserve electricity. Propose two concrete steps the campus should implement this semester.',
    '{"version":2,"prep_seconds":25,"speak_seconds":105,"is_warmup":false,"task_type":"Proposal","display":"audio"}'::jsonb, 25, 7, TRUE, 'spoken_english')

ON CONFLICT (id) DO UPDATE SET
  level = EXCLUDED.level, skill = EXCLUDED.skill, question_type = EXCLUDED.question_type,
  set_id = EXCLUDED.set_id, passage_text = EXCLUDED.passage_text, audio_url = EXCLUDED.audio_url,
  prompt_text = EXCLUDED.prompt_text, options = EXCLUDED.options, min_words = EXCLUDED.min_words,
  sequence = EXCLUDED.sequence, is_active = EXCLUDED.is_active, exam_id = EXCLUDED.exam_id;

-- Verify:
--   SELECT sequence, (options->>'version') AS ver, (options->>'display') AS disp, prompt_text
--   FROM diagnostic_questions WHERE exam_id = 'spoken_english' ORDER BY sequence, ver;
