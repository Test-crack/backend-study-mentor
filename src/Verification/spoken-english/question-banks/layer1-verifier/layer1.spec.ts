/**
 * Regression tests for Layer 1 — Spoken English drills.
 *
 *   npm run se:drills:verify:test
 *
 * SCOPE NOTE: the IELTS layer1.spec.ts this was forked from asserts 23 fixtures,
 * one per specific real-world bug found in production IELTS content (embedded
 * header rows, bucket mislabeling, BOM/CRLF handling, etc.) — each fixture lives
 * in __fixtures__/ as a hand-authored CSV. Those fixtures are IELTS content
 * (SPEAKING/WRITING/GRAMMAR rows) and were not carried over into this fork,
 * since authoring 23 equivalent Spoken-English-flavoured fixtures is itself a
 * real content task, not a mechanical rename.
 *
 * What IS covered here, for real, against on-disk CSVs written to a temp dir
 * (same technique keyAssignment.spec.ts uses) rather than checked-in fixtures:
 *  - the happy path (a clean, tagged file passes with zero findings)
 *  - the SE-specific enum surface (CEFR levels, the 6 subskill DB-enum words)
 *  - bucket-vs-filename and bucket-vs-folder cross-checks
 *  - the se_drill_{subskill}_{level}_{##} source_key format round-trips
 *  - the CEFR-level -> RecommendationLevel bucket mapping
 *
 * The underlying check FUNCTIONS (checkEnums, checkOptions, checkText, etc.) are
 * untouched copies of the already-tested IELTS logic — only the enum DATA changed
 * (see shared/types.ts) — so this suite deliberately does not re-prove every one
 * of the 23 IELTS regressions; it proves the SE-specific wiring is correct.
 *
 * TODO (follow-up, not done here): port the 23 IELTS fixtures to SE-flavoured
 * equivalents for full regression parity, the way __fixtures__ does for drills.
 */

import fs from 'fs';
import os from 'os';
import path from 'path';
import { assert, assertEqual, assertSameSet, run, test } from '../shared/testRunner';
import { writeDrillCsv } from '../shared/csvLoader';
import { verifyFile, verifyRun } from './verify';
import { EXPECTED_HEADER, SOURCE_KEY_HEADER, type ExpectedSpec } from '../shared/types';
import {
  formatSourceKey,
  parseSourceKey,
  sourceKeyPrefix,
} from '../shared/sourceKey';
import { LEVEL_TO_RECOMMENDATION_LEVEL, LEVEL_TO_BAND, SUB_SKILL_CEFR_LABEL } from '../shared/types';

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'se-layer1-spec-'));

function csvPath(name: string): string {
  return path.join(TMP, name);
}

const HEADER = [...EXPECTED_HEADER] as string[];
const TAGGED_HEADER = [...EXPECTED_HEADER, SOURCE_KEY_HEADER];

const EXPECTED_ONE: ExpectedSpec = { fallback: 1, byLevel: {} };

function goodOptions(): string {
  return JSON.stringify({ A: 'tired', B: 'angry', C: 'hungry', D: 'late' });
}

// ---------------------------------------------------------------------------
// Happy path
// ---------------------------------------------------------------------------

test('a clean, correctly-bucketed, tagged file passes with zero findings', () => {
  const key = formatSourceKey({ skill: 'SPEAKING', sub_skill: 'VOCABULARY', level: 'B1' }, 1);
  const file = csvPath('speaking-vocabulary-b1.csv');
  writeDrillCsv(
    file,
    TAGGED_HEADER,
    [
      [
        'SPEAKING',
        'VOCABULARY',
        'B1',
        'Choose the word closest to "exhausted".',
        goodOptions(),
        '"A"',
        '"exhausted" means very tired.',
        key,
      ],
    ],
  );

  const result = verifyFile(file, { expectedRowCount: 1, requireSourceKey: true });
  assertEqual(result.outcome, 'pass', 'clean file should pass');
  assertEqual(result.fileFindings.length, 0, 'clean file should have no file-level findings');
  assertEqual(result.rowResults[0]?.findings.length ?? -1, 0, 'clean row should have no findings');
});

