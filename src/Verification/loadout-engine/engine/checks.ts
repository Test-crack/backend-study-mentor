/**
 * Every structural check the engine performs, with the data supplied by a
 * loadout and the algorithms kept here.
 *
 * Each check returns Findings and never throws. Severity is never decided here —
 * it comes from SEVERITY_BY_CODE — so a check physically cannot escalate its own
 * warning into an import-blocking failure.
 *
 * Message prose is derived from loadout data where it can be. A few are authored
 * strings — the forks word identical codes differently.
 */

import { makeFinding, type Finding, type FindingCode } from './findings';
import type { ColumnVariant, Loadout, LoadoutColumn, WhenClause } from '../loadout/schema';
import type { Bucket, ParsedSourceKey, SourceKeyGrammar } from './sourceKey';
import { keyMatchesBucket } from './sourceKey';
import type { LoadedRow } from './csvLoad';
import {
  collapseWhitespace,
  filenameWords,
  isBlank,
  normalizeForDuplicateCheck,
  normalizeOptionText,
  wordsPresent,
} from '../../drills/question-banks/shared/normalize';

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

const code = (raw: string): FindingCode => raw as FindingCode;

export function normalizeEnumCell(input: string): string {
  return collapseWhitespace(input).toUpperCase().replace(/\s+/g, '_');
}

function cellOf(row: LoadedRow, column: string): string {
  return row.values[column] ?? '';
}

/** True when the row satisfies a `when` clause (absent clause always matches). */
export function matchesWhen(row: LoadedRow, clause: WhenClause | undefined): boolean {
  if (!clause) return true;
  return clause.in.includes(normalizeEnumCell(cellOf(row, clause.column)));
}

/** The variant that applies to this row, or null when none does. */
function variantFor(column: LoadoutColumn, row: LoadedRow): ColumnVariant | null {
  if (!column.variants) return column;
  return column.variants.find(v => matchesWhen(row, v.when)) ?? null;
}

function rowNumberMap(rows: LoadedRow[]): Map<number, number> {
  const map = new Map<number, number>();
  rows.forEach((row, i) => map.set(row.line, i + 1));
  return map;
}

// ---------------------------------------------------------------------------
// Enum cells
// ---------------------------------------------------------------------------

export function checkEnums(row: LoadedRow, loadout: Loadout): Finding[] {
  const findings: Finding[] = [];
  const byName = new Map(loadout.columns.map(c => [c.name, c]));
  const order = loadout.enumOrder ?? loadout.columns.map(c => c.name);

  for (const name of order) {
    const column = byName.get(name);
    if (!column || column.kind !== 'enum') continue;
    if (!matchesWhen(row, column.appliesWhen)) continue;

    const raw = cellOf(row, name);
    if (column.blankAllowed && isBlank(raw)) continue;
    if ((column.members ?? []).includes(normalizeEnumCell(raw))) continue;

    findings.push(
      makeFinding(
        code(column.invalidCode!),
        'row',
        `${name} is "${raw}", which is not one of ${(column.members ?? []).join(' | ')}.`,
        { line: row.line, column: name },
      ),
    );
  }

  // A cross-column constraint checked per row, not per bucket: Mock's
  // question_type must be one the row's skill actually offers. Skipped when
  // either side is already invalid — checkEnums has reported that, and a second
  // complaint about the same cell is noise.
  const allowList = loadout.rowAllowList;
  if (allowList) {
    const keyColumn = byName.get(allowList.keyColumn);
    const valueColumn = byName.get(allowList.valueColumn);
    const keyValue = normalizeEnumCell(cellOf(row, allowList.keyColumn));
    const value = normalizeEnumCell(cellOf(row, allowList.valueColumn));

    const keyValid = (keyColumn?.members ?? []).includes(keyValue);
    const valueValid = (valueColumn?.members ?? []).includes(value);
    const allowed = allowList.allowed[keyValue];

    if (keyValid && valueValid && allowed && !allowed.includes(value)) {
      findings.push(
        makeFinding(
          code(allowList.code),
          'row',
          `${allowList.valueColumn} ${value} is not valid for ${allowList.keyColumn} ${keyValue}. ` +
            `${keyValue} allows only: ${allowed.join(', ')}.`,
          { line: row.line, column: allowList.valueColumn },
        ),
      );
    }
  }

  return findings;
}

