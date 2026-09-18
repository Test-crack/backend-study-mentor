// OET-Nursing daily-drill question generator — 10 healthcare-themed MCQs per
// (skill, sub_skill, level) combo × 30 combos = ~300 rows, exam_id='oet_nursing'.
// The drill query is exam-scoped (drillController startDrillSession), so OET needs its own bank.
// Combos mirror what getNextActionDrill recommends for OET (the IELTS 4-skill path).
// Gemini-generated + validated; idempotent via source_key.
//   dry-run (generate + validate + sample, NO insert):  npx tsx prisma/seeds/oet_nursing_drills.mts
//   real insert:                                         DO_INSERT=1 npx tsx prisma/seeds/oet_nursing_drills.mts
import 'dotenv/config';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { PrismaClient } from '@prisma/client';

const EXAM = 'oet_nursing';
const PER_COMBO = 10;
const p = new PrismaClient();
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');
const model = genAI.getGenerativeModel({ model: process.env.GEMINI_MODEL || 'gemini-2.5-flash' });

// The 10 skill/sub_skill pairs the OET recommender produces (drillController.getNextActionDrill).
const PAIRS: { skill: string; sub: string }[] = [
  { skill: 'LISTENING', sub: 'LISTENING' },
  { skill: 'READING', sub: 'READING' },
  { skill: 'WRITING', sub: 'GRAMMAR' },
  { skill: 'WRITING', sub: 'COHERENCE' },
  { skill: 'WRITING', sub: 'VOCABULARY' },
  { skill: 'WRITING', sub: 'TASK_RESPONSE' },
  { skill: 'SPEAKING', sub: 'FLUENCY' },
  { skill: 'SPEAKING', sub: 'GRAMMAR' },
  { skill: 'SPEAKING', sub: 'VOCABULARY' },
  { skill: 'SPEAKING', sub: 'PRONUNCIATION' },
];
const LEVELS = ['BEGINNER', 'INTERMEDIATE', 'ADVANCED'];

const SUB_GUIDE: Record<string, string> = {
  LISTENING: 'Describe a short spoken healthcare exchange or instruction IN TEXT (e.g. a nurse–patient handover, a ward announcement, a phone message), then ask a comprehension question about a specific detail (a time, dose, symptom, instruction). It is a listening-comprehension item rendered as text.',
  READING: 'Give a short healthcare text — a medication label, ward notice, discharge instruction, or appointment letter — then ask a comprehension question about what it means or instructs.',
  GRAMMAR: 'Test ONE grammar point (verb tense, subject–verb agreement, prepositions, articles, modals, conditionals) inside a clinical/nursing sentence. Ask which option is grammatically correct / most appropriate.',
  COHERENCE: 'Test logical flow and linking in clinical writing (referral letters, care notes): choosing the right linking word/connector, the best topic sentence, or the sentence that keeps a paragraph cohesive.',
  VOCABULARY: 'Test healthcare/nursing vocabulary — meaning, collocation, or the precise professional term (e.g. "administer", "adverse reaction", "ambulate", "PRN"), or the most appropriate word in a clinical sentence.',
  TASK_RESPONSE: 'Test choosing the most relevant/appropriate sentence for a nursing communication task (a referral letter, patient explanation, or handover) — relevance, completeness, and suitability for the reader.',
  FLUENCY: 'Test the most natural, fluent phrasing for patient-facing or colleague-facing speech in a clinical setting (idiomatic, appropriately hedged, not stilted).',
  PRONUNCIATION: 'Test sound and stress patterns of healthcare vocabulary as a TEXT MCQ — e.g. which word has a given sound, which syllable is stressed in a medical term, or which words rhyme/share a vowel sound.',
};
const LEVEL_GUIDE: Record<string, string> = {
  BEGINNER: 'CEFR A2–B1. Simple, common vocabulary and short sentences.',
  INTERMEDIATE: 'CEFR B1–B2. Everyday clinical situations, moderate complexity.',
  ADVANCED: 'CEFR B2–C1. Nuanced distinctions, professional register, subtle distractors.',
};

function prompt(skill: string, sub: string, level: string): string {
  return `You are writing practice questions for OET (Occupational English Test) preparation for NURSES — healthcare English.
Generate exactly ${PER_COMBO} multiple-choice questions.
Focus skill: ${skill}. Sub-skill: ${sub}. ${SUB_GUIDE[sub]}
Difficulty: ${level}. ${LEVEL_GUIDE[level]}
Every question MUST be set in a nursing/healthcare/clinical context.
Each question: a clear stem, exactly 4 options keyed "A","B","C","D", exactly ONE correct answer, and a one-sentence explanation.
Vary the questions; do not repeat stems. Keep options plausible (real distractors).
Return ONLY a JSON array of ${PER_COMBO} objects, each: {"question": string, "options": {"A": string, "B": string, "C": string, "D": string}, "answer": "A"|"B"|"C"|"D", "explanation": string}. No prose, no markdown.`;
}

