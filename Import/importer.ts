/**
 * Turning verified CSV rows into database writes, and deciding what each one does.
 *
 * Everything in this file is pure: it takes rows and existing database state as plain
 * objects and returns a plan. No connection, no writes, no Prisma import. The CLI owns
 * all I/O. That split is what lets the interesting logic — enum canonicalisation, JSON
 * shaping, insert-vs-update-vs-unchanged — be tested without a database.
 *
 * ## Update behaviour: OVERWRITE
 *
 * When a `source_key` already exists and the incoming content differs, the incoming
 * content WINS. This is the documented choice the brief asks for, and the reason is the
 * normal workflow: the content author fixes a wrong explanation, and re-importing should
 * apply that fix. Skipping and flagging instead would mean corrections never land.
 *
 * `is_active` is the one field NOT overwritten. If someone has deliberately retired a
 * question in the database, re-importing its text must not silently bring it back.
 */

import { normalizeEnumCell } from '../Verification/drills/question-banks/layer1-verifier/checks';
import {
  DRILL_TYPE,
  LEVELS,
  OPTION_KEYS,
  SKILLS,
  SUB_SKILLS,
  VALID_SUB_SKILLS_BY_SKILL,
  type DrillCsvRow,
  type Skill,
} from '../Verification/drills/question-banks/shared/types';
import { parseSourceKey } from '../Verification/drills/question-banks/shared/sourceKey';

/** The exact shape written to `drill_questions`. */
export interface ImportRow {
  source_key: string;
  skill: string;
  sub_skill: string;
  level: string;
  drill_type: string;
  prompt_text: string;
  options: Record<string, string>;
  /** A JSON string such as `"A"` — stored in a Json column, matching every live row. */
  correct_answer: string;
  explanation: string | null;
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
}

/**
 * Convert one CSV row into a database payload, or explain why it cannot be.
 *
 * This re-validates rather than trusting the upstream gate. Layer 1 has already checked
 * all of it, but this is the last code that runs before a write, and a silent
 * disagreement between the two would be far more expensive to debug than a duplicated
 * check is to maintain.
 *
 * Enum values are CANONICALISED, not copied. The CSV is a spreadsheet export and its
 * casing varies between batches (`Task response`, `TASK_RESPONSE`, `task_response` have
 * all appeared); the database enum accepts exactly one spelling. Writing the raw cell
 * would fail at the driver for a difference that carries no meaning.
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
  const level = normalizeEnumCell(row.level);

  if (!(SKILLS as readonly string[]).includes(skill)) {
    return { error: `${at}: skill "${row.skill}" is not a valid enum member.` };
  }
  if (!(SUB_SKILLS as readonly string[]).includes(sub_skill)) {
    return { error: `${at}: sub_skill "${row.sub_skill}" is not a valid enum member.` };
  }
  if (!(LEVELS as readonly string[]).includes(level)) {
    return { error: `${at}: level "${row.level}" is not a valid enum member.` };
  }

  const allowed = VALID_SUB_SKILLS_BY_SKILL[skill as Skill];
  if (!(allowed as readonly string[]).includes(sub_skill)) {
    return { error: `${at}: (${skill}, ${sub_skill}) is not a legal combination.` };
  }

  // The key encodes its own bucket, so a disagreement here means the row would be
  // written under an identity belonging to a different bucket's question.
  if (
    parsedKey.skill !== skill ||
    parsedKey.sub_skill !== sub_skill ||
    parsedKey.level !== level
  ) {
    return {
      error:
        `${at}: source_key "${key}" encodes ${parsedKey.skill}/${parsedKey.sub_skill}/` +
        `${parsedKey.level} but the row is ${skill}/${sub_skill}/${level}.`,
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

  return {
    row: {
      source_key: key,
      skill,
      sub_skill,
      level,
      // Never read from the CSV: it has no such column, and all 3,180 live rows are MCQ.
      drill_type: DRILL_TYPE,
      prompt_text: row.prompt_text,
      options: optionObj,
      correct_answer: answer,
      explanation,
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
 * Compare an incoming row against what is already stored.
 *
 * `is_active` is deliberately absent from the comparison and from the update — see the
 * note at the top of this file. `drill_type` IS compared, cheaply, so that a row somehow
 * stored as something other than MCQ is corrected rather than left inconsistent.
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
 * Build the plan for a batch.
 *
 * A `source_key` appearing twice is fatal for the rows involved rather than merely
 * noted: both would upsert onto one database row, so the later would overwrite the
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
