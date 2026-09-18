/**
 * Layer 2's colored Excel report. Same shape as Layer 1's — Summary sheet plus
 * one sheet per CSV — so the two read the same way.
 *
 * One colour is added: grey, for UNJUDGED and SKIPPED. Those rows were not
 * checked, and "not checked" must never be able to look like "passed". Folding
 * them into green would be the single most dangerous thing this report could do.
 */

import path from 'path';
import ExcelJS from 'exceljs';
import { bucketKey } from '../shared/types';
import {
  JUDGE_OUTCOMES,
  SEVERITY_BY_OUTCOME,
  type JudgeOutcome,
  type JudgeRunResult,
  type JudgeSeverity,
  type JudgedFile,
} from './types';

const FILL: Record<JudgeSeverity, string> = {
  ok: 'FFC6EFCE', // green  — answer independently confirmed
  review: 'FFFFEB9C', // amber  — disagreement resolved in the key's favour
  defect: 'FFFFC7CE', // red    — confirmed content defect
  unknown: 'FFD9D9D9', // grey   — not checked
};

const FONT_COLOR: Record<JudgeSeverity, string> = {
  ok: 'FF006100',
  review: 'FF9C6500',
  defect: 'FF9C0006',
  unknown: 'FF404040',
};

const HEADER_FILL = 'FF1F3864';

const ROW_COLUMNS: Array<{ header: string; width: number }> = [
  { header: 'Row #', width: 7 },
  { header: 'CSV Line', width: 9 },
  { header: 'Verdict', width: 20 },
  { header: 'Stored', width: 8 },
  { header: 'Model', width: 8 },
  { header: 'Conf.', width: 8 },
  { header: 'What it means', width: 62 },
  { header: 'Model reasoning', width: 62 },
  { header: 'Adjudicator reasoning', width: 62 },
  { header: 'prompt_text', width: 50 },
  { header: 'options', width: 45 },
  { header: 'explanation', width: 50 },
  { header: 'Cached', width: 8 },
];

function severityOf(outcome: JudgeOutcome): JudgeSeverity {
  return SEVERITY_BY_OUTCOME[outcome];
}

function paintRow(row: ExcelJS.Row, severity: JudgeSeverity, columnCount: number): void {
  for (let c = 1; c <= columnCount; c += 1) {
    const cell = row.getCell(c);
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: FILL[severity] } };
    cell.font = { color: { argb: FONT_COLOR[severity] } };
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

