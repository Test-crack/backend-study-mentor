/**
 * Every structural check Layer 1 performs.
 *
 * Each check returns Findings and never throws. Severity is never decided here —
 * it comes from SEVERITY_BY_CODE in shared/types.ts — so a check physically
 * cannot escalate its own warning into an import-blocking failure.
 */

import {
  LEVELS,
  OPTION_KEYS,
  SKILLS,
  SOURCE_KEY_HEADER,
  SUB_SKILLS,
  VALID_SUB_SKILLS_BY_SKILL,
  makeFinding,
  type BucketTriple,
  type DrillCsvRow,
  type Finding,
  type Level,
  type OptionKey,
  type Skill,
  type SubSkill,
} from '../shared/types';
import { keyMatchesBucket, parseSourceKey } from '../shared/sourceKey';
import {
  collapseWhitespace,
  filenameWords,
  isBlank,
  normalizeForDuplicateCheck,
  normalizeOptionText,
  wordsPresent,
} from '../shared/normalize';
import { levelFromPath } from '../shared/drillsLayout';

// ---------------------------------------------------------------------------
// Enum cells
// ---------------------------------------------------------------------------

/**
 * Enum cells are compared case- and separator-insensitively, the same way header
 * cells are: batches disagree on `TASK_RESPONSE` vs `Task response`, and that is
 * a formatting difference, not a data error.
 */
export function normalizeEnumCell(input: string): string {
  return collapseWhitespace(input).toUpperCase().replace(/\s+/g, '_');
}

export function checkEnums(row: DrillCsvRow): Finding[] {
  const findings: Finding[] = [];

  const skill = normalizeEnumCell(row.skill);
  const subSkill = normalizeEnumCell(row.sub_skill);
  const level = normalizeEnumCell(row.level);

  if (!(SKILLS as readonly string[]).includes(skill)) {
    findings.push(
      makeFinding(
        'SKILL_INVALID',
        'row',
        `skill is "${row.skill}", which is not one of ${SKILLS.join(' | ')}.`,
        { line: row.line, column: 'skill' },
      ),
    );
  }

  if (!(SUB_SKILLS as readonly string[]).includes(subSkill)) {
    findings.push(
      makeFinding(
        'SUB_SKILL_INVALID',
        'row',
        `sub_skill is "${row.sub_skill}", which is not one of ${SUB_SKILLS.join(' | ')}.`,
        { line: row.line, column: 'sub_skill' },
      ),
    );
  }

  if (!(LEVELS as readonly string[]).includes(level)) {
    findings.push(
      makeFinding(
        'LEVEL_INVALID',
        'row',
        `level is "${row.level}", which is not one of ${LEVELS.join(' | ')}.`,
        { line: row.line, column: 'level' },
      ),
    );
  }

  return findings;
}

// ---------------------------------------------------------------------------
// options
// ---------------------------------------------------------------------------

export function checkOptions(row: DrillCsvRow): Finding[] {
  const at = { line: row.line, column: 'options' };

  if (isBlank(row.options)) {
    return [makeFinding('OPTIONS_EMPTY', 'row', 'options is empty.', at)];
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(row.options);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return [
      makeFinding(
        'OPTIONS_NOT_JSON',
        'row',
        `options is not valid JSON (${message}). Raw value: ${truncate(row.options)}`,
        at,
      ),
    ];
  }

  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return [
      makeFinding(
        'OPTIONS_NOT_OBJECT',
        'row',
        `options must be a JSON object like {"A":"...","B":"...","C":"...","D":"..."}, ` +
          `but parsed to ${describeJsonType(parsed)}. Raw value: ${truncate(row.options)}`,
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
        `options must have exactly the keys A, B, C, D. ` +
          `Missing: [${missing.join(', ') || 'none'}]. Extra: [${extra.join(', ') || 'none'}].`,
        at,
      ),
    );
  }

  // Value shape, for whichever of A-D are present.
  const usableTexts = new Map<OptionKey, string>();
  for (const key of OPTION_KEYS) {
    if (!keys.includes(key)) continue;
    const value = obj[key];

    if (typeof value !== 'string') {
      findings.push(
        makeFinding(
          'OPTION_VALUE_NOT_STRING',
          'row',
          `options.${key} must be a string but is ${describeJsonType(value)}.`,
          at,
        ),
      );
      continue;
    }

    if (isBlank(value)) {
      findings.push(
        makeFinding('OPTION_VALUE_EMPTY', 'row', `options.${key} is empty.`, at),
      );
      continue;
    }

    usableTexts.set(key, normalizeOptionText(value));
  }

  // Two options with the same text make the question either unanswerable or a
  // giveaway. Confirmed live in production, hence a hard failure.
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
          `options ${group.join(' and ')} have the same text ("${truncate(text, 60)}"), ` +
            `so the question has fewer than 4 distinct answers.`,
          at,
        ),
      );
    }
  }

  return findings;
}

