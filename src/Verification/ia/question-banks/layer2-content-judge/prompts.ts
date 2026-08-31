/**
 * Prompt templates, and the version stamp that guards the cache. Ported from
 * diagnostic's prompts.ts — same difficulty bar (IA questions must genuinely
 * discriminate students, not just have a correct answer) and same
 * blind-solve / adjudicate / prompt-quality shapes.
 */

import type { OptionKey } from '../shared/types';
import type { BlindSolve, QuestionView } from './types';

export const TEMPLATE_VERSION = 'v1';

function renderOptions(options: Record<OptionKey, string> | null): string {
  if (!options) return '(True / False / Not Given)';
  return (['A', 'B', 'C', 'D'] as OptionKey[]).map(key => `${key}) ${options[key]}`).join('\n');
}

function groundingBlock(view: QuestionView): string {
  if (!view.passageOrAudioContext) return '';
  return `PASSAGE:\n${view.passageOrAudioContext}\n\n`;
}

export function blindSolvePrompt(view: QuestionView, skillLabel: string, isTfng: boolean): string {
  return `You are a strict, experienced IELTS examiner reviewing an INTERNAL ASSESSMENT (IA) question.
IA questions are used for graded assessment, so difficulty is a real grading criterion — a
question that's too easy tells us nothing useful about the student's actual ability.

${groundingBlock(view)}QUESTION:
${view.promptText}

${isTfng ? 'Answer True, False, or Not Given based STRICTLY on what the passage states — not outside knowledge.' : 'OPTIONS:\n' + renderOptions(view.options)}

${isTfng ? '' : 'Choose the single best option, judged on its merits.\n'}
Before answering, check two things:
1. Is this a REAL, genuine question — not placeholder/template junk (e.g. options that are
   literally "Option A"/"Option B", or a prompt with no real content to reason about)? If it's
   degenerate, set "is_degenerate" to true and say why.
2. Is this question actually HARD — would it meaningfully challenge a genuinely strong student,
   requiring careful attention to specific detail rather than being answerable from general
   knowledge or common sense alone? If it's too easy to usefully discriminate students, set
   "is_too_easy" to true and say why.

Respond with JSON only:
{"answer":"${isTfng ? 'T|F|NG' : 'A|B|C|D'}","confidence":"high|medium|low","reasoning":"one or two sentences",
 "is_degenerate":true|false,"degenerate_reason":"one sentence or empty string",
 "is_too_easy":true|false,"too_easy_reason":"one sentence or empty string"}`;
}

export function adjudicatePrompt(
  view: QuestionView,
  isTfng: boolean,
  storedAnswer: string | null,
  blindAnswer: BlindSolve,
): string {
  return `You are a senior IELTS content reviewer auditing an Internal Assessment question bank.

${groundingBlock(view)}QUESTION:
${view.promptText}

${isTfng ? '(Answer domain: True / False / Not Given)' : 'OPTIONS:\n' + renderOptions(view.options)}

The answer key says the correct answer is: ${storedAnswer ?? '(missing or malformed)'}

An independent examiner, not shown the key, answered: ${blindAnswer.answer} (confidence ${blindAnswer.confidence}) — ${blindAnswer.reasoning}

They disagree. Decide who is right, or whether the question itself is at fault.

Use these verdicts:
- STORED_CORRECT      the answer key is right; the independent examiner erred
- BLIND_CORRECT       the independent examiner is right; the answer key is wrong
- BOTH_WRONG          neither is right; name the actual correct answer
- AMBIGUOUS           more than one answer is defensibly correct given the passage
- NO_CORRECT_ANSWER   none of the options/answers is actually correct

Respond with JSON only:
{"verdict":"STORED_CORRECT|BLIND_CORRECT|BOTH_WRONG|AMBIGUOUS|NO_CORRECT_ANSWER",
 "correct_answer":"${isTfng ? 'T|F|NG or null' : 'A|B|C|D or null'}",
 "reasoning":"two or three sentences"}`;
}

/**
 * WRITING_PROMPT / SPEAKING_PROMPT rows have no stored answer — the row IS
 * the content being judged. SPEAKING_PROMPT gets the identical prompt-quality
 * judgement as WRITING_PROMPT: no transcript exists at authoring time, only
 * once a real student answers live later.
 */
export function promptQualityPrompt(promptText: string, skillLabel: 'WRITING' | 'SPEAKING'): string {
  return `You are a strict, experienced IELTS examiner reviewing an Internal Assessment ${skillLabel} prompt.
IA prompts are used for graded assessment, so difficulty and clarity both matter — a prompt that's
easy to write/speak well on regardless of actual ability, or one that's vague/ambiguous, undermines
the assessment.

PROMPT:
${promptText}

Judge it against these criteria:
1. CLARITY — is it unambiguous what the student is being asked to do?
2. GENUINE DIFFICULTY — does it require real command of the language and genuine reasoning/
   organization to answer well, or could almost anyone produce a passable answer with minimal
   effort?
3. FAIRNESS/ANSWERABILITY — is it something a student could reasonably be expected to have an
   opinion on or experience with, without requiring specialized outside knowledge?
4. NOT DEGENERATE — is this a genuine, substantive prompt, not placeholder/template junk?

Respond with JSON only:
{"outcome":"GOOD|TOO_EASY|AMBIGUOUS|DEGENERATE","reasoning":"two or three sentences"}`;
}
