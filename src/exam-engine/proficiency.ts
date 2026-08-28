// Exam Engine — proficiency / difficulty / weakness facade (Phase 6 Part 2).
//
// examId-based wrappers over the pure config-driven functions in scoring.ts.
// A call site passes the exam id (currently the literal 'ielts' — the flows are
// still IELTS-shaped); the A/B/C cuts and the weakness-gap domain live in that
// exam's SCALE config, never in code. Swapping a call site from bandScale to one
// of these moves the threshold from code → data, so the next exam supplies its
// own cuts with no code change (see docs/ielts-extraction).
//
// Output is identical to bandScale for IELTS by construction — the pure functions
// are parity-asserted against bandScale across the band grid in vectors.check.ts §9.

import { getExamConfig, getScale } from './loader';
import { proficiencyLevel, difficulty, weaknessGap } from './scoring';

/** The numeric scale an exam scores its headline on (IELTS: ielts_band). */
function examNumericScale(examId: string): any {
  const ex = getExamConfig(examId);
  if (!ex) throw new Error(`[exam-engine] unknown exam '${examId}'`);
  const scaleId =
    ex.overall?.scale ?? ex.components?.find((c: any) => c.assessed && c.scale)?.scale;
  const scale = scaleId ? getScale(scaleId) : null;
  if (!scale) throw new Error(`[exam-engine] no numeric scale resolved for exam '${examId}'`);
  return scale;
}

/** Proficiency level (IELTS: A/B/C). Replaces bandScale.bandToLevel at call sites. */
export function examProficiencyLevel(examId: string, band: number): string {
  return proficiencyLevel(band, examNumericScale(examId));
}

/** Drill/IA difficulty (IELTS: BEGINNER/INTERMEDIATE/ADVANCED). Replaces bandToDifficulty. */
export function examDifficulty(examId: string, band: number): string {
  return difficulty(band, examNumericScale(examId));
}

/** Weakness gap 0..1 for targeting. Replaces bandScale.bandGap. */
export function examWeaknessGap(examId: string, band: number): number {
  return weaknessGap(band, examNumericScale(examId));
}
