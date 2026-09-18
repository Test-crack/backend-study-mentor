/**
 * Building and reading a `source_key`, e.g. drill_writing_task_response_beginner_042
 *
 * Every legal prefix is precomputed and matched whole, rather than splitting on
 * `_`: a member like TASK_RESPONSE contains an underscore, so segment counts
 * vary. Matching the whole set also makes a key naming an impossible combination
 * fail to parse, which keeps MALFORMED distinct from BUCKET_MISMATCH.
 */

import type { Loadout } from '../loadout/schema';

/** A bucket is dimension name -> enum member. */
export type Bucket = Record<string, string>;

export function bucketKey(loadout: Loadout, bucket: Bucket): string {
  return (loadout.bucket?.dimensions ?? []).map(d => bucket[d]).join('/');
}

export interface ParsedSourceKey {
  bucket: Bucket;
  num: number;
}

/**
 * Every combination the key grammar admits, enumerated over the key's segment
 * columns rather than the bucket's — Mock's key embeds question_type, which is
 * not a bucket dimension. Both allow-lists narrow the result.
 */
function legalKeyCombinations(loadout: Loadout): Bucket[] {
  const membersOf = (name: string): string[] => {
    const column = loadout.columns.find(c => c.name === name);
    return column?.members ?? [];
  };

  const segments = loadout.sourceKey!.segments;
  let combos: Bucket[] = [{}];
  for (const segment of segments) {
    const next: Bucket[] = [];
    for (const combo of combos) {
      for (const member of membersOf(segment)) {
        next.push({ ...combo, [segment]: member });
      }
    }
    combos = next;
  }

  const constrainedBy = (
    combo: Bucket,
    keyName: string,
    valueName: string,
    allowed: Record<string, string[]>,
  ): boolean => {
    // A constraint whose columns are not both in the key cannot narrow it.
    if (!(keyName in combo) || !(valueName in combo)) return true;
    const permitted = allowed[combo[keyName]];
    return permitted !== undefined && permitted.includes(combo[valueName]);
  };

  return combos.filter(combo => {
    const bucketList = loadout.bucket?.allowList;
    const rowList = loadout.rowAllowList;
    if (bucketList && !constrainedBy(combo, bucketList.keyDimension, bucketList.valueDimension, bucketList.allowed)) {
      return false;
    }
    if (rowList && !constrainedBy(combo, rowList.keyColumn, rowList.valueColumn, rowList.allowed)) {
      return false;
    }
    return true;
  });
}

/**
 * The bucket part of a key, without the number.
 *
 * Throws on an unknown member rather than emitting a key with `undefined` in it:
 * a malformed key written into a CSV would persist forever.
 */
export function sourceKeyPrefix(loadout: Loadout, bucket: Bucket): string {
  const parts = loadout.sourceKey!.segments.map(segment => {
    const word = loadout.sourceKey!.words[segment]?.[bucket[segment]];
    if (!word) {
      throw new Error(
        `Cannot build a source_key prefix for ${bucketKey(loadout, bucket)} — ` +
          `"${bucket[segment]}" is not a known member of ${segment}.`,
      );
    }
    return word;
  });
  return [loadout.sourceKey!.prefix, ...parts].join('_');
}

export interface SourceKeyGrammar {
  parse(raw: string): ParsedSourceKey | null;
  format(bucket: Bucket, num: number): string;
  legalPrefixes(): string[];
}

/**
 * Precompute the prefix table once per loadout. Built eagerly so an unbuildable
 * loadout fails at construction rather than on whichever row happens to carry a
 * key first.
 */
export function buildSourceKeyGrammar(loadout: Loadout): SourceKeyGrammar {
  const byPrefix = new Map<string, Bucket>();
  for (const combo of legalKeyCombinations(loadout)) {
    byPrefix.set(sourceKeyPrefix(loadout, combo), combo);
  }

  const suffixRe = new RegExp(`^(.*)_(\\d{${loadout.sourceKey!.pad},})$`);

  return {
    parse(raw: string): ParsedSourceKey | null {
      const match = suffixRe.exec(raw.trim());
      if (match === null) return null;

      const [, prefix, numRaw] = match;
      const bucket = byPrefix.get(prefix);
      if (bucket === undefined) return null;

      const num = Number(numRaw);
      if (!Number.isSafeInteger(num) || num < 1) return null;

      return { bucket, num };
    },

    format(bucket: Bucket, num: number): string {
      if (!Number.isInteger(num) || num < 1) {
        throw new Error(`source_key number must be a positive whole number, got ${num}.`);
      }
      return `${sourceKeyPrefix(loadout, bucket)}_${String(num).padStart(loadout.sourceKey!.pad, '0')}`;
    },

    legalPrefixes(): string[] {
      return [...byPrefix.keys()].sort();
    },
  };
}

/** True when the key's own encoded bucket is the bucket it is sitting in. */
export function keyMatchesBucket(
  loadout: Loadout,
  parsed: ParsedSourceKey,
  bucket: Bucket,
): boolean {
  return (loadout.bucket?.dimensions ?? []).every(d => parsed.bucket[d] === bucket[d]);
}
