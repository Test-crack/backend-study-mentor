/**
 * The judging pipeline: blind solve, compare, adjudicate only where they differ.
 *
 * Gating is per ROW, not per file. A file-level gate would be too crude — one of
 * the real batches fails Layer 1 solely because it has 199 rows instead of 200,
 * which tells us nothing about whether its answers are right. Only a genuinely
 * unreadable file (broken header) is skipped wholesale; otherwise every row we
 * can actually parse gets judged, and the few we cannot are marked SKIPPED rather
 * than quietly dropped.
 */

import {
  OPTION_KEYS,
  type BucketTriple,
  type DrillCsvRow,
  type OptionKey,
} from '../shared/types';
import { loadDrillCsv } from '../shared/csvLoader';
import { isBlank } from '../shared/normalize';
import {
  MalformedResponseError,
  parseJsonLoose,
  type LlmClient,
} from '../shared/llm';
import { answerLetterOf, creditedLetters, determineBucket } from '../layer1-verifier/checks';
import { JudgementCache, cacheKey } from './cache';
import { TEMPLATE_VERSION, adjudicatePrompt, blindSolvePrompt } from './prompts';
import {
  tallyOutcomes,
  type Adjudication,
  type AdjudicationVerdict,
  type BlindSolve,
  type Confidence,
  type JudgeRunResult,
  type JudgedFile,
  type JudgedRow,
  type QuestionView,
  type RowJudgement,
} from './types';

export interface JudgeStats {
  apiCalls: number;
  cacheHits: number;
}

export interface JudgeDeps {
  client: LlmClient;
  votes: number;
  limit: <T>(fn: () => Promise<T>) => Promise<T>;
  useCache: boolean;
  stats: JudgeStats;
  /** Judge at most this many rows per file. Null means all of them. */
  rowLimit?: number | null;
  onProgress?: (message: string) => void;
}

// ---------------------------------------------------------------------------
// Reading a row
// ---------------------------------------------------------------------------

/**
 * Turn a row into something answerable, or null if it isn't.
 *
 * Note what is NOT required here: a valid `correct_answer`. A row whose answer
 * key is malformed is still perfectly answerable, and telling the operator what
 * the answer should have been is one of the more useful things this tool does.
 */
export function readQuestion(row: DrillCsvRow): QuestionView | null {
  if (isBlank(row.prompt_text)) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(row.options);
  } catch {
    return null;
  }

  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) return null;

  const obj = parsed as Record<string, unknown>;
  const options = {} as Record<OptionKey, string>;

  for (const key of OPTION_KEYS) {
    const value = obj[key];
    if (typeof value !== 'string' || isBlank(value)) return null;
    options[key] = value;
  }

  return { promptText: row.prompt_text, options };
}

// ---------------------------------------------------------------------------
// Response validation
// ---------------------------------------------------------------------------

const CONFIDENCES: readonly string[] = ['high', 'medium', 'low'];
const VERDICTS: readonly string[] = [
  'STORED_CORRECT',
  'BLIND_CORRECT',
  'BOTH_WRONG',
  'AMBIGUOUS',
  'NO_CORRECT_ANSWER',
];

function asRecord(value: unknown): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new MalformedResponseError('Model response was not a JSON object.');
  }
  return value as Record<string, unknown>;
}

export function parseBlindSolve(raw: string): BlindSolve {
  const obj = asRecord(parseJsonLoose(raw));
  const answer = String(obj.answer ?? '').trim().toUpperCase();

  if (!(OPTION_KEYS as readonly string[]).includes(answer)) {
    throw new MalformedResponseError(`Model answered "${answer}", expected one of A, B, C, D.`);
  }

  const confidence = String(obj.confidence ?? '').trim().toLowerCase();

  return {
    answer: answer as OptionKey,
    confidence: (CONFIDENCES.includes(confidence) ? confidence : 'low') as Confidence,
    reasoning: String(obj.reasoning ?? '').trim(),
    isDegenerate: obj.is_degenerate === true,
    degenerateReason: String(obj.degenerate_reason ?? '').trim(),
    testsIntendedSkill: obj.tests_intended_skill !== false,
    skillMismatchReason: String(obj.skill_mismatch_reason ?? '').trim(),
  };
}

export function parseAdjudication(raw: string): Adjudication {
  const obj = asRecord(parseJsonLoose(raw));
  const verdict = String(obj.verdict ?? '').trim().toUpperCase();

  if (!VERDICTS.includes(verdict)) {
    throw new MalformedResponseError(`Model returned unknown verdict "${verdict}".`);
  }

  const letter = String(obj.correct_letter ?? '').trim().toUpperCase();

  return {
    verdict: verdict as AdjudicationVerdict,
    correctLetter: (OPTION_KEYS as readonly string[]).includes(letter)
      ? (letter as OptionKey)
      : null,
    // Absent means "not asserted ok" — the safe reading.
    explanationOk: obj.explanation_ok === true,
    reasoning: String(obj.reasoning ?? '').trim(),
  };
}

