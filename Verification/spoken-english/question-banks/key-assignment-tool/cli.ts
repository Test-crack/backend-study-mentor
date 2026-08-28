/**
 * Key-assignment tool — stamps a permanent `source_key` onto every drill question.
 *
 * Reads the 7-column CSVs an author produced, writes 8-column tagged copies to
 * `Verification/results/key-assignment-tool/<level>/`. The originals in
 * `question-banks/drills/` are never modified: if this tool ever gets something
 * wrong, the input it was derived from is still intact.
 *
 *   npm run se:drills:assign-keys -- --level b1
 *   npm run se:drills:assign-keys -- --level b1 --dry-run
 *   npm run se:drills:assign-keys -- --file "path/to/one.csv"
 *
 * Does not connect to the database and does not call an AI. `--dry-run` prints the
 * same summary without writing the tagged copies.
 *
 * Exit codes:
 *   0  every row tagged, nothing needing review
 *   2  tagged, but something needs a human: dropped keys, or rows too broken to tag
 *   3  usage error, no files matched, or a crash
 */

import fs from 'fs';
import path from 'path';
import { Command } from 'commander';
import { findCsvFiles, loadDrillCsv, writeDrillCsv } from '../shared/csvLoader';
import { DRILLS_DIR, drillsDirFor, levelFromPath, parseLevel } from '../shared/drillsLayout';
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
import { normalizeForDuplicateCheck } from '../shared/normalize';

export const EXIT_OK = 0;
export const EXIT_REVIEW = 2;
export const EXIT_USAGE = 3;

const OUT_DIR = path.resolve(__dirname, '..', '..', 'results', 'key-assignment-tool');

class UsageError extends Error {}

/**
 * The slice of PrismaClient this tool uses. Declared structurally so the module does
 * not need `@prisma/client` types at build time — the Verification tree is meant to
 * typecheck with no generated client present.
 */
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

