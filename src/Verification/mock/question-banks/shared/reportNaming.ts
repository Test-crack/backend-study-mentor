/**
 * Where a Mock report lands, and what it is called. Same descriptor-first,
 * timestamp-suffix convention as IA's/drills' reportNaming.ts, minus the
 * difficulty-folder logic — Mock has no such folder convention.
 */

import path from 'path';
import { SKILLS, SUB_SKILLS, type Skill, type SubSkill } from './types';
import { filenameWords, wordsPresent } from '../../../drills/question-banks/shared/normalize';

export function descriptorForFile(filePath: string): string {
  const fileName = path.basename(filePath);
  const words = filenameWords(fileName);

  const skill = SKILLS.find(s => wordsPresent(words, s)) as Skill | undefined;
  const subSkill = SUB_SKILLS.find(s => wordsPresent(words, s)) as SubSkill | undefined;

  if (skill) {
    const parts = subSkill ? [skill, subSkill] : [skill];
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
  const descriptor = filePaths.length === 1 ? descriptorForFile(filePaths[0]) : 'all';
  return path.join(baseDir, `${descriptor}--${timestamp(now)}.xlsx`);
}
