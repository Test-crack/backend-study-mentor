/**
 * Assigns a permanent `source_key` to every question in a drill CSV.
 *
 * Content authors write 7-column CSVs and never see this column. This tool adds an
 * 8th, writing a stable label into each row, and saves the result alongside the
 * originals rather than over them. The importer then upserts on that label, which is
 * what makes re-running an import safe.
 *
 * ## The rule
 *
 * A key is allocated ONCE and then persisted in the file. It is never recomputed
 * from a row's position. The alternative — "this is the 3rd row of this bucket, so
 * it is _003" — breaks the first time a row is deleted: every later row shifts up
 * one, and the next import upserts each of them onto the *previous* row's database
 * record. That corrupts content silently, with no error and no crash, which is why
 * position is never used as an identity here.
 *
 * ## Recognising questions across batches
 *
 * Content is often resubmitted rather than edited in place: an author fixes two
 * questions by sending a fresh 200-row export of the whole batch. Naively that file
 * has no keys, so it would be tagged from scratch, and 198 unchanged questions would
 * be inserted a second time under new keys.
 *
 * So before assigning anything, the tool indexes every question it has already
 * tagged for that bucket (by normalized prompt text, the same comparison Layer 1
 * uses to detect duplicates) and reuses the existing key wherever the text matches.
 * Only genuinely new text gets a new number.
 *
 * Known limitation, deliberately not worked around: matching is on exact (folded)
 * prompt text, so a *reworded* question reads as new. There is no reliable way to
 * distinguish "reworded question 12" from "brand new question" from text alone, and
 * guessing would risk overwriting the wrong row — the worse of the two failures. A
 * reworded question therefore gets a new key, and its old key is reported as dropped
 * for a human to resolve.
 */

import path from 'path';
import { findCsvFiles, loadDrillCsv } from '../shared/csvLoader';
import { normalizeForDuplicateCheck } from '../shared/normalize';
import { formatSourceKey, highestNumber, parseSourceKey } from '../shared/sourceKey';
import {
  EXPECTED_HEADER,
  SOURCE_KEY_HEADER,
  bucketKey,
  type BucketTriple,
  type DrillCsvRow,
} from '../shared/types';

/** Header of a tagged file: the original 7 columns, with `source_key` appended. */
export const TAGGED_HEADER: readonly string[] = [...EXPECTED_HEADER, SOURCE_KEY_HEADER];

/** What is already known about one bucket, gathered from previously tagged files. */
export interface BucketIndex {
  /** normalized prompt text -> the key already issued to it. */
  keyByPrompt: Map<string, string>;
  /** Which file each already-issued key came from, for reporting drops usefully. */
  fileByKey: Map<string, string>;
  /** Highest number issued so far in this bucket. New keys continue from here. */
  highest: number;
}

export function emptyBucketIndex(): BucketIndex {
  return { keyByPrompt: new Map(), fileByKey: new Map(), highest: 0 };
}

/**
 * Build the index for one bucket by reading every already-tagged CSV in `taggedDir`.
 *
 * Reads the tagged output folder rather than the raw input folder, because that is
 * the only place a key has ever been written down. Files for other buckets are
 * skipped: a key encodes its own bucket, so cross-bucket numbering never interacts.
 *
 * Malformed keys are ignored for numbering (they cannot be continued from) but are
 * still reported by the caller through Layer 1, which is the thing that fails a file
 * for them.
 */
