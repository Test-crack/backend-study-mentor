/**
 * Core types for the Mock question-bank verification layers.
 *
 * MockQuestion is structurally like IAQuestion (same four question_type
 * values, same passage/audio/explanation columns) but with no `difficulty`
 * column at all, and `sub_skill` drawn from one shared pool used identically
 * across every skill (confirmed against real mock_questions rows — unlike
 * IA, where LISTENING/READING use themselves as their own sub_skill).
 * `task_type` (Task1/Task2/Part1/Part2/Part3) replaces difficulty as the
 * bucket-adjacent dimension, but it lives inside `source_key`, not the
 * uniformity bucket — see sourceKey.ts.
 *
 * Nothing here imports `@prisma/client` — this tree must typecheck with no
 * generated client present, same rule as every other fork.
 */

export const SKILLS = ['LISTENING', 'READING', 'WRITING', 'SPEAKING'] as const;
export type Skill = (typeof SKILLS)[number];

/** Same pool for every skill — confirmed against real data, unlike IA's per-skill map. */
export const SUB_SKILLS = ['GRAMMAR', 'VOCABULARY', 'COHERENCE', 'TASK_RESPONSE', 'FLUENCY', 'PRONUNCIATION'] as const;
export type SubSkill = (typeof SUB_SKILLS)[number];

export const EXAM_TYPES = ['IELTS', 'SPOKEN', 'OET', 'GRE', 'TOEFL', 'PTE'] as const;
export type ExamType = (typeof EXAM_TYPES)[number];

export const QUESTION_TYPES = ['MCQ', 'TFNG', 'WRITING_PROMPT', 'SPEAKING_PROMPT'] as const;
export type QuestionType = (typeof QUESTION_TYPES)[number];

/** Every skill has a knowledge-check MCQ plus its native task type — confirmed against real buckets. */
export const VALID_QUESTION_TYPES_BY_SKILL: Record<Skill, readonly QuestionType[]> = {
  LISTENING: ['MCQ'],
  READING: ['MCQ', 'TFNG'],
  WRITING: ['MCQ', 'WRITING_PROMPT'],
  SPEAKING: ['MCQ', 'SPEAKING_PROMPT'],
};

export const OPTION_KEYS = ['A', 'B', 'C', 'D'] as const;
export type OptionKey = (typeof OPTION_KEYS)[number];

export const TFNG_ANSWERS = ['T', 'F', 'NG'] as const;
export type TfngAnswer = (typeof TFNG_ANSWERS)[number];

/** Valid task_type values, keyed by the question_type that requires them. */
export const TASK_TYPES_BY_QUESTION_TYPE: Partial<Record<QuestionType, readonly string[]>> = {
  WRITING_PROMPT: ['Task1', 'Task2'],
  SPEAKING_PROMPT: ['Part1', 'Part2', 'Part3'],
};

/**
 * The staging CSV's columns, in required order. No `difficulty` column —
 * `task_type` takes its place, required only for WRITING_PROMPT/
 * SPEAKING_PROMPT rows (blank otherwise).
 */
export const EXPECTED_HEADER = [
  'skill',
  'sub_skill',
  'question_type',
  'task_type',
  'passage_id',
  'passage_text',
  'audio_url',
  'prompt_text',
  'options',
  'correct_answer',
  'explanation',
  'exam_type',
] as const;

/** The optional 13th column, appended by the key-assignment tool. */
export const SOURCE_KEY_HEADER = 'source_key';

/** Words used to build a `source_key`. Prefixed `mock`, not `ia`. */
export const SKILL_WORD: Record<Skill, string> = {
  LISTENING: 'listening',
  READING: 'reading',
  WRITING: 'writing',
  SPEAKING: 'speaking',
};

export const SUB_SKILL_WORD: Record<SubSkill, string> = {
  GRAMMAR: 'grammar',
  VOCABULARY: 'vocabulary',
  COHERENCE: 'coherence',
  TASK_RESPONSE: 'task_response',
  FLUENCY: 'fluency',
  PRONUNCIATION: 'pronunciation',
};

/** Mock embeds question_type in source_key instead of difficulty. */
export const QUESTION_TYPE_WORD: Record<QuestionType, string> = {
  MCQ: 'mcq',
  TFNG: 'tfng',
  WRITING_PROMPT: 'writing_prompt',
  SPEAKING_PROMPT: 'speaking_prompt',
};

export const SOURCE_KEY_PAD = 3;

// ---------------------------------------------------------------------------
// Findings
// ---------------------------------------------------------------------------

