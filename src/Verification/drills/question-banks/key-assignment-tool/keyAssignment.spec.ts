/**
 * Tests for source_key formatting and assignment.
 *
 * The cases that matter most are the ones where a naive implementation silently
 * corrupts data rather than failing:
 *
 *  - a second batch for a bucket must continue numbering, not restart at 001
 *  - a resubmitted batch must reuse the keys its unchanged questions already had
 *  - deleting a row must not renumber anything
 *  - re-running the tool on its own output must change nothing
 *
 * Each of those is asserted below against on-disk fixtures written into a temp
 * directory, so the disk-scanning path is covered rather than mocked.
 */

import fs from 'fs';
import os from 'os';
import path from 'path';
import { parse } from 'csv-parse/sync';
import { assert, assertEqual, assertSameSet, run, test } from '../shared/testRunner';
import { loadDrillCsv, toCsvText, writeDrillCsv } from '../shared/csvLoader';
import {
  formatSourceKey,
  highestNumber,
  keyMatchesBucket,
  legalPrefixes,
  parseSourceKey,
} from '../shared/sourceKey';
import { EXPECTED_HEADER, type BucketTriple, type DrillCsvRow } from '../shared/types';
import {
  TAGGED_HEADER,
  assignKeys,
  buildBucketIndex,
  countKinds,
  emptyBucketIndex,
  toTaggedRows,
} from './assignKeys';
import { indexFromDbRows, mergeBucketIndexes } from './dbIndex';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const BUCKET: BucketTriple = {
  skill: 'SPEAKING',
  sub_skill: 'PRONUNCIATION',
  level: 'BEGINNER',
};

const OPTIONS = '{"A":"one","B":"two","C":"three","D":"four"}';

function makeRow(prompt: string, overrides: Partial<DrillCsvRow> = {}): DrillCsvRow {
  return {
    line: 2,
    cells: [],
    skill: BUCKET.skill,
    sub_skill: BUCKET.sub_skill,
    level: BUCKET.level,
    prompt_text: prompt,
    options: OPTIONS,
    correct_answer: '"A"',
    explanation: 'Because.',
    ...overrides,
  };
}

function rows(...prompts: string[]): DrillCsvRow[] {
  return prompts.map((p, i) => makeRow(p, { line: i + 2 }));
}

/** A fresh temp dir, removed by the OS eventually; each test gets its own. */
function tempDir(label: string): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), `keyassign-${label}-`));
}

/** Write a raw (untagged) 7-column CSV. */
function writeRaw(filePath: string, prompts: string[]): void {
  writeDrillCsv(
    filePath,
    EXPECTED_HEADER,
    prompts.map(p => [
      BUCKET.skill,
      BUCKET.sub_skill,
      BUCKET.level,
      p,
      OPTIONS,
      '"A"',
      'Because.',
    ]),
  );
}

/** Tag a raw file into `outDir`, returning the assignment result. */
function tagFile(rawPath: string, outDir: string) {
  const loaded = loadDrillCsv(rawPath);
  assertEqual(loaded.fatal, false, `fixture ${path.basename(rawPath)} should load`);
  const index = buildBucketIndex(outDir, BUCKET);
  const result = assignKeys(loaded.rows, BUCKET, index);
  writeDrillCsv(
    path.join(outDir, path.basename(rawPath)),
    TAGGED_HEADER,
    toTaggedRows(result.assignments),
  );
  return result;
}

function keysOf(result: { assignments: Array<{ key: string }> }): string[] {
  return result.assignments.map(a => a.key);
}

// ---------------------------------------------------------------------------
// formatSourceKey / parseSourceKey
// ---------------------------------------------------------------------------

