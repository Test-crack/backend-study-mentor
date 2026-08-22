// Exam Engine — progression layer (B10/B11/B12/B15).
// Display-only. It NEVER changes the assessed score. Faithful port of
// reference-impl.js. The invariant: progression.headline is COPIED from overall,
// so it can't diverge; momentum is free to differ.

import { clamp, tidy, nextLevel, withinLevelProgress } from './scoring';
import { OverallMode } from './types';

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
  strategy: string | null;
  /** Defaults to 'per_component' when `overall` is null, else 'aggregate'. */
  mode?: OverallMode;
  /** Null for per_component exams (OET/GRE/GMAT). */
  overall?: { kind: string; value: any; label: string } | null;
  /** Per-component results — the report body when there is no single headline. */
  components?: any[];
  momentum?: any;
  baseline?: { value: any; label: string } | null;
  history?: number[] | null;
  trendWindow?: number;
  // Provenance (B9) — the engine + config version this result was scored under.
  engineVersion?: string;
  configVersion?: string;
}

/**
 * B8: one envelope shape for every exam. `overall` is null for per_component exams;
 * B9: every result carries engine_version + config_version so a later threshold
 * recalibration can't silently reinterpret history.
 */
export function buildEnvelope(args: BuildEnvelopeArgs): any {
  const {
    examId, strategy, overall, components, momentum, baseline, history, trendWindow,
    engineVersion, configVersion,
  } = args;

  const isPerComponent = args.mode === 'per_component' || overall == null;

  const env: any = {
    exam_id: examId,
    engine_version: engineVersion ?? null,
    config_version: configVersion ?? null,
    strategy: isPerComponent ? null : strategy,
    overall: isPerComponent ? null : { kind: overall!.kind, value: overall!.value, label: overall!.label },
    ...(components ? { components } : {}),
    progression: isPerComponent
      ? null
      : {
          baseline: baseline ? { value: baseline.value, label: baseline.label, style: 'challenge' } : null,
          // headline MUST equal overall.value — the guarded field, copied not recomputed.
          headline: { value: overall!.value, label: overall!.label },
          // momentum is ALLOWED to differ from the headline. Separate display.
          momentum: momentum ?? null,
          recent_trend: history ? trend(history, trendWindow ?? 3) : null,
        },
  };

  // The invariant guards `headline` (aggregate exams only; per_component has none).
  if (!isPerComponent && env.progression.headline.value !== env.overall.value) {
    throw new Error(
      `INVARIANT VIOLATION: progression.headline (${env.progression.headline.value}) !== overall (${env.overall.value})`
    );
  }
  return env;
}
