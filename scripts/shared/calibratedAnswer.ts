/**
 * Calibrated IELTS Writing/Speaking answer generator (shared).
 *
 * Gemini grades LLM-authored text too generously: a plain "write at band X" prompt
 * produces fluent English that the grader scores ~1.5 bands HIGH, so low-band targets
 * never land low. This generator injects band-authentic WEAKNESSES (grammar errors,
 * limited vocabulary, fillers, under-development) for lower targets so the GRADED band
 * — and the feedback prose — actually land at the target band.
 *
 * Single source of truth for both:
 *   - the seed-feedback batch (scripts/seeders-ai/genSeedFeedback.ts)
 *   - the student bot's live IA answers (scripts/bot/genAnswer.ts → generateAnswer)
 * so bot-driven IA grades stay on-persona instead of drifting upward over many IAs.
 */
import { GoogleGenerativeAI } from '@google/generative-ai';

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);
const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });

/** Retry a Gemini-backed call on transient errors (503/429/overloaded) with backoff. */
async function withRetry<T>(label: string, fn: () => Promise<T>, attempts = 4): Promise<T> {
  let lastErr: any;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (e: any) {
      lastErr = e;
      const msg = String(e?.message ?? e);
      const transient = /503|429|overload|unavailable|fetch/i.test(msg);
      if (!transient || i === attempts - 1) throw e;
      const waitMs = 1500 * Math.pow(2, i); // 1.5s, 3s, 6s
      console.warn(`    [retry] ${label} failed (${msg.slice(0, 60)}…) — retrying in ${waitMs}ms`);
      await new Promise(r => setTimeout(r, waitMs));
    }
  }
  throw lastErr;
}

/**
 * Generate an ON-TOPIC answer for `promptText` calibrated to `targetBand`. The lower the
 * band, the rougher the writing — so the real grader scores it near `targetBand` instead
 * of inflating it. Stays strictly on topic (the grader rightly flags off-topic text).
 */
export async function genCalibratedAnswer(
  promptText: string,
  kind: 'WRITING' | 'SPEAKING',
  targetBand: number,
): Promise<string> {
  const words = kind === 'WRITING' ? '170–250 words' : '90–150 words';
  const style = kind === 'WRITING' ? 'a written IELTS essay' : 'a natural spoken-style transcript with hesitations';

  // Band-authentic weakness profile — the lower the band, the rougher the writing.
  let profile: string;
  if (targetBand <= 4) {
    profile =
      'Write like a genuinely WEAK candidate: frequent grammatical errors (subject-verb agreement, ' +
      'articles, verb tenses, plurals), very limited and repetitive vocabulary, short simple sentences ' +
      'with little or no linking, ideas left undeveloped, and noticeably under-length. Make real, ' +
      'consistent mistakes — do NOT write clean English.';
  } else if (targetBand <= 5.5) {
    profile =
      'Write like a DEVELOPING candidate: noticeable and recurring grammar errors, basic everyday ' +
      'vocabulary with some misused words, mostly simple sentences with a few faulty complex attempts, ' +
      'and only partly developed ideas.';
  } else if (targetBand <= 6.5) {
    profile =
      'Write like a COMPETENT candidate: generally clear with occasional errors in complex structures, ' +
      'adequate vocabulary with some imprecision, and reasonably developed ideas.';
  } else {
    profile =
      'Write like a STRONG candidate: accurate and varied grammar, a wide and precise vocabulary, ' +
      'well-developed ideas, and natural cohesion — with only rare minor slips.';
  }
  if (kind === 'SPEAKING' && targetBand <= 5.5) {
    profile += ' Include frequent fillers (um, uh, like), false starts, and self-corrections.';
  }

  const instruction =
    `Simulate an IELTS candidate writing at approximately band ${targetBand.toFixed(1)}. ${profile} ` +
    `Produce ${style} that stays strictly ON TOPIC for the prompt below. ` +
    `Output ONLY the answer text (${words}) — no title, labels, scores, or commentary.\n\nPROMPT:\n${promptText}`;

  try {
    const text = await withRetry(`gen:${kind}`, async () => {
      const res = await model.generateContent(instruction);
      return res.response.text().trim();
    });
    if (text) return text;
  } catch (e: any) {
    console.warn(`    [genCalibratedAnswer] Gemini failed, using fallback: ${e.message}`);
  }
  // Fallback keeps it at least loosely on-topic if generation fails after retries.
  return 'In response to the prompt, I think this is important and there are points on both sides.';
}