// ---------------------------------------------------------------------------
// Conditional columns (Mock's task_type)
// ---------------------------------------------------------------------------

export function checkConditionalColumns(row: LoadedRow, loadout: Loadout): Finding[] {
  const findings: Finding[] = [];

  for (const conditional of loadout.conditionalColumns ?? []) {
    const by = normalizeEnumCell(cellOf(row, conditional.byColumn));
    const allowed = conditional.allowed[by];
    const raw = cellOf(row, conditional.column);
    const at = { line: row.line, column: conditional.column };

    if (allowed === undefined) {
      if (!isBlank(raw)) {
        findings.push(
          makeFinding(
            code(conditional.codes.notAllowed),
            'row',
            `${conditional.column} "${raw}" is set, but ${by} rows don't use one.`,
            at,
          ),
        );
      }
      continue;
    }

    if (isBlank(raw)) {
      findings.push(
        makeFinding(
          code(conditional.codes.required),
          'row',
          `${conditional.column} is empty, but ${by} rows require one of: ${allowed.join(', ')}.`,
          at,
        ),
      );
    } else if (!allowed.includes(raw.trim())) {
      findings.push(
        makeFinding(
          code(conditional.codes.invalid),
          'row',
          `${conditional.column} is "${raw}", which is not one of ${allowed.join(', ')} for ${by}.`,
          at,
        ),
      );
    }
  }

  return findings;
}

// ---------------------------------------------------------------------------
// Structured columns
// ---------------------------------------------------------------------------

function checkJsonObject(row: LoadedRow, column: LoadoutColumn, variant: ColumnVariant): Finding[] {
  const codes = variant.codes!;
  const requiredKeys = variant.requiredKeys ?? [];
  const raw = cellOf(row, column.name);
  const at = { line: row.line, column: column.name };

  if (isBlank(raw)) {
    return [makeFinding(code(codes.empty!), 'row', emptyMessage(column, variant, row), at)];
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return [
      makeFinding(
        code(codes.notJson!),
        'row',
        `${column.name} is not valid JSON (${message}). Raw value: ${truncate(raw)}`,
        at,
      ),
    ];
  }

  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    const shape = `{${requiredKeys.map(k => `"${k}":"..."`).join(',')}}`;
    return [
      makeFinding(
        code(codes.notObject!),
        'row',
        `${column.name} must be a JSON object like ${shape}, ` +
          `but parsed to ${describeJsonType(parsed)}. Raw value: ${truncate(raw)}`,
        at,
      ),
    ];
  }

  const findings: Finding[] = [];
  const obj = parsed as Record<string, unknown>;
  const keys = Object.keys(obj);
  const missing = requiredKeys.filter(k => !keys.includes(k));
  const extra = keys.filter(k => !requiredKeys.includes(k));

  if (missing.length > 0 || extra.length > 0) {
    findings.push(
      makeFinding(
        code(codes.keysWrong!),
        'row',
        `${column.name} must have exactly the keys ${requiredKeys.join(', ')}. ` +
          `Missing: [${missing.join(', ') || 'none'}]. Extra: [${extra.join(', ') || 'none'}].`,
        at,
      ),
    );
  }

  const usableTexts = new Map<string, string>();
  for (const key of requiredKeys) {
    if (!keys.includes(key)) continue;
    const value = obj[key];

    if (typeof value !== 'string') {
      findings.push(
        makeFinding(
          code(codes.valueNotString!),
          'row',
          `${column.name}.${key} must be a string but is ${describeJsonType(value)}.`,
          at,
        ),
      );
      continue;
    }

    if (variant.requireNonEmptyValues && isBlank(value)) {
      findings.push(makeFinding(code(codes.valueEmpty!), 'row', `${column.name}.${key} is empty.`, at));
      continue;
    }

    usableTexts.set(key, normalizeOptionText(value));
  }

  // Two options with the same text make the question unanswerable or a giveaway.
  if (variant.requireUniqueValues) {
    const byText = new Map<string, string[]>();
    for (const [key, text] of usableTexts) {
      const group = byText.get(text);
      if (group) group.push(key);
      else byText.set(text, [key]);
    }
    for (const [text, group] of byText) {
      if (group.length > 1) {
        findings.push(
          makeFinding(
            code(codes.valueDuplicate!),
            'row',
            `${column.name} ${group.join(' and ')} have the same text ("${truncate(text, 60)}"), ` +
              `so the question has fewer than ${requiredKeys.length} distinct answers.`,
            at,
          ),
        );
      }
    }
  }

  return findings;
}

