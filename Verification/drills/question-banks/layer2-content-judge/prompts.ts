/**
 * The two prompts, and the version stamp that guards the cache.
 *
 * TEMPLATE_VERSION is part of every cache key. Without it, editing a prompt would
 * silently keep serving verdicts produced by the *previous* prompt — the tool
 * would look like it re-ran and agreed with itself. Bump this whenever the
 * wording below changes in a way that could change an answer.
 */

import type { BucketTriple, OptionKey } from '../shared/types';
import type { BlindSolve, QuestionView } from './types';

export const TEMPLATE_VERSION = 'v3';

function renderOptions(options: Record<OptionKey, string>): string {
  return (['A', 'B', 'C', 'D'] as OptionKey[])
    .map(key => `${key}) ${options[key]}`)
    .join('\n');
}

function context(bucket: BucketTriple | null): string {
  if (!bucket) return 'IELTS practice question.';
  return (
    `IELTS ${bucket.level.toLowerCase()}-level practice question testing ` +
    `${bucket.skill.toLowerCase()} / ${bucket.sub_skill.toLowerCase().replace('_', ' ')}.`
  );
}

/**
 * Pass 1 — answer the question cold.
 *
 * The stored answer and the stored explanation are deliberately absent. Shown the
 * intended answer, a model will reliably construct a justification for it, which
 * produces agreement that means nothing. An independent attempt is the only thing
 * here that carries information.
 */
export function blindSolvePrompt(question: QuestionView, bucket: BucketTriple | null): string {
  return `You are an experienced IELTS examiner. Answer this multiple-choice question.

${context(bucket)}

QUESTION:
${question.promptText}

OPTIONS:
${renderOptions(question.options)}

Choose the single best option. Judge it on its merits — do not assume any
particular letter is intended. If two options seem equally correct, or none is
correct, still pick the closest and set confidence to "low".

Before answering, check whether this is a REAL question at all. Some rows in
this question bank are placeholder/template junk that was never actually
authored — for example, options that are literally the words "Option A",
"Option B", "Choice 1", etc. instead of real content, or a prompt whose only
distinguishing content is its own row number (e.g. "...conversation number
47?"). If the options don't contain genuine, substantive content that a real
test-taker could reason about, set "is_degenerate" to true and briefly say why.
Do NOT set is_degenerate just because a question is easy, oddly worded, or one
you'd personally write differently — reserve it for options/prompts that carry
no real content at all.

${bucket ? `Also check whether this question's actual content genuinely tests ` +
  `${bucket.skill.toLowerCase()} / ${bucket.sub_skill.toLowerCase().replace('_', ' ')} ` +
  `specifically — not just whether it's labeled that way. For example, a row ` +
  `labeled VOCABULARY should be testing word meaning/choice/collocation, not ` +
  `verb tense or sentence structure (that would be GRAMMAR); a row labeled ` +
  `PRONUNCIATION should be about sounds/stress, not word meaning (VOCABULARY). ` +
  `If the content is really testing a different skill or sub-skill than the one ` +
  `stated above, set "tests_intended_skill" to false and briefly say what it's ` +
  `actually testing instead. Judge this independently of whether the question is ` +
  `otherwise well-written — a good question in the wrong bucket still counts as ` +
  `a mismatch.\n\n` : ''}Respond with JSON only:
{"answer":"A|B|C|D","confidence":"high|medium|low","reasoning":"one or two sentences",
 "is_degenerate":true|false,"degenerate_reason":"one sentence, or empty string if not degenerate",
 "tests_intended_skill":true|false,"skill_mismatch_reason":"one sentence, or empty string if it matches"}`;
}

/**
 * Pass 2 — referee a disagreement.
 *
 * Only runs where pass 1 and the stored answer differ. Now the model sees
 * everything, because the job has changed: it is no longer answering the
 * question, it is deciding which of two candidate answers is right — or whether
 * the question itself is the problem, which is a real and separate outcome.
 */
export function adjudicatePrompt(
  question: QuestionView,
  bucket: BucketTriple | null,
  storedAnswer: OptionKey | null,
  storedExplanation: string,
  blindAttempts: BlindSolve[],
): string {
  const attempts = blindAttempts
    .map((b, i) => `  Attempt ${i + 1}: ${b.answer} (confidence ${b.confidence}) — ${b.reasoning}`)
    .join('\n');

  return `You are a senior IELTS content reviewer auditing a question bank.

${context(bucket)}

QUESTION:
${question.promptText}

OPTIONS:
${renderOptions(question.options)}

The answer key says the correct option is: ${storedAnswer ?? '(missing or malformed)'}

The key's explanation reads:
"${storedExplanation.trim() || '(no explanation provided)'}"

An independent examiner, who was not shown the key, answered:
${attempts}

They disagree. Decide who is right, or whether the question itself is at fault.

Use these verdicts:
- STORED_CORRECT      the answer key is right; the independent examiner erred
- BLIND_CORRECT       the independent examiner is right; the answer key is wrong
- BOTH_WRONG          neither chose the right option; name the right one
- AMBIGUOUS           more than one option is defensibly correct
- NO_CORRECT_ANSWER   none of the four options is correct

Also judge the explanation separately from the answer. An explanation is NOT ok
if it names or credits a different option than the correct one, or if its
reasoning contradicts the correct answer. Note that an explanation may correctly
mention a wrong option in order to say why it is wrong — that is good writing,
not a fault.

Respond with JSON only:
{"verdict":"STORED_CORRECT|BLIND_CORRECT|BOTH_WRONG|AMBIGUOUS|NO_CORRECT_ANSWER",
 "correct_letter":"A|B|C|D or null",
 "explanation_ok":true|false,
 "reasoning":"two or three sentences"}`;
}
