/**
 * Regression tests for IA Layer 2 — offline, against a stub LlmClient.
 *
 *   npx ts-node --project tsconfig.dev.json Verification/ia/question-banks/layer2-content-judge/layer2.spec.ts
 *   npm run ia:judge:test
 *
 * The shared testRunner (drills/.../shared/testRunner.ts) is synchronous
 * only, and every assertion here depends on an awaited model call, so this
 * file drives its own tiny async loop instead of importing `test`/`run` from
 * it — same assertion helpers, different driver.
 */

import { AssertionError, assertEqual } from '../../../drills/question-banks/shared/testRunner';
import type { LlmClient, LlmRequest } from '../../../drills/question-banks/shared/llm';
import type { IACsvRow } from '../shared/types';
import { judgeAnswerRow, judgePromptRow, readQuestionView } from './judge';

function makeStubClient(responder: (req: LlmRequest) => string): LlmClient {
  return {
    modelName: 'stub-model',
    async complete(req: LlmRequest): Promise<string> {
      return responder(req);
    },
  };
}

function baseRow(overrides: Partial<IACsvRow>): IACsvRow {
  return {
    line: 2,
    cells: [],
    skill: 'READING',
    sub_skill: 'READING',
    difficulty: 'BEGINNER',
    question_type: 'MCQ',
    passage_id: 'p1',
    passage_text: 'The sun rises in the east.',
    audio_url: '',
    prompt_text: 'Where does the sun rise?',
    options: '{"A":"East","B":"West","C":"North","D":"South"}',
    correct_answer: '"A"',
    explanation: 'The passage says so.',
    exam_type: 'IELTS',
    ...overrides,
  };
}

function deps(client: LlmClient) {
  return {
    client,
    limit: <T>(fn: () => Promise<T>) => fn(),
    useCache: false,
    stats: { apiCalls: 0, cacheHits: 0 },
  };
}

interface AsyncTest {
  name: string;
  fn: () => Promise<void>;
}

const tests: AsyncTest[] = [];
function test(name: string, fn: () => Promise<void>): void {
  tests.push({ name, fn });
}

test('readQuestionView reads a well-formed MCQ row', async () => {
  const view = readQuestionView(baseRow({}));
  assertEqual(view !== null, true, 'view is non-null');
  assertEqual(view?.options?.A, 'East', 'option A text');
});

test('readQuestionView returns null options for a TFNG row (handled separately)', async () => {
  const view = readQuestionView(baseRow({ question_type: 'TFNG', options: '' }));
  assertEqual(view?.options ?? null, null, 'TFNG has no options object');
});

test('a blind solve that agrees with the stored key produces AGREE', async () => {
  const client = makeStubClient(() => JSON.stringify({ answer: 'A', confidence: 'high', reasoning: 'obvious', is_degenerate: false, is_too_easy: false }));
  const j = await judgeAnswerRow(baseRow({}), deps(client));
  assertEqual(j.outcome, 'AGREE', 'agree outcome');
});

test('a blind solve flagged degenerate short-circuits to QUESTION_DEGENERATE', async () => {
  const client = makeStubClient(() =>
    JSON.stringify({ answer: 'A', confidence: 'low', reasoning: '', is_degenerate: true, degenerate_reason: 'placeholder options', is_too_easy: false }),
  );
  const j = await judgeAnswerRow(baseRow({}), deps(client));
  assertEqual(j.outcome, 'QUESTION_DEGENERATE', 'degenerate outcome');
});

test('a disagreement is adjudicated, and STORED_CORRECT maps to UPHELD', async () => {
  let call = 0;
  const client = makeStubClient(() => {
    call += 1;
    if (call === 1) return JSON.stringify({ answer: 'B', confidence: 'medium', reasoning: 'thought B', is_degenerate: false, is_too_easy: false });
    return JSON.stringify({ verdict: 'STORED_CORRECT', correct_answer: 'A', reasoning: 'A is right' });
  });
  const j = await judgeAnswerRow(baseRow({}), deps(client));
  assertEqual(j.outcome, 'UPHELD', 'upheld outcome');
});

test('a WRITING_PROMPT row with no stored answer goes through the prompt-quality path', async () => {
  const client = makeStubClient(() => JSON.stringify({ outcome: 'GOOD', reasoning: 'clear and hard' }));
  const row = baseRow({
    skill: 'WRITING',
    sub_skill: 'TASK_RESPONSE',
    question_type: 'WRITING_PROMPT',
    options: '',
    correct_answer: '',
    passage_text: '',
    prompt_text: 'Discuss the pros and cons of remote work.',
  });
  const j = await judgePromptRow(row, deps(client));
  assertEqual(j.outcome, 'GOOD', 'good prompt outcome');
});

test('a SPEAKING_PROMPT row gets the identical prompt-quality path as WRITING_PROMPT', async () => {
  const client = makeStubClient(() => JSON.stringify({ outcome: 'DEGENERATE', reasoning: 'placeholder text' }));
  const row = baseRow({
    skill: 'SPEAKING',
    sub_skill: 'FLUENCY',
    question_type: 'SPEAKING_PROMPT',
    options: '',
    correct_answer: '',
    passage_text: '',
    prompt_text: 'Topic 1',
  });
  const j = await judgePromptRow(row, deps(client));
  assertEqual(j.outcome, 'DEGENERATE', 'degenerate prompt outcome');
});

async function main(): Promise<number> {
  console.log('\nIA Layer 2 — content judge\n───────────────────────────\n');
  let passed = 0;
  const failures: Array<{ name: string; error: unknown }> = [];

  for (const t of tests) {
    try {
      await t.fn();
      passed += 1;
      console.log(`  ok    ${t.name}`);
    } catch (err) {
      failures.push({ name: t.name, error: err });
      console.log(`  FAIL  ${t.name}`);
    }
  }

  console.log();
  if (failures.length > 0) {
    console.log(`${failures.length} failure(s):\n`);
    for (const f of failures) {
      console.log(`  ✗ ${f.name}`);
      console.log(`      ${f.error instanceof AssertionError ? f.error.message : String(f.error)}`);
    }
  }
  console.log(`${passed}/${tests.length} tests passed.`);

  if (tests.length === 0) return 1;
  return failures.length > 0 ? 1 : 0;
}

main().then(code => {
  process.exitCode = code;
});
