/**
 * AI seeder entry point — same 12-persona cohort as scripts/seeders/runSeed.ts, but the
 * diagnostic + IA feedback is REAL Gemini grading (cached in seedFeedback.json) instead of
 * templated text. Reuses createStudents / seedDrills / cleanStudents from the original
 * seeder unchanged; only the diagnostic + IA score builders differ.
 *
 * Prereq — build the feedback cache once (needs GEMINI_API_KEY + DB tunnel):
 *   npx ts-node --project tsconfig.dev.json scripts/seeders-ai/genSeedFeedback.ts
 *
 * Then seed (mirrors runSeed flags exactly):
 *   npx ts-node --project tsconfig.dev.json scripts/seeders-ai/runSeedAI.ts --batch <batchId> --dry-run
 *   npx ts-node --project tsconfig.dev.json scripts/seeders-ai/runSeedAI.ts --batch <batchId>
 *   npx ts-node --project tsconfig.dev.json scripts/seeders-ai/runSeedAI.ts --batch <batchId> --clean
 *
 * SAFETY: --clean only deletes accounts whose email ends with @seed.testcrack.dev.
 * This is the experimental variant — the templated fallback is scripts/seeders/runSeed.ts.
 */
import 'dotenv/config';
import { Command } from 'commander';
import prisma from '../../src/lib/prisma';
import { PERSONAS } from '../seeders/personas';
import { createStudents, cleanStudents, type StudentRecord } from '../seeders/createStudents';
import { seedDrills } from '../seeders/seedDrills';
import { dbHostLabel } from '../seeders/utils';
import { seedDiagnosticsAI } from './seedDiagnosticsAI';
import { seedIASessionsAI } from './seedIASessionsAI';

const program = new Command();
program
  .name('runSeedAI')
  .description('Seed 12 personas with REAL Gemini-graded diagnostic + IA feedback')
  .requiredOption('--batch <batchId>', 'UUID of the target IELTS batch')
  .option('--dry-run', 'Log what would be inserted without writing to DB', false)
  .option('--clean', 'Delete all seeded records before re-running', false);
program.parse(process.argv);
const opts = program.opts<{ batch: string; dryRun: boolean; clean: boolean }>();

async function main() {
  console.log('═══════════════════════════════════════════════════');
  console.log('  TestCrack Persona Seeder — AI-GRADED variant');
  console.log(`  Database: ${dbHostLabel()}`);
  console.log(`  Batch: ${opts.batch}`);
  console.log(`  Mode:  ${opts.dryRun ? 'DRY-RUN' : opts.clean ? 'CLEAN + SEED' : 'SEED'}`);
  console.log('═══════════════════════════════════════════════════\n');

  try {
    if (opts.clean) {
      await cleanStudents();
    }
    if (opts.dryRun) {
      console.log('DRY-RUN MODE: No data will be written.\n');
    }

    const studentRecords: StudentRecord[] = await createStudents(opts.batch, opts.dryRun);
    if (studentRecords.length === 0 && !opts.dryRun) {
      console.log('[runSeedAI] No new students created. All personas may already exist.');
    }

    const studentMap = new Map<string, StudentRecord>(
      studentRecords.map((r) => [r.personaEmail, r])
    );
    for (const persona of PERSONAS) {
      if (studentMap.has(persona.email)) continue;
      const user = await prisma.user.findUnique({ where: { email: persona.email } });
      if (!user) continue;
      const student = await prisma.institute_students.findUnique({ where: { user_id: user.id } });
      if (!student) continue;
      studentMap.set(persona.email, { personaEmail: persona.email, userId: user.id, studentId: student.id });
    }

    // Diagnostics + Drills + IAs — drills are reused unchanged; diag/IA use real feedback.
    await seedDiagnosticsAI(studentMap, opts.dryRun);
    await seedDrills(studentMap, opts.dryRun);
    await seedIASessionsAI(studentMap, opts.dryRun);

    console.log('═══════════════════════════════════════════════════');
    console.log('  AI seeder complete!');
    if (!opts.dryRun) {
      console.log('  Open the instructor dashboard to verify the real feedback.');
    }
    console.log('═══════════════════════════════════════════════════\n');
  } catch (err) {
    console.error('\n[runSeedAI] FATAL ERROR:', err);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();
