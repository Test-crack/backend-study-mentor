/**
 * Core types for the diagnostic question-bank verification layers.
 *
 * Unlike drills, diagnostic questions are never staged as many independently
 * authored CSVs over time — they're read live from `diagnostic_questions` in
 * Postgres. This tooling instead verifies a NEW BATCH before it's imported:
 * a content author (human or otherwise) writes a batch of questions into one
 * staging CSV, Layer 1 checks its structure, Layer 2 checks its content, and
 * only a clean batch gets written into the live table.
 *
 * The row shape mirrors the real `diagnostic_questions` columns (confirmed
 * live against Postgres, not just the Prisma schema file) plus two
 * staging-only columns that don't exist in the DB: `transcript` and
 * `audio_file`, needed only for LISTENING batches — see the note there.
 */

export const SKILLS = ['LISTENING', 'READING', 'WRITING', 'SPEAKING'] as const;
export type Skill = (typeof SKILLS)[number];

/**
 * `char(1)` in Postgres, NOT NULL, no default. Kept only because the column
 * still exists and is still required — the diagnostic-disconnect plan intends
 * to stop reading this for question selection and eventually drop the column
 * entirely. Until then, every staged row still needs *some* valid value here.
 */
export const LEVELS = ['A', 'B', 'C'] as const;
export type Level = (typeof LEVELS)[number];

export const QUESTION_TYPES = ['MCQ', 'TFNG', 'WRITING_PROMPT', 'SPEAKING_PROMPT'] as const;
export type QuestionType = (typeof QUESTION_TYPES)[number];

/** Confirmed live: which question_type values actually occur under which skill. */
export const VALID_QUESTION_TYPES_BY_SKILL: Record<Skill, readonly QuestionType[]> = {
  LISTENING: ['MCQ'],
  READING: ['MCQ', 'TFNG'],
  WRITING: ['WRITING_PROMPT'],
  SPEAKING: ['SPEAKING_PROMPT'],
};

export const OPTION_KEYS = ['A', 'B', 'C', 'D'] as const;
export type OptionKey = (typeof OPTION_KEYS)[number];

/** TFNG's answer domain. NG ("Not Given") is valid per the type's name even though no live row uses it yet. */
export const TFNG_ANSWERS = ['T', 'F', 'NG'] as const;
export type TfngAnswer = (typeof TFNG_ANSWERS)[number];

/**
 * The staging CSV's columns, in required order. One shape covers all four
 * skills; most rows leave several of these blank, and which ones are required
 * depends on `question_type` — see checks.ts.
 *
 * `passage_text` / `audio_file` / `transcript` all follow the same rule:
 * every row sharing a `set_id` must carry the identical value, because they
 * describe the ONE passage/recording the whole set is about, repeated onto
 * each row so the CSV stays flat (confirmed live: this is exactly how
 * `passage_text` already behaves for real Reading rows).
 *
 * `audio_file` and `transcript` exist ONLY in this staging format, not in the
 * live table — `audio_file` names the local file being staged (hosting is a
 * separate unresolved question, not this tool's problem), and `transcript` is
 * the content author's verbatim script, required for every LISTENING row so
 * Layer 2 has real ground truth to grade MCQ answers against.
 */
export const EXPECTED_HEADER = [
  'skill',
  'level',
  'set_id',
  'sequence',
  'question_type',
  'prompt_text',
  'options',
  'correct_answer',
  'min_words',
  'passage_text',
  'audio_file',
  'transcript',
] as const;

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
  // --- row: enums (severity: fail) ---
  | 'SKILL_INVALID'
  | 'LEVEL_INVALID'
  | 'QUESTION_TYPE_INVALID'
  | 'QUESTION_TYPE_SKILL_MISMATCH'
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
  // --- row: prompt text (severity: fail) ---
  | 'PROMPT_TEXT_EMPTY'
  // --- row: min_words (severity: fail) ---
  | 'MIN_WORDS_MISSING'
  | 'MIN_WORDS_INVALID'
  | 'MIN_WORDS_PRESENT_BUT_NOT_ALLOWED'
  // --- row: set_id / sequence (severity: fail) ---
  | 'SET_ID_MISSING'
  | 'SET_IDENTITY_MISMATCH'
  | 'SEQUENCE_INVALID'
  | 'SEQUENCE_NOT_SEQUENTIAL'
  // --- row: passage / audio / transcript consistency (severity: fail) ---
  | 'PASSAGE_TEXT_MISSING'
  | 'PASSAGE_TEXT_INCONSISTENT'
  | 'AUDIO_FILE_MISSING'
  | 'AUDIO_FILE_INCONSISTENT'
  | 'TRANSCRIPT_MISSING'
  | 'TRANSCRIPT_INCONSISTENT'
  // --- cross-row within one file (severity: fail) ---
  | 'PROMPT_DUPLICATE'
  // --- warnings (never block an import) ---
  | 'SET_SIZE_UNEXPECTED';

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
  SKILL_INVALID: 'fail',
  LEVEL_INVALID: 'fail',
  QUESTION_TYPE_INVALID: 'fail',
  QUESTION_TYPE_SKILL_MISMATCH: 'fail',
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
  MIN_WORDS_MISSING: 'fail',
  MIN_WORDS_INVALID: 'fail',
  MIN_WORDS_PRESENT_BUT_NOT_ALLOWED: 'fail',
  SET_ID_MISSING: 'fail',
  SET_IDENTITY_MISMATCH: 'fail',
  SEQUENCE_INVALID: 'fail',
  SEQUENCE_NOT_SEQUENTIAL: 'fail',
  PASSAGE_TEXT_MISSING: 'fail',
  PASSAGE_TEXT_INCONSISTENT: 'fail',
  AUDIO_FILE_MISSING: 'fail',
  AUDIO_FILE_INCONSISTENT: 'fail',
  TRANSCRIPT_MISSING: 'fail',
  TRANSCRIPT_INCONSISTENT: 'fail',
  PROMPT_DUPLICATE: 'fail',
  SET_SIZE_UNEXPECTED: 'warn',
};

export type FindingScope = 'file' | 'set' | 'row' | 'run';

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

export interface RawRow {
  line: number;
  cells: string[];
}

export interface DiagnosticCsvRow extends RawRow {
  skill: string;
  level: string;
  set_id: string;
  sequence: string;
  question_type: string;
  prompt_text: string;
  options: string;
  correct_answer: string;
  min_words: string;
  passage_text: string;
  audio_file: string;
  transcript: string;
}

export interface LoadedCsv {
  filePath: string;
  fileName: string;
  header: string[] | null;
  rows: DiagnosticCsvRow[];
  findings: Finding[];
  fatal: boolean;
}

export type RowOutcome = 'pass' | 'warn' | 'fail';

export interface RowResult {
  row: DiagnosticCsvRow;
  findings: Finding[];
  outcome: RowOutcome;
}

export interface SetResult {
  setId: string;
  skill: string;
  level: string;
  rows: DiagnosticCsvRow[];
  findings: Finding[];
}

export interface FileResult {
  filePath: string;
  fileName: string;
  fileFindings: Finding[];
  setResults: SetResult[];
  rowResults: RowResult[];
  outcome: RowOutcome;
  expectedRowCount: number;
}

export interface RunResult {
  files: FileResult[];
  runFindings: Finding[];
  outcome: RowOutcome;
  expectedLabel: string;
}

export interface ExpectedSpec {
  count: number;
}

export function describeExpected(spec: ExpectedSpec): string {
  return String(spec.count);
}
