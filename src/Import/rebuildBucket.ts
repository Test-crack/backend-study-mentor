/**
 * REBUILD ONE BUCKET FROM SCRATCH — renumber source_keys from 001 and replace the
 * database bucket with exactly what the raw CSV contains.
 *
 * This is the "clean slate" path, for when the live rows in a bucket are being
 * discarded wholesale rather than corrected in place. It differs from cli.ts
 * (which upserts and leaves orphans behind) and from replaceBucket.ts (which
 * replaces rows but preserves whatever keys the tagged file already carries).
 *
 * ## How the renumbering works
 *
 * Reading the RAW author CSV (7 columns, no source_key) and assigning against
 * `emptyBucketIndex()` is what makes numbering restart at 001: with no prior keys
 * in the index, every row is a fresh allocation in file order. This is deliberate
 * and does NOT depend on the database or the tagged folder being cleared first —
 * so there is no window where the bucket is empty while a separate CLI runs.
 *
 * Reading the TAGGED file instead would be wrong: assignKeys' first pass keeps any
 * key a row already carries, so the old numbering would survive.
 *
 * ## Safety
 *
 * - DRY RUN IS THE DEFAULT. Writing requires --confirm.
 * - `--target dev|prod` is required and name-checked against the resolved
 *   connection, because the tunnel's port says nothing about which database is on
 *   the far end.
 * - Layer 1 runs twice as a hard gate: once on the raw file, and again on the
 *   regenerated tagged file with --require-source-key. Every row is also converted
 *   with the importer's own `toImportRow` before anything is deleted.
 * - THE DELETE AND THE INSERT SHARE ONE TRANSACTION, so a failure part-way cannot
 *   leave the bucket empty.
 * - The bucket's existing rows are written to a timestamped backup file before the
 *   transaction runs, so a bad-but-successful rebuild is still recoverable.
 *
 * ## Layer 2
 *
 * Renumbering cannot change a Layer 2 verdict: its cache key is a hash of
 * prompt_text, options, correct_answer, explanation, model, template and votes —
 * `source_key` is not part of it. An existing clean Layer 2 report therefore still
 * applies to the renumbered rows, which is why this script asks for
 * --layer2-reviewed rather than re-running the judge.
 *
 * ## Known consequence: question ids change
 *
 * Reinserted rows get new database-generated uuids. `drill_sessions.question_ids`
 * references questions by that id, so an in-progress (STARTED) session in this
 * bucket would resume with no questions and grade as 0 correct. Counted and
 * reported before you confirm.
 *
 * Usage:
 *   npx ts-node --project tsconfig.dev.json Import/rebuildBucket.ts \
 *     --target dev --level beginner --match FLUENCY
 *
 *   npx ts-node --project tsconfig.dev.json Import/rebuildBucket.ts \
 *     --target dev --level beginner --match FLUENCY --confirm --layer2-reviewed
 */
import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import { Command } from 'commander';
import {
  findCsvFiles,
  loadDrillCsv,
  writeDrillCsv,
} from '../Verification/drills/question-banks/shared/csvLoader';
import { drillsDirFor, parseLevel } from '../Verification/drills/question-banks/shared/drillsLayout';
import { verifyFile, fileFindingsFlat } from '../Verification/drills/question-banks/layer1-verifier/verify';
import {
  EXPECTED_HEADER,
  SOURCE_KEY_HEADER,
  bucketKey,
  type BucketTriple,
  type DrillCsvRow,
} from '../Verification/drills/question-banks/shared/types';
import {
  assignKeys,
  emptyBucketIndex,
} from '../Verification/drills/question-banks/key-assignment-tool/assignKeys';
import { toImportRow, type ImportRow } from './importer';
import { parseTarget, redactUrl, resolveTarget, TargetError } from './target';

const TAGGED_BASE = path.resolve(__dirname, '..', 'Verification', 'drills', 'results', 'key-assignment-tool');
const BACKUP_DIR = path.resolve(__dirname, '..', 'Verification', 'drills', 'results', 'bucket-backups');
const DEFAULT_EXPECTED_ROWS = 200;

interface PrismaLike {
  $transaction<T>(fn: (tx: any) => Promise<T>, options?: { timeout?: number; maxWait?: number }): Promise<T>;
  drillQuestion: { count(args: any): Promise<number>; findMany(args: any): Promise<any[]> };
  $queryRawUnsafe(sql: string, ...args: any[]): Promise<any[]>;
  $disconnect(): Promise<void>;
}

