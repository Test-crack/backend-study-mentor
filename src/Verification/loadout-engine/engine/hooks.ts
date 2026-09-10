/**
 * Checks that need real logic rather than a per-column rule — grouping rows,
 * comparing across columns, validating a group as a whole.
 *
 * The registry is closed: a loadout names a hook, it cannot define one. Keeps
 * arbitrary logic out of JSON and inside code review.
 */

import { makeFinding, type Finding, type FindingCode } from './findings';
import type { LoadedRow } from './csvLoad';
import type { Loadout } from '../loadout/schema';
import { normalizeEnumCell } from './checks';
import { collapseWhitespace, isBlank } from '../../drills/question-banks/shared/normalize';

export interface HookResult {
  /** Findings belonging to the file as a whole. */
  fileFindings: Finding[];
  /** Findings to attach to a specific row, by physical line. */
  byLine: Map<number, Finding[]>;
}

export type Hook = (rows: LoadedRow[], loadout: Loadout) => HookResult;

const empty = (): HookResult => ({ fileFindings: [], byLine: new Map() });

function addTo(byLine: Map<number, Finding[]>, line: number, finding: Finding): void {
  const list = byLine.get(line) ?? [];
  list.push(finding);
  byLine.set(line, list);
}

const code = (raw: string): FindingCode => raw as FindingCode;

interface GroundingGroup {
  kind: 'passage' | 'audio';
  key: string;
  rows: LoadedRow[];
}

/** Mock: READING groups on passage_id, LISTENING on audio_url, standalone rows are valid. */
function mockGrounding(rows: LoadedRow[]): HookResult {
  const result = empty();

  const order: string[] = [];
  const byKey = new Map<string, GroundingGroup>();
  const ungrouped: LoadedRow[] = [];

  const val = (row: LoadedRow, name: string): string => row.values[name] ?? '';

  for (const row of rows) {
    const type = normalizeEnumCell(val(row, 'question_type'));
    if (type !== 'MCQ' && type !== 'TFNG') continue; // prompt rows are handled by column rules

    const skill = normalizeEnumCell(val(row, 'skill'));
    const passageId = val(row, 'passage_id');
    const audioUrl = val(row, 'audio_url');

    if (skill === 'READING' && !isBlank(passageId)) {
      const key = `passage:${passageId.trim()}`;
      if (!byKey.has(key)) {
        byKey.set(key, { kind: 'passage', key: passageId.trim(), rows: [] });
        order.push(key);
      }
      byKey.get(key)!.rows.push(row);
    } else if (skill === 'LISTENING' && !isBlank(audioUrl)) {
      const key = `audio:${audioUrl.trim()}`;
      if (!byKey.has(key)) {
        byKey.set(key, { kind: 'audio', key: audioUrl.trim(), rows: [] });
        order.push(key);
      }
      byKey.get(key)!.rows.push(row);
    } else {
      ungrouped.push(row);
    }
  }

  for (const groupKey of order) {
    const group = byKey.get(groupKey)!;
    // Audio groups are consistent by construction — the key is the audio_url.
    if (group.kind !== 'passage') continue;

    for (const row of group.rows) {
      if (isBlank(val(row, 'passage_text'))) {
        addTo(
          result.byLine,
          row.line,
          makeFinding(
            code('PASSAGE_TEXT_MISSING'),
            'row',
            'passage_text is empty, but every row sharing this passage_id needs one.',
            { line: row.line, column: 'passage_text' },
          ),
        );
      }
    }

    const distinct = new Set(
      group.rows.map(r => collapseWhitespace(val(r, 'passage_text'))).filter(v => v !== ''),
    );
    if (distinct.size > 1) {
      result.fileFindings.push(
        makeFinding(
          code('PASSAGE_TEXT_INCONSISTENT'),
          'bucket',
          `passage_id "${group.key}" has ${distinct.size} different passage_text values across ` +
            `its rows — every row sharing a passage_id must describe the same passage.`,
        ),
      );
    }
  }

  // Ungrouped rows must carry neither a passage nor audio.
  for (const row of ungrouped) {
    if (!isBlank(val(row, 'passage_text'))) {
      addTo(
        result.byLine,
        row.line,
        makeFinding(
          code('PASSAGE_TEXT_PRESENT_BUT_NOT_ALLOWED'),
          'row',
          'passage_text is filled in, but this row is not part of a passage group.',
          { line: row.line, column: 'passage_text' },
        ),
      );
    }
    if (!isBlank(val(row, 'audio_url'))) {
      addTo(
        result.byLine,
        row.line,
        makeFinding(
          code('AUDIO_URL_PRESENT_BUT_NOT_ALLOWED'),
          'row',
          'audio_url is filled in, but this row is not part of an audio group.',
          { line: row.line, column: 'audio_url' },
        ),
      );
    }
  }

  return result;
}

