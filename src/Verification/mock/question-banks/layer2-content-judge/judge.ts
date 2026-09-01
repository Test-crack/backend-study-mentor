/**
 * The judging pipeline for a Mock question CSV.
 *
 * Dispatch per row, decided by question_type — ported from IA's judge.ts:
 *  - MCQ/TFNG: blind-solve -> compare -> adjudicate only on disagreement.
 *  - WRITING_PROMPT/SPEAKING_PROMPT: direct quality judgement, now
 *    task_type-aware (Task1/Task2/Part1/Part2/Part3 get different criteria
 *    — see prompts.ts).
 *
 * Plus one set-level check for LISTENING, grouped by `audio_url` (not
 * `passage_id` — see checks.ts's groupByGrounding): the audio is
 * transcribed for manual reference. Like IA, MockQuestion carries no
 * author-submitted transcript column, so there is nothing to diff the
 * auto-transcript against.
 */

import path from 'path';
import { isBlank } from '../../../drills/question-banks/shared/normalize';
import { MalformedResponseError, parseJsonLoose, type LlmClient } from '../../../drills/question-banks/shared/llm';
import { loadMockCsv } from '../shared/csvLoader';
import { OPTION_KEYS, TFNG_ANSWERS, type MockCsvRow, type OptionKey } from '../shared/types';
import { groupByGrounding, normalizeEnumCell, type GroundingGroup } from '../layer1-verifier/checks';
import { JudgementCache, cacheKey } from './cache';
import { TEMPLATE_VERSION, adjudicatePrompt, blindSolvePrompt, promptQualityPrompt } from './prompts';
import {
  emptyAnswerCounts,
  emptyPromptCounts,
  type Adjudication,
  type AdjudicationVerdict,
  type AnswerJudgeOutcome,
  type AnswerRowJudgement,
  type AudioCrossCheck,
  type BlindSolve,
  type Confidence,
  type JudgeRunResult,
  type JudgedFile,
  type PromptJudgeOutcome,
  type PromptRowJudgement,
  type QuestionView,
} from './types';

export interface JudgeStats {
  apiCalls: number;
  cacheHits: number;
}

export interface JudgeDeps {
  client: LlmClient;
  limit: <T>(fn: () => Promise<T>) => Promise<T>;
  useCache: boolean;
  stats: JudgeStats;
  /** Directory audio_url values are resolved against when they name a local staging file. */
  audioDir?: string;
  transcribeAudio?: (audioPath: string) => Promise<string>;
  onProgress?: (message: string) => void;
}

// ---------------------------------------------------------------------------
// Reading a row into something answerable
// ---------------------------------------------------------------------------

export function readQuestionView(row: MockCsvRow): QuestionView | null {
  if (isBlank(row.prompt_text)) return null;
  const type = normalizeEnumCell(row.question_type);
  const grounding = !isBlank(row.passage_text) ? row.passage_text : null;

  if (type === 'MCQ') {
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
    return { promptText: row.prompt_text, options, passageOrAudioContext: grounding };
  }

  if (type === 'TFNG') {
    return { promptText: row.prompt_text, options: null, passageOrAudioContext: grounding };
  }

  return null; // WRITING_PROMPT / SPEAKING_PROMPT go through the other path.
}

function storedAnswerOf(row: MockCsvRow): string | null {
  const type = normalizeEnumCell(row.question_type);
  if (type === 'MCQ') {
    try {
      const parsed: unknown = JSON.parse(row.correct_answer.trim());
      return typeof parsed === 'string' && (OPTION_KEYS as readonly string[]).includes(parsed) ? parsed : null;
    } catch {
      return null;
    }
  }
  if (type === 'TFNG') {
    const raw = row.correct_answer.trim().toUpperCase().replace(/^"(.*)"$/, '$1');
    return (TFNG_ANSWERS as readonly string[]).includes(raw) ? raw : null;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Response parsing
// ---------------------------------------------------------------------------

const CONFIDENCES: readonly string[] = ['high', 'medium', 'low'];
const VERDICTS: readonly string[] = ['STORED_CORRECT', 'BLIND_CORRECT', 'BOTH_WRONG', 'AMBIGUOUS', 'NO_CORRECT_ANSWER'];
const PROMPT_OUTCOMES: readonly string[] = ['GOOD', 'TOO_EASY', 'AMBIGUOUS', 'DEGENERATE'];

function asRecord(value: unknown): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new MalformedResponseError('Model response was not a JSON object.');
  }
  return value as Record<string, unknown>;
}

