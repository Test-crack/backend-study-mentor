// Config-verification engine — shared result types (mirrors the drills/loadout verifiers).
// Two layers: Layer 1 = structural ("will the engine run this?"), Layer 2 = interpretation
// ("what does it MEAN, in plain English?"). Layer 2 is the same resolution the runtime uses.
import { ExamInterpretation } from '../../exam-engine/interpret';

export type ConfigSeverity = 'fail' | 'warn' | 'info';
export type ConfigOutcome = 'pass' | 'warn' | 'fail';

export interface ConfigFinding {
  code: string;               // stable-ish machine code (STRUCTURE_ERROR, INTERPRETATION_CONCERN, …)
  severity: ConfigSeverity;
  message: string;
  path?: string;              // optional pointer into the config
}

export interface LayerResult {
  outcome: ConfigOutcome;
  findings: ConfigFinding[];
}

export interface Layer2Result extends LayerResult {
  interpretation: ExamInterpretation | null;
  plainEnglish: string;       // human-readable rendering (markdown)
}

export interface ConfigVerifyResult {
  examId: string;
  outcome: ConfigOutcome;     // worst of the two layers
  layer1: LayerResult;        // structural
  layer2: Layer2Result;       // interpretation
}

const RANK: Record<ConfigOutcome, number> = { pass: 0, warn: 1, fail: 2 };
export function worst(a: ConfigOutcome, b: ConfigOutcome): ConfigOutcome {
  return RANK[a] >= RANK[b] ? a : b;
}
export function outcomeFrom(findings: ConfigFinding[]): ConfigOutcome {
  if (findings.some((f) => f.severity === 'fail')) return 'fail';
  if (findings.some((f) => f.severity === 'warn')) return 'warn';
  return 'pass';
}
