/**
 * Every structural check Layer 1 performs on a Mock question CSV.
 *
 * Ported from IA's checks.ts (same bucket/duplicate/source_key machinery)
 * with three real deltas, found by inspecting live mock_questions rows
 * rather than assuming IA's shape carries over:
 *
 * 1. No `difficulty` — dropped everywhere. Bucket is (skill, sub_skill).
 * 2. `sub_skill` is one shared pool for every skill (not per-skill), so
 *    there is no BUCKET_PAIR_INVALID case in practice — checkBucketPair is
 *    kept as a no-op for structural parity in case that ever changes.
 * 3. Passage/audio grouping is looser than IA's: standalone knowledge-check
 *    MCQ rows (no passage_id, no audio_url) are valid and never flagged —
 *    only READING rows sharing a passage_id, or LISTENING rows sharing an
 *    audio_url, need to be internally consistent.
 *
 * Every check returns Findings and never throws; severity is decided once in
 * shared/types.ts so no check can escalate its own warning.
 */

import {
  EXAM_TYPES,
  OPTION_KEYS,
  QUESTION_TYPES,
  SKILLS,
  SOURCE_KEY_HEADER,
  SUB_SKILLS,
  TASK_TYPES_BY_QUESTION_TYPE,
  VALID_QUESTION_TYPES_BY_SKILL,
  makeFinding,
  type BucketPair,
  type Finding,
  type MockCsvRow,
  type OptionKey,
  type QuestionType,
  type Skill,
} from '../shared/types';
import { keyMatchesBucket, parseSourceKey } from '../shared/sourceKey';
import {
  collapseWhitespace,
  filenameWords,
  isBlank,
  normalizeForDuplicateCheck,
  normalizeOptionText,
  wordsPresent,
} from '../../../drills/question-banks/shared/normalize';

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

function truncate(value: string, max = 80): string {
  const flat = value.replace(/\s+/g, ' ').trim();
  return flat.length <= max ? flat : `${flat.slice(0, max)}…`;
}

function describeJsonType(value: unknown): string {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'an array';
  return `a ${typeof value}`;
}

function rowNumberMap(rows: MockCsvRow[]): Map<number, number> {
  const map = new Map<number, number>();
  rows.forEach((row, i) => map.set(row.line, i + 1));
  return map;
}

// ---------------------------------------------------------------------------
// Enum cells
// ---------------------------------------------------------------------------

export function normalizeEnumCell(input: string): string {
  return collapseWhitespace(input).toUpperCase().replace(/\s+/g, '_');
}

export function checkEnums(row: MockCsvRow): Finding[] {
  const findings: Finding[] = [];

  const skill = normalizeEnumCell(row.skill);
  const subSkill = normalizeEnumCell(row.sub_skill);
  const questionType = normalizeEnumCell(row.question_type);
  const examType = isBlank(row.exam_type) ? '' : normalizeEnumCell(row.exam_type);

  if (!(SKILLS as readonly string[]).includes(skill)) {
    findings.push(makeFinding('SKILL_INVALID', 'row', `skill is "${row.skill}", which is not one of ${SKILLS.join(' | ')}.`, {
      line: row.line,
      column: 'skill',
    }));
  }

  if (!(SUB_SKILLS as readonly string[]).includes(subSkill)) {
    findings.push(
      makeFinding('SUB_SKILL_INVALID', 'row', `sub_skill is "${row.sub_skill}", which is not one of ${SUB_SKILLS.join(' | ')}.`, {
        line: row.line,
        column: 'sub_skill',
      }),
    );
  }

  // exam_type blank is allowed (defaults to IELTS at the DB layer); only a
  // non-blank, invalid value is an error.
  if (examType !== '' && !(EXAM_TYPES as readonly string[]).includes(examType)) {
    findings.push(
      makeFinding('EXAM_TYPE_INVALID', 'row', `exam_type is "${row.exam_type}", which is not one of ${EXAM_TYPES.join(' | ')}.`, {
        line: row.line,
        column: 'exam_type',
      }),
    );
  }

  if (!(QUESTION_TYPES as readonly string[]).includes(questionType)) {
    findings.push(
      makeFinding(
        'QUESTION_TYPE_INVALID',
        'row',
        `question_type is "${row.question_type}", which is not one of ${QUESTION_TYPES.join(' | ')}.`,
        { line: row.line, column: 'question_type' },
      ),
    );
    return findings; // Can't check skill/question_type agreement without a valid type.
  }

  if ((SKILLS as readonly string[]).includes(skill)) {
    const allowed = VALID_QUESTION_TYPES_BY_SKILL[skill as Skill];
    if (!allowed.includes(questionType as QuestionType)) {
      findings.push(
        makeFinding(
          'QUESTION_TYPE_SKILL_MISMATCH',
          'row',
          `question_type ${questionType} is not valid for skill ${skill}. ${skill} allows only: ${allowed.join(', ')}.`,
          { line: row.line, column: 'question_type' },
        ),
      );
    }
  }

  return findings;
}

