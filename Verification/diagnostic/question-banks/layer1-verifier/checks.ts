/**
 * Every structural check Layer 1 performs on a diagnostic staging batch.
 *
 * Same discipline as the drills checks this is adapted from: every check
 * returns Findings and never throws, and severity is decided once in
 * shared/types.ts so no individual check can escalate its own warning.
 */

import {
  LEVELS,
  OPTION_KEYS,
  QUESTION_TYPES,
  SKILLS,
  TFNG_ANSWERS,
  VALID_QUESTION_TYPES_BY_SKILL,
  makeFinding,
  type DiagnosticCsvRow,
  type Finding,
  type Level,
  type OptionKey,
  type QuestionType,
  type Skill,
} from '../shared/types';
import {
  collapseWhitespace,
  isBlank,
  normalizeForDuplicateCheck,
  normalizeOptionText,
} from '../../../drills/question-banks/shared/normalize';

// ---------------------------------------------------------------------------
// Enums
// ---------------------------------------------------------------------------

export function normalizeEnumCell(input: string): string {
  return collapseWhitespace(input).toUpperCase().replace(/\s+/g, '_');
}

export function checkEnums(row: DiagnosticCsvRow): Finding[] {
  const findings: Finding[] = [];
  const skill = normalizeEnumCell(row.skill);
  const level = normalizeEnumCell(row.level);
  const questionType = normalizeEnumCell(row.question_type);

  if (!(SKILLS as readonly string[]).includes(skill)) {
    findings.push(
      makeFinding('SKILL_INVALID', 'row', `skill is "${row.skill}", which is not one of ${SKILLS.join(' | ')}.`, {
        line: row.line,
        column: 'skill',
      }),
    );
  }

  if (!(LEVELS as readonly string[]).includes(level)) {
    findings.push(
      makeFinding('LEVEL_INVALID', 'row', `level is "${row.level}", which is not one of ${LEVELS.join(' | ')}.`, {
        line: row.line,
        column: 'level',
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
          `question_type ${questionType} is not valid for skill ${skill}. ${skill} allows only: ` +
            `${allowed.join(', ')}. (Confirmed live: LISTENING is MCQ-only, READING allows ` +
            `MCQ and TFNG, WRITING/SPEAKING are prompt-only.)`,
          { line: row.line, column: 'question_type' },
        ),
      );
    }
  }

  return findings;
}

// ---------------------------------------------------------------------------
// MCQ options + correct_answer (question_type = MCQ)
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

export function checkMcqOptions(row: DiagnosticCsvRow): Finding[] {
  const at = { line: row.line, column: 'options' };

  if (isBlank(row.options)) {
    return [makeFinding('OPTIONS_EMPTY', 'row', 'options is empty, but question_type is MCQ.', at)];
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(row.options);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return [
      makeFinding('OPTIONS_NOT_JSON', 'row', `options is not valid JSON (${message}). Raw value: ${truncate(row.options)}`, at),
    ];
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
        `options must have exactly the keys A, B, C, D. Missing: [${missing.join(', ') || 'none'}]. ` +
          `Extra: [${extra.join(', ') || 'none'}].`,
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
          `options ${group.join(' and ')} have the same text ("${truncate(text, 60)}"), so the question has ` +
            `fewer than 4 distinct answers.`,
          at,
        ),
      );
    }
  }

  return findings;
}

/**
 * `correct_answer` is a plain varchar in the live table (confirmed: `"B"`,
 * not drills' JSON-string-in-a-Json-column `"\"A\""`) — so this is simpler
 * than the drills equivalent: no JSON parsing, just a direct membership check.
 */
export function checkMcqCorrectAnswer(row: DiagnosticCsvRow): Finding[] {
  const at = { line: row.line, column: 'correct_answer' };
  const raw = row.correct_answer.trim();

  if (isBlank(raw)) {
    return [makeFinding('CORRECT_ANSWER_EMPTY', 'row', 'correct_answer is empty, but question_type is MCQ.', at)];
  }
  if (!(OPTION_KEYS as readonly string[]).includes(raw.toUpperCase())) {
    return [
      makeFinding('CORRECT_ANSWER_NOT_A_KEY', 'row', `correct_answer is "${raw}", but must be one of ${OPTION_KEYS.join(', ')}.`, at),
    ];
  }
  return [];
}

export function answerLetterOf(row: DiagnosticCsvRow): OptionKey | null {
  const raw = row.correct_answer.trim().toUpperCase();
  return (OPTION_KEYS as readonly string[]).includes(raw) ? (raw as OptionKey) : null;
}

// ---------------------------------------------------------------------------
// TFNG correct_answer (question_type = TFNG)
// ---------------------------------------------------------------------------

