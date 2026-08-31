/**
 * Types for Layer 2 — the diagnostic Content Judge.
 *
 * Two genuinely different judging modes live here, because diagnostic
 * questions aren't all one shape the way drills are:
 *  - MCQ/TFNG rows have a real stored answer to check, so they get the same
 *    blind-solve -> compare -> adjudicate-on-disagreement pipeline as drills.
 *  - WRITING_PROMPT/SPEAKING_PROMPT rows have no "correct answer" at all —
 *    there's nothing to blind-solve, so they get a direct quality judgement
 *    instead (clear? unambiguous? genuinely hard?).
 *  - LISTENING rows get one extra check besides the MCQ pipeline: the actual
 *    audio file is transcribed and diffed against the author's submitted
 *    transcript, since that's the one failure mode text-only checking can't
 *    catch (see PROMPT_VS_AUDIO_MISMATCH).
 */

import type { DiagnosticCsvRow, OptionKey } from '../shared/types';

export type AnswerJudgeOutcome =
  | 'AGREE'
  | 'UPHELD'
  | 'ANSWER_WRONG'
  | 'QUESTION_DEFECTIVE'
  | 'QUESTION_DEGENERATE'
  | 'TOO_EASY'
  | 'UNJUDGED'
  | 'SKIPPED';

export const ANSWER_JUDGE_OUTCOMES: readonly AnswerJudgeOutcome[] = [
  'AGREE',
  'UPHELD',
  'ANSWER_WRONG',
  'QUESTION_DEFECTIVE',
  'QUESTION_DEGENERATE',
  'TOO_EASY',
  'UNJUDGED',
  'SKIPPED',
];

export type PromptJudgeOutcome = 'GOOD' | 'TOO_EASY' | 'AMBIGUOUS' | 'DEGENERATE' | 'UNJUDGED' | 'SKIPPED';

export const PROMPT_JUDGE_OUTCOMES: readonly PromptJudgeOutcome[] = [
  'GOOD',
  'TOO_EASY',
  'AMBIGUOUS',
  'DEGENERATE',
  'UNJUDGED',
  'SKIPPED',
];

export type JudgeSeverity = 'ok' | 'review' | 'defect' | 'unknown';

export const SEVERITY_BY_ANSWER_OUTCOME: Record<AnswerJudgeOutcome, JudgeSeverity> = {
  AGREE: 'ok',
  UPHELD: 'review',
  ANSWER_WRONG: 'defect',
  QUESTION_DEFECTIVE: 'defect',
  QUESTION_DEGENERATE: 'defect',
  TOO_EASY: 'defect',
  UNJUDGED: 'unknown',
  SKIPPED: 'unknown',
};

export const SEVERITY_BY_PROMPT_OUTCOME: Record<PromptJudgeOutcome, JudgeSeverity> = {
  GOOD: 'ok',
  TOO_EASY: 'defect',
  AMBIGUOUS: 'defect',
  DEGENERATE: 'defect',
  UNJUDGED: 'unknown',
  SKIPPED: 'unknown',
};

export type Confidence = 'high' | 'medium' | 'low';

/** One independent attempt at an MCQ/TFNG question, made without seeing the stored answer. */
export interface BlindSolve {
  answer: string; // OptionKey for MCQ, TfngAnswer for TFNG
  confidence: Confidence;
  reasoning: string;
  isDegenerate?: boolean;
  degenerateReason?: string;
  /** The question is real and answerable, but too easy to usefully discriminate students. */
  isTooEasy?: boolean;
  tooEasyReason?: string;
}

export type AdjudicationVerdict = 'STORED_CORRECT' | 'BLIND_CORRECT' | 'BOTH_WRONG' | 'AMBIGUOUS' | 'NO_CORRECT_ANSWER';

export interface Adjudication {
  verdict: AdjudicationVerdict;
  correctAnswer: string | null;
  reasoning: string;
}

export interface AnswerRowJudgement {
  line: number;
  storedAnswer: string | null;
  blind: BlindSolve | null;
  adjudication: Adjudication | null;
  outcome: AnswerJudgeOutcome;
  detail: string;
  cached: boolean;
}

export interface PromptRowJudgement {
  line: number;
  outcome: PromptJudgeOutcome;
  detail: string;
  cached: boolean;
}

/** Set once per LISTENING set — not per row, since transcript/audio are shared across the set. */
export interface AudioCrossCheck {
  setId: string;
  autoTranscript: string | null;
  matchesSubmittedTranscript: boolean | null; // null = could not be checked (e.g. transcription failed)
  detail: string;
}

export interface QuestionView {
  promptText: string;
  options: Record<OptionKey, string> | null; // null for TFNG (no options)
  passageOrTranscript: string | null; // passage_text (Reading) or transcript (Listening); null for Writing/Speaking prompt bank rows (they ARE the content)
}

export function emptyAnswerCounts(): Record<AnswerJudgeOutcome, number> {
  return { AGREE: 0, UPHELD: 0, ANSWER_WRONG: 0, QUESTION_DEFECTIVE: 0, QUESTION_DEGENERATE: 0, TOO_EASY: 0, UNJUDGED: 0, SKIPPED: 0 };
}

export function emptyPromptCounts(): Record<PromptJudgeOutcome, number> {
  return { GOOD: 0, TOO_EASY: 0, AMBIGUOUS: 0, DEGENERATE: 0, UNJUDGED: 0, SKIPPED: 0 };
}

// ---------------------------------------------------------------------------
// File / run aggregates
// ---------------------------------------------------------------------------

export interface JudgedAnswerRow {
  row: DiagnosticCsvRow;
  judgement: AnswerRowJudgement;
}

export interface JudgedPromptRow {
  row: DiagnosticCsvRow;
  judgement: PromptRowJudgement;
}

export interface JudgedFile {
  filePath: string;
  fileName: string;
  answerRows: JudgedAnswerRow[];
  promptRows: JudgedPromptRow[];
  audioCrossChecks: AudioCrossCheck[];
  skipReason: string | null;
  answerCounts: Record<AnswerJudgeOutcome, number>;
  promptCounts: Record<PromptJudgeOutcome, number>;
}

export interface JudgeRunResult {
  files: JudgedFile[];
  model: string;
  templateVersion: string;
  apiCalls: number;
  cacheHits: number;
}
