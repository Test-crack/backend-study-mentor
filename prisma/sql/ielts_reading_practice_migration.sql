-- Enable UUID extension if not already enabled
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Create the IeltsReadingPractice table
CREATE TABLE "IeltsReadingPractice" (
    "id" UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    "title" VARCHAR(500) NOT NULL,
    "type" VARCHAR(100) NOT NULL,
    "words" INTEGER NOT NULL,
    "phrases" INTEGER NOT NULL,
    "band" VARCHAR(50) NOT NULL,
    "modelAnswer" TEXT NOT NULL,
    "keywords" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "keywordMap" JSONB,
    "tips" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Create index on band for faster filtering
CREATE INDEX "idx_ielts_reading_practice_band" ON "IeltsReadingPractice" ("band");

-- Seed the initial 6 topics from the frontend
INSERT INTO "IeltsReadingPractice" ("title", "type", "words", "phrases", "band", "modelAnswer", "keywords", "keywordMap", "tips") VALUES
(
    'Describe your hometown.', 
    'Short Answer', 
    48, 
    5, 
    'BAND 6', 
    'I come from a small coastal town called Kochi in Kerala. It is known for its beautiful backwaters and vibrant fishing industry. Living there provides a peaceful atmosphere compared to major cities.',
    ARRAY['coastal town', 'known for', 'vibrant', 'peaceful atmosphere'],
    '[{"word": "coastal town", "meaning": "Location descriptor"}, {"word": "known for", "meaning": "Fame/Reputation phrase"}, {"word": "vibrant", "meaning": "Strong adjective"}, {"word": "peaceful atmosphere", "meaning": "Environmental description"}]'::jsonb,
    ARRAY['Use descriptive adjectives', 'Mention specific locations', 'Keep it personal yet formal']
),
(
    'Do you think social media has a positive or negative impact on society?', 
    'Paragraph', 
    81, 
    6, 
    'BAND 7', 
    'Social media is a double-edged sword. On the positive side, it connects people across the globe and provides a platform for voices that might otherwise be unheard. However, the negative impacts, such as the spread of misinformation, cannot be ignored. In my opinion, we must approach it with a critical eye.',
    ARRAY['double-edged sword', 'On the positive side', 'otherwise be unheard', 'misinformation', 'critical eye'],
    '[{"word": "double-edged sword", "meaning": "Idiomatic expression"}, {"word": "On the positive side", "meaning": "Transition phrase"}, {"word": "misinformation", "meaning": "Topic-specific vocabulary"}, {"word": "critical eye", "meaning": "Advanced collocation"}]'::jsonb,
    ARRAY['Discuss both positive and negative aspects', 'State your opinion clearly', 'Use complex sentence structures']
),
(
    'What is your favorite season and why?', 
    'Short Answer', 
    56, 
    5, 
    'BAND 6', 
    'My favorite season is autumn because of the comfortable temperature and the beautiful changing colors of the leaves. I enjoy the crisp air and the opportunity to wear cozy clothes without the extreme cold of winter.',
    ARRAY['comfortable temperature', 'changing colors', 'crisp air', 'extreme cold'],
    '[{"word": "comfortable temperature", "meaning": "Weather description"}, {"word": "crisp air", "meaning": "Sensory detail"}, {"word": "extreme cold", "meaning": "Comparative state"}]'::jsonb,
    ARRAY['Explain the "why" in detail', 'Use sensory language (crisp air, cozy clothes)', 'Compare it briefly to other seasons']
),
(
    'Some people believe that technology makes life easier, while others think it creates more problems. Discuss both views and give your opinion.', 
    'Paragraph', 
    93, 
    6, 
    'BAND 7', 
    'Technology undoubtedly has both advantages and disadvantages in modern life. Those who support technology argue that it simplifies daily tasks. For instance, smartphones allow us to communicate instantly. This convenience saves time and increases productivity. On the other hand, critics point out that technology can lead to social isolation. In my view, technology is beneficial when used in moderation. The key is finding balance.',
    ARRAY['both advantages and disadvantages', 'For instance', 'On the other hand', 'social isolation', 'in moderation', 'finding balance'],
    '[{"word": "both advantages and disadvantages", "meaning": "Thesis statement"}, {"word": "For instance", "meaning": "Example marker"}, {"word": "On the other hand", "meaning": "Contrast transition"}, {"word": "social isolation", "meaning": "Advanced vocabulary"}, {"word": "finding balance", "meaning": "Nuanced conclusion"}]'::jsonb,
    ARRAY['Discuss both sides before giving opinion', 'Use formal linking words', 'Provide specific examples for each view', 'End with balanced conclusion']
),
(
    'What do you do in your free time?', 
    'Short Answer', 
    38, 
    4, 
    'BAND 5', 
    'In my free time, I really enjoy reading books and playing outdoor sports. I find that these activities help me unwind after a long day. I also like spending quality time with my family.',
    ARRAY['free time', 'outdoor sports', 'unwind', 'quality time'],
    '[{"word": "outdoor sports", "meaning": "Specific activity"}, {"word": "unwind", "meaning": "Synonym for relax"}, {"word": "quality time", "meaning": "Common collocation"}]'::jsonb,
    ARRAY['Keep it simple and direct', 'Use frequency adverbs', 'Mention 2-3 different hobbies']
),
(
    'Some experts believe that it is better for children to begin learning a foreign language at primary school rather than secondary school.', 
    'Paragraph', 
    102, 
    7, 
    'BAND 8', 
    'Early language acquisition is often seen as superior because children''s brains are more receptive to new phonetic patterns. Learning a language at the primary level allows for a more natural integration into daily life, leading to better long-term fluency. While some argue this places too much pressure on young students, the cognitive benefits far outweigh the drawbacks.',
    ARRAY['Early language acquisition', 'receptive', 'natural integration', 'long-term fluency', 'cognitive benefits', 'outweigh the drawbacks'],
    '[{"word": "acquisition", "meaning": "Academic vocabulary"}, {"word": "receptive", "meaning": "Advanced adjective"}, {"word": "long-term fluency", "meaning": "Specific goal"}, {"word": "outweigh the drawbacks", "meaning": "Complex evaluation"}]'::jsonb,
    ARRAY['Use academic vocabulary (acquisition)', 'Address counter-arguments', 'Link cognitive benefits to learning']
);
