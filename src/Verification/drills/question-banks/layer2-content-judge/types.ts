/**
 * Types for Layer 2 — the Content Judge.
 *
 * Layer 1 asks "is this file shaped correctly?". Layer 2 asks the only question
 * that matters afterwards: "is the stored answer actually the right one?"
 */

import type { BucketTriple, DrillCsvRow, OptionKey } from '../shared/types';

/**
 * What we concluded about one question.
 *
 * `UNJUDGED` and `SKIPPED` exist as first-class outcomes on purpose. The easiest
 * way for a tool like this to lie is to let a failed API call or an unreadable
 * row quietly fall through into the "no problems found" bucket.
 */
export type JudgeOutcome =
  /** The blind solve independently picked the stored answer. */
  | 'AGREE'
  /** Answer independently confirmed, but the explanation contradicts it. */
  | 'EXPLANATION_WRONG'
  /** Blind solve disagreed, but on review the stored answer holds up. */
  | 'UPHELD'
  /** On review, the stored answer is wrong. */
  | 'ANSWER_WRONG'
  /** The question itself is broken: ambiguous, several right, or none right. */
  | 'QUESTION_DEFECTIVE'
  /**
   * The row isn't a real question at all — placeholder/template junk (e.g.
   * options literally reading "Option A"/"Option B", or a prompt that just
   * references its own row number). Distinct from QUESTION_DEFECTIVE: a
   * defective question is a genuine attempt with a content flaw; this is not
   * a genuine attempt at all. Flagged directly during the blind solve, since
   * comparing letters against the stored answer is meaningless when there's
   * no real question to answer.
   */
  | 'QUESTION_DEGENERATE'
  /**
   * The question is real and answerable, but its content doesn't actually test
   * the skill/sub_skill it's labeled under (e.g. a row filed under VOCABULARY
   * that's really testing verb tense). Distinct from Layer 1's
   * BUCKET_FILENAME_MISMATCH, which only catches a filename/column label
   * disagreement — this catches the label and content agreeing with each
   * other but neither matching what the question actually tests.
   */
  | 'SKILL_MISMATCH'
  /** The model could not be reached or would not answer usably. Not a pass. */
  | 'UNJUDGED'
  /** The row was too malformed to ask about. Not a pass. */
  | 'SKIPPED';

export const JUDGE_OUTCOMES: readonly JudgeOutcome[] = [
  'AGREE',
  'EXPLANATION_WRONG',
  'UPHELD',
  'ANSWER_WRONG',
  'QUESTION_DEFECTIVE',
  'QUESTION_DEGENERATE',
  'SKILL_MISMATCH',
  'UNJUDGED',
  'SKIPPED',
];

/** How an outcome is coloured and whether it blocks an import. */
export type JudgeSeverity = 'ok' | 'review' | 'defect' | 'unknown';

export const SEVERITY_BY_OUTCOME: Record<JudgeOutcome, JudgeSeverity> = {
  AGREE: 'ok',
  EXPLANATION_WRONG: 'defect',
  UPHELD: 'review',
  ANSWER_WRONG: 'defect',
  QUESTION_DEFECTIVE: 'defect',
  QUESTION_DEGENERATE: 'defect',
  SKILL_MISMATCH: 'defect',
  UNJUDGED: 'unknown',
  SKIPPED: 'unknown',
};

export type Confidence = 'high' | 'medium' | 'low';

/** One independent attempt at the question, made without seeing the stored answer. */
export interface BlindSolve {
  answer: OptionKey;
  confidence: Confidence;
  reasoning: string;
  /**
   * True when the model judged this row to be placeholder/template junk rather
   * than a real question (e.g. options literally "Option A"/"Option B", or a
   * prompt referencing its own row number) — not a genuine attempt at all.
   * Optional so existing call sites/fixtures that predate this field still
   * type-check; absent is treated the same as false.
   */
  isDegenerate?: boolean;
  /** Why it was flagged degenerate, when isDegenerate is true. */
  degenerateReason?: string;
  /**
   * False when the model judges this question's actual content doesn't test
   * the skill/sub_skill it's labeled under. Optional for the same reason as
   * isDegenerate — absent is treated as true (no mismatch) at call sites.
   */
  testsIntendedSkill?: boolean;
  /** Why it was flagged as a skill mismatch, when testsIntendedSkill is false. */
  skillMismatchReason?: string;
}

export type AdjudicationVerdict =
  | 'STORED_CORRECT'
  | 'BLIND_CORRECT'
  | 'BOTH_WRONG'
  | 'AMBIGUOUS'
  | 'NO_CORRECT_ANSWER';

/** The referee pass, run only where the blind solve and the stored answer differ. */
export interface Adjudication {
  verdict: AdjudicationVerdict;
  /** The letter the adjudicator believes is right, when it believes one is. */
  correctLetter: OptionKey | null;
  /** Whether the stored explanation supports whatever the right answer is. */
  explanationOk: boolean;
  reasoning: string;
}

export interface RowJudgement {
  line: number;
  storedAnswer: OptionKey | null;
  blind: BlindSolve | null;
  /** Every blind attempt, when --votes > 1. Length 1 in the default case. */
  votes: BlindSolve[];
  adjudication: Adjudication | null;
  outcome: JudgeOutcome;
  /** One-line human-readable summary of why this outcome was reached. */
  detail: string;
  /** True when this judgement came from cache rather than a fresh call. */
  cached: boolean;
}

export interface JudgedRow {
  row: DrillCsvRow;
  judgement: RowJudgement;
}

export interface JudgedFile {
  filePath: string;
  fileName: string;
  bucket: BucketTriple | null;
  rows: JudgedRow[];
  /** Set when the whole file was skipped; nothing in `rows` if so. */
  skipReason: string | null;
  counts: Record<JudgeOutcome, number>;
}

export interface JudgeRunResult {
  files: JudgedFile[];
  model: string;
  templateVersion: string;
  votes: number;
  /** Fresh model calls made, and judgements served from cache. */
  apiCalls: number;
  cacheHits: number;
}

export function emptyCounts(): Record<JudgeOutcome, number> {
  return {
    AGREE: 0,
    EXPLANATION_WRONG: 0,
    UPHELD: 0,
    ANSWER_WRONG: 0,
    QUESTION_DEFECTIVE: 0,
    QUESTION_DEGENERATE: 0,
    SKILL_MISMATCH: 0,
    UNJUDGED: 0,
    SKIPPED: 0,
  };
}

export function tallyOutcomes(rows: JudgedRow[]): Record<JudgeOutcome, number> {
  const counts = emptyCounts();
  for (const r of rows) counts[r.judgement.outcome] += 1;
  return counts;
}

/** A question in the shape the prompts need: text plus its four options. */
export interface QuestionView {
  promptText: string;
  options: Record<OptionKey, string>;
}
