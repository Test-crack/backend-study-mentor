/**
 * Regression tests for Layer 1.
 *
 *   npx ts-node --project tsconfig.dev.json Verification/question-banks/layer1-verifier/layer1.spec.ts
 *   npm run drills:verify:test
 *
 * Every one of the six bugs found in real production data has a fixture here, and
 * each fixture asserts the EXACT set of finding codes the verifier produces — not
 * merely that "something failed". That is the point: the tool this replaces would
 * have passed several of these files, and a test that only checks for non-zero
 * findings would let a regression swap one bug's detection for another's and still
 * go green.
 */

import fs from 'fs';
import path from 'path';
import {
  assert,
  assertEqual,
  assertSameSet,
  run,
  test,
} from '../shared/testRunner';
import { filenameWords, normalizeHeaderCell, normalizeForDuplicateCheck } from '../shared/normalize';
import { sheetNameFor } from '../shared/excelReport';
import { reportPathFor } from '../shared/reportNaming';
import type { BucketTriple, FileResult, RowOutcome } from '../shared/types';
import { levelFromPath, parseLevel } from '../shared/drillsLayout';
import {
  checkBucketAgainstFilename,
  checkBucketAgainstFolder,
  creditedLetters,
} from './checks';
import { expectedRowsFor, fileFindingsFlat, verifyFile, verifyRun } from './verify';

const FIXTURE_DIR = path.join(__dirname, '__fixtures__');

/** Resolve a fixture by its numeric prefix, so tests survive renaming the label. */
function fixture(prefix: string): string {
  const matches = fs.readdirSync(FIXTURE_DIR).filter(f => f.startsWith(`${prefix}-`));
  if (matches.length !== 1) {
    throw new Error(
      `Expected exactly one fixture with prefix "${prefix}-", found ${matches.length}: ` +
        `[${matches.join(', ')}]`,
    );
  }
  return path.join(FIXTURE_DIR, matches[0]);
}

function verify(prefix: string, expectedRowCount: number): FileResult {
  return verifyFile(fixture(prefix), { expectedRowCount });
}

function codesOf(file: FileResult): string[] {
  return fileFindingsFlat(file).map(f => f.code);
}

/** Lines a given code was reported at, sorted. */
function linesFor(file: FileResult, code: string): number[] {
  return fileFindingsFlat(file)
    .filter(f => f.code === code && f.line !== undefined)
    .map(f => f.line as number)
    .sort((a, b) => a - b);
}

/**
 * The core assertion: the file's findings are EXACTLY this set of codes, and the
 * file's overall outcome is exactly this. An unexpected extra code fails the test
 * just as loudly as a missing one.
 */
function expectFile(
  file: FileResult,
  expected: { codes: string[]; outcome: RowOutcome },
  label: string,
): void {
  assertSameSet(codesOf(file), expected.codes, `${label}: finding codes`);
  assertEqual(file.outcome, expected.outcome, `${label}: file outcome`);
}

// ---------------------------------------------------------------------------
// The happy path, and the two ways a good file could be wrongly rejected
// ---------------------------------------------------------------------------

test('01 happy path — a clean file passes with no findings', () => {
  const file = verify('01', 4);
  expectFile(file, { codes: [], outcome: 'pass' }, '01');
  assertEqual(file.rowResults.length, 4, '01: row count');
  assertEqual(file.bucket?.sub_skill, 'GRAMMAR', '01: bucket sub_skill');
});

test('17 Title Case header + UTF-8 BOM + CRLF still passes', () => {
  const file = verify('17', 3);
  expectFile(file, { codes: [], outcome: 'pass' }, '17');
  assertEqual(file.bucket?.skill, 'LISTENING', '17: bucket skill');
});

test('19 header with all 7 names in the wrong order is reported but rows still validate', () => {
  const file = verify('19', 3);
  expectFile(file, { codes: ['HEADER_COLUMN_MISMATCH'], outcome: 'fail' }, '19');
  // The point of remapping: the rows themselves are fine and must not be blamed.
  assert(
    file.rowResults.every(r => r.findings.length === 0),
    '19: rows should be clean once columns are remapped by name',
  );
});

// ---------------------------------------------------------------------------
// The six bugs found in real production data
// ---------------------------------------------------------------------------

