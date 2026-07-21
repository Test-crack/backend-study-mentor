/**
 * Seed the MISSING open-ended IA prompts (Grammar + Vocabulary).
 *
 * The IAQuestion bank shipped WRITING_PROMPT/SPEAKING_PROMPT rows only for
 * Coherence, Task Response, Fluency, and Pronunciation — so IA sections on
 * GRAMMAR and VOCABULARY were MCQ-only and never reached the AI grader.
 * This adds 6 prompts for each of the four missing groups (24 total).
 *
 * ⚠️ Unlike the persona seeders, these are REAL question-bank rows (NOT scoped to
 * @seed.testcrack.dev) — they affect live students. So this script is SAFE BY
 * DEFAULT: it only PREVIEWS unless you pass --confirm. It is idempotent (skips
 * prompts whose exact text already exists) and fully reversible via --clean.
 *
 *   npx ts-node --project tsconfig.dev.json scripts/seeders/seedIAPrompts.ts            # preview inserts
 *   npx ts-node --project tsconfig.dev.json scripts/seeders/seedIAPrompts.ts --confirm  # actually insert
 *   npx ts-node --project tsconfig.dev.json scripts/seeders/seedIAPrompts.ts --deactivate --confirm  # hide from live students (is_active=false)
 *   npx ts-node --project tsconfig.dev.json scripts/seeders/seedIAPrompts.ts --activate --confirm     # make servable again
 *   npx ts-node --project tsconfig.dev.json scripts/seeders/seedIAPrompts.ts --clean            # preview deletes
 *   npx ts-node --project tsconfig.dev.json scripts/seeders/seedIAPrompts.ts --clean --confirm  # delete them
 *
 * After inserting, re-run the answer bank so the bot has model answers:
 *   npx ts-node --project tsconfig.dev.json scripts/bot/genIAAnswers.ts
 */
import 'dotenv/config';
import prisma from '../../src/lib/prisma';
import { IeltsSkillType, IeltsSubSkillType, DifficultyType } from '@prisma/client';

type PromptSeed = {
  skill: IeltsSkillType;
  sub_skill: IeltsSubSkillType;
  question_type: 'WRITING_PROMPT' | 'SPEAKING_PROMPT';
  difficulty: DifficultyType;
  prompt_text: string;
};

const B = DifficultyType.BEGINNER;
const I = DifficultyType.INTERMEDIATE;
const A = DifficultyType.ADVANCED;

// ── WRITING × GRAMMAR ─────────────────────────────────────────────────────────
const WRITING_GRAMMAR: PromptSeed[] = [
  { difficulty: B, prompt_text: "Write at least 150 words about your daily routine and how it changed during your last holiday. Use a mix of present simple and past tenses, and at least two time linkers (e.g., 'before', 'after', 'while')." },
  { difficulty: B, prompt_text: "Write 150+ words describing your hometown: what it was like in the past, what it is like now, and how you think it will change. Use past, present, and future forms accurately." },
  { difficulty: I, prompt_text: "Write a 250+ word response: 'Some students prefer to study alone, while others learn better in groups.' Discuss both views. Use a range of complex sentences with subordinate clauses (because, although, whereas) and at least one conditional." },
  { difficulty: I, prompt_text: "Write 250+ words: 'If you could change one rule at your school or workplace, what would it be and why?' Use first, second, and third conditional structures and relative clauses to develop your reasons." },
  { difficulty: A, prompt_text: "Write a 250+ word argument: 'Governments should prioritise public transport over private car ownership. To what extent do you agree?' Demonstrate grammatical range through passive constructions, nominalisation, and a variety of complex sentences while maintaining accuracy." },
  { difficulty: A, prompt_text: "Write a 250+ word response: 'Had the internet never been invented, the world would be a very different place.' Discuss. Use mixed conditionals, inversion, and a variety of subordinate clauses to convey nuanced hypothetical reasoning." },
].map(p => ({ ...p, skill: IeltsSkillType.WRITING, sub_skill: IeltsSubSkillType.GRAMMAR, question_type: 'WRITING_PROMPT' as const }));

