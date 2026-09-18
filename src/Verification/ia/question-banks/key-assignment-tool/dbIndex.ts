/**
 * Reads already-issued IA `source_key`s out of `ia_questions`. Read-only —
 * only ever SELECTs. Ported from drills' dbIndex.ts; filters on skill/
 * sub_skill/difficulty instead of skill/sub_skill/level, since that's
 * IAQuestion's bucket. See that file for why enum equality is used instead
 * of a `startsWith` on the key (a `_` in a LIKE pattern is a wildcard).
 */

import { normalizeForDuplicateCheck } from '../../../drills/question-banks/shared/normalize';
import { highestNumber, parseSourceKey, sourceKeyPrefix } from '../shared/sourceKey';
import { bucketKey, type BucketTriple } from '../shared/types';
import { emptyBucketIndex, type BucketIndex } from './assignKeys';

export interface DbKeyedRow {
  prompt_text: string;
  source_key: string | null;
}

/**
 * The narrow slice of PrismaClient this module needs, declared structurally
 * so the Verification tree typechecks with no generated client present.
 */
export interface IAQuestionReader {
  iAQuestion: {
    findMany(args: {
      where: { skill: string; sub_skill: string; difficulty: string };
      select: { prompt_text: true; source_key: true };
    }): Promise<DbKeyedRow[]>;
  };
  $disconnect(): Promise<void>;
}

export async function fetchBucketRows(prisma: IAQuestionReader, bucket: BucketTriple): Promise<DbKeyedRow[]> {
  return prisma.iAQuestion.findMany({
    where: { skill: bucket.skill, sub_skill: bucket.sub_skill, difficulty: bucket.difficulty },
    select: { prompt_text: true, source_key: true },
  });
}

export interface DbIndexResult {
  index: BucketIndex;
  unkeyedRows: number;
  foreignKeys: string[];
}

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
      foreignKeys.push(key);
      continue;
    }

    usable.push(key);
    const prompt = normalizeForDuplicateCheck(row.prompt_text);
    if (prompt !== '' && !index.keyByPrompt.has(prompt)) index.keyByPrompt.set(prompt, key);
    if (!index.fileByKey.has(key)) index.fileByKey.set(key, '(database)');
  }

  index.highest = highestNumber(usable);

  if (index.highest === 0 && foreignKeys.length > 0) {
    foreignKeys.push(`(no key in this bucket matched the prefix "${prefix}_")`);
  }

  return { index, unkeyedRows, foreignKeys };
}

export function mergeBucketIndexes(...indexes: BucketIndex[]): BucketIndex {
  const merged = emptyBucketIndex();
  for (const index of indexes) {
    for (const [prompt, key] of index.keyByPrompt) merged.keyByPrompt.set(prompt, key);
    for (const [key, file] of index.fileByKey) merged.fileByKey.set(key, file);
    merged.highest = Math.max(merged.highest, index.highest);
  }
  return merged;
}
