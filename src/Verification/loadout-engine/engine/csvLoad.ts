/**
 * Reads a question CSV into rows keyed by column name, with findings for
 * anything that goes wrong at the file or header level.
 *
 * The drills loader generalized: expected header, key column and embedded-header
 * threshold are arguments, and a row carries a `values` map rather than named
 * fields. Parser options and the record-start-line derivation are unchanged.
 *
 * No `columns: true` — the header is needed as data so a duplicated header row
 * further down the file can be spotted.
 */

import fs from 'fs';
import path from 'path';
import { parse } from 'csv-parse/sync';
import { makeFinding, type Finding } from './findings';
import { normalizeHeaderCell } from '../../drills/question-banks/shared/normalize';

export interface LoadedRow {
  /** 1-based physical line in the file where this record starts. */
  line: number;
  cells: string[];
  /** Cell text by column name. Columns the header lacked are absent, not blank. */
  values: Record<string, string>;
  /**
   * Undefined when the file carries no key column at all, so "no column" and
   * "blank cell" stay distinguishable downstream.
   */
  sourceKey?: string;
}

export interface LoadedCsv {
  filePath: string;
  fileName: string;
  header: string[] | null;
  hasSourceKeyColumn: boolean;
  rows: LoadedRow[];
  findings: Finding[];
  /** True when loading failed badly enough that row checks would be noise. */
  fatal: boolean;
}

export interface LoadSpec {
  expectedHeader: string[];
  sourceKeyHeader: string;
  embeddedHeaderThreshold: number;
}

interface ParsedRecord {
  record: string[];
  line: number;
}

function parseRecords(text: string): ParsedRecord[] {
  const raw = parse(text, {
    bom: true,
    columns: false,
    relax_column_count: true,
    skip_empty_lines: true,
    relax_quotes: false,
    info: true,
  }) as unknown as Array<{ record: string[]; info: { lines: number } }>;

  // info.lines is where a record ends; with a newline inside a quoted field that
  // differs from where it began, and the start line is what a human needs.
  let previousEnd = 0;
  return raw.map(r => {
    const line = previousEnd + 1;
    previousEnd = r.info.lines;
    return { record: r.record, line };
  });
}

/** How many cells sit at the position of the header name they match. */
export function headerLikeScore(cells: string[], expectedHeader: string[]): number {
  let score = 0;
  for (let i = 0; i < expectedHeader.length; i += 1) {
    const cell = cells[i];
    if (cell !== undefined && normalizeHeaderCell(cell) === expectedHeader[i]) {
      score += 1;
    }
  }
  return score;
}

/**
 * Map positional cells onto the expected columns. Shuffled-but-complete headers
 * are remapped by name; a differing name set fails the file rather than guessing.
 */
function resolveHeader(
  headerCells: string[],
  spec: LoadSpec,
): {
  indexByColumn: number[];
  sourceKeyIndex: number | null;
  findings: Finding[];
  fatal: boolean;
} {
  const findings: Finding[] = [];
  const normalized = headerCells.map(normalizeHeaderCell);
  const tagged = normalized.includes(spec.sourceKeyHeader);
  const expected: readonly string[] = tagged
    ? [...spec.expectedHeader, spec.sourceKeyHeader]
    : spec.expectedHeader;

  const fail = (finding: Finding) => ({
    indexByColumn: [],
    sourceKeyIndex: null,
    findings: [...findings, finding],
    fatal: true,
  });

  if (normalized.length !== expected.length) {
    return fail(
      makeFinding(
        'HEADER_COLUMN_COUNT',
        'file',
        `Header has ${normalized.length} column(s), expected ${expected.length}. ` +
          `Found: [${normalized.join(', ')}]`,
      ),
    );
  }

  const indexByColumn = expected.map(name => normalized.indexOf(name));
  const missing = expected.filter((_, i) => indexByColumn[i] === -1);

  if (missing.length > 0) {
    const unexpected = normalized.filter(n => !expected.includes(n));
    return fail(
      makeFinding(
        'HEADER_COLUMN_MISMATCH',
        'file',
        `Header does not match the expected columns. Missing: [${missing.join(', ')}]. ` +
          `Unexpected: [${unexpected.join(', ')}]. Full header read as: [${normalized.join(', ')}]. ` +
          `Expected exactly: [${expected.join(', ')}]`,
      ),
    );
  }

  const sourceKeyIndex = tagged ? indexByColumn[spec.expectedHeader.length] : null;
  const inOrder = expected.every((name, i) => normalized[i] === name);

  if (!inOrder) {
    findings.push(
      makeFinding(
        'HEADER_COLUMN_MISMATCH',
        'file',
        `Header has all ${expected.length} expected columns but in the wrong order: ` +
          `[${normalized.join(', ')}]. Expected: [${expected.join(', ')}]. Columns were ` +
          `remapped by name so row checks below are still valid, but the file should be ` +
          `re-exported.`,
      ),
    );
  }

  return { indexByColumn, sourceKeyIndex, findings, fatal: false };
}

