/**
 * Layer 1 — Drill Question CSV Verifier (structural, read-only).
 *
 * Checks drill-question CSVs before anything imports them. Reads CSVs, writes one
 * colored .xlsx report. Never connects to the database, never calls an AI, and
 * never modifies an input file — so there is deliberately no --confirm flag.
 *
 *   npm run se:drills:verify                                  (every level in drills/)
 *   npm run se:drills:verify -- --level b1
 *   npm run se:drills:verify -- --level c1 --expected 50
 *   npm run se:drills:verify -- --expected c1=50,else=100
 *   npm run se:drills:verify -- --dir "C:\path\to\csvs" --match range
 *   npm run se:drills:verify -- --file "./a.csv" --file "./b.csv"
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
import { DRILLS_DIR, drillsDirFor, parseLevel } from '../shared/drillsLayout';
import { writeRunReport } from '../shared/excelReport';
import { reportPathFor } from '../shared/reportNaming';
import { allFindings, verifyRun } from './verify';
import {
  OPTION_KEYS,
  type ExpectedSpec,
  type FileResult,
  type Finding,
  type Level,
  type OptionKey,
  type RowOutcome,
  type RunResult,
} from '../shared/types';

export const EXIT_CLEAN = 0;
export const EXIT_FAILURES = 1;
export const EXIT_WARNINGS = 2;
export const EXIT_USAGE = 3;

const DEFAULT_EXPECTED_ROWS = 200;
const RESULTS_DIR = path.resolve(__dirname, '..', '..', 'results', 'layer1-verifier');

const MARK: Record<RowOutcome, string> = {
  pass: 'PASS',
  warn: 'WARN',
  fail: 'FAIL',
};

interface CliOptions {
  dir?: string;
  level?: string;
  match?: string;
  file?: string[];
  expected: string;
  out?: string;
  quiet?: boolean;
  requireSourceKey?: boolean;
}

function collect(value: string, previous: string[]): string[] {
  return [...previous, value];
}

/**
 * Resolve the input file list. Refuses to guess: an empty result is an error, not
 * a clean run. A `--match` typo that silently matched nothing and exited 0 would
 * be the single most dangerous failure this tool could have — it would read as
 * "the batch is fine".
 */
function resolveInputFiles(opts: CliOptions, positional: string[]): string[] {
  const explicit = [...(opts.file ?? []), ...positional];

  const sources = [
    opts.dir !== undefined ? '--dir' : null,
    opts.level !== undefined ? '--level' : null,
    explicit.length > 0 ? '--file/positional' : null,
  ].filter((s): s is string => s !== null);

  if (sources.length > 1) {
    throw new UsageError(
      `Pick one way to choose files — got ${sources.join(' and ')}. ` +
        'Mixing them makes it ambiguous which files were actually checked.',
    );
  }

  if (explicit.length > 0) {
    const missing = explicit.filter(p => !fs.existsSync(p));
    if (missing.length > 0) {
      throw new UsageError(`These files do not exist:\n  ${missing.join('\n  ')}`);
    }
    return explicit.map(p => path.resolve(p));
  }

  // --level, --dir, or (default) the whole drills tree.
  let dir: string;
  let what: string;

  if (opts.level !== undefined) {
    const level = parseLevel(opts.level);
    if (level === null) {
      throw new UsageError(
        `--level must be a1, a2, b1, b2 or c1 — got "${opts.level}".`,
      );
    }
    dir = drillsDirFor(level);
    what = `the ${level.toLowerCase()}/ drills folder`;
  } else if (opts.dir !== undefined) {
    dir = path.resolve(opts.dir);
    what = dir;
  } else {
    dir = DRILLS_DIR;
    what = 'the drills folder';
  }

  if (!fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) {
    throw new UsageError(
      `Not a directory: ${dir}` +
        (opts.dir === undefined
          ? `\n  Put your CSVs in ${DRILLS_DIR}\\<level>\\ , or pass --dir / --file.`
          : ''),
    );
  }

  const found = findCsvFiles(dir, opts.match);
  if (found.length === 0) {
    throw new UsageError(
      `No .csv files found in ${what}` +
        (opts.match ? ` matching "${opts.match}"` : '') +
        `.\n  Looked in: ${dir}` +
        '\n  Nothing was checked — this is an error, not a pass.',
    );
  }
  return found;
}

class UsageError extends Error {}

function positiveInt(raw: string, context: string): number {
  const n = Number(raw);
  if (!Number.isInteger(n) || n <= 0) {
    throw new UsageError(`${context} must be a positive whole number, got "${raw}".`);
  }
  return n;
}

/**
 * `--expected` accepts either a plain count (`200`) or per-level overrides
 * (`c1=50,else=100`). The per-level form exists so that one run can cover
 * every level folder at once even though Advanced batches are smaller.
 */
function parseExpected(raw: string): ExpectedSpec {
  if (!raw.includes('=')) {
    return { fallback: positiveInt(raw, '--expected'), byLevel: {} };
  }

  const spec: ExpectedSpec = { fallback: DEFAULT_EXPECTED_ROWS, byLevel: {} };

  for (const part of raw.split(',')) {
    const [rawKey, rawValue] = part.split('=');
    if (rawValue === undefined) {
      throw new UsageError(
        `--expected part "${part.trim()}" must look like level=count, e.g. c1=50.`,
      );
    }
    const key = rawKey.trim().toLowerCase();
    const count = positiveInt(rawValue.trim(), `--expected ${key}`);

    if (key === 'else' || key === 'default') {
      spec.fallback = count;
      continue;
    }

    const level = parseLevel(key);
    if (level === null) {
      throw new UsageError(
        `--expected key "${key}" is not a level. Use a1, a2, b1, b2, c1, or else.`,
      );
    }
    spec.byLevel[level as Level] = count;
  }

  return spec;
}

