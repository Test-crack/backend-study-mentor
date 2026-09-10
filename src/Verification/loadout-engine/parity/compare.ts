/**
 * The parity harness: run the live drills verifier and the loadout engine over
 * the same files and prove they disagree about nothing.
 *
 * Structural parity (codes, severities, scopes, lines, columns, order, plus each
 * file's bucket and outcome) is checked separately from message parity, so a
 * logic bug is never hidden behind a prose diff. Drills requires both.
 *
 * Usage:
 *   npx tsx src/Verification/loadout-engine/parity/compare.ts --fixtures
 *   npx tsx src/Verification/loadout-engine/parity/compare.ts --production
 *   npx tsx src/Verification/loadout-engine/parity/compare.ts --dir <path> --expected 200
 */

import fs from 'fs';
import path from 'path';

import { verifyRun as verifyRunLegacy } from '../../drills/question-banks/layer1-verifier/verify';
import type { ExpectedSpec as LegacyExpectedSpec } from '../../drills/question-banks/shared/types';

import { verifyRun as verifyRunLoadout } from '../engine/verify';
import { ieltsDrillsLoadout } from '../loadout/load';
import type { Loadout } from '../loadout/schema';

const DRILLS_ROOT = path.resolve(__dirname, '..', '..', 'drills', 'question-banks');
export const FIXTURES_DIR = path.join(DRILLS_ROOT, 'layer1-verifier', '__fixtures__');
export const PRODUCTION_DIR = path.join(DRILLS_ROOT, 'drills');

/** One finding flattened to everything parity cares about, minus the prose. */
interface StructuralEntry {
  file: string;
  bucketOf: 'run' | string;
  scope: string;
  code: string;
  severity: string;
  line: number | null;
  column: string | null;
}

interface FileShape {
  file: string;
  bucket: string | null;
  outcome: string;
  expectedRowCount: number;
  rowCount: number;
}

function csvFilesIn(dir: string): string[] {
  const found: string[] = [];
  const walk = (current: string): void => {
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.isFile() && entry.name.toLowerCase().endsWith('.csv')) found.push(full);
    }
  };
  walk(dir);
  return found.sort((a, b) => a.localeCompare(b));
}

interface Snapshot {
  structural: StructuralEntry[];
  messages: string[];
  files: FileShape[];
  runOutcome: string;
}

function legacySnapshot(filePaths: string[], spec: LegacyExpectedSpec): Snapshot {
  const run = verifyRunLegacy(filePaths, spec);
  const structural: StructuralEntry[] = [];
  const messages: string[] = [];

  for (const finding of run.runFindings) {
    structural.push({
      file: '<run>',
      bucketOf: 'run',
      scope: finding.scope,
      code: finding.code,
      severity: finding.severity,
      line: finding.line ?? null,
      column: finding.column ?? null,
    });
    messages.push(`<run>${finding.code}${finding.message}`);
  }

  const files: FileShape[] = run.files.map(file => {
    const flat = [...file.fileFindings, ...file.rowResults.flatMap(r => r.findings)];
    for (const finding of flat) {
      structural.push({
        file: file.fileName,
        bucketOf: 'file',
        scope: finding.scope,
        code: finding.code,
        severity: finding.severity,
        line: finding.line ?? null,
        column: finding.column ?? null,
      });
      messages.push(`${file.fileName}${finding.code}${finding.message}`);
    }
    return {
      file: file.fileName,
      bucket: file.bucket ? `${file.bucket.skill}/${file.bucket.sub_skill}/${file.bucket.level}` : null,
      outcome: file.outcome,
      expectedRowCount: file.expectedRowCount,
      rowCount: file.rowResults.length,
    };
  });

  return { structural, messages, files, runOutcome: run.outcome };
}

function loadoutSnapshot(
  filePaths: string[],
  expected: { fallback: number; byMember: Record<string, number> },
  override?: Loadout,
): Snapshot {
  const loadout = override ?? ieltsDrillsLoadout();
  const run = verifyRunLoadout(filePaths, loadout, expected);
  const dims = loadout.bucket?.dimensions ?? [];
  const structural: StructuralEntry[] = [];
  const messages: string[] = [];

  for (const finding of run.runFindings) {
    structural.push({
      file: '<run>',
      bucketOf: 'run',
      scope: finding.scope,
      code: finding.code,
      severity: finding.severity,
      line: finding.line ?? null,
      column: finding.column ?? null,
    });
    messages.push(`<run>${finding.code}${finding.message}`);
  }

  const files: FileShape[] = run.files.map(file => {
    const flat = [...file.fileFindings, ...file.rowResults.flatMap(r => r.findings)];
    for (const finding of flat) {
      structural.push({
        file: file.fileName,
        bucketOf: 'file',
        scope: finding.scope,
        code: finding.code,
        severity: finding.severity,
        line: finding.line ?? null,
        column: finding.column ?? null,
      });
      messages.push(`${file.fileName}${finding.code}${finding.message}`);
    }
    return {
      file: file.fileName,
      bucket: file.bucket ? dims.map(d => file.bucket![d]).join('/') : null,
      outcome: file.outcome,
      expectedRowCount: file.expectedRowCount,
      rowCount: file.rowResults.length,
    };
  });

  return { structural, messages, files, runOutcome: run.outcome };
}

function entryLabel(e: StructuralEntry): string {
  return `${e.file} :: ${e.scope}/${e.code} sev=${e.severity} line=${e.line ?? '-'} col=${e.column ?? '-'}`;
}

