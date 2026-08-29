/**
 * Core types for the IA (Internal Assessment) question-bank verification layers.
 *
 * IAQuestion is structurally like DiagnosticQuestion, not like drills' flat
 * 4-option MCQ: `question_type` spans MCQ / TFNG / WRITING_PROMPT /
 * SPEAKING_PROMPT (confirmed in prisma/schema.prisma — `question_type` is a
 * plain varchar, not a DB enum, so the CSV-level allow-list below is this
 * tool's own contract, not one enforced by Postgres). But IA questions are
 * staged/tagged/imported the same way drills are — one CSV per (skill,
 * sub_skill, difficulty) bucket, given a permanent `source_key`, upserted
 * idempotently — not read live off one staging batch the way diagnostic is.
 *
 * So the PIPELINE here (shared/, layer1, key-assignment-tool, layer2,
 * importer) is drills' shape; the ROW SHAPE and layer2 judging logic is
 * diagnostic's. Nothing here imports `@prisma/client` — this tree must
 * typecheck with no generated client present, same rule as drills/diagnostic.
 */

export const SKILLS = ['LISTENING', 'READING', 'WRITING', 'SPEAKING'] as const;
export type Skill = (typeof SKILLS)[number];

export const SUB_SKILLS = [
  'LISTENING',
  'READING',
  'GRAMMAR',
  'VOCABULARY',
  'COHERENCE',
  'TASK_RESPONSE',
  'FLUENCY',
  'PRONUNCIATION',
] as const;
export type SubSkill = (typeof SUB_SKILLS)[number];

/** IAQuestion's `difficulty: DifficultyType` is this tool's bucket "level". */
export const DIFFICULTIES = ['BEGINNER', 'INTERMEDIATE', 'ADVANCED'] as const;
export type Difficulty = (typeof DIFFICULTIES)[number];

export const EXAM_TYPES = ['IELTS', 'SPOKEN', 'OET', 'GRE', 'TOEFL', 'PTE'] as const;
export type ExamType = (typeof EXAM_TYPES)[number];

export const QUESTION_TYPES = ['MCQ', 'TFNG', 'WRITING_PROMPT', 'SPEAKING_PROMPT'] as const;
export type QuestionType = (typeof QUESTION_TYPES)[number];

/** Same allow-list drills uses — SubSkillType is the same Prisma enum for both tables. */
export const VALID_SUB_SKILLS_BY_SKILL: Record<Skill, readonly SubSkill[]> = {
  LISTENING: ['LISTENING'],
  READING: ['READING'],
  WRITING: ['GRAMMAR', 'VOCABULARY', 'COHERENCE', 'TASK_RESPONSE'],
  SPEAKING: ['GRAMMAR', 'VOCABULARY', 'FLUENCY', 'PRONUNCIATION'],
};

/** Which question_type values are legal under which skill — same shape as diagnostic's. */
export const VALID_QUESTION_TYPES_BY_SKILL: Record<Skill, readonly QuestionType[]> = {
  LISTENING: ['MCQ'],
  READING: ['MCQ', 'TFNG'],
  WRITING: ['WRITING_PROMPT'],
  SPEAKING: ['SPEAKING_PROMPT'],
};

export const OPTION_KEYS = ['A', 'B', 'C', 'D'] as const;
export type OptionKey = (typeof OPTION_KEYS)[number];

export const TFNG_ANSWERS = ['T', 'F', 'NG'] as const;
export type TfngAnswer = (typeof TFNG_ANSWERS)[number];

/**
 * The staging CSV's columns, in required order.
 *
 * `passage_id` groups rows that share one passage/recording — the same role
 * `set_id` plays in diagnostic — and every row sharing a `passage_id` must
 * carry the identical `passage_text` / `audio_url`. `exam_type` exists
 * because IAQuestion serves more than IELTS (see the ExamType enum); it
 * defaults to IELTS at the DB layer but is written explicitly here so a
 * batch for another exam type says so plainly.
 */