test('a key is built from the bucket and zero-padded', () => {
  assertEqual(
    formatSourceKey({ skill: 'LISTENING', sub_skill: 'LISTENING', level: 'BEGINNER' }, 1),
    'drill_listening_listening_beginner_001',
    'the example from the naming convention',
  );
  assertEqual(
    formatSourceKey({ skill: 'WRITING', sub_skill: 'TASK_RESPONSE', level: 'ADVANCED' }, 42),
    'drill_writing_task_response_advanced_042',
    'multi-word sub-skills collapse, no inner underscore',
  );
  assertEqual(
    formatSourceKey(BUCKET, 1234),
    'drill_speaking_pronunciation_beginner_1234',
    'a bucket past 999 widens rather than wrapping',
  );
});

test('an unknown bucket throws instead of producing a key with undefined in it', () => {
  let threw = false;
  try {
    formatSourceKey({ skill: 'DANCING', sub_skill: 'GRAMMAR', level: 'BEGINNER' }, 1);
  } catch {
    threw = true;
  }
  assert(threw, 'a bogus skill must throw, not emit "drill_undefined_..."');
});

test('a key round-trips through parse', () => {
  const parsed = parseSourceKey('drill_writing_task_response_advanced_042');
  assert(parsed !== null, 'should parse');
  assertEqual(parsed!.skill, 'WRITING', 'skill');
  assertEqual(parsed!.sub_skill, 'TASK_RESPONSE', 'sub_skill');
  assertEqual(parsed!.level, 'ADVANCED', 'level');
  assertEqual(parsed!.num, 42, 'number');
});

test('malformed keys are rejected rather than half-understood', () => {
  const bad = [
    ['', 'empty'],
    ['drill_listening_listening_beginner', 'no number'],
    ['drill_listening_listening_beginner_1', 'unpadded'],
    ['drill_listening_listening_beginner_01', 'two digits'],
    ['drill_listening_listening_beginner_00x', 'not all digits'],
    ['drill_listening_listening_beginner_001_extra', 'trailing junk'],
    ['DRILL_LISTENING_LISTENING_BEGINNER_001', 'uppercase'],
    ['quiz_listening_listening_beginner_001', 'wrong prefix'],
    ['drill_listening_beginner_001', 'missing a segment'],
    ['drill_listen_listen_beg_001', 'the ABBREVIATED form from the task brief'],
    ['drill_listening_grammar_beginner_001', 'valid words, invalid skill/sub-skill pair'],
    ['drill_speaking_reading_beginner_001', 'valid words, invalid pair'],
  ];
  for (const [raw, why] of bad) {
    assertEqual(parseSourceKey(raw), null, `"${raw}" must not parse (${why})`);
  }
});

test('the abbreviated convention from the docs is deliberately NOT accepted', () => {
  // The task brief and prisma/seeds/README.md both specify drill_speak_pronun_beg_001.
  // The live table uses drill_speaking_pronunciation_beginner_001 for all 3,180 rows.
  // The data wins, and this test exists so that decision cannot be quietly reverted:
  // accepting both forms would let two keys denote one question and defeat the upsert.
  assertEqual(parseSourceKey('drill_speak_pronun_beg_001'), null, 'abbreviated must not parse');
  assertEqual(
    formatSourceKey(BUCKET, 1),
    'drill_speaking_pronunciation_beginner_001',
    'and is never emitted',
  );
});

test('there is exactly one legal prefix per valid bucket, matching the live table', () => {
  // 10 valid (skill, sub_skill) pairs x 3 levels. The live drill_questions table has
  // exactly 30 distinct key prefixes, which is what this is checked against.
  const prefixes = legalPrefixes();
  assertEqual(prefixes.length, 30, '30 legal prefixes');
  assert(
    prefixes.includes('drill_writing_task_response_beginner'),
    'the underscore-containing sub-skill is present',
  );
  assert(
    !prefixes.includes('drill_listening_grammar_beginner'),
    'an invalid pair has no prefix at all',
  );
  assertEqual(new Set(prefixes).size, 30, 'no prefix is ambiguous between two buckets');
});

