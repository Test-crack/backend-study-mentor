/**
 * Layer 2 — IA Question Content Judge.
 *
 * Runs on the same CSVs Layer 1 checked — no intermediate file. Judges
 * whether stored MCQ/TFNG answers are correct, whether Writing/Speaking
 * prompts are clear and genuinely discriminating, and transcribes Listening
 * audio for manual reference. Calls Gemini; costs money; caches by content
 * hash. Never modifies a CSV, never touches the database.
 *
 *   npm run ia:judge -- --level beginner --limit 20
 *   npm run ia:judge -- --level beginner
 *   npm run ia:judge -- --file "./a.csv" --no-cache
 *
 * Exit codes: 0 clean, 1 defects found, 2 needs review (upheld/unjudged), 3 usage error.
 */

import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import { Command } from 'commander';
import { findCsvFiles } from '../shared/csvLoader';
import { IA_DIR, iaDirFor, parseDifficulty } from '../shared/iaLayout';
import { createGeminiClient, createLimiter, resolveApiKey, DEFAULT_MODEL } from '../../../drills/question-banks/shared/llm';
import { clearCache, CACHE_DIR } from './cache';
import { judgeRun, type JudgeDeps, type JudgeStats } from './judge';
import { writeJudgeReport } from './report';
import { reportPathFor } from '../shared/reportNaming';
import { ANSWER_JUDGE_OUTCOMES, PROMPT_JUDGE_OUTCOMES, SEVERITY_BY_ANSWER_OUTCOME, SEVERITY_BY_PROMPT_OUTCOME } from './types';

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
  limit?: string;
  concurrency: string;
  model: string;
  audioDir?: string;
  out?: string;
  cache: boolean;
  clearCache?: boolean;
  quiet?: boolean;
  dryRun?: boolean;
}

function collect(value: string, previous: string[]): string[] {
  return [...previous, value];
}

function resolveInputFiles(opts: CliOptions, positional: string[]): string[] {
  const explicit = [...(opts.file ?? []), ...positional];
  const sources = [opts.dir !== undefined ? '--dir' : null, opts.level !== undefined ? '--level' : null, explicit.length > 0 ? '--file/positional' : null].filter(
    (s): s is string => s !== null,
  );

  if (sources.length > 1) throw new UsageError(`Pick one way to choose files — got ${sources.join(' and ')}.`);

  if (explicit.length > 0) {
    const missing = explicit.filter(p => !fs.existsSync(p));
    if (missing.length > 0) throw new UsageError(`These files do not exist:\n  ${missing.join('\n  ')}`);
    return explicit.map(p => path.resolve(p));
  }

  let dir: string;
  let what: string;

  if (opts.level !== undefined) {
    const difficulty = parseDifficulty(opts.level);
    if (difficulty === null) throw new UsageError(`--level must be beginner, intermediate or advanced — got "${opts.level}".`);
    dir = iaDirFor(difficulty);
    what = `the ${difficulty.toLowerCase()}/ IA folder`;
  } else if (opts.dir !== undefined) {
    dir = path.resolve(opts.dir);
    what = dir;
  } else {
    dir = IA_DIR;
    what = 'the IA folder';
  }

  if (!fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) throw new UsageError(`Not a directory: ${dir}`);

  const found = findCsvFiles(dir, opts.match);
  if (found.length === 0) {
    throw new UsageError(`No .csv files found in ${what}` + (opts.match ? ` matching "${opts.match}"` : '') + `.\n  Looked in: ${dir}\n  Nothing was judged.`);
  }
  return found;
}

function resolveOutPath(out: string | undefined, files: string[]): string {
  if (out === undefined) return reportPathFor(RESULTS_DIR, files);
  const resolved = path.resolve(out);
  const looksLikeDir = (fs.existsSync(resolved) && fs.statSync(resolved).isDirectory()) || path.extname(resolved) === '';
  return looksLikeDir ? reportPathFor(resolved, files) : resolved;
}