test('BUG 1 — 02 whole-file bucket mislabel is caught by the filename check', () => {
  const file = verify('02', 3);
  expectFile(file, { codes: ['BUCKET_FILENAME_MISMATCH'], outcome: 'fail' }, '02');
  // Every row agrees with every other row, so nothing but the filename comparison
  // could have caught this. Assert the internal-consistency check stayed quiet.
  assert(!codesOf(file).includes('BUCKET_NOT_UNIFORM'), '02: rows are internally consistent');
  assert(
    !codesOf(file).includes('SUB_SKILL_INVALID'),
    '02: PRONUNCIATION is a valid enum member and a valid SPEAKING sub-skill',
  );
  const message = fileFindingsFlat(file)[0].message;
  assert(message.includes('PRONUNCIATION'), '02: message names what the rows say');
  assert(message.includes('VOCABULARY'), '02: message names what the filename says');
});

test('BUG 2 — 03 malformed header (literal "1" as first column) fails the file', () => {
  const file = verify('03', 3);
  expectFile(file, { codes: ['HEADER_COLUMN_MISMATCH'], outcome: 'fail' }, '03');
  // Column mapping is unknowable, so row checks must NOT run and invent findings.
  assertEqual(file.rowResults.length, 0, '03: no rows checked once the header is unusable');
});

test('BUG 3 — 04 header row duplicated as a data row is caught at its line', () => {
  const file = verify('04', 3);
  expectFile(file, { codes: ['EMBEDDED_HEADER_ROW'], outcome: 'fail' }, '04');
  assertSameSet(
    linesFor(file, 'EMBEDDED_HEADER_ROW').map(String),
    ['4'],
    '04: embedded header line',
  );
  // The bogus row is excluded from the data, so the 3 real rows still count as 3.
  assertEqual(file.rowResults.length, 3, '04: real row count excludes the header row');
});

test('BUG 4 — 05 mixed correct_answer encoding flags only the bare-token rows', () => {
  const file = verify('05', 4);
  expectFile(file, { codes: ['CORRECT_ANSWER_NOT_JSON'], outcome: 'fail' }, '05');
  assertSameSet(
    linesFor(file, 'CORRECT_ANSWER_NOT_JSON').map(String),
    ['3', '4'],
    '05: bare-token rows',
  );
});

test('BUG 5 — 06 duplicate option text is caught, including case/padding variants', () => {
  const file = verify('06', 3);
  expectFile(file, { codes: ['OPTION_TEXT_DUPLICATE'], outcome: 'fail' }, '06');
  assertSameSet(
    linesFor(file, 'OPTION_TEXT_DUPLICATE').map(String),
    ['2', '4'],
    '06: line 2 is an exact duplicate, line 4 differs only by surrounding whitespace',
  );
});

test('option comparison is case-sensitive, so stress-marked pronunciation items pass', () => {
  // Regression guard for a false positive found while building these fixtures:
  // RECord / reCORD / REcord / recORD are four distinct options that differ only
  // by capitalization, because capitalization is how these items mark stress.
  // Folding case here would hard-fail every correctly-written stress question.
  const file = verify('02', 3);
  assert(
    !codesOf(file).includes('OPTION_TEXT_DUPLICATE'),
    'stress-marked options must not be read as duplicates',
  );
});

test('BUG 6 — 07 duplicate prompts are reported on every copy', () => {
  const file = verify('07', 4);
  expectFile(file, { codes: ['PROMPT_DUPLICATE'], outcome: 'fail' }, '07');
  // Lines 2 and 4 are the same question twice — line 4 differs only by case and
  // spacing, so normalization must still fold them together.
  //
  // Line 5 repeats that prompt with a DIFFERENT option set and must NOT be flagged.
  // A shared prompt alone is not a duplicate: whole legitimate formats reuse one
  // instruction ("Which sentence is grammatically correct?", "Select the word that
  // does NOT belong with the others.") across every row. Keying on the prompt alone
  // reported 22 correct rows of the intermediate WRITING/VOCABULARY bank as
  // failures, which buries the real duplicates and invites someone to "fix" content
  // that was never broken.
  assertSameSet(
    linesFor(file, 'PROMPT_DUPLICATE').map(String),
    ['2', '4'],
    '07: only the copies sharing prompt AND options are flagged',
  );
  const message = fileFindingsFlat(file)[0].message;
  assert(message.includes('2 times'), '07: message states how many copies exist');
});

// ---------------------------------------------------------------------------
// Bucket checks
// ---------------------------------------------------------------------------

test('08 an invalid (skill, sub_skill) pair fails even though both enums are valid', () => {
  const file = verify('08', 3);
  expectFile(file, { codes: ['BUCKET_PAIR_INVALID'], outcome: 'fail' }, '08');
});

