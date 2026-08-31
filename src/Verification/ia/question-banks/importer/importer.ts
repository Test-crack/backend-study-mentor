/**
 * Turning verified IA CSV rows into database writes, and deciding what each
 * one does. Pure: no connection, no Prisma import — the CLI owns all I/O.
 * Ported from Import/importer.ts (drills); Import/importer.ts itself is
 * drill-specific (imports DrillCsvRow, writes drill_type) so this is a
 * dedicated module rather than an extension of it, kept alongside the rest
 * of the IA pipeline instead of inside the top-level Import/ folder.
 *
 * Update behaviour: OVERWRITE, same as drills' importer — a re-import applies
 * a content fix. `is_active` is never overwritten, so a deliberately retired
 * question is not silently resurrected by re-importing its old CSV.
 */

import { normalizeEnumCell } from '../layer1-verifier/checks';
import {
  DIFFICULTIES,
  EXAM_TYPES,
  OPTION_KEYS,
  SKILLS,
  SUB_SKILLS,
  TFNG_ANSWERS,
  VALID_QUESTION_TYPES_BY_SKILL,
  VALID_SUB_SKILLS_BY_SKILL,
  type IACsvRow,
  type QuestionType,
  type Skill,
} from '../shared/types';
import { parseSourceKey } from '../shared/sourceKey';

/** The exact shape written to `ia_questions`. */
export interface ImportRow {
  source_key: string;
  skill: string;
  sub_skill: string;
  difficulty: string;
  question_type: string;
  passage_id: string | null;
  passage_text: string | null;
  audio_url: string | null;
  prompt_text: string;
  options: Record<string, string> | null;
  correct_answer: string | null;
  explanation: string | null;
  exam_type: string;
  /** Source line, for error messages. Not written to the database. */
  line: number;
}

export interface ExistingRow {
  source_key: string;
  skill: string;
  sub_skill: string;
  difficulty: string;
  question_type: string;
  passage_id: string | null;
  passage_text: string | null;
  audio_url: string | null;
  prompt_text: string;
  options: unknown;
  correct_answer: unknown;
  explanation: string | null;
  exam_type: string;
}

/**
 * Convert one CSV row into a database payload, or explain why it cannot be.
 * Re-validates rather than trusting Layer 1 — this is the last code that
 * runs before a write.
 */
