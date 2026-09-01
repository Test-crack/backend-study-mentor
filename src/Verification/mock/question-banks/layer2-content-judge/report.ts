/**
 * Layer 2's colored Excel report for Mock. Same shape as diagnostic's — one
 * Summary sheet plus one sheet per file, with a Listening audio block per
 * audio_url group.
 */

import ExcelJS from 'exceljs';
import {
  ANSWER_JUDGE_OUTCOMES,
  PROMPT_JUDGE_OUTCOMES,
  SEVERITY_BY_ANSWER_OUTCOME,
  SEVERITY_BY_PROMPT_OUTCOME,
  type AnswerJudgeOutcome,
  type JudgeRunResult,
  type JudgeSeverity,
  type JudgedFile,
  type PromptJudgeOutcome,
} from './types';

const FILL: Record<JudgeSeverity, string> = { ok: 'FFC6EFCE', review: 'FFFFEB9C', defect: 'FFFFC7CE', unknown: 'FFD9D9D9' };
const FONT_COLOR: Record<JudgeSeverity, string> = { ok: 'FF006100', review: 'FF9C6500', defect: 'FF9C0006', unknown: 'FF404040' };
const HEADER_FILL = 'FF1F3864';

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

function sheetNameFor(file: JudgedFile, index: number, taken: Set<string>): string {
  const prefix = String(index + 1).padStart(2, '0');
  const label = file.fileName.replace(/\.[A-Za-z0-9]+$/, '');
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

  if (file.skipReason) {
    const skipped = sheet.addRow(['NOT JUDGED']);
    skipped.font = { bold: true, size: 12, color: { argb: FONT_COLOR.unknown } };
    sheet.addRow([file.skipReason]).alignment = { wrapText: true, vertical: 'top' };
    sheet.getColumn(1).width = 120;
    return;
  }

  if (file.audioCrossChecks.length > 0) {
    const heading = sheet.addRow(['Listening audio (per audio_url group)']);
    heading.font = { bold: true, size: 12 };
    const head = sheet.addRow(['audio_url', 'Detail']);
    styleTableHeader(head, 2);
    for (const check of file.audioCrossChecks) {
      const row = sheet.addRow([check.passageId, check.detail]);
      paintRow(row, 'unknown', 2);
    }
    sheet.addRow([]);
    sheet.getColumn(2).width = 100;
  }

  if (file.answerRows.length > 0) {
    const heading = sheet.addRow(['MCQ / TFNG rows']);
    heading.font = { bold: true, size: 12 };
    const summary = ANSWER_JUDGE_OUTCOMES.filter(o => file.answerCounts[o] > 0)
      .map(o => `${o} ${file.answerCounts[o]}`)
      .join('   ');
    sheet.addRow([`${file.answerRows.length} rows judged — ${summary}`]);

    const cols = [
      { header: 'Row #', width: 7 },
      { header: 'CSV Line', width: 9 },
      { header: 'Verdict', width: 20 },
      { header: 'Stored', width: 8 },
      { header: 'Model', width: 8 },
      { header: 'Conf.', width: 8 },
      { header: 'What it means', width: 62 },
      { header: 'Model reasoning', width: 62 },
      { header: 'prompt_text', width: 50 },
      { header: 'Cached', width: 8 },
    ];
    const headerRow = sheet.addRow(cols.map(c => c.header));
    styleTableHeader(headerRow, cols.length);
    cols.forEach((c, i) => {
      sheet.getColumn(i + 1).width = c.width;
    });

    file.answerRows.forEach((jr, i) => {
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
        jr.row.prompt_text,
        j.cached ? 'yes' : '',
      ]);
      paintRow(row, SEVERITY_BY_ANSWER_OUTCOME[j.outcome as AnswerJudgeOutcome], cols.length);
    });
    sheet.addRow([]);
  }

  if (file.promptRows.length > 0) {
    const heading = sheet.addRow(['Writing / Speaking prompt rows']);
    heading.font = { bold: true, size: 12 };
    const summary = PROMPT_JUDGE_OUTCOMES.filter(o => file.promptCounts[o] > 0)
      .map(o => `${o} ${file.promptCounts[o]}`)
      .join('   ');
    sheet.addRow([`${file.promptRows.length} rows judged — ${summary}`]);

    const cols = [
      { header: 'Row #', width: 7 },
      { header: 'CSV Line', width: 9 },
      { header: 'Verdict', width: 14 },
      { header: 'Detail', width: 90 },
      { header: 'prompt_text', width: 60 },
    ];
    const headerRow = sheet.addRow(cols.map(c => c.header));
    styleTableHeader(headerRow, cols.length);
    cols.forEach((c, i) => {
      sheet.getColumn(i + 1).width = c.width;
    });

    file.promptRows.forEach((jr, i) => {
      const j = jr.judgement;
      const row = sheet.addRow([i + 1, j.line, j.outcome, j.detail, jr.row.prompt_text]);
      paintRow(row, SEVERITY_BY_PROMPT_OUTCOME[j.outcome as PromptJudgeOutcome], cols.length);
    });
  }
}

