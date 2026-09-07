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
import { bandMean, roundHalfUpToStep, clamp } from './scoring';
import { getStrategy } from './registry';
import { RawScore } from './types';

export interface ComponentResult {
  value: number;   // the band, exactly as the pre-extraction path produced it
  label: string;   // one-decimal display, e.g. "6.5"; for graded scales "350 (B)"
}

/** Letter grade for a value on a scale that defines grade_bands (e.g. OET A–E). null otherwise. */
function gradeFor(value: number, scale: any): string | null {
  const bands = Array.isArray(scale?.grade_bands) ? scale.grade_bands : null;
  if (!bands) return null;
  for (const b of bands) if (value >= b.min && value <= b.max) return b.grade ?? b.level ?? null;
  return null;
}

/**
 * Generic numeric transform for any scale that is NOT the IELTS [4,9] profile — e.g. OET
 * oet_500 (0–500, step 10, A–E grade bands), and later GRE/GMAT. Maps the raw performance to
 * a 0..1 position, then onto the scale's own [min,max] at its step. This is the generalization
 * the pre-existing componentBand comment deferred "until a second numeric exam actually needs it".
 */
function genericNumericBand(raw: RawScore, scale: any): ComponentResult {
  const min = Number(scale?.min ?? 0);
  const max = Number(scale?.max ?? 100);
  const step = Number(scale?.step ?? 1);
  let frac = 0;
  switch (raw.unit) {
    case 'raw':      frac = raw.total > 0 ? raw.correct / raw.total : 0; break;
    case 'internal': frac = (clamp(raw.value, 1, 10) - 1) / 9; break;                 // AI grades on internal 1..10
    case 'band':     frac = max > min ? (clamp(raw.value, min, max) - min) / (max - min) : 0; break;
    case 'percent':  frac = clamp(raw.value, 0, 100) / 100; break;
  }
  frac = clamp(frac, 0, 1);
  const value = clamp(roundHalfUpToStep(min + frac * (max - min), step), min, max);   // OET reports in 10s
  const grade = gradeFor(value, scale);
  return { value, label: grade ? `${value} (${grade})` : String(value) };
}

/** True only for the IELTS band profile — [4,9], 0.5 step, 4.0 report floor. */
export function isIeltsBandScale(scale: any): boolean {
  return scale?.report_floor === 4.0 && scale?.max === 9.0 && scale?.step === 0.5;
}

/** Convert a RawScore into a band on its numeric scale. */
export function componentBand(raw: RawScore, scale: any): ComponentResult {
  // Only the IELTS [4,9]/0.5/internal-1..10 profile keeps the proven bandScale maths
  // byte-for-byte (parity-asserted in vectors.check.ts §10). Every other numeric scale uses
  // the generic transform above — so IELTS is untouched while OET/GRE/GMAT get correct scores.
  if (!isIeltsBandScale(scale)) return genericNumericBand(raw, scale);

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

/** True if a component is scored on the IELTS band scale (→ band_score stores the value directly). */
export function isIeltsBandComponent(examId: string, componentId: string): boolean {
  try { return isIeltsBandScale(componentScale(examId, componentId)); } catch { return true; }
}

export interface StoredComponentScore {
  band_score: number;                     // safe for the numeric(2,1) / [0,9] column
  sub_scores_extra: Record<string, any>;  // {} for IELTS; {score,grade,scale_id,display} for wider scales
}

/**
 * Map a scored ComponentResult onto how the platform STORES it, given band_score is a
 * numeric(2,1) column with a [0,9] CHECK. IELTS bands (0–9) store as-is. Wider numeric scales
 * (OET oet_500) keep their real value+grade in sub_scores and store a 0–9 normalisation in
 * band_score for the shared widgets (decision D4).
 */
export function toStoredComponentScore(examId: string, componentId: string, result: ComponentResult): StoredComponentScore {
  const scale = componentScale(examId, componentId);
  if (isIeltsBandScale(scale)) return { band_score: result.value, sub_scores_extra: {} };
  const max = Number(scale?.max ?? 9) || 9;
  const band_score = clamp(Math.round((result.value / max) * 9 * 10) / 10, 0, 9);
  const grade = /\(([^)]+)\)/.exec(result.label)?.[1] ?? null;
  const scale_id = getExamConfig(examId)?.components?.find((c: any) => c.id === componentId)?.scale ?? null;
  return { band_score, sub_scores_extra: { score: result.value, grade, scale_id, display: result.label } };
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

/**
 * Headline overall for an exam: aggregate its assessed component bands using the
 * strategy NAMED in config (`overall.strategy`), never `if (examId)`. IELTS → band_mean
 * (mean of components, floored). Identical to the old `toBand(mean)` for 0.5-step bands
 * (see vectors.check.ts §11).
 */
export function scoreOverall(examId: string, componentBands: Record<string, number>) {
  const ex = getExamConfig(examId);
  const strategyName = ex?.overall?.strategy;
  const scaleId = ex?.overall?.scale;
  const scale = scaleId ? getScale(scaleId) : null;
  if (!strategyName || !scale) {
    throw new Error(`[exam-engine] scoreOverall: exam '${examId}' has no aggregate strategy/scale`);
  }
  return getStrategy(strategyName).scoreOverall(componentBands, scale);
}