/** Prose for a blank required cell, which the forks word differently. */
function emptyMessage(column: LoadoutColumn, variant: ColumnVariant, row: LoadedRow): string {
  if (!variant.when) return `${column.name} is empty.`;
  const by = normalizeEnumCell(cellOf(row, variant.when.column));
  return `${column.name} is empty, but ${variant.when.column} is ${by}.`;
}

function checkJsonStringEnum(row: LoadedRow, column: LoadoutColumn, variant: ColumnVariant): Finding[] {
  const codes = variant.codes!;
  const allowed = variant.allowed ?? [];
  const raw = cellOf(row, column.name);
  const at = { line: row.line, column: column.name };

  if (isBlank(raw)) {
    return [makeFinding(code(codes.empty!), 'row', emptyMessage(column, variant, row), at)];
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw.trim());
  } catch {
    const notJson = codes.notJson ?? codes.notAllowed!;
    // The hint replaces the closing period rather than following it.
    const hint = variant.notJsonHint ? variant.notJsonHint.replace('{first}', allowed[0] ?? '') : '.';
    return [
      makeFinding(
        code(notJson),
        'row',
        `${column.name} is ${truncate(raw, 40)}, which is not valid JSON. ` +
          `It must be a quoted JSON string, e.g. "${allowed[0]}"${hint}`,
        at,
      ),
    ];
  }

  if (typeof parsed !== 'string') {
    const notString = codes.notString ?? codes.notAllowed!;
    return [
      makeFinding(
        code(notString),
        'row',
        `${column.name} parsed to ${describeJsonType(parsed)}, but must be a JSON string ` +
          `such as "${allowed[0]}". Raw value: ${truncate(raw, 40)}`,
        at,
      ),
    ];
  }

  if (!allowed.includes(parsed)) {
    return [
      makeFinding(
        code(codes.notAllowed!),
        'row',
        `${column.name} is "${truncate(parsed, 20)}", but must be one of ${allowed.join(', ')}.`,
        at,
      ),
    ];
  }

  return [];
}

/**
 * Like json_string_enum, but a bare `T` is accepted as well as a quoted `"T"`.
 * Mock's TFNG answers appear both ways in real content and both reach the
 * database identically, so rejecting the bare form would fail valid data.
 */
function checkLooseEnum(row: LoadedRow, column: LoadoutColumn, variant: ColumnVariant): Finding[] {
  const codes = variant.codes!;
  const allowed = variant.allowed ?? [];
  const raw = cellOf(row, column.name).trim();
  const at = { line: row.line, column: column.name };

  if (isBlank(raw)) {
    return [makeFinding(code(codes.empty!), 'row', emptyMessage(column, variant, row), at)];
  }

  let value = raw.toUpperCase();
  if (variant.parseJson !== false) {
    try {
      const parsed: unknown = JSON.parse(raw);
      if (typeof parsed === 'string') value = parsed.toUpperCase();
    } catch {
      /* bare form is accepted */
    }
  }

  if (!allowed.includes(value)) {
    return [
      makeFinding(
        code(codes.notAllowed!),
        'row',
        `${column.name} is "${raw}", but must be one of ${allowed.join(', ')}.`,
        at,
      ),
    ];
  }

  return [];
}