/** Excel sheet names: <=31 chars, no `[]:*?/\`, unique. Mirrors Layer 1's scheme. */
export function sheetNameFor(file: JudgedFile, index: number, taken: Set<string>): string {
  const prefix = String(index + 1).padStart(2, '0');
  const label = file.bucket
    ? `${file.bucket.skill}-${file.bucket.sub_skill}-${file.bucket.level}`
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

function writeFileSheet(workbook: ExcelJS.Workbook, file: JudgedFile, sheetName: string): void {
  const sheet = workbook.addWorksheet(sheetName);

  const title = sheet.addRow([`File: ${file.fileName}`]);
  title.font = { bold: true, size: 13 };
  sheet.addRow([`Bucket: ${file.bucket ? bucketKey(file.bucket) : '(not determined)'}`]);

  if (file.skipReason) {
    const skipped = sheet.addRow(['NOT JUDGED']);
    skipped.font = { bold: true, size: 12, color: { argb: FONT_COLOR.unknown } };
    const why = sheet.addRow([file.skipReason]);
    why.alignment = { wrapText: true, vertical: 'top' };
    sheet.getColumn(1).width = 120;
    return;
  }

  const summary = JUDGE_OUTCOMES.filter(o => file.counts[o] > 0)
    .map(o => `${o} ${file.counts[o]}`)
    .join('   ');
  sheet.addRow([`${file.rows.length} rows judged — ${summary}`]);
  sheet.addRow([]);

  const headerRow = sheet.addRow(ROW_COLUMNS.map(c => c.header));
  styleTableHeader(headerRow, ROW_COLUMNS.length);

  sheet.views = [{ state: 'frozen', ySplit: headerRow.number }];
  sheet.autoFilter = {
    from: { row: headerRow.number, column: 1 },
    to: { row: headerRow.number, column: ROW_COLUMNS.length },
  };
  ROW_COLUMNS.forEach((c, i) => {
    sheet.getColumn(i + 1).width = c.width;
  });

  file.rows.forEach((jr, i) => {
    const j = jr.judgement;
    const row = sheet.addRow([
      i + 1,
      j.line,
      j.outcome,
      j.storedAnswer ?? '',
      j.blind?.answer ?? '',
      j.blind?.confidence ?? '',
      j.detail,
      j.blind?.reasoning ?? '',
      j.adjudication?.reasoning ?? '',
      jr.row.prompt_text,
      jr.row.options,
      jr.row.explanation,
      j.cached ? 'yes' : '',
    ]);
    paintRow(row, severityOf(j.outcome), ROW_COLUMNS.length);
  });
}

function writeSummarySheet(
  workbook: ExcelJS.Workbook,
  run: JudgeRunResult,
  sheetNames: string[],
): void {
  const sheet = workbook.addWorksheet('Summary');

  const title = sheet.addRow(['Layer 2 — Drill Question Content Judge']);
  title.font = { bold: true, size: 14 };
  sheet.addRow([`Model: ${run.model}   Prompt template: ${run.templateVersion}   Votes: ${run.votes}`]);
  sheet.addRow([`Files: ${run.files.length}   Fresh model calls: ${run.apiCalls}   From cache: ${run.cacheHits}`]);
  sheet.addRow([]);

  const legend = sheet.addRow(['Verdict', 'Meaning']);
  styleTableHeader(legend, 2);
  const meanings: Array<[JudgeOutcome, string]> = [
    ['AGREE', 'An independent solve picked the same answer as the key.'],
    ['UPHELD', 'The solve disagreed, but on review the key is right. Worth a glance.'],
    ['EXPLANATION_WRONG', 'The answer is right, but the explanation contradicts it.'],
    ['ANSWER_WRONG', 'The answer key is wrong.'],
    ['QUESTION_DEFECTIVE', 'The question is ambiguous, or has several / no correct answers.'],
    ['QUESTION_DEGENERATE', 'Not a real question — placeholder/template junk (e.g. literal "Option A" text).'],
    ['SKILL_MISMATCH', 'A real question, but its content doesn\'t test the skill/sub-skill it\'s labeled under.'],
    ['UNJUDGED', 'The model could not be reached. NOT checked — not a pass.'],
    ['SKIPPED', 'The row was too malformed to ask about. NOT checked — not a pass.'],
  ];
  for (const [outcome, meaning] of meanings) {
    const row = sheet.addRow([outcome, meaning]);
    paintRow(row, severityOf(outcome), 2);
  }
  sheet.addRow([]);

  const head = sheet.addRow([
    'Sheet',
    'File',
    'Bucket',
    'Rows',
    ...JUDGE_OUTCOMES,
  ]);
  styleTableHeader(head, 4 + JUDGE_OUTCOMES.length);

  const widths = [22, 58, 34, 7, 9, 19, 9, 14, 20, 11, 9];
  widths.forEach((w, i) => {
    sheet.getColumn(i + 1).width = w;
  });

  run.files.forEach((f, i) => {
    const worst: JudgeSeverity = f.skipReason
      ? 'unknown'
      : JUDGE_OUTCOMES.some(o => f.counts[o] > 0 && severityOf(o) === 'defect')
        ? 'defect'
        : JUDGE_OUTCOMES.some(o => f.counts[o] > 0 && severityOf(o) === 'unknown')
          ? 'unknown'
          : JUDGE_OUTCOMES.some(o => f.counts[o] > 0 && severityOf(o) === 'review')
            ? 'review'
            : 'ok';

    const row = sheet.addRow([
      sheetNames[i],
      f.fileName,
      f.bucket ? bucketKey(f.bucket) : '(not determined)',
      f.rows.length,
      ...JUDGE_OUTCOMES.map(o => f.counts[o]),
    ]);
    paintRow(row, worst, 4 + JUDGE_OUTCOMES.length);
  });
}

export async function writeJudgeReport(run: JudgeRunResult, outPath: string): Promise<string> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Layer 2 Drill Question Content Judge';
  workbook.created = new Date();

  const taken = new Set<string>(['summary']);
  const sheetNames = run.files.map((f, i) => sheetNameFor(f, i, taken));

  writeSummarySheet(workbook, run, sheetNames);
  run.files.forEach((f, i) => writeFileSheet(workbook, f, sheetNames[i]));

  await workbook.xlsx.writeFile(outPath);
  return outPath;
}

/** `layer2-judge-20260801-143005.xlsx` — sortable and unique per run. */
export function defaultReportName(now: Date = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0');
  const stamp =
    `${now.getFullYear()}${p(now.getMonth() + 1)}${p(now.getDate())}` +
    `-${p(now.getHours())}${p(now.getMinutes())}${p(now.getSeconds())}`;
  return `layer2-judge-${stamp}.xlsx`;
}
