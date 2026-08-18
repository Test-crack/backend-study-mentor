/**
 * Sub-Skill Priority Selector — Stage 2 of the IA pipeline
 *
 * Selects the 2 (skill, sub_skill) pairs that need the most work for
 * a given student, used to target Internal Assessment questions.
 *
 * Selection algorithm (in priority order, never throws):
 *   1. If the student has drilled ≥ 2 distinct (skill, sub_skill) combos
 *      → rank all drilled combos by weakness_score, return top 2
 *   2. If the student has drilled exactly 1 combo
 *      → use that + pick the weakest undrilled pair from the competency matrix
 *   3. If the student has drilled 0 combos
 *      → pick 2 weakest pairs from the competency matrix band scores
 *   4. If competency matrix is also empty (brand-new student)
 *      → return HARDCODED_DEFAULTS
 *
 * weakness_score = (1 − drill_accuracy) × 0.60
 *               + bandGap(sub_skill_band) × 0.40      // gap on the [4,9] domain
 *
 * Higher weakness_score = higher IA priority.
 * Both slots can be from the same parent skill — no diversity constraint.
 */

import prisma from './prisma';
import { bandGap } from './bandScale';

// ─── Static maps ─────────────────────────────────────────────────────────────

/** All (skill, sub_skill) pairs that IAQuestion can target. */
const ALL_IA_PAIRS: Array<{ skill: string; sub_skill: string }> = [
    { skill: 'WRITING',   sub_skill: 'GRAMMAR' },
    { skill: 'WRITING',   sub_skill: 'VOCABULARY' },
    { skill: 'WRITING',   sub_skill: 'COHERENCE' },
    { skill: 'WRITING',   sub_skill: 'TASK_RESPONSE' },
    { skill: 'SPEAKING',  sub_skill: 'GRAMMAR' },
    { skill: 'SPEAKING',  sub_skill: 'VOCABULARY' },
    { skill: 'SPEAKING',  sub_skill: 'FLUENCY' },
    { skill: 'SPEAKING',  sub_skill: 'PRONUNCIATION' },
    { skill: 'READING',   sub_skill: 'READING' },
    { skill: 'LISTENING', sub_skill: 'LISTENING' },
];

/**
 * Maps SubSkillType → the key name inside StudentCompetencyMatrix.sub_scores.
 * READING and LISTENING have no sub-score keys — they use the skill-level band_score.
 */
const SUB_SCORE_KEY: Readonly<Record<string, string>> = {
    GRAMMAR:       'grammarScore',
    VOCABULARY:    'vocabularyScore',
    COHERENCE:     'coherenceScore',
    TASK_RESPONSE: 'taskResponseScore',
    FLUENCY:       'fluencyScore',
    PRONUNCIATION: 'pronunciationScore',
};

/** Absolute fallback — guaranteed valid once questions are seeded. */
const HARDCODED_DEFAULTS: [SubSkillPair, SubSkillPair] = [
    { skill: 'WRITING',  sub_skill: 'GRAMMAR' },
    { skill: 'SPEAKING', sub_skill: 'VOCABULARY' },
];

// ─── Public types ─────────────────────────────────────────────────────────────

export interface SubSkillPair {
    skill:     string;
    sub_skill: string;
}

/** The two sub-skills selected for the IA, plus a diagnostic hint on which path was used. */
export interface SelectedSubSkills {
    primary:   SubSkillPair;
    secondary: SubSkillPair;
    /** Indicates which fallback level was reached — useful for logging/monitoring. */
    source: 'drill_history' | 'competency_matrix' | 'defaults';
}

// ─── Internal types ───────────────────────────────────────────────────────────