/**
 * Cross-column blank rules. A prompt row raises one finding for options OR
 * correct_answer, not one each. Used by Mock, IA and Diagnostic.
 */
function promptRowShape(rows: LoadedRow[]): HookResult {
  const result = empty();
  const val = (row: LoadedRow, name: string): string => row.values[name] ?? '';

  for (const row of rows) {
    const type = normalizeEnumCell(val(row, 'question_type'));

    if (type === 'TFNG') {
      // Skip if the answer is already wrong — one problem per row is enough.
      const raw = val(row, 'correct_answer').trim();
      let letter = raw.toUpperCase();
      try {
        const parsed: unknown = JSON.parse(raw);
        if (typeof parsed === 'string') letter = parsed.toUpperCase();
      } catch {
        /* bare form accepted */
      }
      const answerUsable = ['T', 'F', 'NG'].includes(letter);

      if (answerUsable && !isBlank(val(row, 'options'))) {
        addTo(
          result.byLine,
          row.line,
          makeFinding(
            code('OPTIONS_PRESENT_BUT_NOT_ALLOWED'),
            'row',
            'options is filled in, but TFNG rows must leave it blank.',
            { line: row.line, column: 'options' },
          ),
        );
      }
      continue;
    }

    if (type === 'WRITING_PROMPT' || type === 'SPEAKING_PROMPT') {
      if (!isBlank(val(row, 'options')) || !isBlank(val(row, 'correct_answer'))) {
        addTo(
          result.byLine,
          row.line,
          makeFinding(
            code('OPTIONS_PRESENT_BUT_NOT_ALLOWED'),
            'row',
            `${type} rows must leave options and correct_answer blank — this row has one filled in.`,
            { line: row.line, column: 'options' },
          ),
        );
      }
    }
  }

  return result;
}

/** Prompt rows carry no passage or audio. Separate hook — Diagnostic skips it. */
function promptRowNoPassageAudio(rows: LoadedRow[]): HookResult {
  const result = empty();
  const val = (row: LoadedRow, name: string): string => row.values[name] ?? '';

  for (const row of rows) {
    const type = normalizeEnumCell(val(row, 'question_type'));
    if (type !== 'WRITING_PROMPT' && type !== 'SPEAKING_PROMPT') continue;

    for (const [column, codeName] of [
      ['passage_text', 'PASSAGE_TEXT_PRESENT_BUT_NOT_ALLOWED'],
      ['audio_url', 'AUDIO_URL_PRESENT_BUT_NOT_ALLOWED'],
    ] as const) {
      if (!isBlank(val(row, column))) {
        addTo(
          result.byLine,
          row.line,
          makeFinding(code(codeName), 'row', `${column} is filled in, but this question_type does not use one.`, {
            line: row.line,
            column,
          }),
        );
      }
    }
  }

  return result;
}

/**
 * IA: every MCQ/TFNG row needs a passage_id. Groups on passage_id only; what
 * must match within a group depends on skill (READING: passage_text,
 * LISTENING: audio_url).
 */
