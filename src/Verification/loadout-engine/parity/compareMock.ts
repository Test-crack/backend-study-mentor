/**
 * Parity harness for the SECOND loadout: IELTS Mock.
 *
 * Mock is a different shape to Drills: mixed row kinds in one file, a conditional
 * column, a 2-dimensional bucket, a key encoding something the bucket does not,
 * and passage/audio grouping.
 *
 * Structural parity only — the forks word identical codes differently.
 *
 * Usage:
 *   npx tsx src/Verification/loadout-engine/parity/compareMock.ts
 */

import fs from 'fs';
import path from 'path';

import { verifyRun as verifyRunLegacy } from '../../mock/question-banks/layer1-verifier/verify';
import { verifyRun as verifyRunLoadout } from '../engine/verify';
import { loadLoadoutFromFile } from '../loadout/load';
import type { Loadout } from '../loadout/schema';

export const MOCK_FIXTURES_DIR = path.join(__dirname, '__fixtures__', 'mock');

function mockLoadout(): Loadout {
  return loadLoadoutFromFile(path.join(__dirname, '..', 'loadout', 'ielts-mock.json'));
}

interface Entry {
  file: string;
  scope: string;
  code: string;
  severity: string;
  line: number | null;
  column: string | null;
}

interface Snapshot {
  entries: Entry[];
  messages: string[];
  files: string[];
  runOutcome: string;
}

function csvFilesIn(dir: string): string[] {
  return fs
    .readdirSync(dir)
    .filter(n => n.toLowerCase().endsWith('.csv'))
    .map(n => path.join(dir, n))
    .sort((a, b) => a.localeCompare(b));
}

function label(e: Entry): string {
  return `${e.file} :: ${e.scope}/${e.code} sev=${e.severity} line=${e.line ?? '-'} col=${e.column ?? '-'}`;
}

function legacySnapshot(filePaths: string[], fallback: number): Snapshot {
  const run = verifyRunLegacy(filePaths, { fallback, byBucket: {} });
  const entries: Entry[] = [];
  const messages: string[] = [];

  for (const f of run.runFindings) {
    entries.push({ file: '<run>', scope: f.scope, code: f.code, severity: f.severity, line: f.line ?? null, column: f.column ?? null });
    messages.push(`<run>|${f.code}|${f.message}`);
  }

  const files = run.files.map(file => {
    for (const f of [...file.fileFindings, ...file.rowResults.flatMap(r => r.findings)]) {
      entries.push({ file: file.fileName, scope: f.scope, code: f.code, severity: f.severity, line: f.line ?? null, column: f.column ?? null });
      messages.push(`${file.fileName}|${f.code}|${f.message}`);
    }
    const bucket = file.bucket ? `${file.bucket.skill}/${file.bucket.sub_skill}` : null;
    return `${file.fileName} bucket=${bucket} outcome=${file.outcome} expected=${file.expectedRowCount} rows=${file.rowResults.length}`;
  });

  return { entries, messages, files, runOutcome: run.outcome };
}

function loadoutSnapshot(filePaths: string[], fallback: number, override?: Loadout): Snapshot {
  const loadout = override ?? mockLoadout();
  const run = verifyRunLoadout(filePaths, loadout, { fallback, byMember: {} });
  const dims = loadout.bucket?.dimensions ?? [];
  const entries: Entry[] = [];
  const messages: string[] = [];

  for (const f of run.runFindings) {
    entries.push({ file: '<run>', scope: f.scope, code: f.code, severity: f.severity, line: f.line ?? null, column: f.column ?? null });
    messages.push(`<run>|${f.code}|${f.message}`);
  }

  const files = run.files.map(file => {
    for (const f of [...file.fileFindings, ...file.rowResults.flatMap(r => r.findings)]) {
      entries.push({ file: file.fileName, scope: f.scope, code: f.code, severity: f.severity, line: f.line ?? null, column: f.column ?? null });
      messages.push(`${file.fileName}|${f.code}|${f.message}`);
    }
    const bucket = file.bucket ? dims.map(d => file.bucket![d]).join('/') : null;
    return `${file.fileName} bucket=${bucket} outcome=${file.outcome} expected=${file.expectedRowCount} rows=${file.rowResults.length}`;
  });

  return { entries, messages, files, runOutcome: run.outcome };
}

function diffOrdered(tag: string, a: string[], b: string[]): string[] {
  const out: string[] = [];
  for (let i = 0; i < Math.max(a.length, b.length); i += 1) {
    if (a[i] === b[i]) continue;
    if (a[i] === undefined) out.push(`${tag} [${i}] loadout EXTRA:   ${b[i]}`);
    else if (b[i] === undefined) out.push(`${tag} [${i}] loadout MISSING: ${a[i]}`);
    else out.push(`${tag} [${i}]\n    mock   : ${a[i]}\n    loadout: ${b[i]}`);
  }
  return out;
}

export interface MockParityReport {
  fileCount: number;
  findingCount: number;
  structuralProblems: string[];
  messageProblems: string[];
}

export function compareMock(dir: string, fallback: number, override?: Loadout): MockParityReport {
  const files = csvFilesIn(dir);
  const legacy = legacySnapshot(files, fallback);
  const engine = loadoutSnapshot(files, fallback, override);

  const structuralProblems = [
    ...diffOrdered('STRUCTURE', legacy.entries.map(label), engine.entries.map(label)),
    ...diffOrdered('FILE', legacy.files, engine.files),
    ...(legacy.runOutcome === engine.runOutcome
      ? []
      : [`RUN outcome differs: mock=${legacy.runOutcome} loadout=${engine.runOutcome}`]),
  ];

  return {
    fileCount: files.length,
    findingCount: legacy.entries.length,
    structuralProblems,
    messageProblems: diffOrdered('MESSAGE', legacy.messages, engine.messages),
  };
}

function run(): number {
  const argv = process.argv.slice(2);
  const i = argv.indexOf('--expected');
  const fallback = Number(i === -1 ? 2 : argv[i + 1]);
  const dir = MOCK_FIXTURES_DIR;

  const report = compareMock(dir, fallback);

  console.log(`\nParity run — IELTS Mock fixtures`);
  console.log(`${report.fileCount} file(s), expected rows: ${fallback}\n`);
  console.log(`findings (mock fork): ${report.findingCount}`);
  console.log(`structural diffs:     ${report.structuralProblems.length}`);
  console.log(`message diffs:        ${report.messageProblems.length}   (not required — see header)\n`);

  if (report.structuralProblems.length > 0) {
    console.log('--- STRUCTURAL DIFFS ---');
    for (const p of report.structuralProblems.slice(0, 40)) console.log(`  ${p}`);
    if (report.structuralProblems.length > 40) {
      console.log(`  … and ${report.structuralProblems.length - 40} more`);
    }
    console.log('');
    console.log('[FAIL] Structural parity not reached.\n');
    return 1;
  }

  console.log('[PASS] The loadout engine reproduces the mock verifier structurally.\n');
  return 0;
}

if (require.main === module) {
  process.exitCode = run();
}