test('09 rows disagreeing on the bucket are reported with their row numbers', () => {
  const file = verify('09', 4);
  expectFile(file, { codes: ['BUCKET_NOT_UNIFORM'], outcome: 'fail' }, '09');
  const message = fileFindingsFlat(file)[0].message;
  // Row numbers, not raw CSV lines — the offending row is line 4 in the file
  // (1 header + 3 data rows before it), i.e. row 3 among the data rows, which is
  // the number a reviewer actually sees in the Excel report's own "Row #" column.
  assert(message.includes('row(s) 3'), `09: message names the offending row — got: ${message}`);
  // The majority bucket wins, so one bad row cannot redefine the file.
  assertEqual(file.bucket?.sub_skill, 'COHERENCE', '09: majority bucket');
});

test('18 a filename naming no sub-skill is undetermined, not a contradiction', () => {
  const file = verify('18', 3);
  expectFile(file, { codes: ['BUCKET_FILENAME_UNDETERMINED'], outcome: 'fail' }, '18');
});

// ---------------------------------------------------------------------------
// Row shape
// ---------------------------------------------------------------------------

test('10 every malformed options shape gets its own specific code', () => {
  const file = verify('10', 6);
  expectFile(
    file,
    {
      codes: [
        'OPTIONS_NOT_OBJECT',
        'OPTIONS_KEYS_WRONG',
        'OPTION_VALUE_EMPTY',
        'OPTION_VALUE_NOT_STRING',
        'OPTIONS_NOT_JSON',
      ],
      outcome: 'fail',
    },
    '10',
  );
  assertSameSet(linesFor(file, 'OPTIONS_NOT_OBJECT').map(String), ['2'], '10: array row');
  assertSameSet(
    linesFor(file, 'OPTIONS_KEYS_WRONG').map(String),
    ['3', '4'],
    '10: extra key E, and missing key D',
  );
  assertSameSet(linesFor(file, 'OPTION_VALUE_EMPTY').map(String), ['5'], '10: blank option');
  assertSameSet(linesFor(file, 'OPTION_VALUE_NOT_STRING').map(String), ['6'], '10: numeric option');
  assertSameSet(linesFor(file, 'OPTIONS_NOT_JSON').map(String), ['7'], '10: unparseable options');
});

test('11 correct_answer failure modes are distinguished from one another', () => {
  const file = verify('11', 4);
  expectFile(
    file,
    {
      codes: [
        'CORRECT_ANSWER_NOT_A_KEY',
        'CORRECT_ANSWER_NOT_A_STRING',
        'CORRECT_ANSWER_EMPTY',
      ],
      outcome: 'fail',
    },
    '11',
  );
  assertSameSet(linesFor(file, 'CORRECT_ANSWER_NOT_A_KEY').map(String), ['2'], '11: "E"');
  assertSameSet(linesFor(file, 'CORRECT_ANSWER_NOT_A_STRING').map(String), ['3'], '11: number 1');
  assertSameSet(linesFor(file, 'CORRECT_ANSWER_EMPTY').map(String), ['4'], '11: empty');
  assertEqual(file.rowResults[3].outcome, 'pass', '11: the control row passes');
});

test('12 blank prompt_text and blank explanation are separate findings', () => {
  const file = verify('12', 3);
  expectFile(file, { codes: ['PROMPT_TEXT_EMPTY', 'EXPLANATION_EMPTY'], outcome: 'fail' }, '12');
  assertSameSet(linesFor(file, 'PROMPT_TEXT_EMPTY').map(String), ['2'], '12: blank prompt line');
  assertSameSet(linesFor(file, 'EXPLANATION_EMPTY').map(String), ['3'], '12: blank explanation line');
});

test('14 wrong column counts are reported without aborting the file', () => {
  const file = verify('14', 4);
  // The 6-column row is also genuinely missing its explanation, so both codes are
  // expected — listing them explicitly is what keeps this assertion honest.
  expectFile(file, { codes: ['ROW_COLUMN_COUNT', 'EXPLANATION_EMPTY'], outcome: 'fail' }, '14');
  assertSameSet(
    linesFor(file, 'ROW_COLUMN_COUNT').map(String),
    ['3', '4'],
    '14: too few, then too many',
  );
  assertEqual(file.rowResults.length, 4, '14: all four rows still checked');
});

// ---------------------------------------------------------------------------
// Degenerate files
// ---------------------------------------------------------------------------

