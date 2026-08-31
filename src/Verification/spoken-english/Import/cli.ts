/**
 * Importer CLI — writes verified Spoken English drill questions into `drill_questions`.
 *
 * Forked from Import/cli.ts (the IELTS importer CLI). Reuses Import/target.ts UNCHANGED
 * (it's exam-agnostic — only cares about which database, not which exam). Everything
 * else mirrors the IELTS CLI's safety model exactly:
 *
 *   npm run se:drills:import -- --target dev --level b1                 (dry run)
 *   npm run se:drills:import -- --target dev --level b1 --confirm --layer2-reviewed
 *
 * Every write is scoped to `exam_id = 'spoken_english'` — both when reading existing
 * rows (so an identical source_key under a hypothetical other exam is never mistaken
 * for ours) and when writing (via Import/importer.ts's toImportRow).
 *
 * Exit codes: identical meaning to the IELTS importer.
 *   0  clean — dry run completed, or writes applied with no errors
 *   1  something failed: a gate blocked a file, or a write errored
 *   2  nothing was written because it was a dry run and changes are pending
 *   3  usage error, no files matched, or a crash
 */

import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import { Command } from 'commander';
import { findCsvFiles, loadDrillCsv } from '../question-banks/shared/csvLoader';
import { drillsDirFor, parseLevel } from '../question-banks/shared/drillsLayout';
import { verifyFile, fileFindingsFlat } from '../question-banks/layer1-verifier/verify';
import { countActions, planImport, EXAM_ID, type ExistingRow, type RowPlan } from './importer';
import {
  parseTarget,
  redactUrl,
  resolveTarget,
  TargetError,
  type ResolvedTarget,
} from '../../../Import/target';

export const EXIT_OK = 0;
export const EXIT_FAILED = 1;
export const EXIT_PENDING = 2;
export const EXIT_USAGE = 3;

/** Default input: the key-assignment tool's output, which is the only tagged source. */
const TAGGED_BASE = path.resolve(__dirname, '..', 'results', 'key-assignment-tool');

const DEFAULT_EXPECTED_ROWS = 12;

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

  const sources = [
    opts.dir !== undefined ? '--dir' : null,
    opts.level !== undefined ? '--level' : null,
    explicit.length > 0 ? '--file/positional' : null,
  ].filter((s): s is string => s !== null);

  if (sources.length !== 1) {
    throw new UsageError(
      sources.length === 0
        ? 'Choose what to import: --level <name>, --dir <path>, or --file <path>.'
        : `Pick one way to choose files — got ${sources.join(' and ')}.`,
    );
  }

  if (explicit.length > 0) {
    const missing = explicit.filter(p => !fs.existsSync(p));
    if (missing.length > 0) {
      throw new UsageError(`These files do not exist:\n  ${missing.join('\n  ')}`);
    }
    return explicit.map(p => path.resolve(p));
  }

  let dir: string;
  if (opts.level !== undefined) {
    const level = parseLevel(opts.level);
    if (level === null) {
      throw new UsageError(
        `--level must be a1, a2, b1, b2 or c1 — got "${opts.level}".`,
      );
    }
    // Tagged output, NOT the raw drills/ folder: raw files have no source_key.
    dir = path.join(TAGGED_BASE, level.toLowerCase());
    if (!fs.existsSync(dir)) {
      throw new UsageError(
        `No tagged files for ${level.toLowerCase()} at:\n  ${dir}\n` +
          `  Run: npm run se:drills:assign-keys -- --level ${level.toLowerCase()}\n` +
          `  (the raw CSVs in ${drillsDirFor(level)} have no source_key and cannot be imported)`,
      );
    }
  } else {
    dir = path.resolve(opts.dir as string);
    if (!fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) {
      throw new UsageError(`Not a directory: ${dir}`);
    }
  }

  const found = findCsvFiles(dir, opts.match);
  if (found.length === 0) {
    throw new UsageError(
      `No .csv files found in ${dir}` +
        (opts.match ? ` matching "${opts.match}"` : '') +
        '.\n  Nothing was imported — this is an error, not a pass.',
    );
  }
  return found;
}

function positiveInt(raw: string, context: string): number {
  const n = Number(raw);
  if (!Number.isInteger(n) || n <= 0) {
    throw new UsageError(`${context} must be a positive whole number, got "${raw}".`);
  }
  return n;
}

