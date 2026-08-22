// Exam Engine — scoring strategy registry (B3).
// A strategy is a pluggable object selected by NAME (overall.strategy in config).
// There is no `if (examId === …)` anywhere — a new exam that scores like an
// existing one is config only; one that scores differently registers a new
// strategy here. `consumes` declares the RawScore unit the strategy eats.

import { RawScoreUnit } from './types';
import { bandMean, cefrHybrid, BandMeanResult, CefrHybridResult } from './scoring';

export interface ScoringStrategy {
  readonly id: string;
  readonly consumes: RawScoreUnit;
  /**
   * Aggregate assessed-component scores (already unit-checked and reduced to plain
   * numbers by the RawScore boundary) into the overall result for this exam's scale.
   */
  scoreOverall(componentScores: Record<string, number>, scale: any): BandMeanResult | CefrHybridResult;
}

const BAND_MEAN: ScoringStrategy = {
  id: 'band_mean',
  consumes: 'band',
  scoreOverall: (componentScores, scale) => bandMean(componentScores, scale),
};

const CEFR_HYBRID: ScoringStrategy = {
  id: 'cefr_hybrid',
  consumes: 'percent',
  scoreOverall: (componentScores, scale) => cefrHybrid(componentScores, scale),
};

const REGISTRY: Record<string, ScoringStrategy> = {
  [BAND_MEAN.id]: BAND_MEAN,
  [CEFR_HYBRID.id]: CEFR_HYBRID,
};

/** Look up a strategy by name. Throws on an unknown name (mirrors the validator). */
export function getStrategy(name: string | null | undefined): ScoringStrategy {
  if (!name || !(name in REGISTRY)) {
    throw new Error(`[exam-engine] unknown scoring strategy '${name}' (known: ${Object.keys(REGISTRY).join(', ')})`);
  }
  return REGISTRY[name];
}

export function hasStrategy(name: string): boolean {
  return name in REGISTRY;
}

export function knownStrategies(): string[] {
  return Object.keys(REGISTRY);
}
