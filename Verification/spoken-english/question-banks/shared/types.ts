/**
 * Core types shared by the Spoken English MCQ drill verification layers.
 *
 * Forked from Verification/drills/question-banks/shared/types.ts (the IELTS
 * pipeline) rather than parametrizing it in place, so the IELTS content
 * pipeline — production-critical, 3,180 live rows — is never at risk while
 * this Spoken English side is still being proven out. Merge the two only
 * after this pipeline has run for real (see repo note in the PR).
 *
 * Nothing in here touches the database. `SUB_SKILLS` is the actual Postgres
 * `SubSkillType` enum (unchanged) — Spoken English's 6 CEFR subskills are
 * mapped ONTO those existing values rather than requiring an enum migration,
 * per the team's content-data-requirement doc (§7.1):
 *   range → VOCABULARY, accuracy → GRAMMAR, fluency → FLUENCY,
 *   coherence → COHERENCE, phonology → PRONUNCIATION,
 *   interaction → INTERACTION (⚠️ NOT YET a valid enum member — see note below).
 */

export const SKILLS = ['SPEAKING'] as const;

/**
 * `INTERACTION` does not exist in the live `SubSkillType` Postgres enum yet
 * (confirmed against prisma/schema.prisma — the enum has LISTENING, READING,
 * GRAMMAR, VOCABULARY, COHERENCE, TASK_RESPONSE, FLUENCY, PRONUNCIATION only).
 * The content-data-requirement doc's own fallback is to reuse TASK_RESPONSE
 * until a migration adds INTERACTION for real. This pipeline is written
 * against the target state (INTERACTION) — the importer will fail loudly at
 * insert time with Postgres's own enum error until that migration lands, which
 * is the correct failure mode (never silently reuse TASK_RESPONSE's meaning
 * without an explicit decision).
 */
export const SUB_SKILLS = [
  'VOCABULARY',
  'GRAMMAR',
  'FLUENCY',
  'COHERENCE',
  'PRONUNCIATION',
  'INTERACTION',
] as const;

/** The true CEFR subskill label a DB enum value stands in for, in this exam. */
export const SUB_SKILL_CEFR_LABEL: Record<SubSkill, string> = {
  VOCABULARY: 'range',
  GRAMMAR: 'accuracy',
  FLUENCY: 'fluency',
  COHERENCE: 'coherence',
  PRONUNCIATION: 'phonology',
  INTERACTION: 'interaction',
};

/**
 * CEFR levels authored against (cohort 1: a1-b2; c1 is full-coverage, not
 * blocking). This IS the bucket/folder level for this pipeline — unlike
 * IELTS's 3-way BEGINNER/INTERMEDIATE/ADVANCED, content is authored per exact
 * CEFR level so a1 and a2 content aren't forced into one file.
 */
export const LEVELS = ['A1', 'A2', 'B1', 'B2', 'C1'] as const;

export type Skill = (typeof SKILLS)[number];
export type SubSkill = (typeof SUB_SKILLS)[number];
export type Level = (typeof LEVELS)[number];

/**
 * Every CEFR level maps to exactly one of the DB's `RecommendationLevel`
 * enum values (BEGINNER/INTERMEDIATE/ADVANCED) — that's the column that
 * actually gets written; the true CEFR level is kept in `options.target_level`
 * so it survives the lossy bucket mapping. Per the content-data-requirement
 * doc: a1/a2 -> BEGINNER, b1/b2 -> INTERMEDIATE, c1 -> ADVANCED.
 */
export const LEVEL_TO_RECOMMENDATION_LEVEL: Record<Level, 'BEGINNER' | 'INTERMEDIATE' | 'ADVANCED'> = {
  A1: 'BEGINNER',
  A2: 'BEGINNER',
  B1: 'INTERMEDIATE',
  B2: 'INTERMEDIATE',
  C1: 'ADVANCED',
};

/** Pooling bands, for reference against the doc's "Band A/B/C" language. */
export const LEVEL_TO_BAND: Record<Level, 'A' | 'B' | 'C'> = {
  A1: 'A',
  A2: 'A',
  B1: 'B',
  B2: 'B',
  C1: 'C',
};

/**
 * The fixed allow-list of legal (skill, sub_skill) pairs. Only one skill
 * (SPEAKING) exists for this exam, and all 6 subskills are valid under it.
 */
export const VALID_SUB_SKILLS_BY_SKILL: Record<Skill, readonly SubSkill[]> = {
  SPEAKING: ['VOCABULARY', 'GRAMMAR', 'FLUENCY', 'COHERENCE', 'PRONUNCIATION', 'INTERACTION'],
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
 * Words used to build a `source_key`. Unlike the IELTS pipeline this is a
 * fresh key space (0 existing `drill_questions` rows for `exam_id =
 * 'spoken_english'` as of this writing) — no live data to stay compatible
 * with, so the words match the content-data-requirement doc's own examples
 * exactly (`se_drill_range_b1_01`) rather than the raw DB enum spelling.
 */
export const SKILL_WORD: Record<Skill, string> = {
  SPEAKING: 'speaking',
};

/**
 * Deliberately the CEFR label, not the DB enum word — `se_drill_range_b1_01`,
 * not `se_drill_vocabulary_b1_01`. This is what the content-data-requirement
 * doc's own examples use, and it's what content authors actually think in
 * (range/accuracy/interaction), so the key stays readable to them even though
 * the underlying DB column stores the enum-mapped value.
 */
export const SUB_SKILL_WORD: Record<SubSkill, string> = {
  VOCABULARY: 'range',
  GRAMMAR: 'accuracy',
  FLUENCY: 'fluency',
  COHERENCE: 'coherence',
  PRONUNCIATION: 'phonology',
  INTERACTION: 'interaction',
};

/** Lowercased CEFR level, used verbatim in the source_key (a1, a2, b1, b2, c1). */
export const LEVEL_WORD: Record<Level, string> = {
  A1: 'a1',
  A2: 'a2',
  B1: 'b1',
  B2: 'b2',
  C1: 'c1',
};

/**
 * Digits in the numeric suffix: `_01`. The content-data-requirement doc's own
 * examples (`se_drill_range_b1_01`) use 2-digit padding, not IELTS's 3 — kept
 * consistent with that doc since this is a fresh key space, not a live table
 * being matched against.
 */
export const SOURCE_KEY_PAD = 2;

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
  /** Human-readable form of the expected-row-count setting, e.g. `c1=50, else 200`. */
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
