/**
 * Importer — writes verified IA questions into `ia_questions`.
 *
 * The only thing in this pipeline that writes. Upserts on `source_key`.
 * Reuses Import/target.ts unchanged (target resolution is table-agnostic —
 * it only ever inspects a connection string and an env var) rather than
 * duplicating it; Import/importer.ts itself is drills-specific (imports
 * DrillCsvRow, writes drill_type) so it is not reusable here.
 *
 *   npm run ia:import -- --target dev --level beginner            (dry run)
 *   npm run ia:import -- --target dev --level beginner --confirm  (writes)
 *
 * Safety model — identical to drills:import:
 *  - Dry run is the default; writing takes --confirm.
 *  - --target dev|prod is required and name-checked against the resolved connection.
 *  - Layer 1 runs inline as a hard gate, with --require-source-key.
 *  - A real write requires --layer2-reviewed (Layer 2 cannot be re-run for free).
 *
 * Exit codes: 0 clean, 1 failed, 2 pending (dry run with changes), 3 usage error.
 */

import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import { Command } from 'commander';
import { findCsvFiles, loadIACsv } from '../shared/csvLoader';
import { iaDirFor, parseDifficulty } from '../shared/iaLayout';
import { verifyFile, fileFindingsFlat } from '../layer1-verifier/verify';
import { countActions, planImport, type ExistingRow, type RowPlan } from './importer';
import { parseTarget, redactUrl, resolveTarget, TargetError, type ResolvedTarget } from '../../../../Import/target';
import prisma from '../../../../lib/prisma';

export const EXIT_OK = 0;
export const EXIT_FAILED = 1;
export const EXIT_PENDING = 2;
export const EXIT_USAGE = 3;

const TAGGED_BASE = path.resolve(__dirname, '..', '..', 'results', 'key-assignment-tool');
const DEFAULT_EXPECTED_ROWS = 200;

class UsageError extends Error {}

interface CliOptions {
  target?: string;
  databaseUrl?: string;
  level?: string;
  dir?: string;
  file?: string[];
  match?: string;
  expected: string;
  confirm?: boolean;
  layer2Reviewed?: boolean;
  gate: boolean;
}

function collect(value: string, previous: string[]): string[] {
  return [...previous, value];
}

function resolveInputFiles(opts: CliOptions, positional: string[]): string[] {
  const explicit = [...(opts.file ?? []), ...positional];
  const sources = [opts.dir !== undefined ? '--dir' : null, opts.level !== undefined ? '--level' : null, explicit.length > 0 ? '--file/positional' : null].filter(
    (s): s is string => s !== null,
  );

  if (sources.length !== 1) {
    throw new UsageError(sources.length === 0 ? 'Choose what to import: --level <name>, --dir <path>, or --file <path>.' : `Pick one way to choose files — got ${sources.join(' and ')}.`);
  }

  if (explicit.length > 0) {
    const missing = explicit.filter(p => !fs.existsSync(p));
    if (missing.length > 0) throw new UsageError(`These files do not exist:\n  ${missing.join('\n  ')}`);
    return explicit.map(p => path.resolve(p));
  }

  let dir: string;
  if (opts.level !== undefined) {
    const difficulty = parseDifficulty(opts.level);
    if (difficulty === null) throw new UsageError(`--level must be beginner, intermediate or advanced — got "${opts.level}".`);
    dir = path.join(TAGGED_BASE, difficulty.toLowerCase());
    if (!fs.existsSync(dir)) {
      throw new UsageError(
        `No tagged files for ${difficulty.toLowerCase()} at:\n  ${dir}\n` +
          `  Run: npm run ia:assign-keys -- --level ${difficulty.toLowerCase()}\n` +
          `  (the raw CSVs in ${iaDirFor(difficulty)} have no source_key and cannot be imported)`,
      );
    }
  } else {
    dir = path.resolve(opts.dir as string);
    if (!fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) throw new UsageError(`Not a directory: ${dir}`);
  }

  const found = findCsvFiles(dir, opts.match);
  if (found.length === 0) {
    throw new UsageError(`No .csv files found in ${dir}` + (opts.match ? ` matching "${opts.match}"` : '') + '.\n  Nothing was imported.');
  }
  return found;
}

function positiveInt(raw: string, context: string): number {
  const n = Number(raw);
  if (!Number.isInteger(n) || n <= 0) throw new UsageError(`${context} must be a positive whole number, got "${raw}".`);
  return n;
}

function expectedFor(filePath: string, raw: string): number {
  if (!raw.includes('=')) return positiveInt(raw, '--expected');

  let fallback = DEFAULT_EXPECTED_ROWS;
  const byLevel = new Map<string, number>();
  for (const part of raw.split(',')) {
    const [k, v] = part.split('=');
    if (v === undefined) throw new UsageError(`--expected part "${part.trim()}" must look like level=count.`);
    const key = k.trim().toLowerCase();
    const count = positiveInt(v.trim(), `--expected ${key}`);
    if (key === 'else' || key === 'default') fallback = count;
    else byLevel.set(key, count);
  }
  const lower = filePath.toLowerCase();
  for (const [level, count] of byLevel) {
    if (lower.includes(`${path.sep}${level}${path.sep}`) || lower.includes(`/${level}/`)) return count;
  }
  return fallback;
}