test('15 a header-only file fails rather than passing vacuously', () => {
  const file = verify('15', 3);
  expectFile(file, { codes: ['NO_DATA_ROWS'], outcome: 'fail' }, '15');
});

test('16 a zero-byte file fails rather than passing vacuously', () => {
  const file = verify('16', 3);
  expectFile(file, { codes: ['FILE_EMPTY'], outcome: 'fail' }, '16');
});

test('a nonexistent path is a finding, not a crash', () => {
  const file = verifyFile(path.join(FIXTURE_DIR, 'does-not-exist.csv'), { expectedRowCount: 3 });
  expectFile(file, { codes: ['FILE_UNREADABLE'], outcome: 'fail' }, 'missing file');
});

// ---------------------------------------------------------------------------
// Row count, via --expected
// ---------------------------------------------------------------------------

test('row count is checked against --expected, and only against it', () => {
  const right = verify('01', 4);
  assertSameSet(codesOf(right), [], 'expected=4 matches the fixture');

  const wrong = verify('01', 5);
  expectFile(wrong, { codes: ['ROW_COUNT_MISMATCH'], outcome: 'fail' }, 'expected=5');
  assert(
    fileFindingsFlat(wrong)[0].message.includes('--expected 4'),
    'the message tells the operator how to accept a legitimately smaller batch',
  );

  // The same mechanism covers a legitimately smaller Advanced batch: there is no
  // need for a 200-row fixture, because the expected count is a parameter.
  const tooMany = verify('01', 3);
  expectFile(tooMany, { codes: ['ROW_COUNT_MISMATCH'], outcome: 'fail' }, 'expected=3');
});

// ---------------------------------------------------------------------------
// Cross-file
// ---------------------------------------------------------------------------

test('20 two files claiming the same bucket is a run-level failure', () => {
  const runResult = verifyRun([fixture('20a'), fixture('20b')], { fallback: 2, byLevel: {} });
  assertSameSet(
    runResult.runFindings.map(f => f.code),
    ['DUPLICATE_BUCKET_ACROSS_FILES'],
    '20: run findings',
  );
  assertEqual(runResult.outcome, 'fail', '20: run outcome');
  // Neither file is broken on its own — the problem only exists across the pair.
  assert(
    runResult.files.every(f => f.fileFindings.length === 0),
    '20: each file is individually clean',
  );
});

test('a run of distinct clean buckets has no cross-file findings', () => {
  const runResult = verifyRun([fixture('20a')], { fallback: 2, byLevel: {} });
  assertSameSet(runResult.runFindings.map(f => f.code), [], 'single file: no cross-file findings');
  assertEqual(runResult.outcome, 'pass', 'single clean file: run outcome');
});

// ---------------------------------------------------------------------------
// The credit-language heuristic — must stay a warning, and must stay narrow
// ---------------------------------------------------------------------------

test('13 credit language warns without ever failing the file', () => {
  const file = verify('13', 6);
  expectFile(file, { codes: ['EXPLANATION_CREDITS_OTHER_LETTER'], outcome: 'warn' }, '13');
  assertSameSet(
    linesFor(file, 'EXPLANATION_CREDITS_OTHER_LETTER').map(String),
    ['2'],
    '13: only the row that explicitly credits a different letter',
  );
  const finding = fileFindingsFlat(file)[0];
  assertEqual(finding.severity, 'warn', '13: severity must never be fail');
  assert(
    finding.message.includes('false positive'),
    '13: the message must tell the reader this is a heuristic',
  );
});

test('credit language MUST FIRE on explicit crediting', () => {
  const mustFire: Array<[string, string]> = [
    ['The correct answer is A because the auxiliary must agree.', 'A'],
    ['Only option C uses the correct plural.', 'C'],
    ['Option B is correct here.', 'B'],
    ['Choice D is the right answer.', 'D'],
    ['Correct answer: B', 'B'],
    ['Only B is correct.', 'B'],
    ['(A) is the correct answer for this item.', 'A'],
    ['The correct answer is option D.', 'D'],
  ];
  for (const [text, letter] of mustFire) {
    const found = [...creditedLetters(text)];
    assertSameSet(found, [letter], `should credit ${letter}: "${text}"`);
  }
});

