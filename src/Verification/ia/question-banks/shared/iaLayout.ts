/**
 * Where real IA CSVs live on disk, and how a file's location is read back.
 *
 *   Verification/ia/question-banks/drills/
 *     beginner/  intermediate/  advanced/
 *
 * Same role as drills/question-banks/shared/drillsLayout.ts, keyed off
 * IAQuestion's `difficulty` field instead of drills' `level` — the folder is
 * an independent statement about a batch's bucket, cross-checked against the
 * rows the same way drills' level folder is.
 */

import path from 'path';
import { DIFFICULTIES, type Difficulty } from './types';

/** Absolute path of `Verification/ia/question-banks/drills` — the local, git-ignored question bank. */
export const IA_DIR = path.resolve(__dirname, '..', 'drills');

export function folderForDifficulty(difficulty: Difficulty): string {
  return difficulty.toLowerCase();
}

export function iaDirFor(difficulty: Difficulty): string {
  return path.join(IA_DIR, folderForDifficulty(difficulty));
}

export function parseDifficulty(input: string): Difficulty | null {
  const wanted = input.trim().toUpperCase();
  return DIFFICULTIES.find(d => d === wanted) ?? null;
}

/**
 * Work out which difficulty folder a file sits in, from its path. Only whole
 * path segments count, and an ambiguous path (names none, or more than one)
 * returns null rather than guessing — see drillsLayout.ts's levelFromPath for
 * the same reasoning.
 */
export function difficultyFromPath(filePath: string): Difficulty | null {
  const segments = path.resolve(filePath).split(/[\\/]/);
  const found = new Set<Difficulty>();

  for (const segment of segments) {
    const match = DIFFICULTIES.find(d => d === segment.trim().toUpperCase());
    if (match) found.add(match);
  }

  return found.size === 1 ? [...found][0] : null;
}