interface FileReport {
  fileName: string;
  gateBlocked?: string;
  plans: RowPlan[];
  errors: string[];
  written: { inserted: number; updated: number; unchanged: number; failed: number };
}

async function main(): Promise<number> {
  const program = new Command();

  program
    .name('ia:import')
    .description('Imports verified, tagged IA questions into ia_questions. Upserts on source_key. Dry run unless --confirm.')
    .requiredOption('--target <dev|prod>', 'Which database to write to. Required.')
    .option('--database-url <url>', 'Explicit connection string, still name-checked')
    .option('--level <name>', 'Import the tagged files for one difficulty')
    .option('--dir <path>', 'Import every .csv in this directory')
    .option('-f, --file <path>', 'A CSV to import; repeat for multiple', collect, [])
    .option('--match <text>', 'Only files whose name contains this text')
    .option('--expected <n>', 'Expected rows per file for the Layer 1 gate', String(DEFAULT_EXPECTED_ROWS))
    .option('--confirm', 'Actually write. Without this, nothing is committed.')
    .option('--layer2-reviewed', 'Assert that the Layer 2 content report for these files has been reviewed.')
    .option('--no-gate', 'Skip the inline Layer 1 gate. Unsafe; for diagnosis only.')
    .argument('[files...]', 'CSV paths, as an alternative to --file')
    .allowExcessArguments(false);

  program.parse(process.argv);
  const opts = program.opts<CliOptions>();

  const target = parseTarget(opts.target as string);
  if (target === null) throw new UsageError(`--target must be "dev" or "prod" — got "${opts.target}".`);

  const files = resolveInputFiles(opts, program.args);
  const confirm = opts.confirm === true;

  let resolved: ResolvedTarget;
  try {
    resolved = resolveTarget(target, process.env, opts.databaseUrl);
  } catch (err) {
    if (err instanceof TargetError) throw new UsageError(err.message);
    throw err;
  }

  if (confirm && opts.layer2Reviewed !== true) {
    throw new UsageError(
      'Refusing to write without --layer2-reviewed.\n' +
        '  Review the Layer 2 report for these files, then pass --layer2-reviewed to assert that you did.\n' +
        '    npm run ia:judge -- --level <level>',
    );
  }

  console.log('═══════════════════════════════════════════════════════════');
  console.log('  Importer — ia_questions');
  console.log(`  Target:   ${target.toUpperCase()}  (${resolved.databaseName})`);
  console.log(`  From:     ${resolved.source}  ${redactUrl(resolved.url)}`);
  console.log(`  Files:    ${files.length}`);
  console.log(`  Mode:     ${confirm ? 'WRITE (--confirm)' : 'DRY RUN — nothing will be written'}`);
  if (opts.gate === false) console.log('  Gate:     DISABLED (--no-gate) — Layer 1 is not being run');
  if (target === 'prod' && confirm) {
    console.log('\n  *** WRITING TO PRODUCTION ***');
    console.log('  Confirm a fresh backup exists before continuing.');
  }
  console.log('═══════════════════════════════════════════════════════════\n');

  const reports: FileReport[] = [];
  let sawFailure = false;

  try {
    for (const filePath of files) {
      const loaded = loadIACsv(filePath);
      const report: FileReport = { fileName: loaded.fileName, plans: [], errors: [], written: { inserted: 0, updated: 0, unchanged: 0, failed: 0 } };

      if (opts.gate !== false) {
        const verdict = verifyFile(filePath, { expectedRowCount: expectedFor(filePath, opts.expected), requireSourceKey: true });
        if (verdict.outcome === 'fail') {
          const codes = [...new Set(fileFindingsFlat(verdict).filter(f => f.severity === 'fail').map(f => f.code))];
          report.gateBlocked = `Layer 1 FAILED: ${codes.join(', ')}. Fix these and re-run — nothing from this file was imported.`;
          reports.push(report);
          sawFailure = true;
          continue;
        }
      }

      if (loaded.fatal) {
        report.gateBlocked = 'file could not be read';
        reports.push(report);
        sawFailure = true;
        continue;
      }

      const keys = loaded.rows.map(r => r.source_key?.trim()).filter((k): k is string => Boolean(k));
      const existingRows =
        keys.length === 0
          ? []
          : await prisma.iAQuestion.findMany({
              where: { source_key: { in: keys } },
              select: {
                source_key: true,
                skill: true,
                sub_skill: true,
                difficulty: true,
                question_type: true,
                passage_id: true,
                passage_text: true,
                audio_url: true,
                prompt_text: true,
                options: true,
                correct_answer: true,
                explanation: true,
                exam_id: true,
              },
            });
      // source_key is nullable schema-wide, but every row here was fetched by
      // `source_key: { in: keys }` (all non-empty strings) — it can never be
      // null in this result set. Same hedge as the controller's toIAExistingRows.
      const existingByKey = new Map(
        existingRows.filter((r): r is typeof r & { source_key: string } => r.source_key !== null).map(r => [r.source_key, r]),
      );

      const plan = planImport(loaded.rows, existingByKey);
      report.plans = plan.plans;
      report.errors = plan.errors;
      if (plan.errors.length > 0) sawFailure = true;

      if (confirm) {
        for (const p of plan.plans) {
          if (p.action === 'unchanged') {
            report.written.unchanged += 1;
            continue;
          }
          const { line: _line, ...data } = p.row;
          try {
            await prisma.iAQuestion.upsert({
              where: { source_key: p.row.source_key },
              create: { ...data, is_active: true } as any,
              update: {
                prompt_text: data.prompt_text,
                options: data.options,
                correct_answer: data.correct_answer,
                explanation: data.explanation,
                passage_id: data.passage_id,
                passage_text: data.passage_text,
                audio_url: data.audio_url,
                question_type: data.question_type,
                exam_id: data.exam_id,
                skill: data.skill,
                sub_skill: data.sub_skill,
                difficulty: data.difficulty,
              } as any,
            });
            if (p.action === 'insert') report.written.inserted += 1;
            else report.written.updated += 1;
          } catch (err) {
            report.written.failed += 1;
            report.errors.push(`line ${p.row.line} (${p.row.source_key}): write failed — ${err instanceof Error ? err.message.split('\n')[0] : String(err)}`);
            sawFailure = true;
          }
        }
      }

      reports.push(report);
    }
  } finally {
    await prisma.$disconnect();
  }

  return printReport(reports, { confirm, target, sawFailure });
}

