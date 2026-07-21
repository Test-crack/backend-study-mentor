/**
 * BACKFILL TICK — replays dailyTick.ts for a range of past IST calendar dates.
 *
 * Use when the daily cron was missed for N days: this writes the same drills +
 * LexiGrid rows dailyTick.ts would have written on each missed day, with
 * created_at/session_date backdated to that day, and rolls the streak/momentum
 * forward day by day so the end state looks like the cron never stopped.
 *
 * Does NOT call Gemini or touch IA — those are seeded separately (seeders-ai) or
 * handled by dailyBot.ts's own IA gating for TODAY. This only backfills the two
 * daily-tick tables: drill_sessions and student_game_scores.
 *
 * Usage:
 *   # Preview (writes nothing):
 *   npx ts-node --project tsconfig.dev.json scripts/seeders/backfillTick.ts --from 2026-07-12 --to 2026-07-20 --dry-run
 *
 *   # Apply:
 *   npx ts-node --project tsconfig.dev.json scripts/seeders/backfillTick.ts --from 2026-07-12 --to 2026-07-20
 *
 * SAFETY: only touches accounts whose email ends with @seed.testcrack.dev.
 * Idempotent per (student, date): skips a day already backfilled/ticked.
 */

import { Command } from 'commander';
import prisma from '../../src/lib/prisma';
import { PERSONAS, type Persona } from './personas';
import { seededRand, dbHostLabel } from './utils';
import { rollActive } from './tickBehavior';

const program = new Command();
program
  .name('backfillTick')
  .description('Replay dailyTick.ts for a range of past IST dates')
  .requiredOption('--from <date>', 'first missed date, YYYY-MM-DD (IST)')
  .requiredOption('--to <date>', 'last missed date, YYYY-MM-DD (IST), inclusive')
  .option('--dry-run', 'Log what would happen without writing', false);
program.parse(process.argv);
const opts = program.opts<{ from: string; to: string; dryRun: boolean }>();

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

// UTC-midnight Date for an IST calendar-date string, matching currentISTDate()'s convention.
function istDateFromString(dateStr: string): Date {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d, 0, 0, 0, 0));
}

function addDays(d: Date, days: number): Date {
  const r = new Date(d);
  r.setUTCDate(r.getUTCDate() + days);
  return r;
}

const sameInstant = (a: Date | null, b: Date) => !!a && a.getTime() === b.getTime();

async function main() {
  const fromDate = istDateFromString(opts.from);
  const toDate = istDateFromString(opts.to);
  if (fromDate.getTime() > toDate.getTime()) throw new Error('--from must be <= --to');

  const dayCount = Math.round((toDate.getTime() - fromDate.getTime()) / 86400000) + 1;

  console.log('═══════════════════════════════════════════════════');
  console.log('  TestCrack Backfill Tick');
  console.log(`  Database: ${dbHostLabel()}`);
  console.log(`  Mode:     ${opts.dryRun ? 'DRY-RUN' : 'APPLY'}`);
  console.log(`  Range:    ${opts.from} .. ${opts.to} (${dayCount} day(s))`);
  console.log('═══════════════════════════════════════════════════\n');

  for (const persona of PERSONAS) {
    const user = await prisma.user.findUnique({ where: { email: persona.email } });
    if (!user) { console.log(`  [MISS] ${persona.email} not seeded — run runSeed.ts first`); continue; }
    const student = await prisma.institute_students.findUnique({ where: { user_id: user.id } });
    if (!student) { console.log(`  [MISS] ${persona.email} has no institute_students row`); continue; }

    console.log(`\n${persona.name} (${persona.email}):`);

    // Track streak/momentum locally across the loop, seeded from current DB state.
    let streak = student.daily_streak;
    let lastStreakDate = student.last_streak_date;
    let momentum = student.momentum_score;

    for (let dayIdx = 0; dayIdx < dayCount; dayIdx++) {
      const dayDate = addDays(fromDate, dayIdx);
      const daySeed = dayDate.toISOString().slice(0, 10);
      const yesterday = addDays(dayDate, -1);

      // Idempotency: already have a drill dated this day?
      const dayStart = dayDate;
      const dayEnd = addDays(dayDate, 1);
      const already = await prisma.drillSession.count({
        where: { student_id: student.id, created_at: { gte: dayStart, lt: dayEnd } },
      });
      if (already > 0) { console.log(`  [SKIP] ${daySeed} already backfilled`); continue; }

      const { active: isActive, roll, rate } = rollActive(persona, daySeed);
      if (!isActive) {
        console.log(`  [IDLE] ${daySeed} — no activity (roll ${roll.toFixed(2)} >= ${rate})`);
        continue;
      }

      let momentumEarned = 0;
      const drillPlans = [0, 1].map((i) => {
        const skill = SKILLS[(persona.drillCount + i) % 4];
        const acc = drillAccuracy(persona, daySeed, i);
        const correct = Math.round(acc * 5);
        const mom = 15 + 10 * correct;
        momentumEarned += mom;
        return { skill, sub_skill: SUBSKILL[skill], correct, mom };
      });

      const words = Math.round(seededRand(`lexi-${persona.email}-${daySeed}`, persona.atRisk ? 1 : 3, 5));
      const lexiBonus = words >= 5;
      const lexiMomentum = words * 15 + (lexiBonus ? 5 : 0);
      momentumEarned += lexiMomentum;

      let newStreak: number;
      if (sameInstant(lastStreakDate, dayDate)) newStreak = streak;
      else if (sameInstant(lastStreakDate, yesterday)) newStreak = streak + 1;
      else newStreak = 1;

      if (opts.dryRun) {
        console.log(`  [DRY-RUN] ${daySeed}: 2 drills (${drillPlans.map(d => `${d.skill} ${d.correct}/5`).join(', ')}), ` +
          `LexiGrid ${words} words, +${momentumEarned} momentum, streak → ${newStreak}`);
      } else {
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
              created_at: dayDate,
              drill_completed_at: dayDate,
              apply_completed_at: dayDate,
            },
          });
        }

        await prisma.studentGameScore.upsert({
          where: { student_id_game_type_session_date: { student_id: student.id, game_type: 'LEXIGRID', session_date: dayDate } },
          create: {
            student_id: student.id, game_type: 'LEXIGRID', session_date: dayDate,
            words_solved: words, total_attempts: words + 1, bonus_eligible: lexiBonus,
            momentum_earned: lexiMomentum, completed: true, created_at: dayDate,
          },
          update: {},
        });

        console.log(`  [ACTIVE] ${daySeed}: 2 drills + LexiGrid ${words}w, +${momentumEarned} momentum, streak → ${newStreak}`);
      }

      streak = newStreak;
      lastStreakDate = dayDate;
      momentum += momentumEarned;
    }

    if (!opts.dryRun) {
      await prisma.institute_students.update({
        where: { id: student.id },
        data: { momentum_score: momentum, daily_streak: streak, last_streak_date: lastStreakDate },
      });
    }
    console.log(`  → final: streak=${streak}, momentum=${momentum}, last_streak_date=${lastStreakDate?.toISOString().slice(0, 10)}`);
  }

  console.log('\n[backfillTick] DONE.\n');
}

main()
  .catch((e) => { console.error('[backfillTick] ERROR:', e); process.exit(1); })
  .finally(() => prisma.$disconnect());
