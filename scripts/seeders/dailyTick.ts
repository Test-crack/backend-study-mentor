/**
 * DAILY TICK — makes the seeded cohort "live".
 *
 * Run once per day (cron / PM2). For each seeded student it simulates that day's
 * behaviour per persona: high performers drill and play LexiGrid, strugglers
 * mostly skip, the dropout stays silent. Over days, streaks grow for the active
 * ones and the at-risk list stays populated with those who fall behind.
 *
 * Writes ONLY to the two tables that update daily (per Sarthak):
 *   - drill_sessions       (daily drills)
 *   - student_game_scores  (LexiGrid)
 * and updates institute_students.momentum_score / daily_streak / last_streak_date
 * exactly the way drillController / gameScoreController do.
 *
 * Usage:
 *   # Preview what each student would do today (writes nothing):
 *   npx ts-node --project tsconfig.dev.json scripts/seeders/dailyTick.ts --dry-run
 *
 *   # Apply today's activity:
 *   npx ts-node --project tsconfig.dev.json scripts/seeders/dailyTick.ts
 *
 * Idempotent: if a student already has a drill dated today, they're skipped, so
 * running twice in one day does not double up.
 *
 * SAFETY: only touches accounts whose email ends with @seed.testcrack.dev.
 */

import { Command } from 'commander';
import prisma from '../../src/lib/prisma';
import { PERSONAS, type Persona } from './personas';
import { seededRand, dbHostLabel } from './utils';
import { rollActive } from './tickBehavior';
import { todayStartIST, currentISTDate, yesterdayISTDate } from '../../src/lib/timezone';

const program = new Command();
program
  .name('dailyTick')
  .description('Simulate one day of activity for the seeded cohort')
  .option('--dry-run', 'Log what would happen without writing', false);
program.parse(process.argv);
const opts = program.opts<{ dryRun: boolean }>();

const SKILLS = ['LISTENING', 'READING', 'WRITING', 'SPEAKING'] as const;
const SUBSKILL: Record<string, string> = {
  LISTENING: 'LISTENING', READING: 'READING', WRITING: 'GRAMMAR', SPEAKING: 'FLUENCY',
};

// Per-day drill accuracy for this persona (0–1).
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

const sameInstant = (a: Date | null, b: Date) => !!a && a.getTime() === b.getTime();

async function main() {
  console.log('═══════════════════════════════════════════════════');
  console.log('  TestCrack Daily Tick (cohort simulation)');
  console.log(`  Database: ${dbHostLabel()}`);
  console.log(`  Mode:     ${opts.dryRun ? 'DRY-RUN' : 'APPLY'}`);
  console.log(`  IST day:  ${currentISTDate().toISOString().slice(0, 10)}`);
  console.log('═══════════════════════════════════════════════════\n');

  const daySeed = currentISTDate().toISOString().slice(0, 10); // deterministic per calendar day
  const todayStart = todayStartIST();
  const istToday = currentISTDate();
  const istYesterday = yesterdayISTDate();

  let active = 0, skipped = 0, idle = 0;

  for (const persona of PERSONAS) {
    // Resolve the seeded student
    const user = await prisma.user.findUnique({ where: { email: persona.email } });
    if (!user) { console.log(`  [MISS] ${persona.email} not seeded — run runSeed.ts first`); continue; }
    const student = await prisma.institute_students.findUnique({ where: { user_id: user.id } });
    if (!student) { console.log(`  [MISS] ${persona.email} has no institute_students row`); continue; }

    // Idempotency: already ticked today?
    const drilledToday = await prisma.drillSession.count({
      where: { student_id: student.id, created_at: { gte: todayStart } },
    });
    if (drilledToday > 0) { console.log(`  [SKIP] ${persona.name} already active today`); skipped++; continue; }

    // Active today?
    const { active: isActive, roll, rate } = rollActive(persona, daySeed);
    if (!isActive) {
      console.log(`  [IDLE] ${persona.name} — no activity today (roll ${roll.toFixed(2)} ≥ ${rate})`);
      idle++;
      continue;
    }

    // ── Build today's 2 drills (2 = the count that advances the streak) ──────
    let momentumEarned = 0;
    const drillPlans = [0, 1].map((i) => {
      const skill = SKILLS[(persona.drillCount + i) % 4];
      const acc = drillAccuracy(persona, daySeed, i);
      const correct = Math.round(acc * 5);
      const mom = 15 + 10 * correct; // DRILL_BASE_PTS + DRILL_PER_CORRECT * correct
      momentumEarned += mom;
      return { skill, sub_skill: SUBSKILL[skill], correct, mom };
    });

    // ── LexiGrid for the day (active students play it) ───────────────────────
    const words = Math.round(seededRand(`lexi-${persona.email}-${daySeed}`, persona.atRisk ? 1 : 3, 5));
    const lexiBonus = words >= 5;
    const lexiMomentum = words * 15 + (lexiBonus ? 5 : 0);
    momentumEarned += lexiMomentum;

    // ── Streak: yesterday → +1, otherwise reset to 1 (mirrors drillController) ─
    let newStreak: number;
    if (sameInstant(student.last_streak_date, istToday)) newStreak = student.daily_streak;
    else if (sameInstant(student.last_streak_date, istYesterday)) newStreak = student.daily_streak + 1;
    else newStreak = 1;

    if (opts.dryRun) {
      console.log(`  [DRY-RUN] ${persona.name}: 2 drills (${drillPlans.map(d => `${d.skill} ${d.correct}/5`).join(', ')}), ` +
        `LexiGrid ${words} words, +${momentumEarned} momentum, streak → ${newStreak}`);
      active++;
      continue;
    }

    // Write drills
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
          drill_completed_at: new Date(),
          apply_completed_at: new Date(),
        },
      });
    }

    // Write LexiGrid (upsert — unique per student/game/day)
    await prisma.studentGameScore.upsert({
      where: { student_id_game_type_session_date: { student_id: student.id, game_type: 'LEXIGRID', session_date: istToday } },
      create: {
        student_id: student.id, game_type: 'LEXIGRID', session_date: istToday,
        words_solved: words, total_attempts: words + 1, bonus_eligible: lexiBonus,
        momentum_earned: lexiMomentum, completed: true,
      },
      update: {},
    });

    // Update streak + momentum
    await prisma.institute_students.update({
      where: { id: student.id },
      data: {
        momentum_score: { increment: momentumEarned },
        daily_streak: newStreak,
        last_streak_date: istToday,
      },
    });

    console.log(`  [ACTIVE] ${persona.name}: 2 drills + LexiGrid ${words}w, +${momentumEarned} momentum, streak → ${newStreak}`);
    active++;
  }

  console.log(`\n[dailyTick] DONE — ${active} active, ${idle} idle, ${skipped} already-done today.\n`);
}

main()
  .catch((e) => { console.error('[dailyTick] ERROR:', e); process.exit(1); })
  .finally(() => prisma.$disconnect());
