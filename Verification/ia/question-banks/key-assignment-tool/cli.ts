/**
 * Key-assignment tool — stamps a permanent `source_key` onto every IA question.
 *
 * Ported from drills' cli.ts. Reads the CSVs an author produced, writes
 * tagged copies to `Verification/ia/results/key-assignment-tool/<difficulty>/`.
 * Originals in `question-banks/drills/` are never modified.
 *
 *   npm run ia:assign-keys -- --level beginner
 *   npm run ia:assign-keys -- --level beginner --dry-run
 *   npm run ia:assign-keys -- --file "path/to/one.csv"
 *
 * Exit codes: 0 clean, 2 needs review (dropped keys / unkeyed rows), 3 usage error.
 */

import fs from 'fs';
import path from 'path';
import { Command } from 'commander';
import { findCsvFiles, loadIACsv, writeIACsv } from '../shared/csvLoader';
import { IA_DIR, iaDirFor, difficultyFromPath, parseDifficulty } from '../shared/iaLayout';
import { determineBucket } from '../layer1-verifier/checks';
import { bucketKey, type BucketTriple } from '../shared/types';
import {
  TAGGED_HEADER,
  assignKeys,
  buildBucketIndex,
  countKinds,
  taggedOutputPath,
  toTaggedRows,
  type BucketIndex,
  type DroppedKey,
} from './assignKeys';
import { fetchBucketRows, indexFromDbRows, mergeBucketIndexes } from './dbIndex';
import { normalizeForDuplicateCheck } from '../../../drills/question-banks/shared/normalize';

export const EXIT_OK = 0;
export const EXIT_REVIEW = 2;
export const EXIT_USAGE = 3;

const OUT_DIR = path.resolve(__dirname, '..', '..', 'results', 'key-assignment-tool');

class UsageError extends Error {}

type PrismaClientLike = Parameters<typeof fetchBucketRows>[0];

interface CliOptions {
  level?: string;
  dir?: string;
  file?: string[];
  match?: string;
  out?: string;
  dryRun?: boolean;
  db: boolean;
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
    throw new UsageError(`No .csv files found in ${what}` + (opts.match ? ` matching "${opts.match}"` : '') + `.\n  Looked in: ${dir}\n  Nothing was tagged.`);
  }
  return found;
}

interface FileOutcome {
  fileName: string;
  bucket: BucketTriple | null;
  outPath: string | null;
  kept: number;
  reused: number;
  assigned: number;
  dropped: DroppedKey[];
  skipped: number;
  error?: string;
}

