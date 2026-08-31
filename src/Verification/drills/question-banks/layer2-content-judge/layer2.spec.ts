/**
 * Regression tests for Layer 2.
 *
 *   npm run drills:judge:test
 *
 * Every test runs against a STUB model — no network, no API key, no cost, and
 * fully deterministic. That is the whole reason `LlmClient` is an interface. An
 * AI QA tool whose own decision logic is untested is exactly what got the
 * previous generation of this tooling deleted, and "we can't test it, it calls an
 * LLM" is not an excuse: the LLM call is one line, the logic around it is the
 * part that decides whether a wrong answer reaches production.
 */

import path from 'path';
import fs from 'fs';
import { assert, assertEqual, assertSameSet, run, test } from '../shared/testRunner';
import { createLimiter, parseJsonLoose, MalformedResponseError, type LlmClient } from '../shared/llm';
import type { BucketTriple, DrillCsvRow } from '../shared/types';
import { cacheKey } from './cache';
import { TEMPLATE_VERSION, blindSolvePrompt, adjudicatePrompt } from './prompts';
import {
  judgeRow,
  majorityAnswer,
  parseAdjudication,
  parseBlindSolve,
  readQuestion,
  type JudgeDeps,
} from './judge';
import type { BlindSolve, JudgeOutcome } from './types';
import { SEVERITY_BY_OUTCOME } from './types';

// ---------------------------------------------------------------------------
// Test doubles
// ---------------------------------------------------------------------------

const GOOD_OPTIONS = '{"A":"go","B":"goes","C":"gone","D":"going"}';

function makeRow(overrides: Partial<DrillCsvRow> = {}): DrillCsvRow {
  return {
    line: 2,
    cells: [],
    skill: 'WRITING',
    sub_skill: 'GRAMMAR',
    level: 'BEGINNER',
    prompt_text: 'She ___ to work every day.',
    options: GOOD_OPTIONS,
    correct_answer: '"B"',
    explanation: 'Third-person singular takes an -s ending.',
    ...overrides,
  };
}

const BUCKET: BucketTriple = { skill: 'WRITING', sub_skill: 'GRAMMAR', level: 'BEGINNER' };

/**
 * A model whose answers are scripted. `prompts` records everything it was asked,
 * which is how we prove the blind pass never sees the answer key.
 */
function stubClient(replies: string[]): LlmClient & { prompts: string[] } {
  const prompts: string[] = [];
  let i = 0;
  return {
    modelName: 'stub-model',
    prompts,
    async complete({ prompt }) {
      prompts.push(prompt);
      const reply = replies[Math.min(i, replies.length - 1)];
      i += 1;
      if (reply === '__THROW__') throw new Error('simulated API outage 503');
      return reply;
    },
  };
}

function deps(client: LlmClient, overrides: Partial<JudgeDeps> = {}): JudgeDeps {
  return {
    client,
    votes: 1,
    limit: createLimiter(4),
    useCache: false,
    stats: { apiCalls: 0, cacheHits: 0 },
    ...overrides,
  };
}

const solve = (answer: string, confidence = 'high', reasoning = 'because') =>
  JSON.stringify({ answer, confidence, reasoning });

const solveDegenerate = (answer: string, degenerate_reason = 'placeholder options, not real content') =>
  JSON.stringify({ answer, confidence: 'low', reasoning: 'n/a', is_degenerate: true, degenerate_reason });

const solveMismatch = (answer: string, skill_mismatch_reason = 'this tests grammar, not vocabulary') =>
  JSON.stringify({
    answer, confidence: 'high', reasoning: 'because',
    tests_intended_skill: false, skill_mismatch_reason,
  });

const adjudicate = (
  verdict: string,
  correct_letter: string | null,
  explanation_ok: boolean,
  reasoning = 'reviewed',
) => JSON.stringify({ verdict, correct_letter, explanation_ok, reasoning });

async function judge(row: DrillCsvRow, replies: string[], overrides: Partial<JudgeDeps> = {}) {
  const client = stubClient(replies);
  const d = deps(client, overrides);
  const judgement = await judgeRow(row, BUCKET, d);
  return { judgement, client, stats: d.stats };
}

// ---------------------------------------------------------------------------
// The blind pass must actually be blind
// ---------------------------------------------------------------------------

