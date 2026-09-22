// Config-verification orchestrator. Runs both layers on one exam config and combines them.
// Works for an existing (loaded) exam OR a pasted candidate — the effective scales map is the
// engine's scales overlaid with any the candidate brings, so references resolve either way.
import { getEngineConfig } from '../../exam-engine/loader';
import { ExamConfigEntry } from '../../exam-engine/types';
import { verifyStructure } from './layer1';
import { verifyInterpretation } from './layer2';
import { ConfigVerifyResult, worst } from './types';

function effectiveScales(candidateScales?: Record<string, any>): Record<string, any> {
  let engineScales: Record<string, any> = {};
  try { engineScales = getEngineConfig().scales ?? {}; } catch { /* engine not loaded (e.g. CLI) — fine */ }
  return { ...engineScales, ...(candidateScales ?? {}) };
}

/** Verify one exam config. `candidateScales` lets a pasted config carry its own scales. */
export function verifyConfig(exam: ExamConfigEntry | any, candidateScales?: Record<string, any>): ConfigVerifyResult {
  const scales = effectiveScales(candidateScales);
  const layer1 = verifyStructure(exam, scales);
  const layer2 = verifyInterpretation(exam, scales);   // always interpret, even if Layer 1 fails
  return {
    examId: exam?.exam_id ?? 'candidate',
    outcome: worst(layer1.outcome, layer2.outcome),
    layer1,
    layer2,
  };
}
