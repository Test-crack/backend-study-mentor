/**
 * Orchestrates the Layer 1 checks over one file and over a whole run.
 *
 * Ordering rule: a file is only short-circuited when continuing would produce
 * *misleading* output — an unreadable file, an unparseable one, or a header we
 * cannot map columns from. Everything else runs to completion even after a
 * failure, because an operator fixing a batch wants the whole list of problems in
 * one pass, not one problem per run.
 */

import {
  bucketKey,
  describeExpected,
  makeFinding,
  type ExpectedSpec,
  type FileResult,
  type Finding,
  type RowOutcome,
  type RowResult,
  type RunResult,
} from '../shared/types';
import { loadDrillCsv } from '../shared/csvLoader';
import { levelFromPath } from '../shared/drillsLayout';
import {
  checkBucketAgainstFilename,
  checkBucketAgainstFolder,
  checkBucketPair,
  checkCorrectAnswer,
  checkEnums,
  checkExplanationCredit,
  checkOptions,
  checkRowCount,
  checkSourceKey,
  checkSourceKeyColumnPresent,
  checkText,
  determineBucket,
  findDuplicatePrompts,
  findDuplicateSourceKeys,
} from './checks';

/** A single failing finding outranks any number of warnings. */
export function outcomeOf(findings: Finding[]): RowOutcome {
  if (findings.some(f => f.severity === 'fail')) return 'fail';
  if (findings.some(f => f.severity === 'warn')) return 'warn';
  return 'pass';
}

function worst(outcomes: RowOutcome[]): RowOutcome {
  if (outcomes.includes('fail')) return 'fail';
  if (outcomes.includes('warn')) return 'warn';
  return 'pass';
}

export interface VerifyOptions {
  expectedRowCount: number;
  /**
   * Fail a file that carries no `source_key` column at all.
   *
   * Off by default: files are verified both before and after the key-assignment
   * tool runs, and an untagged file is a normal intermediate state rather than a
   * defect. The importer turns this on, because it genuinely cannot proceed
   * without keys.
   */
  requireSourceKey?: boolean;
}

export function verifyFile(filePath: string, options: VerifyOptions): FileResult {
  const loaded = loadDrillCsv(filePath);
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
    fileFindings.push(...checkSourceKeyColumnPresent(loaded));
  }

  // --- bucket-level ---
  const { bucket, findings: bucketFindings } = determineBucket(loaded.rows);
  fileFindings.push(...bucketFindings);

  if (bucket) {
    fileFindings.push(...checkBucketPair(bucket));
    fileFindings.push(...checkBucketAgainstFilename(loaded.fileName, bucket));
    fileFindings.push(...checkBucketAgainstFolder(loaded.filePath, bucket));
  }

  // --- cross-row ---
  const duplicatePrompts = findDuplicatePrompts(loaded.rows);
  const duplicateSourceKeys = findDuplicateSourceKeys(loaded.rows);

  // --- row-level ---
  const rowResults: RowResult[] = loaded.rows.map(row => {
    const findings: Finding[] = [
      ...checkEnums(row),
      ...checkOptions(row),
      ...checkCorrectAnswer(row),
      ...checkText(row),
      ...checkExplanationCredit(row),
      ...checkSourceKey(row, bucket),
    ];

    const duplicate = duplicatePrompts.get(row.line);
    if (duplicate) findings.push(duplicate);

    const duplicateKey = duplicateSourceKeys.get(row.line);
    if (duplicateKey) findings.push(duplicateKey);

    return { row, findings, outcome: outcomeOf(findings) };
  });

  // A row-scoped finding attached to a row the loader dropped (an embedded header
  // row) would otherwise vanish. Those are already reported file-level, so there
  // is nothing to reconcile here — but the outcome must account for both.
  const outcome = worst([outcomeOf(fileFindings), ...rowResults.map(r => r.outcome)]);

  return { ...base, bucket, rowResults, outcome };
}

/**
 * Cross-file: two files claiming the same (skill, sub_skill, level) means one of
 * them is mislabeled, or a batch was exported twice. Either way importing both
 * would double the bucket.
 */
function checkDuplicateBuckets(files: FileResult[]): Finding[] {
  const byBucket = new Map<string, FileResult[]>();

  for (const file of files) {
    if (!file.bucket) continue;
    const key = bucketKey(file.bucket);
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

/**
 * Cross-file: the same `source_key` in two files.
 *
 * This is the failure mode the key-assignment tool exists to prevent — two batches
 * for one bucket both numbered from 001. It is checked here as well because the
 * tool's output is only as good as the last time someone ran it, and importing both
 * files would silently collapse each colliding pair into one database row.
 */
function checkDuplicateSourceKeysAcrossFiles(files: FileResult[]): Finding[] {
  const byKey = new Map<string, Set<string>>();

  for (const file of files) {
    for (const { row } of file.rowResults) {
      if (row.source_key === undefined || row.source_key.trim() === '') continue;
      const key = row.source_key.trim();
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

/**
 * Rows expected for one file: the per-level count when the file sits in a level
 * folder and that level has an override, otherwise the fallback.
 */
export function expectedRowsFor(filePath: string, spec: ExpectedSpec): number {
  const level = levelFromPath(filePath);
  if (level === null) return spec.fallback;
  return spec.byLevel[level] ?? spec.fallback;
}

export interface RunOptions {
  requireSourceKey?: boolean;
}

export function verifyRun(
  filePaths: string[],
  spec: ExpectedSpec,
  options: RunOptions = {},
): RunResult {
  const files = filePaths.map(p =>
    verifyFile(p, {
      expectedRowCount: expectedRowsFor(p, spec),
      requireSourceKey: options.requireSourceKey,
    }),
  );
  const runFindings = [
    ...checkDuplicateBuckets(files),
    ...checkDuplicateSourceKeysAcrossFiles(files),
  ];

  return {
    files,
    runFindings,
    outcome: worst([outcomeOf(runFindings), ...files.map(f => f.outcome)]),
    expectedLabel: describeExpected(spec),
  };
}

/** Flat list of every finding in a run, for console summaries and tests. */
export function allFindings(run: RunResult): Finding[] {
  return [
    ...run.runFindings,
    ...run.files.flatMap(f => [...f.fileFindings, ...f.rowResults.flatMap(r => r.findings)]),
  ];
}

/** Flat list of every finding for one file, for fixture assertions. */
export function fileFindingsFlat(file: FileResult): Finding[] {
  return [...file.fileFindings, ...file.rowResults.flatMap(r => r.findings)];
}