// ---------------------------------------------------------------------------
// correct_answer
// ---------------------------------------------------------------------------

/**
 * `correct_answer` is a Json column, so the CSV cell must hold a JSON *string*:
 * `"A"` with the quotes. A bare `A` is not valid JSON, and one real export had
 * both forms mixed inside a single file — which is why the "not JSON" and
 * "not a string" cases get distinct codes rather than one vague complaint.
 */
export function checkCorrectAnswer(row: DrillCsvRow): Finding[] {
  const at = { line: row.line, column: 'correct_answer' };
  const raw = row.correct_answer;

  if (isBlank(raw)) {
    return [makeFinding('CORRECT_ANSWER_EMPTY', 'row', 'correct_answer is empty.', at)];
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw.trim());
  } catch {
    return [
      makeFinding(
        'CORRECT_ANSWER_NOT_JSON',
        'row',
        `correct_answer is ${truncate(raw, 40)}, which is not valid JSON. ` +
          `It must be a quoted JSON string, e.g. "A" — a bare A is not JSON.`,
        at,
      ),
    ];
  }

  if (typeof parsed !== 'string') {
    return [
      makeFinding(
        'CORRECT_ANSWER_NOT_A_STRING',
        'row',
        `correct_answer parsed to ${describeJsonType(parsed)}, but must be a JSON string ` +
          `such as "A". Raw value: ${truncate(raw, 40)}`,
        at,
      ),
    ];
  }

  if (!(OPTION_KEYS as readonly string[]).includes(parsed)) {
    return [
      makeFinding(
        'CORRECT_ANSWER_NOT_A_KEY',
        'row',
        `correct_answer is "${truncate(parsed, 20)}", but must be one of ` +
          `${OPTION_KEYS.join(', ')}.`,
        at,
      ),
    ];
  }

  return [];
}

/** The validated answer letter, or null if `correct_answer` was unusable. */
export function answerLetterOf(row: DrillCsvRow): OptionKey | null {
  try {
    const parsed: unknown = JSON.parse(row.correct_answer.trim());
    if (typeof parsed === 'string' && (OPTION_KEYS as readonly string[]).includes(parsed)) {
      return parsed as OptionKey;
    }
  } catch {
    /* handled by checkCorrectAnswer */
  }
  return null;
}

// ---------------------------------------------------------------------------
// Free text
// ---------------------------------------------------------------------------

export function checkText(row: DrillCsvRow): Finding[] {
  const findings: Finding[] = [];

  if (isBlank(row.prompt_text)) {
    findings.push(
      makeFinding('PROMPT_TEXT_EMPTY', 'row', 'prompt_text is empty.', {
        line: row.line,
        column: 'prompt_text',
      }),
    );
  }

  if (isBlank(row.explanation)) {
    findings.push(
      makeFinding('EXPLANATION_EMPTY', 'row', 'explanation is empty.', {
        line: row.line,
        column: 'explanation',
      }),
    );
  }

  return findings;
}

// ---------------------------------------------------------------------------
// The credit-language heuristic — WARNING ONLY
// ---------------------------------------------------------------------------

/**
 * Patterns that *credit* a letter as the correct one.
 *
 * A broader version of this check — "the explanation mentions option X and X is
 * not the stored answer" — produced ~54 false positives in ~3,000 production
 * rows, because a good explanation routinely names the WRONG option in order to
 * explain why it is wrong ("Option A doubles the subject, which is a common
 * error"). So mere mention is not evidence of anything; only explicit crediting
 * is, and even that is a regex guessing at intent, which is why the code's
 * severity is `warn` and a human decides.
 *
 * The `i` flag is deliberately NOT used. Case-insensitivity would make `[A-D]`
 * match lowercase letters, and "only a few students" would then be read as
 * crediting option A. Keywords therefore spell out both cases explicitly while
 * the option letter stays strictly uppercase, which is how these explanations
 * actually write it.
 */