function resolveOutPath(out: string | undefined, files: string[]): string {
  if (out === undefined) {
    return reportPathFor(RESULTS_DIR, files);
  }
  const resolved = path.resolve(out);
  // A directory (existing, or clearly meant as one) gets a generated filename.
  const looksLikeDir =
    (fs.existsSync(resolved) && fs.statSync(resolved).isDirectory()) ||
    path.extname(resolved) === '';
  return looksLikeDir ? reportPathFor(resolved, files) : resolved;
}

// ---------------------------------------------------------------------------
// Console output
// ---------------------------------------------------------------------------

/**
 * How many times each option letter (A/B/C/D) is the stored correct_answer in
 * this file. A skewed distribution — e.g. C picked 150 times out of 200 — is a
 * real signal: either the content author fell into a habit, or an answer-key
 * shift bug (like the source_key/letter mismatches Layer 2 catches) is landing
 * disproportionately on one letter. Counts only rows where correct_answer parsed
 * to a real A-D value; malformed cells (already reported elsewhere, e.g.
 * CORRECT_ANSWER_NOT_JSON) are silently excluded rather than skewing the tally
 * with a bogus bucket.
 */
function answerDistribution(file: FileResult): Record<OptionKey, number> {
  const counts: Record<OptionKey, number> = { A: 0, B: 0, C: 0, D: 0 };
  for (const rr of file.rowResults) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(rr.row.correct_answer.trim());
    } catch {
      continue;
    }
    if (typeof parsed === 'string' && (OPTION_KEYS as readonly string[]).includes(parsed)) {
      counts[parsed as OptionKey] += 1;
    }
  }
  return counts;
}

function summarizeFile(file: FileResult): string {
  const pass = file.rowResults.filter(r => r.outcome === 'pass').length;
  const warn = file.rowResults.filter(r => r.outcome === 'warn').length;
  const fail = file.rowResults.filter(r => r.outcome === 'fail').length;
  const bucket = file.bucket
    ? `${file.bucket.skill}/${file.bucket.sub_skill}/${file.bucket.level}`
    : '(bucket undetermined)';

  const dist = answerDistribution(file);
  const distLine = OPTION_KEYS.map(k => `${k}:${dist[k]}`).join(' ');

  return (
    `  [${MARK[file.outcome]}] ${file.fileName}\n` +
    `         ${bucket} — ${file.rowResults.length} rows ` +
    `(${pass} pass, ${warn} warn, ${fail} fail)` +
    (file.fileFindings.length > 0 ? `, ${file.fileFindings.length} file-level issue(s)` : '') +
    `\n         answers: ${distLine}`
  );
}

/** Counts by code, so a 200-row file with one repeated problem reads as one line. */
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
  console.log('  Layer 1 — Drill Question CSV Verifier');
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
    for (const [code, count] of tally(failures)) {
      console.log(`  ${count.toString().padStart(5)} x ${code}`);
    }
    console.log();

    if (!quiet) {
      console.log('  First few, with detail:');
      for (const f of failures.slice(0, 10)) {
        console.log(`   - ${f.code}${f.line ? ` (line ${f.line})` : ''}: ${f.message}`);
      }
      if (failures.length > 10) {
        console.log(`   ... and ${failures.length - 10} more — see the Excel report.`);
      }
      console.log();
    }
  }

  if (warnings.length > 0) {
    console.log(`--- WARNINGS (human review, do not block import): ${warnings.length} ---`);
    for (const [code, count] of tally(warnings)) {
      console.log(`  ${count.toString().padStart(5)} x ${code}`);
    }
    console.log();
  }

  if (failures.length === 0 && warnings.length === 0) {
    console.log('All files passed every structural check.\n');
  }
}

function exitCodeFor(run: RunResult): number {
  if (run.outcome === 'fail') return EXIT_FAILURES;
  if (run.outcome === 'warn') return EXIT_WARNINGS;
  return EXIT_CLEAN;
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

async function main(): Promise<number> {
  const program = new Command();

  program
    .name('se:drills:verify')
    .description(
      'Layer 1 structural verifier for drill-question CSVs. Read-only: reads CSVs and ' +
        'writes one colored .xlsx report. Never touches the database.',
    )
    .option('--level <name>', 'Check one level folder: a1 | a2 | b1 | b2 | c1')
    .option('--dir <path>', 'Directory to scan for .csv files, including subfolders')
    .option('--match <text>', 'Only files whose name contains this text (case-insensitive)')
    .option('-f, --file <path>', 'A CSV to check; repeat for multiple files', collect, [])
    .option(
      '--expected <n>',
      'Expected data rows per file. Either a number, or per-level overrides ' +
        'such as "c1=50,else=100"',
      String(DEFAULT_EXPECTED_ROWS),
    )
    .option('--out <path>', 'Report file or directory (default: Verification/results/layer1-verifier)')
    .option(
      '--require-source-key',
      'Fail files with no source_key column. Use when checking a batch that is ' +
        'meant to be import-ready; leave off for pre-tagging checks.',
    )
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

  const run = verifyRun(files, expected, {
    requireSourceKey: opts.requireSourceKey === true,
  });
  printReport(run, opts.quiet === true);

  const written = await writeRunReport(run, outPath);
  console.log(`Report: ${written}`);

  const code = exitCodeFor(run);
  const verdict =
    code === EXIT_CLEAN
      ? 'CLEAN — safe to hand to the next layer.'
      : code === EXIT_WARNINGS
        ? 'WARNINGS ONLY — review the amber rows, then proceed.'
        : 'FAILURES — do NOT import. Fix the red rows and re-run.';
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
