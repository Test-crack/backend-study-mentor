/**
 * Building and reading a `source_key` for Spoken English MCQ drills.
 *
 *   se_drill_{subskill}_{level}_{##}
 *
 *   se_drill_range_b1_01
 *   se_drill_accuracy_a2_07
 *   se_drill_interaction_b2_12
 *
 * Matches the exact format used in the content-data-requirement doc's own
 * examples. `{subskill}` is the CEFR label (range/accuracy/fluency/
 * interaction/coherence/phonology) via SUB_SKILL_WORD, not the raw DB enum
 * word — see shared/types.ts for the enum<->label mapping. `{level}` is the
 * CEFR level (a1/a2/b1/b2/c1), not the DB's 3-way RecommendationLevel bucket.
 *
 * A `source_key` is a permanent, human-readable label for one question. Once
 * assigned it never changes, even if the question's text is later edited — it is
 * what lets the importer recognise "I have seen this question before" and update
 * it in place instead of inserting a duplicate.
 *
 * Two properties matter and are both tested:
 *
 * 1. **It is not derived from row position.** A key computed as "3rd row of this
 *    bucket" would silently re-point at a different question the moment a row was
 *    deleted, and the importer would then overwrite the wrong row's content. The
 *    number is allocated once and persisted instead.
 *
 * 2. **It carries its own bucket.** Because the skill/sub-skill/level are encoded
 *    in the string, a key that has drifted onto a row from a different bucket is
 *    detectable by inspection, with no external state to compare against.
 *
 * ## Why prefixes are matched instead of split on `_`
 *
 * `TASK_RESPONSE` lowercases to `task_response`, so key segment counts vary (6 for
 * that sub-skill, 5 for every other). Splitting on `_` and reading fixed positions
 * therefore cannot work. Instead every legal prefix is precomputed — there are only
 * 30, one per valid (skill, sub_skill, level) combination — and a key is matched
 * against that set. This is stricter than a regex: a key naming an invalid
 * combination such as `drill_listening_grammar_beginner_001` fails to parse rather
 * than parsing into something meaningless.
 */

import {
  LEVELS,
  LEVEL_WORD,
  SKILL_WORD,
  SOURCE_KEY_PAD,
  SUB_SKILL_WORD,
  VALID_SUB_SKILLS_BY_SKILL,
  type BucketTriple,
  type Level,
  type Skill,
  type SubSkill,
} from './types';

/** The fixed prefix. Present so a stray value in the column is obvious at a glance. */
export const SOURCE_KEY_PREFIX = 'se_drill';

/** Trailing `_###`, at least SOURCE_KEY_PAD digits and nothing else. */
const SUFFIX_RE = new RegExp(`^(.*)_(\\d{${SOURCE_KEY_PAD},})$`);

export interface ParsedSourceKey {
  skill: Skill;
  sub_skill: SubSkill;
  level: Level;
  /** The numeric suffix as a number, so the next free value can be computed. */
  num: number;
}

/**
 * The bucket part of a key, without the number: `se_drill_range_b1`.
 *
 * Skill is omitted (unlike the IELTS pipeline) — there is only one skill
 * (SPEAKING) in this exam, so encoding it in every key would be pure
 * redundancy. `SKILL_WORD` is still validated against, just not interpolated,
 * so an unknown skill still fails loudly rather than silently.
 */
export function sourceKeyPrefix(bucket: BucketTriple): string {
  const skill = SKILL_WORD[bucket.skill as Skill];
  const subSkill = SUB_SKILL_WORD[bucket.sub_skill as SubSkill];
  const level = LEVEL_WORD[bucket.level as Level];

  if (!skill || !subSkill || !level) {
    throw new Error(
      `Cannot build a source_key prefix for bucket ${bucket.skill}/${bucket.sub_skill}/` +
        `${bucket.level} — one of those is not a known enum member.`,
    );
  }
  return `${SOURCE_KEY_PREFIX}_${subSkill}_${level}`;
}

/**
 * Every legal prefix -> the bucket it denotes.
 *
 * Built from the allow-list of valid (skill, sub_skill) pairs rather than the cross
 * product, so semantically impossible buckets have no prefix and cannot be parsed
 * into. Verified to be exactly the 30 prefixes present in the live table.
 */
const BUCKET_BY_PREFIX: Map<string, BucketTriple> = (() => {
  const out = new Map<string, BucketTriple>();
  for (const skill of Object.keys(VALID_SUB_SKILLS_BY_SKILL) as Skill[]) {
    for (const sub_skill of VALID_SUB_SKILLS_BY_SKILL[skill]) {
      for (const level of LEVELS) {
        const bucket: BucketTriple = { skill, sub_skill, level };
        out.set(sourceKeyPrefix(bucket), bucket);
      }
    }
  }
  return out;
})();

/** Read-only view, for tests and diagnostics. */
export function legalPrefixes(): string[] {
  return [...BUCKET_BY_PREFIX.keys()].sort();
}

/**
 * Build the key for one question.
 *
 * Throws on an unknown bucket rather than emitting a key with `undefined` in it:
 * a malformed key written into a CSV would persist forever, so failing loudly at
 * assignment time is much cheaper than discovering it after an import.
 */
export function formatSourceKey(bucket: BucketTriple, num: number): string {
  if (!Number.isInteger(num) || num < 1) {
    throw new Error(`source_key number must be a positive whole number, got ${num}.`);
  }
  return `${sourceKeyPrefix(bucket)}_${String(num).padStart(SOURCE_KEY_PAD, '0')}`;
}

/**
 * Read a key back into its parts, or null if it is not a well-formed key.
 *
 * Deliberately strict — a plausible-looking variant is rejected rather than quietly
 * accepted and then treated as a bucket mismatch later. In particular the
 * abbreviated form from the task brief (`drill_speak_pronun_beg_001`) does NOT
 * parse, because it is not what the database uses.
 */
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
    level: bucket.level as Level,
    num,
  };
}

/** True when the key's own encoded bucket is the bucket it is sitting in. */
export function keyMatchesBucket(parsed: ParsedSourceKey, bucket: BucketTriple): boolean {
  return (
    parsed.skill === bucket.skill &&
    parsed.sub_skill === bucket.sub_skill &&
    parsed.level === bucket.level
  );
}

/** Highest number already issued in a set of keys; 0 when none are usable. */
export function highestNumber(keys: Iterable<string>): number {
  let highest = 0;
  for (const key of keys) {
    const parsed = parseSourceKey(key);
    if (parsed && parsed.num > highest) highest = parsed.num;
  }
  return highest;
}