/** task_type is required for WRITING_PROMPT/SPEAKING_PROMPT, disallowed otherwise. */
export function checkTaskType(row: MockCsvRow): Finding[] {
  const questionType = normalizeEnumCell(row.question_type);
  const allowed = TASK_TYPES_BY_QUESTION_TYPE[questionType as QuestionType];
  const at = { line: row.line, column: 'task_type' };

  if (allowed === undefined) {
    if (!isBlank(row.task_type)) {
      return [makeFinding('TASK_TYPE_NOT_ALLOWED', 'row', `task_type "${row.task_type}" is set, but ${questionType} rows don't use one.`, at)];
    }
    return [];
  }

  if (isBlank(row.task_type)) {
    return [makeFinding('TASK_TYPE_REQUIRED', 'row', `task_type is empty, but ${questionType} rows require one of: ${allowed.join(', ')}.`, at)];
  }
  if (!allowed.includes(row.task_type.trim())) {
    return [makeFinding('TASK_TYPE_INVALID', 'row', `task_type is "${row.task_type}", which is not one of ${allowed.join(', ')} for ${questionType}.`, at)];
  }
  return [];
}

// ---------------------------------------------------------------------------
// MCQ options + correct_answer
// ---------------------------------------------------------------------------

export function checkMcqOptions(row: MockCsvRow): Finding[] {
  const at = { line: row.line, column: 'options' };

  if (isBlank(row.options)) {
    return [makeFinding('OPTIONS_EMPTY', 'row', 'options is empty, but question_type is MCQ.', at)];
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(row.options);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return [makeFinding('OPTIONS_NOT_JSON', 'row', `options is not valid JSON (${message}). Raw value: ${truncate(row.options)}`, at)];
  }

  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return [
      makeFinding(
        'OPTIONS_NOT_OBJECT',
        'row',
        `options must be a JSON object like {"A":"...","B":"...","C":"...","D":"..."}, but parsed to ` +
          `${describeJsonType(parsed)}. Raw value: ${truncate(row.options)}`,
        at,
      ),
    ];
  }

  const findings: Finding[] = [];
  const obj = parsed as Record<string, unknown>;
  const keys = Object.keys(obj);
  const missing = OPTION_KEYS.filter(k => !keys.includes(k));
  const extra = keys.filter(k => !(OPTION_KEYS as readonly string[]).includes(k));

  if (missing.length > 0 || extra.length > 0) {
    findings.push(
      makeFinding(
        'OPTIONS_KEYS_WRONG',
        'row',
        `options must have exactly the keys A, B, C, D. Missing: [${missing.join(', ') || 'none'}]. Extra: [${extra.join(', ') || 'none'}].`,
        at,
      ),
    );
  }

  const usableTexts = new Map<OptionKey, string>();
  for (const key of OPTION_KEYS) {
    if (!keys.includes(key)) continue;
    const value = obj[key];
    if (typeof value !== 'string') {
      findings.push(makeFinding('OPTION_VALUE_NOT_STRING', 'row', `options.${key} must be a string but is ${describeJsonType(value)}.`, at));
      continue;
    }
    if (isBlank(value)) {
      findings.push(makeFinding('OPTION_VALUE_EMPTY', 'row', `options.${key} is empty.`, at));
      continue;
    }
    usableTexts.set(key, normalizeOptionText(value));
  }

  const byText = new Map<string, OptionKey[]>();
  for (const [key, text] of usableTexts) {
    const group = byText.get(text);
    if (group) group.push(key);
    else byText.set(text, [key]);
  }
  for (const [text, group] of byText) {
    if (group.length > 1) {
      findings.push(
        makeFinding(
          'OPTION_TEXT_DUPLICATE',
          'row',
          `options ${group.join(' and ')} have the same text ("${truncate(text, 60)}"), so the question has fewer than 4 distinct answers.`,
          at,
        ),
      );
    }
  }

  return findings;
}