function cell(cells: string[], index: number): string {
  const value = cells[index];
  return value === undefined ? '' : value;
}

/** Load and shape one CSV. Never throws: every failure mode becomes a finding. */
export function loadCsv(filePath: string, spec: LoadSpec): LoadedCsv {
  const fileName = path.basename(filePath);
  const base: LoadedCsv = {
    filePath,
    fileName,
    header: null,
    hasSourceKeyColumn: false,
    rows: [],
    findings: [],
    fatal: false,
  };

  let text: string;
  try {
    text = fs.readFileSync(filePath, 'utf8');
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      ...base,
      findings: [makeFinding('FILE_UNREADABLE', 'file', `Could not read file: ${message}`)],
      fatal: true,
    };
  }

  if (text.trim() === '') {
    return {
      ...base,
      findings: [makeFinding('FILE_EMPTY', 'file', 'File is empty.')],
      fatal: true,
    };
  }

  let records: ParsedRecord[];
  try {
    records = parseRecords(text);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      ...base,
      findings: [
        makeFinding(
          'CSV_PARSE_ERROR',
          'file',
          `CSV could not be parsed, so no rows were checked: ${message}`,
        ),
      ],
      fatal: true,
    };
  }

  if (records.length === 0) {
    return {
      ...base,
      findings: [makeFinding('FILE_EMPTY', 'file', 'File contains no CSV records.')],
      fatal: true,
    };
  }

  const headerRecord = records[0];
  const { indexByColumn, sourceKeyIndex, findings: headerFindings, fatal } = resolveHeader(
    headerRecord.record,
    spec,
  );
  const findings = [...headerFindings];
  const header = headerRecord.record.map(normalizeHeaderCell);
  const hasSourceKeyColumn = sourceKeyIndex !== null;

  if (fatal) {
    return { ...base, header, findings, fatal: true };
  }

  const dataRecords = records.slice(1);
  if (dataRecords.length === 0) {
    findings.push(makeFinding('NO_DATA_ROWS', 'file', 'File has a header row but no data rows.'));
    return { ...base, header, hasSourceKeyColumn, findings, fatal: true };
  }

  const rows: LoadedRow[] = [];
  for (const rec of dataRecords) {
    const cells = rec.record;

    // Caught first, or its cells surface as a pile of invalid enums. Dropping the
    // row shifts every later row ordinal and the row count.
    if (headerLikeScore(cells, spec.expectedHeader) >= spec.embeddedHeaderThreshold) {
      findings.push(
        makeFinding(
          'EMBEDDED_HEADER_ROW',
          'file',
          `Line ${rec.line} is a duplicate of the header row appearing as data: ` +
            `[${cells.slice(0, spec.expectedHeader.length).join(', ')}]`,
          { line: rec.line },
        ),
      );
      continue;
    }

    const expectedColumnCount = hasSourceKeyColumn
      ? spec.expectedHeader.length + 1
      : spec.expectedHeader.length;

    if (cells.length !== expectedColumnCount) {
      findings.push(
        makeFinding(
          'ROW_COLUMN_COUNT',
          'file',
          `Line ${rec.line} has ${cells.length} column(s), expected ${expectedColumnCount}.`,
          { line: rec.line },
        ),
      );
      // Still shaped below: the cells we do have are worth checking, and missing
      // ones surface as their own empty-value findings.
    }

    const values: Record<string, string> = {};
    spec.expectedHeader.forEach((name, i) => {
      values[name] = cell(cells, indexByColumn[i]);
    });

    rows.push({
      line: rec.line,
      cells,
      values,
      ...(sourceKeyIndex === null ? {} : { sourceKey: cell(cells, sourceKeyIndex) }),
    });
  }

  return { ...base, header, hasSourceKeyColumn, rows, findings, fatal: false };
}
