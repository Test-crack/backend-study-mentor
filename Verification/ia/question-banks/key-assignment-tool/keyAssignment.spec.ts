/**
 * Regression tests for the IA key-assignment tool.
 *
 *   npx ts-node --project tsconfig.dev.json Verification/ia/question-banks/key-assignment-tool/keyAssignment.spec.ts
 *   npm run ia:assign-keys:test
 */

import { assertEqual, run, test } from '../../../drills/question-banks/shared/testRunner';
import type { BucketTriple, IACsvRow } from '../shared/types';
import { assignKeys, emptyBucketIndex } from './assignKeys';
import { parseSourceKey, formatSourceKey } from '../shared/sourceKey';

const BUCKET: BucketTriple = { skill: 'READING', sub_skill: 'READING', difficulty: 'BEGINNER' };

function row(line: number, prompt: string, source_key?: string): IACsvRow {
  return {
    line,
    cells: [],
    skill: 'READING',
    sub_skill: 'READING',
    difficulty: 'BEGINNER',
    question_type: 'MCQ',
    passage_id: 'p1',
    passage_text: 'passage',
    audio_url: '',
    prompt_text: prompt,
    options: '{"A":"1","B":"2","C":"3","D":"4"}',
    correct_answer: '"A"',
    explanation: 'because',
    exam_type: 'IELTS',
    ...(source_key === undefined ? {} : { source_key }),
  };
}

test('a brand-new batch is assigned sequential keys starting at 1', () => {
  const result = assignKeys([row(2, 'Question one?'), row(3, 'Question two?')], BUCKET, emptyBucketIndex());
  assertEqual(result.assignments.length, 2, 'two assignments');
  assertEqual(result.assignments[0].key, formatSourceKey(BUCKET, 1), 'first key');
  assertEqual(result.assignments[1].key, formatSourceKey(BUCKET, 2), 'second key');
  assertEqual(result.assignments[0].kind, 'assigned', 'first kind');
});

test('a row that already carries a valid key for this bucket keeps it untouched', () => {
  const existing = formatSourceKey(BUCKET, 5);
  const result = assignKeys([row(2, 'Question one?', existing)], BUCKET, emptyBucketIndex());
  assertEqual(result.assignments[0].key, existing, 'kept key');
  assertEqual(result.assignments[0].kind, 'kept', 'kept kind');
});

test('a resubmitted batch reuses the key for unchanged question text', () => {
  const index = emptyBucketIndex();
  index.keyByPrompt.set('question one?', formatSourceKey(BUCKET, 1));
  index.fileByKey.set(formatSourceKey(BUCKET, 1), 'earlier.csv');
  index.highest = 1;

  const result = assignKeys([row(2, 'Question one?'), row(3, 'Question two? (new)')], BUCKET, index);
  assertEqual(result.assignments[0].kind, 'reused', 'reused kind');
  assertEqual(result.assignments[0].key, formatSourceKey(BUCKET, 1), 'reused key');
  assertEqual(result.assignments[1].kind, 'assigned', 'new question gets a fresh key');
  assertEqual(result.assignments[1].key, formatSourceKey(BUCKET, 2), 'continues numbering past the highest seen');
});

test('a question missing from a resubmitted batch is reported as dropped, not silently discarded', () => {
  const index = emptyBucketIndex();
  index.keyByPrompt.set('question one?', formatSourceKey(BUCKET, 1));
  index.keyByPrompt.set('question two?', formatSourceKey(BUCKET, 2));
  index.fileByKey.set(formatSourceKey(BUCKET, 1), 'earlier.csv');
  index.fileByKey.set(formatSourceKey(BUCKET, 2), 'earlier.csv');
  index.highest = 2;

  const result = assignKeys([row(2, 'Question one?')], BUCKET, index);
  assertEqual(result.dropped.length, 1, 'one dropped key');
  assertEqual(result.dropped[0].key, formatSourceKey(BUCKET, 2), 'dropped key identity');
});

test('a row with no prompt text is skipped rather than given an identity', () => {
  const result = assignKeys([row(2, '')], BUCKET, emptyBucketIndex());
  assertEqual(result.assignments.length, 0, 'no assignments');
  assertEqual(result.skippedRows.length, 1, 'one skipped row');
});

test('formatSourceKey/parseSourceKey round-trip through the ia_ prefix', () => {
  const key = formatSourceKey(BUCKET, 42);
  assertEqual(key, 'ia_reading_reading_beginner_042', 'formatted key');
  const parsed = parseSourceKey(key);
  assertEqual(parsed?.skill, 'READING', 'parsed skill');
  assertEqual(parsed?.difficulty, 'BEGINNER', 'parsed difficulty');
  assertEqual(parsed?.num, 42, 'parsed number');
});

process.exitCode = run('IA key-assignment tool');
