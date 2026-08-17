/**
 * Writes the colored .xlsx verification report.
 *
 * Layout decision: ONE workbook per run, with a Summary sheet plus one sheet per
 * input CSV — not one workbook per CSV. A typical run checks 10+ files, and the
 * point of the report is to answer "is this batch importable?" in one look.
 * Per-file workbooks would mean opening ten files to answer that, and would
 * leave run-scoped findings (two files claiming the same bucket) with nowhere to
 * live. Sheet tabs give the same per-file drill-down at no cost.
 *
 * The fills are Excel's own Good / Neutral / Bad palette, which is designed for
 * black text and is what a reviewer already recognizes from conditional
 * formatting.
 */

import path from 'path';
import ExcelJS from 'exceljs';
import {
  bucketKey,
  OPTION_KEYS,
  type FileResult,
  type Finding,
  type OptionKey,
  type RowOutcome,
  type RunResult,
} from './types';

/**
 * How many times each option letter is the stored correct_answer in this file —
 * see the identical helper in layer1-verifier/cli.ts for why this matters. Kept
 * as a separate copy rather than a shared import: this module must stay usable
 * standalone (it is imported by all three tools' CLIs), and the two copies are
 * five lines each, cheaper to duplicate than to introduce a new shared module for.
 */
function answerDistribution(file: FileResult): Record<OptionKey, number> {
  const counts: Record<OptionKey, number> = { A: 0, B: 0, C: 0, D: 0 };
  for (const rr of file.rowResults) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(rr.row.correct_answer.trim());
    } catch {
      continue;
    }
    if (typeof parsed === 'string' && (OPTION_KEYS as readonly string[]).includes(parsed)) {
      counts[parsed as OptionKey] += 1;
    }
  }
  return counts;
}

const FILL: Record<RowOutcome, string> = {
  pass: 'FFC6EFCE', // light green
  warn: 'FFFFEB9C', // light amber
  fail: 'FFFFC7CE', // light red
};

const FONT_COLOR: Record<RowOutcome, string> = {
  pass: 'FF006100',
  warn: 'FF9C6500',
  fail: 'FF9C0006',
};

const HEADER_FILL = 'FF1F3864';

const ROW_COLUMNS: Array<{ header: string; width: number }> = [
  { header: 'Row #', width: 7 },
  { header: 'CSV Line', width: 9 },
  { header: 'Outcome', width: 9 },
  { header: 'Codes', width: 30 },
  { header: 'Reason', width: 70 },
  { header: 'skill', width: 12 },
  { header: 'sub_skill', width: 15 },
  { header: 'level', width: 14 },
  { header: 'prompt_text', width: 50 },
  { header: 'options', width: 45 },
  { header: 'correct_answer', width: 15 },
  { header: 'explanation', width: 50 },
];

function paintRow(row: ExcelJS.Row, outcome: RowOutcome, columnCount: number): void {
  for (let c = 1; c <= columnCount; c += 1) {
    const cell = row.getCell(c);
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: FILL[outcome] } };
    cell.font = { color: { argb: FONT_COLOR[outcome] } };
    cell.alignment = { vertical: 'top', wrapText: true };
  }
}

function styleTableHeader(row: ExcelJS.Row, columnCount: number): void {
  for (let c = 1; c <= columnCount; c += 1) {
    const cell = row.getCell(c);
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: HEADER_FILL } };
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    cell.alignment = { vertical: 'middle', horizontal: 'left' };
  }
}

/** Codes joined for the machine-readable column. */
function codesOf(findings: Finding[]): string {
  return findings.map(f => f.code).join(', ');
}

/**
 * The human-readable reason. Numbered when there is more than one finding, so a
 * row with three problems reads as three problems rather than one run-on
 * sentence.
 */
function reasonOf(findings: Finding[]): string {
  if (findings.length === 0) return '';
  if (findings.length === 1) return findings[0].message;
  return findings.map((f, i) => `${i + 1}. ${f.message}`).join('\n');
}

/**
 * Excel sheet names: max 31 chars, cannot contain : \ / ? * [ ], cannot be
 * blank, must be unique in the workbook. Real filenames are ~60 chars and
 * contain `·`, so build a short readable label from the bucket when we know it
 * and fall back to the filename, then guarantee uniqueness with the file index.
 */
export function sheetNameFor(file: FileResult, index: number, taken: Set<string>): string {
  const prefix = String(index + 1).padStart(2, '0');

  const label = file.bucket
    ? `${file.bucket.skill}-${file.bucket.sub_skill}-${file.bucket.level}`
    : path.basename(file.fileName, path.extname(file.fileName));

  const cleaned = label
    .replace(/[:\\/?*[\]]/g, '-')
    .replace(/\s+/g, ' ')
    .trim();

  const budget = 31 - (prefix.length + 1);
  let name = `${prefix} ${cleaned.slice(0, budget)}`.trim();

  // Uniqueness: shave characters off the tail to make room for a counter.
  let attempt = 2;
  while (taken.has(name.toLowerCase())) {
    const suffix = `~${attempt}`;
    name = `${prefix} ${cleaned.slice(0, budget - suffix.length)}${suffix}`;
    attempt += 1;
  }

  taken.add(name.toLowerCase());
  return name;
}

/**
 * A findings block placed above a table. Used for file-scoped findings (bad
 * header, wrong row count) and run-scoped ones (duplicate bucket across files),
 * which belong to no single question row and would otherwise be invisible in a
 * report that is "one row per question".
 */