/** Ordered diff: reports the first position where two lists disagree, and all the rest. */
function diffOrdered(label: string, legacy: string[], loadout: string[]): string[] {
  const problems: string[] = [];
  const max = Math.max(legacy.length, loadout.length);

  for (let i = 0; i < max; i += 1) {
    const a = legacy[i];
    const b = loadout[i];
    if (a === b) continue;
    if (a === undefined) problems.push(`${label} [${i}] loadout has EXTRA:  ${b}`);
    else if (b === undefined) problems.push(`${label} [${i}] loadout is MISSING: ${a}`);
    else problems.push(`${label} [${i}] differs:\n    drills : ${a}\n    loadout: ${b}`);
  }

  return problems;
}

export interface ParityReport {
  fileCount: number;
  findingCount: number;
  structuralProblems: string[];
  messageProblems: string[];
}

/**
 * Compare the two engines over one directory. `override` feeds in a deliberately
 * wrong loadout, so the suite can prove the comparison is not vacuous.
 */
export function compareCorpus(dir: string, fallback: number, override?: Loadout): ParityReport {
  const files = csvFilesIn(dir);
  const legacy = legacySnapshot(files, { fallback, byLevel: { ADVANCED: 50 } });
  const engine = loadoutSnapshot(files, { fallback, byMember: { ADVANCED: 50 } }, override);

  const structuralProblems = [
    ...diffOrdered('STRUCTURE', legacy.structural.map(entryLabel), engine.structural.map(entryLabel)),
    ...diffOrdered(
      'FILE',
      legacy.files.map(f => `${f.file} bucket=${f.bucket} outcome=${f.outcome} expected=${f.expectedRowCount} rows=${f.rowCount}`),
      engine.files.map(f => `${f.file} bucket=${f.bucket} outcome=${f.outcome} expected=${f.expectedRowCount} rows=${f.rowCount}`),
    ),
    ...(legacy.runOutcome === engine.runOutcome
      ? []
      : [`RUN outcome differs: drills=${legacy.runOutcome} loadout=${engine.runOutcome}`]),
  ];

  return {
    fileCount: files.length,
    findingCount: legacy.structural.length,
    structuralProblems,
    messageProblems: diffOrdered('MESSAGE', legacy.messages, engine.messages),
  };
}

function run(): number {
  const argv = process.argv.slice(2);
  const flag = (name: string): string | undefined => {
    const i = argv.indexOf(name);
    return i === -1 ? undefined : argv[i + 1];
  };

  let dir: string;
  let label: string;
  if (argv.includes('--production')) {
    dir = PRODUCTION_DIR;
    label = 'production drills';
  } else if (argv.includes('--dir')) {
    dir = path.resolve(flag('--dir')!);
    label = dir;
  } else {
    dir = FIXTURES_DIR;
    label = 'layer 1 fixtures';
  }

  if (!fs.existsSync(dir)) {
    console.error(`No such directory: ${dir}`);
    return 2;
  }

  const files = csvFilesIn(dir);
  if (files.length === 0) {
    console.error(`No CSV files under ${dir}`);
    return 2;
  }

  const fallback = Number(flag('--expected') ?? 200);
  // ADVANCED batches are legitimately smaller; both engines get the same spec.
  const legacySpec: LegacyExpectedSpec = { fallback, byLevel: { ADVANCED: 50 } };
  const loadoutSpec = { fallback, byMember: { ADVANCED: 50 } };

  console.log(`\nParity run — ${label}`);
  console.log(`${files.length} file(s), expected rows: ${fallback} (advanced=50)\n`);

  const legacy = legacySnapshot(files, legacySpec);
  const engine = loadoutSnapshot(files, loadoutSpec);

  const problems: string[] = [];

  problems.push(
    ...diffOrdered('STRUCTURE', legacy.structural.map(entryLabel), engine.structural.map(entryLabel)),
  );

  problems.push(
    ...diffOrdered(
      'FILE',
      legacy.files.map(f => `${f.file} bucket=${f.bucket} outcome=${f.outcome} expected=${f.expectedRowCount} rows=${f.rowCount}`),
      engine.files.map(f => `${f.file} bucket=${f.bucket} outcome=${f.outcome} expected=${f.expectedRowCount} rows=${f.rowCount}`),
    ),
  );

  if (legacy.runOutcome !== engine.runOutcome) {
    problems.push(`RUN outcome differs: drills=${legacy.runOutcome} loadout=${engine.runOutcome}`);
  }

  const structuralProblems = problems.length;
  const messageProblems = diffOrdered('MESSAGE', legacy.messages, engine.messages);

  console.log(`findings: drills=${legacy.structural.length}  loadout=${engine.structural.length}`);
  console.log(`structural diffs: ${structuralProblems}`);
  console.log(`message diffs:    ${messageProblems.length}\n`);

  const show = (list: string[], cap: number): void => {
    for (const p of list.slice(0, cap)) console.log(`  ${p}`);
    if (list.length > cap) console.log(`  … and ${list.length - cap} more`);
  };

  if (structuralProblems > 0) {
    console.log('--- STRUCTURAL DIFFS ---');
    show(problems, 40);
    console.log('');
  }

  if (messageProblems.length > 0) {
    console.log('--- MESSAGE DIFFS ---');
    show(messageProblems, 25);
    console.log('');
  }

  if (structuralProblems === 0 && messageProblems.length === 0) {
    console.log('[PASS] The loadout engine reproduces the drills verifier exactly.\n');
    return 0;
  }

  console.log('[FAIL] Parity not reached.\n');
  return 1;
}

if (require.main === module) {
  process.exitCode = run();
}

export { run };
