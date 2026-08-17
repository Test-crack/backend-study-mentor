/**
 * Layer 1 — Diagnostic Question Staging CSV Verifier (structural, read-only).
 *
 * Checks a new diagnostic-question batch before anything imports it into
 * `diagnostic_questions`. Reads the staging CSV, writes one colored .xlsx
 * report. Never connects to the database, never calls an AI.
 *
 *   npm run diagnostic:verify -- --file "./new-batch.csv"
 *   npm run diagnostic:verify -- --file "./new-batch.csv" --expected 10
 *
 * Exit codes:
 *   0  every file passed clean
 *   1  at least one HARD FAILURE — do not import
 *   2  no failures, but warnings need human review before importing
 *   3  usage error, no files matched, or an unexpected crash
 */

import fs from 'fs';
import path from 'path';
import { Command } from 'commander';
import { findCsvFiles } from '../shared/csvLoader';
import { writeRunReport } from '../shared/excelReport';
import { allFindings, verifyRun } from './verify';
import type { ExpectedSpec, Finding, FileResult, RowOutcome, RunResult } from '../shared/types';

export const EXIT_CLEAN = 0;
export const EXIT_FAILURES = 1;
export const EXIT_WARNINGS = 2;
export const EXIT_USAGE = 3;

const RESULTS_DIR = path.resolve(__dirname, '..', '..', 'results', 'layer1-verifier');

const MARK: Record<RowOutcome, string> = { pass: 'PASS', warn: 'WARN', fail: 'FAIL' };

interface CliOptions {
  dir?: string;
  file?: string[];
  expected?: string;
  out?: string;
  quiet?: boolean;
}

function collect(value: string, previous: string[]): string[] {
  return [...previous, value];
}

class UsageError extends Error {}

function positiveInt(raw: string, context: string): number {
  const n = Number(raw);
  if (!Number.isInteger(n) || n <= 0) {
    throw new UsageError(`${context} must be a positive whole number, got "${raw}".`);
  }
  return n;
}

function parseExpected(raw: string | undefined): ExpectedSpec | null {
  if (raw === undefined) return null;
  return { count: positiveInt(raw, '--expected') };
}

function resolveInputFiles(opts: CliOptions, positional: string[]): string[] {
  const explicit = [...(opts.file ?? []), ...positional];

  const sources = [opts.dir !== undefined ? '--dir' : null, explicit.length > 0 ? '--file/positional' : null].filter(
    (s): s is string => s !== null,
  );
  if (sources.length > 1) {
    throw new UsageError(`Pick one way to choose files — got ${sources.join(' and ')}.`);
  }

  if (explicit.length > 0) {
    const missing = explicit.filter(p => !fs.existsSync(p));
    if (missing.length > 0) throw new UsageError(`These files do not exist:\n  ${missing.join('\n  ')}`);
    return explicit.map(p => path.resolve(p));
  }

  const dir = opts.dir !== undefined ? path.resolve(opts.dir) : process.cwd();
  if (!fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) {
    throw new UsageError(`Not a directory: ${dir}`);
  }

  const found = findCsvFiles(dir);
  if (found.length === 0) {
    throw new UsageError(`No .csv files found in ${dir}.\n  Nothing was checked — this is an error, not a pass.`);
  }
  return found;
}

/** A path with a file extension (e.g. `.xlsx`) is treated as the exact output
 * file; anything else (including a bare name) is treated as a directory,
 * where an auto-named, timestamped report is written. */
function resolveOutPath(out: string | undefined): string {
  if (out === undefined) {
    return path.join(RESULTS_DIR, `diagnostic-layer1--${new Date().toISOString().replace(/[:.]/g, '-')}.xlsx`);
  }
  const resolved = path.resolve(out);
  const looksLikeDir = (fs.existsSync(resolved) && fs.statSync(resolved).isDirectory()) || path.extname(resolved) === '';
  return looksLikeDir
    ? path.join(resolved, `diagnostic-layer1--${new Date().toISOString().replace(/[:.]/g, '-')}.xlsx`)
    : resolved;
}

