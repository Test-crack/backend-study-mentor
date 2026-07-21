/**
 * Wipe-only helper: delete every seeded student and ALL their data, without
 * re-seeding. Use this when you want the seeded cohort gone for good.
 *
 * Usage:
 *   # 1. PREVIEW — lists exactly which accounts would be deleted, deletes nothing:
 *   npx ts-node --project tsconfig.dev.json scripts/seeders/cleanSeed.ts
 *
 *   # 2. DELETE — only after you've reviewed the preview:
 *   npx ts-node --project tsconfig.dev.json scripts/seeders/cleanSeed.ts --confirm
 *
 * SAFETY: only matches accounts whose email ends with @seed.testcrack.dev.
 * Real students are never touched. Cascades remove institute_students, batch
 * enrollment, diagnostics, drills, and IA sessions automatically.
 */

import { Command } from 'commander';
import prisma from '../../src/lib/prisma';
import { cleanStudents } from './createStudents';
import { dbHostLabel } from './utils';

const program = new Command();
program
  .name('cleanSeed')
  .description('Delete seeded @seed.testcrack.dev students (preview unless --confirm)')
  .option('--confirm', 'Actually delete. Without this, only previews.', false);
program.parse(process.argv);
const opts = program.opts<{ confirm: boolean }>();

async function main() {
  console.log('═══════════════════════════════════════════════════');
  console.log('  TestCrack Seed Cleanup');
  console.log(`  Database: ${dbHostLabel()}`);
  console.log(`  Mode:     ${opts.confirm ? 'DELETE' : 'PREVIEW (re-run with --confirm to delete)'}`);
  console.log('═══════════════════════════════════════════════════');
  console.log('  ⚠ Confirm the Database line above is the one you intend before deleting.');

  await cleanStudents(!opts.confirm);
}

main()
  .catch((e) => { console.error('[cleanSeed] ERROR:', e); process.exit(1); })
  .finally(() => prisma.$disconnect());
