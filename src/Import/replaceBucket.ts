/**
 * REPLACE ONE BUCKET — wipe a (skill, sub_skill, level) bucket and reinsert it
 * from the tagged CSV, one bucket at a time.
 *
 * Why this exists separately from cli.ts: the normal importer UPSERTS, so retired
 * or rewritten questions that are no longer in the CSV stay in the database as
 * orphans. This is the deliberate "clean slate per bucket" alternative — every
 * existing row in the bucket is deleted and only the CSV's rows survive.
 *
 * ## Safety
 *
 * - DRY RUN IS THE DEFAULT. Writing requires --confirm.
 * - `--target dev|prod` is required and name-checked against the resolved
 *   connection, same as cli.ts. Naming a target is not the same as being connected
 *   to it.
 * - Layer 1 runs inline as a hard gate (with --require-source-key), and every row
 *   is converted with the importer's own toImportRow BEFORE anything is deleted.
 *   A file that cannot be fully converted deletes nothing.
 * - THE DELETE AND THE INSERT SHARE ONE TRANSACTION. If the insert fails halfway,
 *   the delete rolls back with it, so a failure can never leave the bucket empty.
 *
 * ## Known consequence: question ids change
 *
 * `drill_questions.id` is database-generated, so reinserted rows get NEW uuids.
 * `drill_sessions.question_ids` / `.answers` reference questions by that id, so a
 * historical session that referenced a deleted question will point at a row that
 * no longer exists. There is no foreign key, so nothing errors — but past drill
 * reviews for those sessions lose their questions. Reported before you confirm.
 *
 * Usage:
 *   npx ts-node --project tsconfig.dev.json Import/replaceBucket.ts \
 *     --target dev --level beginner --match FLUENCY
 *
 *   npx ts-node --project tsconfig.dev.json Import/replaceBucket.ts \
 *     --target dev --level beginner --match FLUENCY --confirm --layer2-reviewed
 */
import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import { Command } from 'commander';
import { findCsvFiles, loadDrillCsv } from '../Verification/drills/question-banks/shared/csvLoader';
import { parseLevel } from '../Verification/drills/question-banks/shared/drillsLayout';
import { verifyFile, fileFindingsFlat } from '../Verification/drills/question-banks/layer1-verifier/verify';
import { toImportRow, type ImportRow } from './importer';
import { parseTarget, redactUrl, resolveTarget, TargetError } from './target';

const TAGGED_BASE = path.resolve(__dirname, '..', 'Verification', 'drills', 'results', 'key-assignment-tool');
const DEFAULT_EXPECTED_ROWS = 200;

interface PrismaLike {
  $transaction<T>(fn: (tx: any) => Promise<T>, options?: { timeout?: number; maxWait?: number }): Promise<T>;
  drillQuestion: {
    count(args: any): Promise<number>;
    findMany(args: any): Promise<any[]>;
  };
  $queryRawUnsafe(sql: string, ...args: any[]): Promise<any[]>;
  $disconnect(): Promise<void>;
}

async function loadPrisma(): Promise<PrismaLike> {
  const mod = (await import('../lib/prisma.js')) as unknown as { default: PrismaLike };
  return mod.default;
}

