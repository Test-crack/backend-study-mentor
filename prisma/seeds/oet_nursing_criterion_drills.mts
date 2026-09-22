// OET-Nursing daily-drill questions keyed on the exam's REAL config criteria (config-driven).
// Replaces the earlier generic Writing/Speaking drills (GRAMMAR/VOCABULARY/…) with drills that
// train OET's actual assessment criteria — read straight from the exam config's component.subskills,
// so this needs NO code change for a future exam, only its config + this generator.
//
// Writing 6 + Speaking 9 criteria × 3 levels × 10 MCQs. Listening/Reading keep their component-level
// LISTENING/READING drills (accuracy-scored, no criteria) — untouched. sub_skill is stored UPPERCASED
// (matches startDrillSession's inbound-uppercasing convention); criteria remain lowercase in config.
//
// PREREQUISITE: run prisma/seeds/drill_subskill_to_text.sql first (sub_skill must be text).
//   dry-run:      npx tsx prisma/seeds/oet_nursing_criterion_drills.mts
//   real insert:  DO_INSERT=1 npx tsx prisma/seeds/oet_nursing_criterion_drills.mts
import 'dotenv/config';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { PrismaClient } from '@prisma/client';
import { loadExamEngine, getExamConfig } from '../../src/exam-engine/loader';

const EXAM = 'oet_nursing';
const PER = 10;
const LEVELS = ['BEGINNER', 'INTERMEDIATE', 'ADVANCED'];
const p = new PrismaClient();
const model = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '')
  .getGenerativeModel({ model: process.env.GEMINI_MODEL || 'gemini-2.5-flash' });

const GROUP_GUIDE: Record<string, string> = {
  writing: `an OET referral/discharge-letter WRITING criterion. Test choosing the option that best satisfies THIS criterion in a nursing letter (case-notes → letter).`,
  linguistic: `an OET SPEAKING linguistic criterion. Test the most effective spoken option for THIS criterion in a nurse–patient consultation (text MCQ).`,
  clinical: `an OET SPEAKING clinical-communication criterion. Give a short nurse–patient/carer scenario and test which spoken response best demonstrates THIS criterion (rapport, perspective, structure, gathering, giving).`,
};
const LEVEL_GUIDE: Record<string, string> = {
  BEGINNER: 'CEFR B1 — clear, common phrasing.',
  INTERMEDIATE: 'CEFR B1–B2 — everyday clinical nuance.',
  ADVANCED: 'CEFR B2–C1 — subtle distinctions, professional register.',
};

function prompt(skill: string, label: string, group: string, level: string): string {
  return `You are writing OET (healthcare English for NURSES) practice questions.
Generate exactly ${PER} multiple-choice questions that specifically train the criterion "${label}" — ${GROUP_GUIDE[group] ?? 'an OET assessment criterion.'}
Focus skill: ${skill}. Difficulty: ${level}. ${LEVEL_GUIDE[level] ?? ''}
Every question must be set in a nursing/clinical context and must actually discriminate on "${label}" (not generic grammar unless the criterion IS language).
Each: a clear stem, exactly 4 options keyed "A".."D", exactly ONE correct answer, a one-sentence explanation.
Return ONLY a JSON array of ${PER} objects: {"question","options":{"A","B","C","D"},"answer":"A"|"B"|"C"|"D","explanation"}. No prose/markdown.`;
}

interface Row { skill: string; sub: string; level: string; question: string; options: any; answer: string; explanation: string; source_key: string; }
function validate(raw: any, skill: string, subId: string, level: string): Row[] {
  if (!Array.isArray(raw)) return [];
  const out: Row[] = []; const seen = new Set<string>();
  raw.forEach((q: any, i: number) => {
    const o = q?.options; const ans = String(q?.answer ?? '').trim().toUpperCase();
    if (!q?.question || typeof q.question !== 'string') return;
    if (!o || !['A', 'B', 'C', 'D'].every((k) => typeof o[k] === 'string' && o[k].trim())) return;
    if (!['A', 'B', 'C', 'D'].includes(ans)) return;
    const key = q.question.trim().toLowerCase(); if (seen.has(key)) return; seen.add(key);
    out.push({ skill, sub: subId, level, question: q.question.trim(),
      options: { A: o.A.trim(), B: o.B.trim(), C: o.C.trim(), D: o.D.trim() },
      answer: ans, explanation: String(q?.explanation ?? '').trim(),
      source_key: `drill_oet_${subId}_${level}_${i + 1}`.toLowerCase() });
  });
  return out;
}
async function gen(skill: string, subId: string, label: string, group: string, level: string): Promise<Row[]> {
  const res = await model.generateContent({
    contents: [{ role: 'user', parts: [{ text: prompt(skill, label, group, level) }] }],
    generationConfig: { responseMimeType: 'application/json', temperature: 0.9 },
  });
  let t = res.response.text().trim(); const s = t.indexOf('['), e = t.lastIndexOf(']');
  if (s >= 0 && e > s) t = t.slice(s, e + 1);
  let parsed: any; try { parsed = JSON.parse(t); } catch { return []; }
  return validate(parsed, skill, subId, level);
}
async function mapLimit<T, R>(items: T[], limit: number, fn: (t: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length) as any; let idx = 0;
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (idx < items.length) { const i = idx++; out[i] = await fn(items[i]); }
  }));
  return out;
}