/** MockQuestion's correct_answer is a Json column — quoted JSON string, e.g. "A". */
export function checkMcqCorrectAnswer(row: MockCsvRow): Finding[] {
  const at = { line: row.line, column: 'correct_answer' };
  const raw = row.correct_answer;

  if (isBlank(raw)) {
    return [makeFinding('CORRECT_ANSWER_EMPTY', 'row', 'correct_answer is empty, but question_type is MCQ.', at)];
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw.trim());
  } catch {
    return [
      makeFinding(
        'CORRECT_ANSWER_NOT_A_KEY',
        'row',
        `correct_answer is ${truncate(raw, 40)}, which is not valid JSON. It must be a quoted JSON string, e.g. "A".`,
        at,
      ),
    ];
  }

  if (typeof parsed !== 'string' || !(OPTION_KEYS as readonly string[]).includes(parsed)) {
    return [
      makeFinding('CORRECT_ANSWER_NOT_A_KEY', 'row', `correct_answer is ${truncate(raw, 20)}, but must be a JSON string, one of ${OPTION_KEYS.join(', ')}.`, at),
    ];
  }

  return [];
}

export function answerLetterOf(row: MockCsvRow): OptionKey | null {
  try {
    const parsed: unknown = JSON.parse(row.correct_answer.trim());
    if (typeof parsed === 'string' && (OPTION_KEYS as readonly string[]).includes(parsed)) return parsed as OptionKey;
  } catch {
    /* handled by checkMcqCorrectAnswer */
  }
  return null;
}

// ---------------------------------------------------------------------------
// TFNG correct_answer
// ---------------------------------------------------------------------------

export function checkTfngCorrectAnswer(row: MockCsvRow): Finding[] {
  const at = { line: row.line, column: 'correct_answer' };
  const raw = row.correct_answer.trim();

  if (isBlank(raw)) {
    return [makeFinding('CORRECT_ANSWER_EMPTY', 'row', 'correct_answer is empty, but question_type is TFNG.', at)];
  }

  let letter = raw.toUpperCase();
  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed === 'string') letter = parsed.toUpperCase();
  } catch {
    /* bare T/F/NG is also accepted for TFNG, unlike MCQ */
  }

  if (!['T', 'F', 'NG'].includes(letter)) {
    return [makeFinding('CORRECT_ANSWER_NOT_A_KEY', 'row', `correct_answer is "${raw}", but TFNG must be one of T, F, NG.`, at)];
  }
  if (!isBlank(row.options)) {
    return [makeFinding('OPTIONS_PRESENT_BUT_NOT_ALLOWED', 'row', 'options is filled in, but TFNG rows must leave it blank.', {
      line: row.line,
      column: 'options',
    })];
  }
  return [];
}

// ---------------------------------------------------------------------------
// Prompt rows (WRITING_PROMPT / SPEAKING_PROMPT)
// ---------------------------------------------------------------------------

export function checkPromptRow(row: MockCsvRow): Finding[] {
  if (!isBlank(row.options) || !isBlank(row.correct_answer)) {
    return [
      makeFinding(
        'OPTIONS_PRESENT_BUT_NOT_ALLOWED',
        'row',
        `${normalizeEnumCell(row.question_type)} rows must leave options and correct_answer blank — this row has one filled in.`,
        { line: row.line, column: 'options' },
      ),
    ];
  }
  return [];
}

// ---------------------------------------------------------------------------
// Free text
// ---------------------------------------------------------------------------