function writeFindingsBlock(
  sheet: ExcelJS.Worksheet,
  title: string,
  findings: Finding[],
): void {
  const heading = sheet.addRow([title]);
  heading.font = { bold: true, size: 12 };

  if (findings.length === 0) {
    const none = sheet.addRow(['None.']);
    none.font = { italic: true, color: { argb: 'FF006100' } };
    sheet.addRow([]);
    return;
  }

  const head = sheet.addRow(['Severity', 'Code', 'CSV Line', 'Detail']);
  styleTableHeader(head, 4);

  for (const f of findings) {
    const row = sheet.addRow([
      f.severity === 'fail' ? 'FAIL' : 'WARNING',
      f.code,
      f.line ?? '',
      f.message,
    ]);
    paintRow(row, f.severity === 'fail' ? 'fail' : 'warn', 4);
  }

  sheet.addRow([]);
}

function writeFileSheet(workbook: ExcelJS.Workbook, file: FileResult, sheetName: string): void {
  const sheet = workbook.addWorksheet(sheetName, {
    views: [{ state: 'frozen', ySplit: 0 }],
  });

  const titleRow = sheet.addRow([`File: ${file.fileName}`]);
  titleRow.font = { bold: true, size: 13 };
  sheet.addRow([`Bucket: ${file.bucket ? bucketKey(file.bucket) : '(not determined)'}`]);
  sheet.addRow([
    `Rows: ${file.rowResults.length}   Expected: ${file.expectedRowCount}   ` +
      `Outcome: ${file.outcome.toUpperCase()}`,
  ]);
  const dist = answerDistribution(file);
  sheet.addRow([
    `Answer distribution: ${OPTION_KEYS.map(k => `${k}: ${dist[k]}`).join('   ')}`,
  ]);
  sheet.addRow([]);

  writeFindingsBlock(sheet, 'File-level findings', file.fileFindings);

  const headerRow = sheet.addRow(ROW_COLUMNS.map(c => c.header));
  styleTableHeader(headerRow, ROW_COLUMNS.length);

  // Freeze everything down to and including the table header, so scrolling the
  // question rows keeps the column names — and the file-level verdict — in view.
  sheet.views = [{ state: 'frozen', ySplit: headerRow.number }];
  sheet.autoFilter = {
    from: { row: headerRow.number, column: 1 },
    to: { row: headerRow.number, column: ROW_COLUMNS.length },
  };

  ROW_COLUMNS.forEach((c, i) => {
    sheet.getColumn(i + 1).width = c.width;
  });

  file.rowResults.forEach((rr, i) => {
    const row = sheet.addRow([
      i + 1,
      rr.row.line,
      rr.outcome.toUpperCase(),
      codesOf(rr.findings),
      reasonOf(rr.findings),
      rr.row.skill,
      rr.row.sub_skill,
      rr.row.level,
      rr.row.prompt_text,
      rr.row.options,
      rr.row.correct_answer,
      rr.row.explanation,
    ]);
    paintRow(row, rr.outcome, ROW_COLUMNS.length);
  });
}

function writeSummarySheet(workbook: ExcelJS.Workbook, run: RunResult, sheetNames: string[]): void {
  const sheet = workbook.addWorksheet('Summary');

  const title = sheet.addRow(['Layer 1 — Drill Question CSV Verifier']);
  title.font = { bold: true, size: 14 };
  sheet.addRow([`Run outcome: ${run.outcome.toUpperCase()}`]).font = {
    bold: true,
    color: { argb: FONT_COLOR[run.outcome] },
  };
  sheet.addRow([`Files checked: ${run.files.length}`]);
  sheet.addRow([`Expected rows per file: ${run.expectedLabel}`]);
  sheet.addRow([]);

  writeFindingsBlock(sheet, 'Run-level findings (across files)', run.runFindings);

  const head = sheet.addRow([
    'Sheet',
    'File',
    'Bucket',
    'Rows',
    'Expected',
    'Pass',
    'Warn',
    'Fail',
    'File-level issues',
    'Outcome',
  ]);
  styleTableHeader(head, 10);

  const widths = [22, 58, 34, 7, 9, 7, 7, 7, 17, 10];
  widths.forEach((w, i) => {
    sheet.getColumn(i + 1).width = w;
  });

  run.files.forEach((f, i) => {
    const pass = f.rowResults.filter(r => r.outcome === 'pass').length;
    const warn = f.rowResults.filter(r => r.outcome === 'warn').length;
    const fail = f.rowResults.filter(r => r.outcome === 'fail').length;
    const row = sheet.addRow([
      sheetNames[i],
      f.fileName,
      f.bucket ? bucketKey(f.bucket) : '(not determined)',
      f.rowResults.length,
      f.expectedRowCount,
      pass,
      warn,
      fail,
      f.fileFindings.length,
      f.outcome.toUpperCase(),
    ]);
    paintRow(row, f.outcome, 10);
  });
}

/** Build the workbook and write it. Returns the path written. */
export async function writeRunReport(run: RunResult, outPath: string): Promise<string> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Layer 1 Drill Question Verifier';
  workbook.created = new Date();

  const taken = new Set<string>(['summary']);
  const sheetNames = run.files.map((f, i) => sheetNameFor(f, i, taken));

  writeSummarySheet(workbook, run, sheetNames);
  run.files.forEach((f, i) => writeFileSheet(workbook, f, sheetNames[i]));

  await workbook.xlsx.writeFile(outPath);
  return outPath;
}

/** `layer1-verify-20260801-143005.xlsx` — sortable, and unique per run. */
export function defaultReportName(now: Date = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0');
  const stamp =
    `${now.getFullYear()}${p(now.getMonth() + 1)}${p(now.getDate())}` +
    `-${p(now.getHours())}${p(now.getMinutes())}${p(now.getSeconds())}`;
  return `layer1-verify-${stamp}.xlsx`;
}