/**
 * Call the model and parse it, retrying once when the response is unparseable.
 * Transient transport failures are already retried inside the client.
 */
async function ask<T>(
  deps: JudgeDeps,
  label: string,
  prompt: string,
  parse: (raw: string) => T,
): Promise<T> {
  let lastErr: unknown;

  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      deps.stats.apiCalls += 1;
      const raw = await deps.limit(() => deps.client.complete({ label, prompt }));
      return parse(raw);
    } catch (err) {
      lastErr = err;
      if (!(err instanceof MalformedResponseError)) throw err;
      deps.onProgress?.(`  [reask] ${label}: ${err.message.slice(0, 80)}`);
    }
  }

  throw lastErr;
}

// ---------------------------------------------------------------------------
// One row
// ---------------------------------------------------------------------------

/** The letter a set of blind attempts agrees on, or null when they don't. */
export function majorityAnswer(votes: BlindSolve[]): OptionKey | null {
  if (votes.length === 0) return null;

  const counts = new Map<OptionKey, number>();
  for (const v of votes) counts.set(v.answer, (counts.get(v.answer) ?? 0) + 1);

  const sorted = [...counts.entries()].sort((a, b) => b[1] - a[1]);
  if (sorted.length > 1 && sorted[0][1] === sorted[1][1]) return null; // tie
  return sorted[0][1] > votes.length / 2 ? sorted[0][0] : null;
}

function outcomeFromVerdict(
  adjudication: Adjudication,
): { outcome: RowJudgement['outcome']; detail: string } {
  const letter = adjudication.correctLetter;

  switch (adjudication.verdict) {
    case 'STORED_CORRECT':
      return adjudication.explanationOk
        ? {
            outcome: 'UPHELD',
            detail: 'Independent solve disagreed, but on review the answer key holds up.',
          }
        : {
            outcome: 'EXPLANATION_WRONG',
            detail: 'Answer key is correct, but its explanation does not support it.',
          };
    case 'BLIND_CORRECT':
      return {
        outcome: 'ANSWER_WRONG',
        detail: `Answer key is wrong. The correct option is ${letter ?? '(unstated)'}.`,
      };
    case 'BOTH_WRONG':
      return {
        outcome: 'ANSWER_WRONG',
        detail: `Neither the key nor the independent solve was right. Correct option: ${letter ?? '(unstated)'}.`,
      };
    case 'AMBIGUOUS':
      return {
        outcome: 'QUESTION_DEFECTIVE',
        detail: 'More than one option is defensibly correct — the question needs rewriting.',
      };
    case 'NO_CORRECT_ANSWER':
      return {
        outcome: 'QUESTION_DEFECTIVE',
        detail: 'None of the four options is correct.',
      };
  }
}

export async function judgeRow(
  row: DrillCsvRow,
  bucket: BucketTriple | null,
  deps: JudgeDeps,
): Promise<RowJudgement> {
  const base = {
    line: row.line,
    storedAnswer: answerLetterOf(row),
    blind: null,
    votes: [],
    adjudication: null,
    cached: false,
  } satisfies Omit<RowJudgement, 'outcome' | 'detail'>;

  const question = readQuestion(row);
  if (!question) {
    return {
      ...base,
      outcome: 'SKIPPED',
      detail:
        'Row could not be read as a question — the prompt is blank or the options are not a ' +
        'JSON object with four non-empty A-D values. Fix it in Layer 1 first.',
    };
  }

  const label = `line ${row.line}`;

  try {
    // --- pass 1: blind solve, N times ---
    const votes: BlindSolve[] = [];
    for (let i = 0; i < deps.votes; i += 1) {
      votes.push(
        await ask(deps, `${label} solve${deps.votes > 1 ? ` ${i + 1}` : ''}`,
          blindSolvePrompt(question, bucket), parseBlindSolve),
      );
    }

    const blind = votes[0];

    // A degenerate row (placeholder/template junk) isn't a real question, so
    // comparing letters against the stored answer would be meaningless — any
    // vote flagging it is enough to short-circuit before that comparison.
    const degenerateVote = votes.find(v => v.isDegenerate);
    if (degenerateVote) {
      return {
        ...base,
        blind,
        votes,
        outcome: 'QUESTION_DEGENERATE',
        detail: `Not a real question — placeholder/template content. ${degenerateVote.degenerateReason || ''}`.trim(),
      };
    }

    // Same idea for a real question sitting in the wrong bucket: whether the
    // stored letter is "correct" is beside the point if the question isn't
    // testing the skill it's filed under at all.
    const mismatchVote = votes.find(v => v.testsIntendedSkill === false);
    if (mismatchVote) {
      return {
        ...base,
        blind,
        votes,
        outcome: 'SKILL_MISMATCH',
        detail: `Content doesn't test its labeled skill/sub-skill. ${mismatchVote.skillMismatchReason || ''}`.trim(),
      };
    }

    const agreed = deps.votes === 1 ? blind.answer : majorityAnswer(votes);
    const stored = base.storedAnswer;

    // --- agreement path: no second call needed ---
    if (stored !== null && agreed === stored) {
      // The answer is now confirmed by two independent sources. If the stored
      // explanation credits some other letter, it is the explanation that is
      // wrong — which is precisely the ambiguity Layer 1 could flag but not
      // resolve.
      const credited = [...creditedLetters(row.explanation)];
      if (credited.length === 1 && credited[0] !== stored) {
        return {
          ...base,
          blind,
          votes,
          outcome: 'EXPLANATION_WRONG',
          detail:
            `Answer ${stored} independently confirmed, but the explanation credits ` +
            `option ${credited[0]}. The answer is right; the explanation is wrong.`,
        };
      }

      return {
        ...base,
        blind,
        votes,
        outcome: 'AGREE',
        detail: `Independently answered ${agreed} (confidence ${blind.confidence}).`,
      };
    }

    // --- disagreement (or no usable stored answer): adjudicate ---
    const adjudication = await ask(
      deps,
      `${label} adjudicate`,
      adjudicatePrompt(question, bucket, stored, row.explanation, votes),
      parseAdjudication,
    );

    const { outcome, detail } = outcomeFromVerdict(adjudication);

    const prefix =
      stored === null
        ? 'The answer key is missing or malformed. '
        : agreed === null
          ? `Independent solves did not agree with each other (${votes.map(v => v.answer).join(', ')}). `
          : `Independent solve said ${agreed}, key says ${stored}. `;

    return { ...base, blind, votes, adjudication, outcome, detail: prefix + detail };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      ...base,
      outcome: 'UNJUDGED',
      detail:
        `Could not be judged: ${message.slice(0, 160)}. ` +
        'This row was NOT checked — treat it as unverified, not as passing.',
    };
  }
}