export function buildBucketIndex(taggedDir: string, bucket: BucketTriple): BucketIndex {
  const index = emptyBucketIndex();
  const wanted = bucketKey(bucket);

  let files: string[];
  try {
    files = findCsvFiles(taggedDir);
  } catch {
    // No tagged output yet — first run for this level.
    return index;
  }

  for (const filePath of files) {
    const loaded = loadDrillCsv(filePath);
    if (loaded.fatal || !loaded.hasSourceKeyColumn) continue;

    for (const row of loaded.rows) {
      const rawKey = row.source_key?.trim();
      if (!rawKey) continue;

      const parsed = parseSourceKey(rawKey);
      if (parsed === null) continue;
      if (bucketKey(parsed) !== wanted) continue;

      const prompt = normalizeForDuplicateCheck(row.prompt_text);
      // First write wins, so a key already recorded is never silently reassigned to
      // a different file's copy of the same question.
      if (prompt !== '' && !index.keyByPrompt.has(prompt)) {
        index.keyByPrompt.set(prompt, rawKey);
      }
      if (!index.fileByKey.has(rawKey)) {
        index.fileByKey.set(rawKey, loaded.fileName);
      }
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
  row: DrillCsvRow;
  key: string;
  kind: AssignmentKind;
}

export interface DroppedKey {
  key: string;
  /** The tagged file the key was last seen in. */
  fileName: string;
}

export interface AssignmentResult {
  assignments: RowAssignment[];
  /**
   * Keys previously issued for this bucket whose question text did not appear in
   * this batch. Reported, never acted on: deactivating a question is a content
   * decision, and this tool does not write to the database at all.
   */
  dropped: DroppedKey[];
  /** Rows skipped because they carry no usable prompt text to identify them by. */
  skippedRows: DrillCsvRow[];
  highestAfter: number;
}

/**
 * Decide a key for every row in one file.
 *
 * Precedence, in order:
 *   1. The row already has a valid key      -> keep it, untouched.
 *   2. Its prompt text was tagged before    -> reuse that key.
 *   3. Otherwise                            -> allocate the next free number.
 *
 * Step 1 comes first so that re-running the tool on its own output is a no-op, and
 * so a hand-fixed question keeps its identity even if its text changed.
 */
export function assignKeys(
  rows: DrillCsvRow[],
  bucket: BucketTriple,
  index: BucketIndex,
): AssignmentResult {
  const assignments: RowAssignment[] = [];
  const skippedRows: DrillCsvRow[] = [];
  const unclaimed = new Map(index.keyByPrompt);
  const usedKeys = new Set<string>();
  let next = index.highest;

  // Pass 1: rows that already carry a valid key for this bucket keep it. Done first
  // so their numbers are reserved before any new allocation happens.
  const pending: DrillCsvRow[] = [];
  for (const row of rows) {
    const existing = row.source_key?.trim();
    const parsed = existing ? parseSourceKey(existing) : null;

    if (existing && parsed !== null && bucketKey(parsed) === bucketKey(bucket)) {
      assignments.push({ row, key: existing, kind: 'kept' });
      usedKeys.add(existing);
      next = Math.max(next, parsed.num);
      // Its prompt is accounted for, so it must not later count as dropped.
      unclaimed.delete(normalizeForDuplicateCheck(row.prompt_text));
      continue;
    }
    pending.push(row);
  }

  // Pass 2: reuse-by-text, then allocate.
  for (const row of pending) {
    const prompt = normalizeForDuplicateCheck(row.prompt_text);

    if (prompt === '') {
      // No text to identify the row by. Giving it a key would mint an identity for
      // something Layer 1 is about to fail anyway (PROMPT_TEXT_EMPTY).
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

/**
 * Render assignments as CSV cell rows in TAGGED_HEADER order.
 *
 * Values are taken from the mapped fields rather than the raw `cells` array so that
 * a file whose columns arrived in a different order comes out normalized.
 */
export function toTaggedRows(assignments: RowAssignment[]): string[][] {
  return assignments.map(({ row, key }) => [
    row.skill,
    row.sub_skill,
    row.level,
    row.prompt_text,
    row.options,
    row.correct_answer,
    row.explanation,
    key,
  ]);
}

/** Where a tagged copy of `filePath` belongs, under `outBaseDir/<level>/`. */
export function taggedOutputPath(
  outBaseDir: string,
  filePath: string,
  level: string | null,
): string {
  const fileName = path.basename(filePath);
  return level === null
    ? path.join(outBaseDir, fileName)
    : path.join(outBaseDir, level.toLowerCase(), fileName);
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