export type FindingCode =
  // --- file / structural (severity: fail) ---
  | 'FILE_UNREADABLE'
  | 'FILE_EMPTY'
  | 'CSV_PARSE_ERROR'
  | 'HEADER_COLUMN_COUNT'
  | 'HEADER_COLUMN_MISMATCH'
  | 'NO_DATA_ROWS'
  | 'EMBEDDED_HEADER_ROW'
  | 'ROW_COLUMN_COUNT'
  | 'ROW_COUNT_MISMATCH'
  // --- bucket (severity: fail) ---
  | 'BUCKET_NOT_UNIFORM'
  | 'BUCKET_PAIR_INVALID'
  | 'BUCKET_FILENAME_MISMATCH'
  | 'BUCKET_FILENAME_UNDETERMINED'
  // --- row: enums (severity: fail) ---
  | 'SKILL_INVALID'
  | 'SUB_SKILL_INVALID'
  | 'EXAM_TYPE_INVALID'
  | 'QUESTION_TYPE_INVALID'
  | 'QUESTION_TYPE_SKILL_MISMATCH'
  // --- row: task_type (severity: fail) ---
  | 'TASK_TYPE_REQUIRED'
  | 'TASK_TYPE_INVALID'
  | 'TASK_TYPE_NOT_ALLOWED'
  // --- row: MCQ options (severity: fail) ---
  | 'OPTIONS_EMPTY'
  | 'OPTIONS_NOT_JSON'
  | 'OPTIONS_NOT_OBJECT'
  | 'OPTIONS_KEYS_WRONG'
  | 'OPTION_VALUE_NOT_STRING'
  | 'OPTION_VALUE_EMPTY'
  | 'OPTION_TEXT_DUPLICATE'
  | 'OPTIONS_PRESENT_BUT_NOT_ALLOWED'
  // --- row: correct_answer (severity: fail) ---
  | 'CORRECT_ANSWER_EMPTY'
  | 'CORRECT_ANSWER_NOT_A_KEY'
  | 'CORRECT_ANSWER_PRESENT_BUT_NOT_ALLOWED'
  // --- row: text (severity: fail) ---
  | 'PROMPT_TEXT_EMPTY'
  | 'EXPLANATION_EMPTY'
  // --- row: passage/audio consistency (severity: fail) ---
  | 'PASSAGE_TEXT_MISSING'
  | 'PASSAGE_TEXT_INCONSISTENT'
  | 'PASSAGE_TEXT_PRESENT_BUT_NOT_ALLOWED'
  | 'AUDIO_URL_PRESENT_BUT_NOT_ALLOWED'
  // --- row: source_key (severity: fail) ---
  | 'SOURCE_KEY_MISSING'
  | 'SOURCE_KEY_MALFORMED'
  | 'SOURCE_KEY_BUCKET_MISMATCH'
  // --- cross-row within one file (severity: fail) ---
  | 'PROMPT_DUPLICATE'
  | 'SOURCE_KEY_DUPLICATE'
  // --- file: source_key (severity: fail, only when keys are required) ---
  | 'SOURCE_KEY_COLUMN_ABSENT'
  // --- cross-file within one run (severity: fail) ---
  | 'DUPLICATE_BUCKET_ACROSS_FILES'
  | 'SOURCE_KEY_DUPLICATE_ACROSS_FILES'
  // --- warnings (never block an import) ---
  | 'EXPLANATION_CREDITS_OTHER_LETTER';

export type Severity = 'fail' | 'warn';