function printReport(reports: FileReport[], ctx: { confirm: boolean; target: string; sawFailure: boolean }): number {
  const totals = { insert: 0, update: 0, unchanged: 0 };
  const written = { inserted: 0, updated: 0, unchanged: 0, failed: 0 };
  let blocked = 0;
  let errorCount = 0;

  for (const r of reports) {
    if (r.gateBlocked !== undefined) {
      blocked += 1;
      console.log(`  [BLOCKED] ${r.fileName}\n            ${r.gateBlocked}\n`);
      continue;
    }

    const counts = countActions(r.plans);
    totals.insert += counts.insert;
    totals.update += counts.update;
    totals.unchanged += counts.unchanged;
    written.inserted += r.written.inserted;
    written.updated += r.written.updated;
    written.unchanged += r.written.unchanged;
    written.failed += r.written.failed;
    errorCount += r.errors.length;

    console.log(`  [OK]      ${r.fileName}`);
    console.log(`            ${counts.insert} to insert, ${counts.update} to update, ${counts.unchanged} unchanged` + (r.errors.length > 0 ? `, ${r.errors.length} error(s)` : ''));

    const updates = r.plans.filter(p => p.action === 'update');
    for (const u of updates.slice(0, 5)) console.log(`              ~ ${u.row.source_key}: ${u.changed.join(', ')}`);
    if (updates.length > 5) console.log(`              ... and ${updates.length - 5} more updates`);

    for (const e of r.errors.slice(0, 5)) console.log(`              ! ${e}`);
    if (r.errors.length > 5) console.log(`              ... and ${r.errors.length - 5} more errors`);
    console.log();
  }

  console.log('───────────────────────────────────────────────────────────');
  if (ctx.confirm) {
    console.log(`  WROTE to ${ctx.target}:  ${written.inserted} inserted, ${written.updated} updated, ${written.unchanged} unchanged (skipped), ${written.failed} failed`);
  } else {
    console.log(`  WOULD write: ${totals.insert} inserted, ${totals.update} updated, ${totals.unchanged} unchanged (skipped)`);
  }
  if (blocked > 0) console.log(`  BLOCKED by the gate: ${blocked} file(s) — nothing imported from them`);
  if (errorCount > 0) console.log(`  Errors: ${errorCount}`);

  if (ctx.sawFailure) {
    console.log('  RESULT: FAILURES — see above. Fix them and re-run.');
    return EXIT_FAILED;
  }
  if (!ctx.confirm) {
    const pending = totals.insert + totals.update;
    if (pending === 0) {
      console.log('  RESULT: nothing to do — the database already matches these files.');
      return EXIT_OK;
    }
    console.log(`  RESULT: dry run only. Re-run with --confirm --layer2-reviewed to apply ${pending} change(s).`);
    return EXIT_PENDING;
  }
  console.log('  RESULT: done. Run this exact command again — it must report 0 inserted, 0 updated.');
  return EXIT_OK;
}

main()
  .then(code => {
    process.exitCode = code;
  })
  .catch((err: unknown) => {
    if (err instanceof UsageError) {
      console.error(`\nUsage error: ${err.message}\n`);
    } else {
      console.error('\nThe importer crashed. Treat the database state as UNKNOWN and check it.\n');
      console.error(err);
    }
    process.exitCode = EXIT_USAGE;
  });