export function checkText(row: MockCsvRow): Finding[] {
  const findings: Finding[] = [];

  if (isBlank(row.prompt_text)) {
    findings.push(makeFinding('PROMPT_TEXT_EMPTY', 'row', 'prompt_text is empty.', { line: row.line, column: 'prompt_text' }));
  }

  const type = normalizeEnumCell(row.question_type);
  if ((type === 'MCQ' || type === 'TFNG') && isBlank(row.explanation)) {
    findings.push(makeFinding('EXPLANATION_EMPTY', 'row', 'explanation is empty.', { line: row.line, column: 'explanation' }));
  }

  return findings;
}

// ---------------------------------------------------------------------------
// The credit-language heuristic — WARNING ONLY (ported from drills unchanged)
// ---------------------------------------------------------------------------

const CREDIT_PATTERNS: readonly RegExp[] = [
  /\b[Oo]nly\s+(?:[Oo]ption|[Cc]hoice)\s*\(?([A-D])\)?\b/g,
  /\b(?:[Oo]ption|[Cc]hoice)\s*\(?([A-D])\)?\s+is\s+(?:the\s+)?(?:[Cc]orrect|[Rr]ight)\b/g,
  /\b(?:[Tt]he\s+)?[Cc]orrect\s+[Aa]nswer\s+is\s+(?:[Oo]ption|[Cc]hoice)?\s*\(?([A-D])\)?\b/g,
  /\b[Cc]orrect\s+[Aa]nswer\s*:\s*(?:[Oo]ption|[Cc]hoice)?\s*\(?([A-D])\)?\b/g,
  /\b[Oo]nly\s+\(?([A-D])\)?\s+is\s+(?:the\s+)?[Cc]orrect\b/g,
  /\b\(?([A-D])\)?\s+is\s+the\s+(?:[Cc]orrect|[Rr]ight)\s+[Aa]nswer\b/g,
];

const HEDGE_RE = /\b(?:[Ww]ould|[Cc]ould|[Mm]ight|[Mm]ay|[Uu]nless|[Hh]ypothetic\w*)\b/;

function sentencesOf(text: string): string[] {
  return text.split(/(?<=[.!?])\s+/);
}

export function creditedLetters(explanation: string): Set<OptionKey> {
  const found = new Set<OptionKey>();
  for (const sentence of sentencesOf(explanation)) {
    if (HEDGE_RE.test(sentence)) continue;
    for (const pattern of CREDIT_PATTERNS) {
      pattern.lastIndex = 0;
      for (const match of sentence.matchAll(pattern)) {
        const letter = match[1];
        if (letter) found.add(letter as OptionKey);
      }
    }
  }
  return found;
}

export function checkExplanationCredit(row: MockCsvRow): Finding[] {
  if (normalizeEnumCell(row.question_type) !== 'MCQ') return [];
  const stored = answerLetterOf(row);
  if (stored === null || isBlank(row.explanation)) return [];

  const credited = creditedLetters(row.explanation);
  if (credited.size !== 1) return [];

  const [letter] = [...credited];
  if (letter === stored) return [];

  return [
    makeFinding(
      'EXPLANATION_CREDITS_OTHER_LETTER',
      'row',
      `NEEDS HUMAN REVIEW: correct_answer is "${stored}", but the explanation appears to credit option ${letter} as correct.`,
      { line: row.line, column: 'explanation' },
    ),
  ];
}

// ---------------------------------------------------------------------------
// Cross-row: duplicate prompts
// ---------------------------------------------------------------------------

function optionSignature(rawOptions: string): string {
  if (isBlank(rawOptions)) return '';
  try {
    const parsed = JSON.parse(rawOptions);
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) return collapseWhitespace(rawOptions);
    return Object.values(parsed as Record<string, unknown>)
      .map(v => normalizeOptionText(String(v)))
      .sort()
      .join(' ');
  } catch {
    return collapseWhitespace(rawOptions);
  }
}