async function loadPrisma(): Promise<PrismaLike> {
  const mod = (await import('../lib/prisma.js')) as unknown as { default: PrismaLike };
  return mod.default;
}

const program = new Command();
program
  .name('rebuildBucket')
  .description('Renumber one bucket from 001 and replace it in the database')
  .requiredOption('--target <dev|prod>', 'Which database. Verified against the connection.')
  .requiredOption('--level <name>', 'beginner | intermediate | advanced')
  .option('--match <text>', 'Only the RAW file whose name contains this text')
  .option('-f, --file <path>', 'An explicit RAW CSV to rebuild from')
  .option('--database-url <url>', 'Explicit connection string, still name-checked')
  .option('--expected <n>', 'Expected row count for the Layer 1 gate', String(DEFAULT_EXPECTED_ROWS))
  .option('--confirm', 'Actually write the tagged CSV and replace the database bucket.')
  .option('--layer2-reviewed', 'Assert the Layer 2 content report was read (required with --confirm)')
  .option('--no-gate', 'Skip the Layer 1 gates. Unsafe; for diagnosis only.');
program.parse(process.argv);
const opts = program.opts<{
  target: string;
  level: string;
  match?: string;
  file?: string;
  databaseUrl?: string;
  expected: string;
  confirm?: boolean;
  layer2Reviewed?: boolean;
  gate: boolean;
}>();

function fail(msg: string): never {
  console.error(`\nUsage error: ${msg}\n`);
  process.exit(3);
}

/** Raw cells for one row, in canonical column order, with the key appended. */
function cellsFor(row: DrillCsvRow, key: string): string[] {
  return [
    row.skill,
    row.sub_skill,
    row.level,
    row.prompt_text,
    row.options,
    row.correct_answer,
    row.explanation,
    key,
  ];
}