const CREDIT_PATTERNS: readonly RegExp[] = [
  // "only option B", "only choice (B)"
  /\b[Oo]nly\s+(?:[Oo]ption|[Cc]hoice)\s*\(?([A-D])\)?\b/g,
  // "option B is correct", "choice B is the right answer"
  /\b(?:[Oo]ption|[Cc]hoice)\s*\(?([A-D])\)?\s+is\s+(?:the\s+)?(?:[Cc]orrect|[Rr]ight)\b/g,
  // "the correct answer is B", "correct answer is option B"
  /\b(?:[Tt]he\s+)?[Cc]orrect\s+[Aa]nswer\s+is\s+(?:[Oo]ption|[Cc]hoice)?\s*\(?([A-D])\)?\b/g,
  // "correct answer: B"
  /\b[Cc]orrect\s+[Aa]nswer\s*:\s*(?:[Oo]ption|[Cc]hoice)?\s*\(?([A-D])\)?\b/g,
  // "only B is correct"
  /\b[Oo]nly\s+\(?([A-D])\)?\s+is\s+(?:the\s+)?[Cc]orrect\b/g,
  // "B is the correct answer"
  /\b\(?([A-D])\)?\s+is\s+the\s+(?:[Cc]orrect|[Rr]ight)\s+[Aa]nswer\b/g,
];

/**
 * Hedged and hypothetical phrasing, where naming a letter is not a claim that it
 * is the answer: "Option D would be correct if the tense were past."
 */
const HEDGE_RE = /\b(?:[Ww]ould|[Cc]ould|[Mm]ight|[Mm]ay|[Uu]nless|[Hh]ypothetic\w*)\b/;

function sentencesOf(text: string): string[] {
  return text.split(/(?<=[.!?])\s+/);
}

/** Letters the explanation explicitly credits as correct, ignoring hedged claims. */
export function creditedLetters(explanation: string): Set<OptionKey> {
  const found = new Set<OptionKey>();

  for (const sentence of sentencesOf(explanation)) {
    if (HEDGE_RE.test(sentence)) continue;
    for (const pattern of CREDIT_PATTERNS) {
      // Patterns are module-level and global, so reset before each use.
      pattern.lastIndex = 0;
      for (const match of sentence.matchAll(pattern)) {
        const letter = match[1];
        if (letter) found.add(letter as OptionKey);
      }
    }
  }

  return found;
}

export function checkExplanationCredit(row: DrillCsvRow): Finding[] {
  const stored = answerLetterOf(row);
  if (stored === null || isBlank(row.explanation)) return [];

  const credited = creditedLetters(row.explanation);

  // More than one credited letter means the phrasing is ambiguous rather than
  // wrong (often a two-part explanation), so stay quiet instead of guessing.
  if (credited.size !== 1) return [];

  const [letter] = [...credited];
  if (letter === stored) return [];

  return [
    makeFinding(
      'EXPLANATION_CREDITS_OTHER_LETTER',
      'row',
      `NEEDS HUMAN REVIEW: correct_answer is "${stored}", but the explanation appears to ` +
        `credit option ${letter} as correct. This is a heuristic and is often a false ` +
        `positive — read the explanation before changing anything.`,
      { line: row.line, column: 'explanation' },
    ),
  ];
}

// ---------------------------------------------------------------------------
// Cross-row: duplicate prompts
// ---------------------------------------------------------------------------

/**
 * Maps each row's physical CSV line to its 1-based position among this file's
 * data rows — i.e. the same "Row #" a reviewer sees in the Excel report's own
 * left-hand column, as opposed to "CSV Line" (which skips the header and any
 * blank/malformed lines). Cross-row messages ("this row duplicates ...") report
 * THIS number, because a reviewer reading the report has no reason to know the
 * file's raw line numbers, only the row they're looking at.
 */
function rowNumberMap(rows: DrillCsvRow[]): Map<number, number> {
  const map = new Map<number, number>();
  rows.forEach((row, i) => map.set(row.line, i + 1));
  return map;
}