function answerDomainFor(isTfng: boolean): readonly string[] {
  return isTfng ? TFNG_ANSWERS : OPTION_KEYS;
}

export function parseBlindSolve(raw: string, isTfng: boolean): BlindSolve {
  const obj = asRecord(parseJsonLoose(raw));
  const answer = String(obj.answer ?? '').trim().toUpperCase();
  const domain = answerDomainFor(isTfng);

  if (!domain.includes(answer)) {
    throw new MalformedResponseError(`Model answered "${answer}", expected one of ${domain.join(', ')}.`);
  }

  const confidence = String(obj.confidence ?? '').trim().toLowerCase();

  return {
    answer,
    confidence: (CONFIDENCES.includes(confidence) ? confidence : 'low') as Confidence,
    reasoning: String(obj.reasoning ?? '').trim(),
    isDegenerate: obj.is_degenerate === true,
    degenerateReason: String(obj.degenerate_reason ?? '').trim(),
    isTooEasy: obj.is_too_easy === true,
    tooEasyReason: String(obj.too_easy_reason ?? '').trim(),
  };
}

export function parseAdjudication(raw: string, isTfng: boolean): Adjudication {
  const obj = asRecord(parseJsonLoose(raw));
  const verdict = String(obj.verdict ?? '').trim().toUpperCase();
  if (!VERDICTS.includes(verdict)) throw new MalformedResponseError(`Model returned unknown verdict "${verdict}".`);

  const domain = answerDomainFor(isTfng);
  const letter = String(obj.correct_answer ?? '').trim().toUpperCase();

  return {
    verdict: verdict as AdjudicationVerdict,
    correctAnswer: domain.includes(letter) ? letter : null,
    reasoning: String(obj.reasoning ?? '').trim(),
  };
}

export function parsePromptQuality(raw: string): { outcome: PromptJudgeOutcome; reasoning: string } {
  const obj = asRecord(parseJsonLoose(raw));
  const outcome = String(obj.outcome ?? '').trim().toUpperCase();
  if (!PROMPT_OUTCOMES.includes(outcome)) throw new MalformedResponseError(`Model returned unknown outcome "${outcome}".`);
  return { outcome: outcome as PromptJudgeOutcome, reasoning: String(obj.reasoning ?? '').trim() };
}

