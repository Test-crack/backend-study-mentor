/**
 * Layer 1 — Mock Question CSV Verifier (structural, read-only).
 *
 * Checks Mock question CSVs before anything imports them. Reads CSVs,
 * writes one colored .xlsx report. Never connects to the database, never
 * calls an AI, never modifies an input file — so there is deliberately no
 * --confirm.
 *
 *   npm run mock:verify -- --dir "C:\path\to\csvs"
 *   npm run mock:verify -- --dir "C:\path\to\csvs" --match SPEAKING
 *   npm run mock:verify -- --file "./a.csv" --file "./b.csv"
 *
 * Exit codes: same convention as ia:verify — 0 clean, 1 hard failures,
 * 2 warnings only, 3 usage error.
 */

import fs from 'fs';
import path from 'path';
import { Command } from 'commander';
import { findCsvFiles } from '../shared/csvLoader';
import { writeRunReport } from '../shared/excelReport';
import { reportPathFor } from '../shared/reportNaming';
import { allFindings, verifyRun } from './verify';
import { OPTION_KEYS, type ExpectedSpec, type FileResult, type Finding, type OptionKey, type RowOutcome, type RunResult } from '../shared/types';

export const EXIT_CLEAN = 0;
export const EXIT_FAILURES = 1;
export const EXIT_WARNINGS = 2;
export const EXIT_USAGE = 3;

const DEFAULT_EXPECTED_ROWS = 10;
const RESULTS_DIR = path.resolve(__dirname, '..', '..', 'results', 'layer1-verifier');

const MARK: Record<RowOutcome, string> = { pass: 'PASS', warn: 'WARN', fail: 'FAIL' };

interface CliOptions {
  dir?: string;
  match?: string;
  file?: string[];
  expected: string;
  out?: string;
  quiet?: boolean;
  requireSourceKey?: boolean;
}

class UsageError extends Error {}

function collect(value: string, previous: string[]): string[] {
  return [...previous, value];
}

function positiveInt(raw: string, context: string): number {
  const n = Number(raw);
  if (!Number.isInteger(n) || n <= 0) throw new UsageError(`${context} must be a positive whole number, got "${raw}".`);
  return n;
}

function parseExpected(raw: string): ExpectedSpec {
  return { fallback: positiveInt(raw, '--expected'), byBucket: {} };
}

function resolveInputFiles(opts: CliOptions, positional: string[]): string[] {
  const explicit = [...(opts.file ?? []), ...positional];
  const sources = [opts.dir !== undefined ? '--dir' : null, explicit.length > 0 ? '--file/positional' : null].filter((s): s is string => s !== null);

  if (sources.length !== 1) {
    throw new UsageError(sources.length === 0 ? 'Choose what to check: --dir <path>, or --file <path>.' : `Pick one way to choose files — got ${sources.join(' and ')}.`);
  }

  if (explicit.length > 0) {
    const missing = explicit.filter(p => !fs.existsSync(p));
    if (missing.length > 0) throw new UsageError(`These files do not exist:\n  ${missing.join('\n  ')}`);
    return explicit.map(p => path.resolve(p));
  }

  const dir = path.resolve(opts.dir as string);
  if (!fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) throw new UsageError(`Not a directory: ${dir}`);

  const found = findCsvFiles(dir, opts.match);
  if (found.length === 0) {
    throw new UsageError(`No .csv files found in ${dir}` + (opts.match ? ` matching "${opts.match}"` : '') + `.\n  Nothing was checked — this is an error, not a pass.`);
  }
  return found;
}

function resolveOutPath(out: string | undefined, files: string[]): string {
  if (out === undefined) return reportPathFor(RESULTS_DIR, files);
  const resolved = path.resolve(out);
  const looksLikeDir = (fs.existsSync(resolved) && fs.statSync(resolved).isDirectory()) || path.extname(resolved) === '';
  return looksLikeDir ? reportPathFor(resolved, files) : resolved;
}

function answerDistribution(file: FileResult): Record<OptionKey, number> {
  const counts: Record<OptionKey, number> = { A: 0, B: 0, C: 0, D: 0 };
  for (const rr of file.rowResults) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(rr.row.correct_answer.trim());
    } catch {
      continue;
    }
    if (typeof parsed === 'string' && (OPTION_KEYS as readonly string[]).includes(parsed)) counts[parsed as OptionKey] += 1;
  }
  return counts;
}

