/**
 * ONE-OFF BACKFILL: recreate a missed dailyTick/dailyBot day directly in the DB,
 * for a specific past calendar date (IST) — drills + LexiGrid as usual, AND an
 * IA session for any persona whose real IA schedule (computed the same way
 * production does, in src/lib/iaMissDetector.ts: firstDrill + n*3 days) falls due
 * on that date.
 *
 * WHY a separate script instead of just re-running dailyTick/dailyBot today:
 *   - dailyTick/dailyBot always act on "today" (real IST clock) — they can't
 *     backdate a missed day.
 *   - If you run today's dailyBot without backfilling, its own /api/ia/status
 *     call triggers detectAndMarkMissedIAs, which will permanently mark the
 *     missed day's IA as MISSED (-20 momentum) before you get a chance to
 *     backfill it. Run this FIRST, before today's tick/bot.
 *
 * Idempotent: skips personas who already have a drill dated `--date`.
 *
 * Usage:
 *   npx ts-node --project tsconfig.dev.json scripts/seeders/backfillDay.ts --date 2026-07-05 --dry-run
 *   npx ts-node --project tsconfig.dev.json scripts/seeders/backfillDay.ts --date 2026-07-05
 */
import dotenv from 'dotenv';
dotenv.config();

import * as fs from 'fs';
import * as path from 'path';
import { Command } from 'commander';
import prisma from '../../src/lib/prisma';
import { PERSONAS, type Persona } from './personas';
import { seededRand, noisyBand, dbHostLabel } from './utils';
import { rollActive } from './tickBehavior';
import { IA_SUBSKILL_SETS, personaMeanBand } from '../seeders-ai/iaPlan';

const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;
const IA_INTERVAL_DAYS = 3;

const program = new Command();
program
  .name('backfillDay')
  .requiredOption('--date <YYYY-MM-DD>', 'IST calendar date to backfill')
  .option('--dry-run', 'preview only, write nothing', false);
program.parse(process.argv);
const opts = program.opts<{ date: string; dryRun: boolean }>();

if (!/^\d{4}-\d{2}-\d{2}$/.test(opts.date)) {
  console.error('--date must be YYYY-MM-DD');
  process.exit(1);
}