// ---------------------------------------------------------------------------
// SE-specific enum surface
// ---------------------------------------------------------------------------

test('an invalid sub_skill (not one of the 6 mapped enum words) fails', () => {
  const file = csvPath('bad-subskill.csv');
  writeDrillCsv(file, HEADER, [
    ['SPEAKING', 'READING', 'B1', 'Some prompt.', goodOptions(), '"A"', 'because.'],
  ]);
  const result = verifyFile(file, { expectedRowCount: 1 });
  const codes = result.rowResults[0]?.findings.map(f => f.code) ?? [];
  assert(codes.includes('SUB_SKILL_INVALID'), 'READING is not a valid Spoken English sub_skill');
});

test('an invalid level (not a1/a2/b1/b2/c1) fails', () => {
  const file = csvPath('bad-level.csv');
  writeDrillCsv(file, HEADER, [
    ['SPEAKING', 'VOCABULARY', 'BEGINNER', 'Some prompt.', goodOptions(), '"A"', 'because.'],
  ]);
  const result = verifyFile(file, { expectedRowCount: 1 });
  const codes = result.rowResults[0]?.findings.map(f => f.code) ?? [];
  assert(
    codes.includes('LEVEL_INVALID'),
    'BEGINNER is an IELTS-shaped level, not a CEFR level this pipeline accepts',
  );
});

test('INTERACTION is accepted as a sub_skill by this pipeline (targets the not-yet-migrated enum)', () => {
  const file = csvPath('speaking-interaction-b1.csv');
  writeDrillCsv(file, HEADER, [
    [
      'SPEAKING',
      'INTERACTION',
      'B1',
      'A colleague asks for advice. Which reply best addresses it?',
      goodOptions(),
      '"A"',
      'directly answers what was asked.',
    ],
  ]);
  const result = verifyFile(file, { expectedRowCount: 1 });
  assertEqual(result.outcome, 'pass', 'INTERACTION should verify clean at the CSV layer');
});

// ---------------------------------------------------------------------------
// Bucket cross-checks (filename / folder)
// ---------------------------------------------------------------------------

test('bucket-vs-filename mismatch is caught', () => {
  // Filename says "accuracy", rows say range/VOCABULARY.
  const file = csvPath('se_drill_accuracy_b1.csv');
  writeDrillCsv(file, HEADER, [
    ['SPEAKING', 'VOCABULARY', 'B1', 'Some prompt.', goodOptions(), '"A"', 'because.'],
  ]);
  const result = verifyFile(file, { expectedRowCount: 1 });
  const bucketCodes = result.fileFindings.map(f => f.code);
  assert(
    bucketCodes.includes('BUCKET_FILENAME_MISMATCH') ||
      bucketCodes.includes('BUCKET_FILENAME_UNDETERMINED'),
    'filename names a different subskill than the rows do',
  );
});

// ---------------------------------------------------------------------------
// source_key format: se_drill_{subskill}_{level}_{##}
// ---------------------------------------------------------------------------

test('sourceKeyPrefix omits the skill segment (only one skill exists in this exam)', () => {
  const prefix = sourceKeyPrefix({ skill: 'SPEAKING', sub_skill: 'INTERACTION', level: 'B2' });
  assertEqual(prefix, 'se_drill_interaction_b2', 'prefix should be se_drill_{subskill}_{level}');
});

test('formatSourceKey / parseSourceKey round-trip through the CEFR label', () => {
  const bucket = { skill: 'SPEAKING', sub_skill: 'PRONUNCIATION', level: 'A2' };
  const key = formatSourceKey(bucket, 7);
  assertEqual(key, 'se_drill_phonology_a2_07', 'phonology, not pronunciation, in the key');

  const parsed = parseSourceKey(key);
  assert(parsed !== null, 'a key this tool formats must parse back');
  assertEqual(parsed?.sub_skill, 'PRONUNCIATION', 'parses back to the DB enum word');
  assertEqual(parsed?.level, 'A2', 'parses back to the CEFR level');
  assertEqual(parsed?.num, 7, 'parses back the numeric suffix');
});

