/**
 * Regression tests for the IA importer's pure planning logic.
 *
 *   npx ts-node --project tsconfig.dev.json Verification/ia/question-banks/importer/importer.spec.ts
 *   npm run ia:import:test
 */

import { assertEqual, run, test } from '../../../drills/question-banks/shared/testRunner';
import type { IACsvRow } from '../shared/types';
import { formatSourceKey } from '../shared/sourceKey';
import { planImport, planRow, toImportRow, type ExistingRow } from './importer';

const BUCKET = { skill: 'READING', sub_skill: 'READING', difficulty: 'BEGINNER' };
const KEY = formatSourceKey(BUCKET, 1);

function mcqRow(overrides: Partial<IACsvRow> = {}): IACsvRow {
  return {
    line: 2,
    cells: [],
    skill: 'READING',
    sub_skill: 'READING',
    difficulty: 'BEGINNER',
    question_type: 'MCQ',
    passage_id: 'p1',
    passage_text: 'A passage.',
    audio_url: '',
    prompt_text: 'What does the passage say?',
    options: '{"A":"1","B":"2","C":"3","D":"4"}',
    correct_answer: '"A"',
    explanation: 'Because.',
    exam_type: 'IELTS',
    source_key: KEY,
    ...overrides,
  };
}

test('a well-formed MCQ row converts cleanly', () => {
  const converted = toImportRow(mcqRow());
  assertEqual('row' in converted, true, 'converts to a row, not an error');
  if ('row' in converted) {
    assertEqual(converted.row.correct_answer, 'A', 'correct_answer letter');
    assertEqual(converted.row.options?.A, '1', 'option A');
  }
});

test('a row whose source_key encodes a different bucket is rejected', () => {
  const wrongKey = formatSourceKey({ skill: 'WRITING', sub_skill: 'TASK_RESPONSE', difficulty: 'BEGINNER' }, 1);
  const converted = toImportRow(mcqRow({ source_key: wrongKey }));
  assertEqual('error' in converted, true, 'bucket mismatch is an error');
});

test('a row missing its source_key is rejected', () => {
  const converted = toImportRow(mcqRow({ source_key: undefined }));
  assertEqual('error' in converted, true, 'missing source_key is an error');
});

test('planRow reports insert when no existing row, unchanged when identical, update when different', () => {
  const converted = toImportRow(mcqRow());
  if (!('row' in converted)) throw new Error('expected a converted row');

  assertEqual(planRow(converted.row, undefined).action, 'insert', 'insert when absent');

  const existing: ExistingRow = {
    source_key: KEY,
    skill: 'READING',
    sub_skill: 'READING',
    difficulty: 'BEGINNER',
    question_type: 'MCQ',
    passage_id: 'p1',
    passage_text: 'A passage.',
    audio_url: null,
    prompt_text: converted.row.prompt_text,
    options: converted.row.options,
    correct_answer: converted.row.correct_answer,
    explanation: converted.row.explanation,
    exam_type: 'IELTS',
  };
  assertEqual(planRow(converted.row, existing).action, 'unchanged', 'unchanged when identical');

  const changed = { ...existing, prompt_text: 'A different question.' };
  const plan = planRow(converted.row, changed);
  assertEqual(plan.action, 'update', 'update when a field differs');
  assertEqual(plan.changed.includes('prompt_text'), true, 'reports which field changed');
});

test('two rows sharing one source_key in a batch is a fatal duplicate, not two writes', () => {
  const plan = planImport([mcqRow({ line: 2 }), mcqRow({ line: 3 })], new Map());
  assertEqual(plan.plans.length, 1, 'only the first row is planned');
  assertEqual(plan.duplicateKeys.length, 1, 'the shared key is reported');
});

process.exitCode = run('IA importer — planning logic');