test('credit language MUST NOT FIRE on the phrasings that caused ~54 false positives', () => {
  const mustNotFire = [
    'Option A doubles the subject, which is a common error in spoken English.',
    'Option C is incorrect because the subject is plural.',
    'Unlike option B, this form agrees with the subject.',
    'Options A and C both fail the agreement test.',
    'Option D would be correct if the sentence described yesterday.',
    'Option A might be correct in informal speech.',
    'Only a few students choose this form.',
    'The word order in option B is unnatural.',
    'Distractors A, C and D all change the meaning.',
  ];
  for (const text of mustNotFire) {
    assertSameSet([...creditedLetters(text)], [], `should stay silent: "${text}"`);
  }
});

test('an explanation crediting two different letters is treated as ambiguous, not wrong', () => {
  // Two credited letters means the phrasing is unclear rather than incorrect, and
  // guessing would just recreate the false-positive problem.
  const letters = creditedLetters('Option A is correct for formal use. Option B is correct informally.');
  assertEqual(letters.size, 2, 'both letters detected');
});

// ---------------------------------------------------------------------------
// Filename tolerance against the REAL filenames
// ---------------------------------------------------------------------------

test('every real production filename validates against its true bucket', () => {
  const cases: Array<[string, BucketTriple]> = [
    [
      '_BEGINNER level MCQ for TestCrack IELTS  - SPEAKING · VOCABULARY.csv',
      { skill: 'SPEAKING', sub_skill: 'VOCABULARY', level: 'BEGINNER' },
    ],
    [
      '_BEGINNER level MCQ for TestCrack IELTS  - SPEAKING · GRAMMAR.csv',
      { skill: 'SPEAKING', sub_skill: 'GRAMMAR', level: 'BEGINNER' },
    ],
    [
      '_BEGINNER level MCQ for TestCrack IELTS  - WRITING ·  TASK_RESPONSE.csv',
      { skill: 'WRITING', sub_skill: 'TASK_RESPONSE', level: 'BEGINNER' },
    ],
    [
      '_BEGINNER level MCQ for TestCrack IELTS  - Reading.csv',
      { skill: 'READING', sub_skill: 'READING', level: 'BEGINNER' },
    ],
    [
      '_BEGINNER level MCQ for TestCrack IELTS  - Listening .csv',
      { skill: 'LISTENING', sub_skill: 'LISTENING', level: 'BEGINNER' },
    ],
    [
      'INTERMEDIATE level MCQ for TestCrack IELTS  - Speaking Vocabulary.csv',
      { skill: 'SPEAKING', sub_skill: 'VOCABULARY', level: 'INTERMEDIATE' },
    ],
    [
      'INTERMEDIATE level MCQ for TestCrack IELTS  - Writing - Grammar.csv',
      { skill: 'WRITING', sub_skill: 'GRAMMAR', level: 'INTERMEDIATE' },
    ],
    [
      'INTERMEDIATE level MCQ for TestCrack IELTS  - Writing -Coherence.csv',
      { skill: 'WRITING', sub_skill: 'COHERENCE', level: 'INTERMEDIATE' },
    ],
    [
      'INTERMEDIATE level MCQ for TestCrack IELTS  - Reading.csv',
      { skill: 'READING', sub_skill: 'READING', level: 'INTERMEDIATE' },
    ],
    [
      '_BEGINNER level MCQ for TestCrack IELTS  - WRITING ·  Task response.csv',
      { skill: 'WRITING', sub_skill: 'TASK_RESPONSE', level: 'BEGINNER' },
    ],
  ];

  for (const [fileName, bucket] of cases) {
    const findings = checkBucketAgainstFilename(fileName, bucket);
    assertSameSet(
      findings.map(f => f.code),
      [],
      `no false failure for: ${fileName}`,
    );
  }
});

test('the real mislabeled file is still caught against its real filename', () => {
  const findings = checkBucketAgainstFilename(
    'INTERMEDIATE level MCQ for TestCrack IELTS  - Speaking Vocabulary.csv',
    { skill: 'SPEAKING', sub_skill: 'PRONUNCIATION', level: 'INTERMEDIATE' },
  );
  assertSameSet(findings.map(f => f.code), ['BUCKET_FILENAME_MISMATCH'], 'real mislabel caught');
});

test('a wrong level or wrong skill in the filename is caught', () => {
  const wrongLevel = checkBucketAgainstFilename(
    'INTERMEDIATE level MCQ for TestCrack IELTS  - Reading.csv',
    { skill: 'READING', sub_skill: 'READING', level: 'BEGINNER' },
  );
  assertSameSet(wrongLevel.map(f => f.code), ['BUCKET_FILENAME_MISMATCH'], 'wrong level');

  const wrongSkill = checkBucketAgainstFilename(
    '_BEGINNER level MCQ for TestCrack IELTS  - Reading.csv',
    { skill: 'LISTENING', sub_skill: 'LISTENING', level: 'BEGINNER' },
  );
  // Both the skill word and the sub-skill word are absent, so two findings.
  assertEqual(wrongSkill.length, 2, 'wrong skill produces skill and sub-skill findings');
});