async function main(): Promise<number> {
  const program = new Command();

  program
    .name('ia:assign-keys')
    .description('Assigns a permanent source_key to every IA question and writes tagged copies.')
    .option('--level <name>', 'Tag one difficulty folder: beginner | intermediate | advanced')
    .option('--dir <path>', 'Directory of .csv files to tag, including subfolders')
    .option('--match <text>', 'Only files whose name contains this text (case-insensitive)')
    .option('-f, --file <path>', 'A CSV to tag; repeat for multiple files', collect, [])
    .option('--out <path>', `Output base directory (default: ${OUT_DIR})`)
    .option('--dry-run', 'Report what would be assigned without writing any file')
    .option('--no-db', 'Do NOT read existing keys from the database. Offline/testing use only.')
    .argument('[files...]', 'CSV paths, as an alternative to --file')
    .allowExcessArguments(false);

  program.parse(process.argv);

  const opts = program.opts<CliOptions>();
  const files = resolveInputFiles(opts, program.args);
  const outBase = opts.out === undefined ? OUT_DIR : path.resolve(opts.out);
  const dryRun = opts.dryRun === true;

  let prisma: PrismaClientLike | null = null;
  if (opts.db) {
    try {
      const mod = (await import('../../../../src/lib/prisma')) as unknown as { default: PrismaClientLike };
      prisma = mod.default;
    } catch (err) {
      throw new UsageError(
        'Could not open a database connection, and existing keys must be read before new ones can ' +
          'be allocated safely.\n  ' +
          (err instanceof Error ? err.message : String(err)) +
          '\n  Fix the connection, or pass --no-db if you accept that numbering will ignore live rows.',
      );
    }
  }

  console.log('═══════════════════════════════════════════════════════════');
  console.log('  Key-assignment tool — IA source_key');
  console.log(`  Files: ${files.length}   Output: ${outBase}`);
  console.log(prisma === null ? '  --no-db: existing database keys are NOT being consulted.' : '  Reading existing keys from the database (read-only).');
  if (dryRun) console.log('  DRY RUN — no files will be written.');
  console.log('═══════════════════════════════════════════════════════════\n');

  const indexes = new Map<string, BucketIndex>();
  const outcomes: FileOutcome[] = [];
  let needsReviewGlobal = false;

  for (const filePath of files) {
    const loaded = loadIACsv(filePath);
    const fileName = loaded.fileName;

    if (loaded.fatal) {
      const why = loaded.findings.map(f => f.code).join(', ') || 'unreadable';
      outcomes.push({ fileName, bucket: null, outPath: null, kept: 0, reused: 0, assigned: 0, dropped: [], skipped: 0, error: `not tagged — Layer 1 cannot read this file (${why}). Fix it, then re-run.` });
      continue;
    }

    const { bucket } = determineBucket(loaded.rows);
    if (bucket === null) {
      outcomes.push({ fileName, bucket: null, outPath: null, kept: 0, reused: 0, assigned: 0, dropped: [], skipped: 0, error: 'not tagged — could not determine the (skill, sub_skill, difficulty) bucket.' });
      continue;
    }

    const key = bucketKey(bucket);
    let index = indexes.get(key);
    if (index === undefined) {
      const fromDisk = buildBucketIndex(outBase, bucket);

      if (prisma === null) {
        index = fromDisk;
      } else {
        const dbRows = await fetchBucketRows(prisma, bucket);
        const { index: fromDb, unkeyedRows, foreignKeys } = indexFromDbRows(dbRows, bucket);
        index = mergeBucketIndexes(fromDb, fromDisk);

        console.log(`  [db]   ${key} — ${dbRows.length} row(s) live, highest key ${fromDb.highest}, ${fromDb.keyByPrompt.size} matchable by text`);
        if (unkeyedRows > 0) {
          console.log(`         WARNING: ${unkeyedRows} live row(s) have no source_key.`);
          needsReviewGlobal = true;
        }
        if (foreignKeys.length > 0) {
          console.log(`         WARNING: ${foreignKeys.length} live key(s) do not parse under this convention, e.g. ${foreignKeys.slice(0, 2).join(', ')}`);
          needsReviewGlobal = true;
        }
      }

      indexes.set(key, index);
    }

    let result;
    try {
      result = assignKeys(loaded.rows, bucket, index);
    } catch (err) {
      outcomes.push({ fileName, bucket, outPath: null, kept: 0, reused: 0, assigned: 0, dropped: [], skipped: 0, error: `not tagged — ${err instanceof Error ? err.message : String(err)}` });
      continue;
    }

    const updated: BucketIndex = { keyByPrompt: new Map(index.keyByPrompt), fileByKey: new Map(index.fileByKey), highest: result.highestAfter };
    for (const a of result.assignments) {
      const prompt = normalizeForDuplicateCheck(a.row.prompt_text);
      if (prompt !== '') updated.keyByPrompt.set(prompt, a.key);
      updated.fileByKey.set(a.key, fileName);
    }
    indexes.set(key, updated);

    const difficulty = difficultyFromPath(filePath);
    const outPath = taggedOutputPath(outBase, filePath, difficulty);

    if (!dryRun) writeIACsv(outPath, TAGGED_HEADER, toTaggedRows(result.assignments));

    const counts = countKinds(result.assignments);
    outcomes.push({ fileName, bucket, outPath, ...counts, dropped: result.dropped, skipped: result.skippedRows.length });
  }

  if (prisma !== null) {
    await prisma.$disconnect();
    console.log();
  }

  let needsReview = needsReviewGlobal;

  for (const o of outcomes) {
    if (o.error !== undefined) {
      console.log(`  [SKIP] ${o.fileName}\n         ${o.error}`);
      needsReview = true;
      continue;
    }

    const bucketLabel = o.bucket ? bucketKey(o.bucket) : '(unknown)';
    console.log(`  [OK]   ${o.fileName}`);
    console.log(`         ${bucketLabel} — ${o.assigned} newly assigned, ${o.reused} reused from an earlier batch, ${o.kept} already tagged`);

    if (o.skipped > 0) {
      console.log(`         ${o.skipped} row(s) NOT tagged: no prompt text to identify them by.`);
      needsReview = true;
    }

    if (o.dropped.length > 0) {
      needsReview = true;
      console.log(`         ${o.dropped.length} previously-tagged question(s) are MISSING from this batch:`);
      for (const d of o.dropped.slice(0, 10)) console.log(`           - ${d.key}  (last seen in ${d.fileName})`);
      if (o.dropped.length > 10) console.log(`           ... and ${o.dropped.length - 10} more`);
    }

    if (o.outPath !== null && !dryRun) console.log(`         -> ${o.outPath}`);
    console.log();
  }

  const totals = outcomes.reduce(
    (acc, o) => ({ assigned: acc.assigned + o.assigned, reused: acc.reused + o.reused, kept: acc.kept + o.kept }),
    { assigned: 0, reused: 0, kept: 0 },
  );

  console.log('───────────────────────────────────────────────────────────');
  console.log(`  Totals: ${totals.assigned} assigned, ${totals.reused} reused, ${totals.kept} kept`);
  if (dryRun) console.log('  DRY RUN — nothing was written. Re-run without --dry-run to apply.');
  console.log(needsReview ? '  NEEDS REVIEW — see the notes above before verifying or importing.' : '  Clean. Next: npm run ia:verify -- --require-source-key --dir <output>');

  return needsReview ? EXIT_REVIEW : EXIT_OK;
}

main()
  .then(code => {
    process.exitCode = code;
  })
  .catch((err: unknown) => {
    if (err instanceof UsageError) {
      console.error(`\nUsage error: ${err.message}\n`);
    } else {
      console.error('\nThe key-assignment tool crashed. No file should be trusted as tagged.\n');
      console.error(err);
    }
    process.exitCode = EXIT_USAGE;
  });
