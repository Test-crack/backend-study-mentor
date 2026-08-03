/**
 * Idempotent question bank seed runner.
 *
 * Run:  npx tsx prisma/seed.ts
 * or:   npm run seed
 *
 * Safe to run multiple times — uses upsert on source_key so existing rows are
 * updated in-place and no duplicates are created.
 */

import { PrismaClient } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';

const prisma = new PrismaClient();

function loadSeedFile<T>(filename: string): T[] {
    const filePath = path.join(__dirname, 'seeds', filename);
    if (!fs.existsSync(filePath)) {
        console.warn(`  ⚠️  Seed file not found: ${filename} — skipping`);
        return [];
    }
    return JSON.parse(fs.readFileSync(filePath, 'utf-8')) as T[];
}

// ─── Drill questions ──────────────────────────────────────────────────────────

async function seedDrillQuestions() {
    const data = loadSeedFile<{
        source_key:    string;
        skill:         string;
        sub_skill:     string;
        level:         string;
        drill_type:    string;
        prompt_text:   string;
        options?:      object;
        correct_answer: object;
        explanation?:  string;
        is_active?:    boolean;
    }>('drill_questions.json');

    if (data.length === 0) return;

    let created = 0, updated = 0;
    for (const q of data) {
        const result = await prisma.drillQuestion.upsert({
            where:  { source_key: q.source_key },
            create: { ...q, is_active: q.is_active ?? true } as any,
            update: {
                prompt_text:    q.prompt_text,
                options:        q.options,
                correct_answer: q.correct_answer,
                explanation:    q.explanation,
                is_active:      q.is_active ?? true,
            },
            select: { id: true },
        });
        // Prisma upsert doesn't tell you create vs update — track via a pre-check if needed.
        // For logging purposes we just count total processed.
        created++;
    }
    console.log(`  ✅ drill_questions: ${created} processed (${data.length} in file)`);
}

// ─── IA questions ─────────────────────────────────────────────────────────────

async function seedIAQuestions() {
    const data = loadSeedFile<{
        source_key:     string;
        skill:          string;
        sub_skill:      string;
        question_type:  string;
        passage_id?:    string;
        passage_text?:  string;
        audio_url?:     string;
        prompt_text:    string;
        options?:       object;
        correct_answer?: object;
        explanation?:   string;
        difficulty:     string;
        is_active?:     boolean;
    }>('ia_questions.json');

    if (data.length === 0) return;

    for (const q of data) {
        await prisma.iAQuestion.upsert({
            where:  { source_key: q.source_key },
            create: { ...q, is_active: q.is_active ?? true } as any,
            update: {
                prompt_text:    q.prompt_text,
                options:        q.options,
                correct_answer: q.correct_answer,
                explanation:    q.explanation,
                passage_text:   q.passage_text,
                audio_url:      q.audio_url,
                is_active:      q.is_active ?? true,
            },
        });
    }
    console.log(`  ✅ ia_questions:    ${data.length} processed`);
}

// ─── Mock questions ───────────────────────────────────────────────────────────

async function seedMockQuestions() {
    const data = loadSeedFile<{
        source_key:     string;
        skill:          string;
        sub_skill?:     string;
        question_type:  string;
        task_type?:     string;
        passage_id?:    string;
        passage_text?:  string;
        audio_url?:     string;
        prompt_text:    string;
        options?:       object;
        correct_answer?: object;
        explanation?:   string;
        is_active?:     boolean;
    }>('mock_questions.json');

    if (data.length === 0) return;

    for (const q of data) {
        await prisma.mockquestions.upsert({
            where:  { source_key: q.source_key },
            create: { ...q, is_active: q.is_active ?? true } as any,
            update: {
                prompt_text:    q.prompt_text,
                options:        q.options,
                correct_answer: q.correct_answer,
                explanation:    q.explanation,
                passage_text:   q.passage_text,
                audio_url:      q.audio_url,
                is_active:      q.is_active ?? true,
            },
        });
    }
    console.log(`  ✅ mockquestions:   ${data.length} processed`);
}

// ─── LexiGrid words ───────────────────────────────────────────────────────────
// lexigrid_words already has UNIQUE(base_word, target_word) — use createMany + skipDuplicates.
// For content updates (e.g. fixing a hint) use the upsert path below instead.

async function seedLexiGridWords() {
    const data = loadSeedFile<{
        base_word:   string;
        target_word: string;
        hint:        string;
        difficulty:  string;
        target_band?: number;
        is_active?:  boolean;
    }>('lexigrid_words.json');

    if (data.length === 0) return;

    const result = await prisma.lexiGridWord.createMany({
        data:           data.map(w => ({ ...w, is_active: w.is_active ?? true })),
        skipDuplicates: true,   // ON CONFLICT (base_word, target_word) DO NOTHING
    });
    console.log(`  ✅ lexigrid_words:  ${result.count} inserted (${data.length - result.count} already existed)`);
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
    console.log('\n🌱 Seeding question bank…\n');
    await seedDrillQuestions();
    await seedIAQuestions();
    await seedMockQuestions();
    await seedLexiGridWords();
    console.log('\n✅ Seed complete.\n');
}

main()
    .catch(e => { console.error('Seed failed:', e); process.exit(1); })
    .finally(() => prisma.$disconnect());