/**
 * A whole number inside inclusive bounds — Diagnostic's `min_words`, which is
 * required on WRITING_PROMPT rows and must be blank everywhere else.
 */
function checkNumber(row: LoadedRow, column: LoadoutColumn, variant: ColumnVariant): Finding[] {
  const raw = cellOf(row, column.name);
  const at = { line: row.line, column: column.name };

  if (isBlank(raw)) {
    if (!variant.missingCode) return [];
    return [
      makeFinding(
        code(variant.missingCode),
        'row',
        `${column.name} is required for ${variant.when?.in.join('/') ?? 'these'} rows.`,
        at,
      ),
    ];
  }

  const value = Number(raw);
  const min = variant.min ?? Number.NEGATIVE_INFINITY;
  const max = variant.max ?? Number.POSITIVE_INFINITY;

  if (!Number.isInteger(value) || value < min || value > max) {
    return [
      makeFinding(
        code(variant.outOfRangeCode!),
        'row',
        `${column.name} is "${raw}", but must be a whole number between ${min} and ${max}.`,
        at,
      ),
    ];
  }

  return [];
}

/** Every structured column, in declaration order, honouring applies/forbidden rules. */
export function checkStructuredColumns(row: LoadedRow, loadout: Loadout): Finding[] {
  const findings: Finding[] = [];

  for (const column of loadout.columns) {
    if (column.forbiddenWhen && matchesWhen(row, column.forbiddenWhen)) {
      if (!isBlank(cellOf(row, column.name))) {
        const by = normalizeEnumCell(cellOf(row, column.forbiddenWhen.column));
        findings.push(
          makeFinding(
            code(column.forbiddenCode!),
            'row',
            column.forbiddenMessage ??
              `${column.name} is filled in, but ${by} rows must leave it blank.`,
            { line: row.line, column: column.name },
          ),
        );
      }
      continue;
    }

    if (!matchesWhen(row, column.appliesWhen)) continue;

    const variant = variantFor(column, row);
    if (!variant) continue;

    switch (variant.kind) {
      case 'json_object':
        findings.push(...checkJsonObject(row, column, variant));
        break;
      case 'json_string_enum':
        findings.push(...checkJsonStringEnum(row, column, variant));
        break;
      case 'loose_enum':
        findings.push(...checkLooseEnum(row, column, variant));
        break;
      case 'number':
        findings.push(...checkNumber(row, column, variant));
        break;
      default:
        break;
    }
  }

  return findings;
}

// ---------------------------------------------------------------------------
// Free text
// ---------------------------------------------------------------------------

export function checkText(row: LoadedRow, loadout: Loadout): Finding[] {
  const findings: Finding[] = [];

  for (const column of loadout.columns) {
    const variant = variantFor(column, row);
    if (!variant || variant.kind !== 'text' || !variant.requireNonEmpty) continue;
    if (!matchesWhen(row, column.appliesWhen)) continue;
    if (!isBlank(cellOf(row, column.name))) continue;

    findings.push(
      makeFinding(code(variant.emptyCode!), 'row', `${column.name} is empty.`, {
        line: row.line,
        column: column.name,
      }),
    );
  }

  return findings;
}

// ---------------------------------------------------------------------------
// The credit-language heuristic — WARNING ONLY
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

export function creditedLetters(explanation: string, allowed: string[]): Set<string> {
  const found = new Set<string>();

  for (const sentence of sentencesOf(explanation)) {
    if (HEDGE_RE.test(sentence)) continue;
    for (const pattern of CREDIT_PATTERNS) {
      pattern.lastIndex = 0;
      for (const match of sentence.matchAll(pattern)) {
        const letter = match[1];
        if (letter && allowed.includes(letter)) found.add(letter);
      }
    }
  }

  return found;
}