function tally(findings: Finding[]): Array<[string, number]> {
  const counts = new Map<string, number>();
  for (const f of findings) counts.set(f.code, (counts.get(f.code) ?? 0) + 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1]);
}

function summarizeFile(file: FileResult): string {
  const pass = file.rowResults.filter(r => r.outcome === 'pass').length;
  const warn = file.rowResults.filter(r => r.outcome === 'warn').length;
  const fail = file.rowResults.filter(r => r.outcome === 'fail').length;
  const sets = file.setResults.length;

  return (
    `  [${MARK[file.outcome]}] ${file.fileName}\n` +
    `         ${sets} set(s), ${file.rowResults.length} rows (${pass} pass, ${warn} warn, ${fail} fail)` +
    (file.fileFindings.length > 0 ? `, ${file.fileFindings.length} file/set-level issue(s)` : '')
  );
}

function printReport(run: RunResult, quiet: boolean): void {
  const findings = allFindings(run);
  const failures = findings.filter(f => f.severity === 'fail');
  const warnings = findings.filter(f => f.severity === 'warn');

  console.log('═══════════════════════════════════════════════════════════');
  console.log('  Layer 1 — Diagnostic Question Staging CSV Verifier');
  console.log(`  Files: ${run.files.length}   Expected rows/file: ${run.expectedLabel}`);
  console.log('═══════════════════════════════════════════════════════════\n');

  if (!quiet) {
    for (const file of run.files) console.log(summarizeFile(file));
    console.log();
  }

  if (failures.length > 0) {
    console.log(`--- ${failures.length} FAILURE(S) — do not import ---`);
    for (const [code, count] of tally(failures)) console.log(`  ${code}: ${count}`);
    console.log();
  }

  if (warnings.length > 0) {
    console.log(`--- ${warnings.length} WARNING(S) — review before importing ---`);
    for (const [code, count] of tally(warnings)) console.log(`  ${code}: ${count}`);
    console.log();
  }

  if (failures.length === 0 && warnings.length === 0) {
    console.log('All files passed every structural check.\n');
  }
}

async function main(): Promise<void> {
  const program = new Command();
  program
    .name('diagnostic:verify')
    .option('--dir <path>', 'directory of staging CSVs to check')
    .option('--file <path>', 'a specific file to check (repeatable)', collect, [] as string[])
    .option('--expected <spec>', 'expected row count, enforced for every file in this run (omit to allow each file its own actual count — for combining batches of different legitimate sizes)')
    .option('--out <path>', 'report output path or directory')
    .option('--quiet', 'suppress per-file console lines (report still written)')
    .argument('[files...]')
    .parse(process.argv);

  const opts = program.opts<CliOptions>();
  const positional = program.args;

  try {
    const files = resolveInputFiles(opts, positional);
    const spec = parseExpected(opts.expected);
    const run = verifyRun(files, spec);

    printReport(run, opts.quiet === true);

    const outPath = resolveOutPath(opts.out);
    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    await writeRunReport(run, outPath);
    console.log(`Report: ${outPath}`);

    const findings = allFindings(run);
    const hasFailures = findings.some(f => f.severity === 'fail');
    const hasWarnings = findings.some(f => f.severity === 'warn');

    if (hasFailures) {
      console.log('Verdict: FAILURES FOUND — fix before importing.');
      process.exit(EXIT_FAILURES);
    }
    if (hasWarnings) {
      console.log('Verdict: WARNINGS — review before importing.');
      process.exit(EXIT_WARNINGS);
    }
    console.log('Verdict: CLEAN — safe to hand to Layer 2.');
    process.exit(EXIT_CLEAN);
  } catch (err) {
    if (err instanceof UsageError) {
      console.error(`Usage error: ${err.message}`);
      process.exit(EXIT_USAGE);
    }
    console.error('Unexpected error:', err);
    process.exit(EXIT_USAGE);
  }
}

main();
