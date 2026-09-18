/**
 * Regression tests for the Mock key-assignment tool.
 *
 *   npx ts-node --project tsconfig.dev.json Verification/mock/question-banks/key-assignment-tool/keyAssignment.spec.ts
 *   npm run mock:assign-keys:test
 */

import { assertEqual, run, test } from '../../../drills/question-banks/shared/testRunner';
import type { BucketPair, MockCsvRow } from '../shared/types';
import { assignKeys, emptyBucketIndex } from './assignKeys';
import { parseSourceKey, formatSourceKey, sourceKeyPrefix } from '../shared/sourceKey';

const BUCKET: BucketPair = { skill: 'READING', sub_skill: 'VOCABULARY' };
const TRIPLE = { skill: 'READING' as const, sub_skill: 'VOCABULARY' as const, question_type: 'MCQ' as const };

function row(line: number, prompt: string, source_key?: string): MockCsvRow {
  return {
    line,
    cells: [],
    skill: 'READING',
    sub_skill: 'VOCABULARY',
    question_type: 'MCQ',
    task_type: '',
    passage_id: '',
    passage_text: '',
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
  assertEqual(result.assignments[0].key, formatSourceKey(TRIPLE, 1), 'first key');
  assertEqual(result.assignments[1].key, formatSourceKey(TRIPLE, 2), 'second key');
  assertEqual(result.assignments[0].kind, 'assigned', 'first kind');
});

test('a row that already carries a valid key for this bucket keeps it untouched', () => {
  const existing = formatSourceKey(TRIPLE, 5);
  const result = assignKeys([row(2, 'Question one?', existing)], BUCKET, emptyBucketIndex());
  assertEqual(result.assignments[0].key, existing, 'kept key');
  assertEqual(result.assignments[0].kind, 'kept', 'kept kind');
});

test('a resubmitted batch reuses the key for unchanged question text', () => {
  const index = emptyBucketIndex();
  index.keyByPrompt.set('question one?', formatSourceKey(TRIPLE, 1));
  index.fileByKey.set(formatSourceKey(TRIPLE, 1), 'earlier.csv');
  index.highestByPrefix.set(sourceKeyPrefix(TRIPLE), 1);

  const result = assignKeys([row(2, 'Question one?'), row(3, 'Question two? (new)')], BUCKET, index);
  assertEqual(result.assignments[0].kind, 'reused', 'reused kind');
  assertEqual(result.assignments[0].key, formatSourceKey(TRIPLE, 1), 'reused key');
  assertEqual(result.assignments[1].kind, 'assigned', 'new question gets a fresh key');
  assertEqual(result.assignments[1].key, formatSourceKey(TRIPLE, 2), 'continues numbering past the highest seen');
});

test('a question missing from a resubmitted batch is reported as dropped, not silently discarded', () => {
  const index = emptyBucketIndex();
  index.keyByPrompt.set('question one?', formatSourceKey(TRIPLE, 1));
  index.keyByPrompt.set('question two?', formatSourceKey(TRIPLE, 2));
  index.fileByKey.set(formatSourceKey(TRIPLE, 1), 'earlier.csv');
  index.fileByKey.set(formatSourceKey(TRIPLE, 2), 'earlier.csv');
  index.highestByPrefix.set(sourceKeyPrefix(TRIPLE), 2);

  const result = assignKeys([row(2, 'Question one?')], BUCKET, index);
  assertEqual(result.dropped.length, 1, 'one dropped key');
  assertEqual(result.dropped[0].key, formatSourceKey(TRIPLE, 2), 'dropped key identity');
});

test('a row with no prompt text is skipped rather than given an identity', () => {
  const result = assignKeys([row(2, '')], BUCKET, emptyBucketIndex());
  assertEqual(result.assignments.length, 0, 'no assignments');
  assertEqual(result.skippedRows.length, 1, 'one skipped row');
});

test('numbering resets independently per question_type within the same (skill, sub_skill) bucket', () => {
  const mcqRow: MockCsvRow = { ...row(2, 'MCQ question?'), question_type: 'MCQ' };
  const tfngRow: MockCsvRow = { ...row(3, 'TFNG question?'), question_type: 'TFNG', task_type: '' };
  const result = assignKeys([mcqRow, tfngRow], { skill: 'READING', sub_skill: 'VOCABULARY' }, emptyBucketIndex());
  assertEqual(result.assignments[0].key, 'mock_reading_vocabulary_mcq_001', 'MCQ starts at 1');
  assertEqual(result.assignments[1].key, 'mock_reading_vocabulary_tfng_001', 'TFNG starts at 1 independently');
});

test('formatSourceKey/parseSourceKey round-trip through the mock_ prefix, including a multi-underscore type', () => {
  const key = formatSourceKey({ skill: 'SPEAKING', sub_skill: 'GRAMMAR', question_type: 'SPEAKING_PROMPT' }, 1);
  assertEqual(key, 'mock_speaking_grammar_speaking_prompt_001', 'formatted key');
  const parsed = parseSourceKey(key);
  assertEqual(parsed?.skill, 'SPEAKING', 'parsed skill');
  assertEqual(parsed?.sub_skill, 'GRAMMAR', 'parsed sub_skill');
  assertEqual(parsed?.question_type, 'SPEAKING_PROMPT', 'parsed question_type');
  assertEqual(parsed?.num, 1, 'parsed number');
});

process.exitCode = run('Mock key-assignment tool');