test('a key knows which bucket it belongs to', () => {
  const parsed = parseSourceKey('drill_speaking_pronunciation_beginner_001')!;
  assert(keyMatchesBucket(parsed, BUCKET), 'matches its own bucket');
  assert(
    !keyMatchesBucket(parsed, { ...BUCKET, sub_skill: 'FLUENCY' }),
    'a different sub-skill is a mismatch',
  );
  assert(
    !keyMatchesBucket(parsed, { ...BUCKET, level: 'ADVANCED' }),
    'a different level is a mismatch',
  );
});

test('highestNumber ignores keys it cannot read', () => {
  assertEqual(highestNumber([]), 0, 'nothing issued yet');
  assertEqual(
    highestNumber(['drill_speaking_pronunciation_beginner_003', 'garbage', 'drill_speaking_pronunciation_beginner_017']),
    17,
    'the largest valid number wins and junk is skipped',
  );
});

// ---------------------------------------------------------------------------
// assignKeys — allocation
// ---------------------------------------------------------------------------

test('a first batch is numbered from 001 in file order', () => {
  const result = assignKeys(rows('Q one', 'Q two', 'Q three'), BUCKET, emptyBucketIndex());
  assertSameSet(
    keysOf(result),
    ['drill_speaking_pronunciation_beginner_001', 'drill_speaking_pronunciation_beginner_002', 'drill_speaking_pronunciation_beginner_003'],
    'three fresh keys',
  );
  assertEqual(countKinds(result.assignments).assigned, 3, 'all newly assigned');
  assertEqual(result.dropped.length, 0, 'nothing to drop on a first run');
});

test('rows that already carry a valid key keep it untouched', () => {
  const existing = rows('Q one', 'Q two').map((r, i) => ({
    ...r,
    source_key: formatSourceKey(BUCKET, i + 1),
  }));
  const result = assignKeys(existing, BUCKET, emptyBucketIndex());

  assertEqual(countKinds(result.assignments).kept, 2, 'both kept');
  assertEqual(countKinds(result.assignments).assigned, 0, 'nothing reassigned');
  assertEqual(
    keysOf(result)[0],
    'drill_speaking_pronunciation_beginner_001',
    'the original key survives verbatim',
  );
});

test('an existing key reserves its number so a new row cannot collide with it', () => {
  const mixed = [
    makeRow('Q one', { line: 2, source_key: 'drill_speaking_pronunciation_beginner_007' }),
    makeRow('Q two', { line: 3 }),
  ];
  const result = assignKeys(mixed, BUCKET, emptyBucketIndex());
  assertEqual(keysOf(result)[0], 'drill_speaking_pronunciation_beginner_007', 'kept');
  assertEqual(
    keysOf(result)[1],
    'drill_speaking_pronunciation_beginner_008',
    'the untagged row continues past the highest key present, not from 001',
  );
});

test('a key from another bucket is not kept — it is replaced for this bucket', () => {
  const strays = [makeRow('Q one', { source_key: 'drill_writing_grammar_intermediate_005' })];
  const result = assignKeys(strays, BUCKET, emptyBucketIndex());
  assertEqual(countKinds(result.assignments).kept, 0, 'not kept');
  assertEqual(
    keysOf(result)[0],
    'drill_speaking_pronunciation_beginner_001',
    'reissued under the bucket the file actually is',
  );
});

test('a row with no prompt text is left untagged rather than given an identity', () => {
  const result = assignKeys(rows('Q one', '   ', 'Q three'), BUCKET, emptyBucketIndex());
  assertEqual(result.assignments.length, 2, 'only the two real rows are tagged');
  assertEqual(result.skippedRows.length, 1, 'the blank row is reported, not silently dropped');
});

// ---------------------------------------------------------------------------
// The scenarios that motivated the design
// ---------------------------------------------------------------------------

