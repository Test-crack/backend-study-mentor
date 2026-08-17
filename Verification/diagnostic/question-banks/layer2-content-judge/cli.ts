/**
 * Layer 2 — Diagnostic Question Content Judge.
 *
 * Runs AFTER Layer 1 passes clean. Judges whether stored MCQ/TFNG answers are
 * actually correct (blind-solve + adjudicate), whether Writing/Speaking
 * prompts are clear and genuinely hard, and — for Listening — whether the
 * real audio matches the submitted transcript. Calls Gemini; costs money;
 * caches by content hash so re-runs after a fix don't re-bill everything.
 *
 *   npm run diagnostic:judge -- --file "./new-batch.csv"
 *   npm run diagnostic:judge -- --file "./new-batch.csv" --no-cache
 *   npm run diagnostic:judge -- --file "./new-batch.csv" --audio-dir "./staging-audio"
 *
 * Exit codes: same convention as Layer 1 (0 clean, 1 defects found, 2 n/a
 * here — everything found is a real defect, not a soft warning — 3 usage error).
 */

import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import { Command } from 'commander';
import { findCsvFiles } from '../shared/csvLoader';
import { createGeminiClient, createLimiter, resolveApiKey } from '../../../drills/question-banks/shared/llm';
import { transcribeAudio } from '../../../../src/services/speechToText.service';
import { clearCache } from './cache';
import { judgeRun, type JudgeDeps, type JudgeStats } from './judge';
import { writeJudgeReport } from './report';
import { ANSWER_JUDGE_OUTCOMES, PROMPT_JUDGE_OUTCOMES, SEVERITY_BY_ANSWER_OUTCOME, SEVERITY_BY_PROMPT_OUTCOME } from './types';

const RESULTS_DIR = path.resolve(__dirname, '..', '..', 'results', 'layer2-content-judge');
const DEFAULT_CONCURRENCY = 4;

class UsageError extends Error {}

interface CliOptions {
  file?: string[];
  dir?: string;
  audioDir?: string;
  cache: boolean;
  clearCache?: boolean;
  concurrency: string;
  out?: string;
}

function collect(value: string, previous: string[]): string[] {
  return [...previous, value];
}

function resolveInputFiles(opts: CliOptions, positional: string[]): string[] {
  const explicit = [...(opts.file ?? []), ...positional];
  if (explicit.length > 0) {
    const missing = explicit.filter(p => !fs.existsSync(p));
    if (missing.length > 0) throw new UsageError(`These files do not exist:\n  ${missing.join('\n  ')}`);
    return explicit.map(p => path.resolve(p));
  }

  const dir = opts.dir !== undefined ? path.resolve(opts.dir) : process.cwd();
  if (!fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) throw new UsageError(`Not a directory: ${dir}`);

  const found = findCsvFiles(dir);
  if (found.length === 0) throw new UsageError(`No .csv files found in ${dir}. Nothing was checked.`);
  return found;
}