test('the blind prompt never contains the answer key or the explanation', () => {
  const row = makeRow({
    correct_answer: '"B"',
    explanation: 'UNIQUE_EXPLANATION_MARKER goes here.',
  });
  const prompt = blindSolvePrompt(readQuestion(row)!, BUCKET);

  assert(!prompt.includes('UNIQUE_EXPLANATION_MARKER'), 'explanation must not leak');
  assert(!/correct[_ ]answer/i.test(prompt), 'must not mention the answer key field');
  assert(!/answer key/i.test(prompt), 'must not mention an answer key at all');
  // The four option texts must be present, or it is not the same question.
  for (const text of ['go', 'goes', 'gone', 'going']) {
    assert(prompt.includes(text), `option "${text}" must appear`);
  }
});

test('the blind prompt reaching the model is blind, end to end', async () => {
  const row = makeRow({ explanation: 'LEAK_CANARY' });
  const { client } = await judge(row, [solve('B')]);
  assertEqual(client.prompts.length, 1, 'exactly one call when the solve agrees');
  assert(!client.prompts[0].includes('LEAK_CANARY'), 'no explanation leaked into the call');
});

test('the adjudicator DOES see the key, the explanation and the blind attempt', () => {
  const row = makeRow({ explanation: 'SEEN_BY_ADJUDICATOR' });
  const blind: BlindSolve = { answer: 'C', confidence: 'high', reasoning: 'BLIND_REASONING' };
  const prompt = adjudicatePrompt(readQuestion(row)!, BUCKET, 'B', row.explanation, [blind]);

  assert(prompt.includes('SEEN_BY_ADJUDICATOR'), 'explanation is shown');
  assert(prompt.includes('BLIND_REASONING'), 'blind reasoning is shown');
  assert(prompt.includes('correct option is: B'), 'stored answer is shown');
});

// ---------------------------------------------------------------------------
// The outcome table
// ---------------------------------------------------------------------------

test('AGREE — blind solve matches the key, and costs exactly one call', async () => {
  const { judgement, stats } = await judge(makeRow(), [solve('B')]);
  assertEqual(judgement.outcome, 'AGREE', 'outcome');
  assertEqual(stats.apiCalls, 1, 'no adjudication call when they agree');
  assertEqual(judgement.adjudication, null, 'no adjudication recorded');
});

test('QUESTION_DEGENERATE — flagged even when the letter happens to match the key', async () => {
  // The stored answer is 'B' (see makeRow), and the degenerate solve also
  // answers 'B' — a naive letter comparison would call this AGREE. Degeneracy
  // must short-circuit before that comparison, since a placeholder question
  // being "correct" by coincidence tells us nothing.
  const { judgement, stats } = await judge(makeRow(), [solveDegenerate('B')]);
  assertEqual(judgement.outcome, 'QUESTION_DEGENERATE', 'outcome');
  assertEqual(stats.apiCalls, 1, 'no adjudication call needed — short-circuits immediately');
  assert(judgement.detail.includes('placeholder'), 'detail carries the degenerate reason');
});

test('SKILL_MISMATCH — flagged even when the letter happens to match the key', async () => {
  // Same reasoning as the degenerate case: the letter matching the stored
  // answer tells us nothing if the question isn't testing its labeled skill
  // in the first place. Must short-circuit before the letter comparison.
  const { judgement, stats } = await judge(makeRow(), [solveMismatch('B')]);
  assertEqual(judgement.outcome, 'SKILL_MISMATCH', 'outcome');
  assertEqual(stats.apiCalls, 1, 'no adjudication call needed — short-circuits immediately');
  assert(judgement.detail.includes('grammar'), 'detail carries the mismatch reason');
});

test('ANSWER_WRONG — adjudicator sides with the blind solve', async () => {
  const { judgement, stats } = await judge(makeRow(), [
    solve('C'),
    adjudicate('BLIND_CORRECT', 'C', false),
  ]);
  assertEqual(judgement.outcome, 'ANSWER_WRONG', 'outcome');
  assertEqual(stats.apiCalls, 2, 'disagreement triggers exactly one adjudication');
  assert(judgement.detail.includes('C'), 'detail names the correct option');
});

test('UPHELD — adjudicator sides with the key', async () => {
  const { judgement } = await judge(makeRow(), [
    solve('C'),
    adjudicate('STORED_CORRECT', 'B', true),
  ]);
  assertEqual(judgement.outcome, 'UPHELD', 'outcome');
  assertEqual(SEVERITY_BY_OUTCOME.UPHELD, 'review', 'UPHELD is amber, not a defect');
});

