-- ============================================================
-- IeltsVoicePrompt table — speaking prompts for Voice Lab
-- (used by both Speech Anatomy and Vocal Resonance engines)
--
-- Run this in pgAdmin Query Tool on your study-mentor database.
-- ============================================================

-- 1. Create extension (already exists on most Supabase projects — safe to re-run)
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 2. Create table
CREATE TABLE "IeltsVoicePrompt" (
    "id"           UUID          NOT NULL DEFAULT uuid_generate_v4(),
    "band"         VARCHAR(50)   NOT NULL,          -- e.g. 'Band 5', 'Band 6', 'Band 7', 'Band 8'
    "feature"      VARCHAR(50)   NOT NULL DEFAULT 'anatomy', -- 'anatomy' | 'resonance' | 'both'
    "question"     TEXT          NOT NULL,          -- The speaking prompt shown to the user
    "hint"         TEXT,                            -- Short coaching tip shown below the prompt
    "targetWpmMin" INTEGER       NOT NULL DEFAULT 120,
    "targetWpmMax" INTEGER       NOT NULL DEFAULT 160,
    "isActive"     BOOLEAN       NOT NULL DEFAULT true,
    "createdAt"    TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    "updatedAt"    TIMESTAMPTZ   NOT NULL DEFAULT NOW(),

    CONSTRAINT "IeltsVoicePrompt_pkey" PRIMARY KEY ("id")
);

-- 3. Indexes
CREATE INDEX "idx_voice_prompt_band"    ON "IeltsVoicePrompt" ("band");
CREATE INDEX "idx_voice_prompt_feature" ON "IeltsVoicePrompt" ("feature");
CREATE INDEX "idx_voice_prompt_active"  ON "IeltsVoicePrompt" ("isActive");

-- ============================================================
-- 4. Seed data — 4 prompts per band (16 total) for anatomy
-- ============================================================

-- Band 5 (targetWpm 110–140)
INSERT INTO "IeltsVoicePrompt" ("band", "feature", "question", "hint", "targetWpmMin", "targetWpmMax") VALUES
('Band 5', 'anatomy', 'Describe your hometown. What do you like about it?',
 'Mention location, key landmarks, and why you enjoy living there. Speak at a natural, relaxed pace.',
 110, 140),

('Band 5', 'anatomy', 'Talk about your favourite food. Why do you enjoy eating it?',
 'Describe the taste, texture, and where you usually eat it. Include how often you have it.',
 110, 140),

('Band 5', 'anatomy', 'Describe a hobby you enjoy in your free time.',
 'Explain when you started, what you do step by step, and how it makes you feel afterwards.',
 110, 140),

('Band 5', 'anatomy', 'Talk about a person in your family who is important to you.',
 'Describe who they are, what they do, and give a specific reason why they matter to you.',
 110, 140);

-- Band 6 (targetWpm 125–155)
INSERT INTO "IeltsVoicePrompt" ("band", "feature", "question", "hint", "targetWpmMin", "targetWpmMax") VALUES
('Band 6', 'anatomy', 'Describe a time when you learned something new. What was it and how did you learn it?',
 'Use past tense. Include a specific example and what you found challenging about it.',
 125, 155),

('Band 6', 'anatomy', 'Talk about a place you have visited that left a strong impression on you.',
 'Describe the location, what you saw or experienced, and explain how it made you feel.',
 125, 155),

('Band 6', 'anatomy', 'Describe a goal you have for the future. Explain why it is important to you.',
 'Be specific about the goal, give two clear reasons, and include a realistic timeframe.',
 125, 155),

('Band 6', 'anatomy', 'Describe a book, film, or show that you enjoyed. Why would you recommend it?',
 'Briefly summarise the story without spoilers, then explain the impact it had on you personally.',
 125, 155);

-- Band 7 (targetWpm 140–165)
INSERT INTO "IeltsVoicePrompt" ("band", "feature", "question", "hint", "targetWpmMin", "targetWpmMax") VALUES
('Band 7', 'anatomy', 'Some people believe technology has made human relationships less meaningful. To what extent do you agree?',
 'Present a balanced view with examples on both sides. Use discourse markers like "however" and "on the other hand".',
 140, 165),

('Band 7', 'anatomy', 'Describe a situation where you had to solve a difficult problem under pressure. How did you handle it?',
 'Use rich vocabulary. Show your thought process clearly and reflect genuinely on the outcome.',
 140, 165),

('Band 7', 'anatomy', 'Many young people today prefer to work remotely rather than in an office. Discuss the advantages and disadvantages.',
 'Cover both sides equally. Avoid repeating vocabulary — paraphrase and use synonyms throughout.',
 140, 165),

('Band 7', 'anatomy', 'Describe a person who has significantly influenced your thinking or career path. How did they do this?',
 'Focus on specific interactions or moments. Vary your tense usage: past for events, present for lasting impact.',
 140, 165);

-- Band 8 (targetWpm 150–175)
INSERT INTO "IeltsVoicePrompt" ("band", "feature", "question", "hint", "targetWpmMin", "targetWpmMax") VALUES
('Band 8', 'anatomy', 'Critically evaluate the impact of social media on political discourse in democratic societies.',
 'Demonstrate sophisticated vocabulary and nuanced reasoning. Avoid oversimplifying complex issues.',
 150, 175),

('Band 8', 'anatomy', 'To what extent should governments intervene in the regulation of artificial intelligence?',
 'Argue a clear position with evidence. Use conditionals, hedging language, and strong cohesive devices.',
 150, 175),

('Band 8', 'anatomy', 'Discuss the ethical implications of genetic engineering in healthcare versus agricultural applications.',
 'Compare two domains precisely. Show command of technical and abstract language throughout.',
 150, 175),

('Band 8', 'anatomy', 'Analyse how globalisation has reshaped cultural identity among young people worldwide.',
 'Use sophisticated linking phrases. Integrate specific examples from at least two different world regions.',
 150, 175);

-- ============================================================
-- Verify
-- ============================================================
SELECT band, feature, COUNT(*) AS prompt_count
FROM "IeltsVoicePrompt"
GROUP BY band, feature
ORDER BY band;