/** Same `--expected` grammar as Layer 1, so one habit covers both tools. */
function expectedFor(filePath: string, raw: string): number {
  if (!raw.includes('=')) return positiveInt(raw, '--expected');

  let fallback = DEFAULT_EXPECTED_ROWS;
  const byLevel = new Map<string, number>();
  for (const part of raw.split(',')) {
    const [k, v] = part.split('=');
    if (v === undefined) {
      throw new UsageError(`--expected part "${part.trim()}" must look like level=count.`);
    }
    const key = k.trim().toLowerCase();
    const count = positiveInt(v.trim(), `--expected ${key}`);
    if (key === 'else' || key === 'default') fallback = count;
    else byLevel.set(key, count);
  }
  const lower = filePath.toLowerCase();
  for (const [level, count] of byLevel) {
    if (lower.includes(`${path.sep}${level}${path.sep}`) || lower.includes(`/${level}/`)) {
      return count;
    }
  }
  return fallback;
}

interface PrismaLike {
  drillQuestion: {
    findMany(args: {
      where: { source_key: { in: string[] }; exam_id: string };
      select: Record<string, true>;
    }): Promise<ExistingRow[]>;
    upsert(args: { where: { source_key: string }; create: unknown; update: unknown }): Promise<unknown>;
    count(args?: unknown): Promise<number>;
  };
  $disconnect(): Promise<void>;
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
    .name('se:drills:import')
    .description(
      'Imports verified, tagged Spoken English drill questions into drill_questions ' +
        `(exam_id='${EXAM_ID}'). Upserts on source_key. Dry run unless --confirm is passed.`,
    )
    .requiredOption('--target <dev|prod>', 'Which database to write to. Required.')
    .option('--database-url <url>', 'Explicit connection string, still name-checked')
    .option('--level <name>', 'Import the tagged files for one CEFR level (a1|a2|b1|b2|c1)')
    .option('--dir <path>', 'Import every .csv in this directory')
    .option('-f, --file <path>', 'A CSV to import; repeat for multiple', collect, [])
    .option('--match <text>', 'Only files whose name contains this text')
    .option(
      '--expected <n>',
      'Expected rows per file for the Layer 1 gate; a number or "b1=6,else=12"',
      String(DEFAULT_EXPECTED_ROWS),
    )
    .option('--confirm', 'Actually write. Without this, nothing is committed.')
    .option(
      '--layer2-reviewed',
      'Assert that the Layer 2 content report for these files has been reviewed. ' +
        'Required for a real write; Layer 2 cannot be re-run for free.',
    )
    .option('--no-gate', 'Skip the inline Layer 1 gate. Unsafe; for diagnosis only.')
    .argument('[files...]', 'CSV paths, as an alternative to --file')
    .allowExcessArguments(false);

  program.parse(process.argv);
  const opts = program.opts<CliOptions>();