export function checkTfngCorrectAnswer(row: DiagnosticCsvRow): Finding[] {
  const at = { line: row.line, column: 'correct_answer' };
  const raw = row.correct_answer.trim().toUpperCase();

  if (isBlank(raw)) {
    return [makeFinding('CORRECT_ANSWER_EMPTY', 'row', 'correct_answer is empty, but question_type is TFNG.', at)];
  }
  if (!(TFNG_ANSWERS as readonly string[]).includes(raw)) {
    return [
      makeFinding('CORRECT_ANSWER_NOT_A_KEY', 'row', `correct_answer is "${raw}", but TFNG must be one of ${TFNG_ANSWERS.join(', ')}.`, at),
    ];
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

const MIN_WORDS_FLOOR = 50;
const MIN_WORDS_CEILING = 400;

export function checkPromptRow(row: DiagnosticCsvRow, questionType: QuestionType): Finding[] {
  const findings: Finding[] = [];

  if (!isBlank(row.options) || !isBlank(row.correct_answer)) {
    findings.push(
      makeFinding(
        'OPTIONS_PRESENT_BUT_NOT_ALLOWED',
        'row',
        `${questionType} rows must leave options and correct_answer blank — this row has one filled in.`,
        { line: row.line, column: 'options' },
      ),
    );
  }

  if (questionType === 'WRITING_PROMPT') {
    const at = { line: row.line, column: 'min_words' };
    if (isBlank(row.min_words)) {
      findings.push(makeFinding('MIN_WORDS_MISSING', 'row', 'min_words is required for WRITING_PROMPT rows.', at));
    } else {
      const n = Number(row.min_words);
      if (!Number.isInteger(n) || n < MIN_WORDS_FLOOR || n > MIN_WORDS_CEILING) {
        findings.push(
          makeFinding(
            'MIN_WORDS_INVALID',
            'row',
            `min_words is "${row.min_words}", but must be a whole number between ${MIN_WORDS_FLOOR} and ${MIN_WORDS_CEILING}.`,
            at,
          ),
        );
      }
    }
  } else if (!isBlank(row.min_words)) {
    // Confirmed live: min_words is always null for SPEAKING_PROMPT rows.
    findings.push(
      makeFinding('MIN_WORDS_PRESENT_BUT_NOT_ALLOWED', 'row', 'min_words is filled in, but SPEAKING_PROMPT rows must leave it blank.', {
        line: row.line,
        column: 'min_words',
      }),
    );
  }

  return findings;
}

// ---------------------------------------------------------------------------
// Free text
// ---------------------------------------------------------------------------

export function checkText(row: DiagnosticCsvRow): Finding[] {
  if (isBlank(row.prompt_text)) {
    return [makeFinding('PROMPT_TEXT_EMPTY', 'row', 'prompt_text is empty.', { line: row.line, column: 'prompt_text' })];
  }
  return [];
}

// ---------------------------------------------------------------------------
// Cross-row: duplicate prompts (within a file)
// ---------------------------------------------------------------------------

function rowNumberMap(rows: DiagnosticCsvRow[]): Map<number, number> {
  const map = new Map<number, number>();
  rows.forEach((row, i) => map.set(row.line, i + 1));
  return map;
}

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

export function findDuplicatePrompts(rows: DiagnosticCsvRow[]): Map<number, Finding> {
  const rowNumber = rowNumberMap(rows);
  const byNormalized = new Map<string, DiagnosticCsvRow[]>();

  for (const row of rows) {
    if (isBlank(row.prompt_text)) continue;
    const key = normalizeForDuplicateCheck(row.prompt_text) + '' + optionSignature(row.options);
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
          `the same prompt_text AND options appear ${group.length} times in this file ` +
            `(row(s) ${numbers.join(', ')}); this row duplicates row(s) ${others.join(', ')}.`,
          { line: row.line, column: 'prompt_text' },
        ),
      );
    }
  }

  return findings;
}

// ---------------------------------------------------------------------------
// Set-level: set_id, sequence, and passage/audio/transcript consistency
// ---------------------------------------------------------------------------

export interface SetGroup {
  setId: string;
  rows: DiagnosticCsvRow[];
}

