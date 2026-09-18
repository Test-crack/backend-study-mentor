/**
 * Orchestrates the loadout-driven checks over one file and over a whole run.
 *
 * A file is only short-circuited when continuing would be misleading — an
 * unreadable file, an unparseable one, or an unmappable header. Everything else
 * runs to completion so one pass lists every problem.
 *
 * Two easy-to-miss orderings: a header-only file returns before the row-count
 * check, so it never reports ROW_COUNT_MISMATCH; and an embedded header row is
 * dropped by the loader, shifting later row ordinals and the row count.
 */

import path from 'path';
import {
  makeFinding,
  outcomeOf,
  worstOutcome,
  type Finding,
  type RowOutcome,
} from './findings';
import { loadCsv, type LoadedRow } from './csvLoad';
import { buildSourceKeyGrammar, type Bucket, type SourceKeyGrammar } from './sourceKey';
import type { Loadout } from '../loadout/schema';
import {
  checkBucketAgainstFilename,
  checkBucketAgainstFolder,
  checkBucketAllowList,
  checkConditionalColumns,
  checkEnums,
  checkExplanationCredit,
  checkRowCount,
  checkSourceKey,
  checkSourceKeyColumnPresent,
  checkStructuredColumns,
  checkText,
  determineBucket,
  findDuplicatePrompts,
  findDuplicateSourceKeys,
} from './checks';
import { hookByName, type HookResult } from './hooks';

export interface RowResult {
  row: LoadedRow;
  findings: Finding[];
  outcome: RowOutcome;
}

export interface FileResult {
  filePath: string;
  fileName: string;
  bucket: Bucket | null;
  fileFindings: Finding[];
  rowResults: RowResult[];
  outcome: RowOutcome;
  expectedRowCount: number;
}

export interface RunResult {
  files: FileResult[];
  runFindings: Finding[];
  outcome: RowOutcome;
  expectedLabel: string;
}

/** Rows expected per file. Per-member overrides exist because some batches are smaller. */
export interface ExpectedSpec {
  fallback: number;
  byMember: Record<string, number>;
}

export function describeExpected(spec: ExpectedSpec): string {
  const parts = Object.entries(spec.byMember).map(([m, n]) => `${m.toLowerCase()}=${n}`);
  return parts.length > 0 ? `${parts.join(', ')}, else ${spec.fallback}` : String(spec.fallback);
}

/**
 * Which member the file's folder asserts. Whole path segments only, and null on
 * zero or multiple matches — a guess here would raise a false failure.
 */
export function folderMemberFromPath(filePath: string, members: string[]): string | null {
  const segments = path.resolve(filePath).split(/[\\/]/);
  const found = new Set<string>();

  for (const segment of segments) {
    const match = members.find(m => m === segment.trim().toUpperCase());
    if (match) found.add(match);
  }

  return found.size === 1 ? [...found][0] : null;
}

function folderMemberFor(filePath: string, loadout: Loadout): string | null {
  if (!loadout.folderCheck) return null;
  const column = loadout.columns.find(c => c.name === loadout.folderCheck!.dimension);
  return folderMemberFromPath(filePath, column?.members ?? []);
}

/** Rows expected for one file, resolved from the FILE PATH rather than its rows. */
export function expectedRowsFor(filePath: string, loadout: Loadout, spec: ExpectedSpec): number {
  const member = folderMemberFor(filePath, loadout);
  if (member === null) return spec.fallback;
  return spec.byMember[member] ?? spec.fallback;
}

export interface VerifyOptions {
  expectedRowCount: number;
  requireSourceKey?: boolean;
}

export function verifyFile(
  filePath: string,
  loadout: Loadout,
  /** Null for a loadout that issues no keys, such as Diagnostic. */
  grammar: SourceKeyGrammar | null,
  options: VerifyOptions,
): FileResult {
  const loaded = loadCsv(filePath, {
    expectedHeader: loadout.columns.map(c => c.name),
    sourceKeyHeader: loadout.sourceKeyColumn,
    embeddedHeaderThreshold: loadout.embeddedHeaderThreshold,
  });
  const fileFindings: Finding[] = [...loaded.findings];

  const base: FileResult = {
    filePath: loaded.filePath,
    fileName: loaded.fileName,
    bucket: null,
    fileFindings,
    rowResults: [],
    outcome: 'fail',
    expectedRowCount: options.expectedRowCount,
  };

  // Load failed badly enough that row checks would be noise, not signal.
  if (loaded.fatal) {
    return { ...base, outcome: outcomeOf(fileFindings) };
  }

  // --- file-level ---
  fileFindings.push(...checkRowCount(loaded.rows.length, options.expectedRowCount));

  if (options.requireSourceKey === true) {
    fileFindings.push(...checkSourceKeyColumnPresent(loaded, loadout));
  }

  // --- bucket-level ---
  const { bucket, findings: bucketFindings } = determineBucket(loaded.rows, loadout);
  fileFindings.push(...bucketFindings);

  if (bucket) {
    fileFindings.push(...checkBucketAllowList(bucket, loadout));
    fileFindings.push(...checkBucketAgainstFilename(loaded.fileName, bucket, loadout));
    fileFindings.push(
      ...checkBucketAgainstFolder(folderMemberFor(loaded.filePath, loadout), bucket, loadout),
    );
  }

  // --- cross-row ---
  const duplicatePrompts = findDuplicatePrompts(loaded.rows, loadout);
  const duplicateSourceKeys = findDuplicateSourceKeys(loaded.rows, loadout);

  // Run once per file, since hooks need every row to group. Per-row findings go
  // where checkOrder names them, or after the duplicate checks if unnamed.
  const hookNames = loadout.hooks ?? [];
  const hookResults = new Map<string, HookResult>();
  for (const name of hookNames) {
    const result = hookByName(name)(loaded.rows, loadout);
    hookResults.set(name, result);
    fileFindings.push(...result.fileFindings);
  }
  const placedHooks = new Set(
    loadout.checkOrder.filter(g => g.startsWith('hook:')).map(g => g.slice('hook:'.length)),
  );
  const trailingHooks = hookNames.filter(n => !placedHooks.has(n));

  // Group order comes from the loadout — the forks disagree, and finding order
  // is part of what parity compares.
  const groupFor = (group: string, row: LoadedRow): Finding[] => {
    switch (group) {
      case 'enums':
        return checkEnums(row, loadout);
      case 'conditional':
        return checkConditionalColumns(row, loadout);
      case 'text':
        return checkText(row, loadout);
      case 'structured':
        return checkStructuredColumns(row, loadout);
      case 'credit':
        return checkExplanationCredit(row, loadout);
      case 'sourceKey':
        return grammar ? checkSourceKey(row, bucket, loadout, grammar) : [];
      default:
        if (group.startsWith('hook:')) {
          return hookResults.get(group.slice('hook:'.length))?.byLine.get(row.line) ?? [];
        }
        return [];
    }
  };

  const rowResults: RowResult[] = loaded.rows.map(row => {
    const findings: Finding[] = loadout.checkOrder.flatMap(group => groupFor(group, row));

    const duplicate = duplicatePrompts.get(row.line);
    if (duplicate) findings.push(duplicate);

    const duplicateKey = duplicateSourceKeys.get(row.line);
    if (duplicateKey) findings.push(duplicateKey);

    for (const name of trailingHooks) {
      const hookFindings = hookResults.get(name)?.byLine.get(row.line);
      if (hookFindings) findings.push(...hookFindings);
    }

    return { row, findings, outcome: outcomeOf(findings) };
  });

  const outcome = worstOutcome([outcomeOf(fileFindings), ...rowResults.map(r => r.outcome)]);

  return { ...base, bucket, rowResults, outcome };
}