async function main(): Promise<number> {
  const program = new Command();

  program
    .name('ia:judge')
    .description('Layer 2 content judge for IA question CSVs. Read-only.')
    .option('--level <name>', 'Judge one difficulty folder: beginner | intermediate | advanced')
    .option('--dir <path>', 'Directory to scan for .csv files, including subfolders')
    .option('--match <text>', 'Only files whose name contains this text (case-insensitive)')
    .option('-f, --file <path>', 'A CSV to judge; repeat for multiple files', collect, [])
    .option('--limit <n>', 'Judge at most N rows per file — cheap trial runs')
    .option('--concurrency <n>', 'Parallel model calls', String(DEFAULT_CONCURRENCY))
    .option('--model <name>', 'Gemini model', DEFAULT_MODEL)
    .option('--audio-dir <path>', 'Directory audio_url values resolve against, for the Listening transcription step')
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

  const files = resolveInputFiles(opts, positional);

  if (opts.dryRun === true) {
    console.log(`Would judge ${files.length} file(s) with ${opts.model}:`);
    for (const f of files) console.log(`  ${path.basename(f)}`);
    console.log('\nNo model calls were made (--dry-run).');
    return EXIT_CLEAN;
  }

  const resolved = resolveApiKey();
  if (resolved === null) throw new UsageError('No API key. Set GEMINI_API_KEY in .env.');
  console.log(`Using ${resolved.source} with model ${opts.model}.\n`);

  const outPath = resolveOutPath(opts.out, files);
  fs.mkdirSync(path.dirname(outPath), { recursive: true });

  const stats: JudgeStats = { apiCalls: 0, cacheHits: 0 };
  const client = createGeminiClient({ apiKey: resolved.key, modelName: opts.model, onRetry: message => console.warn(`    [retry] ${message}`) });

  const deps: JudgeDeps = {
    client,
    limit: createLimiter(Number(opts.concurrency) || DEFAULT_CONCURRENCY),
    useCache: opts.cache !== false,
    stats,
    audioDir: opts.audioDir ? path.resolve(opts.audioDir) : undefined,
    onProgress: message => {
      if (opts.quiet !== true) console.log(message);
    },
  };

  console.log('═══════════════════════════════════════════════════════════');
  console.log('  Layer 2 — IA Question Content Judge');
  console.log(`  Model: ${client.modelName}   Files: ${files.length}`);
  console.log('═══════════════════════════════════════════════════════════\n');

  const run = await judgeRun(files, deps);

  let defects = 0;
  let needsReview = 0;
  for (const f of run.files) {
    if (f.skipReason) {
      console.log(`  [SKIP] ${f.fileName}: ${f.skipReason}`);
      continue;
    }
    const answerDefects = ANSWER_JUDGE_OUTCOMES.filter(o => f.answerCounts[o] > 0 && SEVERITY_BY_ANSWER_OUTCOME[o] === 'defect');
    const promptDefects = PROMPT_JUDGE_OUTCOMES.filter(o => f.promptCounts[o] > 0 && SEVERITY_BY_PROMPT_OUTCOME[o] === 'defect');
    const unjudged =
      f.answerCounts.UNJUDGED + f.answerCounts.SKIPPED + f.promptCounts.UNJUDGED + f.promptCounts.SKIPPED;
    defects += answerDefects.length + promptDefects.length;
    if (unjudged > 0 || f.answerCounts.UPHELD > 0) needsReview += 1;

    console.log(`  ${f.fileName}: ${f.answerRows.length} MCQ/TFNG, ${f.promptRows.length} prompt row(s) judged`);
    for (const o of answerDefects) console.log(`    ${o}: ${f.answerCounts[o]}`);
    for (const o of promptDefects) console.log(`    ${o}: ${f.promptCounts[o]}`);
    if (f.audioCrossChecks.length > 0) console.log(`    Listening groups transcribed: ${f.audioCrossChecks.length}`);
  }

  console.log(`\nFresh model calls: ${stats.apiCalls}   Served from cache: ${stats.cacheHits}\n`);

  const written = await writeJudgeReport(run, outPath);
  console.log(`Report: ${written}`);

  if (defects > 0) {
    console.log(`Verdict: ${defects} DEFECT(S) FOUND — fix before importing.`);
    return EXIT_DEFECTS;
  }
  if (needsReview > 0) {
    console.log('Verdict: NEEDS REVIEW — see UPHELD/UNJUDGED rows.');
    return EXIT_REVIEW;
  }
  console.log('Verdict: CLEAN — safe to import.');
  return EXIT_CLEAN;
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
