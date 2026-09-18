/**
 * Tests for source_key formatting and assignment — Spoken English drills.
 *
 * SCOPE NOTE: forked from the IELTS keyAssignment.spec.ts, which hardcodes
 * IELTS-format expected strings (`drill_speaking_pronunciation_beginner_1234`)
 * and IELTS-only buckets (LISTENING, WRITING/TASK_RESPONSE) throughout its ~29
 * tests. Since this exam's key format is different (`se_drill_{subskill}_
 * {level}_{##}`, no skill segment, 2-digit pad) and its valid buckets are
 * different (SPEAKING only, 6 subskills, CEFR levels), those exact-string
 * assertions don't carry over as a mechanical rename. `assignKeys.ts` and
 * `dbIndex.ts`'s CORE numbering/reuse/drop logic is untouched, shared code —
 * already proven by the original 29-test IELTS suite (still green, unaffected
 * by anything in this fork) — so this suite focuses on what's actually new
 * here: the SE key format, and the exam_id/CEFR-level scoping added to
 * dbIndex.ts, rather than re-proving assignKeys.ts's generic logic from zero.
 *
 * The cases that matter most, same as the original:
 *  - a second batch for a bucket must continue numbering, not restart
 *  - a resubmitted batch must reuse the keys its unchanged questions already had
 *  - deleting a row must not renumber anything
 *  - re-running the tool on its own output must change nothing
 */

import fs from 'fs';
import os from 'os';
import path from 'path';
import { assert, assertEqual, run, test } from '../shared/testRunner';
import { loadDrillCsv, writeDrillCsv } from '../shared/csvLoader';
import {
  formatSourceKey,
  highestNumber,
  keyMatchesBucket,
  legalPrefixes,
  parseSourceKey,
} from '../shared/sourceKey';
import { EXPECTED_HEADER, type BucketTriple } from '../shared/types';
import {
  TAGGED_HEADER,
  assignKeys,
  buildBucketIndex,
  countKinds,
  emptyBucketIndex,
  toTaggedRows,
} from './assignKeys';
import { fetchBucketRows, indexFromDbRows, mergeBucketIndexes, EXAM_ID } from './dbIndex';

const BUCKET: BucketTriple = { skill: 'SPEAKING', sub_skill: 'PRONUNCIATION', level: 'B1' };

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'se-key-assignment-spec-'));

// ---------------------------------------------------------------------------
// formatSourceKey / parseSourceKey
// ---------------------------------------------------------------------------

test('a key is built as se_drill_{subskill}_{level}_{##}, 2-padded', () => {
  assertEqual(
    formatSourceKey(BUCKET, 1),
    'se_drill_phonology_b1_01',
    'skill is omitted; subskill is the CEFR label, not the DB enum word',
  );
  assertEqual(
    formatSourceKey({ skill: 'SPEAKING', sub_skill: 'INTERACTION', level: 'A2' }, 42),
    'se_drill_interaction_a2_42',
    'INTERACTION -> "interaction" (identity mapping for this one)',
  );
  assertEqual(
    formatSourceKey(BUCKET, 1234),
    'se_drill_phonology_b1_1234',
    'a bucket past 99 widens rather than wrapping',
  );
});

test('an unknown bucket throws instead of producing a key with undefined in it', () => {
  let threw = false;
  try {
    formatSourceKey({ skill: 'DANCING', sub_skill: 'PRONUNCIATION', level: 'B1' }, 1);
  } catch {
    threw = true;
  }
  assert(threw, 'a bogus skill must throw, not emit "se_drill_undefined_..."');
});

test('every legal prefix is exactly one of the 6 subskills x 5 CEFR levels (30 total)', () => {
  const prefixes = legalPrefixes();
  assertEqual(prefixes.length, 30, '6 subskills x 5 levels = 30 legal prefixes, no more no less');
  assert(prefixes.includes('se_drill_range_b1'), 'range/b1 is legal');
  assert(prefixes.includes('se_drill_interaction_c1'), 'interaction/c1 is legal');
  assertEqual(new Set(prefixes).size, 30, 'no prefix is ambiguous between two buckets');
});