/** Group rows by set_id, in file order. Rows with a blank set_id are their own findings, not grouped. */
export function groupBySetId(rows: DiagnosticCsvRow[]): { groups: SetGroup[]; findings: Finding[] } {
  const findings: Finding[] = [];
  const order: string[] = [];
  const bySet = new Map<string, DiagnosticCsvRow[]>();

  for (const row of rows) {
    if (isBlank(row.set_id)) {
      findings.push(makeFinding('SET_ID_MISSING', 'row', 'set_id is empty — every row must belong to a set.', { line: row.line, column: 'set_id' }));
      continue;
    }
    const key = row.set_id.trim();
    if (!bySet.has(key)) {
      bySet.set(key, []);
      order.push(key);
    }
    bySet.get(key)!.push(row);
  }

  return { groups: order.map(setId => ({ setId, rows: bySet.get(setId)! })), findings };
}

/** Sequence must be 1..N with no gaps or duplicates within a set. */
export function checkSequence(group: SetGroup): Finding[] {
  const findings: Finding[] = [];
  const parsed = group.rows.map(row => ({ row, n: Number(row.sequence) }));

  for (const { row, n } of parsed) {
    if (!Number.isInteger(n) || n < 1) {
      findings.push(
        makeFinding('SEQUENCE_INVALID', 'row', `sequence is "${row.sequence}", but must be a positive whole number.`, {
          line: row.line,
          column: 'sequence',
        }),
      );
    }
  }

  const valid = parsed.filter(p => Number.isInteger(p.n) && p.n >= 1).map(p => p.n).sort((a, b) => a - b);
  const expected = valid.map((_, i) => i + 1);
  const sequential = valid.length === group.rows.length && valid.every((n, i) => n === expected[i]);

  if (!sequential && valid.length === group.rows.length) {
    findings.push(
      makeFinding(
        'SEQUENCE_NOT_SEQUENTIAL',
        'set',
        `set "${group.setId}" has sequence values [${valid.join(', ')}], but they must run 1..${group.rows.length} ` +
          `with no gaps or duplicates.`,
      ),
    );
  }

  return findings;
}

/**
 * Every row in a set must agree on skill/level (a set can't straddle two
 * batches), and on whichever of passage_text/audio_file/transcript its skill
 * actually uses — confirmed live: every real Reading set has exactly one
 * distinct passage_text, every real Listening set exactly one audio_url.
 */
export function checkSetConsistency(group: SetGroup): Finding[] {
  const findings: Finding[] = [];
  if (group.rows.length === 0) return findings;

  const skill = normalizeEnumCell(group.rows[0].skill);
  const level = normalizeEnumCell(group.rows[0].level);

  for (const row of group.rows) {
    if (normalizeEnumCell(row.skill) !== skill || normalizeEnumCell(row.level) !== level) {
      findings.push(
        makeFinding(
          'SET_IDENTITY_MISMATCH',
          'set',
          `set "${group.setId}" is not internally consistent — row at line ${row.line} says ` +
            `${row.skill}/${row.level}, but other rows in this set disagree.`,
          { line: row.line },
        ),
      );
    }
  }

  if (skill === 'READING') {
    findings.push(...checkSharedField(group, 'passage_text', 'PASSAGE_TEXT_MISSING', 'PASSAGE_TEXT_INCONSISTENT'));
  }
  if (skill === 'LISTENING') {
    findings.push(...checkSharedField(group, 'audio_file', 'AUDIO_FILE_MISSING', 'AUDIO_FILE_INCONSISTENT'));
    findings.push(...checkSharedField(group, 'transcript', 'TRANSCRIPT_MISSING', 'TRANSCRIPT_INCONSISTENT'));
  }

  return findings;
}

function checkSharedField(
  group: SetGroup,
  field: 'passage_text' | 'audio_file' | 'transcript',
  missingCode: Extract<Finding['code'], 'PASSAGE_TEXT_MISSING' | 'AUDIO_FILE_MISSING' | 'TRANSCRIPT_MISSING'>,
  inconsistentCode: Extract<Finding['code'], 'PASSAGE_TEXT_INCONSISTENT' | 'AUDIO_FILE_INCONSISTENT' | 'TRANSCRIPT_INCONSISTENT'>,
): Finding[] {
  const findings: Finding[] = [];

  for (const row of group.rows) {
    if (isBlank(row[field])) {
      findings.push(makeFinding(missingCode, 'row', `${field} is empty, but every ${group.rows[0].skill} row needs one.`, { line: row.line, column: field }));
    }
  }

  const distinct = new Set(group.rows.map(r => collapseWhitespace(r[field])).filter(v => v !== ''));
  if (distinct.size > 1) {
    findings.push(
      makeFinding(
        inconsistentCode,
        'set',
        `set "${group.setId}" has ${distinct.size} different ${field} values across its rows — every row in one ` +
          `set must describe the same ${field === 'passage_text' ? 'passage' : field === 'audio_file' ? 'recording' : 'transcript'}.`,
      ),
    );
  }

  return findings;
}

export type { Level, QuestionType, Skill };
