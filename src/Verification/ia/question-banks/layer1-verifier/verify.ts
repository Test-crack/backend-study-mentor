/**
 * Orchestrates the Layer 1 checks over one IA file and over a whole run.
 *
 * Same ordering rule as drills'/diagnostic's verify.ts: only short-circuit
 * when continuing would produce misleading output. Combines drills' bucket
 * machinery (majority bucket, cross-file duplicate checks) with diagnostic's
 * question_type dispatch and group consistency, grouped by `passage_id`.
 */

import {
  bucketKey,
  describeExpected,
  makeFinding,
  type ExpectedSpec,
  type FileResult,
  type Finding,
  type IACsvRow,
  type RowOutcome,
  type RowResult,
  type RunResult,
} from '../shared/types';
import { loadIACsv } from '../shared/csvLoader';
import { difficultyFromPath } from '../shared/iaLayout';
import {
  checkBucketAgainstFilename,
  checkBucketAgainstFolder,
  checkBucketPair,
  checkEnums,
  checkExplanationCredit,
  checkMcqCorrectAnswer,
  checkMcqOptions,
  checkNoPassageAudioForPromptRow,
  checkPassageAudioConsistency,
  checkPromptRow,
  checkRowCount,
  checkSourceKey,
  checkSourceKeyColumnPresent,
  checkText,
  checkTfngCorrectAnswer,
  determineBucket,
  findDuplicatePrompts,
  findDuplicateSourceKeys,
  groupByPassageId,
  normalizeEnumCell,
} from './checks';

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

function checkByQuestionType(row: IACsvRow): Finding[] {
  const type = normalizeEnumCell(row.question_type);
  switch (type) {
    case 'MCQ':
      return [...checkMcqOptions(row), ...checkMcqCorrectAnswer(row)];
    case 'TFNG':
      return checkTfngCorrectAnswer(row);
    case 'WRITING_PROMPT':
    case 'SPEAKING_PROMPT':
      return [...checkPromptRow(row), ...checkNoPassageAudioForPromptRow(row)];
    default:
      return []; // Invalid type already reported by checkEnums.
  }
}

export interface VerifyOptions {
  expectedRowCount: number;
  /** Off by default — an untagged file is a normal pre-tagging state, not a defect. */
  requireSourceKey?: boolean;
}

export function verifyFile(filePath: string, options: VerifyOptions): FileResult {
  const loaded = loadIACsv(filePath);
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

  if (loaded.fatal) {
    return { ...base, outcome: outcomeOf(fileFindings) };
  }

  fileFindings.push(...checkRowCount(loaded.rows.length, options.expectedRowCount));

  if (options.requireSourceKey === true) {
    fileFindings.push(...checkSourceKeyColumnPresent(loaded));
  }

  const { bucket, findings: bucketFindings } = determineBucket(loaded.rows);
  fileFindings.push(...bucketFindings);

  if (bucket) {
    fileFindings.push(...checkBucketPair(bucket));
    fileFindings.push(...checkBucketAgainstFilename(loaded.fileName, bucket));
    fileFindings.push(...checkBucketAgainstFolder(loaded.filePath, bucket));
  }

  const duplicatePrompts = findDuplicatePrompts(loaded.rows);
  const duplicateSourceKeys = findDuplicateSourceKeys(loaded.rows);

  const { groups, findings: groupFindings } = groupByPassageId(loaded.rows);
  fileFindings.push(...groupFindings);

  const passageFindingsByLine = new Map<number, Finding[]>();
  for (const group of groups) {
    const findings = checkPassageAudioConsistency(group);
    for (const f of findings) {
      if (f.line === undefined) continue;
      const arr = passageFindingsByLine.get(f.line) ?? [];
      arr.push(f);
      passageFindingsByLine.set(f.line, arr);
    }
    // Group-scoped findings with no single line (an inconsistent shared field)
    // are surfaced once at the file level so they aren't lost.
    fileFindings.push(...findings.filter(f => f.line === undefined));
  }

  const rowResults: RowResult[] = loaded.rows.map(row => {
    const findings: Finding[] = [
      ...checkEnums(row),
      ...checkText(row),
      ...checkByQuestionType(row),
      ...checkExplanationCredit(row),
      ...checkSourceKey(row, bucket),
    ];

    const duplicate = duplicatePrompts.get(row.line);
    if (duplicate) findings.push(duplicate);

    const duplicateKey = duplicateSourceKeys.get(row.line);
    if (duplicateKey) findings.push(duplicateKey);

    const passageFindings = passageFindingsByLine.get(row.line);
    if (passageFindings) findings.push(...passageFindings);

    return { row, findings, outcome: outcomeOf(findings) };
  });

  const outcome = worst([outcomeOf(fileFindings), ...rowResults.map(r => r.outcome)]);

  return { ...base, bucket, rowResults, outcome };
}

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
        `${group.length} files in this run all claim the bucket ${key}: ${group.map(f => f.fileName).join(' | ')}.`,
      ),
    );
  }
  return findings;
}

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
        `source_key "${key}" is used in ${fileNames.size} different files: ${[...fileNames].join(' | ')}.`,
      ),
    );
  }
  return findings;
}

export function expectedRowsFor(filePath: string, spec: ExpectedSpec): number {
  const difficulty = difficultyFromPath(filePath);
  if (difficulty === null) return spec.fallback;
  return spec.byDifficulty[difficulty] ?? spec.fallback;
}

export interface RunOptions {
  requireSourceKey?: boolean;
}

export function verifyRun(filePaths: string[], spec: ExpectedSpec, options: RunOptions = {}): RunResult {
  const files = filePaths.map(p =>
    verifyFile(p, { expectedRowCount: expectedRowsFor(p, spec), requireSourceKey: options.requireSourceKey }),
  );
  const runFindings = [...checkDuplicateBuckets(files), ...checkDuplicateSourceKeysAcrossFiles(files)];

  return {
    files,
    runFindings,
    outcome: worst([outcomeOf(runFindings), ...files.map(f => f.outcome)]),
    expectedLabel: describeExpected(spec),
  };
}

export function allFindings(run: RunResult): Finding[] {
  return [...run.runFindings, ...run.files.flatMap(f => [...f.fileFindings, ...f.rowResults.flatMap(r => r.findings)])];
}

export function fileFindingsFlat(file: FileResult): Finding[] {
  return [...file.fileFindings, ...file.rowResults.flatMap(r => r.findings)];
}
