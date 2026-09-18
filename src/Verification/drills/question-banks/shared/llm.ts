/**
 * The model client, behind an interface.
 *
 * The interface is the point. Every regression test for Layer 2 runs against a
 * stub implementation — deterministic, free, offline — so the judging logic can
 * be tested without a network call or an API key. An AI QA tool whose own logic
 * is untested is exactly what got the last one deleted.
 *
 * Repo conventions followed here: `@google/generative-ai` (the SDK actually used
 * across src/), `gemini-2.5-flash` (the model every other caller uses), and the
 * `withRetry` shape copy-pasted in three seeder scripts — factored out once.
 */

import { GoogleGenerativeAI } from '@google/generative-ai';

export interface LlmRequest {
  /** Label used in retry/error logs so a failure can be traced to a row. */
  label: string;
  prompt: string;
}

export interface LlmClient {
  /** Model identifier, recorded in the cache key so a model change invalidates it. */
  readonly modelName: string;
  /** Returns raw model text. Throws on unrecoverable failure. */
  complete(request: LlmRequest): Promise<string>;
}

// ---------------------------------------------------------------------------
// Retry
// ---------------------------------------------------------------------------

/** Errors worth retrying: rate limits, overload, transient transport failures. */
const TRANSIENT_RE = /503|502|500|429|overload|unavailable|timeout|fetch|ECONNRESET|ETIMEDOUT/i;

export async function withRetry<T>(
  label: string,
  fn: () => Promise<T>,
  attempts = 4,
  onRetry: (message: string) => void = () => {},
): Promise<T> {
  let lastErr: unknown;

  for (let i = 0; i < attempts; i += 1) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      const msg = err instanceof Error ? err.message : String(err);
      if (!TRANSIENT_RE.test(msg) || i === attempts - 1) throw err;
      const waitMs = 1500 * 2 ** i; // 1.5s, 3s, 6s
      onRetry(`${label} failed (${msg.slice(0, 70)}) — retrying in ${waitMs}ms`);
      await new Promise(resolve => setTimeout(resolve, waitMs));
    }
  }

  throw lastErr;
}

// ---------------------------------------------------------------------------
// Concurrency
// ---------------------------------------------------------------------------

/**
 * Minimal concurrency limiter. The repo has none — seeder scripts either run
 * sequentially or fire unbounded `Promise.all` — and judging thousands of rows
 * needs a ceiling to avoid tripping rate limits.
 */
export function createLimiter(maxConcurrent: number): <T>(fn: () => Promise<T>) => Promise<T> {
  let active = 0;
  const queue: Array<() => void> = [];

  const next = (): void => {
    active -= 1;
    const resume = queue.shift();
    if (resume) resume();
  };

  return async function limited<T>(fn: () => Promise<T>): Promise<T> {
    if (active >= maxConcurrent) {
      await new Promise<void>(resolve => queue.push(resolve));
    }
    active += 1;
    try {
      return await fn();
    } finally {
      next();
    }
  };
}

// ---------------------------------------------------------------------------
// Gemini
// ---------------------------------------------------------------------------

export const DEFAULT_MODEL = 'gemini-2.5-flash';

export interface GeminiOptions {
  apiKey: string;
  modelName?: string;
  onRetry?: (message: string) => void;
}

export function createGeminiClient(options: GeminiOptions): LlmClient {
  const modelName = options.modelName ?? DEFAULT_MODEL;
  const genAI = new GoogleGenerativeAI(options.apiKey);

  // `responseMimeType: 'application/json'` makes the model emit bare JSON instead
  // of prose wrapped in code fences. Parsing stays defensive anyway — see
  // parseJsonLoose — because a formatting guarantee is not a content guarantee.
  const model = genAI.getGenerativeModel({
    model: modelName,
    generationConfig: {
      responseMimeType: 'application/json',
      // Judging should be reproducible run to run, so no sampling.
      temperature: 0,
    },
  });

  return {
    modelName,
    async complete({ label, prompt }: LlmRequest): Promise<string> {
      return withRetry(
        label,
        async () => {
          const result = await model.generateContent(prompt);
          return result.response.text();
        },
        4,
        options.onRetry ?? (() => {}),
      );
    },
  };
}

export interface ResolvedKey {
  key: string;
  /** Which env var it came from — printed at startup so the run is unambiguous. */
  source: 'GEMINI_API_KEY' | 'GEMINI_QA_API_KEY';
}

/**
 * Resolve the API key, preferring the main `GEMINI_API_KEY` that the rest of the
 * app uses. `GEMINI_QA_API_KEY` remains a fallback for anyone who wants
 * question-bank QA billed separately, but it is no longer the default — a
 * separate key is a separate thing to keep valid, and a stale one shows up as a
 * wall of failed calls.
 */
export function resolveApiKey(env: NodeJS.ProcessEnv = process.env): ResolvedKey | null {
  const main = env.GEMINI_API_KEY?.trim();
  if (main) return { key: main, source: 'GEMINI_API_KEY' };

  const qa = env.GEMINI_QA_API_KEY?.trim();
  if (qa) return { key: qa, source: 'GEMINI_QA_API_KEY' };

  return null;
}

// ---------------------------------------------------------------------------
// Parsing
// ---------------------------------------------------------------------------

export class MalformedResponseError extends Error {}

/**
 * Parse model output that is *supposed* to be JSON.
 *
 * Handles the three shapes seen in practice: bare JSON, JSON inside ``` fences,
 * and JSON with a sentence of preamble. Throws rather than returning a partial
 * object — a judgement built from a half-understood response is worse than an
 * admitted failure.
 */
export function parseJsonLoose(raw: string): unknown {
  const text = raw.trim();

  const attempts = [
    text,
    text.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '').trim(),
    (text.match(/\{[\s\S]*\}/) ?? [''])[0],
  ];

  for (const candidate of attempts) {
    if (!candidate) continue;
    try {
      return JSON.parse(candidate);
    } catch {
      /* try the next shape */
    }
  }

  throw new MalformedResponseError(
    `Model did not return parseable JSON. First 200 chars: ${text.slice(0, 200)}`,
  );
}