/**
 * Canonical signature of a row's option set, used only for duplicate detection.
 *
 * The option TEXTS are what identify a question, not the letters they sit on:
 * re-keying the same four words onto different letters produces the same question,
 * so the values are normalized and sorted and the keys are discarded. Unparseable
 * JSON falls back to the raw cell — how it fails to parse is OPTIONS_NOT_JSON's
 * problem, not this check's, and a bad cell must not silently collapse into every
 * other bad cell.
 */
function optionSignature(rawOptions: string): string {
  if (isBlank(rawOptions)) return '';
  try {
    const parsed = JSON.parse(rawOptions);
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return collapseWhitespace(rawOptions);
    }
    return Object.values(parsed as Record<string, unknown>)
      .map(v => normalizeOptionText(String(v)))
      .sort()
      .join(' ');
  } catch {
    return collapseWhitespace(rawOptions);
  }
}

/**
 * Duplicate questions within one file, keyed by line. Confirmed live in
 * production, worst case the same question eight times.
 *
 * Keyed on prompt_text AND the option set, because a shared prompt alone is NOT a
 * duplicate. Whole legitimate formats reuse one instruction across every row —
 * "Select the word that does NOT belong with the others." carries 22 different word
 * sets in the intermediate WRITING/VOCABULARY bank. Keying on the prompt alone
 * reported all 22 as failures, which is both wrong and expensive: it buries the real
 * duplicates in noise and invites someone to "fix" correct content. A genuine
 * duplicate repeats the prompt AND the options.
 *
 * Returns a map so the caller can attach each finding to its own row rather than
 * reporting one file-level blob — a reviewer needs to know which rows to delete.
 */
export function findDuplicatePrompts(rows: DrillCsvRow[]): Map<number, Finding> {
  const rowNumber = rowNumberMap(rows);
  const byNormalized = new Map<string, DrillCsvRow[]>();

  for (const row of rows) {
    if (isBlank(row.prompt_text)) continue;
    const key =
      normalizeForDuplicateCheck(row.prompt_text) +
      '\u0001' + // separator: cannot occur in CSV text, so the boundary is unambiguous
      optionSignature(row.options);
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
// source_key
// ---------------------------------------------------------------------------

/**
 * Validate one row's `source_key` against the bucket the file claims.
 *
 * Rows in a file with no `source_key` column produce nothing here — untagged is a
 * legitimate state, and whether it is *acceptable* is the caller's policy decision
 * (see `checkSourceKeyColumnPresent`). Once the column exists, though, every cell
 * in it must be valid: a half-tagged file is the dangerous case, because the
 * importer would insert the tagged rows and silently have nothing to key the rest on.
 *
 * The bucket comparison is what catches a key that has drifted onto the wrong row —
 * for example a block copy-pasted between two files. A key encodes its own bucket,
 * so this needs no external state to check against.
 */
export function checkSourceKey(row: DrillCsvRow, bucket: BucketTriple | null): Finding[] {
  if (row.source_key === undefined) return [];

  const at = { line: row.line, column: SOURCE_KEY_HEADER };
  const raw = row.source_key;

  if (isBlank(raw)) {
    return [
      makeFinding(
        'SOURCE_KEY_MISSING',
        'row',
        `${SOURCE_KEY_HEADER} is empty. Every row in a tagged file must have one — ` +
          `re-run the key-assignment tool on this file to fill the blanks.`,
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
        `${SOURCE_KEY_HEADER} is "${truncate(raw, 60)}", which is not a valid key. ` +
          `Expected drill_{skill}_{sub_skill}_{level}_{###}, e.g. drill_listen_listen_beg_001. ` +
          `Do not hand-edit this column — it is generated.`,
        at,
      ),
    ];
  }

  if (bucket !== null && !keyMatchesBucket(parsed, bucket)) {
    return [
      makeFinding(
        'SOURCE_KEY_BUCKET_MISMATCH',
        'row',
        `${SOURCE_KEY_HEADER} "${raw}" encodes ${parsed.skill}/${parsed.sub_skill}/` +
          `${parsed.level}, but this file's bucket is ${bucket.skill}/${bucket.sub_skill}/` +
          `${bucket.level}. A key belongs to the question it was issued for, so this row ` +
          `was probably copied in from another file — importing it would overwrite that ` +
          `other question.`,
        at,
      ),
    ];
  }

  return [];
}

/**
 * A tagged file must be *fully* tagged, and an untagged one is only a problem when
 * the caller says keys are required (the importer does; a routine structural run
 * does not, since files are verified both before and after tagging).
 */
export function checkSourceKeyColumnPresent(loaded: {
  hasSourceKeyColumn: boolean;
}): Finding[] {
  if (loaded.hasSourceKeyColumn) return [];
  return [
    makeFinding(
      'SOURCE_KEY_COLUMN_ABSENT',
      'file',
      `File has no ${SOURCE_KEY_HEADER} column, so nothing can be imported from it ` +
        `idempotently. Run the key-assignment tool on it first.`,
    ),
  ];
}

/**
 * Duplicate keys within one file. Two rows sharing a key means an upsert would
 * apply both to the same database row: whichever came last wins and the other
 * question is silently dropped. Reported on every copy so a reviewer can see the
 * whole set at once.
 */
export function findDuplicateSourceKeys(rows: DrillCsvRow[]): Map<number, Finding> {
  const rowNumber = rowNumberMap(rows);
  const byKey = new Map<string, DrillCsvRow[]>();

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
          `${SOURCE_KEY_HEADER} "${key}" appears ${group.length} times in this file ` +
            `(row(s) ${numbers.join(', ')}); this row duplicates row(s) ${others.join(', ')}. ` +
            `Only one of them would survive an import.`,
          { line: row.line, column: SOURCE_KEY_HEADER },
        ),
      );
    }
  }

  return findings;
}

