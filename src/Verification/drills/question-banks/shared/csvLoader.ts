/**
 * Reads a drill-question CSV into positional rows, with findings for anything
 * that goes wrong at the file/header level.
 *
 * Why a real CSV parser and not `.split(',')`: the `options` column is JSON
 * (`{"A":"x","B":"y",...}`) and `explanation` is prose. Both routinely contain
 * commas, and `options` always contains double quotes, which the exporter
 * escapes by doubling them inside a quoted field. Splitting on commas shreds
 * every row. `csv-parse` is used because it is RFC-4180 correct, has a
 * synchronous array-returning API, handles a UTF-8 BOM and CRLF natively, ships
 * its own TypeScript types, and — the deciding factor — can be told to tolerate
 * a wrong column count so we *report* that row rather than aborting the file.
 *
 * The parser is deliberately NOT given `columns: true`. We need the header as
 * data so we can detect a header row duplicated further down the file, which is
 * a real bug that a header-consuming parser would silently swallow.
 */

import fs from 'fs';
import path from 'path';
import { parse } from 'csv-parse/sync';
import {
  EXPECTED_HEADER,
  SOURCE_KEY_HEADER,
  makeFinding,
  type DrillCsvRow,
  type Finding,
  type LoadedCsv,
} from './types';
import { normalizeHeaderCell } from './normalize';

/** How many positional header-name matches make a data row "really" a header. */
const EMBEDDED_HEADER_MATCH_THRESHOLD = 4;

interface ParsedRecord {
  record: string[];
  /** 1-based physical line in the file where this record STARTS. */
  line: number;
}

function parseRecords(text: string): ParsedRecord[] {
  const raw = parse(text, {
    bom: true,
    columns: false,
    // Report a wrong column count as a finding instead of throwing away the file.
    relax_column_count: true,
    // A trailing newline is normal in every export; it must not become a row.
    skip_empty_lines: true,
    // Quoting errors are NOT relaxed: a stray quote means the file is genuinely
    // corrupt, and guessing at the author's intent is how bad rows reach prod.
    relax_quotes: false,
    info: true,
    // `info: true` changes the element shape to { record, info }, which the
    // synchronous overload's return type does not model.
  }) as unknown as Array<{ record: string[]; info: { lines: number } }>;

  // `info.lines` is the line a record ENDS on, which differs from where it began
  // whenever a quoted field contains a newline (explanations sometimes do). The
  // start line is what a human needs to open the file and look, so derive it.
  let previousEnd = 0;
  return raw.map(r => {
    const line = previousEnd + 1;
    previousEnd = r.info.lines;
    return { record: r.record, line };
  });
}

/**
 * Count how many cells sit at the position of the header name they match.
 * A genuine content row scores 0 — no prompt normalizes to `prompt_text`.
 */
export function headerLikeScore(cells: string[]): number {
  let score = 0;
  for (let i = 0; i < EXPECTED_HEADER.length; i += 1) {
    const cell = cells[i];
    if (cell !== undefined && normalizeHeaderCell(cell) === EXPECTED_HEADER[i]) {
      score += 1;
    }
  }
  return score;
}

/**
 * Work out how to map positional cells onto the expected columns.
 *
 * Exact expected order is the happy path. If all names are present but shuffled,
 * we remap by name and record it — the data is still recoverable. If the name *set*
 * differs at all (a missing name, or a stray value like the literal `1` seen in one
 * real export) we refuse to guess and fail the file, because mapping the wrong
 * column into `correct_answer` would produce a page of confident, wrong row findings.
 *
 * The expected set is 7 columns, or 8 when the file carries `source_key` — a file
 * is tagged or untagged and both are legitimate states, so the column's presence is
 * read off the header rather than demanded. Whether an untagged file is acceptable
 * is a policy question for the caller, not a parsing question.
 */
