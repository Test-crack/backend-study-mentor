/**
 * Generic parity comparison between a hand-written fork and the loadout engine.
 *
 * A caller supplies how to run its fork and how to render its bucket; the
 * flattening, ordering and diffing is the same for all of them.
 *
 * The bar is structural parity: codes, severities, scopes, lines, columns, order,
 * buckets, outcomes. Message text is reported but not required — the forks word
 * identical codes differently, and matching that drift would spec an accident.
 */

import fs from 'fs';
import path from 'path';

import { verifyRun as verifyRunLoadout } from '../engine/verify';
import { loadLoadoutFromFile } from '../loadout/load';
import type { Loadout } from '../loadout/schema';

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

/** The shape both a fork's RunResult and the engine's RunResult share. */
export interface GenericRun {
  files: {
    fileName: string;
    fileFindings: GenericFinding[];
    rowResults: { findings: GenericFinding[] }[];
    outcome: string;
    expectedRowCount: number;
    bucket: unknown;
  }[];
  runFindings: GenericFinding[];
  outcome: string;
}

export interface GenericFinding {
  code: string;
  severity: string;
  scope: string;
  message: string;
  line?: number;
  column?: string;
}

export function csvFilesIn(dir: string): string[] {
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

function snapshot(run: GenericRun, renderBucket: (bucket: unknown) => string | null): Snapshot {
  const entries: Entry[] = [];
  const messages: string[] = [];

  const push = (file: string, f: GenericFinding): void => {
    entries.push({
      file,
      scope: f.scope,
      code: f.code,
      severity: f.severity,
      line: f.line ?? null,
      column: f.column ?? null,
    });
    messages.push(`${file}|${f.code}|${f.message}`);
  };

  for (const f of run.runFindings) push('<run>', f);

  const files = run.files.map(file => {
    for (const f of [...file.fileFindings, ...file.rowResults.flatMap(r => r.findings)]) {
      push(file.fileName, f);
    }
    return (
      `${file.fileName} bucket=${renderBucket(file.bucket)} outcome=${file.outcome} ` +
      `expected=${file.expectedRowCount} rows=${file.rowResults.length}`
    );
  });

  return { entries, messages, files, runOutcome: run.outcome };
}

function label(e: Entry): string {
  return `${e.file} :: ${e.scope}/${e.code} sev=${e.severity} line=${e.line ?? '-'} col=${e.column ?? '-'}`;
}

function diffOrdered(tag: string, forkName: string, a: string[], b: string[]): string[] {
  const out: string[] = [];
  for (let i = 0; i < Math.max(a.length, b.length); i += 1) {
    if (a[i] === b[i]) continue;
    if (a[i] === undefined) out.push(`${tag} [${i}] loadout EXTRA:   ${b[i]}`);
    else if (b[i] === undefined) out.push(`${tag} [${i}] loadout MISSING: ${a[i]}`);
    else out.push(`${tag} [${i}]\n    ${forkName.padEnd(7)}: ${a[i]}\n    loadout: ${b[i]}`);
  }
  return out;
}

export interface ForkParityReport {
  fileCount: number;
  findingCount: number;
  structuralProblems: string[];
  messageProblems: string[];
}

export interface ForkParityOptions {
  /** Display name of the hand-written fork, for diff output. */
  forkName: string;
  /** Dirs of CSVs. More than one so extra cases can live outside the fork's own. */
  dirs: string[];
  /** Filename of the loadout under loadout/. */
  loadoutFile: string;
  fallback: number;
  /** Run the hand-written fork over these files. */
  runFork: (filePaths: string[], fallback: number) => GenericRun;
  /** Render the fork's own bucket shape as a comparable string. */
  renderForkBucket: (bucket: unknown) => string | null;
  /** Swap in a deliberately broken loadout, to prove the comparison bites. */
  override?: Loadout;
}

export function compareFork(options: ForkParityOptions): ForkParityReport {
  const files = options.dirs
    .flatMap(csvFilesIn)
    .sort((a, b) => path.basename(a).localeCompare(path.basename(b)));

  const loadout =
    options.override ??
    loadLoadoutFromFile(path.join(__dirname, '..', 'loadout', options.loadoutFile));
  const dims = loadout.bucket?.dimensions ?? [];

  const forkRun = options.runFork(files, options.fallback);
  const engineRun = verifyRunLoadout(files, loadout, {
    fallback: options.fallback,
    byMember: {},
  }) as unknown as GenericRun;

  const fork = snapshot(forkRun, options.renderForkBucket);
  const engine = snapshot(engineRun, bucket =>
    bucket && dims.length > 0
      ? dims.map(d => (bucket as Record<string, string>)[d]).join('/')
      : null,
  );

  const structuralProblems = [
    ...diffOrdered('STRUCTURE', options.forkName, fork.entries.map(label), engine.entries.map(label)),
    ...diffOrdered('FILE', options.forkName, fork.files, engine.files),
    ...(fork.runOutcome === engine.runOutcome
      ? []
      : [`RUN outcome differs: ${options.forkName}=${fork.runOutcome} loadout=${engine.runOutcome}`]),
  ];

  return {
    fileCount: files.length,
    findingCount: fork.entries.length,
    structuralProblems,
    messageProblems: diffOrdered('MESSAGE', options.forkName, fork.messages, engine.messages),
  };
}

/** Shared CLI reporting, so every fork's harness prints the same way. */
export function reportParity(title: string, report: ForkParityReport, fallback: number): number {
  console.log(`\nParity run — ${title}`);
  console.log(`${report.fileCount} file(s), expected rows: ${fallback}\n`);
  console.log(`findings (fork):  ${report.findingCount}`);
  console.log(`structural diffs: ${report.structuralProblems.length}`);
  console.log(`message diffs:    ${report.messageProblems.length}   (not required — see header)\n`);

  if (report.structuralProblems.length > 0) {
    console.log('--- STRUCTURAL DIFFS ---');
    for (const p of report.structuralProblems.slice(0, 40)) console.log(`  ${p}`);
    if (report.structuralProblems.length > 40) {
      console.log(`  … and ${report.structuralProblems.length - 40} more`);
    }
    console.log('\n[FAIL] Structural parity not reached.\n');
    return 1;
  }

  console.log('[PASS] The loadout engine reproduces the fork structurally.\n');
  return 0;
}
