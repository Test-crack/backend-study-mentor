// Exam Engine — scoring maths (B5 band_mean, B6 cefr_hybrid + helpers).
// Faithful TS port of reference-impl.js. Every number in EE-02 is produced here,
// and src/exam-engine/vectors.check.ts asserts all 75 against this code.
//
// Port the MATHS exactly; do not "improve" the rounding or clamping — the vectors
// are the contract.

// ───────────────────────────────────────────────────────── numeric helpers

/** Round half UP to a step. NOT banker's rounding. Epsilon defends against float dust. */
export function roundHalfUpToStep(value: number, step: number): number {
  return Math.round(value / step + 1e-9) * step;
}

export function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}

/** Kill float dust: 6.800000000000001 -> 6.8 */
export function tidy(v: number, dp = 6): number {
  return Number(v.toFixed(dp));
}

// ─────────────────────────────────────────────────── ordinal scale helpers

function orderedLevels(scale: any): [string, number][] {
  return Object.entries(scale.thresholds_min_pct).sort(
    (a: any, b: any) => a[1] - b[1]
  ) as [string, number][];
}

/** Highest level whose minimum threshold is <= pct. Thresholds are INCLUSIVE. */
export function pctToLevel(pct: number, scale: any): string {
  const ordered = orderedLevels(scale);
  let level = ordered[0][0];
  for (const [name, min] of ordered) if (pct >= min) level = name;
  return level;
}

/** Progress through the current level's band, 0..1. Top level's upper bound is 100. */
export function withinLevelProgress(pct: number, level: string, scale: any): number {
  const ordered = orderedLevels(scale);
  const i = ordered.findIndex(([n]) => n === level);
  const lo = ordered[i][1];
  const hi = i + 1 < ordered.length ? ordered[i + 1][1] : 100;
  return tidy(clamp((pct - lo) / (hi - lo), 0, 1));
}

export function nextLevel(level: string, scale: any): string | null {
  const ordered = orderedLevels(scale);
  const i = ordered.findIndex(([n]) => n === level);
  return i + 1 < ordered.length ? ordered[i + 1][0] : null;
}

export function levelIndex(level: string, scale: any): number {
  return scale.levels.indexOf(level);
}

// ─────────────────────────────────────────────────────────── strategies

export interface BandMeanResult {
  kind: 'band';
  continuous_mean: number;
  value_raw: number;   // unclamped — improvement-since-baseline uses this
  value: number;       // clamped to report_floor — displayed
  label: string;
  clamped: boolean;
}

/**
 * band_mean (IELTS): mean of assessed component bands, rounded half-up to step,
 * then clamped to report_floor for DISPLAY. Returns both the clamped reported
 * value and the unclamped raw value (see EE-00 §3.5).
 */
export function bandMean(componentScores: Record<string, number>, scale: any): BandMeanResult {
  const vals = Object.values(componentScores);
  if (!vals.length) throw new Error('band_mean: no components in overall');
  const mean = vals.reduce((a, b) => a + b, 0) / vals.length;
  const rounded = tidy(roundHalfUpToStep(mean, scale.step));
  const reported = tidy(clamp(rounded, scale.report_floor ?? scale.min, scale.max));
  return {
    kind: 'band',
    continuous_mean: tidy(mean),
    value_raw: rounded,
    value: reported,
    label: reported.toFixed(1),
    clamped: reported !== rounded,
  };
}

export interface CefrProfileItem {
  id: string;
  percent: number;
  value: string;
  label: string;
  within_level_progress: number;
}

export interface CefrHybridResult {
  kind: 'cefr_level';
  average_pct: number;
  value: string;
  label: string;
  within_level_progress: number;
  profile: CefrProfileItem[];
}

/**
 * cefr_hybrid (Spoken English): average the subskill percents, map the average to
 * a level, and ALWAYS return the full per-subskill profile alongside the headline.
 */
export function cefrHybrid(subskillPercents: Record<string, number>, scale: any): CefrHybridResult {
  const entries = Object.entries(subskillPercents);
  if (!entries.length) throw new Error('cefr_hybrid: no subskills');
  const avg = tidy(entries.reduce((a, [, v]) => a + v, 0) / entries.length);
  const level = pctToLevel(avg, scale);
  return {
    kind: 'cefr_level',
    average_pct: avg,
    value: level,
    label: scale.labels[level],
    within_level_progress: withinLevelProgress(avg, level, scale),
    profile: entries.map(([id, pct]) => {
      const lv = pctToLevel(pct, scale);
      return {
        id,
        percent: pct,
        value: lv,
        label: scale.labels[lv],
        within_level_progress: withinLevelProgress(pct, lv, scale),
      };
    }),
  };
}