test('filename tokenizing survives the separators seen in the wild', () => {
  const words = filenameWords('_BEGINNER level MCQ for TestCrack IELTS  - WRITING ·  TASK_RESPONSE.csv');
  for (const expected of ['BEGINNER', 'WRITING', 'TASK', 'RESPONSE', 'IELTS', 'TESTCRACK']) {
    assert(words.has(expected), `expected word ${expected} in [${[...words].join(', ')}]`);
  }
  assert(!words.has('CSV'), 'the extension is stripped, not tokenized');

  // Written as one word or two, TASK_RESPONSE tokenizes identically.
  const underscored = filenameWords('x - TASK_RESPONSE.csv');
  const spaced = filenameWords('x - Task response.csv');
  assert(underscored.has('TASK') && underscored.has('RESPONSE'), 'underscored form');
  assert(spaced.has('TASK') && spaced.has('RESPONSE'), 'spaced form');
});

// ---------------------------------------------------------------------------
// Level folders — the filename check's sibling
// ---------------------------------------------------------------------------

test('a file in the wrong level folder is caught', () => {
  const bucket: BucketTriple = { skill: 'READING', sub_skill: 'READING', level: 'BEGINNER' };

  const rightPlace = checkBucketAgainstFolder(
    path.join('Verification', 'question-banks', 'drills', 'beginner', 'x.csv'),
    bucket,
  );
  assertSameSet(rightPlace.map(f => f.code), [], 'correctly filed');

  const wrongPlace = checkBucketAgainstFolder(
    path.join('Verification', 'question-banks', 'drills', 'advanced', 'x.csv'),
    bucket,
  );
  assertSameSet(
    wrongPlace.map(f => f.code),
    ['LEVEL_FOLDER_MISMATCH'],
    'BEGINNER rows sitting in advanced/',
  );

  // A file kept outside the level folders is skipped, not guessed at.
  const noFolder = checkBucketAgainstFolder(path.join('some', 'other', 'place', 'x.csv'), bucket);
  assertSameSet(noFolder.map(f => f.code), [], 'no level in the path means no claim to check');
});

test('level detection reads whole path segments only', () => {
  assertEqual(levelFromPath('/drills/beginner/a.csv'), 'BEGINNER', 'forward slashes');
  assertEqual(levelFromPath('C:\\drills\\ADVANCED\\a.csv'), 'ADVANCED', 'backslashes, any case');

  // "Advanced Projects" is not the advanced folder — matching a substring here
  // would raise a confident false failure on someone's directory name.
  assertEqual(levelFromPath('/Advanced Projects/banks/a.csv'), null, 'substring must not match');

  // Ambiguity is declined rather than resolved by guessing.
  assertEqual(levelFromPath('/drills/beginner/advanced/a.csv'), null, 'two levels in one path');
});

test('--level accepts any casing and rejects anything else', () => {
  assertEqual(parseLevel('beginner'), 'BEGINNER', 'lowercase');
  assertEqual(parseLevel('  Advanced '), 'ADVANCED', 'padded and mixed case');
  assertEqual(parseLevel('expert'), null, 'not a level');
});

test('expected row counts fall back per level', () => {
  const spec = { fallback: 200, byLevel: { ADVANCED: 50 } } as const;
  assertEqual(expectedRowsFor('/drills/beginner/a.csv', spec), 200, 'beginner uses the fallback');
  assertEqual(expectedRowsFor('/drills/advanced/a.csv', spec), 50, 'advanced uses its override');
  assertEqual(expectedRowsFor('/elsewhere/a.csv', spec), 200, 'no level folder uses the fallback');
});

// ---------------------------------------------------------------------------
// Normalization
// ---------------------------------------------------------------------------

test('header cells normalize across the casings real batches use', () => {
  assertEqual(normalizeHeaderCell('Sub Skill'), 'sub_skill', 'Title Case with a space');
  assertEqual(normalizeHeaderCell('  CORRECT_ANSWER '), 'correct_answer', 'padded upper snake');
  assertEqual(normalizeHeaderCell('Prompt  Text'), 'prompt_text', 'double space');
  assertEqual(normalizeHeaderCell('﻿skill'), 'skill', 'a BOM left on the first cell');
});

