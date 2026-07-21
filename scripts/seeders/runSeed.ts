/**
 * TC-06: Main seeder entry point.
 *
 * Step 1 — find your batch UUID (create the batch on the TestCrack website first):
 *   npx ts-node --project tsconfig.dev.json scripts/seeders/listBatches.ts
 *
 * Step 2 — seed (always --dry-run first, then for real):
 *   npx ts-node --project tsconfig.dev.json scripts/seeders/runSeed.ts --batch <batchId> --dry-run
 *   npx ts-node --project tsconfig.dev.json scripts/seeders/runSeed.ts --batch <batchId>
 *   npx ts-node --project tsconfig.dev.json scripts/seeders/runSeed.ts --batch <batchId> --clean
 *
 * NOTE: ts-node is one word; the path has no spaces around the slashes.
 * SAFETY: --clean only deletes accounts whose email ends with @seed.testcrack.dev.
 * It never touches real user data.
 */

import { Command } from 'commander';
import prisma from '../../src/lib/prisma';
import { PERSONAS } from './personas';
import { createStudents, cleanStudents, type StudentRecord } from './createStudents';
import { seedDiagnostics } from './seedDiagnostics';
import { seedDrills } from './seedDrills';
import { seedIASessions } from './seedIASessions';
import { dbHostLabel } from './utils';

const program = new Command();

program
  .name('runSeed')
  .description('Seed 12 student personas into TestCrack staging database')
  .requiredOption('--batch <batchId>', 'UUID of the target IELTS batch (get from Sarthak)')
  .option('--dry-run', 'Log what would be inserted without writing to DB', false)
  .option('--clean', 'Delete all seeded records before re-running', false);

program.parse(process.argv);
const opts = program.opts<{ batch: string; dryRun: boolean; clean: boolean }>();

async function main() {
  console.log('═══════════════════════════════════════════════════');
  console.log('  TestCrack Persona Seeder');
  console.log(`  Database: ${dbHostLabel()}`);
  console.log(`  Batch: ${opts.batch}`);
  console.log(`  Mode:  ${opts.dryRun ? 'DRY-RUN' : opts.clean ? 'CLEAN + SEED' : 'SEED'}`);
  console.log('═══════════════════════════════════════════════════\n');

  try {
    // ── Clean phase ─────────────────────────────────────────────────────────
    if (opts.clean) {
      await cleanStudents();
    }

    if (opts.dryRun) {
      console.log('DRY-RUN MODE: No data will be written.\n');
    }

    // ── Step 1: Create users + enroll in institute + batch ───────────────────
    const studentRecords: StudentRecord[] = await createStudents(opts.batch, opts.dryRun);

    if (studentRecords.length === 0 && !opts.dryRun) {
      console.log('[runSeed] No new students created. All personas may already exist.');
    }

    // Build a lookup map: email → StudentRecord
    // Also include any pre-existing students that were skipped
    const studentMap = new Map<string, StudentRecord>(
      studentRecords.map((r) => [r.personaEmail, r])
    );

    // For pre-existing personas that createStudents skipped, look them up now
    // so downstream seeders can still find their studentId.
    for (const persona of PERSONAS) {
      if (studentMap.has(persona.email)) continue;
      const user = await prisma.user.findUnique({ where: { email: persona.email } });
      if (!user) continue;
      const student = await prisma.institute_students.findUnique({ where: { user_id: user.id } });
      if (!student) continue;
      studentMap.set(persona.email, { personaEmail: persona.email, userId: user.id, studentId: student.id });
    }

    // ── Step 2: Diagnostic assessments ──────────────────────────────────────
    await seedDiagnostics(studentMap, opts.dryRun);

    // ── Step 3: Drill sessions ───────────────────────────────────────────────
    await seedDrills(studentMap, opts.dryRun);

    // ── Step 4: IA sessions ──────────────────────────────────────────────────
    await seedIASessions(studentMap, opts.dryRun);

    console.log('═══════════════════════════════════════════════════');
    console.log('  Seeder complete!');
    if (!opts.dryRun) {
      console.log('  Open the staging instructor dashboard to verify.');
    }
    console.log('═══════════════════════════════════════════════════\n');
  } catch (err) {
    console.error('\n[runSeed] FATAL ERROR:', err);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();
