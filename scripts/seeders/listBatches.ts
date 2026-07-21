/**
 * Helper: list every IELTS batch in the database with its UUID.
 *
 * After you create a batch on the TestCrack website, run this to find the
 * batch UUID to pass to the seeder's --batch flag. Read-only — writes nothing.
 *
 * Usage:
 *   npx ts-node --project tsconfig.dev.json scripts/seeders/listBatches.ts
 *   npx ts-node --project tsconfig.dev.json scripts/seeders/listBatches.ts --name "Demo"
 */

import { Command } from 'commander';
import prisma from '../../src/lib/prisma';

const program = new Command();
program
  .name('listBatches')
  .description('List IELTS batches with their UUIDs (read-only)')
  .option('--name <substring>', 'Filter by batch name (case-insensitive contains)');
program.parse(process.argv);
const opts = program.opts<{ name?: string }>();

async function main() {
  const batches = await prisma.ielts_batches.findMany({
    where: opts.name ? { name: { contains: opts.name, mode: 'insensitive' } } : undefined,
    orderBy: { created_at: 'desc' },
    include: {
      institutes: { select: { name: true } },
      _count: { select: { ielts_batch_students: true } },
    },
  });

  if (batches.length === 0) {
    console.log('No batches found. Create one on the TestCrack website first.');
    return;
  }

  console.log(`\nFound ${batches.length} batch(es):\n`);
  for (const b of batches) {
    console.log(`  ${b.name}  [${b.status}]`);
    console.log(`    UUID:      ${b.id}`);
    console.log(`    Institute: ${b.institutes?.name ?? 'unknown'}`);
    console.log(`    Students:  ${b._count.ielts_batch_students}`);
    console.log(`    Created:   ${b.created_at.toISOString().split('T')[0]}\n`);
  }

  console.log('Copy the UUID of your target batch and run:');
  console.log(`  npx ts-node --project tsconfig.dev.json scripts/seeders/runSeed.ts --batch <UUID> --dry-run\n`);
}

main()
  .catch((e) => { console.error('[listBatches] ERROR:', e); process.exit(1); })
  .finally(() => prisma.$disconnect());