test('SCENARIO: a second batch for the same bucket continues the numbering', () => {
  const dir = tempDir('continue');
  const raw1 = path.join(dir, 'raw', 'csv1 _BEGINNER SPEAKING PRONUNCIATION.csv');
  const raw2 = path.join(dir, 'raw', 'csv2 _BEGINNER SPEAKING PRONUNCIATION.csv');
  const out = path.join(dir, 'out');

  writeRaw(raw1, ['A one', 'A two', 'A three']);
  writeRaw(raw2, ['B one', 'B two']);

  const first = tagFile(raw1, out);
  assertSameSet(
    keysOf(first),
    ['drill_speaking_pronunciation_beginner_001', 'drill_speaking_pronunciation_beginner_002', 'drill_speaking_pronunciation_beginner_003'],
    'first batch takes 001-003',
  );

  const second = tagFile(raw2, out);
  assertSameSet(
    keysOf(second),
    ['drill_speaking_pronunciation_beginner_004', 'drill_speaking_pronunciation_beginner_005'],
    'second batch continues at 004 — restarting at 001 would collide in the database',
  );
  assertEqual(countKinds(second.assignments).assigned, 2, 'both are new content');
});

test('SCENARIO: resubmitting a batch with 1 changed question reuses the other keys', () => {
  const dir = tempDir('resubmit');
  const rawV1 = path.join(dir, 'raw', 'batch _BEGINNER SPEAKING PRONUNCIATION.csv');
  const out = path.join(dir, 'out');

  writeRaw(rawV1, ['Keep one', 'Keep two', 'Will be removed']);
  const v1 = tagFile(rawV1, out);
  assertEqual(countKinds(v1.assignments).assigned, 3, 'v1 assigns three');

  // The author resubmits the whole batch: two questions unchanged, the third swapped
  // for a new one. The incoming file has no source_key column at all.
  const rawV2 = path.join(dir, 'raw2', 'batch _BEGINNER SPEAKING PRONUNCIATION.csv');
  writeRaw(rawV2, ['Keep one', 'Keep two', 'Brand new question']);

  const loaded = loadDrillCsv(rawV2);
  const index = buildBucketIndex(out, BUCKET);
  const v2 = assignKeys(loaded.rows, BUCKET, index);

  const counts = countKinds(v2.assignments);
  assertEqual(counts.reused, 2, 'the two unchanged questions keep their original keys');
  assertEqual(counts.assigned, 1, 'only the genuinely new question gets a new key');
  assertEqual(
    keysOf(v2)[0],
    'drill_speaking_pronunciation_beginner_001',
    'reuse is by question text, so key 001 follows its question',
  );
  assertEqual(
    keysOf(v2)[2],
    'drill_speaking_pronunciation_beginner_004',
    'the new question continues the numbering rather than taking the freed 003',
  );

  assertEqual(v2.dropped.length, 1, 'the removed question is reported');
  assertEqual(
    v2.dropped[0].key,
    'drill_speaking_pronunciation_beginner_003',
    'and named by the exact key that is now orphaned',
  );
});

test('SCENARIO: re-running the tool on its own output changes nothing', () => {
  const dir = tempDir('idempotent');
  const raw = path.join(dir, 'raw', 'batch _BEGINNER SPEAKING PRONUNCIATION.csv');
  const out = path.join(dir, 'out');

  writeRaw(raw, ['One', 'Two', 'Three']);
  const first = tagFile(raw, out);
  const taggedPath = path.join(out, path.basename(raw));
  const afterFirst = fs.readFileSync(taggedPath, 'utf8');

  // Feed the tagged file back in as input.
  const reloaded = loadDrillCsv(taggedPath);
  assertEqual(reloaded.hasSourceKeyColumn, true, 'the tagged file has the 8th column');
  const second = assignKeys(reloaded.rows, BUCKET, buildBucketIndex(out, BUCKET));

  assertEqual(countKinds(second.assignments).kept, 3, 'every row keeps its key');
  assertEqual(countKinds(second.assignments).assigned, 0, 'nothing is reassigned');
  assertEqual(second.dropped.length, 0, 'nothing looks dropped');
  assertSameSet(keysOf(second), keysOf(first), 'the same keys, unchanged');

  writeDrillCsv(taggedPath, TAGGED_HEADER, toTaggedRows(second.assignments));
  assertEqual(
    fs.readFileSync(taggedPath, 'utf8'),
    afterFirst,
    're-writing produces a byte-identical file',
  );
});

