/**
 * Core types shared by the question-bank verification layers.
 *
 * Nothing in here touches the database. The enum members and the valid
 * (skill, sub_skill) allow-list are declared locally rather than imported from
 * `@prisma/client` on purpose: this layer must stay runnable with no generated
 * Prisma client and no DATABASE_URL present. `enums.spec.ts` asserts these stay
 * in sync with prisma/schema.prisma.
 */

export const SKILLS = ['LISTENING', 'READING', 'WRITING', 'SPEAKING'] as const;

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

export const LEVELS = ['BEGINNER', 'INTERMEDIATE', 'ADVANCED'] as const;

export type Skill = (typeof SKILLS)[number];
export type SubSkill = (typeof SUB_SKILLS)[number];
export type Level = (typeof LEVELS)[number];

/**
 * The fixed allow-list of legal (skill, sub_skill) pairs. This is NOT the cross
 * product of the two enums — the database enums are wider than what is
 * semantically valid.
 */
export const VALID_SUB_SKILLS_BY_SKILL: Record<Skill, readonly SubSkill[]> = {
  LISTENING: ['LISTENING'],
  READING: ['READING'],
  WRITING: ['GRAMMAR', 'VOCABULARY', 'COHERENCE', 'TASK_RESPONSE'],
  SPEAKING: ['GRAMMAR', 'VOCABULARY', 'FLUENCY', 'PRONUNCIATION'],
};

/** The 7 CSV columns, in the order they must appear (already normalized). */
export const EXPECTED_HEADER = [
  'skill',
  'sub_skill',
  'level',
  'prompt_text',
  'options',
  'correct_answer',
  'explanation',
] as const;

/**
 * The optional 8th column, appended by the key-assignment tool.
 *
 * It is deliberately NOT part of EXPECTED_HEADER. Content authors write 7-column
 * files and never see this column; it is added later by tooling. A file without it
 * is untagged, not malformed — so its absence is only an error when the caller
 * explicitly requires keys (the importer does; a routine structural check does not).
 */
export const SOURCE_KEY_HEADER = 'source_key';

/**
 * Words used to build a `source_key`: the enum member, lowercased.
 *
 * This is an EXTERNAL CONTRACT, matched to the keys already live in the database —
 * verified against all 3,180 existing `drill_questions` rows, whose 30 distinct key
 * prefixes correspond exactly to the 30 valid (skill, sub_skill, level) combinations.
 * It must not be "tidied up".
 *
 * Note this is NOT the abbreviated form (`speak`/`pronun`/`beg`) written in the task
 * brief and in `prisma/seeds/README.md`. Those documents disagree with the data, and
 * the data won: rekeying 3,180 live rows to match a doc would be gratuitous risk,
 * and a mismatch here means the importer inserts duplicates instead of updating.
 *
 * `TASK_RESPONSE` keeps its underscore (`task_response`), so a key does NOT have a
 * fixed number of `_`-separated segments. Parsing therefore matches whole prefixes
 * rather than splitting — see `parseSourceKey`.
 */
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

export const LEVEL_WORD: Record<Level, string> = {
  BEGINNER: 'beginner',
  INTERMEDIATE: 'intermediate',
  ADVANCED: 'advanced',
};

/**
 * Digits in the numeric suffix: `_001`. Every existing key in the database is
 * exactly 3-digit padded. Wider numbers are accepted so a bucket can outgrow 999.
 */
export const SOURCE_KEY_PAD = 3;

/** The only `drill_type` in production. Never read from the CSV — set by the loader. */
export const DRILL_TYPE = 'MCQ';

/** The four option keys every MCQ must have, exactly. */
export const OPTION_KEYS = ['A', 'B', 'C', 'D'] as const;
export type OptionKey = (typeof OPTION_KEYS)[number];

// ---------------------------------------------------------------------------
// Findings
// ---------------------------------------------------------------------------