function summarizeFile(file: FileResult): string {
  const pass = file.rowResults.filter(r => r.outcome === 'pass').length;
  const warn = file.rowResults.filter(r => r.outcome === 'warn').length;
  const fail = file.rowResults.filter(r => r.outcome === 'fail').length;
  const bucket = file.bucket ? `${file.bucket.skill}/${file.bucket.sub_skill}` : '(bucket undetermined)';
  const dist = answerDistribution(file);
  const distLine = OPTION_KEYS.map(k => `${k}:${dist[k]}`).join(' ');

  return (
    `  [${MARK[file.outcome]}] ${file.fileName}\n` +
    `         ${bucket} — ${file.rowResults.length} rows (${pass} pass, ${warn} warn, ${fail} fail)` +
    (file.fileFindings.length > 0 ? `, ${file.fileFindings.length} file-level issue(s)` : '') +
    `\n         MCQ answers: ${distLine}`
  );
}

function tally(findings: Finding[]): Array<[string, number]> {
  const counts = new Map<string, number>();
  for (const f of findings) counts.set(f.code, (counts.get(f.code) ?? 0) + 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1]);
}

function printReport(run: RunResult, quiet: boolean): void {
  const findings = allFindings(run);
  const failures = findings.filter(f => f.severity === 'fail');
  const warnings = findings.filter(f => f.severity === 'warn');

  console.log('═══════════════════════════════════════════════════════════');
  console.log('  Layer 1 — Mock Question CSV Verifier');
  console.log(`  Files: ${run.files.length}   Expected rows/file: ${run.expectedLabel}`);
  console.log('═══════════════════════════════════════════════════════════\n');

  if (!quiet) {
    for (const file of run.files) console.log(summarizeFile(file));
    console.log();
  }

  if (run.runFindings.length > 0) {
    console.log('--- CROSS-FILE FINDINGS ---');
    for (const f of run.runFindings) console.log(`  [${f.code}] ${f.message}`);
    console.log();
  }

  if (failures.length > 0) {
    console.log(`--- HARD FAILURES: ${failures.length} ---`);
    for (const [code, count] of tally(failures)) console.log(`  ${count.toString().padStart(5)} x ${code}`);
    console.log();
  }

  if (warnings.length > 0) {
    console.log(`--- WARNINGS (human review, do not block import): ${warnings.length} ---`);
    for (const [code, count] of tally(warnings)) console.log(`  ${count.toString().padStart(5)} x ${code}`);
    console.log();
  }

  if (failures.length === 0 && warnings.length === 0) console.log('All files passed every structural check.\n');
}

function exitCodeFor(run: RunResult): number {
  if (run.outcome === 'fail') return EXIT_FAILURES;
  if (run.outcome === 'warn') return EXIT_WARNINGS;
  return EXIT_CLEAN;
}

async function main(): Promise<number> {
  const program = new Command();

  program
    .name('mock:verify')
    .description('Layer 1 structural verifier for Mock question CSVs. Read-only.')
    .option('--dir <path>', 'Directory to scan for .csv files, including subfolders')
    .option('--match <text>', 'Only files whose name contains this text (case-insensitive)')
    .option('-f, --file <path>', 'A CSV to check; repeat for multiple files', collect, [])
    .option('--expected <n>', 'Expected data rows per file.', String(DEFAULT_EXPECTED_ROWS))
    .option('--out <path>', 'Report file or directory (default: Verification/mock/results/layer1-verifier)')
    .option('--require-source-key', 'Fail files with no source_key column.')
    .option('-q, --quiet', 'Summary only — skip the per-file and per-finding detail')
    .argument('[files...]', 'CSV paths, as an alternative to --file')
    .allowExcessArguments(false);

  program.parse(process.argv);
  const opts = program.opts<CliOptions>();
  const positional = program.args;

  const expected = parseExpected(opts.expected);
  const files = resolveInputFiles(opts, positional);
  const outPath = resolveOutPath(opts.out, files);
  fs.mkdirSync(path.dirname(outPath), { recursive: true });

  const run = verifyRun(files, expected, { requireSourceKey: opts.requireSourceKey === true });
  printReport(run, opts.quiet === true);

  const written = await writeRunReport(run, outPath);
  console.log(`Report: ${written}`);

  const code = exitCodeFor(run);
  const verdict = code === EXIT_CLEAN ? 'CLEAN — safe to hand to the next layer.' : code === EXIT_WARNINGS ? 'WARNINGS ONLY — review the amber rows, then proceed.' : 'FAILURES — do NOT import. Fix the red rows and re-run.';
  console.log(`Verdict: ${verdict}`);

  return code;
}

main()
  .then(code => {
    process.exitCode = code;
  })
  .catch((err: unknown) => {
    if (err instanceof UsageError) {
      console.error(`\nUsage error: ${err.message}\n`);
    } else {
      console.error('\nThe verifier itself crashed. Treat this as UNVERIFIED, not as a pass.\n');
      console.error(err);
    }
    process.exitCode = EXIT_USAGE;
  });
