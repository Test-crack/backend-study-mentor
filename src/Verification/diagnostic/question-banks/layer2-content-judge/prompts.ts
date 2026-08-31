/**
 * Prompt templates, and the version stamp that guards the cache.
 *
 * TEMPLATE_VERSION is part of every cache key — bump it whenever wording below
 * changes in a way that could change a verdict, or the cache would silently
 * keep serving judgements produced by the previous prompt.
 *
 * Difficulty bar: per direct correction from the user (2026-08-16), these
 * questions are meant to be genuinely HARD, not "middling" — the diagnostic
 * exists to accurately place a student, and an easy diagnostic that everyone
 * does well on doesn't reveal anything. Every prompt below asks the model to
 * judge discriminating difficulty as a real pass/fail criterion, not just
 * correctness.
 */

import type { OptionKey } from '../shared/types';
import type { BlindSolve, QuestionView } from './types';

export const TEMPLATE_VERSION = 'v1';

function renderOptions(options: Record<OptionKey, string> | null): string {
  if (!options) return '(True / False / Not Given)';
  return (['A', 'B', 'C', 'D'] as OptionKey[]).map(key => `${key}) ${options[key]}`).join('\n');
}

function groundingBlock(view: QuestionView, skillLabel: string): string {
  if (!view.passageOrTranscript) return '';
  const label = skillLabel === 'LISTENING' ? 'TRANSCRIPT OF THE AUDIO' : 'PASSAGE';
  return `${label}:\n${view.passageOrTranscript}\n\n`;
}

/**
 * Pass 1 — answer the question cold, exactly like drills' blind solve: no
 * stored answer or explanation shown, since a model shown the "intended"
 * answer will just construct a justification for it.
 */
export function blindSolvePrompt(view: QuestionView, skillLabel: string, isTfng: boolean): string {
  return `You are a strict, experienced IELTS examiner reviewing a DIAGNOSTIC test question. This
diagnostic exists to accurately place a student's true skill level — a question that's too easy
tells us nothing useful, so difficulty is a real grading criterion here, not just correctness.

${groundingBlock(view, skillLabel)}QUESTION:
${view.promptText}

${isTfng ? 'Decide whether this statement is True, False, or Not Given, based STRICTLY on what the text/transcript states — not outside knowledge. In your JSON answer, use the single-letter code only: "T" for True, "F" for False, "NG" for Not Given — never the full word.' : 'OPTIONS:\n' + renderOptions(view.options)}

${isTfng ? '' : 'Choose the single best option, judged on its merits.\n'}
Before answering, check two things:
1. Is this a REAL, genuine question — not placeholder/template junk (e.g. options that are
   literally "Option A"/"Option B", or a prompt with no real content to reason about)? If it's
   degenerate, set "is_degenerate" to true and say why.
2. Is this question actually HARD — would it meaningfully challenge a genuinely strong student,
   requiring careful attention to specific detail rather than being answerable from general
   knowledge or common sense alone? If it's too easy to usefully discriminate students, set
   "is_too_easy" to true and say why. Do NOT set this just because a question is straightforward
   to answer once you've read the material carefully — "too easy" means a student could get it
   right without really engaging with the specific content at all.

Respond with JSON only:
{"answer":"${isTfng ? 'T|F|NG' : 'A|B|C|D'}","confidence":"high|medium|low","reasoning":"one or two sentences",
 "is_degenerate":true|false,"degenerate_reason":"one sentence or empty string",
 "is_too_easy":true|false,"too_easy_reason":"one sentence or empty string"}`;
}

export function adjudicatePrompt(
  view: QuestionView,
  skillLabel: string,
  isTfng: boolean,
  storedAnswer: string | null,
  blindAnswer: BlindSolve,
): string {
  return `You are a senior IELTS content reviewer auditing a diagnostic question bank.

${groundingBlock(view, skillLabel)}QUESTION:
${view.promptText}

${isTfng ? '(Answer domain: True / False / Not Given)' : 'OPTIONS:\n' + renderOptions(view.options)}

The answer key says the correct answer is: ${storedAnswer ?? '(missing or malformed)'}

An independent examiner, not shown the key, answered: ${blindAnswer.answer} (confidence ${blindAnswer.confidence}) — ${blindAnswer.reasoning}

They disagree. Decide who is right, or whether the question itself is at fault.

Use these verdicts:
- STORED_CORRECT      the answer key is right; the independent examiner erred
- BLIND_CORRECT       the independent examiner is right; the answer key is wrong
- BOTH_WRONG          neither is right; name the actual correct answer
- AMBIGUOUS           more than one answer is defensibly correct given the text
- NO_CORRECT_ANSWER   none of the options/answers is actually correct

Respond with JSON only:
{"verdict":"STORED_CORRECT|BLIND_CORRECT|BOTH_WRONG|AMBIGUOUS|NO_CORRECT_ANSWER",
 "correct_answer":"${isTfng ? 'T|F|NG or null' : 'A|B|C|D or null'}",
 "reasoning":"two or three sentences"}`;
}

/**
 * WRITING_PROMPT / SPEAKING_PROMPT rows have no stored answer to blind-solve
 * against — the row IS the content being judged, not a question about some
 * other content. This asks a direct quality question instead.
 */
export function promptQualityPrompt(promptText: string, skillLabel: 'WRITING' | 'SPEAKING', minWords: number | null): string {
  return `You are a strict, experienced IELTS examiner reviewing a DIAGNOSTIC ${skillLabel} prompt.
This diagnostic exists to accurately place a student's true skill level, so difficulty and clarity
both matter — a prompt that's easy to write/speak well on regardless of actual ability, or one
that's vague/ambiguous, undermines the whole diagnostic.

PROMPT:
${promptText}
${minWords ? `\nRequired minimum length: ${minWords} words.` : ''}

Judge it against these criteria:
1. CLARITY — is it unambiguous what the student is being asked to do? A prompt that could be
   interpreted multiple ways, or that doesn't give enough to work with, is defective.
2. GENUINE DIFFICULTY — does it require real command of the language and genuine reasoning/
   organization to answer well, or could almost anyone produce a passable answer with minimal
   effort? Reject prompts that are so generic or simple that they fail to discriminate between a
   weak and a strong student.
3. FAIRNESS/ANSWERABILITY — is it something a student could reasonably be expected to have an
   opinion on or experience with, without requiring specialized outside knowledge? (Being hard
   should come from requiring skillful language use, not from requiring facts most people don't have.)
4. NOT DEGENERATE — is this a genuine, substantive prompt, not placeholder/template junk?

Respond with JSON only:
{"outcome":"GOOD|TOO_EASY|AMBIGUOUS|DEGENERATE","reasoning":"two or three sentences"}`;
}
