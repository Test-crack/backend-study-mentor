/**
 * Diagnostic Question Importer — updates an EXISTING diagnostic_questions
 * set IN PLACE with newly authored, already-verified content.
 *
 * Deliberately an UPDATE, not an INSERT: content is being replaced set by set
 * inside the existing 30/45/30/30-question pools, not appended alongside
 * them. `set_id` and `level` are never touched — level especially, since the
 * app still filters question selection by level until the difficulty
 * disconnect ships; relabeling a set's level here could starve a tier down to
 * zero active sets, which is a real 404 lockout for any student on that tier
 * (confirmed in diagnosticController.ts's getDiagnosticQuestionsBySkill).
 *
 * Content columns change: question_type, prompt_text, options,
 * correct_answer, min_words, passage_text, audio_url — plus `created_at`,
 * reset to the moment of import, since this is meant to read as a genuinely
 * new question going live, not an edit of the old one. The staging CSV's own
 * `transcript` column is never written anywhere — that column doesn't exist
 * on diagnostic_questions; transcript only ever existed to ground Layer 2's
 * AI judging.
 *
 * The existing rows are backed up to a timestamped JSON file before being
 * overwritten (same pattern as Import/rebuildBucket.ts) — an update-in-place
 * has no other rollback path once committed.
 *
 *   npm run diagnostic:import -- --file ./batch.csv --set-id LD_A_01                (dry run)
 *   npm run diagnostic:import -- --file ./batch.csv --set-id LD_A_01 --confirm      (writes)
 *
 * A staging file may bundle several sets together (our Reading/Writing/
 * Speaking batches do) — pass --source-set-id to pick just one of them out
 * before matching against --set-id. Omit it when the file only has one set.
 *
 * Exit codes: 0 written, 2 dry run only (nothing written), 3 usage error.
 */

import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import { Command } from 'commander';
import prisma from '../../../lib/prisma';
import { loadDiagnosticCsv } from '../question-banks/shared/csvLoader';
import { validateBatch, diffRows, ImportPlanError } from './importer';

const BACKUP_DIR = path.resolve(__dirname, '..', 'results', 'set-backups');

class UsageError extends Error {}

interface CliOptions {
  file: string;
  setId: string;
  sourceSetId?: string;
  audioUrlPrefix: string;
  confirm?: boolean;
}

function truncate(s: string, n = 70): string {
  return s.length <= n ? s : `${s.slice(0, n)}…`;
}

async function main(): Promise<void> {
  const program = new Command();
  program
    .name('diagnostic:import')
    .requiredOption('--file <path>', 'the verified staging CSV to import')
    .requiredOption('--set-id <id>', 'the EXISTING diagnostic_questions set_id to update in place')
    .option('--source-set-id <id>', 'which set_id to pull out of the staging file, when it bundles more than one')
    .option('--audio-url-prefix <prefix>', 'path prefix prepended to audio_file to build audio_url', '/diagnostics/audio/')
    .option('--confirm', 'actually write. Without this, nothing is committed.')
    .parse(process.argv);

  const opts = program.opts<CliOptions>();

  try {
    if (!fs.existsSync(opts.file)) {
      throw new UsageError(`File does not exist: ${opts.file}`);
    }

    const loaded = loadDiagnosticCsv(path.resolve(opts.file));
    if (loaded.fatal) {
      throw new UsageError(
        `Staging CSV could not be read cleanly (${loaded.findings.map(f => f.code).join(', ')}). ` +
          `Run diagnostic:verify on it first — this tool does not re-check structure.`,
      );
    }

    // Explicit `select` — not just the fields we happen to use, but a hedge against
    // schema/DB drift from unrelated in-flight work (e.g. a new column added to the
    // Prisma schema before its migration has actually landed on this DB). Letting
    // Prisma select every model field by default would make this tool fail on any
    // such drift, even though nothing we do here touches those columns.
    const existing = await prisma.diagnosticQuestion.findMany({
      where: { set_id: opts.setId },
      orderBy: { sequence: 'asc' },
      select: {
        id: true,
        set_id: true,
        sequence: true,
        skill: true,
        level: true,
        question_type: true,
        prompt_text: true,
        options: true,
        correct_answer: true,
        min_words: true,
        passage_text: true,
        audio_url: true,
        created_at: true,
      },
    });

    const stagedRows = validateBatch(loaded.rows, existing, {
      setId: opts.setId,
      sourceSetId: opts.sourceSetId,
      fileLabel: opts.file,
    });

    const skill = existing[0].skill;
    const level = existing[0].level;

    console.log('═══════════════════════════════════════════════════════════');
    console.log('  Diagnostic Question Importer (update-in-place)');
    console.log(`  Target set: ${opts.setId}   skill=${skill}   level=${level} (preserved, not changed)`);
    console.log(`  Mode: ${opts.confirm ? 'WRITE (--confirm)' : 'DRY RUN — nothing will be written'}`);
    console.log('═══════════════════════════════════════════════════════════\n');

    // One shared timestamp for every row in this set, so a fresh-start batch reads
    // as one coherent moment rather than N microseconds apart.
    const importedAt = new Date();

    const updates = diffRows(existing, stagedRows, { audioUrlPrefix: opts.audioUrlPrefix, importedAt });

    for (const u of updates) {
      console.log(`  [seq ${u.sequence}] ${u.before.question_type} -> ${u.after.question_type}`);
      console.log(`    old: "${truncate(u.before.prompt_text)}"`);
      console.log(`    new: "${truncate(u.after.prompt_text)}"\n`);
    }

    if (!opts.confirm) {
      console.log(`Dry run only. Re-run with --confirm to apply ${updates.length} update(s) to "${opts.setId}".`);
      process.exit(2);
    }

    fs.mkdirSync(BACKUP_DIR, { recursive: true });
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupPath = path.join(BACKUP_DIR, `${opts.setId}--${stamp}.json`);
    fs.writeFileSync(backupPath, JSON.stringify(existing, null, 2), 'utf8');
    console.log(`Backup: ${existing.length} row(s) -> ${backupPath}\n`);

    await prisma.$transaction(
      updates.map(u => prisma.diagnosticQuestion.update({ where: { id: u.id }, data: u.after, select: { id: true } })),
    );

    console.log(`Done. ${updates.length} row(s) updated in set "${opts.setId}".`);
    console.log(`Rollback: re-write the pre-update values from ${backupPath} if this was wrong.`);
    process.exit(0);
  } catch (err) {
    if (err instanceof UsageError || err instanceof ImportPlanError) {
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