export const EXPECTED_HEADER = [
  'skill',
  'sub_skill',
  'difficulty',
  'question_type',
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

/** Words used to build a `source_key`. Mirrors drills' convention, prefixed `ia` not `drill`. */
export const SKILL_WORD: Record<Skill, string> = {
  LISTENING: 'listening',
  READING: 'reading',
  WRITING: 'writing',
  SPEAKING: 'speaking',
};

export const SUB_SKILL_WORD: Record<SubSkill, string> = {
  LISTENING: 'listening',
  READING: 'reading',
  GRAMMAR: 'grammar',
  VOCABULARY: 'vocabulary',
  COHERENCE: 'coherence',
  TASK_RESPONSE: 'task_response',
  FLUENCY: 'fluency',
  PRONUNCIATION: 'pronunciation',
};

export const DIFFICULTY_WORD: Record<Difficulty, string> = {
  BEGINNER: 'beginner',
  INTERMEDIATE: 'intermediate',
  ADVANCED: 'advanced',
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
  | 'DIFFICULTY_FOLDER_MISMATCH'
  // --- row: enums (severity: fail) ---
  | 'SKILL_INVALID'
  | 'SUB_SKILL_INVALID'
  | 'DIFFICULTY_INVALID'
  | 'EXAM_TYPE_INVALID'
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
  // --- row: text (severity: fail) ---
  | 'PROMPT_TEXT_EMPTY'
  | 'EXPLANATION_EMPTY'
  // --- row: passage/audio consistency (severity: fail) ---
  | 'PASSAGE_ID_MISSING'
  | 'PASSAGE_TEXT_MISSING'
  | 'PASSAGE_TEXT_INCONSISTENT'
  | 'PASSAGE_TEXT_PRESENT_BUT_NOT_ALLOWED'
  | 'AUDIO_URL_MISSING'
  | 'AUDIO_URL_INCONSISTENT'
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
  DIFFICULTY_FOLDER_MISMATCH: 'fail',
  SKILL_INVALID: 'fail',
  SUB_SKILL_INVALID: 'fail',
  DIFFICULTY_INVALID: 'fail',
  EXAM_TYPE_INVALID: 'fail',
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
  EXPLANATION_EMPTY: 'fail',
  PASSAGE_ID_MISSING: 'fail',
  PASSAGE_TEXT_MISSING: 'fail',
  PASSAGE_TEXT_INCONSISTENT: 'fail',
  PASSAGE_TEXT_PRESENT_BUT_NOT_ALLOWED: 'fail',
  AUDIO_URL_MISSING: 'fail',
  AUDIO_URL_INCONSISTENT: 'fail',
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

export interface IACsvRow extends RawRow {
  skill: string;
  sub_skill: string;
  difficulty: string;
  question_type: string;
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
  rows: IACsvRow[];
  findings: Finding[];
  fatal: boolean;
}

// ---------------------------------------------------------------------------
// Results
// ---------------------------------------------------------------------------

export type RowOutcome = 'pass' | 'warn' | 'fail';

export interface RowResult {
  row: IACsvRow;
  findings: Finding[];
  outcome: RowOutcome;
}

export interface FileResult {
  filePath: string;
  fileName: string;
  bucket: BucketTriple | null;
  fileFindings: Finding[];
  rowResults: RowResult[];
  outcome: RowOutcome;
  expectedRowCount: number;
}

/** (skill, sub_skill, difficulty) — the IA equivalent of drills' bucket triple. */
export interface BucketTriple {
  skill: string;
  sub_skill: string;
  difficulty: string;
}

export function bucketKey(b: BucketTriple): string {
  return `${b.skill}/${b.sub_skill}/${b.difficulty}`;
}

export interface RunResult {
  files: FileResult[];
  runFindings: Finding[];
  outcome: RowOutcome;
  expectedLabel: string;
}

export interface ExpectedSpec {
  fallback: number;
  byDifficulty: Partial<Record<Difficulty, number>>;
}

export function describeExpected(spec: ExpectedSpec): string {
  const parts = (Object.keys(spec.byDifficulty) as Difficulty[])
    .filter(d => spec.byDifficulty[d] !== undefined)
    .map(d => `${d.toLowerCase()}=${spec.byDifficulty[d]}`);
  return parts.length > 0 ? `${parts.join(', ')}, else ${spec.fallback}` : String(spec.fallback);
}
