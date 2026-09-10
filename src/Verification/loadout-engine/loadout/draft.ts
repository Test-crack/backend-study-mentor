/**
 * Expands what an admin describes in the panel into a full loadout.
 *
 * The Loadout type wants finding codes per column, a check order, duplicate
 * rules — none of which a content admin should have to decide. A draft carries
 * just columns and their rules; this fills in the rest.
 *
 * Drafts use the generic COLUMN_* codes. The four IELTS loadouts are not drafts
 * — they reproduce their fork's exact codes, which reports depend on.
 */

import type { Loadout, LoadoutColumn, ColumnVariant } from './schema';

/** What the panel sends. Deliberately small. */
export interface DraftColumn {
  name: string;
  /**
   * Admin-facing vocabulary, not the engine's:
   *   text    free text
   *   choice  must be one of a fixed list
   *   number  a whole number, optionally within a range
   *   options multiple-choice answer options, as JSON
   *   answer  the correct answer, one of a fixed list
   */
  kind: 'text' | 'choice' | 'number' | 'options' | 'answer';
  /** Blank is a problem. */
  required?: boolean;
  /** choice / answer: the permitted values. */
  values?: string[];
  /** number: inclusive bounds. */
  min?: number;
  max?: number;
  /** options: which keys every row must carry. Defaults to A-D. */
  optionKeys?: string[];
  /**
   * Limits the column to some rows — "options only when question_type is MCQ".
   * Other rows skip it, and are flagged if they fill it in anyway.
   */
  onlyWhen?: { column: string; values: string[] };
}

export interface LoadoutDraft {
  id: string;
  label: string;
  columns: DraftColumn[];
  expectedRows: number;
  /**
   * Columns every row in one file must agree on — for IELTS drills that's
   * skill/sub_skill/difficulty. Leave empty when a file is just a batch.
   */
  bucketColumns?: string[];
  /** Cross-check that the filename mentions each bucket column's value. */
  checkFilename?: boolean;
  /** Set to give rows permanent ids, e.g. "oet" -> oet_listening_a_001. */
  keyPrefix?: string;
  keyColumns?: string[];
}

export const DRAFT_MARKER = '__draft';

/** True when this loadout was authored in the panel rather than by a developer. */
export function isDraftLoadout(loadout: Loadout & { [DRAFT_MARKER]?: unknown }): boolean {
  return Boolean(loadout[DRAFT_MARKER]);
}

function columnFor(draft: DraftColumn): LoadoutColumn {
  const base: Partial<LoadoutColumn> = { name: draft.name };

  if (draft.onlyWhen) {
    base.appliesWhen = { column: draft.onlyWhen.column, in: draft.onlyWhen.values };
    // Placeholder — completeForbiddenWhen fills in the real complement below.
    base.forbiddenWhen = { column: draft.onlyWhen.column, in: ['__NOT__'] };
  }

  switch (draft.kind) {
    case 'choice':
      return {
        ...base,
        kind: 'enum',
        members: draft.values ?? [],
        invalidCode: 'COLUMN_VALUE_INVALID',
        blankAllowed: draft.required !== true,
      } as LoadoutColumn;

    case 'number':
      return {
        ...base,
        kind: 'number',
        min: draft.min,
        max: draft.max,
        missingCode: draft.required ? 'COLUMN_NUMBER_MISSING' : undefined,
        outOfRangeCode: 'COLUMN_NUMBER_INVALID',
      } as LoadoutColumn;

    case 'options': {
      const keys = draft.optionKeys && draft.optionKeys.length > 0 ? draft.optionKeys : ['A', 'B', 'C', 'D'];
      return {
        ...base,
        kind: 'json_object',
        requiredKeys: keys,
        requireNonEmptyValues: true,
        requireUniqueValues: true,
        codes: {
          empty: 'COLUMN_REQUIRED_EMPTY',
          notJson: 'COLUMN_JSON_INVALID',
          notObject: 'COLUMN_JSON_NOT_OBJECT',
          keysWrong: 'COLUMN_JSON_KEYS_WRONG',
          valueNotString: 'COLUMN_JSON_VALUE_INVALID',
          valueEmpty: 'COLUMN_JSON_VALUE_INVALID',
          valueDuplicate: 'COLUMN_JSON_VALUE_DUPLICATE',
        },
      } as LoadoutColumn;
    }

    case 'answer':
      return {
        ...base,
        kind: 'loose_enum',
        // No stored-format history yet, so accept both bare A and quoted "A".
        parseJson: true,
        allowed: draft.values ?? [],
        codes: {
          empty: 'COLUMN_REQUIRED_EMPTY',
          notAllowed: 'COLUMN_VALUE_INVALID',
        },
      } as LoadoutColumn;

    case 'text':
    default:
      return {
        ...base,
        kind: 'text',
        requireNonEmpty: draft.required === true,
        emptyCode: 'COLUMN_REQUIRED_EMPTY',
      } as LoadoutColumn;
  }
}

/**
 * `forbiddenWhen` is the complement of `appliesWhen` — the controlling column's
 * other values.
 */