export function toImportRow(row: IACsvRow): { row: ImportRow } | { error: string } {
  const at = `line ${row.line}`;

  const key = row.source_key?.trim();
  if (!key) return { error: `${at}: no source_key — run the key-assignment tool first.` };

  const parsedKey = parseSourceKey(key);
  if (parsedKey === null) return { error: `${at}: source_key "${key}" is not a valid key.` };

  const skill = normalizeEnumCell(row.skill);
  const subSkill = normalizeEnumCell(row.sub_skill);
  const difficulty = normalizeEnumCell(row.difficulty);
  const questionType = normalizeEnumCell(row.question_type);
  const examType = row.exam_type.trim() === '' ? 'IELTS' : normalizeEnumCell(row.exam_type);

  if (!(SKILLS as readonly string[]).includes(skill)) return { error: `${at}: skill "${row.skill}" is not a valid enum member.` };
  if (!(SUB_SKILLS as readonly string[]).includes(subSkill)) return { error: `${at}: sub_skill "${row.sub_skill}" is not a valid enum member.` };
  if (!(DIFFICULTIES as readonly string[]).includes(difficulty)) return { error: `${at}: difficulty "${row.difficulty}" is not a valid enum member.` };
  if (!(EXAM_TYPES as readonly string[]).includes(examType)) return { error: `${at}: exam_type "${row.exam_type}" is not a valid enum member.` };

  const allowedSub = VALID_SUB_SKILLS_BY_SKILL[skill as Skill];
  if (!(allowedSub as readonly string[]).includes(subSkill)) return { error: `${at}: (${skill}, ${subSkill}) is not a legal combination.` };

  const allowedTypes = VALID_QUESTION_TYPES_BY_SKILL[skill as Skill];
  if (!allowedTypes.includes(questionType as QuestionType)) return { error: `${at}: question_type ${questionType} is not valid for skill ${skill}.` };

  if (parsedKey.skill !== skill || parsedKey.sub_skill !== subSkill || parsedKey.difficulty !== difficulty) {
    return {
      error: `${at}: source_key "${key}" encodes ${parsedKey.skill}/${parsedKey.sub_skill}/${parsedKey.difficulty} but the row is ${skill}/${subSkill}/${difficulty}.`,
    };
  }

  if (row.prompt_text.trim() === '') return { error: `${at}: prompt_text is empty.` };

  let options: Record<string, string> | null = null;
  let correctAnswer: string | null = null;

  if (questionType === 'MCQ') {
    let parsedOptions: unknown;
    try {
      parsedOptions = JSON.parse(row.options);
    } catch {
      return { error: `${at}: options is not valid JSON.` };
    }
    if (parsedOptions === null || typeof parsedOptions !== 'object' || Array.isArray(parsedOptions)) {
      return { error: `${at}: options must be a JSON object.` };
    }
    const optionObj: Record<string, string> = {};
    for (const optionKey of OPTION_KEYS) {
      const value = (parsedOptions as Record<string, unknown>)[optionKey];
      if (typeof value !== 'string' || value.trim() === '') return { error: `${at}: options.${optionKey} is missing or not a non-empty string.` };
      optionObj[optionKey] = value;
    }
    options = optionObj;

    let answer: unknown;
    try {
      answer = JSON.parse(row.correct_answer.trim());
    } catch {
      return { error: `${at}: correct_answer ${row.correct_answer} is not valid JSON.` };
    }
    if (typeof answer !== 'string' || !(OPTION_KEYS as readonly string[]).includes(answer)) {
      return { error: `${at}: correct_answer must be one of "A" "B" "C" "D".` };
    }
    correctAnswer = answer;
  } else if (questionType === 'TFNG') {
    let letter = row.correct_answer.trim().toUpperCase();
    try {
      const parsed: unknown = JSON.parse(row.correct_answer.trim());
      if (typeof parsed === 'string') letter = parsed.toUpperCase();
    } catch {
      /* bare T/F/NG accepted */
    }
    if (!(TFNG_ANSWERS as readonly string[]).includes(letter)) return { error: `${at}: correct_answer must be one of T, F, NG for TFNG.` };
    correctAnswer = letter;
  }
  // WRITING_PROMPT / SPEAKING_PROMPT: options and correct_answer stay null.

  const explanation = row.explanation.trim() === '' ? null : row.explanation;
  const passageId = row.passage_id.trim() === '' ? null : row.passage_id.trim();
  const passageText = row.passage_text.trim() === '' ? null : row.passage_text;
  const audioUrl = row.audio_url.trim() === '' ? null : row.audio_url.trim();

  return {
    row: {
      source_key: key,
      skill,
      sub_skill: subSkill,
      difficulty,
      question_type: questionType,
      passage_id: passageId,
      passage_text: passageText,
      audio_url: audioUrl,
      prompt_text: row.prompt_text,
      options,
      correct_answer: correctAnswer,
      explanation,
      exam_type: examType,
      line: row.line,
    },
  };
}

export type RowAction = 'insert' | 'update' | 'unchanged';

export interface RowPlan {
  row: ImportRow;
  action: RowAction;
  changed: string[];
}

function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null';
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  const entries = Object.entries(value as Record<string, unknown>).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonicalJson(v)}`).join(',')}}`;
}

/** `is_active` is deliberately absent from the comparison and from the update. */
export function planRow(row: ImportRow, existing: ExistingRow | undefined): RowPlan {
  if (existing === undefined) return { row, action: 'insert', changed: [] };

  const changed: string[] = [];
  if (existing.prompt_text !== row.prompt_text) changed.push('prompt_text');
  if (canonicalJson(existing.options) !== canonicalJson(row.options)) changed.push('options');
  if (canonicalJson(existing.correct_answer) !== canonicalJson(row.correct_answer)) changed.push('correct_answer');
  if ((existing.explanation ?? null) !== row.explanation) changed.push('explanation');
  if ((existing.passage_id ?? null) !== row.passage_id) changed.push('passage_id');
  if ((existing.passage_text ?? null) !== row.passage_text) changed.push('passage_text');
  if ((existing.audio_url ?? null) !== row.audio_url) changed.push('audio_url');
  if (existing.question_type !== row.question_type) changed.push('question_type');
  if (existing.exam_type !== row.exam_type) changed.push('exam_type');
  if (existing.skill !== row.skill) changed.push('skill');
  if (existing.sub_skill !== row.sub_skill) changed.push('sub_skill');
  if (existing.difficulty !== row.difficulty) changed.push('difficulty');

  return { row, action: changed.length === 0 ? 'unchanged' : 'update', changed };
}

export interface ImportPlan {
  plans: RowPlan[];
  errors: string[];
  duplicateKeys: string[];
}

export function planImport(rows: IACsvRow[], existingByKey: Map<string, ExistingRow>): ImportPlan {
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
      errors.push(`line ${row.line}: source_key "${row.source_key}" already used on line ${previousLine} of this batch.`);
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