export function findDuplicatePrompts(rows: MockCsvRow[]): Map<number, Finding> {
  const rowNumber = rowNumberMap(rows);
  const byNormalized = new Map<string, MockCsvRow[]>();

  for (const row of rows) {
    if (isBlank(row.prompt_text)) continue;
    const key = normalizeForDuplicateCheck(row.prompt_text) + '' + optionSignature(row.options);
    const group = byNormalized.get(key);
    if (group) group.push(row);
    else byNormalized.set(key, [row]);
  }

  const findings = new Map<number, Finding>();
  for (const group of byNormalized.values()) {
    if (group.length < 2) continue;
    const numbers = group.map(r => rowNumber.get(r.line));
    for (const row of group) {
      const others = numbers.filter(n => n !== rowNumber.get(row.line));
      findings.set(
        row.line,
        makeFinding(
          'PROMPT_DUPLICATE',
          'row',
          `the same prompt_text AND options appear ${group.length} times in this file (row(s) ${numbers.join(', ')}); this row duplicates row(s) ${others.join(', ')}.`,
          { line: row.line, column: 'prompt_text' },
        ),
      );
    }
  }

  return findings;
}

// ---------------------------------------------------------------------------
// source_key
// ---------------------------------------------------------------------------

export function checkSourceKey(row: MockCsvRow, bucket: BucketPair | null): Finding[] {
  if (row.source_key === undefined) return [];

  const at = { line: row.line, column: SOURCE_KEY_HEADER };
  const raw = row.source_key;

  if (isBlank(raw)) {
    return [
      makeFinding(
        'SOURCE_KEY_MISSING',
        'row',
        `${SOURCE_KEY_HEADER} is empty. Every row in a tagged file must have one — re-run the key-assignment tool on this file.`,
        at,
      ),
    ];
  }

  const parsed = parseSourceKey(raw);
  if (parsed === null) {
    return [
      makeFinding(
        'SOURCE_KEY_MALFORMED',
        'row',
        `${SOURCE_KEY_HEADER} is "${truncate(raw, 60)}", which is not a valid key. Expected mock_{skill}_{sub_skill}_{question_type}_{###}. Do not hand-edit this column.`,
        at,
      ),
    ];
  }

  if (bucket !== null && !keyMatchesBucket(parsed, bucket)) {
    return [
      makeFinding(
        'SOURCE_KEY_BUCKET_MISMATCH',
        'row',
        `${SOURCE_KEY_HEADER} "${raw}" encodes ${parsed.skill}/${parsed.sub_skill}, but this file's bucket is ${bucket.skill}/${bucket.sub_skill}.`,
        at,
      ),
    ];
  }

  return [];
}

export function checkSourceKeyColumnPresent(loaded: { hasSourceKeyColumn: boolean }): Finding[] {
  if (loaded.hasSourceKeyColumn) return [];
  return [
    makeFinding(
      'SOURCE_KEY_COLUMN_ABSENT',
      'file',
      `File has no ${SOURCE_KEY_HEADER} column, so nothing can be imported from it idempotently. Run the key-assignment tool first.`,
    ),
  ];
}

export function findDuplicateSourceKeys(rows: MockCsvRow[]): Map<number, Finding> {
  const rowNumber = rowNumberMap(rows);
  const byKey = new Map<string, MockCsvRow[]>();

  for (const row of rows) {
    if (row.source_key === undefined || isBlank(row.source_key)) continue;
    const key = row.source_key.trim();
    const group = byKey.get(key);
    if (group) group.push(row);
    else byKey.set(key, [row]);
  }

  const findings = new Map<number, Finding>();
  for (const [key, group] of byKey) {
    if (group.length < 2) continue;
    const numbers = group.map(r => rowNumber.get(r.line));
    for (const row of group) {
      const others = numbers.filter(n => n !== rowNumber.get(row.line));
      findings.set(
        row.line,
        makeFinding(
          'SOURCE_KEY_DUPLICATE',
          'row',
          `${SOURCE_KEY_HEADER} "${key}" appears ${group.length} times in this file (row(s) ${numbers.join(', ')}); this row duplicates row(s) ${others.join(', ')}.`,
          { line: row.line, column: SOURCE_KEY_HEADER },
        ),
      );
    }
  }

  return findings;
}