test('pad is 2 digits, matching the content-data-requirement doc examples', () => {
  const key = formatSourceKey({ skill: 'SPEAKING', sub_skill: 'GRAMMAR', level: 'B1' }, 1);
  assertEqual(key, 'se_drill_accuracy_b1_01', 'single-digit numbers are 2-padded, not 3');
});

// ---------------------------------------------------------------------------
// CEFR level -> DB bucket / band mapping (used by the importer, not by Layer 1
// itself, but asserted here so the mapping table is covered by some test)
// ---------------------------------------------------------------------------

test('every CEFR level maps to exactly one RecommendationLevel bucket', () => {
  assertEqual(LEVEL_TO_RECOMMENDATION_LEVEL.A1, 'BEGINNER', 'a1 -> BEGINNER');
  assertEqual(LEVEL_TO_RECOMMENDATION_LEVEL.A2, 'BEGINNER', 'a2 -> BEGINNER');
  assertEqual(LEVEL_TO_RECOMMENDATION_LEVEL.B1, 'INTERMEDIATE', 'b1 -> INTERMEDIATE');
  assertEqual(LEVEL_TO_RECOMMENDATION_LEVEL.B2, 'INTERMEDIATE', 'b2 -> INTERMEDIATE');
  assertEqual(LEVEL_TO_RECOMMENDATION_LEVEL.C1, 'ADVANCED', 'c1 -> ADVANCED');
});

test('every CEFR level maps to exactly one pooling band', () => {
  assertEqual(LEVEL_TO_BAND.A1, 'A', 'a1 -> band A');
  assertEqual(LEVEL_TO_BAND.B2, 'B', 'b2 -> band B');
  assertEqual(LEVEL_TO_BAND.C1, 'C', 'c1 -> band C');
});

test('every DB sub_skill enum word has a CEFR label', () => {
  assertSameSet(
    Object.keys(SUB_SKILL_CEFR_LABEL),
    ['VOCABULARY', 'GRAMMAR', 'FLUENCY', 'COHERENCE', 'PRONUNCIATION', 'INTERACTION'],
    'all 6 mapped enum words must have a CEFR label',
  );
  assertEqual(SUB_SKILL_CEFR_LABEL.VOCABULARY, 'range', 'VOCABULARY means range in this exam');
  assertEqual(SUB_SKILL_CEFR_LABEL.PRONUNCIATION, 'phonology', 'PRONUNCIATION means phonology');
});

// ---------------------------------------------------------------------------
// A full run across two files (verifyRun, not just verifyFile)
// ---------------------------------------------------------------------------

test('verifyRun aggregates two clean files with no cross-file findings', () => {
  const keyA = formatSourceKey({ skill: 'SPEAKING', sub_skill: 'FLUENCY', level: 'B1' }, 1);
  const keyB = formatSourceKey({ skill: 'SPEAKING', sub_skill: 'COHERENCE', level: 'B1' }, 1);
  const fileA = csvPath('speaking-fluency-b1.csv');
  const fileB = csvPath('speaking-coherence-b1.csv');

  writeDrillCsv(fileA, TAGGED_HEADER, [
    ['SPEAKING', 'FLUENCY', 'B1', 'Talk for a minute about your weekend.', goodOptions(), '"A"', 'ok.', keyA],
  ]);
  writeDrillCsv(fileB, TAGGED_HEADER, [
    [
      'SPEAKING',
      'COHERENCE',
      'B1',
      "'I was tired; ___, I finished.'",
      JSON.stringify({ A: 'however', B: 'because', C: 'nevertheless', D: 'so' }),
      '"C"',
      'shows contrast.',
      keyB,
    ],
  ]);

  const run = verifyRun([fileA, fileB], EXPECTED_ONE, { requireSourceKey: true });
  assertEqual(run.outcome, 'pass', 'two independently clean files should pass as a run');
  assertEqual(run.runFindings.length, 0, 'no cross-file findings expected — different buckets');
});

process.exitCode = run('Layer 1 — Spoken English drills');
fs.rmSync(TMP, { recursive: true, force: true });
