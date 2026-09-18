/**
 * Where real drill CSVs live on disk, and how a file's location is read back.
 *
 *   Verification/spoken-english/question-banks/drills/
 *     a1/  a2/  b1/  b2/  c1/
 *
 * The folder is not just storage — it is a second, independent statement about
 * what a file contains, exactly like the filename is. The worst bug found in real
 * data (200 rows labeled PRONUNCIATION under a "Speaking Vocabulary" name) was
 * invisible to every internal-consistency check and only fell out of comparing
 * the rows against external metadata. A level folder gives us one more such
 * comparison for free.
 *
 * These CSVs are deliberately git-ignored: they are the live question bank, kept
 * local until someone decides otherwise.
 */

import path from 'path';
import { LEVELS, type Level } from './types';

/** Absolute path of `Verification/question-banks/drills`. */
export const DRILLS_DIR = path.resolve(__dirname, '..', 'drills');

/** Folder name for a level: BEGINNER -> 'beginner'. */
export function folderForLevel(level: Level): string {
  return level.toLowerCase();
}

/** Absolute path of one level's folder. */
export function drillsDirFor(level: Level): string {
  return path.join(DRILLS_DIR, folderForLevel(level));
}

/** Parse a user-supplied `--level` value. Case-insensitive; null if unknown. */
export function parseLevel(input: string): Level | null {
  const wanted = input.trim().toUpperCase();
  return LEVELS.find(l => l === wanted) ?? null;
}

/**
 * Work out which level folder a file sits in, from its path.
 *
 * Only whole path segments count, so a stray directory like `Advanced Projects`
 * cannot be mistaken for the `advanced` folder. If the path names no level, or
 * names more than one, we return null and simply skip the folder check rather
 * than guessing — a wrong guess here would raise a confident, false failure.
 */
export function levelFromPath(filePath: string): Level | null {
  const segments = path.resolve(filePath).split(/[\\/]/);
  const found = new Set<Level>();

  for (const segment of segments) {
    const match = LEVELS.find(l => l === segment.trim().toUpperCase());
    if (match) found.add(match);
  }

  return found.size === 1 ? [...found][0] : null;
}