interface Row { skill: string; sub: string; level: string; question: string; options: any; answer: string; explanation: string; source_key: string; }

function validate(raw: any, skill: string, sub: string, level: string): Row[] {
  if (!Array.isArray(raw)) return [];
  const out: Row[] = [];
  const seen = new Set<string>();
  raw.forEach((q: any, i: number) => {
    const opts = q?.options;
    const ans = String(q?.answer ?? '').trim().toUpperCase();
    if (!q?.question || typeof q.question !== 'string') return;
    if (!opts || !['A', 'B', 'C', 'D'].every((k) => typeof opts[k] === 'string' && opts[k].trim())) return;
    if (!['A', 'B', 'C', 'D'].includes(ans)) return;
    const key = q.question.trim().toLowerCase();
    if (seen.has(key)) return; // drop dupes within the batch
    seen.add(key);
    out.push({
      skill, sub, level,
      question: q.question.trim(),
      options: { A: opts.A.trim(), B: opts.B.trim(), C: opts.C.trim(), D: opts.D.trim() },
      answer: ans,
      explanation: String(q?.explanation ?? '').trim(),
      source_key: `drill_oet_${skill}_${sub}_${level}_${i + 1}`.toLowerCase(),
    });
  });
  return out;
}

async function genCombo(skill: string, sub: string, level: string): Promise<Row[]> {
  const res = await model.generateContent({
    contents: [{ role: 'user', parts: [{ text: prompt(skill, sub, level) }] }],
    generationConfig: { responseMimeType: 'application/json', temperature: 0.9 },
  });
  let text = res.response.text().trim();
  const s = text.indexOf('['), e = text.lastIndexOf(']');
  if (s >= 0 && e > s) text = text.slice(s, e + 1);
  let parsed: any; try { parsed = JSON.parse(text); } catch { return []; }
  return validate(parsed, skill, sub, level);
}

// small concurrency limiter
async function mapLimit<T, R>(items: T[], limit: number, fn: (t: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length) as any;
  let idx = 0;
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (idx < items.length) { const i = idx++; out[i] = await fn(items[i]); }
  }));
  return out;
}

(async () => {
  try {
    const DO_INSERT = process.env.DO_INSERT === '1';
    const combos = PAIRS.flatMap((pr) => LEVELS.map((lvl) => ({ ...pr, level: lvl })));
    console.log(`Generating ${PER_COMBO} MCQs × ${combos.length} combos (concurrency 4)…`);

    const results = await mapLimit(combos, 4, async (c) => {
      let rows: Row[] = [];
      for (let attempt = 0; attempt < 2 && rows.length < PER_COMBO; attempt++) {
        try { const r = await genCombo(c.skill, c.sub, c.level); if (r.length > rows.length) rows = r; }
        catch (e: any) { /* retry */ }
      }
      const status = rows.length >= 5 ? (rows.length >= PER_COMBO ? '✅' : '⚠️ <10') : '❌ <5';
      console.log(`  ${c.skill}/${c.sub}/${c.level}: ${rows.length} ${status}`);
      return rows.slice(0, PER_COMBO);
    });

    const all = results.flat();
    console.log(`\nGenerated ${all.length} valid MCQs across ${combos.length} combos (target ${combos.length * PER_COMBO}).`);
    const short = combos.filter((c, i) => results[i].length < 5);
    if (short.length) console.log('⚠️ combos under 5:', short.map((c) => `${c.skill}/${c.sub}/${c.level}`).join(', '));

    console.log('\n--- SAMPLES ---');
    for (const s of [all[0], all[Math.floor(all.length / 2)], all[all.length - 1]].filter(Boolean)) {
      console.log(`[${s.skill}/${s.sub}/${s.level}] ${s.question}`);
      console.log(`   ${JSON.stringify(s.options)}  ans=${s.answer} — ${s.explanation}`);
    }

    if (!DO_INSERT) { console.log('\n(dry-run — set DO_INSERT=1 to write to DB)'); return; }

    let inserted = 0;
    for (const r of all) {
      inserted += await p.$executeRawUnsafe(
        `INSERT INTO drill_questions (skill, sub_skill, level, drill_type, prompt_text, options, correct_answer, explanation, exam_id, is_active, source_key)
         VALUES ($1::"SkillType",$2::"SubSkillType",$3::"RecommendationLevel",'MCQ',$4,$5::jsonb,$6::jsonb,$7,$8,true,$9)
         ON CONFLICT (source_key) DO NOTHING`,
        r.skill, r.sub, r.level, r.question, JSON.stringify(r.options), JSON.stringify(r.answer), r.explanation, EXAM, r.source_key,
      );
    }
    console.log(`\n✅ Inserted ${inserted} OET drill rows (idempotent; existing source_keys skipped).`);
  } catch (e: any) { console.log('ERR', e.message); }
  finally { await p.$disconnect(); }
})();