/** The stored answer for the credit check, or null when unusable. */
function storedAnswerOf(row: LoadedRow, column: LoadoutColumn, allowed: string[]): string | null {
  try {
    const parsed: unknown = JSON.parse(cellOf(row, column.name).trim());
    if (typeof parsed === 'string' && allowed.includes(parsed)) return parsed;
  } catch {
    /* reported by the column's own check */
  }
  return null;
}

export function checkExplanationCredit(row: LoadedRow, loadout: Loadout): Finding[] {
  const config = loadout.warnings?.explanationCredit;
  if (!config) return [];
  if (!matchesWhen(row, config.appliesWhen)) return [];

  const answerColumn = loadout.columns.find(c => c.name === config.answerColumn);
  if (!answerColumn) return [];

  const stored = storedAnswerOf(row, answerColumn, config.optionKeys);
  const explanation = cellOf(row, config.explanationColumn);
  if (stored === null || isBlank(explanation)) return [];

  const credited = creditedLetters(explanation, config.optionKeys);

  // More than one credited letter means ambiguous phrasing rather than a wrong
  // answer (often a two-part explanation), so stay quiet instead of guessing.
  if (credited.size !== 1) return [];

  const [letter] = [...credited];
  if (letter === stored) return [];

  const message =
    config.message
      ?.replace('{answerColumn}', config.answerColumn)
      .replace('{stored}', stored)
      .replace('{letter}', letter) ??
    `NEEDS HUMAN REVIEW: ${config.answerColumn} is "${stored}", but the explanation appears to ` +
      `credit option ${letter} as correct. This is a heuristic and is often a false ` +
      `positive — read the explanation before changing anything.`;

  return [
    makeFinding('EXPLANATION_CREDITS_OTHER_LETTER', 'row', message, {
      line: row.line,
      column: config.explanationColumn,
    }),
  ];
}

// ---------------------------------------------------------------------------
// Cross-row duplicates
// ---------------------------------------------------------------------------

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
      .join(' ');
  } catch {
    return collapseWhitespace(rawOptions);
  }
}

export function findDuplicatePrompts(rows: LoadedRow[], loadout: Loadout): Map<number, Finding> {
  const rowNumber = rowNumberMap(rows);
  const byNormalized = new Map<string, LoadedRow[]>();
  const parts = loadout.duplicateIdentity;
  const leadColumn = parts[0]?.column;

  for (const row of rows) {
    if (leadColumn && isBlank(cellOf(row, leadColumn))) continue;

    const key = parts
      .map(part => {
        const raw = cellOf(row, part.column);
        return part.normalize === 'optionSignature'
          ? optionSignature(raw)
          : normalizeForDuplicateCheck(raw);
      })
      // Separator cannot occur in CSV text, so the boundary is unambiguous.
      .join('');

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
          `the same ${parts.map(p => p.column).join(' AND ')} appear ${group.length} times in this file ` +
            `(row(s) ${numbers.join(', ')}); this row duplicates row(s) ${others.join(', ')}.`,
          { line: row.line, column: leadColumn },
        ),
      );
    }
  }

  return findings;
}

export function findDuplicateSourceKeys(rows: LoadedRow[], loadout: Loadout): Map<number, Finding> {
  const rowNumber = rowNumberMap(rows);
  const byKey = new Map<string, LoadedRow[]>();

  for (const row of rows) {
    if (row.sourceKey === undefined || isBlank(row.sourceKey)) continue;
    const key = row.sourceKey.trim();
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
          `${loadout.sourceKeyColumn} "${key}" appears ${group.length} times in this file ` +
            `(row(s) ${numbers.join(', ')}); this row duplicates row(s) ${others.join(', ')}. ` +
            `Only one of them would survive an import.`,
          { line: row.line, column: loadout.sourceKeyColumn },
        ),
      );
    }
  }

  return findings;
}

// ---------------------------------------------------------------------------
// source_key
// ---------------------------------------------------------------------------