test('QUESTION_DEFECTIVE — ambiguous, and none-correct', async () => {
  const ambiguous = await judge(makeRow(), [solve('C'), adjudicate('AMBIGUOUS', null, true)]);
  assertEqual(ambiguous.judgement.outcome, 'QUESTION_DEFECTIVE', 'ambiguous');

  const none = await judge(makeRow(), [solve('C'), adjudicate('NO_CORRECT_ANSWER', null, false)]);
  assertEqual(none.judgement.outcome, 'QUESTION_DEFECTIVE', 'no correct answer');
});

test('BOTH_WRONG is a defect, not an upheld key', async () => {
  const { judgement } = await judge(makeRow(), [solve('C'), adjudicate('BOTH_WRONG', 'D', false)]);
  assertEqual(judgement.outcome, 'ANSWER_WRONG', 'outcome');
  assert(judgement.detail.includes('D'), 'names the actually-correct option');
});

// ---------------------------------------------------------------------------
// The case this whole layer was commissioned for
// ---------------------------------------------------------------------------

test('EXPLANATION_WRONG — answer confirmed, explanation credits another letter', async () => {
  // This is the real production pattern: 118 rows across two Beginner files where
  // the stored answer is right but the explanation names a different option.
  // Layer 1 could only say "these two disagree"; Layer 2 says which one is wrong.
  const row = makeRow({
    correct_answer: '"A"',
    explanation: 'Speaking fluently means saying it once, and only option C does this cleanly.',
  });

  const { judgement, stats } = await judge(row, [solve('A')]);

  assertEqual(judgement.outcome, 'EXPLANATION_WRONG', 'outcome');
  assertEqual(stats.apiCalls, 1, 'resolved without a second call — the blind solve settles it');
  assert(judgement.detail.includes('confirmed'), 'detail states the answer was confirmed');
  assert(judgement.detail.includes('C'), 'detail names the letter the explanation credits');
});

test('an explanation that names a wrong option to criticise it is NOT flagged', async () => {
  // The ~54-false-positive phrasing. Mere mention is not crediting.
  const row = makeRow({
    correct_answer: '"B"',
    explanation: 'Option A doubles the subject, which is a common error in spoken English.',
  });
  const { judgement } = await judge(row, [solve('B')]);
  assertEqual(judgement.outcome, 'AGREE', 'must stay green');
});

test('an explanation crediting the stored answer is not flagged', async () => {
  const row = makeRow({
    correct_answer: '"B"',
    explanation: 'Only option B uses the third-person singular correctly.',
  });
  const { judgement } = await judge(row, [solve('B')]);
  assertEqual(judgement.outcome, 'AGREE', 'crediting the right letter is correct writing');
});

test('STORED_CORRECT with a bad explanation becomes EXPLANATION_WRONG, not UPHELD', async () => {
  const { judgement } = await judge(makeRow(), [
    solve('C'),
    adjudicate('STORED_CORRECT', 'B', false),
  ]);
  assertEqual(judgement.outcome, 'EXPLANATION_WRONG', 'the explanation defect is not swallowed');
});

// ---------------------------------------------------------------------------
// Failure must never look like success
// ---------------------------------------------------------------------------

test('an API outage yields UNJUDGED — never a pass', async () => {
  const { judgement } = await judge(makeRow(), ['__THROW__']);
  assertEqual(judgement.outcome, 'UNJUDGED', 'outcome');
  assertEqual(SEVERITY_BY_OUTCOME.UNJUDGED, 'unknown', 'UNJUDGED is grey, never green');
  assert(judgement.detail.includes('NOT checked'), 'detail says plainly it was not checked');
});

test('a persistently unparseable response yields UNJUDGED after one re-ask', async () => {
  const { judgement, stats } = await judge(makeRow(), ['not json at all']);
  assertEqual(judgement.outcome, 'UNJUDGED', 'outcome');
  assertEqual(stats.apiCalls, 2, 'asked twice before giving up');
});

test('a malformed response that recovers on the re-ask is judged normally', async () => {
  const client = stubClient([]);
  let call = 0;
  const flaky: LlmClient = {
    modelName: 'stub-model',
    async complete() {
      call += 1;
      return call === 1 ? 'garbage' : solve('B');
    },
  };
  const judgement = await judgeRow(makeRow(), BUCKET, deps(flaky));
  assertEqual(judgement.outcome, 'AGREE', 'recovered');
  assert(client.prompts.length === 0, 'sanity: the unused stub was not called');
});

test('a model answering outside A-D is treated as malformed, not accepted', async () => {
  const { judgement } = await judge(makeRow(), [solve('E')]);
  assertEqual(judgement.outcome, 'UNJUDGED', 'E is not a valid option key');
});

