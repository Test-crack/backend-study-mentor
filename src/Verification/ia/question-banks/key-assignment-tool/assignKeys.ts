/**
 * Assigns a permanent `source_key` to every question in an IA CSV.
 *
 * Ported from drills' assignKeys.ts — same rule (a key is allocated once and
 * persisted, never recomputed from row position) and same reuse-by-text
 * strategy for resubmitted batches. See that file for the long rationale;
 * only the bucket triple's third field changed (`difficulty`, not `level`).
 */

import path from 'path';
import { findCsvFiles, loadIACsv } from '../shared/csvLoader';
import { normalizeForDuplicateCheck } from '../../../drills/question-banks/shared/normalize';
import { formatSourceKey, highestNumber, parseSourceKey } from '../shared/sourceKey';
import { EXPECTED_HEADER, SOURCE_KEY_HEADER, bucketKey, type BucketTriple, type IACsvRow } from '../shared/types';

export const TAGGED_HEADER: readonly string[] = [...EXPECTED_HEADER, SOURCE_KEY_HEADER];

export interface BucketIndex {
  keyByPrompt: Map<string, string>;
  fileByKey: Map<string, string>;
  highest: number;
}

export function emptyBucketIndex(): BucketIndex {
  return { keyByPrompt: new Map(), fileByKey: new Map(), highest: 0 };
}

export function buildBucketIndex(taggedDir: string, bucket: BucketTriple): BucketIndex {
  const index = emptyBucketIndex();
  const wanted = bucketKey(bucket);

  let files: string[];
  try {
    files = findCsvFiles(taggedDir);
  } catch {
    return index;
  }

  for (const filePath of files) {
    const loaded = loadIACsv(filePath);
    if (loaded.fatal || !loaded.hasSourceKeyColumn) continue;

    for (const row of loaded.rows) {
      const rawKey = row.source_key?.trim();
      if (!rawKey) continue;

      const parsed = parseSourceKey(rawKey);
      if (parsed === null) continue;
      if (bucketKey(parsed) !== wanted) continue;

      const prompt = normalizeForDuplicateCheck(row.prompt_text);
      if (prompt !== '' && !index.keyByPrompt.has(prompt)) index.keyByPrompt.set(prompt, rawKey);
      if (!index.fileByKey.has(rawKey)) index.fileByKey.set(rawKey, loaded.fileName);
    }

    index.highest = Math.max(
      index.highest,
      highestNumber(
        loaded.rows
          .map(r => r.source_key?.trim())
          .filter((k): k is string => Boolean(k))
          .filter(k => {
            const p = parseSourceKey(k);
            return p !== null && bucketKey(p) === wanted;
          }),
      ),
    );
  }

  return index;
}

export type AssignmentKind = 'kept' | 'reused' | 'assigned';

export interface RowAssignment {
  row: IACsvRow;
  key: string;
  kind: AssignmentKind;
}

export interface DroppedKey {
  key: string;
  fileName: string;
}

export interface AssignmentResult {
  assignments: RowAssignment[];
  dropped: DroppedKey[];
  skippedRows: IACsvRow[];
  highestAfter: number;
}

export function assignKeys(rows: IACsvRow[], bucket: BucketTriple, index: BucketIndex): AssignmentResult {
  const assignments: RowAssignment[] = [];
  const skippedRows: IACsvRow[] = [];
  const unclaimed = new Map(index.keyByPrompt);
  const usedKeys = new Set<string>();
  let next = index.highest;

  const pending: IACsvRow[] = [];
  for (const row of rows) {
    const existing = row.source_key?.trim();
    const parsed = existing ? parseSourceKey(existing) : null;

    if (existing && parsed !== null && bucketKey(parsed) === bucketKey(bucket)) {
      assignments.push({ row, key: existing, kind: 'kept' });
      usedKeys.add(existing);
      next = Math.max(next, parsed.num);
      unclaimed.delete(normalizeForDuplicateCheck(row.prompt_text));
      continue;
    }
    pending.push(row);
  }

  for (const row of pending) {
    const prompt = normalizeForDuplicateCheck(row.prompt_text);

    if (prompt === '') {
      skippedRows.push(row);
      continue;
    }

    const previous = unclaimed.get(prompt);
    if (previous !== undefined && !usedKeys.has(previous)) {
      assignments.push({ row, key: previous, kind: 'reused' });
      usedKeys.add(previous);
      unclaimed.delete(prompt);
      continue;
    }

    next += 1;
    const key = formatSourceKey(bucket, next);
    assignments.push({ row, key, kind: 'assigned' });
    usedKeys.add(key);
    unclaimed.delete(prompt);
  }

  const dropped: DroppedKey[] = [...unclaimed.values()]
    .filter(key => !usedKeys.has(key))
    .map(key => ({ key, fileName: index.fileByKey.get(key) ?? '(unknown file)' }))
    .sort((a, b) => a.key.localeCompare(b.key));

  return { assignments, dropped, skippedRows, highestAfter: next };
}

/** Render assignments as CSV cell rows in TAGGED_HEADER order. */
export function toTaggedRows(assignments: RowAssignment[]): string[][] {
  return assignments.map(({ row, key }) => [
    row.skill,
    row.sub_skill,
    row.difficulty,
    row.question_type,
    row.passage_id,
    row.passage_text,
    row.audio_url,
    row.prompt_text,
    row.options,
    row.correct_answer,
    row.explanation,
    row.exam_type,
    key,
  ]);
}

export function taggedOutputPath(outBaseDir: string, filePath: string, difficulty: string | null): string {
  const fileName = path.basename(filePath);
  return difficulty === null ? path.join(outBaseDir, fileName) : path.join(outBaseDir, difficulty.toLowerCase(), fileName);
}

export interface AssignmentCounts {
  kept: number;
  reused: number;
  assigned: number;
}

export function countKinds(assignments: RowAssignment[]): AssignmentCounts {
  const counts: AssignmentCounts = { kept: 0, reused: 0, assigned: 0 };
  for (const a of assignments) counts[a.kind] += 1;
  return counts;
}