export function checkSourceKey(
  row: LoadedRow,
  bucket: Bucket | null,
  loadout: Loadout,
  grammar: SourceKeyGrammar,
): Finding[] {
  if (row.sourceKey === undefined) return [];

  const columnName = loadout.sourceKeyColumn;
  const at = { line: row.line, column: columnName };
  const raw = row.sourceKey;

  if (isBlank(raw)) {
    return [
      makeFinding(
        'SOURCE_KEY_MISSING',
        'row',
        `${columnName} is empty. Every row in a tagged file must have one — ` +
          `re-run the key-assignment tool on this file to fill the blanks.`,
        at,
      ),
    ];
  }

  const parsed = grammar.parse(raw);
  if (parsed === null) {
    const spec = loadout.sourceKey!;
    const shape = [spec.prefix, ...spec.segments.map(s => `{${s}}`), `{${'#'.repeat(spec.pad)}}`].join('_');
    const example = spec.exampleForMessage ? `, e.g. ${spec.exampleForMessage}` : '';
    return [
      makeFinding(
        'SOURCE_KEY_MALFORMED',
        'row',
        `${columnName} is "${truncate(raw, 60)}", which is not a valid key. ` +
          `Expected ${shape}${example}. ` +
          `Do not hand-edit this column — it is generated.`,
        at,
      ),
    ];
  }

  if (bucket !== null && !keyMatchesBucket(loadout, parsed, bucket)) {
    return [describeBucketMismatch(parsed, bucket, loadout, raw, at)];
  }

  return [];
}

function describeBucketMismatch(
  parsed: ParsedSourceKey,
  bucket: Bucket,
  loadout: Loadout,
  raw: string,
  at: { line: number; column: string },
): Finding {
  const dims = loadout.bucket?.dimensions ?? [];
  const keySide = dims.map(d => parsed.bucket[d]).join('/');
  const fileSide = dims.map(d => bucket[d]).join('/');

  return makeFinding(
    'SOURCE_KEY_BUCKET_MISMATCH',
    'row',
    `${loadout.sourceKeyColumn} "${raw}" encodes ${keySide}, but this file's bucket is ` +
      `${fileSide}. A key belongs to the question it was issued for, so this row ` +
      `was probably copied in from another file — importing it would overwrite that ` +
      `other question.`,
    at,
  );
}

export function checkSourceKeyColumnPresent(
  loaded: { hasSourceKeyColumn: boolean },
  loadout: Loadout,
): Finding[] {
  if (loaded.hasSourceKeyColumn) return [];
  return [
    makeFinding(
      'SOURCE_KEY_COLUMN_ABSENT',
      'file',
      `File has no ${loadout.sourceKeyColumn} column, so nothing can be imported from it ` +
        `idempotently. Run the key-assignment tool on it first.`,
    ),
  ];
}

// ---------------------------------------------------------------------------
// Bucket consistency
// ---------------------------------------------------------------------------

export function determineBucket(
  rows: LoadedRow[],
  loadout: Loadout,
): { bucket: Bucket | null; findings: Finding[] } {
  if (rows.length === 0) return { bucket: null, findings: [] };

  const dims = loadout.bucket?.dimensions ?? [];
  const rowNumber = rowNumberMap(rows);
  const counts = new Map<string, { bucket: Bucket; rows: LoadedRow[] }>();

  for (const row of rows) {
    const bucket: Bucket = {};
    for (const d of dims) bucket[d] = normalizeEnumCell(cellOf(row, d));
    const key = dims.map(d => bucket[d]).join('/');

    const entry = counts.get(key);
    if (entry) entry.rows.push(row);
    else counts.set(key, { bucket, rows: [row] });
  }

  // Stable sort: ties resolve to first-insertion order, so the counts map must
  // be built in row order. A different bucket cascades into every filename,
  // folder and source_key finding.
  const sorted = [...counts.entries()].sort((a, b) => b[1].rows.length - a[1].rows.length);
  const [majorityKey, majority] = sorted[0];
  const findings: Finding[] = [];

  if (sorted.length > 1) {
    const label = `(${dims.join(', ')})`;
    for (const [key, entry] of sorted.slice(1)) {
      const numbers = entry.rows.map(r => rowNumber.get(r.line));
      findings.push(
        makeFinding(
          'BUCKET_NOT_UNIFORM',
          'bucket',
          `A file must contain exactly one ${label} bucket. ` +
            `Most rows say ${majorityKey} (${majority.rows.length} row(s)), but ` +
            `${entry.rows.length} row(s) say ${key} — row(s) ${numbers.join(', ')}.`,
        ),
      );
    }
  }

  return { bucket: majority.bucket, findings };
}