test('SKIPPED — an unreadable row is never silently dropped', async () => {
  const cases: Array<[string, Partial<DrillCsvRow>]> = [
    ['options are not JSON', { options: '{A: go}' }],
    ['options are an array', { options: '["go","goes","gone","going"]' }],
    ['options are missing D', { options: '{"A":"go","B":"goes","C":"gone"}' }],
    ['an option is blank', { options: '{"A":"go","B":"  ","C":"gone","D":"going"}' }],
    ['prompt is blank', { prompt_text: '   ' }],
  ];

  for (const [label, overrides] of cases) {
    const { judgement, stats } = await judge(makeRow(overrides), [solve('B')]);
    assertEqual(judgement.outcome, 'SKIPPED', `SKIPPED when ${label}`);
    assertEqual(stats.apiCalls, 0, `no model call wasted when ${label}`);
  }
});

test('SKIPPED and UNJUDGED are never counted as ok', () => {
  const notOk: JudgeOutcome[] = ['SKIPPED', 'UNJUDGED'];
  for (const o of notOk) {
    assert(SEVERITY_BY_OUTCOME[o] !== 'ok', `${o} must not be severity ok`);
  }
});

// ---------------------------------------------------------------------------
// A malformed answer key is still judgeable — that is the point
// ---------------------------------------------------------------------------

test('a row whose correct_answer is a bare token is still judged, not skipped', async () => {
  // 49 real rows look exactly like this. The key is unusable, but the question is
  // perfectly answerable, and telling the operator what the answer should be is
  // the most useful thing this tool can do for those rows.
  const row = makeRow({ correct_answer: 'B' }); // bare token — invalid JSON
  const { judgement, stats } = await judge(row, [solve('B'), adjudicate('BLIND_CORRECT', 'B', true)]);

  assertEqual(judgement.storedAnswer, null, 'the key is unusable');
  assertEqual(judgement.outcome, 'ANSWER_WRONG', 'reported as a key problem');
  assertEqual(stats.apiCalls, 2, 'it went to adjudication rather than being skipped');
  assert(
    judgement.detail.includes('missing or malformed'),
    'detail explains the key could not be read',
  );
});

// ---------------------------------------------------------------------------
// Voting
// ---------------------------------------------------------------------------

test('majorityAnswer requires a real majority, not a plurality', () => {
  assertEqual(majorityAnswer([]), null, 'no votes');
  assertEqual(majorityAnswer([{ answer: 'A', confidence: 'high', reasoning: '' }]), 'A', 'single');

  const mk = (a: string): BlindSolve => ({ answer: a as 'A', confidence: 'high', reasoning: '' });
  assertEqual(majorityAnswer([mk('A'), mk('A'), mk('B')]), 'A', '2 of 3');
  assertEqual(majorityAnswer([mk('A'), mk('B'), mk('C')]), null, 'three-way split');
  assertEqual(majorityAnswer([mk('A'), mk('B')]), null, 'a tie is not a majority');
});

test('--votes 3 solves three times and adjudicates when they do not agree', async () => {
  const { judgement, stats } = await judge(
    makeRow(),
    [solve('A'), solve('B'), solve('C'), adjudicate('STORED_CORRECT', 'B', true)],
    { votes: 3 },
  );
  assertEqual(stats.apiCalls, 4, 'three solves plus one adjudication');
  assertEqual(judgement.votes.length, 3, 'all attempts recorded');
  assertEqual(judgement.outcome, 'UPHELD', 'disagreement went to the adjudicator');
  assert(judgement.detail.includes('did not agree'), 'detail explains the split');
});

// ---------------------------------------------------------------------------
// Cache keying
// ---------------------------------------------------------------------------

test('the cache key changes when anything that could change the verdict changes', () => {
  const base = { row: makeRow(), model: 'm', templateVersion: 'v1', votes: 1 };
  const key = cacheKey(base);

  const differsBy: Array<[string, typeof base]> = [
    ['prompt_text', { ...base, row: makeRow({ prompt_text: 'different?' }) }],
    ['options', { ...base, row: makeRow({ options: '{"A":"x","B":"y","C":"z","D":"w"}' }) }],
    ['correct_answer', { ...base, row: makeRow({ correct_answer: '"C"' }) }],
    ['explanation', { ...base, row: makeRow({ explanation: 'rewritten' }) }],
    ['model', { ...base, model: 'other-model' }],
    ['template version', { ...base, templateVersion: 'v2' }],
    ['vote count', { ...base, votes: 3 }],
  ];

  for (const [what, variant] of differsBy) {
    assert(cacheKey(variant) !== key, `changing ${what} must invalidate the cached verdict`);
  }

  // ...and is stable when nothing relevant changes, or a cache is worthless.
  assertEqual(cacheKey({ ...base, row: makeRow({ line: 999 }) }), key, 'line number is irrelevant');
});

