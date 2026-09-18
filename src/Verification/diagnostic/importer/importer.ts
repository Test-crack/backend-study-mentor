/**
 * Pure planning core of the diagnostic importer.
 *
 * Split out of cli.ts's main() so a web panel (or any other caller) can run
 * the exact same row-count/sequence-match validation and before/after diff
 * without doing I/O or calling process.exit — same reasoning as drills'
 * Import/importer.ts split (see that file's own header comment). cli.ts is
 * now a thin wrapper: same flags, same console output, same exit codes,
 * just calling this instead of doing the work inline.
 *
 * Deliberately NOT reworded for a web audience — messages that mention
 * "--source-set-id" are unchanged from the original CLI text so cli.ts's
 * output stays byte-identical after the extraction. A caller presenting
 * these to a non-CLI user (the web panel) should add its own explanation
 * alongside, not rely on this message alone.
 */

import type { DiagnosticCsvRow } from '../question-banks/shared/types';

export class ImportPlanError extends Error {}

export interface ExistingDiagnosticRow {
  id: string;
  set_id: string;
  sequence: number;
  skill: string;
  level: string;
  question_type: string;
  prompt_text: string;
  options: unknown;
  correct_answer: string | null;
  min_words: number | null;
  passage_text: string | null;
  audio_url: string | null;
  created_at: Date;
}

export interface DiagnosticRowUpdate {
  id: string;
  sequence: number;
  before: {
    question_type: string;
    prompt_text: string;
    correct_answer: string | null;
  };
  after: {
    question_type: string;
    prompt_text: string;
    // JSON.parse's return type — kept as `any` (not `unknown`) so this
    // structurally satisfies Prisma's generated update-input type at the
    // call site, same as the original inline object literal did.
    options: any;
    correct_answer: string | null;
    min_words: number | null;
    passage_text: string | null;
    audio_url: string | null;
    created_at: Date;
  };
}

export interface BuildUpdatePlanOptions {
  /** The existing set_id being updated — used only in error messages. */
  setId: string;
  sourceSetId?: string;
  audioUrlPrefix: string;
  /** One shared timestamp for every row in this plan (see cli.ts's comment on why). */
  importedAt: Date;
  /** How to refer to the staging file in error messages ("./batch.csv", or an uploaded filename). */
  fileLabel: string;
}

/**
 * Phase 1 — everything cli.ts's main() originally checked BEFORE printing
 * its banner: pick this batch's rows (optionally filtered to one set_id out
 * of a multi-set staging file), sort by sequence, and confirm the row count
 * matches `existing` 1:1. Throws ImportPlanError (exact original message
 * text) on any mismatch. Split from `diffRows` (phase 2) specifically so a
 * caller that prints a banner between validation and diffing — as cli.ts
 * does — can reproduce that exact console-output ordering; a caller that
 * doesn't care can just use `buildUpdatePlan` below.
 */
export function validateBatch(
  loadedRows: DiagnosticCsvRow[],
  existing: ExistingDiagnosticRow[],
  opts: Pick<BuildUpdatePlanOptions, 'setId' | 'sourceSetId' | 'fileLabel'>,
): DiagnosticCsvRow[] {
  const sourceRows = opts.sourceSetId
    ? loadedRows.filter(r => r.set_id.trim() === opts.sourceSetId)
    : loadedRows;

  if (opts.sourceSetId && sourceRows.length === 0) {
    const found = [...new Set(loadedRows.map(r => r.set_id.trim()))];
    throw new ImportPlanError(
      `No rows found with set_id "${opts.sourceSetId}" in ${opts.fileLabel}. Sets actually in this file: ${found.join(', ')}.`,
    );
  }

  const stagedRows = [...sourceRows].sort((a, b) => Number(a.sequence) - Number(b.sequence));

  if (existing.length === 0) {
    throw new ImportPlanError(
      `No existing rows found for set_id "${opts.setId}". This tool only updates existing sets — ` +
        `it never creates a new set_id. Check the spelling, or use a real existing set_id.`,
    );
  }

  if (existing.length !== stagedRows.length) {
    const hint = opts.sourceSetId
      ? ''
      : ` If ${opts.fileLabel} bundles more than one set, pass --source-set-id to pick just one out.`;
    throw new ImportPlanError(
      `Row count mismatch: staging CSV has ${stagedRows.length} row(s), but existing set "${opts.setId}" ` +
        `has ${existing.length}. They must match 1:1 by sequence — a set can't grow or shrink through this tool.${hint}`,
    );
  }

  return stagedRows;
}

/**
 * Phase 2 — the per-row before/after diff cli.ts originally built AFTER
 * printing its banner. `stagedRows` must already be validated and sorted
 * (i.e. the return value of `validateBatch`) and the same length as
 * `existing`. Throws ImportPlanError (exact original message text) on a
 * sequence mismatch.
 */
export function diffRows(
  existing: ExistingDiagnosticRow[],
  stagedRows: DiagnosticCsvRow[],
  opts: Pick<BuildUpdatePlanOptions, 'audioUrlPrefix' | 'importedAt'>,
): DiagnosticRowUpdate[] {
  return existing.map((dbRow, i) => {
    const staged = stagedRows[i];

    if (Number(staged.sequence) !== dbRow.sequence) {
      throw new ImportPlanError(
        `Sequence mismatch at position ${i}: staged row says sequence ${staged.sequence}, ` +
          `existing DB row at that position is sequence ${dbRow.sequence}. Fix the CSV's ordering.`,
      );
    }

    const questionType = staged.question_type.trim().toUpperCase();
    const options = staged.options.trim() ? JSON.parse(staged.options) : null;
    const audioUrl = staged.audio_file.trim() ? `${opts.audioUrlPrefix}${staged.audio_file.trim()}` : null;

    return {
      id: dbRow.id,
      sequence: dbRow.sequence,
      before: {
        question_type: dbRow.question_type,
        prompt_text: dbRow.prompt_text,
        correct_answer: dbRow.correct_answer,
      },
      after: {
        question_type: questionType,
        prompt_text: staged.prompt_text,
        options,
        correct_answer: staged.correct_answer.trim() || null,
        min_words: staged.min_words.trim() ? Number(staged.min_words) : null,
        passage_text: staged.passage_text.trim() || null,
        audio_url: audioUrl,
        created_at: opts.importedAt,
      },
    };
  });
}

/**
 * Convenience wrapper for callers that don't need the banner sandwiched
 * between validation and diffing (e.g. a web endpoint) — runs both phases
 * back to back.
 */
export function buildUpdatePlan(
  loadedRows: DiagnosticCsvRow[],
  existing: ExistingDiagnosticRow[],
  opts: BuildUpdatePlanOptions,
): DiagnosticRowUpdate[] {
  const stagedRows = validateBatch(loadedRows, existing, opts);
  return diffRows(existing, stagedRows, opts);
}