// ---------------------------------------------------------------------------
// Bucket consistency
// ---------------------------------------------------------------------------

/**
 * Determine the one (skill, sub_skill, level) triple a file claims, and report
 * any row that disagrees with it.
 *
 * The claimed triple is the most common one rather than the first row's, so that
 * a single corrupted row cannot redefine the file's identity and turn 199 good
 * rows into failures.
 */
export function determineBucket(
  rows: DrillCsvRow[],
): { bucket: BucketTriple | null; findings: Finding[] } {
  if (rows.length === 0) return { bucket: null, findings: [] };

  const rowNumber = rowNumberMap(rows);
  const counts = new Map<string, { triple: BucketTriple; rows: DrillCsvRow[] }>();
  for (const row of rows) {
    const triple: BucketTriple = {
      skill: normalizeEnumCell(row.skill),
      sub_skill: normalizeEnumCell(row.sub_skill),
      level: normalizeEnumCell(row.level),
    };
    const key = `${triple.skill}/${triple.sub_skill}/${triple.level}`;
    const entry = counts.get(key);
    if (entry) entry.rows.push(row);
    else counts.set(key, { triple, rows: [row] });
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
          `A file must contain exactly one (skill, sub_skill, level) bucket. ` +
            `Most rows say ${majorityKey} (${majority.rows.length} row(s)), but ` +
            `${entry.rows.length} row(s) say ${key} — row(s) ${numbers.join(', ')}.`,
        ),
      );
    }
  }

  return { bucket: majority.triple, findings };
}

/** The (skill, sub_skill) pair must be on the fixed allow-list. */
export function checkBucketPair(bucket: BucketTriple): Finding[] {
  const skill = bucket.skill as Skill;
  const allowed = VALID_SUB_SKILLS_BY_SKILL[skill];

  if (!allowed) {
    // An invalid skill is already reported per-row by checkEnums; nothing to add.
    return [];
  }

  if (!(allowed as readonly string[]).includes(bucket.sub_skill)) {
    return [
      makeFinding(
        'BUCKET_PAIR_INVALID',
        'bucket',
        `(${bucket.skill}, ${bucket.sub_skill}) is not a valid skill/sub-skill combination. ` +
          `${bucket.skill} allows only: ${allowed.join(', ')}.`,
      ),
    ];
  }

  return [];
}

/**
 * Check the filename agrees with what the rows claim.
 *
 * This is the check that catches the worst real bug we found: a 200-row
 * "Speaking Vocabulary" file in which every single row said PRONUNCIATION. The
 * file was internally perfectly consistent, so nothing except comparing it
 * against its own filename could have caught it.
 *
 * Filenames are matched by word *presence*, not structure, because the real
 * separator between skill and sub-skill varies across batches (`·`, `-`, one
 * space, two spaces, `_`, or nothing).
 */
