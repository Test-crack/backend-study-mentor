/**
 * Canonical IELTS band-scale transforms — the platform band domain is [4.0, 9.0].
 *
 * EVERY band-producing path must exit through one of these helpers so the range
 * can never drift. Two grading families:
 *
 *   Objective (MCQ / Listening / Reading): a 0..1 mastery fraction maps linearly
 *   onto [4,9] via fractionToBand — 0% correct = 4.0 (the absolute IELTS-standard
 *   floor), 100% = 9.0.
 *
 *   Subjective (AI-graded Writing/Speaking): the AI keeps grading on its internal
 *   1..10 scale; only the final conversion (internalToBand) rebases onto [4,9].
 *   The AI's calibrated judgment is never numerically re-inflated — we rebase the
 *   scale it lands on, not multiply its output.
 *
 * Decision log (band-range-4-9-plan.md): D1 rescale, D2 absolute 4.0 floor even
 * for empty/invalid attempts, D3 even-thirds levels, D4 weakness gap (band−4)/5.
 */

export const BAND_MIN = 4.0;
export const BAND_MAX = 9.0;
export const BAND_SPAN = BAND_MAX - BAND_MIN; // 5.0

/** Round to nearest 0.5 and clamp to [4,9]. The universal exit gate for any band. */
export function toBand(x: number): number {
    if (!Number.isFinite(x)) return BAND_MIN;
    const r = Math.round(x * 2) / 2;
    return Math.min(BAND_MAX, Math.max(BAND_MIN, r));
}

/** Map a 0..1 mastery fraction onto [4,9]. Objective (MCQ / L / R) scoring. */
export function fractionToBand(frac: number): number {
    const f = Math.min(1, Math.max(0, Number.isFinite(frac) ? frac : 0));
    return toBand(BAND_MIN + f * BAND_SPAN);
}

/**
 * Map the internal 1..10 AI grading scale onto [4,9].
 * Anchors: internal 1 → 4.0 (floor), internal 10 → 9.0. Replaces `score − 1`.
 */
export function internalToBand(score1to10: number): number {
    const s = Math.min(10, Math.max(1, Number.isFinite(score1to10) ? score1to10 : 1));
    return toBand(BAND_MIN + ((s - 1) / 9) * BAND_SPAN);
}

/** A/B/C level from a band — even thirds of [4,9] (D3). */
export function bandToLevel(band: number): 'A' | 'B' | 'C' {
    if (band < 5.5) return 'A';
    if (band < 7.0) return 'B';
    return 'C';
}

/** Same thresholds as bandToLevel, expressed as the drill/IA difficulty enum. */
export function bandToDifficulty(band: number): 'BEGINNER' | 'INTERMEDIATE' | 'ADVANCED' {
    if (band < 5.5) return 'BEGINNER';
    if (band < 7.0) return 'INTERMEDIATE';
    return 'ADVANCED';
}

/**
 * Weakness gap 0..1 for drill/IA targeting (D4): band 4 = fully weak (1.0),
 * band 9 = no gap (0.0). Replaces the old `1 − band/9` normalization.
 */
export function bandGap(band: number): number {
    const b = Math.min(BAND_MAX, Math.max(BAND_MIN, Number.isFinite(band) ? band : BAND_MIN));
    return 1 - (b - BAND_MIN) / BAND_SPAN;
}