function completeForbiddenWhen(columns: LoadoutColumn[]): void {
  const membersByName = new Map(columns.map(c => [c.name, c.members ?? []]));

  for (const column of columns) {
    if (!column.appliesWhen || !column.forbiddenWhen) continue;
    const all = membersByName.get(column.appliesWhen.column) ?? [];
    const complement = all.filter(m => !column.appliesWhen!.in.includes(m));

    if (complement.length === 0) {
      delete column.forbiddenWhen;
      delete column.forbiddenCode;
      continue;
    }

    column.forbiddenWhen = { column: column.appliesWhen.column, in: complement };
    column.forbiddenCode = 'COLUMN_NOT_ALLOWED_HERE';
    column.forbiddenMessage = `${column.name} is filled in, but only ${column.appliesWhen.in.join('/')} rows use it.`;
  }
}

export class DraftError extends Error {}

export function validateDraft(draft: LoadoutDraft): void {
  const fail = (msg: string): never => {
    throw new DraftError(msg);
  };

  if (!/^[a-z0-9-]+$/.test(draft.id ?? '')) {
    fail('The id may only contain lowercase letters, numbers and hyphens.');
  }
  if (!draft.label?.trim()) fail('Give the loadout a name.');
  if (!Array.isArray(draft.columns) || draft.columns.length === 0) fail('Add at least one column.');

  const names = new Set<string>();
  for (const column of draft.columns) {
    if (!/^[a-z0-9_]+$/.test(column.name ?? '')) {
      fail(`Column "${column.name}" — use lowercase letters, numbers and underscores only.`);
    }
    if (names.has(column.name)) fail(`Column "${column.name}" is listed twice.`);
    names.add(column.name);

    if ((column.kind === 'choice' || column.kind === 'answer') && (column.values ?? []).length === 0) {
      fail(`Column "${column.name}" needs at least one allowed value.`);
    }
    if (column.onlyWhen) {
      if (!names.has(column.onlyWhen.column) && !draft.columns.some(c => c.name === column.onlyWhen!.column)) {
        fail(`Column "${column.name}" depends on "${column.onlyWhen.column}", which isn't a column.`);
      }
      if ((column.onlyWhen.values ?? []).length === 0) {
        fail(`Column "${column.name}" — pick at least one value it applies to.`);
      }
    }
  }

  for (const name of draft.bucketColumns ?? []) {
    if (!names.has(name)) fail(`"${name}" is listed as a grouping column but isn't a column.`);
  }
  for (const name of draft.keyColumns ?? []) {
    if (!names.has(name)) fail(`"${name}" is used in the id format but isn't a column.`);
  }
  if (draft.keyPrefix && (draft.keyColumns ?? []).length === 0) {
    fail('Pick at least one column for the id format, or turn ids off.');
  }
  if (!Number.isInteger(draft.expectedRows) || draft.expectedRows < 1) {
    fail('Expected rows must be a whole number of at least 1.');
  }
}

/** Expand an admin's draft into a loadout the engine can run. */
export function expandDraft(draft: LoadoutDraft): Loadout {
  validateDraft(draft);

  const columns = draft.columns.map(columnFor);
  completeForbiddenWhen(columns);

  const bucketColumns = (draft.bucketColumns ?? []).filter(n => columns.some(c => c.name === n));
  const keyColumns = (draft.keyColumns ?? []).filter(n => columns.some(c => c.name === n));

  // A repeated prompt alone isn't a duplicate; a repeated prompt AND answer set is.
  const promptColumn =
    draft.columns.find(c => c.kind === 'text' && c.required)?.name ?? draft.columns[0].name;
  const optionsColumn = draft.columns.find(c => c.kind === 'options')?.name;

  const loadout: Loadout & { [DRAFT_MARKER]: true } = {
    [DRAFT_MARKER]: true,
    id: draft.id,
    label: draft.label.trim(),
    columns,
    sourceKeyColumn: 'source_key',
    embeddedHeaderThreshold: Math.min(4, Math.max(1, Math.ceil(columns.length / 2))),
    checkOrder: ['enums', 'text', 'structured', 'sourceKey'],
    duplicateIdentity: [
      { column: promptColumn, normalize: 'foldCase' },
      ...(optionsColumn ? ([{ column: optionsColumn, normalize: 'optionSignature' }] as const) : []),
    ],
    filenameChecks:
      draft.checkFilename && bucketColumns.length > 0
        ? bucketColumns.map(name => ({ dimension: name, onMissing: 'nameOther' as const }))
        : [],
    filenameShowWords: true,
    expectedRows: { fallback: draft.expectedRows },
    ...(bucketColumns.length > 0 ? { bucket: { dimensions: bucketColumns } } : {}),
    ...(draft.keyPrefix && keyColumns.length > 0
      ? {
          sourceKey: {
            prefix: draft.keyPrefix,
            segments: keyColumns,
            pad: 3,
            // No keys in the database yet, so lowercase is fine.
            words: Object.fromEntries(
              keyColumns.map(name => [
                name,
                Object.fromEntries(
                  (columns.find(c => c.name === name)?.members ?? []).map(m => [m, m.toLowerCase()]),
                ),
              ]),
            ),
          },
        }
      : {}),
  };

  return loadout;
}