export function checkBucketAllowList(bucket: Bucket, loadout: Loadout): Finding[] {
  const allowList = loadout.bucket?.allowList;
  if (!allowList) return [];

  const keyValue = bucket[allowList.keyDimension];
  const allowed = allowList.allowed[keyValue];

  // An absent key means the per-row enum check already reported it.
  if (!allowed) return [];

  const value = bucket[allowList.valueDimension];
  if (allowed.includes(value)) return [];

  return [
    makeFinding(
      code(allowList.invalidCode),
      'bucket',
      `(${keyValue}, ${value}) is not a valid ${allowList.keyDimension}/` +
        `${allowList.valueDimension.replace('_', '-')} combination. ` +
        `${keyValue} allows only: ${allowed.join(', ')}.`,
    ),
  ];
}

export function checkBucketAgainstFilename(
  fileName: string,
  bucket: Bucket,
  loadout: Loadout,
): Finding[] {
  const words = filenameWords(fileName);
  const findings: Finding[] = [];
  const showWords = loadout.filenameShowWords !== false;
  const wordList = showWords ? ` Filename words: [${[...words].join(', ')}]` : '';

  for (const check of loadout.filenameChecks) {
    const dimension = check.dimension;
    const member = bucket[dimension];
    if (wordsPresent(words, member)) continue;

    const column = loadout.columns.find(c => c.name === dimension);
    const members = column?.members ?? [];

    if (check.onMissing === 'nameOther') {
      const other = members.find(m => m !== member && wordsPresent(words, m));
      findings.push(
        makeFinding(
          'BUCKET_FILENAME_MISMATCH',
          'bucket',
          `Rows say ${dimension} ${member}, but the filename does not contain that word` +
            (other ? ` — it says ${other}.` : '.') +
            wordList,
        ),
      );
      continue;
    }

    // Distinguish "the filename names a different member" (a contradiction) from
    // "it names none at all" (ambiguous — the file just needs a clearer name).
    const contradicting = members.filter(m => m !== member && wordsPresent(words, m));

    if (contradicting.length > 0) {
      findings.push(
        makeFinding(
          'BUCKET_FILENAME_MISMATCH',
          'bucket',
          `Every row says ${dimension} ${member}, but the filename says ` +
            `${contradicting.join('/')}. Either the whole file is mislabeled content, or the ` +
            `filename is wrong — check the questions themselves before importing.`,
        ),
      );
    } else {
      findings.push(
        makeFinding(
          'BUCKET_FILENAME_UNDETERMINED',
          'bucket',
          `Rows say ${dimension} ${member}, but the filename names no ` +
            `${dimension.replace('_', '-')}, so ` +
            `the two cannot be cross-checked. Rename the file to include ` +
            `${member.replace('_', ' ')}.` +
            wordList,
        ),
      );
    }
  }

  return findings;
}

export function checkBucketAgainstFolder(
  folderMember: string | null,
  bucket: Bucket,
  loadout: Loadout,
): Finding[] {
  const folderCheck = loadout.folderCheck;
  if (!folderCheck) return [];

  const member = bucket[folderCheck.dimension];
  if (folderMember === null || folderMember === member) return [];

  return [
    makeFinding(
      code(folderCheck.code),
      'bucket',
      `Every row says ${folderCheck.dimension} ${member}, but the file sits in the ` +
        `${folderMember.toLowerCase()}/ folder. Either it is filed in the wrong place or the ` +
        `rows carry the wrong ${folderCheck.dimension} — check the questions before importing.`,
    ),
  ];
}

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