(async () => {
  try {
    await loadExamEngine();
    const cfg: any = getExamConfig(EXAM);
    const DO_INSERT = process.env.DO_INSERT === '1';
    // Build the (skill, criterion, level) work-list from CONFIG — Writing + Speaking only
    // (L/R are accuracy-scored, keep their existing LISTENING/READING drills).
    const jobs: { skill: string; subId: string; label: string; group: string; level: string }[] = [];
    for (const comp of (cfg?.components ?? [])) {
      const skill = String(comp.id).toUpperCase();
      if (skill !== 'WRITING' && skill !== 'SPEAKING') continue;
      for (const s of (comp.subskills ?? [])) {
        for (const level of LEVELS) jobs.push({ skill, subId: String(s.id).toUpperCase(), label: s.label ?? s.id, group: s.group ?? skill.toLowerCase(), level });
      }
    }
    console.log(`OET criterion drills: ${jobs.length} (skill,criterion,level) jobs × ${PER} = ${jobs.length * PER} target`);

    const results = await mapLimit(jobs, 4, async (j) => {
      let rows: Row[] = [];
      for (let a = 0; a < 2 && rows.length < PER; a++) { try { const r = await gen(j.skill, j.subId, j.label, j.group, j.level); if (r.length > rows.length) rows = r; } catch { /* retry */ } }
      console.log(`  ${j.skill}/${j.subId}/${j.level}: ${rows.length} ${rows.length >= PER ? '✅' : rows.length >= 5 ? '⚠️<10' : '❌<5'}`);
      return rows.slice(0, PER);
    });
    const all = results.flat();
    console.log(`\nGenerated ${all.length}/${jobs.length * PER} valid MCQs.`);
    console.log('--- SAMPLES ---');
    for (const s of [all[0], all[Math.floor(all.length / 2)], all[all.length - 1]].filter(Boolean))
      console.log(`[${s.skill}/${s.sub}/${s.level}] ${s.question}\n   ${JSON.stringify(s.options)} ans=${s.answer}`);

    if (!DO_INSERT) { console.log('\n(dry-run — set DO_INSERT=1 to replace the generic OET W/S drills)'); return; }

    // Safety: never delete the working generic drills for a sparse/failed generation. Require at
    // least 5 per job (a viable session) before touching live data.
    if (all.length < jobs.length * 5) {
      console.log(`\n❌ ABORT: only ${all.length}/${jobs.length * 5} min MCQs generated — leaving existing OET drills untouched.`);
      return;
    }

    // Replace: delete the old generic Writing/Speaking OET drills (keep L/R), then insert criterion drills.
    const del = await p.$executeRawUnsafe(`DELETE FROM drill_questions WHERE exam_id='${EXAM}' AND skill IN ('WRITING','SPEAKING')`);
    console.log(`\ndeleted ${del} old generic OET W/S drills (L/R kept)`);
    let ins = 0;
    for (const r of all) {
      ins += await p.$executeRawUnsafe(
        `INSERT INTO drill_questions (skill, sub_skill, level, drill_type, prompt_text, options, correct_answer, explanation, exam_id, is_active, source_key)
         VALUES ($1::"SkillType",$2,$3::"RecommendationLevel",'MCQ',$4,$5::jsonb,$6::jsonb,$7,$8,true,$9)
         ON CONFLICT (source_key) DO NOTHING`,
        r.skill, r.sub, r.level, r.question, JSON.stringify(r.options), JSON.stringify(r.answer), r.explanation, EXAM, r.source_key,
      );
    }
    console.log(`✅ inserted ${ins} OET criterion drills (sub_skill = uppercased config ids).`);
  } catch (e: any) { console.log('ERR', e.message); }
  finally { await p.$disconnect(); }
})();
