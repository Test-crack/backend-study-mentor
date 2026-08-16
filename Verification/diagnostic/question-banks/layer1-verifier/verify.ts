/**
 * Orchestrates the Layer 1 checks over one staging file and over a whole run.
 *
 * Same ordering rule as drills: only short-circuit when continuing would
 * produce misleading output (unreadable/unparseable file, unmappable header).
 * Everything else runs to completion so an author fixing a batch sees every
 * problem in one pass.
 */

import {
  describeExpected,
  makeFinding,
  type DiagnosticCsvRow,
  type ExpectedSpec,
  type FileResult,
  type Finding,
  type RowOutcome,
  type RowResult,
  type RunResult,
  type SetResult,
} from '../shared/types';
import { loadDiagnosticCsv } from '../shared/csvLoader';
import {
  checkEnums,
  checkMcqCorrectAnswer,
  checkMcqOptions,
  checkPromptRow,
  checkSequence,
  checkSetConsistency,
  checkText,
  checkTfngCorrectAnswer,
  findDuplicatePrompts,
  groupBySetId,
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

/** Checks specific to what question_type actually is — everything else runs unconditionally. */
function checkByQuestionType(row: DiagnosticCsvRow): Finding[] {
  const type = normalizeEnumCell(row.question_type);
  switch (type) {
    case 'MCQ':
      return [...checkMcqOptions(row), ...checkMcqCorrectAnswer(row)];
    case 'TFNG':
      return checkTfngCorrectAnswer(row);
    case 'WRITING_PROMPT':
      return checkPromptRow(row, 'WRITING_PROMPT');
    case 'SPEAKING_PROMPT':
      return checkPromptRow(row, 'SPEAKING_PROMPT');
    default:
      return []; // Invalid type already reported by checkEnums.
  }
}

export interface VerifyOptions {
  expectedRowCount: number;
}

export function verifyFile(filePath: string, options: VerifyOptions): FileResult {
  const loaded = loadDiagnosticCsv(filePath);
  const fileFindings: Finding[] = [...loaded.findings];

  const base: FileResult = {
    filePath: loaded.filePath,
    fileName: loaded.fileName,
    fileFindings,
    setResults: [],
    rowResults: [],
    outcome: 'fail',
    expectedRowCount: options.expectedRowCount,
  };

  if (loaded.fatal) {
    return { ...base, outcome: outcomeOf(fileFindings) };
  }

  if (loaded.rows.length !== options.expectedRowCount) {
    fileFindings.push(
      makeFinding(
        'ROW_COUNT_MISMATCH',
        'file',
        `File has ${loaded.rows.length} data row(s) but ${options.expectedRowCount} were expected. ` +
          `Re-run with --expected ${loaded.rows.length} if this batch is legitimately a different size.`,
      ),
    );
  }

  const { groups, findings: groupFindings } = groupBySetId(loaded.rows);
  fileFindings.push(...groupFindings);

  const duplicatePrompts = findDuplicatePrompts(loaded.rows);

  const setResults: SetResult[] = groups.map(group => {
    const findings: Finding[] = [...checkSequence(group), ...checkSetConsistency(group)];
    return {
      setId: group.setId,
      skill: group.rows[0]?.skill ?? '',
      level: group.rows[0]?.level ?? '',
      rows: group.rows,
      findings,
    };
  });

  const setFindingsByLine = new Map<number, Finding[]>();
  for (const set of setResults) {
    for (const f of set.findings) {
      if (f.line === undefined) continue;
      const arr = setFindingsByLine.get(f.line) ?? [];
      arr.push(f);
      setFindingsByLine.set(f.line, arr);
    }
  }
  // Set-scoped findings with no single line (e.g. inconsistency across a set)
  // are surfaced once at the file level so they aren't lost.
  for (const set of setResults) {
    fileFindings.push(...set.findings.filter(f => f.line === undefined));
  }

  const rowResults: RowResult[] = loaded.rows.map(row => {
    const findings: Finding[] = [...checkEnums(row), ...checkText(row), ...checkByQuestionType(row)];

    const duplicate = duplicatePrompts.get(row.line);
    if (duplicate) findings.push(duplicate);

    const setFindings = setFindingsByLine.get(row.line);
    if (setFindings) findings.push(...setFindings);

    return { row, findings, outcome: outcomeOf(findings) };
  });

  const outcome = worst([
    outcomeOf(fileFindings),
    ...setResults.map(s => outcomeOf(s.findings)),
    ...rowResults.map(r => r.outcome),
  ]);

  return { ...base, setResults, rowResults, outcome };
}

export function verifyRun(filePaths: string[], spec: ExpectedSpec): RunResult {
  const files = filePaths.map(p => verifyFile(p, { expectedRowCount: spec.count }));

  return {
    files,
    runFindings: [],
    outcome: worst(files.map(f => f.outcome)),
    expectedLabel: describeExpected(spec),
  };
}

export function allFindings(run: RunResult): Finding[] {
  return [
    ...run.runFindings,
    ...run.files.flatMap(f => [...f.fileFindings, ...f.rowResults.flatMap(r => r.findings)]),
  ];
}

export function fileFindingsFlat(file: FileResult): Finding[] {
  return [...file.fileFindings, ...file.rowResults.flatMap(r => r.findings)];
}
