// Layer 1 — STRUCTURAL. "Will the engine actually run this config?"
// Wraps the existing validateConfig (the real gate at boot) and scopes it to ONE candidate
// exam, feeding it only the scales that exam references — so referential checks resolve
// whether the exam is already live or a never-seen candidate JSON.
import { validateConfig } from '../../exam-engine/validator';
import { ExamConfigEntry, EngineConfig } from '../../exam-engine/types';
import { ConfigFinding, LayerResult, outcomeFrom } from './types';

// A minimal EngineConfig around one exam + only the scales it references (from the effective
// scales map the caller resolved — candidate's own overlaid on the engine's).
function scopedEngineConfig(exam: ExamConfigEntry | any, scales: Record<string, any>): EngineConfig {
  const referenced: Record<string, any> = {};
  for (const c of exam.components ?? []) if (c.scale && scales[c.scale]) referenced[c.scale] = scales[c.scale];
  if (exam.overall?.scale && scales[exam.overall.scale]) referenced[exam.overall.scale] = scales[exam.overall.scale];
  return {
    engine_version: 'verify',
    config_version: exam.config_version ?? 'candidate',
    scales: referenced,
    exams: { [exam.exam_id ?? 'candidate']: exam },
  } as EngineConfig;
}

export function verifyStructure(exam: ExamConfigEntry | any, scales: Record<string, any> = {}): LayerResult {
  const findings: ConfigFinding[] = [];

  // Guard the assumptions validateConfig itself makes (it does ex.components.map / ex.overall.mode).
  if (!Array.isArray(exam?.components) || exam.components.length === 0) {
    findings.push({ code: 'NO_COMPONENTS', severity: 'fail', message: 'Config declares no components — there is nothing to assess.', path: 'components' });
    return { outcome: 'fail', findings };
  }
  if (!exam.overall || typeof exam.overall.mode !== 'string') {
    findings.push({ code: 'NO_OVERALL', severity: 'fail', message: 'Config has no overall.mode — the engine cannot tell how results are reported.', path: 'overall.mode' });
    return { outcome: 'fail', findings };
  }

  try {
    const { errors, warnings } = validateConfig(scopedEngineConfig(exam, scales));
    for (const message of errors) findings.push({ code: 'STRUCTURE_ERROR', severity: 'fail', message });
    for (const message of warnings) findings.push({ code: 'STRUCTURE_WARN', severity: 'warn', message });
  } catch (e: any) {
    findings.push({ code: 'STRUCTURE_CRASH', severity: 'fail', message: `The engine validator threw on this config: ${e?.message ?? e}` });
  }

  return { outcome: outcomeFrom(findings), findings };
}
