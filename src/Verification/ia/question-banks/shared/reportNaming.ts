/**
 * Where an IA report lands, and what it is called. Same descriptor-first,
 * timestamp-suffix convention as drills'/diagnostic's reportNaming.ts — see
 * that file for the full rationale. Keyed off `difficulty` instead of `level`.
 */

import path from 'path';
import { SKILLS, SUB_SKILLS, type Skill, type SubSkill } from './types';
import { filenameWords, wordsPresent } from '../../../drills/question-banks/shared/normalize';
import { difficultyFromPath } from './iaLayout';

export function descriptorForFile(filePath: string): string {
  const fileName = path.basename(filePath);
  const words = filenameWords(fileName);

  const skill = SKILLS.find(s => wordsPresent(words, s)) as Skill | undefined;
  const subSkill = SUB_SKILLS.find(s => wordsPresent(words, s)) as SubSkill | undefined;

  if (skill) {
    const parts = subSkill && subSkill !== (skill as string) ? [skill, subSkill] : [skill];
    return parts.join('-').toLowerCase().replace(/_/g, '-');
  }

  return (
    path
      .basename(fileName, path.extname(fileName))
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 50) || 'report'
  );
}

export function timestamp(now: Date = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${now.getFullYear()}${p(now.getMonth() + 1)}${p(now.getDate())}-${p(now.getHours())}${p(now.getMinutes())}${p(now.getSeconds())}`;
}

export function reportPathFor(baseDir: string, filePaths: string[], now: Date = new Date()): string {
  const difficulties = new Set(filePaths.map(f => difficultyFromPath(f)).filter(d => d !== null));
  const singleDifficulty = difficulties.size === 1 ? [...difficulties][0] : null;

  let descriptor: string;
  if (filePaths.length === 1) {
    descriptor = descriptorForFile(filePaths[0]);
  } else if (singleDifficulty) {
    descriptor = 'all';
  } else if (difficulties.size === 0) {
    descriptor = 'unsorted';
  } else {
    descriptor = 'all-difficulties';
  }

  const dir = singleDifficulty ? path.join(baseDir, singleDifficulty.toLowerCase()) : baseDir;
  return path.join(dir, `${descriptor}--${timestamp(now)}.xlsx`);
}
