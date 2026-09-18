/**
 * Reads already-issued Mock `source_key`s out of `mock_questions`. Read-only
 * — only ever SELECTs. Ported from IA's dbIndex.ts, filtered on
 * skill/sub_skill only (no difficulty column). Enum equality is used
 * instead of a `startsWith` on the key, same reasoning as IA's/drills' —
 * a `_` in a LIKE pattern is a wildcard.
 */

import { normalizeForDuplicateCheck } from '../../../drills/question-banks/shared/normalize';
import { parseSourceKey, sourceKeyPrefix, keyMatchesBucket } from '../shared/sourceKey';
import type { BucketPair } from '../shared/types';
import { emptyBucketIndex, type BucketIndex } from './assignKeys';

export interface DbKeyedRow {
  prompt_text: string;
  source_key: string | null;
}

/**
 * The narrow slice of PrismaClient this module needs, declared structurally
 * so the Verification tree typechecks with no generated client present.
 */
export interface MockQuestionReader {
  mockQuestion: {
    findMany(args: {
      where: { skill: string; sub_skill: string };
      select: { prompt_text: true; source_key: true };
    }): Promise<DbKeyedRow[]>;
  };
  $disconnect(): Promise<void>;
}

export async function fetchBucketRows(prisma: MockQuestionReader, bucket: BucketPair): Promise<DbKeyedRow[]> {
  return prisma.mockQuestion.findMany({
    where: { skill: bucket.skill, sub_skill: bucket.sub_skill },
    select: { prompt_text: true, source_key: true },
  });
}

export interface DbIndexResult {
  index: BucketIndex;
  unkeyedRows: number;
  foreignKeys: string[];
}

export function indexFromDbRows(rows: DbKeyedRow[], bucket: BucketPair): DbIndexResult {
  const index = emptyBucketIndex();
  const foreignKeys: string[] = [];
  let unkeyedRows = 0;

  for (const row of rows) {
    const key = row.source_key?.trim();
    if (!key) {
      unkeyedRows += 1;
      continue;
    }

    const parsed = parseSourceKey(key);
    if (parsed === null || !keyMatchesBucket(parsed, bucket)) {
      foreignKeys.push(key);
      continue;
    }

    const prompt = normalizeForDuplicateCheck(row.prompt_text);
    if (prompt !== '' && !index.keyByPrompt.has(prompt)) index.keyByPrompt.set(prompt, key);
    if (!index.fileByKey.has(key)) index.fileByKey.set(key, '(database)');
    const prefix = sourceKeyPrefix(parsed);
    index.highestByPrefix.set(prefix, Math.max(index.highestByPrefix.get(prefix) ?? 0, parsed.num));
  }

  if (index.highestByPrefix.size === 0 && foreignKeys.length > 0) {
    foreignKeys.push(`(no key in this bucket matched skill "${bucket.skill}" / sub_skill "${bucket.sub_skill}")`);
  }

  return { index, unkeyedRows, foreignKeys };
}

export function mergeBucketIndexes(...indexes: BucketIndex[]): BucketIndex {
  const merged = emptyBucketIndex();
  for (const index of indexes) {
    for (const [prompt, key] of index.keyByPrompt) merged.keyByPrompt.set(prompt, key);
    for (const [key, file] of index.fileByKey) merged.fileByKey.set(key, file);
    for (const [prefix, num] of index.highestByPrefix) {
      merged.highestByPrefix.set(prefix, Math.max(merged.highestByPrefix.get(prefix) ?? 0, num));
    }
  }
  return merged;
}
