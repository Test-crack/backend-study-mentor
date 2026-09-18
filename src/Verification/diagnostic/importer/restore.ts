/**
 * Restores a diagnostic_questions set from a backup JSON file written by
 * cli.ts before an update — the rollback half of the update-in-place import.
 *
 * Same safety pattern as cli.ts: dry-run by default, --confirm to write,
 * explicit `select`/`data` field lists so this tool is unaffected by
 * unrelated schema/DB drift (see cli.ts's comment on this).
 *
 *   npm run diagnostic:import:restore -- --backup ./Verification/diagnostic/results/set-backups/RD_A_01--....json                (dry run)
 *   npm run diagnostic:import:restore -- --backup ./Verification/diagnostic/results/set-backups/RD_A_01--....json --confirm      (writes)
 *
 * Exit codes: 0 written, 2 dry run only (nothing written), 3 usage error.
 */

import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import { Command } from 'commander';
import prisma from '../../../lib/prisma';
import { parseBackup, assertRestorable, RestorePlanError } from './restorer';

class UsageError extends Error {}

interface CliOptions {
  backup: string;
  confirm?: boolean;
}

function truncate(s: string, n = 70): string {
  return s.length <= n ? s : `${s.slice(0, n)}…`;
}

async function main(): Promise<void> {
  const program = new Command();
  program
    .name('diagnostic:import:restore')
    .requiredOption('--backup <path>', 'the backup JSON file written by the importer before its update')
    .option('--confirm', 'actually write. Without this, nothing is committed.')
    .parse(process.argv);

  const opts = program.opts<CliOptions>();

  try {
    if (!fs.existsSync(opts.backup)) {
      throw new UsageError(`Backup file does not exist: ${opts.backup}`);
    }

    const { setId, rows } = parseBackup(fs.readFileSync(path.resolve(opts.backup), 'utf8'), opts.backup);

    console.log('═══════════════════════════════════════════════════════════');
    console.log('  Diagnostic Question Restore (from backup)');
    console.log(`  Target set: ${setId}   ${rows.length} row(s)`);
    console.log(`  Mode: ${opts.confirm ? 'WRITE (--confirm)' : 'DRY RUN — nothing will be written'}`);
    console.log('═══════════════════════════════════════════════════════════\n');

    // Confirm the live rows still have the ids this backup expects, so a restore
    // against an already-changed-again set fails loudly instead of silently
    // overwriting whatever's there now with possibly-stale ids.
    const liveIds = await prisma.diagnosticQuestion.findMany({
      where: { set_id: setId },
      select: { id: true },
    });
    assertRestorable({ setId, rows }, new Set(liveIds.map(r => r.id)));

    for (const r of rows) {
      console.log(`  [seq ${r.sequence}] restoring: "${truncate(r.prompt_text)}"`);
    }

    if (!opts.confirm) {
      console.log(`\nDry run only. Re-run with --confirm to restore ${rows.length} row(s) in "${setId}".`);
      process.exit(2);
    }

    await prisma.$transaction(
      rows.map(r =>
        prisma.diagnosticQuestion.update({
          where: { id: r.id },
          data: {
            question_type: r.question_type,
            prompt_text: r.prompt_text,
            options: r.options as any,
            correct_answer: r.correct_answer,
            min_words: r.min_words,
            passage_text: r.passage_text,
            audio_url: r.audio_url,
            created_at: new Date(r.created_at),
          },
          select: { id: true },
        }),
      ),
    );

    console.log(`\nDone. ${rows.length} row(s) restored in set "${setId}".`);
    process.exit(0);
  } catch (err) {
    if (err instanceof UsageError || err instanceof RestorePlanError) {
      console.error(`Usage error: ${err.message}`);
      process.exit(3);
    }
    console.error('Unexpected error:', err);
    process.exit(3);
  } finally {
    await prisma.$disconnect();
  }
}

main();
