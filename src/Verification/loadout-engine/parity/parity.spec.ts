/**
 * Proof that the loadout engine reproduces the live drills verifier.
 *
 * The fixtures matter more than the production CSVs: fixtures exercise every
 * finding code, production content is clean and would pass almost anything.
 *
 * Each fork also has a "not vacuous" test that breaks its loadout and asserts the
 * diff catches it — a harness never seen to fail proves nothing.
 */

import { SEVERITY_BY_CODE as ENGINE_SEVERITY } from '../engine/findings';
import { SEVERITY_BY_CODE as DRILLS_SEVERITY } from '../../drills/question-banks/shared/types';
import { SEVERITY_BY_CODE as MOCK_SEVERITY } from '../../mock/question-banks/shared/types';
import { SEVERITY_BY_CODE as IA_SEVERITY } from '../../ia/question-banks/shared/types';
import { compareMock, MOCK_FIXTURES_DIR } from './compareMock';
import { compareIA } from './compareIA';
import { compareDiagnostic } from './compareDiagnostic';
import { SEVERITY_BY_CODE as DIAG_SEVERITY } from '../../diagnostic/question-banks/shared/types';
import { loadLoadoutFromFile } from '../loadout/load';
import path from 'path';
import { validateLoadout, LoadoutError, type Loadout } from '../loadout/schema';
import { ieltsDrillsLoadout } from '../loadout/load';
import { compareCorpus, FIXTURES_DIR, PRODUCTION_DIR } from './compare';
import { assert, assertEqual, assertSameSet, run, test } from '../../drills/question-banks/shared/testRunner';

function clone(loadout: Loadout): Loadout {
  return JSON.parse(JSON.stringify(loadout)) as Loadout;
}

test('the loadout loads and validates', () => {
  const loadout = ieltsDrillsLoadout();
  assertEqual(loadout.id, 'ielts-drills', 'loadout id');
  assertEqual(loadout.columns.length, 7, 'column count');
  assertEqual(loadout.bucket!.dimensions.length, 3, 'bucket is 3-dimensional');
});

test('the engine covers every fork code, and severities have not drifted', () => {
  // A missing code yields severity `undefined`, silently turning a failure into
  // a pass — so this guards the whole vocabulary, not one fork's slice.
  const engineCodes = Object.keys(ENGINE_SEVERITY);

  for (const [fork, table] of [
    ['drills', DRILLS_SEVERITY],
    ['mock', MOCK_SEVERITY],
    ['ia', IA_SEVERITY],
    ['diagnostic', DIAG_SEVERITY],
  ] as const) {
    const missing = Object.keys(table).filter(c => !engineCodes.includes(c));
    assertEqual(missing.join(', ') || 'none', 'none', `engine covers every ${fork} code`);

    const mismatched = Object.keys(table).filter(
      c =>
        ENGINE_SEVERITY[c as keyof typeof ENGINE_SEVERITY] !==
        (table as Record<string, string>)[c],
    );
    assertEqual(mismatched.join(', ') || 'none', 'none', `severities agree with ${fork}`);
  }
});

test('fixtures: structural parity with the drills verifier', () => {
  const report = compareCorpus(FIXTURES_DIR, 5);
  assert(report.fileCount >= 23, `expected the full fixture corpus, got ${report.fileCount} files`);
  assert(report.findingCount > 40, `fixtures should produce many findings, got ${report.findingCount}`);
  assertEqual(report.structuralProblems.slice(0, 3).join('\n') || 'none', 'none', 'structural diffs');
});

test('fixtures: message parity with the drills verifier', () => {
  const report = compareCorpus(FIXTURES_DIR, 5);
  assertEqual(report.messageProblems.slice(0, 3).join('\n') || 'none', 'none', 'message diffs');
});

test('fixtures: parity holds at a different expected row count', () => {
  // Shifts which files raise ROW_COUNT_MISMATCH, so this is not the same run.
  const report = compareCorpus(FIXTURES_DIR, 200);
  assertEqual(report.structuralProblems.slice(0, 3).join('\n') || 'none', 'none', 'structural diffs');
  assertEqual(report.messageProblems.slice(0, 3).join('\n') || 'none', 'none', 'message diffs');
});

test('production drills: parity with the drills verifier', () => {
  const report = compareCorpus(PRODUCTION_DIR, 200);
  assert(report.fileCount >= 30, `expected the production corpus, got ${report.fileCount} files`);
  assertEqual(report.structuralProblems.slice(0, 3).join('\n') || 'none', 'none', 'structural diffs');
  assertEqual(report.messageProblems.slice(0, 3).join('\n') || 'none', 'none', 'message diffs');
});

test('the comparison is not vacuous: suppressing a check produces diffs', () => {
  const broken = clone(ieltsDrillsLoadout());
  const options = broken.columns.find(c => c.name === 'options')!;
  options.requireUniqueValues = false;

  const report = compareCorpus(FIXTURES_DIR, 5, broken);
  assert(
    report.structuralProblems.length > 0,
    'disabling the duplicate-option-text check must break structural parity',
  );
});

test('the comparison is not vacuous: changing message prose produces diffs', () => {
  const broken = clone(ieltsDrillsLoadout());
  broken.sourceKey!.exampleForMessage = 'something_else_001';

  const report = compareCorpus(FIXTURES_DIR, 5, broken);
  assert(
    report.messageProblems.length > 0,
    'changing the source_key example must break message parity',
  );
  assertEqual(
    report.structuralProblems.length,
    0,
    'a prose-only change must NOT affect structural parity',
  );
});

