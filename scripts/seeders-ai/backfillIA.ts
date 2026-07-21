/**
 * BACKFILL IA — inserts the IASessions that were due during a missed date range,
 * with REAL Gemini-graded Writing/Speaking feedback (same pipeline as
 * genSeedFeedback.ts / seedIASessionsAI.ts), backdated to their scheduled day.
 *
 * IA cadence is every 3 days per persona, continuing from whichever IA the
 * persona actually has last in the DB (not the static personas.ts schedule —
 * this looks at live data so it works no matter how the gap happened).
 *
 * Dropout persona (Kiran) is skipped entirely: his future scheduled IAs are
 * supposed to show as MISSED, not completed — that's the dropout signal.
 *
 * Usage:
 *   npx ts-node --project tsconfig.dev.json scripts/seeders-ai/backfillIA.ts --from 2026-07-12 --to 2026-07-20 --dry-run
 *   npx ts-node --project tsconfig.dev.json scripts/seeders-ai/backfillIA.ts --from 2026-07-12 --to 2026-07-20
 *
 * SAFETY: only touches accounts whose email ends with @seed.testcrack.dev.
 */
import 'dotenv/config';
import { Command } from 'commander';
import prisma from '../../src/lib/prisma';
import { PERSONAS, type Persona } from '../seeders/personas';
import { noisyBand, seededRand } from '../seeders/utils';
import { gradeIASpeakingPrompt, gradeIAWritingPrompt } from '../../src/lib/iaGrading';
import { genCalibratedAnswer } from '../shared/calibratedAnswer';
import { IA_SUBSKILL_SETS, personaMeanBand } from './iaPlan';

const program = new Command();
program
  .name('backfillIA')
  .description('Insert IA sessions due during a missed date range, with real Gemini feedback')
  .requiredOption('--from <date>', 'first missed date, YYYY-MM-DD (IST)')
  .requiredOption('--to <date>', 'last missed date, YYYY-MM-DD (IST), inclusive')
  .option('--dry-run', 'Log what would happen without writing/calling Gemini', false);
program.parse(process.argv);
const opts = program.opts<{ from: string; to: string; dryRun: boolean }>();

function istDateFromString(dateStr: string): Date {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d, 0, 0, 0, 0));
}
function addDays(d: Date, days: number): Date {
  const r = new Date(d);
  r.setUTCDate(r.getUTCDate() + days);
  return r;
}

const IA_WRITING_PROMPT =
  "Write a response of at least 250 words: 'Some people think the best way to improve public " +
  "health is to increase the number of sports facilities. Others believe this has little effect " +
  "and that other measures are needed. Discuss both views and give your own opinion.'";
const IA_SPEAKING_PROMPT =
  'Talk for about two minutes about a skill you would like to learn. Explain what it is, why you ' +
  'want to learn it, and how you would go about learning it.';

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
      const waitMs = 1500 * Math.pow(2, i);
      console.warn(`    [retry] ${label} failed (${msg.slice(0, 60)}...) — retrying in ${waitMs}ms`);
      await new Promise(r => setTimeout(r, waitMs));
    }
  }
  throw lastErr;
}

async function gradeSpeakingRetry(criterion: string, prompt: string, transcript: string) {
  return withRetry(`speaking:${criterion}`, async () => {
    const r = await gradeIASpeakingPrompt(criterion, prompt, transcript);
    if (/encountered an error|Minimum score assigned for safety/i.test(r.rationale)) {
      throw new Error('grader returned error fallback (transient)');
    }
    return r;
  });
}
async function gradeWritingRetry(criterion: string, prompt: string, response: string) {
  return withRetry(`writing:${criterion}`, async () => {
    const r = await gradeIAWritingPrompt(criterion, prompt, response);
    if (/encountered an error|Minimum score assigned for safety/i.test(r.rationale)) {
      throw new Error('grader returned error fallback (transient)');
    }
    return r;
  });
}

function iaKindForIndex(index: number): 'WRITING' | 'SPEAKING' | null {
  const skill = IA_SUBSKILL_SETS[index % IA_SUBSKILL_SETS.length][0].skill;
  return skill === 'WRITING' ? 'WRITING' : skill === 'SPEAKING' ? 'SPEAKING' : null;
}

