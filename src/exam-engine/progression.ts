// Exam Engine — progression layer (B10/B11/B12/B15).
// Display-only. It NEVER changes the assessed score. Faithful port of
// reference-impl.js. The invariant: progression.headline is COPIED from overall,
// so it can't diverge; momentum is free to differ.

import { clamp, tidy, nextLevel, withinLevelProgress } from './scoring';

export interface NumericMomentum {
  basis: 'rounding_interval';
  interval: [number, number];
  next_rung: number | null;
  progress_to_next: number | null;
}

/**
 * Momentum for a NUMERIC scale. The bar spans the ROUNDING INTERVAL of the current
 * headline. Band 6.0 covers continuous means [5.75, 6.25); hitting 100% is exactly
 * the moment the headline rounds up. At the cap: null, never a fake full bar.
 */
export function numericMomentum(continuousMean: number, headline: number, scale: any): NumericMomentum {
  const step = scale.step;
  const lo = headline - step / 2;
  const atCap = headline >= scale.max;
  return {
    basis: 'rounding_interval',
    interval: [tidy(lo), tidy(lo + step)],
    next_rung: atCap ? null : tidy(headline + step),
    progress_to_next: atCap ? null : tidy(clamp((continuousMean - lo) / step, 0, 1)),
  };
}

export interface OrdinalMomentum {
  basis: 'within_level';
  next_rung: string | null;
  next_rung_label: string | null;
  progress_to_next: number | null;
  within_level_progress: number;
}

/** Momentum for an ORDINAL scale. At the cap there is no next rung — null, never 1.0. */
export function ordinalMomentum(avgPct: number, level: string, scale: any): OrdinalMomentum {
  const next = nextLevel(level, scale);
  return {
    basis: 'within_level',
    next_rung: next,
    next_rung_label: next ? scale.labels[next] : null,
    progress_to_next: next ? withinLevelProgress(avgPct, level, scale) : null,
    within_level_progress: withinLevelProgress(avgPct, level, scale),
  };
}

/** Trend over the last `window` values: first-versus-last (see EE-00 §3.6). */
export function trend(values: number[], window: number): 'up' | 'down' | 'flat' {
  const w = values.slice(-window);
  if (w.length < 2) return 'flat';
  const first = w[0];
  const last = w[w.length - 1];
  if (last > first) return 'up';
  if (last < first) return 'down';
  return 'flat';
}

// ────────────────────────────────────────────────────────── result envelope

export interface BuildEnvelopeArgs {
  examId: string;
  strategy: string;
  overall: { kind: string; value: any; label: string };
  momentum: any;
  baseline?: { value: any; label: string } | null;
  history?: number[] | null;
  trendWindow?: number;
}

export function buildEnvelope(args: BuildEnvelopeArgs): any {
  const { examId, strategy, overall, momentum, baseline, history, trendWindow } = args;
  const env = {
    exam_id: examId,
    strategy,
    overall: { kind: overall.kind, value: overall.value, label: overall.label },
    progression: {
      baseline: baseline ? { value: baseline.value, label: baseline.label, style: 'challenge' } : null,
      // headline MUST equal overall.value — the guarded field, copied not recomputed.
      headline: { value: overall.value, label: overall.label },
      // momentum is ALLOWED to differ from the headline. Separate display.
      momentum,
      recent_trend: history ? trend(history, trendWindow ?? 3) : null,
    },
  };

  // The invariant, corrected: it guards `headline`, not `momentum`.
  if (env.progression.headline.value !== env.overall.value) {
    throw new Error(
      `INVARIANT VIOLATION: progression.headline (${env.progression.headline.value}) !== overall (${env.overall.value})`
    );
  }
  return env;
}
