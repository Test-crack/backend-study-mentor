/**
 * READ-ONLY multi-day projection. Fast-forwards the next N days using the SAME
 * activity + streak rules as dailyTick, so you can confirm streaks build/break
 * correctly over upcoming days WITHOUT waiting and WITHOUT writing anything.
 *
 * Reads each seeded student's current daily_streak + last_streak_date, then
 * projects forward in memory. No DB writes — safe to run against prod.
 *
 * Usage:
 *   npx ts-node --project tsconfig.dev.json scripts/seeders/simulateDays.ts          # 14 days
 *   npx ts-node --project tsconfig.dev.json scripts/seeders/simulateDays.ts --days 21
 */
import { Command } from 'commander';
import prisma from '../../src/lib/prisma';
import { PERSONAS } from './personas';
import { rollActive } from './tickBehavior';
import { currentISTDate } from '../../src/lib/timezone';
import { dbHostLabel } from './utils';

const program = new Command();
program.name('simulateDays').option('--days <n>', 'days to project', '14');
program.parse(process.argv);
const DAYS = Math.max(1, Math.min(60, parseInt(program.opts().days, 10) || 14));

const DAY_MS = 24 * 60 * 60 * 1000;
const istDateAhead = (d: number) => new Date(currentISTDate().getTime() + d * DAY_MS);
const seedOf = (date: Date) => date.toISOString().slice(0, 10);

async function main() {
  console.log('═══════════════════════════════════════════════════');
  console.log('  Daily-Tick Projection (read-only — writes nothing)');
  console.log(`  Database: ${dbHostLabel()}`);
  console.log(`  Projecting ${DAYS} days forward from ${seedOf(istDateAhead(1))}`);
  console.log('═══════════════════════════════════════════════════\n');
  console.log('  Legend: number = streak that day (active) · "·" = idle day\n');

  for (const persona of PERSONAS) {
    const user = await prisma.user.findUnique({ where: { email: persona.email } });
    const student = user && await prisma.institute_students.findUnique({ where: { user_id: user.id } });
    if (!student) { console.log(`  ${persona.name.padEnd(16)} (not seeded — run runSeed first)`); continue; }

    let streak = student.daily_streak;
    let lastMs = student.last_streak_date ? student.last_streak_date.getTime() : null;
    const cells: string[] = [];
    let activeDays = 0;

    for (let d = 1; d <= DAYS; d++) {
      const date = istDateAhead(d);
      const { active } = rollActive(persona, seedOf(date));
      if (active) {
        const yesterdayMs = date.getTime() - DAY_MS;
        if (lastMs === date.getTime()) { /* already counted */ }
        else if (lastMs === yesterdayMs) streak += 1;
        else streak = 1;
        lastMs = date.getTime();
        cells.push(String(streak).padStart(2));
        activeDays++;
      } else {
        cells.push(' ·');
      }
    }

    console.log(`  ${persona.name.padEnd(16)} start ${String(student.daily_streak).padStart(2)} | ${cells.join(' ')} | final streak ${streak}, ${activeDays}/${DAYS} active`);
  }

  console.log('\n  Note: at-risk status is unaffected by streaks here — Group C stay at-risk via');
  console.log('  their declining IA trend, Kiran via inactivity. This projection is for streaks only.\n');
}

main()
  .catch((e) => { console.error('[simulateDays] ERROR:', e); process.exit(1); })
  .finally(() => prisma.$disconnect());
