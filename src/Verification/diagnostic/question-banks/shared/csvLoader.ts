/**
 * Reads a diagnostic-question staging CSV into positional rows.
 *
 * Structurally the same approach as the drills loader (RFC-4180 parsing via
 * `csv-parse`, header read as data so an embedded duplicate header is
 * detected, never throws — every failure becomes a Finding) but built around
 * the diagnostic row shape (12 columns, no `sub_skill`, no `source_key`
 * concept — see shared/types.ts for why).
 */

import fs from 'fs';
import path from 'path';
import { parse } from 'csv-parse/sync';
import {
  EXPECTED_HEADER,
  makeFinding,
  type DiagnosticCsvRow,
  type Finding,
  type LoadedCsv,
} from './types';
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

function resolveHeader(
  headerCells: string[],
): { indexByColumn: number[]; findings: Finding[]; fatal: boolean } {
  const normalized = headerCells.map(normalizeHeaderCell);
  const expected: readonly string[] = EXPECTED_HEADER;

  if (normalized.length !== expected.length) {
    return {
      indexByColumn: [],
      fatal: true,
      findings: [
        makeFinding(
          'HEADER_COLUMN_COUNT',
          'file',
          `Header has ${normalized.length} column(s), expected ${expected.length}. ` +
            `Found: [${normalized.join(', ')}]`,
        ),
      ],
    };
  }

  const indexByColumn = expected.map(name => normalized.indexOf(name));
  const missing = expected.filter((_, i) => indexByColumn[i] === -1);

  if (missing.length > 0) {
    const unexpected = normalized.filter(n => !expected.includes(n as (typeof EXPECTED_HEADER)[number]));
    return {
      indexByColumn: [],
      fatal: true,
      findings: [
        makeFinding(
          'HEADER_COLUMN_MISMATCH',
          'file',
          `Header does not match the expected columns. Missing: [${missing.join(', ')}]. ` +
            `Unexpected: [${unexpected.join(', ')}]. Expected exactly: [${expected.join(', ')}]`,
        ),
      ],
    };
  }

  const inOrder = expected.every((name, i) => normalized[i] === name);
  const findings: Finding[] = [];
  if (!inOrder) {
    findings.push(
      makeFinding(
        'HEADER_COLUMN_MISMATCH',
        'file',
        `Header has all ${expected.length} expected columns but in the wrong order: ` +
          `[${normalized.join(', ')}]. Columns were remapped by name so row checks are still ` +
          `valid, but the file should be re-exported in order.`,
      ),
    );
  }

  return { indexByColumn, findings, fatal: false };
}

function cell(cells: string[], index: number): string {
  const value = cells[index];
  return value === undefined ? '' : value;
}

export function loadDiagnosticCsv(filePath: string): LoadedCsv {
  const fileName = path.basename(filePath);
  const base: LoadedCsv = { filePath, fileName, header: null, rows: [], findings: [], fatal: false };

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
  const { indexByColumn, findings: headerFindings, fatal } = resolveHeader(headerRecord.record);
  const findings = [...headerFindings];
  const header = headerRecord.record.map(normalizeHeaderCell);

  if (fatal) return { ...base, header, findings, fatal: true };

  const dataRecords = records.slice(1);
  if (dataRecords.length === 0) {
    findings.push(makeFinding('NO_DATA_ROWS', 'file', 'File has a header row but no data rows.'));
    return { ...base, header, findings, fatal: true };
  }

  const rows: DiagnosticCsvRow[] = [];
  for (const rec of dataRecords) {
    const cells = rec.record;

    if (headerLikeScore(cells) >= EMBEDDED_HEADER_MATCH_THRESHOLD) {
      findings.push(
        makeFinding(
          'EMBEDDED_HEADER_ROW',
          'file',
          `Line ${rec.line} is a duplicate of the header row appearing as data: ` +
            `[${cells.slice(0, EXPECTED_HEADER.length).join(', ')}]`,
          { line: rec.line },
        ),
      );
      continue;
    }

    if (cells.length !== EXPECTED_HEADER.length) {
      findings.push(
        makeFinding(
          'ROW_COLUMN_COUNT',
          'file',
          `Line ${rec.line} has ${cells.length} column(s), expected ${EXPECTED_HEADER.length}.`,
          { line: rec.line },
        ),
      );
    }

    rows.push({
      line: rec.line,
      cells,
      skill: cell(cells, indexByColumn[0]),
      level: cell(cells, indexByColumn[1]),
      set_id: cell(cells, indexByColumn[2]),
      sequence: cell(cells, indexByColumn[3]),
      question_type: cell(cells, indexByColumn[4]),
      prompt_text: cell(cells, indexByColumn[5]),
      options: cell(cells, indexByColumn[6]),
      correct_answer: cell(cells, indexByColumn[7]),
      min_words: cell(cells, indexByColumn[8]),
      passage_text: cell(cells, indexByColumn[9]),
      audio_file: cell(cells, indexByColumn[10]),
      transcript: cell(cells, indexByColumn[11]),
    });
  }

  return { ...base, header, rows, findings, fatal: false };
}

// Generic, format-agnostic file utilities are identical to drills' — reused
// directly rather than re-implemented (see that module for why each is shaped
// the way it is).
export { toCsvText, writeDrillCsv as writeDiagnosticCsv, findCsvFiles } from '../../../drills/question-banks/shared/csvLoader';
