/**
 * Colour-coded .xlsx of a Layer 1 run, for reviewers who work in a spreadsheet
 * rather than the panel.
 *
 * A clean run still produces a file — "there is nothing to fix" is a result
 * worth handing someone, and a report that only exists on failure leaves you
 * unsure whether it ran.
 */

import ExcelJS from 'exceljs';
import type { RunResult } from './verify';
import type { Loadout } from '../loadout/schema';

const FILL = {
  fail: 'FFFCE8E6',
  warn: 'FFFDF3D8',
  pass: 'FFE7F6EC',
  header: 'FF1F3B4D',
} as const;

function tint(row: ExcelJS.Row, colour: string): void {
  row.eachCell(cell => {
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: colour } };
  });
}

export async function writeRunReport(
  run: RunResult,
  loadout: Loadout,
  outPath: string,
): Promise<void> {
  const book = new ExcelJS.Workbook();
  book.created = new Date();

  // --- Summary ---
  const summary = book.addWorksheet('Summary');
  summary.columns = [
    { header: 'File', key: 'file', width: 52 },
    { header: 'Result', key: 'outcome', width: 10 },
    { header: 'Rows', key: 'rows', width: 8 },
    { header: 'Expected', key: 'expected', width: 10 },
    { header: 'Problems', key: 'problems', width: 10 },
    { header: 'Group', key: 'bucket', width: 28 },
  ];
  summary.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
  tint(summary.getRow(1), FILL.header);

  for (const file of run.files) {
    const problems = file.fileFindings.length + file.rowResults.reduce((n, r) => n + r.findings.length, 0);
    const row = summary.addRow({
      file: file.fileName,
      outcome: file.outcome.toUpperCase(),
      rows: file.rowResults.length,
      expected: file.expectedRowCount,
      problems,
      bucket: file.bucket ? Object.values(file.bucket).join(' / ') : '—',
    });
    tint(row, FILL[file.outcome]);
  }

  summary.addRow({});
  const overall = summary.addRow({
    file: `Loadout: ${loadout.label}`,
    outcome: run.outcome.toUpperCase(),
  });
  overall.font = { bold: true };
  tint(overall, FILL[run.outcome]);

  // --- Findings ---
  const sheet = book.addWorksheet('Problems');
  sheet.columns = [
    { header: 'File', key: 'file', width: 40 },
    { header: 'Line', key: 'line', width: 7 },
    { header: 'Column', key: 'column', width: 18 },
    { header: 'Severity', key: 'severity', width: 10 },
    { header: 'Code', key: 'code', width: 34 },
    { header: 'What to fix', key: 'message', width: 100 },
  ];
  sheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
  tint(sheet.getRow(1), FILL.header);

  const push = (file: string, f: { line?: number; column?: string; severity: string; code: string; message: string }) => {
    const row = sheet.addRow({
      file,
      line: f.line ?? '',
      column: f.column ?? '',
      severity: f.severity,
      code: f.code,
      message: f.message,
    });
    tint(row, f.severity === 'warn' ? FILL.warn : FILL.fail);
    row.getCell('message').alignment = { wrapText: true, vertical: 'top' };
  };

  for (const f of run.runFindings) push('(across files)', f);
  for (const file of run.files) {
    for (const f of file.fileFindings) push(file.fileName, f);
    for (const r of file.rowResults) for (const f of r.findings) push(file.fileName, f);
  }

  if (sheet.rowCount === 1) {
    const row = sheet.addRow({ message: 'No problems found — this batch is clean.' });
    tint(row, FILL.pass);
  }

  sheet.views = [{ state: 'frozen', ySplit: 1 }];
  summary.views = [{ state: 'frozen', ySplit: 1 }];

  await book.xlsx.writeFile(outPath);
}
