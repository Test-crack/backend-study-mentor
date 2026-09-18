/**
 * Writes the colored .xlsx Layer 1 report for IA batches. Same shape and
 * palette as drills'/diagnostic's — one Summary sheet plus one sheet per
 * input CSV — so a reviewer who knows one report format knows all three.
 */

import path from 'path';
import ExcelJS from 'exceljs';
import { bucketKey, type FileResult, type Finding, type RowOutcome, type RunResult } from './types';

const FILL: Record<RowOutcome, string> = {
  pass: 'FFC6EFCE',
  warn: 'FFFFEB9C',
  fail: 'FFFFC7CE',
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
  { header: 'difficulty', width: 14 },
  { header: 'question_type', width: 16 },
  { header: 'prompt_text', width: 50 },
  { header: 'options', width: 40 },
  { header: 'correct_answer', width: 14 },
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

function codesOf(findings: Finding[]): string {
  return findings.map(f => f.code).join(', ');
}

function reasonOf(findings: Finding[]): string {
  if (findings.length === 0) return '';
  if (findings.length === 1) return findings[0].message;
  return findings.map((f, i) => `${i + 1}. ${f.message}`).join('\n');
}

export function sheetNameFor(file: FileResult, index: number, taken: Set<string>): string {
  const prefix = String(index + 1).padStart(2, '0');
  const label = file.bucket
    ? `${file.bucket.skill}-${file.bucket.sub_skill}-${file.bucket.difficulty}`
    : path.basename(file.fileName, path.extname(file.fileName));

  const cleaned = label.replace(/[:\\/?*[\]]/g, '-').replace(/\s+/g, ' ').trim();
  const budget = 31 - (prefix.length + 1);
  let name = `${prefix} ${cleaned.slice(0, budget)}`.trim();

  let attempt = 2;
  while (taken.has(name.toLowerCase())) {
    const suffix = `~${attempt}`;
    name = `${prefix} ${cleaned.slice(0, budget - suffix.length)}${suffix}`;
    attempt += 1;
  }

  taken.add(name.toLowerCase());
  return name;
}

function writeFindingsBlock(sheet: ExcelJS.Worksheet, title: string, findings: Finding[]): void {
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
    const row = sheet.addRow([f.severity === 'fail' ? 'FAIL' : 'WARNING', f.code, f.line ?? '', f.message]);
    paintRow(row, f.severity === 'fail' ? 'fail' : 'warn', 4);
  }
  sheet.addRow([]);
}

function writeFileSheet(workbook: ExcelJS.Workbook, file: FileResult, sheetName: string): void {
  const sheet = workbook.addWorksheet(sheetName, { views: [{ state: 'frozen', ySplit: 0 }] });

  const titleRow = sheet.addRow([`File: ${file.fileName}`]);
  titleRow.font = { bold: true, size: 13 };
  sheet.addRow([`Bucket: ${file.bucket ? bucketKey(file.bucket) : '(not determined)'}`]);
  sheet.addRow([
    `Rows: ${file.rowResults.length}   Expected: ${file.expectedRowCount}   Outcome: ${file.outcome.toUpperCase()}`,
  ]);
  sheet.addRow([]);

  writeFindingsBlock(sheet, 'File-level findings', file.fileFindings);

  const headerRow = sheet.addRow(ROW_COLUMNS.map(c => c.header));
  styleTableHeader(headerRow, ROW_COLUMNS.length);
  sheet.views = [{ state: 'frozen', ySplit: headerRow.number }];
  sheet.autoFilter = { from: { row: headerRow.number, column: 1 }, to: { row: headerRow.number, column: ROW_COLUMNS.length } };
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
      rr.row.difficulty,
      rr.row.question_type,
      rr.row.prompt_text,
      rr.row.options,
      rr.row.correct_answer,
    ]);
    paintRow(row, rr.outcome, ROW_COLUMNS.length);
  });
}

function writeSummarySheet(workbook: ExcelJS.Workbook, run: RunResult, sheetNames: string[]): void {
  const sheet = workbook.addWorksheet('Summary');

  const title = sheet.addRow(['Layer 1 — IA Question CSV Verifier']);
  title.font = { bold: true, size: 14 };
  sheet.addRow([`Run outcome: ${run.outcome.toUpperCase()}`]).font = { bold: true, color: { argb: FONT_COLOR[run.outcome] } };
  sheet.addRow([`Files checked: ${run.files.length}`]);
  sheet.addRow([`Expected rows per file: ${run.expectedLabel}`]);
  sheet.addRow([]);

  writeFindingsBlock(sheet, 'Run-level findings (across files)', run.runFindings);

  const head = sheet.addRow(['Sheet', 'File', 'Bucket', 'Rows', 'Expected', 'Pass', 'Warn', 'Fail', 'File-level issues', 'Outcome']);
  styleTableHeader(head, 10);
  [22, 58, 34, 7, 9, 7, 7, 7, 17, 10].forEach((w, i) => {
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

export async function writeRunReport(run: RunResult, outPath: string): Promise<string> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Layer 1 IA Question Verifier';
  workbook.created = new Date();

  const taken = new Set<string>(['summary']);
  const sheetNames = run.files.map((f, i) => sheetNameFor(f, i, taken));

  writeSummarySheet(workbook, run, sheetNames);
  run.files.forEach((f, i) => writeFileSheet(workbook, f, sheetNames[i]));

  await workbook.xlsx.writeFile(outPath);
  return outPath;
}
