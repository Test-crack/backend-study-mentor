/**
 * Generate an ON-TOPIC IELTS Writing/Speaking answer for a given prompt at a target
 * band. The bot can't use fixed canned text — the real grader checks the answer against
 * the actual prompt and (rightly) flags off-topic text.
 *
 * This now delegates to the shared CALIBRATED generator (scripts/shared/calibratedAnswer),
 * the same one the seed-feedback batch uses. A plain "write at band X" prompt produces
 * fluent text that Gemini grades ~1.5 bands HIGH, which would drift the at-risk personas'
 * competency bands upward over many bot-driven IAs. The calibrated generator injects
 * band-authentic weaknesses for lower targets so graded bands land on-persona.
 */
export { genCalibratedAnswer as generateAnswer } from '../shared/calibratedAnswer';