/**
 * Stable machine-readable finding codes. Regression fixtures assert on these
 * exact strings, so treat them as an API: rename only with a fixture update.
 *
 * Codes are deliberately fine-grained — a fixture that asserts
 * `CORRECT_ANSWER_NOT_JSON` must not be satisfiable by an unrelated
 * `CORRECT_ANSWER_NOT_A_STRING` bug.
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

/**
 * Severity is declared here, as data, so that no check can accidentally
 * escalate a warning into a hard failure. The credit-language heuristic is a
 * regex guess at authorial intent and must stay advisory.
 */
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

/** Where a finding lives. Row-scoped findings carry `line`; file-scoped ones don't. */
export type FindingScope = 'file' | 'bucket' | 'row' | 'run';

export interface Finding {
  code: FindingCode;
  severity: Severity;
  scope: FindingScope;
  /** Human-readable, specific, and safe to paste into a spreadsheet cell. */
  message: string;
  /** 1-based physical line number in the source CSV, when the finding is row-scoped. */
  line?: number;
  /** CSV column name the finding concerns, when applicable. */
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

/**
 * A data row exactly as it came out of the CSV parser: positional cells, plus
 * the physical line number. No interpretation has happened yet.
 */
export interface RawRow {
  /** 1-based physical line number in the file (header is usually line 1). */
  line: number;
  cells: string[];
}

/**
 * A row mapped onto the 7 expected columns. Values are the raw cell strings —
 * `options` and `correct_answer` are still unparsed JSON text, because how they
 * fail to parse is itself a finding.
 */
export interface DrillCsvRow extends RawRow {
  skill: string;
  sub_skill: string;
  level: string;
  prompt_text: string;
  options: string;
  correct_answer: string;
  explanation: string;
  /**
   * Optional because untagged files legitimately have no such column. Absent
   * column and present-but-blank cell are different states and are reported
   * differently, so this is `undefined` in the former case and `''` in the latter.
   */
  source_key?: string;
}

export interface LoadedCsv {
  filePath: string;
  fileName: string;
  /** Normalized header cells, or null if the file had no readable header. */
  header: string[] | null;
  /** True when the header carried a `source_key` column, i.e. the file is tagged. */
  hasSourceKeyColumn: boolean;
  rows: DrillCsvRow[];
  /** Findings raised during load itself (unreadable, parse error, bad header shape). */
  findings: Finding[];
  /** True when loading failed badly enough that row checks would be meaningless. */
  fatal: boolean;
}

// ---------------------------------------------------------------------------
// Results
// ---------------------------------------------------------------------------

export type RowOutcome = 'pass' | 'warn' | 'fail';

export interface RowResult {
  row: DrillCsvRow;
  findings: Finding[];
  outcome: RowOutcome;
}

export interface FileResult {
  filePath: string;
  fileName: string;
  /** The (skill, sub_skill, level) triple the file's rows agree on, if they do. */
  bucket: BucketTriple | null;
  /** Findings that belong to the file as a whole, not to one row. */
  fileFindings: Finding[];
  rowResults: RowResult[];
  outcome: RowOutcome;
  expectedRowCount: number;
}

export interface BucketTriple {
  skill: string;
  sub_skill: string;
  level: string;
}

export function bucketKey(b: BucketTriple): string {
  return `${b.skill}/${b.sub_skill}/${b.level}`;
}

export interface RunResult {
  files: FileResult[];
  /** Findings spanning more than one file (e.g. two files claiming one bucket). */
  runFindings: Finding[];
  outcome: RowOutcome;
  /** Human-readable form of the expected-row-count setting, e.g. `advanced=50, else 200`. */
  expectedLabel: string;
}

/**
 * How many rows each file should have. A single number covers the common case;
 * the per-level map exists because Advanced batches are legitimately smaller, and
 * a run that scans every level at once would otherwise be impossible to satisfy.
 */
export interface ExpectedSpec {
  fallback: number;
  byLevel: Partial<Record<Level, number>>;
}

export function describeExpected(spec: ExpectedSpec): string {
  const parts = (Object.keys(spec.byLevel) as Level[])
    .filter(l => spec.byLevel[l] !== undefined)
    .map(l => `${l.toLowerCase()}=${spec.byLevel[l]}`);
  return parts.length > 0 ? `${parts.join(', ')}, else ${spec.fallback}` : String(spec.fallback);
}