async function main() {
  const fromDate = istDateFromString(opts.from);
  const toDate = istDateFromString(opts.to);

  console.log('═══════════════════════════════════════════════════');
  console.log('  Backfill IA (real Gemini grading)');
  console.log(`  Mode:  ${opts.dryRun ? 'DRY-RUN' : 'APPLY'}`);
  console.log(`  Range: ${opts.from} .. ${opts.to}`);
  console.log('═══════════════════════════════════════════════════\n');

  for (const persona of PERSONAS) {
    if (persona.isDropout) {
      console.log(`${persona.name}: SKIPPED (dropout — future IAs stay MISSED, by design)`);
      continue;
    }

    const user = await prisma.user.findUnique({ where: { email: persona.email } });
    if (!user) { console.log(`  [MISS] ${persona.email} not seeded`); continue; }
    const student = await prisma.institute_students.findUnique({ where: { user_id: user.id } });
    if (!student) { console.log(`  [MISS] ${persona.email} has no institute_students row`); continue; }

    const existing = await prisma.iASession.findMany({
      where: { student_id: student.id },
      orderBy: { ia_date: 'asc' },
    });
    if (existing.length === 0) { console.log(`  [MISS] ${persona.email} has no prior IA sessions`); continue; }

    const lastIaDate = existing[existing.length - 1].ia_date;
    const lastIaNumber = existing[existing.length - 1].ia_number;
    const existingCount = existing.length;

    // Compute due dates every 3 days after the last real IA, capped at --to.
    const dueDates: Date[] = [];
    let cursor = addDays(lastIaDate, 3);
    while (cursor.getTime() <= toDate.getTime()) {
      if (cursor.getTime() >= fromDate.getTime()) dueDates.push(cursor);
      cursor = addDays(cursor, 3);
    }

    if (dueDates.length === 0) {
      console.log(`${persona.name}: no IA due in range (last IA ${lastIaDate.toISOString().slice(0, 10)})`);
      continue;
    }

    console.log(`\n${persona.name} (${persona.email}): ${dueDates.length} IA(s) due — ` +
      dueDates.map(d => d.toISOString().slice(0, 10)).join(', '));

    const totalCount = existingCount + dueDates.length;
    const mean = personaMeanBand(persona);
    const declining = persona.atRisk; // atRisk-non-dropout: newest dips (declining signal)

    for (let i = 0; i < dueDates.length; i++) {
      const index = existingCount + i; // 0-based overall position
      const iaNumber = lastIaNumber + i + 1;
      const iaDate = dueDates[i];
      const isNewestOverall = index === totalCount - 1;
      const rawBase = declining ? (isNewestOverall && totalCount > 1 ? mean - 1.5 : mean) : mean + index * 0.4;
      const base = Math.min(9.0, Math.max(4.0, rawBase)); // platform band domain is [4.0, 9.0]
      const set = IA_SUBSKILL_SETS[index % IA_SUBSKILL_SETS.length];
      const kind = iaKindForIndex(index);

      if (opts.dryRun) {
        console.log(`  [DRY-RUN] IA #${iaNumber} on ${iaDate.toISOString().slice(0, 10)} — ` +
          `${set.map(s => s.sub_skill).join('/')}, kind=${kind ?? 'MCQ'}, base=${base.toFixed(2)}`);
        continue;
      }

      let answer: string | null = null;
      if (kind) {
        const prompt = kind === 'WRITING' ? IA_WRITING_PROMPT : IA_SPEAKING_PROMPT;
        process.stdout.write(`  [GEN] IA #${iaNumber} (${kind}) generating + grading... `);
        answer = await genCalibratedAnswer(prompt, kind, base);
      }

      const scores = await Promise.all(set.map(async (entry) => {
        const band = noisyBand(base, `ia-${entry.sub_skill}-${persona.email}-${index}`, 0.3);
        const total = 4;
        const correct = Math.round(persona.accuracyRate * total);
        const isAISkill = entry.skill === 'WRITING' || entry.skill === 'SPEAKING';
        if (!isAISkill) {
          return { skill: entry.skill, sub_skill: entry.sub_skill, band, correct, total, ai_graded: false };
        }
        const prompt = kind === 'WRITING' ? IA_WRITING_PROMPT : IA_SPEAKING_PROMPT;
        const graded = kind === 'WRITING'
          ? await gradeWritingRetry(entry.sub_skill, prompt, answer!)
          : await gradeSpeakingRetry(entry.sub_skill, prompt, answer!);
        return {
          skill: entry.skill, sub_skill: entry.sub_skill, band, correct, total,
          ai_graded: true,
          ai_feedback: { rationale: graded.rationale, key_observations: graded.key_observations },
        };
      }));

      if (kind) console.log('done');

      const windowCloses = new Date(iaDate.getTime() + 24 * 60 * 60 * 1000);
      const submitted = new Date(iaDate.getTime() + 2 * 60 * 60 * 1000);
      const jitter = Math.round(seededRand(`mom-ia-${persona.email}-${iaNumber}`, -2, 3));
      const momentum = persona.momentumBase + jitter;

      await prisma.iASession.create({
        data: {
          student_id: student.id,
          ia_number: iaNumber,
          ia_date: iaDate,
          status: 'COMPLETED',
          selected_subskills: scores.map((s) => s.sub_skill),
          question_ids: [],
          answers: {},
          time_started_at: iaDate,
          time_submitted_at: submitted,
          window_closes_at: windowCloses,
          scores,
          momentum_awarded: momentum,
          carry_forward_subskills: [],
        },
      });
      console.log(`  [OK] IA #${iaNumber} inserted for ${iaDate.toISOString().slice(0, 10)}`);
    }
  }

  console.log('\n[backfillIA] DONE.\n');
}

main()
  .catch((e) => { console.error('[backfillIA] ERROR:', e); process.exit(1); })
  .finally(() => prisma.$disconnect());