test('duplicate detection folds the typography a spreadsheet introduces', () => {
  const straight = normalizeForDuplicateCheck("What's the answer?");
  const curly = normalizeForDuplicateCheck('What’s the answer?');
  assertEqual(curly, straight, 'curly and straight apostrophes are the same question');

  const nbsp = normalizeForDuplicateCheck('What is  this?');
  assertEqual(nbsp, 'what is this?', 'NBSP and runs of spaces collapse');

  // Punctuation is NOT stripped: over-normalizing would merge genuinely different
  // questions and hide real duplicates behind a false clean result.
  assert(
    normalizeForDuplicateCheck('Is it A?') !== normalizeForDuplicateCheck('Is it A'),
    'trailing punctuation still distinguishes prompts',
  );
});

// ---------------------------------------------------------------------------
// Report naming
// ---------------------------------------------------------------------------

test('a report is named after what it covers, not just when it ran', () => {
  const drills = path.join('Verification', 'question-banks', 'drills');
  const at = new Date(2026, 7, 2, 18, 52, 48);

  const one = reportPathFor(
    'RESULTS',
    [path.join(drills, 'beginner', '_BEGINNER level MCQ - SPEAKING · FLUENCY.csv')],
    at,
  );
  assertEqual(
    one,
    path.join('RESULTS', 'beginner', 'speaking-fluency--20260802-185248.xlsx'),
    'single file: level folder, descriptive name',
  );

  // Reading and Listening name skill and sub-skill identically; not "reading-reading".
  const reading = reportPathFor(
    'RESULTS',
    [path.join(drills, 'intermediate', 'INTERMEDIATE level MCQ - Reading.csv')],
    at,
  );
  assertEqual(
    reading,
    path.join('RESULTS', 'intermediate', 'reading--20260802-185248.xlsx'),
    'skill == sub-skill collapses to one word',
  );

  // Multi-word sub-skills read as words, not underscores.
  const taskResponse = reportPathFor(
    'RESULTS',
    [path.join(drills, 'beginner', '_BEGINNER level MCQ - WRITING ·  TASK_RESPONSE.csv')],
    at,
  );
  assert(
    taskResponse.endsWith(path.join('beginner', 'writing-task-response--20260802-185248.xlsx')),
    `TASK_RESPONSE should read as writing-task-response, got ${taskResponse}`,
  );
});

test('multi-file runs are named by scope, and mixed levels stay at the top', () => {
  const drills = path.join('Verification', 'question-banks', 'drills');
  const at = new Date(2026, 7, 2, 18, 52, 48);

  const wholeLevel = reportPathFor(
    'RESULTS',
    [
      path.join(drills, 'beginner', 'a - SPEAKING · FLUENCY.csv'),
      path.join(drills, 'beginner', 'b - WRITING · GRAMMAR.csv'),
    ],
    at,
  );
  assertEqual(
    wholeLevel,
    path.join('RESULTS', 'beginner', 'all--20260802-185248.xlsx'),
    'one level, many files',
  );

  const mixed = reportPathFor(
    'RESULTS',
    [
      path.join(drills, 'beginner', 'a - SPEAKING · FLUENCY.csv'),
      path.join(drills, 'intermediate', 'b - WRITING · GRAMMAR.csv'),
    ],
    at,
  );
  assertEqual(
    mixed,
    path.join('RESULTS', 'all-levels--20260802-185248.xlsx'),
    'mixed levels do not claim a level folder',
  );
});

test('a file outside the level folders still gets a usable name', () => {
  const at = new Date(2026, 7, 2, 18, 52, 48);
  const loose = reportPathFor('RESULTS', [path.join('somewhere', 'Speaking Vocabulary.csv')], at);
  assertEqual(
    loose,
    path.join('RESULTS', 'speaking-vocabulary--20260802-185248.xlsx'),
    'no level folder means no subfolder, but the name still describes it',
  );

  const unrecognized = reportPathFor('RESULTS', [path.join('somewhere', 'random export.csv')], at);
  assert(
    unrecognized.endsWith(`random-export--20260802-185248.xlsx`),
    `unrecognized names fall back to a slug, got ${unrecognized}`,
  );
});

// ---------------------------------------------------------------------------
// Report plumbing
// ---------------------------------------------------------------------------