async function main() {
  const target = parseTarget(opts.target);
  if (target === null) fail(`--target must be "dev" or "prod", not "${opts.target}".`);

  let resolved;
  try {
    resolved = resolveTarget(target, process.env, opts.databaseUrl);
  } catch (e) {
    if (e instanceof TargetError) fail(e.message);
    throw e;
  }
  process.env.DATABASE_URL = resolved.url;

  const level = parseLevel(opts.level);
  if (level === null) fail('--level must be beginner, intermediate or advanced.');

  // --- Resolve exactly one RAW file. Raw, not tagged: see the header note. ---
  let files: string[];
  if (opts.file) {
    files = [path.resolve(opts.file)];
  } else {
    const dir = drillsDirFor(level);
    if (!fs.existsSync(dir)) fail(`No raw drills folder for ${opts.level} at:\n  ${dir}`);
    files = findCsvFiles(dir);
    if (opts.match) {
      const needle = opts.match.toLowerCase();
      files = files.filter(f => path.basename(f).toLowerCase().includes(needle));
    }
  }
  if (files.length === 0) fail('No files matched.');
  if (files.length > 1) {
    console.error('\nUsage error: this command rebuilds ONE bucket at a time, but matched:');
    for (const f of files) console.error(`  - ${path.basename(f)}`);
    console.error('\nNarrow it with --match or -f.\n');
    process.exit(3);
  }

  const rawPath = files[0];
  const expected = Number(opts.expected);
  const taggedPath = path.join(TAGGED_BASE, opts.level.toLowerCase(), path.basename(rawPath));

  console.log('═══════════════════════════════════════════════════════════');
  console.log('  Rebuild bucket — renumber from 001, then replace');
  console.log(`  Target:   ${target.toUpperCase()}  (${resolved.databaseName})`);
  console.log(`  From:     ${resolved.source}  ${redactUrl(resolved.url)}`);
  console.log(`  Raw file: ${path.basename(rawPath)}`);
  console.log(`  Mode:     ${opts.confirm ? 'APPLY — will write and replace' : 'DRY RUN — nothing will change'}`);
  if (opts.gate === false) console.log('  Gate:     DISABLED (--no-gate)');
  console.log('═══════════════════════════════════════════════════════════\n');

  if (opts.confirm && !opts.layer2Reviewed) {
    fail('--confirm also requires --layer2-reviewed (assert you read the Layer 2 content report).');
  }

  // --- Gate 1: the raw file, before anything is generated. No keys expected here. ---
  if (opts.gate !== false) {
    const verdict = verifyFile(rawPath, { expectedRowCount: expected, requireSourceKey: false });
    if (verdict.outcome === 'fail') {
      const codes = [...new Set(fileFindingsFlat(verdict).filter(f => f.severity === 'fail').map(f => f.code))];
      fail(`Layer 1 FAILED on the raw file: ${codes.join(', ')}. Nothing was changed.`);
    }
  }

  const loaded = loadDrillCsv(rawPath);
  if (loaded.fatal) fail('Raw file could not be read. Nothing was changed.');
  if (loaded.rows.length === 0) fail('Raw file has no data rows. Nothing was changed.');

  // --- Determine the bucket. "Rebuild this bucket" needs exactly one. ---
  const triples = new Set(loaded.rows.map(r => `${r.skill}|${r.sub_skill}|${r.level}`));
  if (triples.size !== 1) {
    fail(`raw file spans ${triples.size} buckets — expected exactly one:\n  ${[...triples].join('\n  ')}`);
  }
  const first = loaded.rows[0];
  const bucket = {
    skill: first.skill.trim().toUpperCase(),
    sub_skill: first.sub_skill.trim().toUpperCase(),
    level: first.level.trim().toUpperCase(),
  } as unknown as BucketTriple;

  // --- Assign keys against an EMPTY index: this is what restarts numbering at 001. ---
  const result = assignKeys(loaded.rows, bucket, emptyBucketIndex());
  if (result.skippedRows.length > 0) {
    fail(`${result.skippedRows.length} row(s) have no usable prompt text and could not be keyed.`);
  }
  const keyed = result.assignments;
  if (keyed.length !== loaded.rows.length) {
    fail(`keyed ${keyed.length} of ${loaded.rows.length} rows — refusing to continue on a partial batch.`);
  }

  const nums = keyed
    .map(a => Number(a.key.match(/_(\d+)$/)?.[1] ?? NaN))
    .filter(n => Number.isInteger(n))
    .sort((a, b) => a - b);
  const contiguous =
    nums.length === keyed.length && nums[0] === 1 && nums[nums.length - 1] === keyed.length;

  console.log(`  Bucket:   ${bucketKey(bucket)}`);
  console.log(`  Raw rows: ${loaded.rows.length}`);
  console.log(
    `  New keys: ${keyed[0].key} .. ${keyed[keyed.length - 1].key}` +
      `  ${contiguous ? '(contiguous 1..' + keyed.length + ')' : '(NOT contiguous — check below)'}`,
  );
  if (!contiguous) {
    fail('renumbering did not produce a contiguous 1..N range; refusing to continue.');
  }

  // --- Convert every row up front, so a bad row aborts before any write. ---
  const taggedRows: DrillCsvRow[] = keyed.map(a => ({ ...a.row, source_key: a.key }));
  const importRows: ImportRow[] = [];
  const errors: string[] = [];
  for (const r of taggedRows) {
    const converted = toImportRow(r);
    if ('error' in converted) errors.push(converted.error);
    else importRows.push(converted.row);
  }
  if (errors.length > 0) {
    console.error(`\n${errors.length} row(s) could not be converted — nothing was changed:\n`);
    for (const e of errors.slice(0, 20)) console.error(`  ${e}`);
    if (errors.length > 20) console.error(`  ... and ${errors.length - 20} more`);
    process.exit(1);
  }

  // --- Write the tagged CSV (temp path on a dry run) and gate it with keys required. ---
  const header = [...EXPECTED_HEADER, SOURCE_KEY_HEADER];
  const cells = keyed.map(a => cellsFor(a.row, a.key));
  const writePath = opts.confirm ? taggedPath : `${taggedPath}.dryrun`;
  writeDrillCsv(writePath, header, cells);

  try {
    if (opts.gate !== false) {
      const verdict = verifyFile(writePath, { expectedRowCount: expected, requireSourceKey: true });
      if (verdict.outcome === 'fail') {
        const codes = [...new Set(fileFindingsFlat(verdict).filter(f => f.severity === 'fail').map(f => f.code))];
        fail(`Layer 1 FAILED on the regenerated tagged file: ${codes.join(', ')}. Nothing was changed.`);
      }
    }
  } finally {
    if (!opts.confirm) fs.rmSync(writePath, { force: true });
  }
  console.log(`  Tagged:   ${opts.confirm ? 'written -> ' + writePath : 'validated (temp file, removed)'}`);

  const prisma = await loadPrisma();
  try {
    const where = {
      skill: bucket.skill as any,
      sub_skill: bucket.sub_skill as any,
      level: bucket.level as any,
    };
    const existingCount = await prisma.drillQuestion.count({ where });

    const refRows = await prisma.$queryRawUnsafe(
      `
      WITH refs AS (
        SELECT ds.id AS session_id, ds.status AS status,
               jsonb_array_elements_text(ds.question_ids::jsonb) AS qid
        FROM drill_sessions ds
        WHERE ds.question_ids IS NOT NULL
          AND jsonb_typeof(ds.question_ids::jsonb) = 'array'
      )
      SELECT COUNT(DISTINCT refs.session_id) FILTER (WHERE refs.status = 'STARTED')::int AS started_sessions,
             COUNT(DISTINCT refs.session_id)::int AS all_sessions
      FROM refs
      JOIN drill_questions dq ON dq.id::text = refs.qid
      WHERE dq.skill = $1::"IeltsSkillType"
        AND dq.sub_skill = $2::"IeltsSubSkillType"
        AND dq.level = $3::"RecommendationLevel"
      `,
      bucket.skill,
      bucket.sub_skill,
      bucket.level,
    );
    const startedSessions = refRows[0]?.started_sessions ?? 0;
    const allSessions = refRows[0]?.all_sessions ?? 0;

    console.log(`  In DB now:  ${existingCount} row(s)  -> all will be DELETED`);
    console.log(`  To insert:  ${importRows.length} row(s)`);
    console.log(
      `  Net change: ${importRows.length - existingCount >= 0 ? '+' : ''}${importRows.length - existingCount}\n`,
    );

    if (allSessions > 0) {
      console.log(`  ⚠ ${allSessions} drill session(s) reference questions in this bucket by id;`);
      console.log(`    ${startedSessions} of them are still STARTED (in progress). Reinserted rows`);
      console.log(`    get new ids, so a STARTED session here would resume with no questions`);
      console.log(`    and grade as 0 correct. Completed sessions only lose historical detail.\n`);
    }

    if (!opts.confirm) {
      console.log('───────────────────────────────────────────────────────────');
      console.log('  DRY RUN — nothing changed.');
      console.log(`  WOULD renumber to ${keyed[0].key}..${keyed[keyed.length - 1].key},`);
      console.log(`  delete ${existingCount} row(s) and insert ${importRows.length}.`);
      console.log('  Re-run with --confirm --layer2-reviewed to apply.');
      return;
    }

    // --- Back the bucket up before touching it. ---
    const existingRows = await prisma.drillQuestion.findMany({ where });
    fs.mkdirSync(BACKUP_DIR, { recursive: true });
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupPath = path.join(
      BACKUP_DIR,
      `${bucketKey(bucket).replace(/[^A-Za-z0-9]+/g, '_')}--${stamp}.json`,
    );
    fs.writeFileSync(backupPath, JSON.stringify(existingRows, null, 2), 'utf8');
    console.log(`  Backup:   ${existingRows.length} row(s) -> ${backupPath}\n`);

    // --- Delete + insert atomically. ---
    const applied = await prisma.$transaction(async (tx: any) => {
      const del = await tx.drillQuestion.deleteMany({ where });
      let inserted = 0;
      for (const r of importRows) {
        await tx.drillQuestion.create({
          data: {
            source_key: r.source_key,
            skill: r.skill as any,
            sub_skill: r.sub_skill as any,
            level: r.level as any,
            drill_type: r.drill_type,
            prompt_text: r.prompt_text,
            options: r.options as any,
            correct_answer: r.correct_answer as any,
            explanation: r.explanation,
            is_active: true,
          },
        });
        inserted++;
      }
      return { deleted: del.count, inserted };
    }, { timeout: 60000, maxWait: 10000 });

    const after = await prisma.drillQuestion.count({ where });
    console.log('───────────────────────────────────────────────────────────');
    console.log(`  DONE — deleted ${applied.deleted}, inserted ${applied.inserted}.`);
    console.log(`  Bucket now holds ${after} row(s), keyed ${keyed[0].key}..${keyed[keyed.length - 1].key}.`);
    console.log(`  Rollback: re-insert from ${backupPath} if this was wrong.`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch(e => {
  console.error('\n[rebuildBucket] ERROR:', e);
  process.exit(1);
});
