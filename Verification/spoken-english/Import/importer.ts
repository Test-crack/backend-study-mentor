/**
 * Turning verified Spoken English drill CSV rows into `drill_questions` writes.
 *
 * Forked from Import/importer.ts (the IELTS importer) rather than parametrizing it in
 * place — see Verification/spoken-english/question-banks/shared/types.ts for why. The
 * core insert/update/unchanged planning logic is identical; what differs is:
 *
 *  - every write carries `exam_id: 'spoken_english'` (the IELTS importer relies on the
 *    column default instead, since it never had a second exam to disambiguate from);
 *  - `level` is authored as a CEFR value (a1/a2/b1/b2/c1) but the DB column only has 3
 *    buckets (BEGINNER/INTERMEDIATE/ADVANCED) — so the CEFR level is validated and used
 *    for the source_key/bucket check, then MAPPED to its DB bucket only for the actual
 *    write. The finer CEFR level is not persisted anywhere in the DB row itself; it is
 *    recoverable from source_key (e.g. `se_drill_range_b1_01` -> b1) if ever needed.
 *
 * Everything in this file is pure, same as the original: no connection, no writes, no
 * Prisma import. The CLI owns all I/O.
 *
 * ## Update behaviour: OVERWRITE (same as IELTS)
 *
 * When a `source_key` already exists and the incoming content differs, the incoming
 * content WINS — re-importing a corrected batch must apply the fix. `is_active` is the
 * one field never overwritten, so a deliberately retired question stays retired.
 */

import { normalizeEnumCell } from '../question-banks/layer1-verifier/checks';
import {
  DRILL_TYPE,
  LEVEL_TO_RECOMMENDATION_LEVEL,
  LEVELS,
  OPTION_KEYS,
  SKILLS,
  SUB_SKILLS,
  VALID_SUB_SKILLS_BY_SKILL,
  type DrillCsvRow,
  type Level,
  type Skill,
} from '../question-banks/shared/types';
import { parseSourceKey } from '../question-banks/shared/sourceKey';

/** The exam every row from this importer belongs to. Never read from the CSV. */
export const EXAM_ID = 'spoken_english';

/** The exact shape written to `drill_questions`. */
export interface ImportRow {
  source_key: string;
  skill: string;
  sub_skill: string;
  /** The DB's 3-way bucket (BEGINNER/INTERMEDIATE/ADVANCED) — NOT the CEFR level. */
  level: string;
  drill_type: string;
  prompt_text: string;
  options: Record<string, string>;
  /** A JSON string such as `"A"` — stored in a Json column, matching drill_questions. */
  correct_answer: string;
  explanation: string | null;
  exam_id: string;
  /** Source line, for error messages. Not written to the database. */
  line: number;
}

/** The columns read back from the database to decide insert vs update vs unchanged. */
export interface ExistingRow {
  source_key: string;
  skill: string;
  sub_skill: string;
  level: string;
  drill_type: string;
  prompt_text: string;
  options: unknown;
  correct_answer: unknown;
  explanation: string | null;
  exam_id: string;
}

/**
 * Convert one CSV row into a database payload, or explain why it cannot be.
 *
 * Re-validates rather than trusting the upstream Layer 1 gate, same rationale as the
 * IELTS importer: this is the last code that runs before a write.
 */
export function toImportRow(row: DrillCsvRow): { row: ImportRow } | { error: string } {
  const at = `line ${row.line}`;

  const key = row.source_key?.trim();
  if (!key) return { error: `${at}: no source_key — run the key-assignment tool first.` };

  const parsedKey = parseSourceKey(key);
  if (parsedKey === null) {
    return { error: `${at}: source_key "${key}" is not a valid key.` };
  }

  const skill = normalizeEnumCell(row.skill);
  const sub_skill = normalizeEnumCell(row.sub_skill);
  const cefrLevel = normalizeEnumCell(row.level);

  if (!(SKILLS as readonly string[]).includes(skill)) {
    return { error: `${at}: skill "${row.skill}" is not a valid enum member.` };
  }
  if (!(SUB_SKILLS as readonly string[]).includes(sub_skill)) {
    return { error: `${at}: sub_skill "${row.sub_skill}" is not a valid enum member.` };
  }
  if (!(LEVELS as readonly string[]).includes(cefrLevel)) {
    return { error: `${at}: level "${row.level}" is not a valid CEFR level (a1/a2/b1/b2/c1).` };
  }

  const allowed = VALID_SUB_SKILLS_BY_SKILL[skill as Skill];
  if (!(allowed as readonly string[]).includes(sub_skill)) {
    return { error: `${at}: (${skill}, ${sub_skill}) is not a legal combination.` };
  }

  // The key encodes its own bucket in CEFR terms, so a disagreement here means the row
  // would be written under an identity belonging to a different bucket's question.
  if (parsedKey.sub_skill !== sub_skill || parsedKey.level !== cefrLevel) {
    return {
      error:
        `${at}: source_key "${key}" encodes ${parsedKey.sub_skill}/${parsedKey.level} but ` +
        `the row is ${sub_skill}/${cefrLevel}.`,
    };
  }

  if (row.prompt_text.trim() === '') return { error: `${at}: prompt_text is empty.` };

  let options: unknown;
  try {
    options = JSON.parse(row.options);
  } catch {
    return { error: `${at}: options is not valid JSON.` };
  }
  if (options === null || typeof options !== 'object' || Array.isArray(options)) {
    return { error: `${at}: options must be a JSON object.` };
  }

  const optionObj: Record<string, string> = {};
  for (const optionKey of OPTION_KEYS) {
    const value = (options as Record<string, unknown>)[optionKey];
    if (typeof value !== 'string' || value.trim() === '') {
      return { error: `${at}: options.${optionKey} is missing or not a non-empty string.` };
    }
    optionObj[optionKey] = value;
  }
  const extra = Object.keys(options as object).filter(
    k => !(OPTION_KEYS as readonly string[]).includes(k),
  );
  if (extra.length > 0) {
    return { error: `${at}: options has unexpected key(s): ${extra.join(', ')}.` };
  }

  let answer: unknown;
  try {
    answer = JSON.parse(row.correct_answer.trim());
  } catch {
    return {
      error: `${at}: correct_answer ${row.correct_answer} is not valid JSON (a bare A is not).`,
    };
  }
  if (typeof answer !== 'string' || !(OPTION_KEYS as readonly string[]).includes(answer)) {
    return { error: `${at}: correct_answer must be one of "A" "B" "C" "D".` };
  }

  const explanation = row.explanation.trim() === '' ? null : row.explanation;
  const dbLevel = LEVEL_TO_RECOMMENDATION_LEVEL[cefrLevel as Level];

  return {
    row: {
      source_key: key,
      skill,
      sub_skill,
      level: dbLevel,
      // Never read from the CSV: drill_questions.drill_type is what the drill-serving
      // query filters on (`AND drill_type = 'MCQ'`), so it must always be exactly this.
      drill_type: DRILL_TYPE,
      prompt_text: row.prompt_text,
      options: optionObj,
      correct_answer: answer,
      explanation,
      exam_id: EXAM_ID,
      line: row.line,
    },
  };
}

