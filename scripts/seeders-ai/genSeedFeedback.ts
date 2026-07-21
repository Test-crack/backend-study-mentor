/**
 * ONE-TIME batch — build REAL Gemini-graded feedback for the seeded cohort.
 *
 * For each persona it generates a tier-appropriate answer (at the persona's band)
 * and grades it with the SAME functions the live app uses:
 *   - diagnostic Writing  → analyzeWriting()        (src/services/ieltsWritingService)
 *   - diagnostic Speaking → gradeIASpeakingPrompt() (src/lib/iaGrading, text transcript)
 * The result is cached to seedFeedback.json so re-seeds are instant and Gemini is
 * only ever called here. Idempotent + resumable (skips already-graded personas).
 *
 * This writes NOTHING to the database — it only produces a local JSON cache.
 * The AI seeders (seedDiagnosticsAI / seedIASessionsAI) read this file.
 *
 *   npx ts-node --project tsconfig.dev.json scripts/seeders-ai/genSeedFeedback.ts
 *   npx ts-node --project tsconfig.dev.json scripts/seeders-ai/genSeedFeedback.ts --email rahul.shetty@seed.testcrack.dev
 *   npx ts-node --project tsconfig.dev.json scripts/seeders-ai/genSeedFeedback.ts --force   # regenerate even if cached
 */
import 'dotenv/config';
import * as fs from 'fs';
import * as path from 'path';
import { Command } from 'commander';
import { PERSONAS, type Persona } from '../seeders/personas';
import { analyzeWriting } from '../../src/services/ieltsWritingService';
import { gradeIASpeakingPrompt, gradeIAWritingPrompt } from '../../src/lib/iaGrading';
import { genCalibratedAnswer } from '../shared/calibratedAnswer';
import { iaSlots, iaSet, iaKind, iaBaseBand } from './iaPlan';

const OUT = path.join(__dirname, 'seedFeedback.json');

/** Retry a Gemini-backed call on transient errors (503/429/overloaded) with backoff. */
async function withRetry<T>(label: string, fn: () => Promise<T>, attempts = 4): Promise<T> {
  let lastErr: any;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (e: any) {
      lastErr = e;
      const msg = String(e?.message ?? e);
      const transient = /503|429|overload|unavailable|fetch/i.test(msg);
      if (!transient || i === attempts - 1) throw e;
      const waitMs = 1500 * Math.pow(2, i); // 1.5s, 3s, 6s
      console.warn(`    [retry] ${label} failed (${msg.slice(0, 60)}…) — retrying in ${waitMs}ms`);
      await new Promise(r => setTimeout(r, waitMs));
    }
  }
  throw lastErr;
}

/** Speaking grader that retries on the grader's internal error fallback (it swallows throws). */
async function gradeSpeakingRetry(criterion: string, prompt: string, transcript: string) {
  return withRetry(`speaking:${criterion}`, async () => {
    const r = await gradeIASpeakingPrompt(criterion, prompt, transcript);
    if (/encountered an error|Minimum score assigned for safety/i.test(r.rationale)) {
      throw new Error('grader returned error fallback (transient)');
    }
    return r;
  });
}

/** Writing grader (per-criterion, IA) that retries on the grader's internal error fallback. */
async function gradeWritingRetry(criterion: string, prompt: string, response: string) {
  return withRetry(`writing:${criterion}`, async () => {
    const r = await gradeIAWritingPrompt(criterion, prompt, response);
    if (/encountered an error|Minimum score assigned for safety/i.test(r.rationale)) {
      throw new Error('grader returned error fallback (transient)');
    }
    return r;
  });
}

/**
 * IA feedback for one persona. For each completed IA slot, generate ONE answer at the
 * IA's base band and grade it for every gradable sub-skill in that IA's set. Listening/
 * Reading IAs (MCQ) are skipped — they aren't AI-graded. Keyed by ia_number.
 */
async function genIA(persona: Persona): Promise<Record<string, any>> {
  const slots = iaSlots(persona);
  const out: Record<string, any> = {};
  for (const slot of slots) {
    const kind = iaKind(slot.index);
    if (!kind) continue; // Listening/Reading IA — no Gemini grading
    const base = iaBaseBand(persona, slot.index, slots.length);
    const prompt = kind === 'WRITING' ? IA_WRITING_PROMPT : IA_SPEAKING_PROMPT;
    const answer = await genCalibratedAnswer(prompt, kind, base);
    const graded: Record<string, any> = {};
    for (const entry of iaSet(slot.index)) {
      graded[entry.sub_skill] = kind === 'WRITING'
        ? await gradeWritingRetry(entry.sub_skill, prompt, answer)
        : await gradeSpeakingRetry(entry.sub_skill, prompt, answer);
    }
    out[String(slot.iaNumber)] = { kind, base_band: base, answer, graded };
  }
  return out;
}