// ---------------------------------------------------------------------------
// Bucket consistency — (skill, sub_skill) only, no difficulty
// ---------------------------------------------------------------------------

export function determineBucket(rows: MockCsvRow[]): { bucket: BucketPair | null; findings: Finding[] } {
  if (rows.length === 0) return { bucket: null, findings: [] };

  const rowNumber = rowNumberMap(rows);
  const counts = new Map<string, { pair: BucketPair; rows: MockCsvRow[] }>();
  for (const row of rows) {
    const pair: BucketPair = {
      skill: normalizeEnumCell(row.skill),
      sub_skill: normalizeEnumCell(row.sub_skill),
    };
    const key = `${pair.skill}/${pair.sub_skill}`;
    const entry = counts.get(key);
    if (entry) entry.rows.push(row);
    else counts.set(key, { pair, rows: [row] });
  }

  const sorted = [...counts.entries()].sort((a, b) => b[1].rows.length - a[1].rows.length);
  const [majorityKey, majority] = sorted[0];
  const findings: Finding[] = [];

  if (sorted.length > 1) {
    for (const [key, entry] of sorted.slice(1)) {
      const numbers = entry.rows.map(r => rowNumber.get(r.line));
      findings.push(
        makeFinding(
          'BUCKET_NOT_UNIFORM',
          'bucket',
          `A file must contain exactly one (skill, sub_skill) bucket. Most rows say ${majorityKey} ` +
            `(${majority.rows.length} row(s)), but ${entry.rows.length} row(s) say ${key} — row(s) ${numbers.join(', ')}.`,
        ),
      );
    }
  }

  return { bucket: majority.pair, findings };
}

/**
 * No-op: sub_skill is one shared pool valid for every skill (confirmed
 * against real data), so there's currently no illegal (skill, sub_skill)
 * pair. Kept for structural parity with drills/IA and in case a real
 * per-skill restriction is introduced later.
 */
export function checkBucketPair(_bucket: BucketPair): Finding[] {
  return [];
}

export function checkBucketAgainstFilename(fileName: string, bucket: BucketPair): Finding[] {
  const words = filenameWords(fileName);
  const findings: Finding[] = [];

  if (!wordsPresent(words, bucket.skill)) {
    const other = SKILLS.find(s => s !== bucket.skill && wordsPresent(words, s));
    findings.push(
      makeFinding(
        'BUCKET_FILENAME_MISMATCH',
        'bucket',
        `Rows say skill ${bucket.skill}, but the filename does not contain that word` + (other ? ` — it says ${other}.` : '.'),
      ),
    );
  }

  if (!wordsPresent(words, bucket.sub_skill)) {
    const contradicting = SUB_SKILLS.filter(s => s !== bucket.sub_skill && wordsPresent(words, s));
    if (contradicting.length > 0) {
      findings.push(
        makeFinding(
          'BUCKET_FILENAME_MISMATCH',
          'bucket',
          `Every row says sub_skill ${bucket.sub_skill}, but the filename says ${contradicting.join('/')}.`,
        ),
      );
    } else {
      findings.push(
        makeFinding(
          'BUCKET_FILENAME_UNDETERMINED',
          'bucket',
          `Rows say sub_skill ${bucket.sub_skill}, but the filename names no sub-skill, so the two cannot be cross-checked.`,
        ),
      );
    }
  }

  return findings;
}

export function checkRowCount(actual: number, expected: number): Finding[] {
  if (actual === expected) return [];
  return [
    makeFinding(
      'ROW_COUNT_MISMATCH',
      'file',
      `File has ${actual} data row(s) but ${expected} were expected. Re-run with --expected ${actual} if this batch is legitimately a different size.`,
    ),
  ];
}

// ---------------------------------------------------------------------------
// Passage / audio grouping — looser than IA's: standalone knowledge-check
// rows (no passage_id, no audio_url) are valid, not an error. READING rows
// group by passage_id; LISTENING rows group by audio_url instead (real data
// leaves passage_id blank on LISTENING rows).
// ---------------------------------------------------------------------------

export interface GroundingGroup {
  kind: 'passage' | 'audio';
  key: string;
  rows: MockCsvRow[];
}