test('a key round-trips through parse', () => {
  const parsed = parseSourceKey('se_drill_accuracy_b2_07');
  assert(parsed !== null, 'should parse');
  assertEqual(parsed?.sub_skill, 'GRAMMAR', 'accuracy -> GRAMMAR');
  assertEqual(parsed?.level, 'B2', 'level reads back as CEFR');
  assertEqual(parsed?.num, 7, 'number reads back');
});

test('the IELTS key format does NOT parse under this convention', () => {
  assert(
    parseSourceKey('drill_speaking_pronunciation_beginner_001') === null,
    'an IELTS-shaped key must not be mistaken for one of ours',
  );
});

test('a key knows which bucket it belongs to', () => {
  const parsed = parseSourceKey('se_drill_phonology_b1_01')!;
  assert(keyMatchesBucket(parsed, BUCKET), 'matches its own bucket');
  assert(
    !keyMatchesBucket(parsed, { ...BUCKET, sub_skill: 'FLUENCY' }),
    'a different sub-skill is a mismatch',
  );
  assert(
    !keyMatchesBucket(parsed, { ...BUCKET, level: 'C1' }),
    'a different level is a mismatch',
  );
});

test('highestNumber ignores keys it cannot read', () => {
  assertEqual(highestNumber([]), 0, 'nothing issued yet');
  assertEqual(
    highestNumber(['se_drill_phonology_b1_01', 'se_drill_phonology_b1_05', 'garbage']),
    5,
    'takes the max of the parseable ones',
  );
});

// ---------------------------------------------------------------------------
// assignKeys — numbering / reuse / drop behaviour
// ---------------------------------------------------------------------------

function row(prompt: string, sourceKey?: string) {
  return {
    line: 2,
    cells: [],
    skill: BUCKET.skill,
    sub_skill: BUCKET.sub_skill,
    level: BUCKET.level,
    prompt_text: prompt,
    options: '{"A":"one","B":"two","C":"three","D":"four"}',
    correct_answer: '"A"',
    explanation: 'because.',
    ...(sourceKey !== undefined ? { source_key: sourceKey } : {}),
  };
}

test('fresh rows are assigned 1, 2, 3... in order', () => {
  const result = assignKeys([row('Q1'), row('Q2'), row('Q3')], BUCKET, emptyBucketIndex());
  assertEqual(result.assignments.map(a => a.key).join(','), 'se_drill_phonology_b1_01,se_drill_phonology_b1_02,se_drill_phonology_b1_03', 'sequential');
  assertEqual(result.assignments.every(a => a.kind === 'assigned'), true, 'all newly assigned');
});

test('a row with an existing valid key for this bucket is kept, not reassigned', () => {
  const result = assignKeys(
    [row('Q1', 'se_drill_phonology_b1_05'), row('Q2')],
    BUCKET,
    emptyBucketIndex(),
  );
  assertEqual(result.assignments[0].key, 'se_drill_phonology_b1_05', 'kept as-is');
  assertEqual(result.assignments[0].kind, 'kept', 'reported as kept');
  assertEqual(result.assignments[1].key, 'se_drill_phonology_b1_06', 'continues past the kept number, not from 1');
  assertEqual(result.assignments[1].kind, 'assigned', 'newly assigned');
});

test('a second batch continues numbering rather than restarting at 01', () => {
  const index = { keyByPrompt: new Map(), fileByKey: new Map(), highest: 3 };
  const result = assignKeys([row('Q4'), row('Q5')], BUCKET, index);
  assertEqual(result.assignments[0].key, 'se_drill_phonology_b1_04', 'continues from the index highest');
  assertEqual(result.assignments[1].key, 'se_drill_phonology_b1_05', 'and the next one after that');
});

