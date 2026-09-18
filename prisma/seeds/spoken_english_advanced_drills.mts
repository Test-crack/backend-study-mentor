// Spoken English — ADVANCED daily-drill questions (the one coverage gap).
// SE seeds BEGINNER + INTERMEDIATE for 6 speaking sub-skills; C1/C2 learners resolve to
// ADVANCED (cefrToDrillLevel: c* -> ADVANCED) which had no SE rows (fell back to IELTS).
// This seeds 10 SE-specific ADVANCED MCQs × 6 sub-skills = 60 rows, exam_id='spoken_english'.
// General conversational/professional English context (NOT healthcare), matching the SE bank.
//   dry-run:      npx tsx prisma/seeds/spoken_english_advanced_drills.mts
//   real insert:  DO_INSERT=1 npx tsx prisma/seeds/spoken_english_advanced_drills.mts
import 'dotenv/config';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { PrismaClient } from '@prisma/client';

const EXAM = 'spoken_english';
const LEVEL = 'ADVANCED';
const PER_SUB = 10;
const p = new PrismaClient();
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');
const model = genAI.getGenerativeModel({ model: process.env.GEMINI_MODEL || 'gemini-2.5-flash' });

// The 6 speaking sub-skills SE drills use (SubSkillType enum values).
const SUBS: { sub: string; guide: string }[] = [
  { sub: 'GRAMMAR', guide: 'Advanced spoken grammar: complex/mixed conditionals, inversion for emphasis, cleft sentences, subjunctive, nuanced modality. Ask which option is the most accurate/natural in fluent speech.' },
  { sub: 'VOCABULARY', guide: 'Advanced range: idioms, phrasal verbs, precise collocations, register shifts, connotation. Ask for the most natural/precise word or expression a proficient speaker would use.' },
  { sub: 'COHERENCE', guide: 'Discourse organisation in extended speech: advanced connectors/discourse markers (mind you, having said that, that said), signposting, and cohesive linking across turns.' },
  { sub: 'FLUENCY', guide: 'Natural, fluent phrasing: idiomatic flow, appropriate fillers/hedges, paraphrase strategies, and avoiding stilted or over-literal phrasing in spontaneous speech.' },
  { sub: 'PRONUNCIATION', guide: 'Phonology as a TEXT MCQ: word/sentence stress, intonation for meaning, connected speech (linking, weak forms, elision), and contrastive stress. No audio.' },
  { sub: 'INTERACTION', guide: 'Sophisticated conversational management: diplomatic disagreement, hedging, turn-taking, interrupting politely, softening, and responding appropriately in nuanced social/professional exchanges.' },
];

function prompt(sub: string, guide: string): string {
  return `You are writing practice questions for a Spoken English course (CEFR-aligned), for ADVANCED (C1–C2) learners.
Generate exactly ${PER_SUB} multiple-choice questions for the speaking sub-skill: ${sub}. ${guide}
Context: everyday, social, and professional spoken English (conversations, meetings, small talk) — NOT healthcare or any single profession.
Difficulty: C1–C2 — nuanced distinctions, idiomatic/natural usage, subtle distractors that a B2 learner might pick.
Each question: a clear stem, exactly 4 options keyed "A","B","C","D", exactly ONE correct answer, and a one-sentence explanation.
Vary the stems; keep distractors plausible.
Return ONLY a JSON array of ${PER_SUB} objects: {"question": string, "options": {"A": string,"B": string,"C": string,"D": string}, "answer": "A"|"B"|"C"|"D", "explanation": string}. No prose, no markdown.`;
}

interface Row { sub: string; question: string; options: any; answer: string; explanation: string; source_key: string; }

function validate(raw: any, sub: string): Row[] {
  if (!Array.isArray(raw)) return [];
  const out: Row[] = []; const seen = new Set<string>();
  raw.forEach((q: any, i: number) => {
    const o = q?.options; const ans = String(q?.answer ?? '').trim().toUpperCase();
    if (!q?.question || typeof q.question !== 'string') return;
    if (!o || !['A', 'B', 'C', 'D'].every((k) => typeof o[k] === 'string' && o[k].trim())) return;
    if (!['A', 'B', 'C', 'D'].includes(ans)) return;
    const key = q.question.trim().toLowerCase(); if (seen.has(key)) return; seen.add(key);
    out.push({
      sub, question: q.question.trim(),
      options: { A: o.A.trim(), B: o.B.trim(), C: o.C.trim(), D: o.D.trim() },
      answer: ans, explanation: String(q?.explanation ?? '').trim(),
      source_key: `drill_se_${sub}_advanced_${i + 1}`.toLowerCase(),
    });
  });
  return out;
}

async function gen(sub: string, guide: string): Promise<Row[]> {
  const res = await model.generateContent({
    contents: [{ role: 'user', parts: [{ text: prompt(sub, guide) }] }],
    generationConfig: { responseMimeType: 'application/json', temperature: 0.9 },
  });
  let t = res.response.text().trim();
  const s = t.indexOf('['), e = t.lastIndexOf(']'); if (s >= 0 && e > s) t = t.slice(s, e + 1);
  let parsed: any; try { parsed = JSON.parse(t); } catch { return []; }
  return validate(parsed, sub);
}

(async () => {
  try {
    const DO_INSERT = process.env.DO_INSERT === '1';
    const results: Row[][] = [];
    for (const { sub, guide } of SUBS) {
      let rows: Row[] = [];
      for (let a = 0; a < 2 && rows.length < PER_SUB; a++) { try { const r = await gen(sub, guide); if (r.length > rows.length) rows = r; } catch { /* retry */ } }
      console.log(`  SPEAKING/${sub}/ADVANCED: ${rows.length} ${rows.length >= PER_SUB ? '✅' : rows.length >= 5 ? '⚠️<10' : '❌<5'}`);
      results.push(rows.slice(0, PER_SUB));
    }
    const all = results.flat();
    console.log(`\nGenerated ${all.length} SE ADVANCED MCQs (target ${SUBS.length * PER_SUB}).`);
    console.log('\n--- SAMPLES ---');
    for (const s of [all[0], all[Math.floor(all.length / 2)], all[all.length - 1]].filter(Boolean)) {
      console.log(`[${s.sub}] ${s.question}\n   ${JSON.stringify(s.options)} ans=${s.answer} — ${s.explanation}`);
    }
    if (!DO_INSERT) { console.log('\n(dry-run — set DO_INSERT=1 to write)'); return; }
    let ins = 0;
    for (const r of all) {
      ins += await p.$executeRawUnsafe(
        `INSERT INTO drill_questions (skill, sub_skill, level, drill_type, prompt_text, options, correct_answer, explanation, exam_id, is_active, source_key)
         VALUES ('SPEAKING'::"SkillType",$1::"SubSkillType",'ADVANCED'::"RecommendationLevel",'MCQ',$2,$3::jsonb,$4::jsonb,$5,$6,true,$7)
         ON CONFLICT (source_key) DO NOTHING`,
        r.sub, r.question, JSON.stringify(r.options), JSON.stringify(r.answer), r.explanation, EXAM, r.source_key,
      );
    }
    console.log(`\n✅ Inserted ${ins} SE ADVANCED drill rows.`);
  } catch (e: any) { console.log('ERR', e.message); }
  finally { await p.$disconnect(); }
})();
