/**
 * Layer 2 — Drill Question Content Judge.
 *
 * Answers each question blind, compares against the answer key, and adjudicates
 * only where the two differ. Reads the same CSVs in `drills/` that Layer 1 reads
 * and the importer will read — there is no intermediate file. Writes one colored
 * .xlsx report plus a per-question cache. Never modifies a CSV, never touches the
 * database, so there is deliberately no --confirm flag.
 *
 *   npm run se:drills:judge                                (every level in drills/)
 *   npm run se:drills:judge -- --level b1
 *   npm run se:drills:judge -- --level b1 --limit 20     (try 20 rows first)
 *   npm run se:drills:judge -- --file "./a.csv" --votes 3
 *   npm run se:drills:judge -- --level c1 --no-cache
 *
 * Exit codes:
 *   0  every question judged, all answers independently confirmed
 *   1  confirmed content defects — wrong answers, broken questions, bad explanations
 *   2  disagreements upheld in the key's favour, and/or rows that could not be judged
 *   3  usage error, no files matched, missing API key, or an unexpected crash
 */

import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import { Command } from 'commander';
import { findCsvFiles } from '../shared/csvLoader';
import { DRILLS_DIR, drillsDirFor, parseLevel } from '../shared/drillsLayout';
import { createGeminiClient, createLimiter, resolveApiKey, DEFAULT_MODEL } from '../shared/llm';
import { clearCache, CACHE_DIR } from './cache';
import { judgeRun, type JudgeStats } from './judge';
import { writeJudgeReport } from './report';
import { reportPathFor } from '../shared/reportNaming';
import {
  JUDGE_OUTCOMES,
  SEVERITY_BY_OUTCOME,
  type JudgeOutcome,
  type JudgeRunResult,
} from './types';

export const EXIT_CLEAN = 0;
export const EXIT_DEFECTS = 1;
export const EXIT_REVIEW = 2;
export const EXIT_USAGE = 3;

const RESULTS_DIR = path.resolve(__dirname, '..', '..', 'results', 'layer2-content-judge');
const DEFAULT_CONCURRENCY = 6;

class UsageError extends Error {}

interface CliOptions {
  level?: string;
  dir?: string;
  match?: string;
  file?: string[];
  votes: string;
  limit?: string;
  concurrency: string;
  model: string;
  out?: string;
  cache: boolean;
  clearCache?: boolean;
  quiet?: boolean;
  dryRun?: boolean;
}

function collect(value: string, previous: string[]): string[] {
  return [...previous, value];
}

function positiveInt(raw: string, context: string): number {
  const n = Number(raw);
  if (!Number.isInteger(n) || n <= 0) {
    throw new UsageError(`${context} must be a positive whole number, got "${raw}".`);
  }
  return n;
}

/** Same selection contract as Layer 1: one source of files, and never zero. */
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
        'Mixing them makes it ambiguous which files were actually judged.',
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
    throw new UsageError(`Not a directory: ${dir}`);
  }

  const found = findCsvFiles(dir, opts.match);
  if (found.length === 0) {
    throw new UsageError(
      `No .csv files found in ${what}` +
        (opts.match ? ` matching "${opts.match}"` : '') +
        `.\n  Looked in: ${dir}` +
        '\n  Nothing was judged — this is an error, not a pass.',
    );
  }
  return found;
}

function resolveOutPath(out: string | undefined, files: string[]): string {
  if (out === undefined) return reportPathFor(RESULTS_DIR, files);
  const resolved = path.resolve(out);
  const looksLikeDir =
    (fs.existsSync(resolved) && fs.statSync(resolved).isDirectory()) ||
    path.extname(resolved) === '';
  return looksLikeDir ? reportPathFor(resolved, files) : resolved;
}

// ---------------------------------------------------------------------------
// Console output
// ---------------------------------------------------------------------------

function totals(run: JudgeRunResult): Record<JudgeOutcome, number> {
  const acc = Object.fromEntries(JUDGE_OUTCOMES.map(o => [o, 0])) as Record<JudgeOutcome, number>;
  for (const f of run.files) for (const o of JUDGE_OUTCOMES) acc[o] += f.counts[o];
  return acc;
}

function printReport(run: JudgeRunResult, quiet: boolean): void {
  const t = totals(run);
  const judged = JUDGE_OUTCOMES.reduce((n, o) => n + t[o], 0);

  console.log('═══════════════════════════════════════════════════════════');
  console.log('  Layer 2 — Drill Question Content Judge');
  console.log(`  Model: ${run.model}   Votes: ${run.votes}   Files: ${run.files.length}`);
  console.log(`  Fresh calls: ${run.apiCalls}   From cache: ${run.cacheHits}`);
  console.log('═══════════════════════════════════════════════════════════\n');

  if (!quiet) {
    for (const f of run.files) {
      if (f.skipReason) {
        console.log(`  [SKIP] ${f.fileName}`);
        console.log(`         ${f.skipReason.slice(0, 100)}`);
        continue;
      }
      const parts = JUDGE_OUTCOMES.filter(o => f.counts[o] > 0)
        .map(o => `${f.counts[o]} ${o.toLowerCase()}`)
        .join(', ');

      // "Not checked" must never print as OK. A file of entirely unjudged rows
      // once rendered as [OK] here, which is precisely the lie this tool exists
      // to avoid — the label has to reflect the worst outcome present.
      const defects =
        f.counts.ANSWER_WRONG + f.counts.QUESTION_DEFECTIVE + f.counts.EXPLANATION_WRONG +
        f.counts.QUESTION_DEGENERATE + f.counts.SKILL_MISMATCH;
      const unchecked = f.counts.UNJUDGED + f.counts.SKIPPED;
      const label =
        defects > 0 ? 'DEFECT' : unchecked > 0 ? '  ??  ' : f.counts.UPHELD > 0 ? 'REVIEW' : '  OK  ';

      console.log(`  [${label}] ${f.fileName}`);
      console.log(`         ${f.rows.length} rows — ${parts}`);
    }
    console.log();
  }

  console.log(`--- VERDICTS across ${judged} questions ---`);
  for (const o of JUDGE_OUTCOMES) {
    if (t[o] === 0) continue;
    console.log(`  ${String(t[o]).padStart(5)} x ${o}`);
  }
  console.log();

  const unchecked = t.UNJUDGED + t.SKIPPED;
  if (unchecked > 0) {
    console.log(
      `!! ${unchecked} question(s) were NOT checked (UNJUDGED/SKIPPED). ` +
        'They are not passes — see the grey rows.\n',
    );
  }
}