test('SCENARIO: deleting a row does not renumber the rows after it', () => {
  const dir = tempDir('delete');
  const raw = path.join(dir, 'raw', 'batch _BEGINNER SPEAKING PRONUNCIATION.csv');
  const out = path.join(dir, 'out');

  writeRaw(raw, ['First', 'Second', 'Third']);
  tagFile(raw, out);

  // Second question deleted; First and Third resubmitted.
  const rawV2 = path.join(dir, 'raw2', 'batch _BEGINNER SPEAKING PRONUNCIATION.csv');
  writeRaw(rawV2, ['First', 'Third']);

  const v2 = assignKeys(
    loadDrillCsv(rawV2).rows,
    BUCKET,
    buildBucketIndex(out, BUCKET),
  );

  assertEqual(keysOf(v2)[0], 'drill_speaking_pronunciation_beginner_001', 'First keeps 001');
  assertEqual(
    keysOf(v2)[1],
    'drill_speaking_pronunciation_beginner_003',
    'Third keeps 003 — position-derived keys would have made it 002 and overwritten Second',
  );
  assertEqual(v2.dropped[0].key, 'drill_speaking_pronunciation_beginner_002', 'the gap is reported, not filled');
});

test('typography differences do not count as a different question', () => {
  const dir = tempDir('typography');
  const raw = path.join(dir, 'raw', 'batch _BEGINNER SPEAKING PRONUNCIATION.csv');
  const out = path.join(dir, 'out');

  writeRaw(raw, ["Where's the station?"]);
  tagFile(raw, out);

  // Same question, curly apostrophe and doubled spacing — what a word processor does.
  const rawV2 = path.join(dir, 'raw2', 'batch _BEGINNER SPEAKING PRONUNCIATION.csv');
  writeRaw(rawV2, ['Where’s  the station?']);

  const v2 = assignKeys(loadDrillCsv(rawV2).rows, BUCKET, buildBucketIndex(out, BUCKET));
  assertEqual(countKinds(v2.assignments).reused, 1, 'recognised as the same question');
  assertEqual(v2.dropped.length, 0, 'so nothing is reported as dropped');
});

test('keys already used in this batch are never handed to a second row', () => {
  // Two rows with identical text: the first claims the reused key, the second must
  // get its own rather than being given the same one (which would collapse them).
  const dir = tempDir('dupe-text');
  const raw = path.join(dir, 'raw', 'batch _BEGINNER SPEAKING PRONUNCIATION.csv');
  const out = path.join(dir, 'out');

  writeRaw(raw, ['Same question']);
  tagFile(raw, out);

  const rawV2 = path.join(dir, 'raw2', 'batch _BEGINNER SPEAKING PRONUNCIATION.csv');
  writeRaw(rawV2, ['Same question', 'Same question']);

  const v2 = assignKeys(loadDrillCsv(rawV2).rows, BUCKET, buildBucketIndex(out, BUCKET));
  const keys = keysOf(v2);
  assertEqual(keys.length, 2, 'both rows tagged');
  assert(keys[0] !== keys[1], 'two rows never share one key');
});

// ---------------------------------------------------------------------------
// Writing
// ---------------------------------------------------------------------------