async function main(): Promise<void> {
  const program = new Command();
  program
    .name('diagnostic:judge')
    .option('--file <path>', 'a specific file to judge (repeatable)', collect, [] as string[])
    .option('--dir <path>', 'directory of staging CSVs to judge')
    .option('--audio-dir <path>', 'directory audio_file names resolve against, for the Listening cross-check')
    .option('--no-cache', 'ignore cached judgements and re-ask the model for everything')
    .option('--clear-cache', 'delete all cached judgements before running')
    .option('--concurrency <n>', 'max concurrent model calls', String(DEFAULT_CONCURRENCY))
    .option('--out <path>', 'report output path or directory')
    .argument('[files...]')
    .parse(process.argv);

  const opts = program.opts<CliOptions>();
  const positional = program.args;

  try {
    if (opts.clearCache) {
      const n = clearCache();
      console.log(`Cleared ${n} cached judgement file(s).`);
    }

    const resolvedKey = resolveApiKey();
    if (!resolvedKey) {
      throw new UsageError('No Gemini API key found. Set GEMINI_API_KEY (or GEMINI_QA_API_KEY) in .env.');
    }

    const files = resolveInputFiles(opts, positional);
    const client = createGeminiClient({
      apiKey: resolvedKey.key,
      onRetry: msg => console.log(`  [retry] ${msg}`),
    });
    const limit = createLimiter(Number(opts.concurrency) || DEFAULT_CONCURRENCY);
    const stats: JudgeStats = { apiCalls: 0, cacheHits: 0 };

    const deps: JudgeDeps = {
      client,
      limit,
      useCache: opts.cache !== false,
      stats,
      audioDir: opts.audioDir ? path.resolve(opts.audioDir) : undefined,
      transcribeAudio,
      onProgress: msg => console.log(msg),
    };

    console.log('═══════════════════════════════════════════════════════════');
    console.log('  Layer 2 — Diagnostic Question Content Judge');
    console.log(`  Model: ${client.modelName}   API key: ${resolvedKey.source}   Files: ${files.length}`);
    console.log('═══════════════════════════════════════════════════════════\n');

    const run = await judgeRun(files, deps);

    let defects = 0;
    let unresolved = 0;
    for (const file of run.files) {
      if (file.skipReason) {
        console.log(`  [SKIPPED] ${file.fileName}: ${file.skipReason}`);
        continue;
      }
      const answerDefects = ANSWER_JUDGE_OUTCOMES.filter(o => file.answerCounts[o] > 0 && SEVERITY_BY_ANSWER_OUTCOME[o] === 'defect');
      const answerUnresolved = ANSWER_JUDGE_OUTCOMES.filter(o => file.answerCounts[o] > 0 && SEVERITY_BY_ANSWER_OUTCOME[o] === 'unknown');
      const promptDefects = PROMPT_JUDGE_OUTCOMES.filter(o => file.promptCounts[o] > 0 && SEVERITY_BY_PROMPT_OUTCOME[o] === 'defect');
      const promptUnresolved = PROMPT_JUDGE_OUTCOMES.filter(o => file.promptCounts[o] > 0 && SEVERITY_BY_PROMPT_OUTCOME[o] === 'unknown');
      const audioMismatches = file.audioCrossChecks.filter(c => c.matchesSubmittedTranscript === false);
      const fileDefects = answerDefects.length + promptDefects.length + audioMismatches.length;
      const fileUnresolved = answerUnresolved.reduce((n, o) => n + file.answerCounts[o], 0) + promptUnresolved.reduce((n, o) => n + file.promptCounts[o], 0);
      defects += fileDefects;
      unresolved += fileUnresolved;

      console.log(`  ${file.fileName}: ${file.answerRows.length} MCQ/TFNG, ${file.promptRows.length} prompt row(s) judged`);
      for (const o of answerDefects) console.log(`    ${o}: ${file.answerCounts[o]}`);
      for (const o of promptDefects) console.log(`    ${o}: ${file.promptCounts[o]}`);
      for (const o of answerUnresolved) console.log(`    ${o}: ${file.answerCounts[o]}  — NOT actually checked, not a pass`);
      for (const o of promptUnresolved) console.log(`    ${o}: ${file.promptCounts[o]}  — NOT actually checked, not a pass`);
      if (audioMismatches.length > 0) console.log(`    AUDIO_MISMATCH: ${audioMismatches.length} set(s) — see report`);
    }

    console.log(`\nFresh model calls: ${stats.apiCalls}   Served from cache: ${stats.cacheHits}\n`);

    const outDir = opts.out ? path.resolve(opts.out) : RESULTS_DIR;
    fs.mkdirSync(outDir, { recursive: true });
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const outPath = path.join(outDir, `diagnostic-layer2--${stamp}.xlsx`);
    await writeJudgeReport(run, outPath);
    console.log(`Report: ${outPath}`);

    if (defects > 0) {
      console.log(`Verdict: ${defects} DEFECT(S) FOUND — fix before importing.`);
      process.exit(1);
    }
    if (unresolved > 0) {
      console.log(`Verdict: ${unresolved} row(s) could not be judged at all (UNJUDGED/SKIPPED) — re-run before importing, NOT a clean pass.`);
      process.exit(1);
    }
    console.log('Verdict: CLEAN — safe to import.');
    process.exit(0);
  } catch (err) {
    if (err instanceof UsageError) {
      console.error(`Usage error: ${err.message}`);
      process.exit(3);
    }
    console.error('Unexpected error:', err);
    process.exit(3);
  }
}

main();
