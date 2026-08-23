// Exam Engine — per-component scoring (Phase 6 Part 1b).
//
// Turns a component's raw performance into a band on its scale, dispatching on the
// RawScore UNIT (not on examId). To keep the extraction byte-identical, the IELTS
// numeric profile DELEGATES to the proven low-level maths in src/lib/bandScale.ts —
// the exact functions the pre-extraction call sites use:
//
//   raw (correct/total)  → fractionToBand      (objective L/R)
//   internal (1..10)     → internalToBand      (AI blend result)
//   band (already 4..9)  → toBand              (AI mean-of-criteria)
//
// Generalization boundary: these delegates hardcode the IELTS [4,9] / 0.5 / internal-1..10
// profile. A future exam whose numeric scale differs needs a generic transform here; that
// is deferred until a second numeric exam actually needs it (Spoken English is ordinal/CEFR).
// Parity vs bandScale is asserted across a grid in vectors.check.ts §10.

import { toBand, fractionToBand, internalToBand } from '../lib/bandScale';
import { getExamConfig, getScale } from './loader';
import { bandMean } from './scoring';
import { RawScore } from './types';

export interface ComponentResult {
  value: number;   // the band, exactly as the pre-extraction path produced it
  label: string;   // one-decimal display, e.g. "6.5"
}

/** Convert a RawScore into a band on a numeric scale. Delegates to bandScale (IELTS profile). */
export function componentBand(raw: RawScore, _scale: any): ComponentResult {
  let value: number;
  switch (raw.unit) {
    case 'raw':
      value = fractionToBand(raw.total > 0 ? raw.correct / raw.total : 0);
      break;
    case 'internal':
      if (raw.min !== 1 || raw.max !== 10) {
        throw new Error(
          `[exam-engine] componentBand: internal scale ${raw.min}..${raw.max} not supported yet ` +
          `(delegates to bandScale.internalToBand which assumes 1..10)`
        );
      }
      value = internalToBand(raw.value);
      break;
    case 'band':
      value = toBand(raw.value);
      break;
    case 'percent':
      throw new Error(`[exam-engine] componentBand: 'percent' unit is not a numeric-band input`);
  }
  return { value, label: value.toFixed(1) };
}

function componentScale(examId: string, componentId: string): any {
  const ex = getExamConfig(examId);
  const comp = ex?.components?.find((c: any) => c.id === componentId);
  const scale = comp?.scale ? getScale(comp.scale) : null;
  if (!scale) throw new Error(`[exam-engine] no scale for ${examId}.${componentId}`);
  return scale;
}

/** Facade: resolve a component's scale from config, then score its raw performance. */
export function scoreComponent(examId: string, componentId: string, raw: RawScore): ComponentResult {
  return componentBand(raw, componentScale(examId, componentId));
}

/**
 * Aggregate a component's already-graded subskill bands into the component band.
 * IELTS writing/speaking = mean of the 4 criteria; delegates to band_mean on the
 * component's scale (identical to the old `toBand(mean)` for 0.5-step criteria —
 * parity-asserted in vectors.check.ts §11). The rubric that produced the criteria
 * (prompt, penalties, floors) stays in the grading service (Layer B).
 */
export function scoreComponentFromSubskills(
  examId: string,
  componentId: string,
  subskillBands: Record<string, number>
): ComponentResult {
  const r = bandMean(subskillBands, componentScale(examId, componentId));
  return { value: r.value, label: r.label };
}