export function checkBucketAgainstFilename(fileName: string, bucket: BucketTriple): Finding[] {
  const words = filenameWords(fileName);
  const findings: Finding[] = [];

  if (!wordsPresent(words, bucket.level)) {
    const otherLevel = LEVELS.find(l => l !== bucket.level && wordsPresent(words, l));
    findings.push(
      makeFinding(
        'BUCKET_FILENAME_MISMATCH',
        'bucket',
        `Rows say level ${bucket.level}, but the filename does not contain that word` +
          (otherLevel ? ` — it says ${otherLevel}.` : '.') +
          ` Filename words: [${[...words].join(', ')}]`,
      ),
    );
  }

  if (!wordsPresent(words, bucket.skill)) {
    const otherSkill = SKILLS.find(s => s !== bucket.skill && wordsPresent(words, s));
    findings.push(
      makeFinding(
        'BUCKET_FILENAME_MISMATCH',
        'bucket',
        `Rows say skill ${bucket.skill}, but the filename does not contain that word` +
          (otherSkill ? ` — it says ${otherSkill}.` : '.') +
          ` Filename words: [${[...words].join(', ')}]`,
      ),
    );
  }

  if (!wordsPresent(words, bucket.sub_skill)) {
    // Distinguish "the filename names a different sub-skill" (a contradiction —
    // one of the two is wrong and it matters which) from "the filename names no
    // sub-skill at all" (ambiguous — the file just needs a clearer name).
    const contradicting = SUB_SKILLS.filter(
      s => s !== bucket.sub_skill && wordsPresent(words, s),
    );

    if (contradicting.length > 0) {
      findings.push(
        makeFinding(
          'BUCKET_FILENAME_MISMATCH',
          'bucket',
          `Every row says sub_skill ${bucket.sub_skill}, but the filename says ` +
            `${contradicting.join('/')}. Either the whole file is mislabeled content, or the ` +
            `filename is wrong — check the questions themselves before importing.`,
        ),
      );
    } else {
      findings.push(
        makeFinding(
          'BUCKET_FILENAME_UNDETERMINED',
          'bucket',
          `Rows say sub_skill ${bucket.sub_skill}, but the filename names no sub-skill, so ` +
            `the two cannot be cross-checked. Rename the file to include ` +
            `${bucket.sub_skill.replace('_', ' ')}. Filename words: [${[...words].join(', ')}]`,
        ),
      );
    }
  }

  return findings;
}

/**
 * Check the level folder agrees with what the rows claim.
 *
 * This is the filename check's sibling: a second piece of metadata, asserted
 * independently of the file's own contents. A batch dropped into the wrong level
 * folder is exactly the kind of clerical mistake that produces a
 * perfectly-consistent, completely-wrong import.
 *
 * Files kept outside the level folders are skipped rather than guessed at.
 */
export function checkBucketAgainstFolder(filePath: string, bucket: BucketTriple): Finding[] {
  const folderLevel = levelFromPath(filePath);
  if (folderLevel === null || folderLevel === bucket.level) return [];

  return [
    makeFinding(
      'LEVEL_FOLDER_MISMATCH',
      'bucket',
      `Every row says level ${bucket.level}, but the file sits in the ` +
        `${folderLevel.toLowerCase()}/ folder. Either it is filed in the wrong place or the ` +
        `rows carry the wrong level — check the questions before importing.`,
    ),
  ];
}

/** Row count must match what the operator expects for this batch. */
export function checkRowCount(actual: number, expected: number): Finding[] {
  if (actual === expected) return [];
  return [
    makeFinding(
      'ROW_COUNT_MISMATCH',
      'file',
      `File has ${actual} data row(s) but ${expected} were expected. ` +
        (actual < expected
          ? 'A short file usually means the export was truncated or rows were dropped.'
          : 'An over-long file usually means rows were pasted in twice.') +
        ' If this batch is legitimately a different size, re-run with --expected ' +
        `${actual}.`,
    ),
  ];
}

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

export type { Level, Skill, SubSkill };