test('a resubmitted question (same prompt text) reuses its old key', () => {
  const index = {
    keyByPrompt: new Map([['q1', 'se_drill_phonology_b1_01']]),
    fileByKey: new Map([['se_drill_phonology_b1_01', 'batch1.csv']]),
    highest: 1,
  };
  const result = assignKeys([row('Q1')], BUCKET, index);
  assertEqual(result.assignments[0].key, 'se_drill_phonology_b1_01', 'reused, not a new number');
  assertEqual(result.assignments[0].kind, 'reused', 'reported as reused');
});

test('a question missing from a resubmitted batch is reported as dropped, not silently lost', () => {
  const index = {
    keyByPrompt: new Map([
      ['q1', 'se_drill_phonology_b1_01'],
      ['q2', 'se_drill_phonology_b1_02'],
    ]),
    fileByKey: new Map([
      ['se_drill_phonology_b1_01', 'batch1.csv'],
      ['se_drill_phonology_b1_02', 'batch1.csv'],
    ]),
    highest: 2,
  };
  // Only Q1 resubmitted — Q2 is missing from this batch.
  const result = assignKeys([row('Q1')], BUCKET, index);
  assertEqual(result.dropped.length, 1, 'Q2 should be reported as dropped');
  assertEqual(result.dropped[0].key, 'se_drill_phonology_b1_02', 'the missing key is named');
});

test('a row with no prompt text is skipped, not assigned a key it would fail on', () => {
  const result = assignKeys([row('')], BUCKET, emptyBucketIndex());
  assertEqual(result.assignments.length, 0, 'nothing assigned');
  assertEqual(result.skippedRows.length, 1, 'reported as skipped instead');
});

test('re-running on already-tagged rows is a no-op — same keys, all kept', () => {
  const first = assignKeys([row('Q1'), row('Q2')], BUCKET, emptyBucketIndex());
  const tagged = first.assignments.map(a => row(a.row.prompt_text, a.key));
  const index = { keyByPrompt: new Map(), fileByKey: new Map(), highest: first.highestAfter };
  const second = assignKeys(tagged, BUCKET, index);
  assertEqual(second.assignments.every(a => a.kind === 'kept'), true, 'every row already had a valid key');
  assertEqual(second.assignments.map(a => a.key).join(','), first.assignments.map(a => a.key).join(','), 'identical keys');
});

// ---------------------------------------------------------------------------
// buildBucketIndex — reading previously-tagged files off disk
// ---------------------------------------------------------------------------

test('buildBucketIndex reads a previously tagged file and ignores other buckets', () => {
  const dir = fs.mkdtempSync(path.join(TMP, 'tagged-'));
  writeDrillCsv(path.join(dir, 'b1.csv'), TAGGED_HEADER, [
    ['SPEAKING', 'PRONUNCIATION', 'B1', 'Q1', '{"A":"1","B":"2","C":"3","D":"4"}', '"A"', 'ok', 'se_drill_phonology_b1_01'],
    // Different bucket — must not be counted.
    ['SPEAKING', 'FLUENCY', 'B1', 'Q2', '{"A":"1","B":"2","C":"3","D":"4"}', '"A"', 'ok', 'se_drill_fluency_b1_01'],
  ]);
  const index = buildBucketIndex(dir, BUCKET);
  assertEqual(index.highest, 1, 'only counts the matching bucket');
  assertEqual(index.keyByPrompt.size, 1, 'only one prompt belongs to this bucket');
});

// ---------------------------------------------------------------------------
// dbIndex — exam_id scoping and CEFR-level -> DB-bucket translation
// ---------------------------------------------------------------------------

test('EXAM_ID is spoken_english — every DB read is scoped to it', () => {
  assertEqual(EXAM_ID, 'spoken_english', 'fixed exam scope for this pipeline');
});

