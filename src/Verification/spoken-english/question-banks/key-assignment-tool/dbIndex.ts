/**
 * Reads already-issued `source_key`s out of the database.
 *
 * ## Why this exists
 *
 * The database — not the tagged-output folder — is the authority on which keys have
 * been issued. `drill_questions` already holds 3,180 keyed rows that predate this
 * tool, seeded by an earlier ad-hoc process.
 *
 * Without consulting it, the tool would allocate `..._001` for a brand-new question
 * in a bucket whose `..._001` is already taken by a different, live question. The
 * importer upserts on `source_key`, so that new question's content would be written
 * **over** the existing one: a silent overwrite of live content, no error, no crash.
 * That is the single worst failure available here, which is why reading the database
 * is the default and skipping it takes an explicit flag.
 *
 * Two things are read, per bucket:
 *
 *  - the highest number issued, so new keys continue past it;
 *  - normalized prompt text -> its existing key, so a question already in the
 *    database is recognised and keeps that key instead of being issued a second one
 *    (which would insert a duplicate row rather than update the original).
 *
 * This module is the only part of the key-assignment tool that touches the database,
 * and it only ever SELECTs. It is kept separate so the assignment logic in
 * `assignKeys.ts` stays pure and its tests need no database, no DATABASE_URL, and no
 * generated Prisma client.
 */

import { normalizeForDuplicateCheck } from '../shared/normalize';
import { highestNumber, parseSourceKey, sourceKeyPrefix } from '../shared/sourceKey';
import { bucketKey, LEVEL_TO_RECOMMENDATION_LEVEL, type BucketTriple, type Level } from '../shared/types';
import { emptyBucketIndex, type BucketIndex } from './assignKeys';

/** Just the columns needed to build an index. */
export interface DbKeyedRow {
  prompt_text: string;
  source_key: string | null;
}

/**
 * The narrow slice of PrismaClient this module needs, declared structurally rather
 * than imported from `@prisma/client`. The Verification tree must typecheck with no
 * generated client present (see the note in `shared/types.ts`), and a structural type
 * keeps that true while still being satisfied by the real client at runtime.
 */
export interface DrillQuestionReader {
  drillQuestion: {
    findMany(args: {
      where: { skill: string; sub_skill: string; level: string; exam_id: string };
      select: { prompt_text: true; source_key: true };
    }): Promise<DbKeyedRow[]>;
  };
  $disconnect(): Promise<void>;
}

/**
 * Fixed for this pipeline — Spoken English is the only exam that ever writes
 * through it. Scoping every read by this explicitly (rather than leaving it
 * off, as the IELTS pipeline does since it's the DB's default) means a future
 * exam sharing this same enum/level vocabulary can never have its rows
 * mistaken for ours, or vice versa.
 */
export const EXAM_ID = 'spoken_english';

/**
 * Fetch the rows of one bucket.
 *
 * Filtered by the enum columns rather than by a `source_key` prefix: enum equality is
 * exact, whereas a `LIKE`/`startsWith` on the key would treat every `_` in the
 * pattern as a single-character wildcard — `drill_speak_%` matches
 * `drill_speaking_...` — which silently widens the query. (Confirmed against the live
 * table: a `startsWith: 'drill_speak_'` count returned all 990 SPEAKING rows.)
 *
 * `bucket.level` here is the CEFR level (a1/a2/b1/b2/c1) — the folder/file/
 * source_key granularity — but the DB column stores the 3-way
 * `RecommendationLevel` bucket (BEGINNER/INTERMEDIATE/ADVANCED). Two CEFR
 * levels (e.g. a1 and a2) can therefore share one DB `level` value, which is
 * exactly why the query filters the DB rows down further, in memory, to only
 * those whose `source_key` actually encodes THIS CEFR level — otherwise a1
 * and a2 files would each see (and could clash numbering with) the other's
 * rows.
 */
export async function fetchBucketRows(
  prisma: DrillQuestionReader,
  bucket: BucketTriple,
): Promise<DbKeyedRow[]> {
  const dbLevel = LEVEL_TO_RECOMMENDATION_LEVEL[bucket.level as Level];
  const rows = await prisma.drillQuestion.findMany({
    where: {
      skill: bucket.skill,
      sub_skill: bucket.sub_skill,
      level: dbLevel,
      exam_id: EXAM_ID,
    },
    select: { prompt_text: true, source_key: true },
  });
  const prefix = `${sourceKeyPrefix(bucket)}_`;
  return rows.filter(r => r.source_key === null || r.source_key.startsWith(prefix));
}

export interface DbIndexResult {
  index: BucketIndex;
  /** Rows in this bucket that carry no key at all — cannot be matched or continued from. */
  unkeyedRows: number;
  /** Keys present in the bucket but not parseable under the current convention. */
  foreignKeys: string[];
}

/**
 * Turn fetched rows into a `BucketIndex`.
 *
 * Rows whose key does not parse are counted and reported rather than ignored: they
 * are keys this tool did not issue and cannot reason about, and if any exist the
 * operator needs to know before trusting the numbering.
 */
export function indexFromDbRows(rows: DbKeyedRow[], bucket: BucketTriple): DbIndexResult {
  const index = emptyBucketIndex();
  const wanted = bucketKey(bucket);
  const prefix = sourceKeyPrefix(bucket);
  const foreignKeys: string[] = [];
  let unkeyedRows = 0;
  const usable: string[] = [];

  for (const row of rows) {
    const key = row.source_key?.trim();
    if (!key) {
      unkeyedRows += 1;
      continue;
    }

    const parsed = parseSourceKey(key);
    if (parsed === null || bucketKey(parsed) !== wanted) {
      // Either unparseable, or a key whose encoded bucket is not this one.
      foreignKeys.push(key);
      continue;
    }

    usable.push(key);
    const prompt = normalizeForDuplicateCheck(row.prompt_text);
    if (prompt !== '' && !index.keyByPrompt.has(prompt)) {
      index.keyByPrompt.set(prompt, key);
    }
    if (!index.fileByKey.has(key)) {
      index.fileByKey.set(key, '(database)');
    }
  }

  index.highest = highestNumber(usable);

  // A bucket whose rows are keyed under a different prefix would produce a highest of
  // 0 while still occupying numbers, so surface that rather than silently restarting.
  if (index.highest === 0 && foreignKeys.length > 0) {
    foreignKeys.push(`(no key in this bucket matched the prefix "${prefix}_")`);
  }

  return { index, unkeyedRows, foreignKeys };
}

/**
 * Merge indexes, later arguments winning on a prompt conflict.
 *
 * Used to layer locally-tagged-but-not-yet-imported files on top of database state:
 * the database says what is live, the tagged folder says what is queued, and a key
 * issued in either place must not be handed out again.
 */
export function mergeBucketIndexes(...indexes: BucketIndex[]): BucketIndex {
  const merged = emptyBucketIndex();
  for (const index of indexes) {
    for (const [prompt, key] of index.keyByPrompt) merged.keyByPrompt.set(prompt, key);
    for (const [key, file] of index.fileByKey) merged.fileByKey.set(key, file);
    merged.highest = Math.max(merged.highest, index.highest);
  }
  return merged;
}
