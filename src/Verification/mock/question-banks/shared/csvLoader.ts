/**
 * Reads a Mock question CSV into positional rows.
 *
 * Structurally identical to IA's/drills' loader (RFC-4180 via `csv-parse`,
 * header read as data so an embedded duplicate header is caught, never
 * throws) but built around Mock's 12-column row shape (task_type in place
 * of difficulty), with an optional 13th `source_key` column.
 */

import fs from 'fs';
import path from 'path';
import { parse } from 'csv-parse/sync';
import { EXPECTED_HEADER, SOURCE_KEY_HEADER, makeFinding, type Finding, type LoadedCsv, type MockCsvRow } from './types';
import { normalizeHeaderCell } from '../../../drills/question-banks/shared/normalize';

const EMBEDDED_HEADER_MATCH_THRESHOLD = 6;

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

  let previousEnd = 0;
  return raw.map(r => {
    const line = previousEnd + 1;
    previousEnd = r.info.lines;
    return { record: r.record, line };
  });
}

export function headerLikeScore(cells: string[]): number {
  let score = 0;
  for (let i = 0; i < EXPECTED_HEADER.length; i += 1) {
    const c = cells[i];
    if (c !== undefined && normalizeHeaderCell(c) === EXPECTED_HEADER[i]) score += 1;
  }
  return score;
}

function resolveHeader(headerCells: string[]): {
  indexByColumn: number[];
  sourceKeyIndex: number | null;
  findings: Finding[];
  fatal: boolean;
} {
  const findings: Finding[] = [];
  const normalized = headerCells.map(normalizeHeaderCell);
  const tagged = normalized.includes(SOURCE_KEY_HEADER);
  const expected: readonly string[] = tagged ? [...EXPECTED_HEADER, SOURCE_KEY_HEADER] : EXPECTED_HEADER;

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
        `Header has ${normalized.length} column(s), expected ${expected.length}. Found: [${normalized.join(', ')}]`,
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
          `Unexpected: [${unexpected.join(', ')}]. Expected exactly: [${expected.join(', ')}]`,
      ),
    );
  }

  const sourceKeyIndex = tagged ? indexByColumn[EXPECTED_HEADER.length] : null;
  const inOrder = expected.every((name, i) => normalized[i] === name);

  if (!inOrder) {
    findings.push(
      makeFinding(
        'HEADER_COLUMN_MISMATCH',
        'file',
        `Header has all ${expected.length} expected columns but in the wrong order: [${normalized.join(', ')}]. ` +
          `Columns were remapped by name so row checks below are still valid, but the file should be re-exported.`,
      ),
    );
  }

  return { indexByColumn, sourceKeyIndex, findings, fatal: false };
}

function cell(cells: string[], index: number): string {
  const value = cells[index];
  return value === undefined ? '' : value;
}

export function loadMockCsv(filePath: string): LoadedCsv {
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
    return { ...base, findings: [makeFinding('FILE_UNREADABLE', 'file', `Could not read file: ${message}`)], fatal: true };
  }

  if (text.trim() === '') {
    return { ...base, findings: [makeFinding('FILE_EMPTY', 'file', 'File is empty.')], fatal: true };
  }

  let records: ParsedRecord[];
  try {
    records = parseRecords(text);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      ...base,
      findings: [makeFinding('CSV_PARSE_ERROR', 'file', `CSV could not be parsed, so no rows were checked: ${message}`)],
      fatal: true,
    };
  }

  if (records.length === 0) {
    return { ...base, findings: [makeFinding('FILE_EMPTY', 'file', 'File contains no CSV records.')], fatal: true };
  }

  const headerRecord = records[0];
  const { indexByColumn, sourceKeyIndex, findings: headerFindings, fatal } = resolveHeader(headerRecord.record);
  const findings = [...headerFindings];
  const header = headerRecord.record.map(normalizeHeaderCell);
  const hasSourceKeyColumn = sourceKeyIndex !== null;

  if (fatal) return { ...base, header, findings, fatal: true };

  const dataRecords = records.slice(1);
  if (dataRecords.length === 0) {
    findings.push(makeFinding('NO_DATA_ROWS', 'file', 'File has a header row but no data rows.'));
    return { ...base, header, hasSourceKeyColumn, findings, fatal: true };
  }

  const rows: MockCsvRow[] = [];
  for (const rec of dataRecords) {
    const cells = rec.record;

    if (headerLikeScore(cells) >= EMBEDDED_HEADER_MATCH_THRESHOLD) {
      findings.push(
        makeFinding(
          'EMBEDDED_HEADER_ROW',
          'file',
          `Line ${rec.line} is a duplicate of the header row appearing as data: [${cells.slice(0, EXPECTED_HEADER.length).join(', ')}]`,
          { line: rec.line },
        ),
      );
      continue;
    }

    const expectedColumnCount = hasSourceKeyColumn ? EXPECTED_HEADER.length + 1 : EXPECTED_HEADER.length;
    if (cells.length !== expectedColumnCount) {
      findings.push(
        makeFinding('ROW_COLUMN_COUNT', 'file', `Line ${rec.line} has ${cells.length} column(s), expected ${expectedColumnCount}.`, {
          line: rec.line,
        }),
      );
    }

    rows.push({
      line: rec.line,
      cells,
      skill: cell(cells, indexByColumn[0]),
      sub_skill: cell(cells, indexByColumn[1]),
      question_type: cell(cells, indexByColumn[2]),
      task_type: cell(cells, indexByColumn[3]),
      passage_id: cell(cells, indexByColumn[4]),
      passage_text: cell(cells, indexByColumn[5]),
      audio_url: cell(cells, indexByColumn[6]),
      prompt_text: cell(cells, indexByColumn[7]),
      options: cell(cells, indexByColumn[8]),
      correct_answer: cell(cells, indexByColumn[9]),
      explanation: cell(cells, indexByColumn[10]),
      exam_type: cell(cells, indexByColumn[11]),
      ...(sourceKeyIndex === null ? {} : { source_key: cell(cells, sourceKeyIndex) }),
    });
  }

  return { ...base, header, hasSourceKeyColumn, rows, findings, fatal: false };
}

// Generic, format-agnostic file utilities are identical to drills' — reused
// directly rather than re-implemented.
export { toCsvText, writeDrillCsv as writeMockCsv, findCsvFiles } from '../../../drills/question-banks/shared/csvLoader';