/** Two files claiming one bucket: one is mislabeled, or a batch was exported twice. */
function checkDuplicateBuckets(files: FileResult[], loadout: Loadout): Finding[] {
  const dims = loadout.bucket?.dimensions ?? [];
  const byBucket = new Map<string, FileResult[]>();

  for (const file of files) {
    if (!file.bucket) continue;
    const key = dims.map(d => file.bucket![d]).join('/');
    const group = byBucket.get(key);
    if (group) group.push(file);
    else byBucket.set(key, [file]);
  }

  const findings: Finding[] = [];
  for (const [key, group] of byBucket) {
    if (group.length < 2) continue;
    findings.push(
      makeFinding(
        'DUPLICATE_BUCKET_ACROSS_FILES',
        'run',
        `${group.length} files in this run all claim the bucket ${key}: ` +
          `${group.map(f => f.fileName).join(' | ')}. Importing all of them would duplicate ` +
          `the bucket.`,
      ),
    );
  }

  return findings;
}

/** The same key in two files — importing both would collapse them into one row. */
function checkDuplicateSourceKeysAcrossFiles(files: FileResult[]): Finding[] {
  const byKey = new Map<string, Set<string>>();

  for (const file of files) {
    for (const { row } of file.rowResults) {
      if (row.sourceKey === undefined || row.sourceKey.trim() === '') continue;
      const key = row.sourceKey.trim();
      const group = byKey.get(key);
      if (group) group.add(file.fileName);
      else byKey.set(key, new Set([file.fileName]));
    }
  }

  const findings: Finding[] = [];
  for (const [key, fileNames] of byKey) {
    if (fileNames.size < 2) continue;
    findings.push(
      makeFinding(
        'SOURCE_KEY_DUPLICATE_ACROSS_FILES',
        'run',
        `source_key "${key}" is used in ${fileNames.size} different files: ` +
          `${[...fileNames].join(' | ')}. Importing both would collapse two different ` +
          `questions into one row. Re-run the key-assignment tool so the second batch ` +
          `continues the numbering instead of restarting it.`,
      ),
    );
  }

  return findings;
}

export interface RunOptions {
  requireSourceKey?: boolean;
}

export function verifyRun(
  filePaths: string[],
  loadout: Loadout,
  spec: ExpectedSpec,
  options: RunOptions = {},
): RunResult {
  const grammar = loadout.sourceKey ? buildSourceKeyGrammar(loadout) : null;

  const files = filePaths.map(p =>
    verifyFile(p, loadout, grammar, {
      expectedRowCount: expectedRowsFor(p, loadout, spec),
      requireSourceKey: options.requireSourceKey,
    }),
  );

  // Skipped for Diagnostic: with no bucket every file would key on '' and look
  // like a collision, and with no keys there is nothing to collide.
  const runFindings = [
    ...(loadout.bucket ? checkDuplicateBuckets(files, loadout) : []),
    ...(loadout.sourceKey ? checkDuplicateSourceKeysAcrossFiles(files) : []),
  ];

  return {
    files,
    runFindings,
    outcome: worstOutcome([outcomeOf(runFindings), ...files.map(f => f.outcome)]),
    expectedLabel: describeExpected(spec),
  };
}

/** Flat list of every finding in a run. */
export function allFindings(run: RunResult): Finding[] {
  return [
    ...run.runFindings,
    ...run.files.flatMap(f => [...f.fileFindings, ...f.rowResults.flatMap(r => r.findings)]),
  ];
}

/** Flat list of every finding for one file. */
export function fileFindingsFlat(file: FileResult): Finding[] {
  return [...file.fileFindings, ...file.rowResults.flatMap(r => r.findings)];
}