// UTC midnight of the given IST calendar date (matches currentISTDate()'s convention).
function dateAtIST(dateStr: string): Date {
  return new Date(`${dateStr}T00:00:00.000Z`);
}
function toISTDateString(d: Date): string {
  const ist = new Date(d.getTime() + IST_OFFSET_MS);
  return ist.toISOString().slice(0, 10);
}
function addDays(dateStr: string, days: number): string {
  const d = new Date(`${dateStr}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

const targetDate = dateAtIST(opts.date);
const targetPrevDay = dateAtIST(addDays(opts.date, -1));

const SKILLS = ['LISTENING', 'READING', 'WRITING', 'SPEAKING'] as const;
const SUBSKILL: Record<string, string> = {
  LISTENING: 'LISTENING', READING: 'READING', WRITING: 'GRAMMAR', SPEAKING: 'FLUENCY',
};

function drillAccuracy(p: Persona, daySeed: string, i: number): number {
  const jitter = seededRand(`tickacc-${p.email}-${daySeed}-${i}`, -0.05, 0.05);
  if (p.isErratic) {
    return i % 2 === 0 ? 0.4 + seededRand(`e-${p.email}-${daySeed}-${i}`, 0, 0.1)
                       : 0.85 + seededRand(`e2-${p.email}-${daySeed}-${i}`, 0, 0.08);
  }
  const base = p.skillAccuracy
    ? Object.values(p.skillAccuracy).reduce((a, b) => a + (b ?? 0), 0) / Object.values(p.skillAccuracy).length
    : p.accuracyRate;
  return Math.min(1, Math.max(0.1, base + jitter));
}

function templatedFeedback(band: number, subSkill: string) {
  return {
    rationale: `Student shows ${band >= 6 ? 'good' : band >= 4.5 ? 'developing' : 'limited'} competency in ${subSkill.toLowerCase()}.`,
    key_observations: [
      band < 5 ? 'Significant errors present' : 'Mostly accurate responses',
      band < 4.5 ? 'Needs fundamental skill building' : 'Continue practising for consistency',
    ],
  };
}

function loadFeedbackCache(): Record<string, any> {
  const cachePath = path.join(__dirname, '../seeders-ai/seedFeedback.json');
  if (!fs.existsSync(cachePath)) return {};
  return JSON.parse(fs.readFileSync(cachePath, 'utf8'));
}

async function main() {
  console.log('═══════════════════════════════════════════════════');
  console.log('  Backfill missed day — drills + IA (where due)');
  console.log(`  Database: ${dbHostLabel()}`);
  console.log(`  Date: ${opts.date}   Mode: ${opts.dryRun ? 'DRY-RUN' : 'APPLY'}`);
  console.log('═══════════════════════════════════════════════════\n');

  const cache = loadFeedbackCache();
  let drilled = 0, iaCreated = 0, idle = 0, skippedExisting = 0;

  for (const persona of PERSONAS) {
    const user = await prisma.user.findUnique({ where: { email: persona.email } });
    if (!user) { console.log(`  [MISS] ${persona.email} not seeded`); continue; }
    const student = await prisma.institute_students.findUnique({ where: { user_id: user.id } });
    if (!student) { console.log(`  [MISS] ${persona.email} has no student row`); continue; }

    // Idempotency: already have a drill dated this day?
    const existingDrillCount = await prisma.drillSession.count({
      where: { student_id: student.id, created_at: { gte: targetDate, lt: dateAtIST(addDays(opts.date, 1)) } },
    });
    if (existingDrillCount > 0) {
      console.log(`  [SKIP] ${persona.name} already has activity on ${opts.date}`);
      skippedExisting++;
      continue;
    }

    // ── IA due check (mirrors src/lib/iaMissDetector.ts scheduling exactly) ──
    const attemptIA = !persona.isDropout;
    let iaDue = false;
    let nextIaNumber = 0;
    let firstDrillStr: string | null = null;

    if (attemptIA) {
      const firstDrill = await prisma.drillSession.findFirst({
        where: { student_id: student.id },
        orderBy: { created_at: 'asc' },
        select: { created_at: true },
      });
      if (firstDrill) {
        firstDrillStr = toISTDateString(firstDrill.created_at);
        const existingIACount = await prisma.iASession.count({ where: { student_id: student.id } });
        nextIaNumber = existingIACount + 1;
        const expectedDate = addDays(firstDrillStr, nextIaNumber * IA_INTERVAL_DAYS);
        iaDue = opts.date >= expectedDate;
      }
    }

    // ── Active today? Force active if an IA is due (mirrors dailyBot.ts) ────
    const { active: rolledActive, roll, rate } = rollActive(persona, opts.date);
    const isActive = rolledActive || iaDue;

    if (!isActive) {
      console.log(`  [IDLE] ${persona.name} — no activity on ${opts.date} (roll ${roll.toFixed(2)} ≥ ${rate})`);
      idle++;
      continue;
    }

    let momentumEarned = 0;
    const drillPlans = [0, 1].map((i) => {
      const skill = SKILLS[(persona.drillCount + i) % 4];
      const acc = drillAccuracy(persona, opts.date, i);
      const correct = Math.round(acc * 5);
      const mom = 15 + 10 * correct;
      momentumEarned += mom;
      return { skill, sub_skill: SUBSKILL[skill], correct, mom };
    });

    const words = Math.round(seededRand(`lexi-${persona.email}-${opts.date}`, persona.atRisk ? 1 : 3, 5));
    const lexiBonus = words >= 5;
    const lexiMomentum = words * 15 + (lexiBonus ? 5 : 0);
    momentumEarned += lexiMomentum;

    // Streak continuity: was the student's last recorded day the one before `date`?
    let newStreak: number;
    if (student.last_streak_date?.getTime() === targetDate.getTime()) newStreak = student.daily_streak;
    else if (student.last_streak_date?.getTime() === targetPrevDay.getTime()) newStreak = student.daily_streak + 1;
    else newStreak = 1;

    const drillLabel = drillPlans.map((d) => `${d.skill} ${d.correct}/5`).join(', ');
    const iaLabel = iaDue ? `, IA #${nextIaNumber} due` : '';
    console.log(`  [${opts.dryRun ? 'DRY-RUN' : 'BACKFILL'}] ${persona.name}: 2 drills (${drillLabel}), LexiGrid ${words}w, +${momentumEarned} momentum, streak → ${newStreak}${iaLabel}`);

    if (!opts.dryRun) {
      for (const d of drillPlans) {
        await prisma.drillSession.create({
          data: {
            student_id: student.id,
            skill: d.skill as any,
            sub_skill: d.sub_skill as any,
            prompts_completed: 5,
            total_questions: 5,
            correct_answers: d.correct,
            momentum_earned: d.mom,
            status: 'APPLY_DONE' as any,
            created_at: targetDate,
            drill_completed_at: targetDate,
            apply_completed_at: targetDate,
          },
        });
      }

      await prisma.studentGameScore.upsert({
        where: { student_id_game_type_session_date: { student_id: student.id, game_type: 'LEXIGRID', session_date: targetDate } },
        create: {
          student_id: student.id, game_type: 'LEXIGRID', session_date: targetDate,
          words_solved: words, total_attempts: words + 1, bonus_eligible: lexiBonus,
          momentum_earned: lexiMomentum, completed: true,
        },
        update: {},
      });

      await prisma.institute_students.update({
        where: { id: student.id },
        data: {
          momentum_score: { increment: momentumEarned },
          daily_streak: newStreak,
          last_streak_date: targetDate,
        },
      });
    }
    drilled++;

    // ── Create the due IA session, dated this backfilled day ────────────────
    if (iaDue && !opts.dryRun) {
      const index = nextIaNumber - 1;
      const set = IA_SUBSKILL_SETS[index % IA_SUBSKILL_SETS.length];
      const mean = personaMeanBand(persona);
      const declining = persona.atRisk && !persona.isDropout;
      const base = declining ? mean - 1.5 : mean + index * 0.4; // this IA is always "newest" so far
      const iaGraded = cache[persona.email]?.ia?.[String(nextIaNumber)]?.graded ?? {};

      const scores = set.map((entry) => {
        const band = noisyBand(base, `ia-${entry.sub_skill}-${persona.email}-${index}`, 0.3);
        const total = 4;
        const correct = Math.round(persona.accuracyRate * total);
        const isAISkill = entry.skill === 'WRITING' || entry.skill === 'SPEAKING';
        if (!isAISkill) return { skill: entry.skill, sub_skill: entry.sub_skill, band, correct, total, ai_graded: false };
        const real = iaGraded[entry.sub_skill];
        const ai_feedback = real ? { rationale: real.rationale, key_observations: real.key_observations } : templatedFeedback(band, entry.sub_skill);
        return { skill: entry.skill, sub_skill: entry.sub_skill, band, correct, total, ai_graded: true, ai_feedback };
      });

      const windowCloses = new Date(targetDate.getTime() + 24 * 60 * 60 * 1000);
      const submitted = new Date(targetDate.getTime() + 2 * 60 * 60 * 1000);
      const jitter = Math.round(seededRand(`mom-ia-${persona.email}-${nextIaNumber}`, -2, 3));

      await prisma.iASession.create({
        data: {
          student_id: student.id,
          ia_number: nextIaNumber,
          ia_date: targetDate,
          status: 'COMPLETED',
          selected_subskills: scores.map((s) => s.sub_skill),
          question_ids: [],
          answers: {},
          time_started_at: targetDate,
          time_submitted_at: submitted,
          window_closes_at: windowCloses,
          scores,
          momentum_awarded: persona.momentumBase + jitter,
          carry_forward_subskills: [],
        },
      });
      await prisma.institute_students.update({
        where: { id: student.id },
        data: { momentum_score: { increment: persona.momentumBase + jitter } },
      });
      iaCreated++;
      console.log(`    ↳ IA #${nextIaNumber} created for ${persona.name} (${scores.map((s) => `${s.sub_skill} ${s.band}`).join(', ')})`);
    } else if (iaDue && opts.dryRun) {
      console.log(`    ↳ [DRY-RUN] would create IA #${nextIaNumber} for ${persona.name}`);
    }
  }

  console.log(`\n[backfillDay] DONE for ${opts.date} — ${drilled} drilled, ${iaCreated} IA(s) created, ${idle} idle, ${skippedExisting} already had data.`);
  console.log('You can now safely run dailyTick.ts / dailyBot.ts for today.\n');
}

main()
  .catch((e) => { console.error('[backfillDay] ERROR:', e); process.exit(1); })
  .finally(() => prisma.$disconnect());