function exitCodeFor(run: JudgeRunResult): number {
  const t = totals(run);
  const hasDefect = JUDGE_OUTCOMES.some(o => t[o] > 0 && SEVERITY_BY_OUTCOME[o] === 'defect');
  if (hasDefect) return EXIT_DEFECTS;

  const needsReview = JUDGE_OUTCOMES.some(
    o => t[o] > 0 && (SEVERITY_BY_OUTCOME[o] === 'review' || SEVERITY_BY_OUTCOME[o] === 'unknown'),
  );
  return needsReview ? EXIT_REVIEW : EXIT_CLEAN;
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

async function main(): Promise<number> {
  const program = new Command();

  program
    .name('se:drills:judge')
    .description(
      'Layer 2 content judge for drill-question CSVs. Answers each question blind, then ' +
        'adjudicates disagreements. Read-only: never modifies a CSV, never touches the database.',
    )
    .option('--level <name>', 'Judge one level folder: a1 | a2 | b1 | b2 | c1')
    .option('--dir <path>', 'Directory to scan for .csv files, including subfolders')
    .option('--match <text>', 'Only files whose name contains this text (case-insensitive)')
    .option('-f, --file <path>', 'A CSV to judge; repeat for multiple files', collect, [])
    .option('--votes <n>', 'Independent blind solves per question', '1')
    .option('--limit <n>', 'Judge at most N rows per file — use this to trial a run cheaply')
    .option('--concurrency <n>', 'Parallel model calls', String(DEFAULT_CONCURRENCY))
    .option('--model <name>', 'Gemini model', DEFAULT_MODEL)
    .option('--out <path>', 'Report file or directory')
    .option('--no-cache', 'Ignore the cache and re-judge every row')
    .option('--clear-cache', 'Delete all cached judgements, then exit')
    .option('--dry-run', 'List what would be judged and stop before any model call')
    .option('-q, --quiet', 'Summary only')
    .argument('[files...]', 'CSV paths, as an alternative to --file')
    .allowExcessArguments(false);

  program.parse(process.argv);
  const opts = program.opts<CliOptions>();
  const positional = program.args;

  if (opts.clearCache === true) {
    const n = clearCache();
    console.log(`Cleared ${n} cache file(s) from ${CACHE_DIR}`);
    return EXIT_CLEAN;
  }

  const votes = positiveInt(opts.votes, '--votes');
  const concurrency = positiveInt(opts.concurrency, '--concurrency');
  const rowLimit = opts.limit === undefined ? null : positiveInt(opts.limit, '--limit');
  const files = resolveInputFiles(opts, positional);

  if (opts.dryRun === true) {
    console.log(`Would judge ${files.length} file(s) with ${opts.model}, votes=${votes}:`);
    for (const f of files) console.log(`  ${path.basename(f)}`);
    console.log('\nNo model calls were made (--dry-run).');
    return EXIT_CLEAN;
  }

  const resolved = resolveApiKey();
  if (resolved === null) {
    throw new UsageError('No API key. Set GEMINI_API_KEY in .env.');
  }
  console.log(`Using ${resolved.source} with model ${opts.model}.\n`);

  const outPath = resolveOutPath(opts.out, files);
  fs.mkdirSync(path.dirname(outPath), { recursive: true });

  const stats: JudgeStats = { apiCalls: 0, cacheHits: 0 };
  const client = createGeminiClient({
    apiKey: resolved.key,
    modelName: opts.model,
    onRetry: message => console.warn(`    [retry] ${message}`),
  });

  const run = await judgeRun(files, {
    client,
    votes,
    limit: createLimiter(concurrency),
    useCache: opts.cache !== false,
    stats,
    onProgress: message => {
      if (opts.quiet !== true) console.log(message);
    },
    rowLimit,
  });

  console.log();
  printReport(run, opts.quiet === true);

  const written = await writeJudgeReport(run, outPath);
  console.log(`Report: ${written}`);

  const code = exitCodeFor(run);
  const verdict =
    code === EXIT_CLEAN
      ? 'CLEAN — every answer independently confirmed.'
      : code === EXIT_REVIEW
        ? 'NEEDS REVIEW — see the amber and grey rows.'
        : 'DEFECTS — content problems confirmed. Fix the red rows before importing.';
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
      console.error('\nThe judge itself crashed. Treat this run as UNVERIFIED, not as a pass.\n');
      console.error(err);
    }
    process.exitCode = EXIT_USAGE;
  });
