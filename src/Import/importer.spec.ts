/**
 * Tests for the importer's planning logic and target resolution.
 *
 * No database is touched. `importer.ts` is pure by construction, and the target
 * resolver takes an env object rather than reading `process.env`, so both are
 * exercised directly.
 *
 * The cases worth the most here are the ones where a plausible implementation writes
 * something wrong rather than failing:
 *
 *  - enum casing copied through verbatim instead of canonicalised
 *  - a re-run reporting "updated" for rows it did not change (defeating the
 *    idempotency proof the brief requires)
 *  - two rows sharing a source_key silently collapsing into one
 *  - `--target dev` accepted while connected to prod
 */

import { assert, assertEqual, assertSameSet, run, test } from '../Verification/drills/question-banks/shared/testRunner';
import type { BucketTriple, DrillCsvRow } from '../Verification/drills/question-banks/shared/types';
import {
  countActions,
  planImport,
  planRow,
  toImportRow,
  type ExistingRow,
  type ImportRow,
} from './importer';
import {
  DATABASE_FOR_TARGET,
  databaseNameFromUrl,
  parseTarget,
  redactUrl,
  resolveTarget,
  TargetError,
} from './target';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const OPTIONS = '{"A":"go","B":"goes","C":"going","D":"gone"}';

function csvRow(overrides: Partial<DrillCsvRow> = {}): DrillCsvRow {
  return {
    line: 2,
    cells: [],
    skill: 'WRITING',
    sub_skill: 'GRAMMAR',
    level: 'BEGINNER',
    prompt_text: 'She ___ to work.',
    options: OPTIONS,
    correct_answer: '"B"',
    explanation: 'Third-person singular takes -s.',
    source_key: 'drill_writing_grammar_beginner_001',
    ...overrides,
  };
}

function ok(row: DrillCsvRow): ImportRow {
  const result = toImportRow(row);
  if ('error' in result) throw new Error(`expected success, got: ${result.error}`);
  return result.row;
}

function err(row: DrillCsvRow): string {
  const result = toImportRow(row);
  if ('row' in result) throw new Error('expected an error, got a row');
  return result.error;
}