function iaPassageGroups(rows: LoadedRow[]): HookResult {
  const result = empty();
  const val = (row: LoadedRow, name: string): string => row.values[name] ?? '';

  const order: string[] = [];
  const byId = new Map<string, LoadedRow[]>();

  for (const row of rows) {
    const type = normalizeEnumCell(val(row, 'question_type'));
    if (type !== 'MCQ' && type !== 'TFNG') continue;

    if (isBlank(val(row, 'passage_id'))) {
      result.fileFindings.push(
        makeFinding(
          code('PASSAGE_ID_MISSING'),
          'row',
          'passage_id is empty — every MCQ/TFNG row must belong to a passage/recording group.',
          { line: row.line, column: 'passage_id' },
        ),
      );
      continue;
    }

    const key = val(row, 'passage_id').trim();
    if (!byId.has(key)) {
      byId.set(key, []);
      order.push(key);
    }
    byId.get(key)!.push(row);
  }

  for (const passageId of order) {
    const group = byId.get(passageId)!;
    if (group.length === 0) continue;

    const skill = normalizeEnumCell(val(group[0], 'skill'));
    const shared =
      skill === 'READING'
        ? { field: 'passage_text', missing: 'PASSAGE_TEXT_MISSING', inconsistent: 'PASSAGE_TEXT_INCONSISTENT', noun: 'passage' }
        : skill === 'LISTENING'
          ? { field: 'audio_url', missing: 'AUDIO_URL_MISSING', inconsistent: 'AUDIO_URL_INCONSISTENT', noun: 'recording' }
          : null;
    if (!shared) continue;

    for (const row of group) {
      if (isBlank(val(row, shared.field))) {
        addTo(
          result.byLine,
          row.line,
          makeFinding(
            code(shared.missing),
            'row',
            `${shared.field} is empty, but every row in this passage/recording group needs one.`,
            { line: row.line, column: shared.field },
          ),
        );
      }
    }

    const distinct = new Set(
      group.map(r => collapseWhitespace(val(r, shared.field))).filter(v => v !== ''),
    );
    if (distinct.size > 1) {
      result.fileFindings.push(
        makeFinding(
          code(shared.inconsistent),
          'bucket',
          `passage_id "${passageId}" has ${distinct.size} different ${shared.field} values across its rows — every row sharing a ` +
            `passage_id must describe the same ${shared.noun}.`,
        ),
      );
    }
  }

  return result;
}

/**
 * Diagnostic sets: every row belongs to a set, a set agrees on skill/level, and
 * its sequence numbers run 1..n with no gaps.
 */
