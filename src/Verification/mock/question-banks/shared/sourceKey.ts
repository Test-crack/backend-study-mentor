/**
 * Building and reading a Mock `source_key`.
 *
 *   mock_{skill}_{sub_skill}_{question_type}_{###}
 *
 *   mock_listening_pronunciation_mcq_005
 *   mock_speaking_grammar_speaking_prompt_001
 *
 * Same convention as IA's/drills' sourceKey.ts, but the third segment is
 * `question_type`, not `difficulty` — Mock has no difficulty column, and
 * real source_keys confirm question_type is what's embedded instead. The
 * multi-underscore `speaking_prompt` segment is not a parsing problem: the
 * regex only splits off the trailing digits, so everything before them is
 * treated as one opaque prefix string and looked up directly.
 */

import {
  QUESTION_TYPE_WORD,
  SKILL_WORD,
  SOURCE_KEY_PAD,
  SUB_SKILLS,
  SUB_SKILL_WORD,
  VALID_QUESTION_TYPES_BY_SKILL,
  type QuestionType,
  type Skill,
  type SubSkill,
} from './types';

export const SOURCE_KEY_PREFIX = 'mock';

const SUFFIX_RE = new RegExp(`^(.*)_(\\d{${SOURCE_KEY_PAD},})$`);

export interface SourceKeyTriple {
  skill: Skill;
  sub_skill: SubSkill;
  question_type: QuestionType;
}

export interface ParsedSourceKey extends SourceKeyTriple {
  num: number;
}

export function sourceKeyPrefix(triple: SourceKeyTriple): string {
  const skill = SKILL_WORD[triple.skill];
  const subSkill = SUB_SKILL_WORD[triple.sub_skill];
  const questionType = QUESTION_TYPE_WORD[triple.question_type];

  if (!skill || !subSkill || !questionType) {
    throw new Error(
      `Cannot build a source_key prefix for ${triple.skill}/${triple.sub_skill}/` +
        `${triple.question_type} — one of those is not a known enum member.`,
    );
  }
  return `${SOURCE_KEY_PREFIX}_${skill}_${subSkill}_${questionType}`;
}

const BUCKET_BY_PREFIX: Map<string, SourceKeyTriple> = (() => {
  const out = new Map<string, SourceKeyTriple>();
  for (const skill of Object.keys(VALID_QUESTION_TYPES_BY_SKILL) as Skill[]) {
    for (const sub_skill of SUB_SKILLS) {
      for (const question_type of VALID_QUESTION_TYPES_BY_SKILL[skill]) {
        const triple: SourceKeyTriple = { skill, sub_skill, question_type };
        out.set(sourceKeyPrefix(triple), triple);
      }
    }
  }
  return out;
})();

export function legalPrefixes(): string[] {
  return [...BUCKET_BY_PREFIX.keys()].sort();
}

export function formatSourceKey(triple: SourceKeyTriple, num: number): string {
  if (!Number.isInteger(num) || num < 1) {
    throw new Error(`source_key number must be a positive whole number, got ${num}.`);
  }
  return `${sourceKeyPrefix(triple)}_${String(num).padStart(SOURCE_KEY_PAD, '0')}`;
}

export function parseSourceKey(raw: string): ParsedSourceKey | null {
  const match = SUFFIX_RE.exec(raw.trim());
  if (match === null) return null;

  const [, prefix, numRaw] = match;
  const triple = BUCKET_BY_PREFIX.get(prefix);
  if (triple === undefined) return null;

  const num = Number(numRaw);
  if (!Number.isSafeInteger(num) || num < 1) return null;

  return { ...triple, num };
}

/** Bucket uniformity only cares about (skill, sub_skill) — question_type varies within a file. */
export function keyMatchesBucket(parsed: ParsedSourceKey, bucket: { skill: string; sub_skill: string }): boolean {
  return parsed.skill === bucket.skill && parsed.sub_skill === bucket.sub_skill;
}

export function highestNumber(keys: Iterable<string>): number {
  let highest = 0;
  for (const key of keys) {
    const parsed = parseSourceKey(key);
    if (parsed && parsed.num > highest) highest = parsed.num;
  }
  return highest;
}
