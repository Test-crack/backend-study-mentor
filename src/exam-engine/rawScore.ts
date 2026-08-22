// Exam Engine — RawScore boundary (B4).
// Every score entering a strategy declares its unit. A strategy declares what it
// consumes; this module throws on a mismatch at the boundary instead of letting a
// wrong-but-plausible number through (EE-00 §4.2).

import { RawScore, RawScoreUnit } from './types';

export class RawScoreUnitError extends Error {
  constructor(expected: RawScoreUnit, got: RawScoreUnit) {
    super(`RawScore unit mismatch: strategy consumes '${expected}' but received '${got}'`);
    this.name = 'RawScoreUnitError';
  }
}

/** Assert a RawScore is the unit a strategy consumes; throw otherwise. */
export function assertUnit(raw: RawScore, expected: RawScoreUnit): void {
  if (raw.unit !== expected) throw new RawScoreUnitError(expected, raw.unit);
}

/** A percent-consuming strategy's numeric input (0–100). Throws on a non-percent unit. */
export function asPercent(raw: RawScore): number {
  assertUnit(raw, 'percent');
  return (raw as Extract<RawScore, { unit: 'percent' }>).value;
}

/** A band-consuming strategy's numeric input (scale-native). Throws on a non-band unit. */
export function asBand(raw: RawScore): number {
  assertUnit(raw, 'band');
  return (raw as Extract<RawScore, { unit: 'band' }>).value;
}

/** A raw correct/total pair as a 0–1 fraction. Throws on a non-raw unit; guards total=0. */
export function asFraction(raw: RawScore): number {
  assertUnit(raw, 'raw');
  const r = raw as Extract<RawScore, { unit: 'raw' }>;
  return r.total > 0 ? r.correct / r.total : 0;
}

/** Map a batch of RawScores (all the expected unit) to plain numbers by component id. */
export function readAll(inputs: Record<string, RawScore>, expected: RawScoreUnit): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [id, raw] of Object.entries(inputs)) {
    assertUnit(raw, expected);
    out[id] =
      raw.unit === 'percent' ? raw.value :
      raw.unit === 'band'    ? raw.value :
      raw.total > 0          ? raw.correct / raw.total : 0;
  }
  return out;
}