// ---------------------------------------------------------------------------
// One file
// ---------------------------------------------------------------------------

export async function judgeFile(filePath: string, deps: JudgeDeps): Promise<JudgedFile> {
  const loaded = loadDrillCsv(filePath);

  const shell: JudgedFile = {
    filePath: loaded.filePath,
    fileName: loaded.fileName,
    bucket: null,
    rows: [],
    skipReason: null,
    counts: tallyOutcomes([]),
  };

  if (loaded.fatal) {
    const why = loaded.findings.map(f => f.code).join(', ');
    return {
      ...shell,
      skipReason:
        `Layer 1 could not read this file (${why}), so its columns cannot be trusted and ` +
        'no question in it can be judged. Fix the structure first.',
    };
  }

  const { bucket } = determineBucket(loaded.rows);
  const cache = new JudgementCache(filePath);
  if (deps.useCache) cache.load();

  const toJudge =
    deps.rowLimit === undefined || deps.rowLimit === null
      ? loaded.rows
      : loaded.rows.slice(0, deps.rowLimit);

  if (toJudge.length < loaded.rows.length) {
    deps.onProgress?.(
      `  --limit is in effect: judging ${toJudge.length} of ${loaded.rows.length} rows. ` +
        'The rest are NOT verified.',
    );
  }

  // Rows are dispatched together rather than one after another; the limiter
  // passed in `deps` is what actually caps how many model calls are in flight, so
  // concurrency is enforced in one place instead of being accidentally serialised
  // here. Promise.all preserves input order, so the report still reads top-down.
  let done = 0;
  const rows: JudgedRow[] = await Promise.all(
    toJudge.map(async row => {
      const key = cacheKey({
        row,
        model: deps.client.modelName,
        templateVersion: TEMPLATE_VERSION,
        votes: deps.votes,
      });

      const hit = deps.useCache ? cache.get(key) : null;
      if (hit) {
        deps.stats.cacheHits += 1;
        done += 1;
        return { row, judgement: hit };
      }

      const judgement = await judgeRow(row, bucket, deps);
      if (deps.useCache) cache.set(key, judgement);

      done += 1;
      if (done % 25 === 0) deps.onProgress?.(`  ${done}/${toJudge.length} rows`);

      return { row, judgement };
    }),
  );

  if (deps.useCache) cache.save();

  return { ...shell, bucket, rows, counts: tallyOutcomes(rows) };
}

export async function judgeRun(filePaths: string[], deps: JudgeDeps): Promise<JudgeRunResult> {
  const files: JudgedFile[] = [];

  for (const filePath of filePaths) {
    deps.onProgress?.(`Judging ${filePath.split(/[\\/]/).pop()}`);
    files.push(await judgeFile(filePath, deps));
  }

  return {
    files,
    model: deps.client.modelName,
    templateVersion: TEMPLATE_VERSION,
    votes: deps.votes,
    apiCalls: deps.stats.apiCalls,
    cacheHits: deps.stats.cacheHits,
  };
}