// Representative diagnostic prompts. The grader scores the RESPONSE; the prompt is
// just the on-topic anchor, so one standard prompt per skill is sufficient.
const DIAG_WRITING_TOPIC =
  'Some people believe that students should be required to study a foreign language ' +
  'throughout school, while others think it should be optional. Discuss both views and ' +
  'give your own opinion. Write at least 250 words.';
const DIAG_SPEAKING_PROMPT =
  'Describe a place you have visited that left a strong impression on you. Explain where ' +
  'it is, what you did there, and why it was so memorable. Speak for about two minutes.';

// Representative IA prompts. The grader applies the sub-skill lens to the RESPONSE, so a
// single on-topic prompt works for every writing/speaking sub-skill in an IA.
const IA_WRITING_PROMPT =
  "Write a response of at least 250 words: 'Some people think the best way to improve public " +
  "health is to increase the number of sports facilities. Others believe this has little effect " +
  "and that other measures are needed. Discuss both views and give your own opinion.'";
const IA_SPEAKING_PROMPT =
  'Talk for about two minutes about a skill you would like to learn. Explain what it is, why you ' +
  'want to learn it, and how you would go about learning it.';

const SPEAKING_CRITERIA = ['FLUENCY', 'VOCABULARY', 'GRAMMAR', 'PRONUNCIATION'] as const;

const program = new Command();
program.option('--email <email>', 'only this persona').option('--force', 'regenerate even if cached');
program.parse(process.argv);
const onlyEmail = program.opts().email as string | undefined;
const force = !!program.opts().force;

async function genDiagnostic(persona: Persona) {
  // Writing — generate an essay at the persona's writing band, grade with the real grader.
  const wBand = persona.diagnosticBand.WRITING;
  const essay = await genCalibratedAnswer(DIAG_WRITING_TOPIC, 'WRITING', wBand);
  const writingGraded = await withRetry('writing', () => analyzeWriting(DIAG_WRITING_TOPIC, essay, 'Task 2'));

  // Speaking — one transcript at the persona's speaking band, graded per criterion
  // (text-based; no audio needed). Mirrors the 4 diagnostic speaking sub-scores.
  const sBand = persona.diagnosticBand.SPEAKING;
  const transcript = await genCalibratedAnswer(DIAG_SPEAKING_PROMPT, 'SPEAKING', sBand);
  const speakingByCriterion: Record<string, any> = {};
  for (const crit of SPEAKING_CRITERIA) {
    speakingByCriterion[crit] = await gradeSpeakingRetry(crit, DIAG_SPEAKING_PROMPT, transcript);
  }

  return {
    WRITING:  { target_band: wBand, answer: essay,      graded: writingGraded },
    SPEAKING: { target_band: sBand, transcript,         by_criterion: speakingByCriterion },
  };
}

async function main() {
  const existing: Record<string, any> = fs.existsSync(OUT)
    ? JSON.parse(fs.readFileSync(OUT, 'utf8'))
    : {};

  const roster = onlyEmail ? PERSONAS.filter(p => p.email === onlyEmail) : PERSONAS;
  if (roster.length === 0) { console.error(`No persona matches ${onlyEmail}`); process.exit(1); }

  console.log('═══════════════════════════════════════════════════');
  console.log('  Seed feedback generator (real Gemini grading)');
  console.log(`  Personas: ${roster.length}   Output: ${OUT}`);
  console.log('═══════════════════════════════════════════════════\n');

  let done = 0, skipped = 0;
  for (const persona of roster) {
    const entry = existing[persona.email] ?? {};
    let changed = false;

    if (force || !entry.diagnostic) {
      process.stdout.write(`  [GEN] ${persona.name} diagnostic … `);
      entry.diagnostic = await genDiagnostic(persona);
      changed = true;
      const w = entry.diagnostic.WRITING.graded;
      const sf = entry.diagnostic.SPEAKING.by_criterion.FLUENCY;
      console.log(
        `OK  (W target ${entry.diagnostic.WRITING.target_band}→graded ${w.bandScore}; ` +
        `S target ${entry.diagnostic.SPEAKING.target_band}→fluency ${sf.band}/10)`
      );
      existing[persona.email] = entry;
      fs.writeFileSync(OUT, JSON.stringify(existing, null, 2)); // resumable
    }

    if (force || !entry.ia) {
      process.stdout.write(`  [GEN] ${persona.name} IAs … `);
      entry.ia = await genIA(persona);
      changed = true;
      const n = Object.keys(entry.ia).length;
      console.log(`OK  (${n} AI-graded IA${n === 1 ? '' : 's'})`);
      existing[persona.email] = entry;
      fs.writeFileSync(OUT, JSON.stringify(existing, null, 2)); // resumable
    }

    if (changed) done++;
    else { console.log(`  [SKIP] ${persona.name} (already cached)`); skipped++; }
  }

  console.log(`\nDone — generated ${done}, skipped ${skipped}. Cache → ${OUT}`);
}

main().catch(e => { console.error('[genSeedFeedback] ERROR:', e.message); process.exit(1); });