test('sheet names respect Excel limits and stay unique', () => {
  const taken = new Set<string>(['summary']);
  const mk = (bucket: BucketTriple | null, fileName: string): FileResult => ({
    filePath: fileName,
    fileName,
    bucket,
    fileFindings: [],
    rowResults: [],
    outcome: 'pass',
    expectedRowCount: 200,
  });

  const a = sheetNameFor(mk({ skill: 'SPEAKING', sub_skill: 'PRONUNCIATION', level: 'INTERMEDIATE' }, 'x.csv'), 0, taken);
  const b = sheetNameFor(mk({ skill: 'SPEAKING', sub_skill: 'PRONUNCIATION', level: 'INTERMEDIATE' }, 'y.csv'), 1, taken);
  const c = sheetNameFor(mk(null, '_BEGINNER level MCQ for TestCrack IELTS  - SPEAKING · VOCABULARY.csv'), 2, taken);

  for (const name of [a, b, c]) {
    assert(name.length > 0 && name.length <= 31, `"${name}" must be 1-31 chars, got ${name.length}`);
    assert(!/[:\\/?*[\]]/.test(name), `"${name}" must not contain characters Excel forbids`);
  }
  assert(a !== b, 'identical buckets still get distinct sheet names');
});

// ---------------------------------------------------------------------------
// source_key
// ---------------------------------------------------------------------------

test('21 a fully and correctly tagged file passes clean', () => {
  const file = verify('21', 4);
  expectFile(file, { codes: [], outcome: 'pass' }, '21 tagged clean');
  assertEqual(
    file.rowResults[3].row.source_key,
    'drill_writing_grammar_beginner_007',
    'a gap in the numbering is not an error — keys are labels, not a sequence',
  );
});

test('an untagged file is only faulted when source_key is required', () => {
  const untagged = fixture('01');

  expectFile(
    verifyFile(untagged, { expectedRowCount: 4 }),
    { codes: [], outcome: 'pass' },
    'untagged, keys not required',
  );

  expectFile(
    verifyFile(untagged, { expectedRowCount: 4, requireSourceKey: true }),
    { codes: ['SOURCE_KEY_COLUMN_ABSENT'], outcome: 'fail' },
    'untagged, keys required',
  );
});

test('22 every source_key failure mode gets its own specific code', () => {
  const file = verify('22', 5);
  expectFile(
    file,
    {
      codes: [
        'SOURCE_KEY_MISSING',
        'SOURCE_KEY_MALFORMED',
        'SOURCE_KEY_BUCKET_MISMATCH',
        'SOURCE_KEY_DUPLICATE',
        'SOURCE_KEY_DUPLICATE',
      ],
      outcome: 'fail',
    },
    '22 broken keys',
  );

  assertSameSet(
    linesFor(file, 'SOURCE_KEY_MISSING').map(String),
    ['2'],
    'the blank cell is reported at its own line',
  );
  assertSameSet(
    linesFor(file, 'SOURCE_KEY_DUPLICATE').map(String),
    ['5', '6'],
    'a duplicate key is reported on every copy, not just the second',
  );
});

test('a tagged file that is only half tagged fails rather than importing partially', () => {
  // The dangerous middle state: some rows keyed, some blank. The importer would
  // insert the keyed rows and have nothing to key the rest on.
  const file = verify('22', 5);
  const missing = fileFindingsFlat(file).filter(f => f.code === 'SOURCE_KEY_MISSING');
  assertEqual(missing.length, 1, 'the blank row is caught');
  assertEqual(file.outcome, 'fail', 'and blocks the whole file');
});

test('23 a second batch that restarted numbering collides across files', () => {
  const run1 = verifyRun([fixture('21'), fixture('23')], { fallback: 4, byLevel: {} });
  const codes = run1.runFindings.map(f => f.code);

  assert(
    codes.includes('SOURCE_KEY_DUPLICATE_ACROSS_FILES'),
    'two files sharing keys is a run-level failure — this is the collision the ' +
      'key-assignment tool exists to prevent',
  );
  assertEqual(
    run1.runFindings.filter(f => f.code === 'SOURCE_KEY_DUPLICATE_ACROSS_FILES').length,
    2,
    'one finding per colliding key (001 and 002)',
  );
  assertEqual(run1.outcome, 'fail', 'the run fails');
});

test('distinct keys across files raise nothing', () => {
  const run2 = verifyRun([fixture('21')], { fallback: 4, byLevel: {} });
  assertSameSet(
    run2.runFindings.map(f => f.code),
    [],
    'a single clean tagged file has no cross-file findings',
  );
});

process.exitCode = run('Layer 1 — Drill Question CSV Verifier');