test('written CSVs round-trip through the parser byte for byte', () => {
  // The options column is JSON and always contains double quotes, so quoting is the
  // thing most likely to be subtly wrong in a hand-rolled writer.
  const nasty = [
    [
      'SPEAKING',
      'PRONUNCIATION',
      'BEGINNER',
      'A prompt with a comma, quotes "like this", and a\nnewline',
      '{"A":"x, y","B":"say \\"hi\\"","C":"c","D":"d"}',
      '"A"',
      'Explanation, with "quotes" and, commas.',
      'drill_speaking_pronunciation_beginner_001',
    ],
  ];

  const text = toCsvText(TAGGED_HEADER, nasty);
  const parsed = parse(text, { bom: true, columns: false, skip_empty_lines: true }) as string[][];

  assertEqual(parsed.length, 2, 'header plus one row — the embedded newline is not a new row');
  assertSameSet(parsed[0], [...TAGGED_HEADER], 'header survives');
  for (let i = 0; i < nasty[0].length; i += 1) {
    assertEqual(parsed[1][i], nasty[0][i], `cell ${i} survives the round trip`);
  }
});

test('a tagged file re-reads with its keys attached to the right rows', () => {
  const dir = tempDir('reread');
  const raw = path.join(dir, 'raw', 'batch _BEGINNER SPEAKING PRONUNCIATION.csv');
  const out = path.join(dir, 'out');

  writeRaw(raw, ['Alpha', 'Beta']);
  tagFile(raw, out);

  const reloaded = loadDrillCsv(path.join(out, path.basename(raw)));
  assertEqual(reloaded.rows.length, 2, 'two rows');
  assertEqual(reloaded.rows[0].prompt_text, 'Alpha', 'first row text');
  assertEqual(reloaded.rows[0].source_key, 'drill_speaking_pronunciation_beginner_001', 'first row key');
  assertEqual(reloaded.rows[1].prompt_text, 'Beta', 'second row text');
  assertEqual(reloaded.rows[1].source_key, 'drill_speaking_pronunciation_beginner_002', 'second row key');
});

test('an untagged file reports no source_key column and undefined cells', () => {
  const dir = tempDir('untagged');
  const raw = path.join(dir, 'raw', 'batch _BEGINNER SPEAKING PRONUNCIATION.csv');
  writeRaw(raw, ['Alpha']);

  const loaded = loadDrillCsv(raw);
  assertEqual(loaded.hasSourceKeyColumn, false, 'no such column');
  assertEqual(
    loaded.rows[0].source_key,
    undefined,
    'undefined, not empty string — a missing column is not a blank cell',
  );
});

test('buildBucketIndex ignores files belonging to other buckets', () => {
  const dir = tempDir('other-bucket');
  const out = path.join(dir, 'out');

  // A tagged file for a DIFFERENT bucket sitting in the same output folder.
  writeDrillCsv(
    path.join(out, 'other _BEGINNER WRITING GRAMMAR.csv'),
    TAGGED_HEADER,
    [
      [
        'WRITING',
        'GRAMMAR',
        'BEGINNER',
        'Unrelated question',
        OPTIONS,
        '"A"',
        'Because.',
        'drill_writing_grammar_beginner_099',
      ],
    ],
  );

  const index = buildBucketIndex(out, BUCKET);
  assertEqual(index.highest, 0, 'another bucket does not advance this one');
  assertEqual(index.keyByPrompt.size, 0, 'and contributes no reusable keys');
});

test('buildBucketIndex on a folder that does not exist yet is empty, not a crash', () => {
  const index = buildBucketIndex(path.join(tempDir('missing'), 'nope'), BUCKET);
  assertEqual(index.highest, 0, 'first run for a level');
  assertEqual(index.keyByPrompt.size, 0, 'nothing indexed');
});

// ---------------------------------------------------------------------------
// Database index — the guard against overwriting live rows
// ---------------------------------------------------------------------------

test('DB rows set the numbering baseline so a new question cannot reuse a live key', () => {
  // The real situation: drill_questions already holds 200 keyed rows for this bucket
  // from an earlier seeding process. A brand-new question must become _201, never
  // _001 — that key belongs to a live question the importer would otherwise overwrite.
  const dbRows = Array.from({ length: 200 }, (_, i) => ({
    prompt_text: `Existing question ${i + 1}`,
    source_key: formatSourceKey(BUCKET, i + 1),
  }));

  const { index, unkeyedRows, foreignKeys } = indexFromDbRows(dbRows, BUCKET);
  assertEqual(index.highest, 200, 'baseline is the highest live key');
  assertEqual(unkeyedRows, 0, 'all live rows are keyed');
  assertEqual(foreignKeys.length, 0, 'and all parse');

  const result = assignKeys(rows('A brand new question'), BUCKET, index);
  assertEqual(
    keysOf(result)[0],
    'drill_speaking_pronunciation_beginner_201',
    'continues past the live rows',
  );
});