// ── WRITING × VOCABULARY ──────────────────────────────────────────────────────
const WRITING_VOCAB: PromptSeed[] = [
  { difficulty: B, prompt_text: "Write at least 150 words describing your favourite meal. Use specific vocabulary for tastes, textures, and ingredients instead of general words like 'nice' or 'good'." },
  { difficulty: B, prompt_text: "Write 150+ words about a job you would like to do in the future. Use vocabulary related to work and skills, and try to use synonyms instead of repeating the same words." },
  { difficulty: I, prompt_text: "Write a 250+ word essay: 'Many people today buy products they do not really need.' Discuss the causes and effects. Use a range of consumer and economic vocabulary and topic-specific collocations (e.g., 'disposable income', 'impulse purchase')." },
  { difficulty: I, prompt_text: "Write 250+ words: 'Tourism can both benefit and damage local communities.' Discuss. Use precise, varied vocabulary and avoid repetition by paraphrasing key terms (tourist, place, money) throughout." },
  { difficulty: A, prompt_text: "Write a 250+ word response: 'The pursuit of economic growth often comes at an environmental cost.' To what extent do you agree? Demonstrate a wide lexical range with less common, idiomatic, and precise terminology used naturally." },
  { difficulty: A, prompt_text: "Write a 250+ word essay: 'Cultural traditions are being eroded by globalisation.' Discuss. Show sophisticated lexical resource through accurate collocations, figurative language, and precise word choice with minimal repetition." },
].map(p => ({ ...p, skill: IeltsSkillType.WRITING, sub_skill: IeltsSubSkillType.VOCABULARY, question_type: 'WRITING_PROMPT' as const }));

// ── SPEAKING × GRAMMAR ────────────────────────────────────────────────────────
const SPEAKING_GRAMMAR: PromptSeed[] = [
  { difficulty: B, prompt_text: "Talk for 1–2 minutes about something you did last weekend. Describe what happened in order, using past simple and past continuous correctly." },
  { difficulty: B, prompt_text: "Describe your plans for next year. Talk for 1–2 minutes using future forms ('going to', 'will', and present continuous for arrangements)." },
  { difficulty: I, prompt_text: "Describe a memorable trip you took. Speak for about 2 minutes, using a mix of past tenses (past simple, past continuous, past perfect) to sequence the events clearly." },
  { difficulty: I, prompt_text: "Talk about how your life would be different if you had grown up in another country. Speak for 1–2 minutes, using second and third conditional structures." },
  { difficulty: A, prompt_text: "Compare how technology was used when you were a child with how it is used today, and predict how it might change. Speak for 2 minutes, using comparatives, the present perfect, and modal verbs of probability." },
  { difficulty: A, prompt_text: "Discuss a decision you regret and what you would have done differently. Speak for 2 minutes, using mixed conditionals, modal perfects ('should have', 'could have'), and a range of complex structures." },
].map(p => ({ ...p, skill: IeltsSkillType.SPEAKING, sub_skill: IeltsSubSkillType.GRAMMAR, question_type: 'SPEAKING_PROMPT' as const }));

// ── SPEAKING × VOCABULARY ─────────────────────────────────────────────────────
const SPEAKING_VOCAB: PromptSeed[] = [
  { difficulty: B, prompt_text: "Describe your favourite hobby. Speak for 1–2 minutes and try to use specific words related to that activity rather than general words like 'fun' or 'nice'." },
  { difficulty: B, prompt_text: "Talk about the kinds of weather you like and dislike. Speak for 1–2 minutes using a variety of weather and feeling vocabulary." },
  { difficulty: I, prompt_text: "Describe a person you admire. Speak for about 2 minutes using a range of personality adjectives and collocations (e.g., 'down to earth', 'hard-working')." },
  { difficulty: I, prompt_text: "Talk about the role of social media in your daily life. Speak for 2 minutes using topic-specific vocabulary and collocations related to technology and communication." },
  { difficulty: A, prompt_text: "Discuss whether money can buy happiness. Speak for 2 minutes, demonstrating a wide vocabulary range with idiomatic expressions and precise, less common words used naturally." },
  { difficulty: A, prompt_text: "Describe a global issue you feel strongly about and explain its impact. Speak for 2 minutes, using sophisticated topic-specific vocabulary, collocations, and paraphrase to avoid repetition." },
].map(p => ({ ...p, skill: IeltsSkillType.SPEAKING, sub_skill: IeltsSubSkillType.VOCABULARY, question_type: 'SPEAKING_PROMPT' as const }));

const ALL: PromptSeed[] = [...WRITING_GRAMMAR, ...WRITING_VOCAB, ...SPEAKING_GRAMMAR, ...SPEAKING_VOCAB];