test('fetchBucketRows queries the DB-bucket level (RecommendationLevel), not the CEFR level', async () => {
  let capturedWhere: unknown;
  const fakePrisma = {
    drillQuestion: {
      findMany: async (args: { where: unknown }) => {
        capturedWhere = args.where;
        return [];
      },
    },
    $disconnect: async () => {},
  };
  await fetchBucketRows(fakePrisma, BUCKET);
  assertEqual(
    (capturedWhere as { level: string }).level,
    'INTERMEDIATE',
    'B1 (CEFR) must be translated to INTERMEDIATE (the DB enum) before querying',
  );
  assertEqual((capturedWhere as { exam_id: string }).exam_id, 'spoken_english', 'scoped by exam_id');
});

test('indexFromDbRows filters out rows whose source_key belongs to a different bucket prefix', () => {
  const rows = [
    { prompt_text: 'Q1', source_key: 'se_drill_phonology_b1_01' },
    { prompt_text: 'Q2', source_key: 'se_drill_fluency_b1_01' }, // different bucket, should be excluded upstream in real use, but exercise the merge/foreign-key path
  ];
  const { index, foreignKeys } = indexFromDbRows(rows, BUCKET);
  assertEqual(index.highest, 1, 'only the matching-bucket key counts toward numbering');
  assert(foreignKeys.includes('se_drill_fluency_b1_01'), 'the other bucket\'s key is reported as foreign, not silently merged in');
});

test('mergeBucketIndexes: a locally-tagged file layered on top of DB state does not lose either', () => {
  const fromDb = { keyByPrompt: new Map([['q1', 'se_drill_phonology_b1_01']]), fileByKey: new Map([['se_drill_phonology_b1_01', '(database)']]), highest: 1 };
  const fromDisk = { keyByPrompt: new Map([['q2', 'se_drill_phonology_b1_02']]), fileByKey: new Map([['se_drill_phonology_b1_02', 'batch2.csv']]), highest: 2 };
  const merged = mergeBucketIndexes(fromDb, fromDisk);
  assertEqual(merged.keyByPrompt.size, 2, 'both prompts present');
  assertEqual(merged.highest, 2, 'takes the higher of the two baselines');
});

test('countKinds tallies kept/reused/assigned correctly', () => {
  const result = assignKeys(
    [row('Q1', 'se_drill_phonology_b1_01'), row('Q2'), row('Q3')],
    BUCKET,
    { keyByPrompt: new Map([['q3', 'se_drill_phonology_b1_09']]), fileByKey: new Map([['se_drill_phonology_b1_09', 'old.csv']]), highest: 9 },
  );
  const counts = countKinds(result.assignments);
  assertEqual(counts.kept, 1, 'Q1 kept its existing key');
  assertEqual(counts.reused, 1, 'Q3 reused its old key by matching text');
  assertEqual(counts.assigned, 1, 'Q2 got a brand-new key');
});

test('toTaggedRows renders in TAGGED_HEADER order', () => {
  const result = assignKeys([row('Q1')], BUCKET, emptyBucketIndex());
  const rendered = toTaggedRows(result.assignments);
  assertEqual(rendered[0][EXPECTED_HEADER.indexOf('prompt_text')], 'Q1', 'prompt_text lands in the right column');
  assertEqual(rendered[0][rendered[0].length - 1], result.assignments[0].key, 'source_key is the last column');
});

test('loadDrillCsv round-trips a tagged file written by writeDrillCsv', () => {
  const file = path.join(TMP, 'roundtrip.csv');
  writeDrillCsv(file, TAGGED_HEADER, [
    ['SPEAKING', 'INTERACTION', 'B2', 'Reply to this.', '{"A":"1","B":"2","C":"3","D":"4"}', '"B"', 'ok', 'se_drill_interaction_b2_01'],
  ]);
  const loaded = loadDrillCsv(file);
  assertEqual(loaded.fatal, false, 'should load cleanly');
  assertEqual(loaded.rows[0].sub_skill, 'INTERACTION', 'reads back the DB enum word');
  assertEqual(loaded.rows[0].level, 'B2', 'reads back the CEFR level, unmapped');
});

process.exitCode = run('Key-assignment tool — Spoken English drills');
fs.rmSync(TMP, { recursive: true, force: true });