function existing(overrides: Partial<ExistingRow> = {}): ExistingRow {
  return {
    source_key: 'drill_writing_grammar_beginner_001',
    skill: 'WRITING',
    sub_skill: 'GRAMMAR',
    level: 'BEGINNER',
    drill_type: 'MCQ',
    prompt_text: 'She ___ to work.',
    options: { A: 'go', B: 'goes', C: 'going', D: 'gone' },
    correct_answer: 'B',
    explanation: 'Third-person singular takes -s.',
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// toImportRow — shaping
// ---------------------------------------------------------------------------

test('a good row converts to the exact shape the live table uses', () => {
  const row = ok(csvRow());
  assertEqual(row.source_key, 'drill_writing_grammar_beginner_001', 'key');
  assertEqual(row.skill, 'WRITING', 'skill');
  assertEqual(row.level, 'BEGINNER', 'level');
  assertEqual(row.drill_type, 'MCQ', 'drill_type is set by us, never read from the CSV');
  // correct_answer is a bare JSON string in the live table: "B", not {"answer":"B"}.
  assertEqual(row.correct_answer, 'B', 'correct_answer unwraps to a plain string');
  assertEqual(row.options.B, 'goes', 'options parse to an object');
  assertEqual(Object.keys(row.options).length, 4, 'exactly A-D');
});

test('enum cells are canonicalised, not copied through', () => {
  // Real batches disagree on casing and separators; the DB enum accepts one spelling.
  const row = ok(
    csvRow({
      skill: ' writing ',
      sub_skill: 'Task response',
      level: 'beginner',
      source_key: 'drill_writing_task_response_beginner_001',
    }),
  );
  assertEqual(row.skill, 'WRITING', 'lowercase + padding folded');
  assertEqual(row.sub_skill, 'TASK_RESPONSE', 'space becomes underscore, uppercased');
  assertEqual(row.level, 'BEGINNER', 'level uppercased');
});

test('an empty explanation becomes null rather than an empty string', () => {
  assertEqual(ok(csvRow({ explanation: '   ' })).explanation, null, 'blank -> null');
  assertEqual(ok(csvRow({ explanation: 'Why.' })).explanation, 'Why.', 'text preserved');
});

test('rows the database would reject are refused before any write', () => {
  assert(err(csvRow({ source_key: undefined })).includes('no source_key'), 'missing key');
  assert(err(csvRow({ source_key: 'nonsense' })).includes('not a valid key'), 'bad key');
  assert(err(csvRow({ skill: 'DANCING' })).includes('not a valid enum'), 'bad skill');
  assert(
    err(csvRow({ skill: 'LISTENING', sub_skill: 'GRAMMAR' })).includes('not a legal combination'),
    'illegal pair',
  );
  assert(err(csvRow({ prompt_text: '  ' })).includes('prompt_text is empty'), 'empty prompt');
  assert(err(csvRow({ options: '{not json' })).includes('not valid JSON'), 'bad options JSON');
  assert(err(csvRow({ options: '["a","b"]' })).includes('must be a JSON object'), 'array options');
  assert(err(csvRow({ options: '{"A":"x","B":"y","C":"z"}' })).includes('options.D'), 'missing D');
  assert(
    err(csvRow({ options: '{"A":"x","B":"y","C":"z","D":"w","E":"v"}' })).includes('unexpected key'),
    'extra option key',
  );
  // A bare A is not JSON — the exact bug found in a real export.
  assert(err(csvRow({ correct_answer: 'B' })).includes('not valid JSON'), 'bare token answer');
  assert(err(csvRow({ correct_answer: '"E"' })).includes('one of'), 'answer out of range');
});

test('a source_key naming a different bucket than its row is refused', () => {
  const message = err(
    csvRow({ source_key: 'drill_speaking_fluency_advanced_001' }),
  );
  assert(message.includes('encodes SPEAKING/FLUENCY/ADVANCED'), 'says what the key claims');
  assert(message.includes('WRITING/GRAMMAR/BEGINNER'), 'and what the row is');
});

// ---------------------------------------------------------------------------
// planRow — insert / update / unchanged
// ---------------------------------------------------------------------------

test('a key not in the database is an insert', () => {
  const plan = planRow(ok(csvRow()), undefined);
  assertEqual(plan.action, 'insert', 'insert');
  assertEqual(plan.changed.length, 0, 'nothing to diff against');
});

test('identical content is UNCHANGED, not a pointless update', () => {
  // This is what makes the brief's "run it twice, nothing changes" proof meaningful:
  // a second run must be able to say zero, not re-report every row as updated.
  const plan = planRow(ok(csvRow()), existing());
  assertEqual(plan.action, 'unchanged', 'unchanged');
  assertEqual(plan.changed.length, 0, 'no fields differ');
});

test('option key order does not count as a change', () => {
  const plan = planRow(
    ok(csvRow()),
    existing({ options: { D: 'gone', B: 'goes', A: 'go', C: 'going' } }),
  );
  assertEqual(plan.action, 'unchanged', 'JSON objects are compared by content, not key order');
});

test('each changed field is named, so an update is reviewable', () => {
  const plan = planRow(
    ok(csvRow({ prompt_text: 'He ___ to work.', explanation: 'Fixed wording.' })),
    existing(),
  );
  assertEqual(plan.action, 'update', 'update');
  assertSameSet(plan.changed, ['prompt_text', 'explanation'], 'exactly the two fields');
});

test('a corrected answer key is detected as a change', () => {
  const plan = planRow(ok(csvRow({ correct_answer: '"C"' })), existing({ correct_answer: 'B' }));
  assertEqual(plan.action, 'update', 'update');
  assertSameSet(plan.changed, ['correct_answer'], 'the answer changed');
});

test('an explanation appearing where there was none is a change', () => {
  const plan = planRow(ok(csvRow()), existing({ explanation: null }));
  assertEqual(plan.action, 'update', 'null -> text is a change');
  assertSameSet(plan.changed, ['explanation'], 'explanation only');
});

test('a row stored as something other than MCQ is corrected', () => {
  const plan = planRow(ok(csvRow()), existing({ drill_type: 'FILL_BLANK' }));
  assertEqual(plan.action, 'update', 'update');
  assertSameSet(plan.changed, ['drill_type'], 'drill_type is brought back in line');
});

// ---------------------------------------------------------------------------
// planImport — batch level
// ---------------------------------------------------------------------------

test('a batch is split into inserts, updates and unchanged', () => {
  const rows = [
    csvRow({ line: 2, source_key: 'drill_writing_grammar_beginner_001' }),
    csvRow({ line: 3, source_key: 'drill_writing_grammar_beginner_002', prompt_text: 'Changed.' }),
    csvRow({ line: 4, source_key: 'drill_writing_grammar_beginner_003', prompt_text: 'Brand new.' }),
  ];
  const existingByKey = new Map<string, ExistingRow>([
    ['drill_writing_grammar_beginner_001', existing()],
    [
      'drill_writing_grammar_beginner_002',
      existing({ source_key: 'drill_writing_grammar_beginner_002' }),
    ],
  ]);

  const plan = planImport(rows, existingByKey);
  const counts = countActions(plan.plans);

  assertEqual(counts.unchanged, 1, 'one identical');
  assertEqual(counts.update, 1, 'one changed');
  assertEqual(counts.insert, 1, 'one new');
  assertEqual(plan.errors.length, 0, 'no errors');
});

test('two rows sharing a source_key is an error, not a silent collapse', () => {
  // Upserting both would apply them to one row: the second wins and the first question
  // disappears with no error anywhere.
  const rows = [
    csvRow({ line: 2, prompt_text: 'First question.' }),
    csvRow({ line: 3, prompt_text: 'Second question.' }),
  ];
  const plan = planImport(rows, new Map());

  assertEqual(plan.plans.length, 1, 'only the first row is planned');
  assertEqual(plan.errors.length, 1, 'the collision is reported');
  assert(plan.errors[0].includes('already used on line 2'), 'names the earlier line');
  assertSameSet(plan.duplicateKeys, ['drill_writing_grammar_beginner_001'], 'the key is listed');
});

test('an unconvertible row is reported and skipped without stopping the batch', () => {
  const rows = [
    csvRow({ line: 2, source_key: 'drill_writing_grammar_beginner_001' }),
    csvRow({ line: 3, source_key: 'drill_writing_grammar_beginner_002', options: '{broken' }),
    csvRow({ line: 4, source_key: 'drill_writing_grammar_beginner_003' }),
  ];
  const plan = planImport(rows, new Map());

  assertEqual(plan.plans.length, 2, 'the two good rows are still planned');
  assertEqual(plan.errors.length, 1, 'the bad one is reported');
  assert(plan.errors[0].includes('line 3'), 'with its line number');
});

// ---------------------------------------------------------------------------
// Target resolution
// ---------------------------------------------------------------------------

test('only dev and prod are accepted as targets', () => {
  assertEqual(parseTarget('dev'), 'dev', 'dev');
  assertEqual(parseTarget(' PROD '), 'prod', 'case and padding tolerated');
  assertEqual(parseTarget('staging'), null, 'anything else is rejected');
  assertEqual(parseTarget(''), null, 'empty is rejected');
});

test('the database name is read out of a URL whose password contains an @', () => {
  // The checked-in .env genuinely looks like this, which is why `new URL()` is not used.
  assertEqual(
    databaseNameFromUrl('postgresql://user:p@ss@123prod@localhost:5433/testcrack_db_dev?schema=public'),
    'testcrack_db_dev',
    'name comes from the path, not the authority',
  );
  assertEqual(
    databaseNameFromUrl('postgresql://u:p@host:5432/testcrack_db_main'),
    'testcrack_db_main',
    'no query string',
  );
  assertEqual(databaseNameFromUrl('postgresql://u:p@host:5432/'), null, 'no name present');
});

test('credentials never reach the log', () => {
  const redacted = redactUrl('postgresql://user:sup3rs3cret@localhost:5433/testcrack_db_dev');
  assert(!redacted.includes('sup3rs3cret'), 'password is gone');
  assert(!redacted.includes('user'), 'username is gone');
  assert(redacted.includes('testcrack_db_dev'), 'but the database name is still readable');
});

test('a target resolves from its own env var, preferred over DATABASE_URL', () => {
  const resolved = resolveTarget('dev', {
    DATABASE_URL_DEV: 'postgresql://u:p@localhost:5433/testcrack_db_dev',
    DATABASE_URL: 'postgresql://u:p@localhost:5433/testcrack_db_dev',
  });
  assertEqual(resolved.source, 'DATABASE_URL_DEV', 'the specific var wins');
  assertEqual(resolved.databaseName, 'testcrack_db_dev', 'name');
});

test('DATABASE_URL is used when no target-specific var is set', () => {
  const resolved = resolveTarget('dev', {
    DATABASE_URL: 'postgresql://u:p@localhost:5433/testcrack_db_dev?schema=public',
  });
  assertEqual(resolved.source, 'DATABASE_URL', 'falls back');
});

test('SAFETY: naming a target you are not connected to is refused', () => {
  // The scenario this exists for: the tunnel is pointed at prod, the operator types
  // --target dev, and every safety rail downstream is now measuring the wrong database.
  let message = '';
  try {
    resolveTarget('dev', { DATABASE_URL: 'postgresql://u:p@localhost:5433/testcrack_db_main' });
  } catch (e) {
    message = e instanceof TargetError ? e.message : 'wrong error type';
  }
  assert(message.includes('REFUSING TO RUN'), 'refuses');
  assert(message.includes('testcrack_db_dev'), 'says what was expected');
  assert(message.includes('testcrack_db_main'), 'and what was found');
  assert(message.includes('Nothing was read or written'), 'and that it did nothing');
});

test('SAFETY: the same check applies to an explicit --database-url', () => {
  let threw = false;
  try {
    resolveTarget('prod', {}, 'postgresql://u:p@localhost:5433/testcrack_db_dev');
  } catch {
    threw = true;
  }
  assert(threw, 'an explicit override is a reason for more care, not less');
});

test('a missing connection string is an error, not a default', () => {
  let threw = false;
  try {
    resolveTarget('prod', {});
  } catch (e) {
    threw = e instanceof TargetError;
  }
  assert(threw, 'no silent fallback to some other database');
});

test('the target names match the databases in the brief', () => {
  assertEqual(DATABASE_FOR_TARGET.dev, 'testcrack_db_dev', 'dev');
  assertEqual(DATABASE_FOR_TARGET.prod, 'testcrack_db_main', 'prod');
});

process.exitCode = run('Importer');