/**
 * Resolve inputs. An empty match is an error, never a silent success — the same
 * reasoning as Layer 1: a `--match` typo that tagged nothing must not read as "done".
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
        'Mixing them makes it ambiguous which files were actually tagged.',
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
        `.\n  Looked in: ${dir}\n  Nothing was tagged — this is an error, not a pass.`,
    );
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
    .name('se:drills:assign-keys')
    .description(
      'Assigns a permanent source_key to every drill question and writes tagged ' +
        'copies. Never modifies the input CSVs and never touches the database.',
    )
    .option('--level <name>', 'Tag one level folder: a1 | a2 | b1 | b2 | c1')
    .option('--dir <path>', 'Directory of .csv files to tag, including subfolders')
    .option('--match <text>', 'Only files whose name contains this text (case-insensitive)')
    .option('-f, --file <path>', 'A CSV to tag; repeat for multiple files', collect, [])
    .option('--out <path>', `Output base directory (default: ${OUT_DIR})`)
    .option('--dry-run', 'Report what would be assigned without writing any file')
    .option(
      '--no-db',
      'Do NOT read existing keys from the database. Numbering then continues only ' +
        'from locally tagged files, which can collide with live rows and cause the ' +
        'importer to overwrite them. Offline/testing use only.',
    )
    .argument('[files...]', 'CSV paths, as an alternative to --file')
    .allowExcessArguments(false);

  program.parse(process.argv);

  const opts = program.opts<CliOptions>();
  const files = resolveInputFiles(opts, program.args);
  const outBase = opts.out === undefined ? OUT_DIR : path.resolve(opts.out);
  const dryRun = opts.dryRun === true;

  // Reading the database is the DEFAULT. It already holds keyed rows from an earlier
  // seeding process, and numbering that ignores them would hand out a key that is
  // already live — which the importer would then overwrite. Imported lazily so the
  // tool still runs with --no-db when there is no DATABASE_URL or Prisma client.
  let prisma: PrismaClientLike | null = null;
  if (opts.db) {
    try {
      // Via `unknown`: the generated client's `findMany` is heavily overloaded and does
      // not structurally overlap the narrow reader interface, though it satisfies it at
      // runtime. `fetchBucketRows` is the single place the shape is actually relied on.
      const mod = (await import('../../../../src/lib/prisma')) as unknown as {
        default: PrismaClientLike;
      };
      prisma = mod.default;
    } catch (err) {
      throw new UsageError(
        'Could not open a database connection, and existing keys must be read before ' +
          'new ones can be allocated safely.\n  ' +
          (err instanceof Error ? err.message : String(err)) +
          '\n  Fix the connection, or pass --no-db if you accept that numbering will ' +
          'ignore live rows.',
      );
    }
  }

  console.log('═══════════════════════════════════════════════════════════');
  console.log('  Key-assignment tool — source_key');
  console.log(`  Files: ${files.length}   Output: ${outBase}`);
  console.log(
    prisma === null
      ? '  --no-db: existing database keys are NOT being consulted.'
      : '  Reading existing keys from the database (read-only).',
  );
  if (dryRun) console.log('  DRY RUN — no files will be written.');
  console.log('═══════════════════════════════════════════════════════════\n');

  // One index per bucket, carried across the whole run. Two files for the same
  // bucket in a single run must not both start numbering at 001, so each file's
  // assignments are folded back in before the next file is processed.
  const indexes = new Map<string, BucketIndex>();
  const outcomes: FileOutcome[] = [];
  /** Set by bucket-level database warnings, which belong to no single file. */
  let needsReviewGlobal = false;

  for (const filePath of files) {
    const loaded = loadDrillCsv(filePath);
    const fileName = loaded.fileName;

    if (loaded.fatal) {
      const why = loaded.findings.map(f => f.code).join(', ') || 'unreadable';
      outcomes.push({
        fileName,
        bucket: null,
        outPath: null,
        kept: 0,
        reused: 0,
        assigned: 0,
        dropped: [],
        skipped: 0,
        error: `not tagged — Layer 1 cannot read this file (${why}). Fix it, then re-run.`,
      });
      continue;
    }

    const { bucket } = determineBucket(loaded.rows);
    if (bucket === null) {
      outcomes.push({
        fileName,
        bucket: null,
        outPath: null,
        kept: 0,
        reused: 0,
        assigned: 0,
        dropped: [],
        skipped: 0,
        error: 'not tagged — could not determine the (skill, sub_skill, level) bucket.',
      });
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

        // Database state first, locally-tagged files layered on top: the database says
        // what is live, the tagged folder says what is already queued for import.
        index = mergeBucketIndexes(fromDb, fromDisk);

        console.log(
          `  [db]   ${key} — ${dbRows.length} row(s) live, highest key ${fromDb.highest}, ` +
            `${fromDb.keyByPrompt.size} matchable by text`,
        );
        if (unkeyedRows > 0) {
          console.log(
            `         WARNING: ${unkeyedRows} live row(s) have no source_key. They cannot ` +
              `be matched, so a question already present but unkeyed will be issued a new ` +
              `key and inserted again.`,
          );
          needsReviewGlobal = true;
        }
        if (foreignKeys.length > 0) {
          console.log(
            `         WARNING: ${foreignKeys.length} live key(s) do not parse under this ` +
              `convention, e.g. ${foreignKeys.slice(0, 2).join(', ')}`,
          );
          needsReviewGlobal = true;
        }
      }

      indexes.set(key, index);
    }

    let result;
    try {
      result = assignKeys(loaded.rows, bucket, index);
    } catch (err) {
      outcomes.push({
        fileName,
        bucket,
        outPath: null,
        kept: 0,
        reused: 0,
        assigned: 0,
        dropped: [],
        skipped: 0,
        error: `not tagged — ${err instanceof Error ? err.message : String(err)}`,
      });
      continue;
    }

    // Fold this file's keys into the running index so the next file in the same
    // bucket continues the numbering instead of colliding with it.
    const updated: BucketIndex = {
      keyByPrompt: new Map(index.keyByPrompt),
      fileByKey: new Map(index.fileByKey),
      highest: result.highestAfter,
    };
    for (const a of result.assignments) {
      const prompt = normalizeForDuplicateCheck(a.row.prompt_text);
      if (prompt !== '') updated.keyByPrompt.set(prompt, a.key);
      updated.fileByKey.set(a.key, fileName);
    }
    indexes.set(key, updated);

    const level = levelFromPath(filePath);
    const outPath = taggedOutputPath(outBase, filePath, level);

    if (!dryRun) {
      writeDrillCsv(outPath, TAGGED_HEADER, toTaggedRows(result.assignments));
    }

    const counts = countKinds(result.assignments);
    outcomes.push({
      fileName,
      bucket,
      outPath,
      ...counts,
      dropped: result.dropped,
      skipped: result.skippedRows.length,
    });
  }

  if (prisma !== null) {
    await prisma.$disconnect();
    console.log();
  }

  // --- report ---
  let needsReview = needsReviewGlobal;

  for (const o of outcomes) {
    if (o.error !== undefined) {
      console.log(`  [SKIP] ${o.fileName}\n         ${o.error}`);
      needsReview = true;
      continue;
    }

    const bucketLabel = o.bucket ? bucketKey(o.bucket) : '(unknown)';
    console.log(`  [OK]   ${o.fileName}`);
    console.log(
      `         ${bucketLabel} — ${o.assigned} newly assigned, ` +
        `${o.reused} reused from an earlier batch, ${o.kept} already tagged`,
    );

    if (o.skipped > 0) {
      console.log(
        `         ${o.skipped} row(s) NOT tagged: no prompt text to identify them by.`,
      );
      needsReview = true;
    }

    if (o.dropped.length > 0) {
      needsReview = true;
      console.log(
        `         ${o.dropped.length} previously-tagged question(s) are MISSING from ` +
          `this batch:`,
      );
      for (const d of o.dropped.slice(0, 10)) {
        console.log(`           - ${d.key}  (last seen in ${d.fileName})`);
      }
      if (o.dropped.length > 10) {
        console.log(`           ... and ${o.dropped.length - 10} more`);
      }
      console.log(
        '         These rows still exist in the database if they were imported. This ' +
          'tool\n         does not deactivate anything — decide what should happen to them.',
      );
    }

    if (o.outPath !== null && !dryRun) console.log(`         -> ${o.outPath}`);
    console.log();
  }

  const totals = outcomes.reduce(
    (acc, o) => ({
      assigned: acc.assigned + o.assigned,
      reused: acc.reused + o.reused,
      kept: acc.kept + o.kept,
    }),
    { assigned: 0, reused: 0, kept: 0 },
  );

  console.log('───────────────────────────────────────────────────────────');
  console.log(
    `  Totals: ${totals.assigned} assigned, ${totals.reused} reused, ${totals.kept} kept`,
  );
  if (dryRun) {
    console.log('  DRY RUN — nothing was written. Re-run without --dry-run to apply.');
  }
  console.log(
    needsReview
      ? '  NEEDS REVIEW — see the notes above before verifying or importing.'
      : '  Clean. Next: npm run se:drills:verify -- --require-source-key --dir <output>',
  );

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