function resolveHeader(
  headerCells: string[],
): {
  indexByColumn: number[];
  sourceKeyIndex: number | null;
  findings: Finding[];
  fatal: boolean;
} {
  const findings: Finding[] = [];
  const normalized = headerCells.map(normalizeHeaderCell);
  const tagged = normalized.includes(SOURCE_KEY_HEADER);
  const expected: readonly string[] = tagged
    ? [...EXPECTED_HEADER, SOURCE_KEY_HEADER]
    : EXPECTED_HEADER;

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

  const sourceKeyIndex = tagged ? indexByColumn[EXPECTED_HEADER.length] : null;
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

/**
 * Load and shape one CSV. Never throws: every failure mode becomes a finding, so
 * a crash can never be mistaken for a clean file.
 */
export function loadDrillCsv(filePath: string): LoadedCsv {
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
  const {
    indexByColumn,
    sourceKeyIndex,
    findings: headerFindings,
    fatal,
  } = resolveHeader(headerRecord.record);
  const findings = [...headerFindings];
  const header = headerRecord.record.map(normalizeHeaderCell);
  const hasSourceKeyColumn = sourceKeyIndex !== null;

  if (fatal) {
    return { ...base, header, findings, fatal: true };
  }

  const dataRecords = records.slice(1);
  if (dataRecords.length === 0) {
    findings.push(
      makeFinding('NO_DATA_ROWS', 'file', 'File has a header row but no data rows.'),
    );
    return { ...base, header, hasSourceKeyColumn, findings, fatal: true };
  }

  const rows: DrillCsvRow[] = [];
  for (const rec of dataRecords) {
    const cells = rec.record;

    // A header row duplicated as data. Caught before anything else looks at the
    // row, because its cells would otherwise be reported as a pile of invalid
    // enum values and mask what actually went wrong.
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

    const expectedColumnCount = hasSourceKeyColumn
      ? EXPECTED_HEADER.length + 1
      : EXPECTED_HEADER.length;

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

    rows.push({
      line: rec.line,
      cells,
      skill: cell(cells, indexByColumn[0]),
      sub_skill: cell(cells, indexByColumn[1]),
      level: cell(cells, indexByColumn[2]),
      prompt_text: cell(cells, indexByColumn[3]),
      options: cell(cells, indexByColumn[4]),
      correct_answer: cell(cells, indexByColumn[5]),
      explanation: cell(cells, indexByColumn[6]),
      // Undefined (not '') when the file has no such column, so a missing column
      // and a blank cell stay distinguishable downstream.
      ...(sourceKeyIndex === null ? {} : { source_key: cell(cells, sourceKeyIndex) }),
    });
  }

  return { ...base, header, hasSourceKeyColumn, rows, findings, fatal: false };
}

// ---------------------------------------------------------------------------
// Writing
// ---------------------------------------------------------------------------

/**
 * Quote one field per RFC 4180.
 *
 * Hand-rolled rather than pulled from a library because the rule is three lines
 * and the alternative was adding a dependency for it. The risk in hand-rolling is
 * getting the quoting subtly wrong on exactly the data that matters here — the
 * `options` column is JSON and therefore always contains double quotes — so
 * `writeDrillCsv` is tested by writing a file and re-parsing it with `csv-parse`,
 * asserting every cell survives the round trip byte for byte.
 */
function quoteField(value: string): string {
  if (/[",\r\n]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

export function toCsvText(header: readonly string[], rows: readonly string[][]): string {
  const lines = [header, ...rows].map(cells => cells.map(quoteField).join(','));
  // Trailing newline: every real export has one, and `skip_empty_lines` means it
  // cannot be mistaken for an extra row on the way back in.
  return `${lines.join('\r\n')}\r\n`;
}

/** Write a CSV, creating parent directories as needed. */
export function writeDrillCsv(
  filePath: string,
  header: readonly string[],
  rows: readonly string[][],
): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, toCsvText(header, rows), 'utf8');
}

/**
 * List candidate CSVs under a directory, recursing into subfolders, optionally
 * filtered by a case-insensitive substring of the filename.
 *
 * Recursion is what lets one run cover `drills/beginner`, `drills/intermediate`
 * and `drills/advanced` together.
 */
export function findCsvFiles(dir: string, match?: string): string[] {
  const needle = match?.toLowerCase();
  const found: string[] = [];

  const walk = (current: string): void => {
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) {
        walk(full);
      } else if (entry.isFile() && entry.name.toLowerCase().endsWith('.csv')) {
        if (needle === undefined || entry.name.toLowerCase().includes(needle)) {
          found.push(full);
        }
      }
    }
  };

  walk(dir);
  return found.sort((a, b) => a.localeCompare(b));
}