export const SEVERITY_BY_CODE: Record<FindingCode, Severity> = {
  FILE_UNREADABLE: 'fail',
  FILE_EMPTY: 'fail',
  CSV_PARSE_ERROR: 'fail',
  HEADER_COLUMN_COUNT: 'fail',
  HEADER_COLUMN_MISMATCH: 'fail',
  NO_DATA_ROWS: 'fail',
  EMBEDDED_HEADER_ROW: 'fail',
  ROW_COLUMN_COUNT: 'fail',
  ROW_COUNT_MISMATCH: 'fail',
  BUCKET_NOT_UNIFORM: 'fail',
  BUCKET_PAIR_INVALID: 'fail',
  BUCKET_FILENAME_MISMATCH: 'fail',
  BUCKET_FILENAME_UNDETERMINED: 'fail',
  SKILL_INVALID: 'fail',
  SUB_SKILL_INVALID: 'fail',
  EXAM_TYPE_INVALID: 'fail',
  QUESTION_TYPE_INVALID: 'fail',
  QUESTION_TYPE_SKILL_MISMATCH: 'fail',
  TASK_TYPE_REQUIRED: 'fail',
  TASK_TYPE_INVALID: 'fail',
  TASK_TYPE_NOT_ALLOWED: 'fail',
  OPTIONS_EMPTY: 'fail',
  OPTIONS_NOT_JSON: 'fail',
  OPTIONS_NOT_OBJECT: 'fail',
  OPTIONS_KEYS_WRONG: 'fail',
  OPTION_VALUE_NOT_STRING: 'fail',
  OPTION_VALUE_EMPTY: 'fail',
  OPTION_TEXT_DUPLICATE: 'fail',
  OPTIONS_PRESENT_BUT_NOT_ALLOWED: 'fail',
  CORRECT_ANSWER_EMPTY: 'fail',
  CORRECT_ANSWER_NOT_A_KEY: 'fail',
  CORRECT_ANSWER_PRESENT_BUT_NOT_ALLOWED: 'fail',
  PROMPT_TEXT_EMPTY: 'fail',
  EXPLANATION_EMPTY: 'fail',
  PASSAGE_TEXT_MISSING: 'fail',
  PASSAGE_TEXT_INCONSISTENT: 'fail',
  PASSAGE_TEXT_PRESENT_BUT_NOT_ALLOWED: 'fail',
  AUDIO_URL_PRESENT_BUT_NOT_ALLOWED: 'fail',
  SOURCE_KEY_MISSING: 'fail',
  SOURCE_KEY_MALFORMED: 'fail',
  SOURCE_KEY_BUCKET_MISMATCH: 'fail',
  PROMPT_DUPLICATE: 'fail',
  SOURCE_KEY_DUPLICATE: 'fail',
  SOURCE_KEY_COLUMN_ABSENT: 'fail',
  DUPLICATE_BUCKET_ACROSS_FILES: 'fail',
  SOURCE_KEY_DUPLICATE_ACROSS_FILES: 'fail',
  EXPLANATION_CREDITS_OTHER_LETTER: 'warn',
};

export type FindingScope = 'file' | 'bucket' | 'row' | 'run';

export interface Finding {
  code: FindingCode;
  severity: Severity;
  scope: FindingScope;
  message: string;
  line?: number;
  column?: string;
}

export function makeFinding(
  code: FindingCode,
  scope: FindingScope,
  message: string,
  extra?: { line?: number; column?: string },
): Finding {
  return {
    code,
    severity: SEVERITY_BY_CODE[code],
    scope,
    message,
    ...(extra?.line !== undefined ? { line: extra.line } : {}),
    ...(extra?.column !== undefined ? { column: extra.column } : {}),
  };
}

// ---------------------------------------------------------------------------
// Rows
// ---------------------------------------------------------------------------

export interface RawRow {
  line: number;
  cells: string[];
}

export interface MockCsvRow extends RawRow {
  skill: string;
  sub_skill: string;
  question_type: string;
  task_type: string;
  passage_id: string;
  passage_text: string;
  audio_url: string;
  prompt_text: string;
  options: string;
  correct_answer: string;
  explanation: string;
  exam_type: string;
  /** Undefined when the file has no such column; '' when the column exists but the cell is blank. */
  source_key?: string;
}

export interface LoadedCsv {
  filePath: string;
  fileName: string;
  header: string[] | null;
  hasSourceKeyColumn: boolean;
  rows: MockCsvRow[];
  findings: Finding[];
  fatal: boolean;
}

// ---------------------------------------------------------------------------
// Results
// ---------------------------------------------------------------------------

export type RowOutcome = 'pass' | 'warn' | 'fail';

export interface RowResult {
  row: MockCsvRow;
  findings: Finding[];
  outcome: RowOutcome;
}

export interface FileResult {
  filePath: string;
  fileName: string;
  bucket: BucketPair | null;
  fileFindings: Finding[];
  rowResults: RowResult[];
  outcome: RowOutcome;
  expectedRowCount: number;
}

/** (skill, sub_skill) — one file = one bucket. question_type varies within a bucket's rows. */
export interface BucketPair {
  skill: string;
  sub_skill: string;
}

export function bucketKey(b: BucketPair): string {
  return `${b.skill}/${b.sub_skill}`;
}

export interface RunResult {
  files: FileResult[];
  runFindings: Finding[];
  outcome: RowOutcome;
  expectedLabel: string;
}

export interface ExpectedSpec {
  fallback: number;
  byBucket: Partial<Record<string, number>>;
}

export function describeExpected(spec: ExpectedSpec): string {
  const parts = Object.entries(spec.byBucket)
    .filter(([, v]) => v !== undefined)
    .map(([k, v]) => `${k.toLowerCase()}=${v}`);
  return parts.length > 0 ? `${parts.join(', ')}, else ${spec.fallback}` : String(spec.fallback);
}
