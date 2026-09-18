/**
 * Types for Layer 2 — the IA Content Judge.
 *
 * Ported from diagnostic's layer2 types.ts: IAQuestion's row shape spans
 * MCQ/TFNG/WRITING_PROMPT/SPEAKING_PROMPT just like DiagnosticQuestion does,
 * so the same two judging modes apply — blind-solve+adjudicate for rows with
 * a real stored answer, direct quality judgement for prompt rows that have
 * none. Severity/outcome vocabulary matches diagnostic's, not drills': IA
 * questions are meant to be genuinely discriminating, so TOO_EASY is a real
 * outcome here too.
 *
 * One schema difference from diagnostic worth flagging: IAQuestion has no
 * author-submitted `transcript` column, only `audio_url` (the hosted final
 * URL). So the Listening audio cross-check here transcribes the audio and
 * records it for manual reference, but cannot diff it against a submitted
 * script the way diagnostic's can — see judge.ts's crossCheckListeningAudio.
 */

import type { IACsvRow, OptionKey } from '../shared/types';

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

export const PROMPT_JUDGE_OUTCOMES: readonly PromptJudgeOutcome[] = ['GOOD', 'TOO_EASY', 'AMBIGUOUS', 'DEGENERATE', 'UNJUDGED', 'SKIPPED'];

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

export interface BlindSolve {
  answer: string; // OptionKey for MCQ, T/F/NG for TFNG
  confidence: Confidence;
  reasoning: string;
  isDegenerate?: boolean;
  degenerateReason?: string;
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

/** Set once per LISTENING passage_id group, not per row. */
export interface AudioCrossCheck {
  passageId: string;
  autoTranscript: string | null;
  matchesSubmittedTranscript: boolean | null; // always null here — see file header note
  detail: string;
}

export interface QuestionView {
  promptText: string;
  options: Record<OptionKey, string> | null; // null for TFNG
  passageOrAudioContext: string | null; // passage_text (Reading); null otherwise
}

export function emptyAnswerCounts(): Record<AnswerJudgeOutcome, number> {
  return { AGREE: 0, UPHELD: 0, ANSWER_WRONG: 0, QUESTION_DEFECTIVE: 0, QUESTION_DEGENERATE: 0, TOO_EASY: 0, UNJUDGED: 0, SKIPPED: 0 };
}

export function emptyPromptCounts(): Record<PromptJudgeOutcome, number> {
  return { GOOD: 0, TOO_EASY: 0, AMBIGUOUS: 0, DEGENERATE: 0, UNJUDGED: 0, SKIPPED: 0 };
}

export interface JudgedAnswerRow {
  row: IACsvRow;
  judgement: AnswerRowJudgement;
}

export interface JudgedPromptRow {
  row: IACsvRow;
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
