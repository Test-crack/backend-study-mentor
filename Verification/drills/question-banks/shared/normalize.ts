/**
 * Text normalization used by every verification check.
 *
 * All of this exists because the CSVs are spreadsheet exports. That means the
 * text has been through a word processor: curly apostrophes, non-breaking
 * spaces, occasional zero-width characters, and combining-accent forms that
 * look identical but compare unequal.
 *
 * Two prompts that differ only by a straight vs. curly apostrophe are the same
 * question to a student, so they must be the same question to the duplicate
 * detector — a duplicate check that misses them is worse than useless, because
 * it reports "clean" on a file that is not.
 */

// Every character class below is written with \u escapes rather than pasted
// literals. Several of these characters are invisible in an editor, and a
// well-meaning "cleanup" that deleted one from a literal class would silently
// weaken every duplicate check downstream with no visible diff.

/** Zero-width space / non-joiner / joiner, word joiner, and BOM. */
const INVISIBLE_RE = /[​‌‍⁠﻿]/g;

/** Everything Unicode treats as a space, including NBSP (U+00A0). */
const UNICODE_SPACE_RE = /[   -   　]/g;

/** Curly single quotes and primes -> ASCII apostrophe. */
const SMART_SINGLE_RE = /[‘’‚‛′‵]/g;

/** Curly double quotes -> ASCII double quote. */
const SMART_DOUBLE_RE = /[“”„‟″‶]/g;

/** Figure / en / em dash, horizontal bar, minus sign -> ASCII hyphen. */
const DASH_RE = /[‐-―−]/g;

/** Ellipsis -> three dots, so "wait…" and "wait..." compare equal. */
const ELLIPSIS_RE = /…/g;

/**
 * Fold the typographic variations a spreadsheet introduces, without changing
 * what the text says. NFC first, so pre-composed and combining forms of an
 * accented character agree before anything else is compared.
 */
export function foldTypography(input: string): string {
  return input
    .normalize('NFC')
    .replace(INVISIBLE_RE, '')
    .replace(UNICODE_SPACE_RE, ' ')
    .replace(SMART_SINGLE_RE, "'")
    .replace(SMART_DOUBLE_RE, '"')
    .replace(DASH_RE, '-')
    .replace(ELLIPSIS_RE, '...');
}

/**
 * Trim and collapse internal whitespace. Used for emptiness checks, where we
 * care whether there is any real content, not what it says.
 */
export function collapseWhitespace(input: string): string {
  return foldTypography(input).replace(/\s+/g, ' ').trim();
}

/** True when a cell holds nothing but whitespace / invisible characters. */
export function isBlank(input: string | undefined | null): boolean {
  return input === undefined || input === null || collapseWhitespace(input) === '';
}

/**
 * Normalize a CSV header cell for comparison against EXPECTED_HEADER.
 *
 * Real batches disagree on casing and on space-vs-underscore: one export writes
 * `sub_skill`, another writes `Sub Skill`. Both are fine; we compare meaning.
 */
export function normalizeHeaderCell(input: string): string {
  return collapseWhitespace(input)
    .toLowerCase()
    .replace(/\s+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '');
}

/**
 * Canonical form of a prompt for duplicate detection: typography folded, case
 * folded, whitespace collapsed.
 *
 * Deliberately does NOT strip punctuation. "What is the answer?" and "What is
 * the answer" are different enough to be intentional, and over-normalizing here
 * would hide real distinctions between similar questions — the opposite failure
 * mode from missing a curly-quote duplicate, and just as bad.
 */
export function normalizeForDuplicateCheck(input: string): string {
  return collapseWhitespace(input).toLowerCase();
}

/**
 * Canonical form of an option's text — like the prompt form, but CASE-SENSITIVE.
 *
 * Case carries meaning in this corpus: pronunciation items mark stress with
 * capitals, so `RECord` / `reCORD` / `REcord` / `recORD` are four genuinely
 * different options that a case-folding comparison would report as one repeated
 * four times. Folding case here would raise a hard, import-blocking failure on
 * every correctly-written stress question in the SPEAKING/PRONUNCIATION banks.
 *
 * The confirmed production bug this check exists for — two options with the same
 * text — was byte-identical, so case-sensitivity loses nothing real.
 */
export function normalizeOptionText(input: string): string {
  return collapseWhitespace(input);
}

/**
 * Extract the "words" of a filename as an uppercase set, by splitting on every
 * non-letter character.
 *
 * Filenames in the wild separate the skill from the sub-skill with `·`, `-`,
 * one space, two spaces, an underscore, or nothing at all, and sometimes carry a
 * leading `_`. Rather than trying to parse that structure, we ask a much more
 * robust question: does the required word appear anywhere in the name?
 *
 * Uses the Unicode-aware `\p{L}` class so `·` (a punctuation character, not
 * a letter) and any stray non-ASCII separator split correctly. Digits count as
 * separators too, which is what makes `TASK_RESPONSE`, `Task response`, and
 * `Task-Response` all collapse to the same two words.
 */
export function filenameWords(fileName: string): Set<string> {
  const base = fileName.replace(/\.[A-Za-z0-9]+$/, '');
  const words = foldTypography(base)
    .split(/[^\p{L}]+/u)
    .filter(w => w.length > 0)
    .map(w => w.toUpperCase());
  return new Set(words);
}

/**
 * Split an enum member into the words a filename would have to contain.
 * `TASK_RESPONSE` -> ['TASK', 'RESPONSE']; `VOCABULARY` -> ['VOCABULARY'].
 */
export function enumWords(member: string): string[] {
  return member
    .split(/[^A-Za-z]+/)
    .filter(w => w.length > 0)
    .map(w => w.toUpperCase());
}

/** True when every word of `member` appears in the filename's word set. */
export function wordsPresent(words: Set<string>, member: string): boolean {
  return enumWords(member).every(w => words.has(w));
}
