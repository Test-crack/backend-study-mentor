/**
 * Building and reading an IA `source_key`.
 *
 *   ia_{skill}_{sub_skill}_{difficulty}_{###}
 *
 *   ia_listening_listening_beginner_001
 *   ia_writing_task_response_advanced_014
 *
 * Same convention and same reasoning as drills' sourceKey.ts (permanent,
 * never derived from row position; carries its own bucket so a drifted key
 * is detectable by inspection) — see that file for the long version. Ported
 * rather than re-derived because IAQuestion's `source_key` column is the
 * same idea applied to a different table, not a new design.
 */

import {
  DIFFICULTIES,
  DIFFICULTY_WORD,
  SKILL_WORD,
  SOURCE_KEY_PAD,
  SUB_SKILL_WORD,
  VALID_SUB_SKILLS_BY_SKILL,
  type BucketTriple,
  type Difficulty,
  type Skill,
  type SubSkill,
} from './types';

export const SOURCE_KEY_PREFIX = 'ia';

const SUFFIX_RE = new RegExp(`^(.*)_(\\d{${SOURCE_KEY_PAD},})$`);

export interface ParsedSourceKey {
  skill: Skill;
  sub_skill: SubSkill;
  difficulty: Difficulty;
  num: number;
}

export function sourceKeyPrefix(bucket: BucketTriple): string {
  const skill = SKILL_WORD[bucket.skill as Skill];
  const subSkill = SUB_SKILL_WORD[bucket.sub_skill as SubSkill];
  const difficulty = DIFFICULTY_WORD[bucket.difficulty as Difficulty];

  if (!skill || !subSkill || !difficulty) {
    throw new Error(
      `Cannot build a source_key prefix for bucket ${bucket.skill}/${bucket.sub_skill}/` +
        `${bucket.difficulty} — one of those is not a known enum member.`,
    );
  }
  return `${SOURCE_KEY_PREFIX}_${skill}_${subSkill}_${difficulty}`;
}

const BUCKET_BY_PREFIX: Map<string, BucketTriple> = (() => {
  const out = new Map<string, BucketTriple>();
  for (const skill of Object.keys(VALID_SUB_SKILLS_BY_SKILL) as Skill[]) {
    for (const sub_skill of VALID_SUB_SKILLS_BY_SKILL[skill]) {
      for (const difficulty of DIFFICULTIES) {
        const bucket: BucketTriple = { skill, sub_skill, difficulty };
        out.set(sourceKeyPrefix(bucket), bucket);
      }
    }
  }
  return out;
})();

export function legalPrefixes(): string[] {
  return [...BUCKET_BY_PREFIX.keys()].sort();
}

export function formatSourceKey(bucket: BucketTriple, num: number): string {
  if (!Number.isInteger(num) || num < 1) {
    throw new Error(`source_key number must be a positive whole number, got ${num}.`);
  }
  return `${sourceKeyPrefix(bucket)}_${String(num).padStart(SOURCE_KEY_PAD, '0')}`;
}

export function parseSourceKey(raw: string): ParsedSourceKey | null {
  const match = SUFFIX_RE.exec(raw.trim());
  if (match === null) return null;

  const [, prefix, numRaw] = match;
  const bucket = BUCKET_BY_PREFIX.get(prefix);
  if (bucket === undefined) return null;

  const num = Number(numRaw);
  if (!Number.isSafeInteger(num) || num < 1) return null;

  return {
    skill: bucket.skill as Skill,
    sub_skill: bucket.sub_skill as SubSkill,
    difficulty: bucket.difficulty as Difficulty,
    num,
  };
}

export function keyMatchesBucket(parsed: ParsedSourceKey, bucket: BucketTriple): boolean {
  return (
    parsed.skill === bucket.skill &&
    parsed.sub_skill === bucket.sub_skill &&
    parsed.difficulty === bucket.difficulty
  );
}

export function highestNumber(keys: Iterable<string>): number {
  let highest = 0;
  for (const key of keys) {
    const parsed = parseSourceKey(key);
    if (parsed && parsed.num > highest) highest = parsed.num;
  }
  return highest;
}
