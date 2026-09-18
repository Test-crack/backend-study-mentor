/**
 * Assigns a permanent `source_key` to every question in a Mock CSV.
 *
 * Ported from IA's assignKeys.ts, with one real structural difference: Mock
 * embeds `question_type` in the key (not difficulty), and a single bucket
 * file can legitimately mix question types (e.g. WRITING/TASK_RESPONSE has
 * both MCQ knowledge-check rows and a WRITING_PROMPT row, confirmed against
 * real data) — each question_type gets its own independent numbering
 * sequence, since that's what the real `mock_writing_task_response_mcq_001`
 * vs `mock_writing_task_response_writing_prompt_001` keys show. So the
 * "highest number so far" is tracked per exact source_key prefix (which
 * includes question_type), not per (skill, sub_skill) alone.
 */

import path from 'path';
import { findCsvFiles, loadMockCsv } from '../shared/csvLoader';
import { normalizeForDuplicateCheck } from '../../../drills/question-banks/shared/normalize';
import { formatSourceKey, keyMatchesBucket, parseSourceKey, sourceKeyPrefix } from '../shared/sourceKey';
import { normalizeEnumCell } from '../layer1-verifier/checks';
import { EXPECTED_HEADER, SOURCE_KEY_HEADER, type BucketPair, type MockCsvRow, type QuestionType } from '../shared/types';

export const TAGGED_HEADER: readonly string[] = [...EXPECTED_HEADER, SOURCE_KEY_HEADER];

export interface BucketIndex {
  keyByPrompt: Map<string, string>;
  fileByKey: Map<string, string>;
  /** Highest number seen so far, per exact source_key prefix (skill_subskill_questiontype). */
  highestByPrefix: Map<string, number>;
}

export function emptyBucketIndex(): BucketIndex {
  return { keyByPrompt: new Map(), fileByKey: new Map(), highestByPrefix: new Map() };
}

function bumpHighest(index: BucketIndex, prefix: string, num: number): void {
  index.highestByPrefix.set(prefix, Math.max(index.highestByPrefix.get(prefix) ?? 0, num));
}

export function buildBucketIndex(taggedDir: string, bucket: BucketPair): BucketIndex {
  const index = emptyBucketIndex();

  let files: string[];
  try {
    files = findCsvFiles(taggedDir);
  } catch {
    return index;
  }

  for (const filePath of files) {
    const loaded = loadMockCsv(filePath);
    if (loaded.fatal || !loaded.hasSourceKeyColumn) continue;

    for (const row of loaded.rows) {
      const rawKey = row.source_key?.trim();
      if (!rawKey) continue;

      const parsed = parseSourceKey(rawKey);
      if (parsed === null || !keyMatchesBucket(parsed, bucket)) continue;

      const prompt = normalizeForDuplicateCheck(row.prompt_text);
      if (prompt !== '' && !index.keyByPrompt.has(prompt)) index.keyByPrompt.set(prompt, rawKey);
      if (!index.fileByKey.has(rawKey)) index.fileByKey.set(rawKey, loaded.fileName);
      bumpHighest(index, sourceKeyPrefix(parsed), parsed.num);
    }
  }

  return index;
}

export type AssignmentKind = 'kept' | 'reused' | 'assigned';

export interface RowAssignment {
  row: MockCsvRow;
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
  skippedRows: MockCsvRow[];
}

export function assignKeys(rows: MockCsvRow[], bucket: BucketPair, index: BucketIndex): AssignmentResult {
  const assignments: RowAssignment[] = [];
  const skippedRows: MockCsvRow[] = [];
  const unclaimed = new Map(index.keyByPrompt);
  const usedKeys = new Set<string>();
  const nextByPrefix = new Map(index.highestByPrefix);

  const pending: MockCsvRow[] = [];
  for (const row of rows) {
    const existing = row.source_key?.trim();
    const parsed = existing ? parseSourceKey(existing) : null;

    if (existing && parsed !== null && keyMatchesBucket(parsed, bucket)) {
      assignments.push({ row, key: existing, kind: 'kept' });
      usedKeys.add(existing);
      const prefix = sourceKeyPrefix(parsed);
      nextByPrefix.set(prefix, Math.max(nextByPrefix.get(prefix) ?? 0, parsed.num));
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

    const questionType = normalizeEnumCell(row.question_type) as QuestionType;
    const triple = { skill: bucket.skill as any, sub_skill: bucket.sub_skill as any, question_type: questionType };
    const prefix = sourceKeyPrefix(triple);
    const next = (nextByPrefix.get(prefix) ?? 0) + 1;
    nextByPrefix.set(prefix, next);

    const key = formatSourceKey(triple, next);
    assignments.push({ row, key, kind: 'assigned' });
    usedKeys.add(key);
    unclaimed.delete(prompt);
  }

  const dropped: DroppedKey[] = [...unclaimed.values()]
    .filter(key => !usedKeys.has(key))
    .map(key => ({ key, fileName: index.fileByKey.get(key) ?? '(unknown file)' }))
    .sort((a, b) => a.key.localeCompare(b.key));

  return { assignments, dropped, skippedRows };
}

/** Render assignments as CSV cell rows in TAGGED_HEADER order. */
export function toTaggedRows(assignments: RowAssignment[]): string[][] {
  return assignments.map(({ row, key }) => [
    row.skill,
    row.sub_skill,
    row.question_type,
    row.task_type,
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

export function taggedOutputPath(outBaseDir: string, filePath: string): string {
  return path.join(outBaseDir, path.basename(filePath));
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