test('a question already live in the DB reuses its key instead of being inserted again', () => {
  const dbRows = [
    { prompt_text: 'Which word rhymes with day?', source_key: formatSourceKey(BUCKET, 5) },
    { prompt_text: 'How many syllables in elephant?', source_key: formatSourceKey(BUCKET, 6) },
  ];
  const { index } = indexFromDbRows(dbRows, BUCKET);

  // Jincy's CSV happens to contain one question that is already live, plus one new.
  const result = assignKeys(
    rows('Which word rhymes with day?', 'A genuinely new question'),
    BUCKET,
    index,
  );

  const counts = countKinds(result.assignments);
  assertEqual(counts.reused, 1, 'the already-live question keeps its key -> becomes an UPDATE');
  assertEqual(counts.assigned, 1, 'only the new one is allocated -> an INSERT');
  assertEqual(keysOf(result)[0], 'drill_speaking_pronunciation_beginner_005', 'its live key');
  assertEqual(keysOf(result)[1], 'drill_speaking_pronunciation_beginner_007', 'past the highest');
});

test('unkeyed and foreign live rows are reported, never silently ignored', () => {
  const dbRows = [
    { prompt_text: 'Keyed properly', source_key: formatSourceKey(BUCKET, 1) },
    { prompt_text: 'No key at all', source_key: null },
    { prompt_text: 'Blank key', source_key: '   ' },
    { prompt_text: 'Old abbreviated key', source_key: 'drill_speak_pronun_beg_099' },
    { prompt_text: 'Key from another bucket', source_key: 'drill_writing_grammar_beginner_004' },
  ];
  const { index, unkeyedRows, foreignKeys } = indexFromDbRows(dbRows, BUCKET);

  assertEqual(unkeyedRows, 2, 'null and blank both count as unkeyed');
  assertEqual(foreignKeys.length, 2, 'the abbreviated key and the other bucket key');
  assertEqual(index.highest, 1, 'only parseable in-bucket keys advance the baseline');
  assertEqual(index.keyByPrompt.size, 1, 'and only they are matchable');
});

test('merging indexes takes the highest baseline from either source', () => {
  // Live DB rows up to 200, plus a locally tagged file that already claimed 201-205
  // but has not been imported yet. A new question must land at 206.
  const { index: fromDb } = indexFromDbRows(
    [{ prompt_text: 'live', source_key: formatSourceKey(BUCKET, 200) }],
    BUCKET,
  );
  const fromDisk = emptyBucketIndex();
  fromDisk.highest = 205;
  fromDisk.keyByPrompt.set('queued question', formatSourceKey(BUCKET, 205));

  const merged = mergeBucketIndexes(fromDb, fromDisk);
  assertEqual(merged.highest, 205, 'the queued file wins the baseline');
  assertEqual(merged.keyByPrompt.size, 2, 'both sources contribute matchable prompts');

  const result = assignKeys(rows('brand new'), BUCKET, merged);
  assertEqual(
    keysOf(result)[0],
    'drill_speaking_pronunciation_beginner_206',
    'past both live and queued keys',
  );
});

test('an empty database is not mistaken for a reason to start over unsafely', () => {
  const { index, unkeyedRows, foreignKeys } = indexFromDbRows([], BUCKET);
  assertEqual(index.highest, 0, 'genuinely nothing issued');
  assertEqual(unkeyedRows, 0, 'nothing unkeyed');
  assertEqual(foreignKeys.length, 0, 'nothing foreign');
});

process.exitCode = run('Key-assignment tool');
