/**
 * Where a report lands, and what it is called.
 *
 * A filename of `layer2-judge-20260802-185248.xlsx` says nothing about what is
 * inside it — you have to open the workbook to find out which batch it covers.
 * With one report per run and several runs a day, that folder becomes a pile of
 * indistinguishable timestamps.
 *
 * So the name describes the content and the timestamp is demoted to a suffix:
 *
 *   results/layer1-verifier/beginner/speaking-fluency--20260802-185248.xlsx
 *   results/layer2-content-judge/intermediate/all--20260802-190312.xlsx
 *   results/layer2-content-judge/all-levels--20260802-191500.xlsx
 *
 * Descriptor first means sorting by name groups every report for a bucket
 * together, in date order — which is exactly what you want when checking whether
 * yesterday's fixes worked.
 *
 * The descriptor is derived from the file's PATH, not from its row content. A
 * mislabeled file (rows claiming a bucket its filename disagrees with) would
 * otherwise produce a report named after the wrong thing — inheriting the very
 * bug the report exists to tell you about.
 */

import path from 'path';
import { SKILLS, SUB_SKILLS, type Skill, type SubSkill } from './types';
import { filenameWords, wordsPresent } from './normalize';
import { levelFromPath } from './drillsLayout';

/** `speaking-fluency`, `reading`, or a slug of the filename when nothing matches. */
export function descriptorForFile(filePath: string): string {
  const fileName = path.basename(filePath);
  const words = filenameWords(fileName);

  const skill = SKILLS.find(s => wordsPresent(words, s)) as Skill | undefined;
  const subSkill = SUB_SKILLS.find(s => wordsPresent(words, s)) as SubSkill | undefined;

  if (skill) {
    // LISTENING/LISTENING and READING/READING would otherwise read "reading-reading".
    const parts =
      subSkill && subSkill !== (skill as string)
        ? [skill, subSkill]
        : [skill];
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
  return (
    `${now.getFullYear()}${p(now.getMonth() + 1)}${p(now.getDate())}` +
    `-${p(now.getHours())}${p(now.getMinutes())}${p(now.getSeconds())}`
  );
}

/**
 * Full output path for a run.
 *
 * When every input sits in one level folder the report goes into a matching
 * subfolder, and the level is left out of the filename since the folder already
 * says it. Mixed-level runs stay at the top level and say so.
 */
export function reportPathFor(
  baseDir: string,
  filePaths: string[],
  now: Date = new Date(),
): string {
  const levels = new Set(filePaths.map(f => levelFromPath(f)).filter(l => l !== null));
  const singleLevel = levels.size === 1 ? [...levels][0] : null;

  let descriptor: string;
  if (filePaths.length === 1) {
    descriptor = descriptorForFile(filePaths[0]);
  } else if (singleLevel) {
    descriptor = 'all';
  } else if (levels.size === 0) {
    descriptor = 'unsorted';
  } else {
    descriptor = 'all-levels';
  }

  const dir = singleLevel ? path.join(baseDir, singleLevel.toLowerCase()) : baseDir;
  return path.join(dir, `${descriptor}--${timestamp(now)}.xlsx`);
}
