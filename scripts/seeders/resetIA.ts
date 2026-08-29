/**
 * Resets a student's IA session for one date so they can start it again from
 * scratch: reverses any momentum that session already awarded/deducted, then
 * deletes the IASession row so a fresh Start IA call regenerates it.
 *
 * Usage:
 *   npx ts-node --project tsconfig.dev.json scripts/seeders/resetIA.ts --email shalomsam1717@gmail.com
 *   npx ts-node --project tsconfig.dev.json scripts/seeders/resetIA.ts --email shalomsam1717@gmail.com --date 2026-08-20
 *   npx ts-node --project tsconfig.dev.json scripts/seeders/resetIA.ts --email shalomsam1717@gmail.com --dry-run
 */
import dotenv from 'dotenv';
dotenv.config();

import { Command } from 'commander';
import prisma from '../../src/lib/prisma';

const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;

function toISTDateString(d: Date): string {
  const ist = new Date(d.getTime() + IST_OFFSET_MS);
  return [
    ist.getUTCFullYear(),
    String(ist.getUTCMonth() + 1).padStart(2, '0'),
    String(ist.getUTCDate()).padStart(2, '0'),
  ].join('-');
}

const program = new Command();
program
  .name('resetIA')
  .requiredOption('--email <email>', 'student login email')
  .option('--date <YYYY-MM-DD>', 'IA date to reset (IST calendar date), defaults to today')
  .option('--dry-run', 'show what would change without changing anything', false);
program.parse(process.argv);
const opts = program.opts<{ email: string; date?: string; dryRun: boolean }>();

async function main() {
  const user = await prisma.user.findUnique({ where: { email: opts.email } });
  if (!user) throw new Error(`No User row found for ${opts.email}`);

  // Explicit select — this dev DB is mid-migration and doesn't yet have every
  // column the full model expects (e.g. exam_type), so a bare findUnique errors.
  const student = await prisma.instituteStudent.findUnique({
    where: { user_id: user.id },
    select: { id: true, momentum_score: true },
  });
  if (!student) throw new Error(`${opts.email} has no institute_students row.`);

  const dateStr = opts.date ?? toISTDateString(new Date());
  const dayStart = new Date(`${dateStr}T00:00:00.000Z`);
  const dayEnd = new Date(`${dateStr}T23:59:59.999Z`);

  const session = await prisma.iASession.findFirst({
    where: { student_id: student.id, ia_date: { gte: dayStart, lte: dayEnd } },
  });

  console.log(`Student: ${opts.email} (institute_students.id: ${student.id})`);
  console.log(`  date:              ${dateStr}`);
  console.log(`  current momentum:  ${student.momentum_score}`);

  if (!session) {
    console.log('  IA session:        none found for this date. Nothing to reset.');
    return;
  }

  console.log(`  IA session:        ${session.id} (ia_number ${session.ia_number})`);
  console.log(`  status:            ${session.status}`);
  console.log(`  momentum_awarded:  ${session.momentum_awarded ?? 0}`);

  if (opts.dryRun) {
    console.log('\n[dry-run] Nothing changed.');
    return;
  }

  await prisma.$transaction(async (tx) => {
    if (session.momentum_awarded) {
      await tx.instituteStudent.update({
        where: { id: student.id },
        data: { momentum_score: { decrement: session.momentum_awarded } },
        select: { id: true },
      });
    }
    await tx.iASession.delete({ where: { id: session.id } });
  });

  console.log(
    `\n[RESET] IA session for ${dateStr} deleted` +
    (session.momentum_awarded ? ` and ${session.momentum_awarded} momentum reversed.` : '.') +
    ' Student can start today\'s IA fresh.'
  );
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