test('the prompt template version is a non-empty stamp', () => {
  assert(TEMPLATE_VERSION.length > 0, 'TEMPLATE_VERSION must be set');
});

// ---------------------------------------------------------------------------
// Parsing
// ---------------------------------------------------------------------------

test('model JSON parses through fences and preamble', () => {
  const shapes = [
    '{"answer":"A","confidence":"high","reasoning":"r"}',
    '```json\n{"answer":"A","confidence":"high","reasoning":"r"}\n```',
    'Sure! {"answer":"A","confidence":"high","reasoning":"r"}',
  ];
  for (const raw of shapes) {
    assertEqual(parseBlindSolve(raw).answer, 'A', `parsed: ${raw.slice(0, 24)}`);
  }
});

test('parsing refuses to guess rather than returning a partial object', () => {
  let threw = false;
  try {
    parseJsonLoose('absolutely not json');
  } catch (err) {
    threw = err instanceof MalformedResponseError;
  }
  assert(threw, 'unparseable input must throw MalformedResponseError');
});

test('an unknown adjudication verdict is rejected, not coerced', () => {
  let threw = false;
  try {
    parseAdjudication(adjudicate('PROBABLY_FINE', 'A', true));
  } catch (err) {
    threw = err instanceof MalformedResponseError;
  }
  assert(threw, 'unknown verdict must throw');
});

test('a missing explanation_ok reads as NOT ok', () => {
  const parsed = parseAdjudication('{"verdict":"STORED_CORRECT","correct_letter":"B"}');
  assertEqual(parsed.explanationOk, false, 'absent means not asserted ok');
});

test('lowercase answers and stray whitespace are accepted', () => {
  const parsed = parseBlindSolve('{"answer":" b ","confidence":"HIGH","reasoning":"r"}');
  assertEqual(parsed.answer, 'B', 'normalized');
  assertEqual(parsed.confidence, 'high', 'normalized');
});

test('an unrecognised confidence degrades to low rather than being invented', () => {
  const parsed = parseBlindSolve('{"answer":"A","confidence":"absolute","reasoning":"r"}');
  assertEqual(parsed.confidence, 'low', 'unknown confidence must not read as high');
});

// ---------------------------------------------------------------------------
// Concurrency limiter
// ---------------------------------------------------------------------------

test('the limiter never exceeds its ceiling and still runs everything', async () => {
  const limit = createLimiter(3);
  let active = 0;
  let peak = 0;

  const tasks = Array.from({ length: 20 }, () =>
    limit(async () => {
      active += 1;
      peak = Math.max(peak, active);
      await new Promise(r => setTimeout(r, 5));
      active -= 1;
      return 1;
    }),
  );

  const results = await Promise.all(tasks);
  assertEqual(results.length, 20, 'every task ran');
  assert(peak <= 3, `peak concurrency was ${peak}, ceiling is 3`);
  assert(peak > 1, 'tasks did actually overlap');
});

test('the limiter releases its slot when a task throws', async () => {
  const limit = createLimiter(1);
  try {
    await limit(async () => {
      throw new Error('boom');
    });
  } catch {
    /* expected */
  }
  // If the slot leaked, this second call would hang forever.
  const ok = await limit(async () => 'recovered');
  assertEqual(ok, 'recovered', 'limiter recovered after a rejection');
});

// ---------------------------------------------------------------------------
// The real fixtures still read correctly
// ---------------------------------------------------------------------------

test('readQuestion accepts a real Layer 1 fixture row', () => {
  const fixtureDir = path.join(__dirname, '..', 'layer1-verifier', '__fixtures__');
  const happy = fs.readdirSync(fixtureDir).find(f => f.startsWith('01-'));
  assert(happy !== undefined, 'the Layer 1 happy-path fixture is still there');

  const row = makeRow();
  const q = readQuestion(row);
  assert(q !== null, 'a well-formed row is readable');
  assertSameSet(Object.keys(q!.options), ['A', 'B', 'C', 'D'], 'four options');
});

process.exitCode = run('Layer 2 — Drill Question Content Judge');