async function ask<T>(deps: JudgeDeps, label: string, prompt: string, parse: (raw: string) => T): Promise<T> {
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
// One MCQ/TFNG row
// ---------------------------------------------------------------------------

export async function judgeAnswerRow(row: MockCsvRow, deps: JudgeDeps): Promise<AnswerRowJudgement> {
  const type = normalizeEnumCell(row.question_type);
  const isTfng = type === 'TFNG';
  const skillLabel = normalizeEnumCell(row.skill);

  const base = {
    line: row.line,
    storedAnswer: storedAnswerOf(row),
    blind: null,
    adjudication: null,
    cached: false,
  } satisfies Omit<AnswerRowJudgement, 'outcome' | 'detail'>;

  const view = readQuestionView(row);
  if (!view) {
    return { ...base, outcome: 'SKIPPED', detail: 'Row could not be read as a question — fix it in Layer 1 first.' };
  }

  const label = `line ${row.line}`;

  try {
    const blind = await ask(deps, `${label} solve`, blindSolvePrompt(view, skillLabel, isTfng), raw => parseBlindSolve(raw, isTfng));

    if (blind.isDegenerate) {
      return { ...base, blind, outcome: 'QUESTION_DEGENERATE', detail: `Not a real question. ${blind.degenerateReason || ''}`.trim() };
    }
    if (blind.isTooEasy) {
      return { ...base, blind, outcome: 'TOO_EASY', detail: `Doesn't discriminate students. ${blind.tooEasyReason || ''}`.trim() };
    }

    const stored = base.storedAnswer;
    if (stored !== null && blind.answer === stored) {
      return { ...base, blind, outcome: 'AGREE', detail: `Independently answered ${blind.answer} (confidence ${blind.confidence}).` };
    }

    const adjudication = await ask(deps, `${label} adjudicate`, adjudicatePrompt(view, isTfng, stored, blind), raw => parseAdjudication(raw, isTfng));

    const letter = adjudication.correctAnswer;
    const { outcome, detail } = ((): { outcome: AnswerJudgeOutcome; detail: string } => {
      switch (adjudication.verdict) {
        case 'STORED_CORRECT':
          return { outcome: 'UPHELD', detail: 'Independent solve disagreed, but on review the answer key holds up.' };
        case 'BLIND_CORRECT':
          return { outcome: 'ANSWER_WRONG', detail: `Answer key is wrong. The correct answer is ${letter ?? '(unstated)'}.` };
        case 'BOTH_WRONG':
          return { outcome: 'ANSWER_WRONG', detail: `Neither the key nor the independent solve was right. Correct answer: ${letter ?? '(unstated)'}.` };
        case 'AMBIGUOUS':
          return { outcome: 'QUESTION_DEFECTIVE', detail: 'More than one answer is defensibly correct — needs rewriting.' };
        case 'NO_CORRECT_ANSWER':
          return { outcome: 'QUESTION_DEFECTIVE', detail: 'None of the options/answers is correct.' };
      }
    })();

    const prefix = stored === null ? 'The answer key is missing or malformed. ' : `Independent solve said ${blind.answer}, key says ${stored}. `;
    return { ...base, blind, adjudication, outcome, detail: prefix + detail };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { ...base, outcome: 'UNJUDGED', detail: `Could not be judged: ${message.slice(0, 160)}. NOT checked — not a pass.` };
  }
}

// ---------------------------------------------------------------------------
// One WRITING_PROMPT / SPEAKING_PROMPT row
// ---------------------------------------------------------------------------

export async function judgePromptRow(row: MockCsvRow, deps: JudgeDeps): Promise<PromptRowJudgement> {
  const type = normalizeEnumCell(row.question_type);
  const skillLabel = type === 'WRITING_PROMPT' ? 'WRITING' : 'SPEAKING';

  if (isBlank(row.prompt_text)) {
    return { line: row.line, outcome: 'SKIPPED', detail: 'prompt_text is blank — fix it in Layer 1 first.', cached: false };
  }

  try {
    const label = `line ${row.line}`;
    const { outcome, reasoning } = await ask(deps, label, promptQualityPrompt(row.prompt_text, skillLabel, row.task_type.trim()), parsePromptQuality);

    const detail =
      outcome === 'GOOD'
        ? `Clear and genuinely discriminating. ${reasoning}`.trim()
        : outcome === 'TOO_EASY'
          ? `Doesn't discriminate students. ${reasoning}`.trim()
          : outcome === 'AMBIGUOUS'
            ? `Ambiguous or underspecified. ${reasoning}`.trim()
            : `Not a genuine prompt. ${reasoning}`.trim();

    return { line: row.line, outcome, detail, cached: false };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { line: row.line, outcome: 'UNJUDGED', detail: `Could not be judged: ${message.slice(0, 160)}. NOT checked — not a pass.`, cached: false };
  }
}

// ---------------------------------------------------------------------------
// Listening: audio transcription for manual reference (no submitted script to diff against)
// ---------------------------------------------------------------------------

export async function crossCheckListeningAudio(group: GroundingGroup, deps: JudgeDeps): Promise<AudioCrossCheck | null> {
  if (group.kind !== 'audio' || group.rows.length === 0) return null;

  const audioUrl = group.key;
  const transcribe = deps.transcribeAudio;
  if (!transcribe) {
    return { passageId: audioUrl, autoTranscript: null, matchesSubmittedTranscript: null, detail: 'Audio transcription skipped (not configured).' };
  }

  const audioPath = deps.audioDir && !/^https?:\/\//i.test(audioUrl) ? path.join(deps.audioDir, audioUrl) : audioUrl;

  try {
    deps.stats.apiCalls += 1;
    const autoTranscript = await transcribe(audioPath);
    return {
      passageId: audioUrl,
      autoTranscript,
      matchesSubmittedTranscript: null,
      detail:
        'Auto-transcribed for manual reference. MockQuestion has no author-submitted transcript ' +
        'column, so there is nothing to diff this against automatically — read it and confirm ' +
        'it matches the intended content of the questions in this group.',
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      passageId: audioUrl,
      autoTranscript: null,
      matchesSubmittedTranscript: null,
      detail: `Could not transcribe: ${message.slice(0, 160)}. NOT verified.`,
    };
  }
}

// ---------------------------------------------------------------------------
// Dispatch + caching wrapper
// ---------------------------------------------------------------------------

export async function judgeRowCached(row: MockCsvRow, cache: JudgementCache, deps: JudgeDeps): Promise<AnswerRowJudgement | PromptRowJudgement> {
  const type = normalizeEnumCell(row.question_type);
  const key = cacheKey({ row, model: deps.client.modelName, templateVersion: TEMPLATE_VERSION });

  if (deps.useCache) {
    const hit = cache.get(key);
    if (hit) {
      deps.stats.cacheHits += 1;
      return hit;
    }
  }

  const judgement = type === 'MCQ' || type === 'TFNG' ? await judgeAnswerRow(row, deps) : await judgePromptRow(row, deps);
  if (deps.useCache) cache.set(key, judgement);
  return judgement;
}

export function isAnswerJudgement(j: AnswerRowJudgement | PromptRowJudgement): j is AnswerRowJudgement {
  return 'storedAnswer' in j;
}

export function tallyAnswerOutcomes(judgements: AnswerRowJudgement[]) {
  const counts = emptyAnswerCounts();
  for (const j of judgements) counts[j.outcome] += 1;
  return counts;
}

export function tallyPromptOutcomes(judgements: PromptRowJudgement[]) {
  const counts = emptyPromptCounts();
  for (const j of judgements) counts[j.outcome] += 1;
  return counts;
}

// ---------------------------------------------------------------------------
// One file
// ---------------------------------------------------------------------------

export async function judgeFile(filePath: string, deps: JudgeDeps): Promise<JudgedFile> {
  const loaded = loadMockCsv(filePath);

  const shell: JudgedFile = {
    filePath: loaded.filePath,
    fileName: loaded.fileName,
    answerRows: [],
    promptRows: [],
    audioCrossChecks: [],
    skipReason: null,
    answerCounts: emptyAnswerCounts(),
    promptCounts: emptyPromptCounts(),
  };

  if (loaded.fatal) {
    const why = loaded.findings.map(f => f.code).join(', ');
    return { ...shell, skipReason: `Layer 1 could not read this file (${why}) — fix the structure first.` };
  }

  const cache = new JudgementCache(filePath);
  if (deps.useCache) cache.load();

  let done = 0;
  const judged = await Promise.all(
    loaded.rows.map(async row => {
      const judgement = await judgeRowCached(row, cache, deps);
      done += 1;
      if (done % 10 === 0) deps.onProgress?.(`  ${done}/${loaded.rows.length} rows`);
      return { row, judgement };
    }),
  );

  if (deps.useCache) cache.save();

  const answerRows = judged.filter((j): j is { row: MockCsvRow; judgement: AnswerRowJudgement } => isAnswerJudgement(j.judgement));
  const promptRows = judged.filter((j): j is { row: MockCsvRow; judgement: PromptRowJudgement } => !isAnswerJudgement(j.judgement));

  const { groups } = groupByGrounding(loaded.rows);
  const audioCrossChecks: AudioCrossCheck[] = [];
  for (const group of groups) {
    const check = await crossCheckListeningAudio(group, deps);
    if (check) audioCrossChecks.push(check);
  }

  return {
    ...shell,
    answerRows,
    promptRows,
    audioCrossChecks,
    answerCounts: tallyAnswerOutcomes(answerRows.map(r => r.judgement)),
    promptCounts: tallyPromptOutcomes(promptRows.map(r => r.judgement)),
  };
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
    apiCalls: deps.stats.apiCalls,
    cacheHits: deps.stats.cacheHits,
  };
}