function diagnosticSets(rows: LoadedRow[]): HookResult {
  const result = empty();
  const val = (row: LoadedRow, name: string): string => row.values[name] ?? '';

  const order: string[] = [];
  const bySet = new Map<string, LoadedRow[]>();

  for (const row of rows) {
    if (isBlank(val(row, 'set_id'))) {
      result.fileFindings.push(
        makeFinding(code('SET_ID_MISSING'), 'row', 'set_id is empty — every row must belong to a set.', {
          line: row.line,
          column: 'set_id',
        }),
      );
      continue;
    }
    const key = val(row, 'set_id').trim();
    if (!bySet.has(key)) {
      bySet.set(key, []);
      order.push(key);
    }
    bySet.get(key)!.push(row);
  }

  // Findings are gathered per set first, then split: those naming a line attach
  // to that row, those describing the set as a whole surface at file level.
  const setFindings: { setId: string; findings: Finding[] }[] = order.map(setId => {
    const group = bySet.get(setId)!;
    const findings: Finding[] = [];

    // --- sequence ---
    const parsed = group.map(row => ({ row, n: Number(val(row, 'sequence')) }));
    for (const { row, n } of parsed) {
      if (!Number.isInteger(n) || n < 1) {
        findings.push(
          makeFinding(
            code('SEQUENCE_INVALID'),
            'row',
            `sequence is "${val(row, 'sequence')}", but must be a positive whole number.`,
            { line: row.line, column: 'sequence' },
          ),
        );
      }
    }

    const valid = parsed
      .filter(p => Number.isInteger(p.n) && p.n >= 1)
      .map(p => p.n)
      .sort((a, b) => a - b);
    const sequential = valid.length === group.length && valid.every((n, i) => n === i + 1);
    if (!sequential && valid.length === group.length) {
      findings.push(
        makeFinding(
          code('SEQUENCE_NOT_SEQUENTIAL'),
          'set',
          `set "${setId}" has sequence values [${valid.join(', ')}], but they must run 1..${group.length} ` +
            `with no gaps or duplicates.`,
        ),
      );
    }

    // --- identity and shared fields ---
    if (group.length > 0) {
      const skill = normalizeEnumCell(val(group[0], 'skill'));
      const level = normalizeEnumCell(val(group[0], 'level'));

      for (const row of group) {
        if (normalizeEnumCell(val(row, 'skill')) !== skill || normalizeEnumCell(val(row, 'level')) !== level) {
          findings.push(
            makeFinding(
              code('SET_IDENTITY_MISMATCH'),
              'set',
              `set "${setId}" is not internally consistent — row at line ${row.line} says ` +
                `${val(row, 'skill')}/${val(row, 'level')}, but other rows in this set disagree.`,
              { line: row.line },
            ),
          );
        }
      }

      const shared: { field: string; missing: string; inconsistent: string }[] =
        skill === 'READING'
          ? [{ field: 'passage_text', missing: 'PASSAGE_TEXT_MISSING', inconsistent: 'PASSAGE_TEXT_INCONSISTENT' }]
          : skill === 'LISTENING'
            ? [
                { field: 'audio_file', missing: 'AUDIO_FILE_MISSING', inconsistent: 'AUDIO_FILE_INCONSISTENT' },
                { field: 'transcript', missing: 'TRANSCRIPT_MISSING', inconsistent: 'TRANSCRIPT_INCONSISTENT' },
              ]
            : [];

      for (const { field, missing, inconsistent } of shared) {
        for (const row of group) {
          if (isBlank(val(row, field))) {
            findings.push(
              makeFinding(
                code(missing),
                'row',
                `${field} is empty, but every row in this set needs one.`,
                { line: row.line, column: field },
              ),
            );
          }
        }
        const distinct = new Set(group.map(r => collapseWhitespace(val(r, field))).filter(v => v !== ''));
        if (distinct.size > 1) {
          findings.push(
            makeFinding(
              code(inconsistent),
              'set',
              `set "${setId}" has ${distinct.size} different ${field} values across its rows — ` +
                `every row in a set describes the same passage or recording.`,
            ),
          );
        }
      }
    }

    return { setId, findings };
  });

  for (const set of setFindings) {
    for (const f of set.findings) {
      if (f.line !== undefined) addTo(result.byLine, f.line, f);
    }
  }
  for (const set of setFindings) {
    result.fileFindings.push(...set.findings.filter(f => f.line === undefined));
  }

  return result;
}

const REGISTRY: Record<string, Hook> = {
  mockGrounding: rows => mockGrounding(rows),
  promptRowShape: rows => promptRowShape(rows),
  promptRowNoPassageAudio: rows => promptRowNoPassageAudio(rows),
  iaPassageGroups: rows => iaPassageGroups(rows),
  diagnosticSets: rows => diagnosticSets(rows),
};

export function hookByName(name: string): Hook {
  const hook = REGISTRY[name];
  if (!hook) {
    throw new Error(
      `Unknown hook "${name}". Hooks must be registered in engine/hooks.ts — a loadout ` +
        `can name one but cannot define one.`,
    );
  }
  return hook;
}

export function knownHooks(): string[] {
  return Object.keys(REGISTRY).sort();
}
