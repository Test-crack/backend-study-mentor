/**
 * Regression tests for Mock Layer 1.
 *
 *   npx ts-node --project tsconfig.dev.json Verification/mock/question-banks/layer1-verifier/layer1.spec.ts
 *   npm run mock:verify:test
 *
 * No static fixture files (no real CSVs exist yet for Mock) — every case
 * builds its own tiny CSV inline, same discipline as IA's inline-row tests:
 * assert the EXACT set of finding codes, not just "something failed".
 */

import fs from 'fs';
import path from 'path';
import { assertEqual, assertSameSet, run, test } from '../../../drills/question-banks/shared/testRunner';
import type { FileResult } from '../shared/types';
import { fileFindingsFlat, verifyFile } from './verify';

const HEADER = 'skill,sub_skill,question_type,task_type,passage_id,passage_text,audio_url,prompt_text,options,correct_answer,explanation,exam_type';
const TMP_DIR = path.join(__dirname, '__tmp__');
fs.mkdirSync(TMP_DIR, { recursive: true });

function quoteCell(c: string): string {
  return /[",\r\n]/.test(c) ? `"${c.replace(/"/g, '""')}"` : c;
}

function verifyRows(rows: string[][], expectedRowCount = rows.length, fileName = `.tmp-${Date.now()}-${Math.random().toString(36).slice(2)}.csv`): FileResult {
  const lines = rows.map(cells => cells.map(quoteCell).join(','));
  const tmp = path.join(TMP_DIR, fileName);
  fs.writeFileSync(tmp, `${HEADER}\r\n${lines.join('\r\n')}\r\n`, 'utf8');
  try {
    return verifyFile(tmp, { expectedRowCount });
  } finally {
    fs.unlinkSync(tmp);
  }
}

function codesOf(file: FileResult): string[] {
  return fileFindingsFlat(file).map(f => f.code);
}

test('a standalone knowledge-check MCQ (no passage, no audio) is valid', () => {
  const file = verifyRows(
    [['WRITING', 'VOCABULARY', 'MCQ', '', '', '', '', 'Pick the best word.', '{"A":"a","B":"b","C":"c","D":"d"}', '"B"', 'expl', 'IELTS']],
    1,
    'writing-vocabulary.csv',
  );
  assertSameSet(codesOf(file), [], 'no findings for a standalone MCQ');
  assertEqual(file.outcome, 'pass', 'outcome');
});

test('READING rows sharing a passage_id must share identical passage_text', () => {
  const clean = verifyRows(
    [
      ['READING', 'TASK_RESPONSE', 'TFNG', '', 'p1', 'Same passage text.', '', 'Claim one.', '', '"T"', 'expl', 'IELTS'],
      ['READING', 'TASK_RESPONSE', 'TFNG', '', 'p1', 'Same passage text.', '', 'Claim two.', '', '"F"', 'expl', 'IELTS'],
    ],
    2,
    'reading-task_response.csv',
  );
  assertSameSet(codesOf(clean), [], 'no findings when passage_text matches across the group');

  const inconsistent = verifyRows(
    [
      ['READING', 'TASK_RESPONSE', 'TFNG', '', 'p1', 'Passage version A.', '', 'Claim one.', '', '"T"', 'expl', 'IELTS'],
      ['READING', 'TASK_RESPONSE', 'TFNG', '', 'p1', 'Passage version B.', '', 'Claim two.', '', '"F"', 'expl', 'IELTS'],
    ],
    2,
    'reading-task_response.csv',
  );
  assertEqual(codesOf(inconsistent).includes('PASSAGE_TEXT_INCONSISTENT'), true, 'flags mismatched passage_text in one group');
});

test('LISTENING rows are grouped by audio_url, not passage_id (real data leaves passage_id blank)', () => {
  const file = verifyRows(
    [
      ['LISTENING', 'GRAMMAR', 'MCQ', '', '', '', '/audio/a.mp3', 'What time?', '{"A":"1","B":"2","C":"3","D":"4"}', '"A"', 'expl', 'IELTS'],
      ['LISTENING', 'GRAMMAR', 'MCQ', '', '', '', '/audio/a.mp3', 'Where?', '{"A":"1","B":"2","C":"3","D":"4"}', '"B"', 'expl', 'IELTS'],
    ],
    2,
    'listening-grammar.csv',
  );
  assertSameSet(codesOf(file), [], 'no findings for a clean shared-audio group');
});

test('WRITING_PROMPT requires a valid task_type', () => {
  const missing = verifyRows(
    [['WRITING', 'TASK_RESPONSE', 'WRITING_PROMPT', '', '', '', '', 'Describe the chart.', '', '', '', 'IELTS']],
    1,
    'writing-task_response.csv',
  );
  assertEqual(codesOf(missing).includes('TASK_TYPE_REQUIRED'), true, 'missing task_type on a prompt row');

  const invalid = verifyRows(
    [['WRITING', 'TASK_RESPONSE', 'WRITING_PROMPT', 'Task9', '', '', '', 'Describe the chart.', '', '', '', 'IELTS']],
    1,
    'writing-task_response.csv',
  );
  assertEqual(codesOf(invalid).includes('TASK_TYPE_INVALID'), true, 'invalid task_type value');

  const clean = verifyRows(
    [['WRITING', 'TASK_RESPONSE', 'WRITING_PROMPT', 'Task2', '', '', '', 'Some people believe...', '', '', '', 'IELTS']],
    1,
    'writing-task_response.csv',
  );
  assertSameSet(codesOf(clean), [], 'Task2 is accepted with no findings');
});

test('MCQ/TFNG rows must not carry a task_type', () => {
  const file = verifyRows([['LISTENING', 'GRAMMAR', 'MCQ', 'Task1', '', '', '', 'q?', '{"A":"1","B":"2","C":"3","D":"4"}', '"A"', 'expl', 'IELTS']]);
  assertEqual(codesOf(file).includes('TASK_TYPE_NOT_ALLOWED'), true, 'flags task_type on a non-prompt row');
});

test('a standalone MCQ with passage_text set (but no passage_id) is rejected', () => {
  const file = verifyRows([['WRITING', 'VOCABULARY', 'MCQ', '', '', 'stray passage text', '', 'q?', '{"A":"1","B":"2","C":"3","D":"4"}', '"A"', 'expl', 'IELTS']]);
  assertEqual(codesOf(file).includes('PASSAGE_TEXT_PRESENT_BUT_NOT_ALLOWED'), true, 'flags passage_text with no passage_id group');
});

test('a file whose rows disagree on (skill, sub_skill) is BUCKET_NOT_UNIFORM', () => {
  const file = verifyRows([
    ['WRITING', 'VOCABULARY', 'MCQ', '', '', '', '', 'q1?', '{"A":"1","B":"2","C":"3","D":"4"}', '"A"', 'expl', 'IELTS'],
    ['SPEAKING', 'FLUENCY', 'MCQ', '', '', '', '', 'q2?', '{"A":"1","B":"2","C":"3","D":"4"}', '"A"', 'expl', 'IELTS'],
  ]);
  assertEqual(codesOf(file).includes('BUCKET_NOT_UNIFORM'), true, 'flags a mixed-bucket file');
});

test('a WRITING_PROMPT row with options filled in is rejected', () => {
  const file = verifyRows([['WRITING', 'TASK_RESPONSE', 'WRITING_PROMPT', 'Task2', '', '', '', 'Write about your city.', '{"A":"x"}', '', '', 'IELTS']]);
  assertEqual(codesOf(file).includes('OPTIONS_PRESENT_BUT_NOT_ALLOWED'), true, 'flags options on a prompt row');
});

test('an MCQ row missing options is a hard failure', () => {
  const file = verifyRows([['READING', 'VOCABULARY', 'MCQ', '', '', '', '', 'Question text?', '', '', 'expl', 'IELTS']]);
  const codes = codesOf(file);
  assertEqual(codes.includes('OPTIONS_EMPTY'), true, 'flags missing options on an MCQ row');
  assertEqual(codes.includes('CORRECT_ANSWER_EMPTY'), true, 'flags missing correct_answer on an MCQ row');
});

process.exitCode = run('Mock Layer 1 — structural verifier');
fs.rmSync(TMP_DIR, { recursive: true, force: true });
