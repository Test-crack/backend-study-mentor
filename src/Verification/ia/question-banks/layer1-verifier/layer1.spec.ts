/**
 * Regression tests for IA Layer 1.
 *
 *   npx ts-node --project tsconfig.dev.json Verification/ia/question-banks/layer1-verifier/layer1.spec.ts
 *   npm run ia:verify:test
 *
 * Each fixture asserts the EXACT set of finding codes produced, not merely
 * that "something failed" — same discipline as drills' layer1.spec.ts.
 */

import fs from 'fs';
import path from 'path';
import { assertEqual, assertSameSet, run, test } from '../../../drills/question-banks/shared/testRunner';
import type { FileResult, RowOutcome } from '../shared/types';
import { fileFindingsFlat, verifyFile } from './verify';

const FIXTURE_DIR = path.join(__dirname, '__fixtures__');

function fixture(prefix: string): string {
  const matches = fs.readdirSync(FIXTURE_DIR).filter(f => f.startsWith(`${prefix}-`));
  if (matches.length !== 1) {
    throw new Error(`Expected exactly one fixture with prefix "${prefix}-", found ${matches.length}: [${matches.join(', ')}]`);
  }
  return path.join(FIXTURE_DIR, matches[0]);
}

function verify(prefix: string, expectedRowCount: number): FileResult {
  return verifyFile(fixture(prefix), { expectedRowCount });
}

function codesOf(file: FileResult): string[] {
  return fileFindingsFlat(file).map(f => f.code);
}

function expectFile(file: FileResult, expected: { codes: string[]; outcome: RowOutcome }, label: string): void {
  assertSameSet(codesOf(file), expected.codes, `${label}: finding codes`);
  assertEqual(file.outcome, expected.outcome, `${label}: file outcome`);
}

test('clean reading batch (MCQ + TFNG sharing a passage) passes with no findings', () => {
  const file = verify('01', 2);
  expectFile(file, { codes: [], outcome: 'pass' }, 'clean reading batch');
  assertEqual(file.bucket?.skill, 'READING', 'bucket skill');
  assertEqual(file.bucket?.sub_skill, 'READING', 'bucket sub_skill');
  assertEqual(file.bucket?.difficulty, 'BEGINNER', 'bucket difficulty');
});

test('a file whose rows disagree on difficulty is caught as BUCKET_NOT_UNIFORM', () => {
  const file = verify('02', 2);
  // The filename names no sub-skill either, which is a separate, expected finding here.
  expectFile(file, { codes: ['BUCKET_NOT_UNIFORM', 'BUCKET_FILENAME_UNDETERMINED'], outcome: 'fail' }, 'bucket mismatch batch');
});

test('WRITING_PROMPT/SPEAKING_PROMPT rows: a blank prompt is caught, a filled one is not over-checked for explanation/options', () => {
  const file = verify('03', 2);
  expectFile(file, { codes: ['PROMPT_TEXT_EMPTY', 'BUCKET_FILENAME_UNDETERMINED'], outcome: 'fail' }, 'speaking prompt batch');
});

test('a WRITING_PROMPT row with options filled in is rejected', () => {
  const file = verifyFileFromRows(
    ['WRITING', 'TASK_RESPONSE', 'BEGINNER', 'WRITING_PROMPT', '', '', '', 'Write about your city.', '{"A":"x"}', '', '', 'IELTS'],
  );
  const codes = fileFindingsFlat(file).map(f => f.code);
  assertEqual(codes.includes('OPTIONS_PRESENT_BUT_NOT_ALLOWED'), true, 'flags options on a prompt row');
});

test('an MCQ row missing options is a hard failure', () => {
  const file = verifyFileFromRows(
    ['READING', 'READING', 'BEGINNER', 'MCQ', 'p9', 'Some passage.', '', 'Question text?', '', '', 'expl', 'IELTS'],
  );
  const codes = fileFindingsFlat(file).map(f => f.code);
  assertEqual(codes.includes('OPTIONS_EMPTY'), true, 'flags missing options on an MCQ row');
  assertEqual(codes.includes('CORRECT_ANSWER_EMPTY'), true, 'flags missing correct_answer on an MCQ row');
});

// --- helper: build a one-off single-row CSV in a temp file for a targeted assertion ---
function verifyFileFromRows(cells: string[]): FileResult {
  const header = 'skill,sub_skill,difficulty,question_type,passage_id,passage_text,audio_url,prompt_text,options,correct_answer,explanation,exam_type';
  const quoted = cells.map(c => (/[",\r\n]/.test(c) ? `"${c.replace(/"/g, '""')}"` : c)).join(',');
  const tmp = path.join(FIXTURE_DIR, `.tmp-${Date.now()}-${Math.random().toString(36).slice(2)}.csv`);
  fs.writeFileSync(tmp, `${header}\r\n${quoted}\r\n`, 'utf8');
  try {
    return verifyFile(tmp, { expectedRowCount: 1 });
  } finally {
    fs.unlinkSync(tmp);
  }
}

process.exitCode = run('IA Layer 1 — structural verifier');