export function groupByGrounding(rows: MockCsvRow[]): { groups: GroundingGroup[]; ungrouped: MockCsvRow[] } {
  const order: string[] = [];
  const byKey = new Map<string, GroundingGroup>();
  const ungrouped: MockCsvRow[] = [];

  for (const row of rows) {
    const type = normalizeEnumCell(row.question_type);
    if (type !== 'MCQ' && type !== 'TFNG') continue; // prompt rows are handled separately

    const skill = normalizeEnumCell(row.skill);
    if (skill === 'READING' && !isBlank(row.passage_id)) {
      const key = `passage:${row.passage_id.trim()}`;
      if (!byKey.has(key)) {
        byKey.set(key, { kind: 'passage', key: row.passage_id.trim(), rows: [] });
        order.push(key);
      }
      byKey.get(key)!.rows.push(row);
    } else if (skill === 'LISTENING' && !isBlank(row.audio_url)) {
      const key = `audio:${row.audio_url.trim()}`;
      if (!byKey.has(key)) {
        byKey.set(key, { kind: 'audio', key: row.audio_url.trim(), rows: [] });
        order.push(key);
      }
      byKey.get(key)!.rows.push(row);
    } else {
      ungrouped.push(row);
    }
  }

  return { groups: order.map(k => byKey.get(k)!), ungrouped };
}

/** Every row in a passage group must share identical passage_text. Audio groups are consistent by construction (grouped on audio_url itself). */
export function checkGroundingConsistency(group: GroundingGroup): Finding[] {
  if (group.kind !== 'passage') return [];

  const findings: Finding[] = [];
  for (const row of group.rows) {
    if (isBlank(row.passage_text)) {
      findings.push(
        makeFinding('PASSAGE_TEXT_MISSING', 'row', 'passage_text is empty, but every row sharing this passage_id needs one.', {
          line: row.line,
          column: 'passage_text',
        }),
      );
    }
  }

  const distinct = new Set(group.rows.map(r => collapseWhitespace(r.passage_text)).filter(v => v !== ''));
  if (distinct.size > 1) {
    findings.push(
      makeFinding(
        'PASSAGE_TEXT_INCONSISTENT',
        'bucket',
        `passage_id "${group.key}" has ${distinct.size} different passage_text values across its rows — every row sharing a passage_id must describe the same passage.`,
      ),
    );
  }
  return findings;
}

/** A standalone knowledge-check row (no passage_id/audio_url group) must leave both fields blank. */
export function checkStandaloneRow(row: MockCsvRow): Finding[] {
  const findings: Finding[] = [];
  if (!isBlank(row.passage_text)) {
    findings.push(makeFinding('PASSAGE_TEXT_PRESENT_BUT_NOT_ALLOWED', 'row', 'passage_text is filled in, but this row is not part of a passage group.', {
      line: row.line,
      column: 'passage_text',
    }));
  }
  if (!isBlank(row.audio_url)) {
    findings.push(makeFinding('AUDIO_URL_PRESENT_BUT_NOT_ALLOWED', 'row', 'audio_url is filled in, but this row is not part of an audio group.', {
      line: row.line,
      column: 'audio_url',
    }));
  }
  return findings;
}

/** Rows outside a passage/audio group (prompt-only WRITING/SPEAKING rows) must leave both fields blank. */
export function checkNoPassageAudioForPromptRow(row: MockCsvRow): Finding[] {
  const findings: Finding[] = [];
  if (!isBlank(row.passage_text)) {
    findings.push(makeFinding('PASSAGE_TEXT_PRESENT_BUT_NOT_ALLOWED', 'row', 'passage_text is filled in, but this question_type does not use one.', {
      line: row.line,
      column: 'passage_text',
    }));
  }
  if (!isBlank(row.audio_url)) {
    findings.push(makeFinding('AUDIO_URL_PRESENT_BUT_NOT_ALLOWED', 'row', 'audio_url is filled in, but this question_type does not use one.', {
      line: row.line,
      column: 'audio_url',
    }));
  }
  return findings;
}

export type { Skill };