interface ScoredPair extends SubSkillPair {
    weakness: number; // 0–1, higher = more work needed
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function weaknessScore(drillAccuracy: number, bandScore: number): number {
    const accuracyComponent = (1 - Math.min(1, Math.max(0, drillAccuracy))) * 0.6;
    // D4: gap normalized on the [4,9] domain — band 4 = fully weak, band 9 = no gap.
    const bandComponent     = bandGap(bandScore) * 0.4;
    return accuracyComponent + bandComponent;
}

function pairKey(skill: string, sub_skill: string): string {
    return `${skill}::${sub_skill}`;
}

function buildCompetencyLookup(
    rows: Array<{ skill: string; band_score: any; sub_scores: any }>
): Map<string, { band: number; subScores: Record<string, number> }> {
    const map = new Map<string, { band: number; subScores: Record<string, number> }>();
    for (const row of rows) {
        const rawSubScores = (row.sub_scores ?? {}) as Record<string, any>;
        const subScores: Record<string, number> = {};
        for (const [k, v] of Object.entries(rawSubScores)) {
            const parsed = parseFloat(String(v));
            if (!isNaN(parsed)) subScores[k] = parsed;
        }
        map.set(String(row.skill), {
            band:      parseFloat(String(row.band_score ?? '5.0')) || 5.0,
            subScores,
        });
    }
    return map;
}

/** Resolves the best available band score for a (skill, sub_skill) pair. */
function getBandForPair(
    skill: string,
    sub_skill: string,
    lookup: Map<string, { band: number; subScores: Record<string, number> }>
): number {
    const entry = lookup.get(skill);
    if (!entry) return 5.0; // neutral mid-range when no data exists

    const key = SUB_SCORE_KEY[sub_skill];
    if (key && entry.subScores[key] != null) {
        return entry.subScores[key];
    }
    // READING and LISTENING fall here — use skill-level band
    return entry.band;
}

// ─── Core selection ───────────────────────────────────────────────────────────

async function _selectInternal(studentId: string, excludeSubSkills?: Set<string>): Promise<SelectedSubSkills> {

    // ── 1. Drill history: aggregate accuracy per (skill, sub_skill) ───────────
    const drillGroups = await prisma.drillSession.groupBy({
        by:    ['skill', 'sub_skill'],
        where: { student_id: studentId },
        _sum:  { correct_answers: true, total_questions: true },
    });

    // ── 2. Competency matrix: band score per skill ────────────────────────────
    const competencyRows = await prisma.studentCompetencyMatrix.findMany({
        where:  { student_id: studentId },
        select: { skill: true, band_score: true, sub_scores: true },
    });

    const competencyLookup = buildCompetencyLookup(
        competencyRows.map(r => ({ skill: String(r.skill), band_score: r.band_score, sub_scores: r.sub_scores }))
    );

    const shouldExclude = (sub_skill: string) =>
        excludeSubSkills != null && excludeSubSkills.size > 0 && excludeSubSkills.has(sub_skill);

    // ── 3. Score every drilled (skill, sub_skill) pair ────────────────────────
    const drilledScored: ScoredPair[] = drillGroups
        .filter(g => (g._sum.total_questions ?? 0) > 0 && !shouldExclude(String(g.sub_skill)))
        .map(g => {
            const total    = g._sum.total_questions ?? 1;
            const correct  = g._sum.correct_answers ?? 0;
            const accuracy = correct / total;
            const band     = getBandForPair(String(g.skill), String(g.sub_skill), competencyLookup);
            return {
                skill:     String(g.skill),
                sub_skill: String(g.sub_skill),
                weakness:  weaknessScore(accuracy, band),
            };
        })
        .sort((a, b) => b.weakness - a.weakness); // highest weakness first

    // ── 4. Happy path: ≥ 2 drilled pairs ─────────────────────────────────────
    if (drilledScored.length >= 2) {
        return {
            primary:   { skill: drilledScored[0].skill, sub_skill: drilledScored[0].sub_skill },
            secondary: { skill: drilledScored[1].skill, sub_skill: drilledScored[1].sub_skill },
            source:    'drill_history',
        };
    }

    // ── 5. Partial / no drill data: fill from competency matrix ──────────────
    const drilledKeySet = new Set(drilledScored.map(p => pairKey(p.skill, p.sub_skill)));

    // Score ALL IA-targetable pairs that the student has NOT yet drilled
    const matrixScored: ScoredPair[] = ALL_IA_PAIRS
        .filter(p => !drilledKeySet.has(pairKey(p.skill, p.sub_skill)) && !shouldExclude(p.sub_skill))
        .map(p => {
            const band = getBandForPair(p.skill, p.sub_skill, competencyLookup);
            return {
                skill:     p.skill,
                sub_skill: p.sub_skill,
                weakness:  weaknessScore(1.0, band), // no drill data → assume worst-case accuracy
            };
        })
        .sort((a, b) => b.weakness - a.weakness);

    // Merge: drilled (if any) first, then best from matrix
    // Fallback: if all pairs are excluded, ignore the exclusion set and use full pool
    let merged: ScoredPair[] = [...drilledScored, ...matrixScored];
    if (merged.length < 2 && excludeSubSkills && excludeSubSkills.size > 0) {
        const allDrilledScored: ScoredPair[] = drillGroups
            .filter(g => (g._sum.total_questions ?? 0) > 0)
            .map(g => {
                const total    = g._sum.total_questions ?? 1;
                const correct  = g._sum.correct_answers ?? 0;
                const accuracy = correct / total;
                const band     = getBandForPair(String(g.skill), String(g.sub_skill), competencyLookup);
                return { skill: String(g.skill), sub_skill: String(g.sub_skill), weakness: weaknessScore(accuracy, band) };
            })
            .sort((a, b) => b.weakness - a.weakness);
        const allDrilledKeySet = new Set(allDrilledScored.map(p => pairKey(p.skill, p.sub_skill)));
        const allMatrixScored: ScoredPair[] = ALL_IA_PAIRS
            .filter(p => !allDrilledKeySet.has(pairKey(p.skill, p.sub_skill)))
            .map(p => ({ skill: p.skill, sub_skill: p.sub_skill, weakness: weaknessScore(1.0, getBandForPair(p.skill, p.sub_skill, competencyLookup)) }))
            .sort((a, b) => b.weakness - a.weakness);
        merged = [...allDrilledScored, ...allMatrixScored];
    }

    if (merged.length >= 2) {
        return {
            primary:   { skill: merged[0].skill, sub_skill: merged[0].sub_skill },
            secondary: { skill: merged[1].skill, sub_skill: merged[1].sub_skill },
            source:    competencyRows.length > 0 ? 'competency_matrix' : 'defaults',
        };
    }

    // ── 6. Absolute safety net: pad with hardcoded defaults ───────────────────
    const result: SubSkillPair[] = merged.map(p => ({ skill: p.skill, sub_skill: p.sub_skill }));
    const resultKeySet           = new Set(result.map(p => pairKey(p.skill, p.sub_skill)));

    for (const d of HARDCODED_DEFAULTS) {
        if (result.length >= 2) break;
        if (!resultKeySet.has(pairKey(d.skill, d.sub_skill))) {
            result.push(d);
            resultKeySet.add(pairKey(d.skill, d.sub_skill));
        }
    }

    // If both defaults were already selected (shouldn't happen, but defensive)
    if (result.length < 2) {
        for (const p of ALL_IA_PAIRS) {
            if (result.length >= 2) break;
            if (!resultKeySet.has(pairKey(p.skill, p.sub_skill))) {
                result.push(p);
            }
        }
    }

    return {
        primary:   result[0] ?? HARDCODED_DEFAULTS[0],
        secondary: result[1] ?? HARDCODED_DEFAULTS[1],
        source:    'defaults',
    };
}

// ─── Public entry point ───────────────────────────────────────────────────────

/**
 * Selects the 2 most-needed (skill, sub_skill) pairs for the student's next IA.
 *
 * @param excludeSubSkills - Optional set of sub_skill strings to skip (2-week uniqueness rule).
 *                           If all pairs are excluded, the constraint is relaxed automatically.
 *
 * Never throws — any Prisma or runtime error falls back to HARDCODED_DEFAULTS
 * so the IA gate never fails due to the selector.
 */
export async function selectPrioritySubSkills(studentId: string, excludeSubSkills?: Set<string>): Promise<SelectedSubSkills> {
    try {
        const result = await _selectInternal(studentId, excludeSubSkills);

        // Final type-safety guard: ensure both pairs are non-null valid objects
        const primary   = result.primary   ?? HARDCODED_DEFAULTS[0];
        const secondary = result.secondary ?? HARDCODED_DEFAULTS[1];

        console.log(
            `[SubskillSelector] student=${studentId} ` +
            `primary=${primary.skill}/${primary.sub_skill} ` +
            `secondary=${secondary.skill}/${secondary.sub_skill} ` +
            `source=${result.source}`
        );

        return { primary, secondary, source: result.source };

    } catch (err) {
        console.error('[SubskillSelector] Unexpected error — falling back to defaults:', err);
        return {
            primary:   HARDCODED_DEFAULTS[0],
            secondary: HARDCODED_DEFAULTS[1],
            source:    'defaults',
        };
    }
}