async function main() {
  const args = process.argv.slice(2);
  const confirm = args.includes('--confirm');
  const clean = args.includes('--clean');
  const deactivate = args.includes('--deactivate');
  const activate = args.includes('--activate');
  const texts = ALL.map(p => p.prompt_text);

  const mode = clean ? 'CLEAN' : deactivate ? 'DEACTIVATE' : activate ? 'ACTIVATE' : 'INSERT';
  console.log('═══════════════════════════════════════════════════');
  console.log(`  IA prompt seeder — ${mode} mode`);
  console.log(`  DB: ${process.env.DATABASE_URL?.replace(/:\/\/.*@/, '://***@') ?? '(unset)'}`);
  console.log('═══════════════════════════════════════════════════\n');

  // What already exists in the bank (match by exact prompt_text — our identity key)
  const existing = await prisma.iAQuestion.findMany({
    where: { prompt_text: { in: texts } },
    select: { id: true, prompt_text: true, is_active: true },
  });
  const existingTexts = new Set(existing.map(e => e.prompt_text));

  if (deactivate || activate) {
    const targetActive = activate;            // --activate → true, --deactivate → false
    const need = existing.filter(e => e.is_active !== targetActive);
    if (existing.length === 0) { console.log('None of these prompts are in the bank — nothing to do.'); return; }
    console.log(`Found ${existing.length} managed prompt(s); ${need.length} would change to is_active=${targetActive}.`);
    if (need.length === 0) { console.log('Already in the desired state.'); return; }
    if (!confirm) { console.log(`\n(preview only — re-run with --${activate ? 'activate' : 'deactivate'} --confirm)`); return; }
    const upd = await prisma.iAQuestion.updateMany({
      where: { prompt_text: { in: texts } },
      data: { is_active: targetActive },
    });
    console.log(`\n✅ Set is_active=${targetActive} on ${upd.count} prompt(s).`);
    return;
  }

  if (clean) {
    if (existing.length === 0) { console.log('Nothing to clean — none of these prompts are in the bank.'); return; }
    console.log(`Would DELETE ${existing.length} prompt row(s) that this script manages:`);
    for (const p of ALL.filter(p => existingTexts.has(p.prompt_text)))
      console.log(`  - ${p.question_type} ${p.sub_skill}: "${p.prompt_text.slice(0, 70)}…"`);
    if (!confirm) { console.log('\n(preview only — re-run with --clean --confirm to delete)'); return; }
    const del = await prisma.iAQuestion.deleteMany({ where: { prompt_text: { in: texts } } });
    console.log(`\n✅ Deleted ${del.count} prompt row(s).`);
    return;
  }

  // INSERT mode
  const toInsert = ALL.filter(p => !existingTexts.has(p.prompt_text));
  console.log(`Plan: ${ALL.length} managed prompts — ${existing.length} already present, ${toInsert.length} to insert.\n`);
  const byGroup = (g: PromptSeed[], label: string) => {
    const have = g.filter(p => existingTexts.has(p.prompt_text)).length;
    console.log(`  ${label.padEnd(26)} +${g.length - have} new (${have} already there)`);
  };
  byGroup(WRITING_GRAMMAR, 'WRITING_PROMPT/GRAMMAR');
  byGroup(WRITING_VOCAB, 'WRITING_PROMPT/VOCABULARY');
  byGroup(SPEAKING_GRAMMAR, 'SPEAKING_PROMPT/GRAMMAR');
  byGroup(SPEAKING_VOCAB, 'SPEAKING_PROMPT/VOCABULARY');

  if (toInsert.length === 0) { console.log('\nAll prompts already present — nothing to do.'); return; }

  if (!confirm) {
    console.log('\n(preview only — re-run with --confirm to write these to the question bank)');
    return;
  }

  const result = await prisma.iAQuestion.createMany({
    data: toInsert.map(p => ({
      skill: p.skill,
      sub_skill: p.sub_skill,
      question_type: p.question_type,
      prompt_text: p.prompt_text,
      difficulty: p.difficulty,
      is_active: true,
    })),
  });
  console.log(`\n✅ Inserted ${result.count} prompt(s).`);
  console.log('Next: rebuild model answers →  npx ts-node --project tsconfig.dev.json scripts/bot/genIAAnswers.ts');
}

main()
  .catch(e => { console.error('[seedIAPrompts] ERROR:', e.message); process.exit(1); })
  .finally(() => prisma.$disconnect());
