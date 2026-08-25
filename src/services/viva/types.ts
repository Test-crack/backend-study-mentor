// Generic viva grading pipeline — types + stage interfaces (Spoken English Phase 1).
// One pipeline, reused across exams via a per-exam VivaRubric. See
// docs/exam-agnostic/VIVA-GRADING-PIPELINE.md.

/** CEFR levels the grader may output. Half-steps only where the rubric defines them. */
export type CefrLevel =
  | 'below_a1' | 'a1' | 'a2' | 'a2+' | 'b1' | 'b1+' | 'b2' | 'b2+' | 'c1' | 'c2';

/** Ascending order — used for capping (guardrails). */
export const LEVEL_ORDER: CefrLevel[] = [
  'below_a1', 'a1', 'a2', 'a2+', 'b1', 'b1+', 'b2', 'b2+', 'c1', 'c2',
];

export interface SubskillRubric {
  id: string;                                   // internal id — matches the exam config's component subskill id
  label: string;                                // student-facing label (e.g. 'Responsiveness' for `interaction`)
  descriptors: Partial<Record<CefrLevel, string>>; // level → descriptor text, fed to the competence grader
}

/** Per-response guardrails (applied before/around scoring). */
export interface VivaGuardrails {
  minWords: number;                 // below this → no usable response (retry, then exclude)
  shortWords: number;               // below this on a main prompt → cap every subskill
  shortCap: CefrLevel;              // the cap level for short responses
  offTopicCap: CefrLevel;           // cap level for off-topic responses
  offTopicCappedSubskills: string[];// which subskills get capped when off-topic
  withholdNoResponseCount: number;  // ≥ this many no-response prompts → withhold the whole result
}

export interface VivaRubric {
  examId: string;
  scaleId: string;                              // e.g. 'cefr_6'
  subskills: SubskillRubric[];
  levelToScore: Record<CefrLevel, number>;      // CEFR level → 0–100 score fed to the aggregation strategy
  guardrails: VivaGuardrails;
}

/** One prompt's outcome: the grader's per-subskill levels + any flags + length. */
/** Short AI-generated feedback for a spoken answer. */
export interface VivaFeedback {
  strengths: string;      // what the speaker did well (1–2 sentences, specific to what they said)
  improvements: string;   // the most useful next step to move up a level
}

export interface GradedResponse {
  promptId: string;
  isWarmup?: boolean;
  wordCount: number;
  flags?: { noResponse?: boolean; offTopic?: boolean; inaudible?: boolean; nonEnglish?: boolean };
  levels?: Partial<Record<string, CefrLevel>>;  // subskillId → level (absent/empty when no usable response)
  feedback?: VivaFeedback;
}

export interface VivaResult {
  status: 'scored' | 'withheld';
  withholdReason?: string;
  cefrLevel?: string;                           // overall reported level (e.g. 'b1')
  cefrLabel?: string;                           // e.g. 'B1'
  meanScore?: number;                           // mean of the 6 subskill scores
  subskillProfile?: { id: string; label: string; level: string; score: number }[];
  feedback?: Array<{ promptId: string } & VivaFeedback>;  // per-prompt AI feedback
  scoredPromptCount?: number;
  noResponseCount?: number;
}

// ── Stage interfaces (each swappable per docs) ───────────────────────────────
export interface Transcriber {
  transcribe(audioPath: string, mimeType: string): Promise<{
    transcript: string;
    words: Array<{ word: string; startMs: number; endMs: number; confidence?: number }>;
  }>;
}

export interface DeliveryMetrics {
  wordCount: number;
  wpm: number;          // words per minute of speaking time
  pauseRatio: number;   // fraction of total time that is silence between words
  meanPauseMs: number;
}

export interface CompetenceGrader {
  // audio (+ rubric) → CEFR level per subskill, plus the transcript, meaningful word count,
  // content flags, and a short rationale. In v1 Gemini transcribes AND grades in one call.
  grade(input: {
    audioPath: string; mimeType: string;
    promptText: string; rubric: VivaRubric; delivery?: DeliveryMetrics;
  }): Promise<{
    levels: Record<string, CefrLevel>;
    transcript: string;
    wordCount: number;
    flags?: GradedResponse['flags'];
    feedback?: VivaFeedback;
    rationale?: string;
  }>;
}