// ---------------------------------------------------------------------------
// Deciding what each row does
// ---------------------------------------------------------------------------

export type RowAction = 'insert' | 'update' | 'unchanged';

export interface RowPlan {
  row: ImportRow;
  action: RowAction;
  /** Which fields differ, when the action is `update`. */
  changed: string[];
}

/** Key order is irrelevant to JSON equality, so compare a canonical form. */
function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null';
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  const entries = Object.entries(value as Record<string, unknown>).sort(([a], [b]) =>
    a < b ? -1 : a > b ? 1 : 0,
  );
  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonicalJson(v)}`).join(',')}}`;
}

/**
 * Compare an incoming row against what is already stored. `is_active` is deliberately
 * absent — see the note at the top of this file.
 */
export function planRow(row: ImportRow, existing: ExistingRow | undefined): RowPlan {
  if (existing === undefined) return { row, action: 'insert', changed: [] };

  const changed: string[] = [];
  if (existing.prompt_text !== row.prompt_text) changed.push('prompt_text');
  if (canonicalJson(existing.options) !== canonicalJson(row.options)) changed.push('options');
  if (canonicalJson(existing.correct_answer) !== canonicalJson(row.correct_answer)) {
    changed.push('correct_answer');
  }
  if ((existing.explanation ?? null) !== row.explanation) changed.push('explanation');
  if (existing.drill_type !== row.drill_type) changed.push('drill_type');

  // A bucket change under a fixed key should be impossible — toImportRow rejects a
  // key/bucket disagreement — but report it rather than writing it silently.
  if (existing.skill !== row.skill) changed.push('skill');
  if (existing.sub_skill !== row.sub_skill) changed.push('sub_skill');
  if (existing.level !== row.level) changed.push('level');
  if (existing.exam_id !== row.exam_id) changed.push('exam_id');

  return { row, action: changed.length === 0 ? 'unchanged' : 'update', changed };
}

export interface ImportPlan {
  plans: RowPlan[];
  /** Rows that could not be converted, with a reason each. */
  errors: string[];
  /** `source_key`s appearing more than once across the whole batch. */
  duplicateKeys: string[];
}

/**
 * Build the plan for a batch. A `source_key` appearing twice is fatal for the rows
 * involved — both would upsert onto one database row, so the later would overwrite the
 * earlier and one question would vanish with no error anywhere.
 */
export function planImport(
  rows: DrillCsvRow[],
  existingByKey: Map<string, ExistingRow>,
): ImportPlan {
  const plans: RowPlan[] = [];
  const errors: string[] = [];
  const seen = new Map<string, number>();
  const duplicateKeys = new Set<string>();

  for (const csvRow of rows) {
    const converted = toImportRow(csvRow);
    if ('error' in converted) {
      errors.push(converted.error);
      continue;
    }
    const { row } = converted;

    const previousLine = seen.get(row.source_key);
    if (previousLine !== undefined) {
      duplicateKeys.add(row.source_key);
      errors.push(
        `line ${row.line}: source_key "${row.source_key}" already used on line ` +
          `${previousLine} of this batch — importing both would collapse them into one row.`,
      );
      continue;
    }
    seen.set(row.source_key, row.line);

    plans.push(planRow(row, existingByKey.get(row.source_key)));
  }

  return { plans, errors, duplicateKeys: [...duplicateKeys] };
}

export interface PlanCounts {
  insert: number;
  update: number;
  unchanged: number;
}

export function countActions(plans: RowPlan[]): PlanCounts {
  const counts: PlanCounts = { insert: 0, update: 0, unchanged: 0 };
  for (const p of plans) counts[p.action] += 1;
  return counts;
}