const program = new Command();
program
  .name('replaceBucket')
  .description('Delete one (skill, sub_skill, level) bucket and reinsert it from the tagged CSV')
  .requiredOption('--target <dev|prod>', 'Which database. Verified against the connection.')
  .requiredOption('--level <name>', 'beginner | intermediate | advanced')
  .option('--match <text>', 'Only the tagged file whose name contains this text')
  .option('-f, --file <path>', 'An explicit tagged CSV to use')
  .option('--database-url <url>', 'Explicit connection string, still name-checked')
  .option('--expected <n>', 'Expected row count for the Layer 1 gate', String(DEFAULT_EXPECTED_ROWS))
  .option('--confirm', 'Actually delete and write. Without this, nothing changes.')
  .option('--layer2-reviewed', 'Assert the Layer 2 content report was read (required with --confirm)')
  .option('--no-gate', 'Skip the inline Layer 1 gate. Unsafe; for diagnosis only.');
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
  if (level === null) fail(`--level must be beginner, intermediate or advanced.`);

  // Resolve the tagged file for this bucket.
  let files: string[];
  if (opts.file) {
    files = [path.resolve(opts.file)];
  } else {
    const dir = path.join(TAGGED_BASE, opts.level.toLowerCase());
    if (!fs.existsSync(dir)) {
      fail(`No tagged files for ${opts.level} at:\n  ${dir}\n  Run: npm run drills:assign-keys -- --level ${opts.level}`);
    }
    files = findCsvFiles(dir);
    if (opts.match) {
      const needle = opts.match.toLowerCase();
      files = files.filter(f => path.basename(f).toLowerCase().includes(needle));
    }
  }

  if (files.length === 0) fail('No files matched.');
  if (files.length > 1) {
    console.error('\nUsage error: this command replaces ONE bucket at a time, but matched several files:');
    for (const f of files) console.error(`  - ${path.basename(f)}`);
    console.error('\nNarrow it with --match or -f.\n');
    process.exit(3);
  }

  const filePath = files[0];
  const expected = Number(opts.expected);

  console.log('═══════════════════════════════════════════════════════════');
  console.log('  Replace bucket — delete then reinsert');
  console.log(`  Target:   ${target.toUpperCase()}  (${resolved.databaseName})`);
  console.log(`  From:     ${resolved.source}  ${redactUrl(resolved.url)}`);
  console.log(`  File:     ${path.basename(filePath)}`);
  console.log(`  Mode:     ${opts.confirm ? 'APPLY — will delete and write' : 'DRY RUN — nothing will change'}`);
  if (opts.gate === false) console.log('  Gate:     DISABLED (--no-gate)');
  console.log('═══════════════════════════════════════════════════════════\n');

  if (opts.confirm && !opts.layer2Reviewed) {
    fail('--confirm also requires --layer2-reviewed (assert you read the Layer 2 content report).');
  }

  // --- Layer 1 gate, before anything is read from or written to the database ---
  if (opts.gate !== false) {
    const verdict = verifyFile(filePath, { expectedRowCount: expected, requireSourceKey: true });
    if (verdict.outcome === 'fail') {
      const codes = [...new Set(fileFindingsFlat(verdict).filter(f => f.severity === 'fail').map(f => f.code))];
      fail(`Layer 1 FAILED: ${codes.join(', ')}. Nothing was deleted or written.`);
    }
  }

  const loaded = loadDrillCsv(filePath);
  if (loaded.fatal) fail('File could not be read. Nothing was deleted or written.');

  // --- Convert every row up front. A single bad row aborts before any delete. ---
  const rows: ImportRow[] = [];
  const errors: string[] = [];
  for (const csvRow of loaded.rows) {
    const converted = toImportRow(csvRow);
    if ('error' in converted) errors.push(converted.error);
    else rows.push(converted.row);
  }
  if (errors.length > 0) {
    console.error(`${errors.length} row(s) could not be converted — nothing was deleted or written:\n`);
    for (const e of errors.slice(0, 20)) console.error(`  ${e}`);
    if (errors.length > 20) console.error(`  ... and ${errors.length - 20} more`);
    process.exit(1);
  }
  if (rows.length === 0) fail('No usable rows in the file. Nothing was deleted or written.');

  const dupes = new Map<string, number>();
  for (const r of rows) {
    const prev = dupes.get(r.source_key);
    if (prev !== undefined) {
      fail(`source_key "${r.source_key}" appears on lines ${prev} and ${r.line} — refusing to continue.`);
    }
    dupes.set(r.source_key, r.line);
  }

  // Every row must belong to the SAME bucket, or "replace this bucket" is meaningless.
  const buckets = new Set(rows.map(r => `${r.skill}/${r.sub_skill}/${r.level}`));
  if (buckets.size !== 1) {
    fail(`file spans ${buckets.size} buckets (${[...buckets].join(', ')}) — expected exactly one.`);
  }
  const { skill, sub_skill, level: rowLevel } = rows[0];

  const prisma = await loadPrisma();
  try {
    const existingCount = await prisma.drillQuestion.count({
      where: { skill: skill as any, sub_skill: sub_skill as any, level: rowLevel as any },
    });

    // How much historical session data references the rows about to be deleted?
    const refRows = await prisma.$queryRawUnsafe(
      `
      WITH refs AS (
        SELECT ds.id AS session_id, jsonb_array_elements_text(ds.question_ids::jsonb) AS qid
        FROM drill_sessions ds
        WHERE ds.question_ids IS NOT NULL
          AND jsonb_typeof(ds.question_ids::jsonb) = 'array'
      )
      SELECT COUNT(DISTINCT refs.session_id)::int AS sessions, COUNT(*)::int AS refs
      FROM refs
      JOIN drill_questions dq ON dq.id::text = refs.qid
      WHERE dq.skill = $1::"IeltsSkillType"
        AND dq.sub_skill = $2::"IeltsSubSkillType"
        AND dq.level = $3::"RecommendationLevel"
      `,
      skill,
      sub_skill,
      rowLevel,
    );
    const affectedSessions = refRows[0]?.sessions ?? 0;
    const affectedRefs = refRows[0]?.refs ?? 0;

    console.log(`  Bucket:   ${skill} / ${sub_skill} / ${rowLevel}`);
    console.log(`  In DB now:      ${existingCount} row(s)  -> all will be DELETED`);
    console.log(`  From CSV:       ${rows.length} row(s)  -> all will be INSERTED`);
    console.log(`  Net change:     ${rows.length - existingCount >= 0 ? '+' : ''}${rows.length - existingCount}\n`);

    if (affectedSessions > 0) {
      console.log(`  ⚠ ${affectedSessions} drill session(s) reference ${affectedRefs} question(s) in this bucket`);
      console.log(`    by database id. Reinserted rows get NEW ids, so those historical`);
      console.log(`    sessions will point at questions that no longer exist. No foreign`);
      console.log(`    key enforces this, so nothing errors — but past drill reviews for`);
      console.log(`    those sessions lose their question text.\n`);
    }

    if (!opts.confirm) {
      console.log('───────────────────────────────────────────────────────────');
      console.log(`  DRY RUN — nothing changed.`);
      console.log(`  WOULD delete ${existingCount} and insert ${rows.length}.`);
      console.log(`  Re-run with --confirm --layer2-reviewed to apply.`);
      return;
    }

    // --- Delete + insert atomically, so a failed insert rolls the delete back. ---
    const result = await prisma.$transaction(async (tx: any) => {
      const del = await tx.drillQuestion.deleteMany({
        where: { skill: skill as any, sub_skill: sub_skill as any, level: rowLevel as any },
      });
      let inserted = 0;
      for (const r of rows) {
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

    console.log('───────────────────────────────────────────────────────────');
    console.log(`  DONE — deleted ${result.deleted}, inserted ${result.inserted}.`);
    const after = await prisma.drillQuestion.count({
      where: { skill: skill as any, sub_skill: sub_skill as any, level: rowLevel as any },
    });
    console.log(`  Bucket now holds ${after} row(s).`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch(e => {
  console.error('\n[replaceBucket] ERROR:', e);
  process.exit(1);
});
