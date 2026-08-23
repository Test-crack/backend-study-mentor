// Exam Engine — public surface. Import from here, not the individual files.
export * from './types';
export { validateConfig } from './validator';
export {
  roundHalfUpToStep, clamp, tidy,
  pctToLevel, withinLevelProgress, nextLevel, levelIndex,
  bandMean, cefrHybrid,
  proficiencyLevel, difficulty, weaknessGap,
} from './scoring';
export { numericMomentum, ordinalMomentum, trend, buildEnvelope } from './progression';
export { getStrategy, hasStrategy, knownStrategies } from './registry';
export type { ScoringStrategy } from './registry';
export { examProficiencyLevel, examDifficulty, examWeaknessGap } from './proficiency';
export { assertUnit, asPercent, asBand, asFraction, readAll, RawScoreUnitError } from './rawScore';
export {
  toPublicConfig, toPublicExamSummary, listPublicConfigs, listPublicSummaries,
} from './publicConfig';
export type { PublicExamConfig, PublicExamSummary } from './publicConfig';
export {
  loadExamEngine,
  getEngineConfig,
  getExamConfig,
  listExamConfigs,
  getScale,
  getEngineVersion,
  getConfigVersion,
  provenance,
  readConfigFile,
  configFilePath,
} from './loader';
