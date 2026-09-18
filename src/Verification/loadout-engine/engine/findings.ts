/**
 * Finding vocabulary for the loadout engine.
 *
 * Codes and severities are a public API — reports and fixtures key off the exact
 * strings — so they live here, not in a loadout. A loadout picks which checks
 * run; it cannot invent a code or soften a failure into a warning.
 *
 * The table is the union across all four forks. A missing code yields severity
 * `undefined`, which silently turns a failure into a pass, so parity.spec.ts
 * asserts every fork's codes are covered.
 */

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
  | 'LEVEL_FOLDER_MISMATCH'
  // --- row: enums (severity: fail) ---
  | 'SKILL_INVALID'
  | 'SUB_SKILL_INVALID'
  | 'LEVEL_INVALID'
  | 'EXAM_TYPE_INVALID'
  | 'QUESTION_TYPE_INVALID'
  | 'QUESTION_TYPE_SKILL_MISMATCH'
  // --- row: conditional columns (severity: fail) ---
  | 'TASK_TYPE_REQUIRED'
  | 'TASK_TYPE_INVALID'
  | 'TASK_TYPE_NOT_ALLOWED'
  // --- row: passage / audio (severity: fail) ---
  | 'PASSAGE_ID_MISSING'
  | 'PASSAGE_TEXT_MISSING'
  | 'PASSAGE_TEXT_INCONSISTENT'
  | 'PASSAGE_TEXT_PRESENT_BUT_NOT_ALLOWED'
  | 'AUDIO_URL_MISSING'
  | 'AUDIO_URL_INCONSISTENT'
  | 'AUDIO_URL_PRESENT_BUT_NOT_ALLOWED'
  | 'DIFFICULTY_INVALID'
  | 'DIFFICULTY_FOLDER_MISMATCH'
  // --- Diagnostic: sets, sequence and staging-only columns (severity: fail) ---
  | 'MIN_WORDS_MISSING'
  | 'MIN_WORDS_INVALID'
  | 'MIN_WORDS_PRESENT_BUT_NOT_ALLOWED'
  | 'SET_ID_MISSING'
  | 'SET_IDENTITY_MISMATCH'
  | 'SEQUENCE_INVALID'
  | 'SEQUENCE_NOT_SEQUENTIAL'
  | 'AUDIO_FILE_MISSING'
  | 'AUDIO_FILE_INCONSISTENT'
  | 'TRANSCRIPT_MISSING'
  | 'TRANSCRIPT_INCONSISTENT'
  // --- Diagnostic warning ---
  | 'SET_SIZE_UNEXPECTED'
  /**
   * Generic codes for panel-authored loadouts. The specifics live in the message,
   * which is what a content author reads.
   */
  | 'COLUMN_VALUE_INVALID'
  | 'COLUMN_REQUIRED_EMPTY'
  | 'COLUMN_NOT_ALLOWED_HERE'
  | 'COLUMN_NUMBER_MISSING'
  | 'COLUMN_NUMBER_INVALID'
  | 'COLUMN_JSON_INVALID'
  | 'COLUMN_JSON_NOT_OBJECT'
  | 'COLUMN_JSON_KEYS_WRONG'
  | 'COLUMN_JSON_VALUE_INVALID'
  | 'COLUMN_JSON_VALUE_DUPLICATE'
  | 'OPTIONS_PRESENT_BUT_NOT_ALLOWED'
  | 'CORRECT_ANSWER_PRESENT_BUT_NOT_ALLOWED'
  // --- row: options (severity: fail) ---
  | 'OPTIONS_EMPTY'
  | 'OPTIONS_NOT_JSON'
  | 'OPTIONS_NOT_OBJECT'
  | 'OPTIONS_KEYS_WRONG'
  | 'OPTION_VALUE_NOT_STRING'
  | 'OPTION_VALUE_EMPTY'
  | 'OPTION_TEXT_DUPLICATE'
  // --- row: correct_answer (severity: fail) ---
  | 'CORRECT_ANSWER_EMPTY'
  | 'CORRECT_ANSWER_NOT_JSON'
  | 'CORRECT_ANSWER_NOT_A_STRING'
  | 'CORRECT_ANSWER_NOT_A_KEY'
  // --- row: text (severity: fail) ---
  | 'PROMPT_TEXT_EMPTY'
  | 'EXPLANATION_EMPTY'
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
  LEVEL_FOLDER_MISMATCH: 'fail',
  SKILL_INVALID: 'fail',
  SUB_SKILL_INVALID: 'fail',
  LEVEL_INVALID: 'fail',
  EXAM_TYPE_INVALID: 'fail',
  QUESTION_TYPE_INVALID: 'fail',
  QUESTION_TYPE_SKILL_MISMATCH: 'fail',
  TASK_TYPE_REQUIRED: 'fail',
  TASK_TYPE_INVALID: 'fail',
  TASK_TYPE_NOT_ALLOWED: 'fail',
  PASSAGE_ID_MISSING: 'fail',
  PASSAGE_TEXT_MISSING: 'fail',
  PASSAGE_TEXT_INCONSISTENT: 'fail',
  PASSAGE_TEXT_PRESENT_BUT_NOT_ALLOWED: 'fail',
  AUDIO_URL_MISSING: 'fail',
  AUDIO_URL_INCONSISTENT: 'fail',
  AUDIO_URL_PRESENT_BUT_NOT_ALLOWED: 'fail',
  DIFFICULTY_INVALID: 'fail',
  DIFFICULTY_FOLDER_MISMATCH: 'fail',
  MIN_WORDS_MISSING: 'fail',
  MIN_WORDS_INVALID: 'fail',
  MIN_WORDS_PRESENT_BUT_NOT_ALLOWED: 'fail',
  SET_ID_MISSING: 'fail',
  SET_IDENTITY_MISMATCH: 'fail',
  SEQUENCE_INVALID: 'fail',
  SEQUENCE_NOT_SEQUENTIAL: 'fail',
  AUDIO_FILE_MISSING: 'fail',
  AUDIO_FILE_INCONSISTENT: 'fail',
  TRANSCRIPT_MISSING: 'fail',
  TRANSCRIPT_INCONSISTENT: 'fail',
  SET_SIZE_UNEXPECTED: 'warn',
  COLUMN_VALUE_INVALID: 'fail',
  COLUMN_REQUIRED_EMPTY: 'fail',
  COLUMN_NOT_ALLOWED_HERE: 'fail',
  COLUMN_NUMBER_MISSING: 'fail',
  COLUMN_NUMBER_INVALID: 'fail',
  COLUMN_JSON_INVALID: 'fail',
  COLUMN_JSON_NOT_OBJECT: 'fail',
  COLUMN_JSON_KEYS_WRONG: 'fail',
  COLUMN_JSON_VALUE_INVALID: 'fail',
  COLUMN_JSON_VALUE_DUPLICATE: 'fail',
  OPTIONS_PRESENT_BUT_NOT_ALLOWED: 'fail',
  CORRECT_ANSWER_PRESENT_BUT_NOT_ALLOWED: 'fail',
  OPTIONS_EMPTY: 'fail',
  OPTIONS_NOT_JSON: 'fail',
  OPTIONS_NOT_OBJECT: 'fail',
  OPTIONS_KEYS_WRONG: 'fail',
  OPTION_VALUE_NOT_STRING: 'fail',
  OPTION_VALUE_EMPTY: 'fail',
  OPTION_TEXT_DUPLICATE: 'fail',
  CORRECT_ANSWER_EMPTY: 'fail',
  CORRECT_ANSWER_NOT_JSON: 'fail',
  CORRECT_ANSWER_NOT_A_STRING: 'fail',
  CORRECT_ANSWER_NOT_A_KEY: 'fail',
  PROMPT_TEXT_EMPTY: 'fail',
  EXPLANATION_EMPTY: 'fail',
  PROMPT_DUPLICATE: 'fail',
  SOURCE_KEY_MISSING: 'fail',
  SOURCE_KEY_MALFORMED: 'fail',
  SOURCE_KEY_BUCKET_MISMATCH: 'fail',
  SOURCE_KEY_DUPLICATE: 'fail',
  SOURCE_KEY_COLUMN_ABSENT: 'fail',
  DUPLICATE_BUCKET_ACROSS_FILES: 'fail',
  SOURCE_KEY_DUPLICATE_ACROSS_FILES: 'fail',
  EXPLANATION_CREDITS_OTHER_LETTER: 'warn',
};

/** `set` is Diagnostic's own grouping level — the other forks have no equivalent. */
export type FindingScope = 'file' | 'bucket' | 'row' | 'run' | 'set';

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

export type RowOutcome = 'pass' | 'warn' | 'fail';

/** A single failing finding outranks any number of warnings. */
export function outcomeOf(findings: Finding[]): RowOutcome {
  if (findings.some(f => f.severity === 'fail')) return 'fail';
  if (findings.some(f => f.severity === 'warn')) return 'warn';
  return 'pass';
}

export function worstOutcome(outcomes: RowOutcome[]): RowOutcome {
  if (outcomes.includes('fail')) return 'fail';
  if (outcomes.includes('warn')) return 'warn';
  return 'pass';
}