  const target = parseTarget(opts.target as string);
  if (target === null) {
    throw new UsageError(`--target must be "dev" or "prod" — got "${opts.target}".`);
  }

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
        '  Layer 2 checks whether the ANSWERS are correct, and this tool cannot re-run it\n' +
        '  (it costs API calls). Review the Layer 2 report for these files, then pass\n' +
        '  --layer2-reviewed to assert that you did.\n' +
        '    npm run se:drills:judge -- --level <level>',
    );
  }

  console.log('═══════════════════════════════════════════════════════════');
  console.log(`  Importer — drill_questions (exam_id='${EXAM_ID}')`);
  console.log(`  Target:   ${target.toUpperCase()}  (${resolved.databaseName})`);
  console.log(`  From:     ${resolved.source}  ${redactUrl(resolved.url)}`);
  console.log(`  Files:    ${files.length}`);
  console.log(`  Mode:     ${confirm ? 'WRITE (--confirm)' : 'DRY RUN — nothing will be written'}`);
  if (opts.gate === false) console.log('  Gate:     DISABLED (--no-gate) — Layer 1 is not being run');
  if (target === 'prod' && confirm) {
    console.log('');
    console.log('  *** WRITING TO PRODUCTION ***');
    console.log('  Confirm a fresh backup of testcrack_db_main exists before continuing.');
  }
  console.log('═══════════════════════════════════════════════════════════\n');

  const mod = (await import('../../../lib/prisma.js')) as unknown as { default: PrismaLike };
  const prisma = mod.default;

  const reports: FileReport[] = [];
  let sawFailure = false;

  try {
    for (const filePath of files) {
      const loaded = loadDrillCsv(filePath);
      const report: FileReport = {
        fileName: loaded.fileName,
        plans: [],
        errors: [],
        written: { inserted: 0, updated: 0, unchanged: 0, failed: 0 },
      };

      // --- gate ---
      if (opts.gate !== false) {
        const verdict = verifyFile(filePath, {
          expectedRowCount: expectedFor(filePath, opts.expected),
          requireSourceKey: true,
        });
        if (verdict.outcome === 'fail') {
          const codes = [...new Set(fileFindingsFlat(verdict).filter(f => f.severity === 'fail').map(f => f.code))];
          report.gateBlocked =
            `Layer 1 FAILED: ${codes.join(', ')}. Fix these and re-run — ` +
            `nothing from this file was imported.`;
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

      // --- plan ---
      const keys = loaded.rows.map(r => r.source_key?.trim()).filter((k): k is string => Boolean(k));
      const existingRows =
        keys.length === 0
          ? []
          : await prisma.drillQuestion.findMany({
              where: { source_key: { in: keys }, exam_id: EXAM_ID },
              select: {
                source_key: true,
                skill: true,
                sub_skill: true,
                level: true,
                drill_type: true,
                prompt_text: true,
                options: true,
                correct_answer: true,
                explanation: true,
                exam_id: true,
              },
            });
      const existingByKey = new Map(existingRows.map(r => [r.source_key, r]));

      const plan = planImport(loaded.rows, existingByKey);
      report.plans = plan.plans;
      report.errors = plan.errors;
      if (plan.errors.length > 0) sawFailure = true;

      // --- write ---
      if (confirm) {
        for (const p of plan.plans) {
          if (p.action === 'unchanged') {
            report.written.unchanged += 1;
            continue;
          }
          const { line: _line, ...data } = p.row;
          try {
            await prisma.drillQuestion.upsert({
              where: { source_key: p.row.source_key },
              // is_active only on create: never resurrect a deliberately retired question.
              create: { ...data, is_active: true },
              update: {
                prompt_text: data.prompt_text,
                options: data.options,
                correct_answer: data.correct_answer,
                explanation: data.explanation,
                drill_type: data.drill_type,
                skill: data.skill,
                sub_skill: data.sub_skill,
                level: data.level,
                exam_id: data.exam_id,
                updated_at: new Date(),
              },
            });
            if (p.action === 'insert') report.written.inserted += 1;
            else report.written.updated += 1;
          } catch (err) {
            report.written.failed += 1;
            report.errors.push(
              `line ${p.row.line} (${p.row.source_key}): write failed — ` +
                (err instanceof Error ? err.message.split('\n')[0] : String(err)),
            );
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

function printReport(
  reports: FileReport[],
  ctx: { confirm: boolean; target: string; sawFailure: boolean },
): number {
  const totals = { insert: 0, update: 0, unchanged: 0 };
  const written = { inserted: 0, updated: 0, unchanged: 0, failed: 0 };
  let blocked = 0;
  let errorCount = 0;

  for (const r of reports) {
    if (r.gateBlocked !== undefined) {
      blocked += 1;
      console.log(`  [BLOCKED] ${r.fileName}`);
      console.log(`            ${r.gateBlocked}\n`);
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
    console.log(
      `            ${counts.insert} to insert, ${counts.update} to update, ` +
        `${counts.unchanged} unchanged` +
        (r.errors.length > 0 ? `, ${r.errors.length} error(s)` : ''),
    );

    // Show which fields differ, so an update is reviewable rather than opaque.
    const updates = r.plans.filter(p => p.action === 'update');
    for (const u of updates.slice(0, 5)) {
      console.log(`              ~ ${u.row.source_key}: ${u.changed.join(', ')}`);
    }
    if (updates.length > 5) console.log(`              ... and ${updates.length - 5} more updates`);

    for (const e of r.errors.slice(0, 5)) console.log(`              ! ${e}`);
    if (r.errors.length > 5) console.log(`              ... and ${r.errors.length - 5} more errors`);
    console.log();
  }

  console.log('───────────────────────────────────────────────────────────');
  if (ctx.confirm) {
    console.log(
      `  WROTE to ${ctx.target}:  ${written.inserted} inserted, ${written.updated} updated, ` +
        `${written.unchanged} unchanged (skipped), ${written.failed} failed`,
    );
  } else {
    console.log(
      `  WOULD write: ${totals.insert} inserted, ${totals.update} updated, ` +
        `${totals.unchanged} unchanged (skipped)`,
    );
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
    console.log(
      `  RESULT: dry run only. Re-run with --confirm --layer2-reviewed to apply ${pending} change(s).`,
    );
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