function writeSummarySheet(workbook: ExcelJS.Workbook, run: JudgeRunResult, sheetNames: string[]): void {
  const sheet = workbook.addWorksheet('Summary');

  const title = sheet.addRow(['Layer 2 — Mock Question Content Judge']);
  title.font = { bold: true, size: 14 };
  sheet.addRow([`Model: ${run.model}   Prompt template: ${run.templateVersion}`]);
  sheet.addRow([`Files: ${run.files.length}   Fresh model calls: ${run.apiCalls}   From cache: ${run.cacheHits}`]);
  sheet.addRow([]);

  const legend = sheet.addRow(['Verdict', 'Meaning']);
  styleTableHeader(legend, 2);
  const meanings: Array<[string, string]> = [
    ['AGREE', 'An independent solve picked the same answer as the key.'],
    ['UPHELD', 'The solve disagreed, but on review the key is right. Worth a glance.'],
    ['ANSWER_WRONG', 'The answer key is wrong.'],
    ['QUESTION_DEFECTIVE', 'The question is ambiguous, or has several / no correct answers.'],
    ['QUESTION_DEGENERATE', 'Not a real question — placeholder/template junk.'],
    ['TOO_EASY', "Doesn't discriminate students — the assessment needs harder content here."],
    ['UNJUDGED', 'The model could not be reached. NOT checked — not a pass.'],
    ['SKIPPED', 'The row was too malformed to ask about. NOT checked — not a pass.'],
    ['GOOD (prompts)', 'A Writing/Speaking prompt that is clear and genuinely hard.'],
    ['AMBIGUOUS (prompts)', 'Unclear what the student is being asked to do.'],
    ['DEGENERATE (prompts)', 'Not a genuine prompt — placeholder/template junk.'],
  ];
  for (const [outcome, meaning] of meanings) sheet.addRow([outcome, meaning]);
  sheet.addRow([]);

  const head = sheet.addRow(['Sheet', 'File', 'MCQ/TFNG rows', 'Prompt rows', 'Listening groups']);
  styleTableHeader(head, 5);
  [22, 58, 15, 13, 17].forEach((w, i) => {
    sheet.getColumn(i + 1).width = w;
  });

  run.files.forEach((f, i) => {
    const worst: JudgeSeverity = f.skipReason
      ? 'unknown'
      : ANSWER_JUDGE_OUTCOMES.some(o => f.answerCounts[o] > 0 && SEVERITY_BY_ANSWER_OUTCOME[o] === 'defect') ||
          PROMPT_JUDGE_OUTCOMES.some(o => f.promptCounts[o] > 0 && SEVERITY_BY_PROMPT_OUTCOME[o] === 'defect')
        ? 'defect'
        : 'ok';

    const row = sheet.addRow([sheetNames[i], f.fileName, f.answerRows.length, f.promptRows.length, f.audioCrossChecks.length]);
    paintRow(row, worst, 5);
  });
}

export async function writeJudgeReport(run: JudgeRunResult, outPath: string): Promise<string> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Layer 2 IA Question Content Judge';
  workbook.created = new Date();

  const taken = new Set<string>(['summary']);
  const sheetNames = run.files.map((f, i) => sheetNameFor(f, i, taken));

  writeSummarySheet(workbook, run, sheetNames);
  run.files.forEach((f, i) => writeFileSheet(workbook, f, sheetNames[i]));

  await workbook.xlsx.writeFile(outPath);
  return outPath;
}