test('a loadout referencing an undeclared column is rejected', () => {
  const broken = clone(ieltsDrillsLoadout());
  broken.bucket!.dimensions = ['skill', 'sub_skill', 'nonexistent_column'];

  let threw = false;
  try {
    validateLoadout(broken);
  } catch (err) {
    threw = err instanceof LoadoutError;
  }
  assert(threw, 'validateLoadout must reject a dimension that is not a declared column');
});

// ---------------------------------------------------------------------------
// Loadout #2 — the question the whole exercise exists to answer
// ---------------------------------------------------------------------------

function mockLoadout(): Loadout {
  return loadLoadoutFromFile(path.join(__dirname, '..', 'loadout', 'ielts-mock.json'));
}

test('the mock loadout loads and validates', () => {
  const loadout = mockLoadout();
  assertEqual(loadout.id, 'ielts-mock', 'loadout id');
  assertEqual(loadout.bucket!.dimensions.length, 2, 'mock buckets are 2-dimensional');
  // The key encodes something the bucket does not — drills could not do this.
  assert(
    loadout.sourceKey!.segments.includes('question_type') &&
      !loadout.bucket!.dimensions.includes('question_type'),
    'mock source_key encodes question_type, which is not a bucket dimension',
  );
});

test('mock: structural parity with the hand-written mock verifier', () => {
  const report = compareMock(MOCK_FIXTURES_DIR, 2);
  assert(report.fileCount >= 6, `expected the mock fixture corpus, got ${report.fileCount} files`);
  assert(report.findingCount > 5, `fixtures should produce findings, got ${report.findingCount}`);
  assertEqual(report.structuralProblems.slice(0, 3).join('\n') || 'none', 'none', 'structural diffs');
});

test('mock: the comparison is not vacuous', () => {
  const broken = JSON.parse(JSON.stringify(mockLoadout())) as Loadout;
  broken.conditionalColumns = [];

  const report = compareMock(MOCK_FIXTURES_DIR, 2, broken);
  assert(
    report.structuralProblems.length > 0,
    'dropping the task_type rules must break structural parity',
  );
});

// ---------------------------------------------------------------------------
// Loadout #3 — IA, a hybrid of the two shapes already proven
// ---------------------------------------------------------------------------

test('the IA loadout loads and validates', () => {
  const loadout = loadLoadoutFromFile(path.join(__dirname, '..', 'loadout', 'ielts-ia.json'));
  assertEqual(loadout.id, 'ielts-ia', 'loadout id');
  // Drills' 3-dimensional bucket, Mock's four question types — both at once.
  assertEqual(loadout.bucket!.dimensions.length, 3, 'IA buckets are 3-dimensional');
  assert(loadout.rowAllowList !== undefined, 'IA constrains question_type by skill');
  assert(loadout.bucket!.allowList !== undefined, 'IA also constrains sub_skill by skill');
});

test('IA: structural parity with the hand-written IA verifier', () => {
  const report = compareIA(5);
  assert(report.fileCount >= 8, `expected fork + extra fixtures, got ${report.fileCount} files`);
  assert(report.findingCount > 20, `fixtures should produce findings, got ${report.findingCount}`);
  assertEqual(report.structuralProblems.slice(0, 3).join('\n') || 'none', 'none', 'structural diffs');
});

test('IA: the comparison is not vacuous', () => {
  const broken = JSON.parse(
    JSON.stringify(loadLoadoutFromFile(path.join(__dirname, '..', 'loadout', 'ielts-ia.json'))),
  ) as Loadout;
  broken.hooks = broken.hooks!.filter(h => h !== 'iaPassageGroups');

  const report = compareIA(5, broken);
  assert(
    report.structuralProblems.length > 0,
    'dropping the passage-group hook must break structural parity',
  );
});

// ---------------------------------------------------------------------------
// Loadout #4 — Diagnostic, the outlier
// ---------------------------------------------------------------------------

function diagnosticLoadout(): Loadout {
  return loadLoadoutFromFile(path.join(__dirname, '..', 'loadout', 'ielts-diagnostic.json'));
}

test('the diagnostic loadout loads and validates without a bucket or keys', () => {
  const loadout = diagnosticLoadout();
  assertEqual(loadout.id, 'ielts-diagnostic', 'loadout id');
  // The two things every other loadout has, and this one genuinely does not.
  assert(loadout.bucket === undefined, 'diagnostic declares no bucket');
  assert(loadout.sourceKey === undefined, 'diagnostic issues no source keys');
});

test('diagnostic: structural parity with the hand-written diagnostic verifier', () => {
  const report = compareDiagnostic(2);
  assert(report.fileCount >= 6, `expected the diagnostic corpus, got ${report.fileCount} files`);
  assert(report.findingCount > 8, `fixtures should produce findings, got ${report.findingCount}`);
  assertEqual(report.structuralProblems.slice(0, 3).join('\n') || 'none', 'none', 'structural diffs');
});

test('diagnostic: the comparison is not vacuous', () => {
  const broken = clone(diagnosticLoadout());
  broken.hooks = broken.hooks!.filter(h => h !== 'diagnosticSets');

  const report = compareDiagnostic(2, broken);
  assert(
    report.structuralProblems.length > 0,
    'dropping the sets hook must break structural parity',
  );
});

process.exitCode = run('Loadout engine — parity with all four IELTS verifiers');
