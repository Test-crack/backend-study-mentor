/**
 * IA Grading Core â€” shared by POST /api/ia/submit (HTTP path) and the
 * auto-submit sweep in iaMissDetector (for IN_PROGRESS sessions that expired
 * with answers saved but never explicitly submitted).
 *
 * Call `processIASession(sessionId, studentId)` to grade, update the competency
 * matrix, award momentum, and mark the session COMPLETED in one transaction.
 */

import prisma from './prisma';
import { gradeIAWritingPrompt, gradeIASpeakingPrompt } from './iaGrading';
import { BAND_MIN, toBand, internalToBand } from './bandScale';
import { provenance } from '../exam-engine';

// Thrown when processIASession is called on an already-COMPLETED session.
// Callers must catch this and return the stored result instead of erroring.
export class AlreadyCompletedError extends Error {
    constructor() { super('Session already graded'); this.name = 'AlreadyCompletedError'; }
}

/**
 * Single implementation of the competency-matrix smoothing rule:
 *   smoothed = 0.4 Ã— oldBand + 0.6 Ã— newBand, deviation capped at Â±2, rounded to 0.5.
 *
 * Used for W/S sub-skill scores, R/L skill bands, and the response preview in iaController.
 * Having one copy means the Â±2 cap and weights are always in sync.
 */
export function applySmoothing(oldBand: number | null, newBand: number): number {
    if (oldBand === null || isNaN(oldBand)) {
        return toBand(newBand);
    }
    let w = 0.4 * oldBand + 0.6 * newBand;
    const dev = w - oldBand;
    if (dev >  2) w = oldBand + 2;
    if (dev < -2) w = oldBand - 2;
    return toBand(w);
}

// â”€â”€ Shared types (also imported by iaController for the HTTP response) â”€â”€â”€â”€â”€â”€â”€â”€â”€

export type SectionScore = {
    skill:             string;
    sub_skill:         string;
    band:              number;
    correct:           number;
    total:             number;
    ai_question_count: number;
    ai_graded:         boolean;
    ai_feedback?:      { rationale: string; key_observations: string[] };
};

// â”€â”€ Internal constants â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export const SUB_SCORE_KEY_MAP: Record<string, string> = {
    GRAMMAR:       'grammarScore',
    VOCABULARY:    'vocabularyScore',
    COHERENCE:     'coherenceScore',
    TASK_RESPONSE: 'taskResponseScore',
    FLUENCY:       'fluencyScore',
    PRONUNCIATION: 'pronunciationScore',
};

const SUB_SKILL_LABEL: Record<string, string> = {
    GRAMMAR: 'Grammar', VOCABULARY: 'Vocabulary', COHERENCE: 'Coherence',
    TASK_RESPONSE: 'Task Response', FLUENCY: 'Fluency', PRONUNCIATION: 'Pronunciation',
    READING: 'Reading', LISTENING: 'Listening',
};

// â”€â”€ Public result type â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export interface IAProcessResult {
    sectionScores:       SectionScore[];
    previousBands:       Map<string, number | null>;   // for delta display in HTTP response
    momentumAwarded:     number;
    momentumBreakdown:   { reason: string; points: number }[];
    updatedMomentum:     number;
    isFirstIA:           boolean;
}

// â”€â”€ Core processor â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

/**
 * Grades a session, writes results to DB (COMPLETED), and returns scoring data.
 * The session must exist and belong to the given student.
 * Caller is responsible for validating status before calling (don't call on MISSED/COMPLETED).
 *
 * Serializes concurrent grading of the same session behind a session-scoped advisory
 * lock so a double-click submit (or a submit racing the miss-detector's auto-grade)
 * can't run the Gemini calls twice. Held for the AI calls themselves, not just the
 * closing transaction — so it can't be tx-scoped without holding a DB connection open
 * for however long Gemini takes.
 */
export async function processIASession(
    sessionId: string,
    studentId: string,
): Promise<IAProcessResult> {
    const [{ locked }] = await prisma.$queryRaw<{ locked: boolean }[]>`
        SELECT pg_try_advisory_lock(hashtext(${sessionId})) AS locked
    `;
    if (!locked) throw new AlreadyCompletedError();
    try {
        return await gradeIASessionLocked(sessionId, studentId);
    } finally {
        await prisma.$queryRaw`SELECT pg_advisory_unlock(hashtext(${sessionId}))`;
    }
}

async function gradeIASessionLocked(
    sessionId: string,
    studentId: string,
): Promise<IAProcessResult> {
    const session = await prisma.iASession.findUniqueOrThrow({ where: { id: sessionId } });
    // Fast-path: if already COMPLETED, don't re-run AI grading or momentum writes.
    if (session.status === 'COMPLETED') throw new AlreadyCompletedError();

    // â”€â”€ 1. Load questions + strip __meta from saved answers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    const questionIdsConfig = session.question_ids as Array<{ skill: string; sub_skill: string; ids: string[] }>;
    const allIds = questionIdsConfig.flatMap(c => c.ids);

    const questions = await prisma.iAQuestion.findMany({
        where:  { id: { in: allIds } },
        select: { id: true, sub_skill: true, question_type: true, correct_answer: true, prompt_text: true },
    });

    const answers = Object.fromEntries(
        Object.entries((session.answers ?? {}) as Record<string, unknown>)
            .filter(([k]) => k !== '__meta')
    ) as Record<string, string>;

    // â”€â”€ 2. Launch AI grading jobs in parallel â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    type AIJob = { sectionIdx: number; band: number; rationale: string; key_observations: string[] };
    const aiJobPromises: Promise<AIJob>[] = [];

    for (let i = 0; i < questionIdsConfig.length; i++) {
        const cfg    = questionIdsConfig[i];
        const subQs  = questions.filter(q => cfg.ids.includes(q.id));
        const aiQs   = subQs.filter(q =>
            q.question_type === 'WRITING_PROMPT' || q.question_type === 'SPEAKING_PROMPT'
        );
        for (const q of aiQs) {
            const rawText = (answers[q.id] ?? '').trim();
            const text    = rawText === '[no transcript]' ? '' : rawText;
            const idx     = i;
            const job = (async (): Promise<AIJob> => {
                const result = q.question_type === 'WRITING_PROMPT'
                    ? await gradeIAWritingPrompt(cfg.sub_skill, q.prompt_text, text)
                    : await gradeIASpeakingPrompt(cfg.sub_skill, q.prompt_text, text);
                return { sectionIdx: idx, band: result.band, rationale: result.rationale, key_observations: result.key_observations };
            })();
            aiJobPromises.push(job);
        }
    }
    const aiJobResults = await Promise.all(aiJobPromises);

    const aiBandsBySectionIdx    = new Map<number, number[]>();
    const aiFeedbackBySectionIdx = new Map<number, { rationale: string; key_observations: string[] }[]>();
    for (const j of aiJobResults) {
        const bands = aiBandsBySectionIdx.get(j.sectionIdx) ?? [];
        bands.push(j.band);
        aiBandsBySectionIdx.set(j.sectionIdx, bands);
        const fb = aiFeedbackBySectionIdx.get(j.sectionIdx) ?? [];
        fb.push({ rationale: j.rationale, key_observations: j.key_observations });
        aiFeedbackBySectionIdx.set(j.sectionIdx, fb);
    }

    // â”€â”€ 3. Score each sub-skill (MCQ + AI weighted) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    const sectionScores: SectionScore[] = [];

    for (let i = 0; i < questionIdsConfig.length; i++) {
        const cfg   = questionIdsConfig[i];
        const subQs = questions.filter(q => cfg.ids.includes(q.id));
        const mcqQs = subQs.filter(q => q.question_type === 'MCQ' || q.question_type === 'TFNG');
        const aiQs  = subQs.filter(q =>
            q.question_type === 'WRITING_PROMPT' || q.question_type === 'SPEAKING_PROMPT'
        );

        let correct = 0;
        for (const q of mcqQs) {
            const sa = (answers[q.id] ?? '').trim().toUpperCase();
            let ca = '';
            if (q.correct_answer != null) {
                ca = typeof q.correct_answer === 'string'
                    ? q.correct_answer.trim().toUpperCase()
                    : String(q.correct_answer).trim().toUpperCase();
                ca = ca.replace(/^["']|["']$/g, '');
            }
            if (sa && ca && sa === ca) correct++;
        }
        // Map MCQ to the same 1â€“10 scale Gemini uses: 0 correct â†’ 1 (IELTS 0), all correct â†’ 10 (IELTS 9).
        // Using N/T * 10 would put 0 correct at score 0, out of the 1â€“10 scale and mismatched against
        // AI sub-scores when combined in a weighted average.  Math.max(1, N/T*10) fixes the floor but
        // collapses 0% and any score below 10% to score 1 â€” a different form of inflation.
        // 1 + (N/T)*9 is proportional within [1,10] with the correct anchors at both ends.
        const mcqScore = mcqQs.length > 0 ? Math.min(10, 1 + (correct / mcqQs.length) * 9) : null;

        const aiBands     = aiBandsBySectionIdx.get(i) ?? [];
        const aiFeedbacks = aiFeedbackBySectionIdx.get(i) ?? [];
        const aiAvgScore  = aiBands.length > 0 ? aiBands.reduce((a, b) => a + b, 0) / aiBands.length : null;

        let combinedScore: number;
        if (!mcqScore && !aiAvgScore)      combinedScore = 1;
        else if (mcqScore === null)        combinedScore = aiAvgScore!;
        else if (aiAvgScore === null)      combinedScore = mcqScore;
        else {
            // Spec: AI grade weighted 2Ã—, MCQ grade weighted 1Ã— â€” weight the two
            // aggregate grades, NOT the question counts. (Previously used
            // mcqQs.length vs aiQs.length*2, which with 8 MCQ + 2 prompts made
            // MCQ ~67% â€” the exact inverse of the intended blend.)
            combinedScore = (mcqScore * 1 + aiAvgScore * 2) / 3;
        }

        // Internal 1â€“10 â†’ platform band [4,9]: internal 1 anchors to the 4.0 floor,
        // internal 10 to 9.0. (Previously `combined âˆ’ 1` anchored 1 â†’ band 0.)
        const band = internalToBand(combinedScore);

        const aiFeedback = aiFeedbacks.length > 0 ? {
            rationale:        aiFeedbacks.map(f => f.rationale).join(' | '),
            key_observations: aiFeedbacks.flatMap(f => f.key_observations),
        } : undefined;

        sectionScores.push({ skill: cfg.skill, sub_skill: cfg.sub_skill, band, correct, total: mcqQs.length, ai_question_count: aiQs.length, ai_graded: aiQs.length > 0, ai_feedback: aiFeedback });
    }

    // â”€â”€ 4. Pre-fetch competency matrix (for delta display in HTTP response) â”€â”€â”€â”€
    const uniqueSkills   = [...new Set(sectionScores.map(s => s.skill))];
    const competencyPre  = await prisma.studentCompetencyMatrix.findMany({
        where:  { student_id: studentId, skill: { in: uniqueSkills as any } },
        select: { skill: true, band_score: true, sub_scores: true },
    });
    const previousBands = new Map<string, number | null>();
    for (const s of sectionScores) {
        const row        = competencyPre.find(c => String(c.skill) === s.skill);
        const subScoreKey = SUB_SCORE_KEY_MAP[s.sub_skill];
        if (s.sub_skill === 'READING' || s.sub_skill === 'LISTENING') {
            previousBands.set(s.sub_skill, row?.band_score ? parseFloat(String(row.band_score)) : null);
        } else if (subScoreKey && row?.sub_scores) {
            const ss = row.sub_scores as Record<string, number>;
            previousBands.set(s.sub_skill, ss[subScoreKey] ?? null);
        } else {
            previousBands.set(s.sub_skill, null);
        }
    }

    // â”€â”€ 5. Momentum calculation â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    // Only need the latest + best band for the sub-skills THIS session covers, not
    // every sub-skill across the student's whole history — unnest `scores` and filter
    // inside Postgres instead of pulling every past session's full JSON into Node and
    // looping (that scan grows unbounded with a student's tenure; IA repeats every 3
    // days indefinitely, so a 1-year student had ~120 rows to re-scan on every submit).
    const subSkillsThisSession = [...new Set(sectionScores.map(s => s.sub_skill))];
    const [bandRows, priorCompletedCount] = await Promise.all([
        prisma.$queryRaw<{ sub_skill: string; last_band: number; best_band: number }[]>`
            SELECT DISTINCT ON (sub_skill)
                   sub_skill,
                   band                                     AS last_band,
                   MAX(band) OVER (PARTITION BY sub_skill)  AS best_band
            FROM (
                SELECT elem->>'sub_skill'     AS sub_skill,
                       (elem->>'band')::float AS band,
                       created_at
                FROM   "ia_sessions", jsonb_array_elements(scores) AS elem
                WHERE  student_id = ${studentId}::uuid
                  AND  status = 'COMPLETED'
                  AND  elem->>'sub_skill' = ANY(${subSkillsThisSession})
            ) unnested
            ORDER BY sub_skill, created_at DESC
        `,
        // isFirstIA needs "has this student completed ANY IA before", not scoped to
        // this session's sub-skills — a plain count is cheap (index-only, no JSON scan).
        prisma.iASession.count({ where: { student_id: studentId, status: 'COMPLETED' as any } }),
    ]);

    const lastBands = new Map<string, number>();   // most recent band per sub-skill
    const allTimeBests = new Map<string, number>(); // best band ever per sub-skill
    for (const row of bandRows) {
        lastBands.set(row.sub_skill, row.last_band);
        allTimeBests.set(row.sub_skill, row.best_band);
    }

    const momentumBreakdown: { reason: string; points: number }[] = [{ reason: 'Participation', points: 100 }];
    let momentumAwarded = 100;
    for (const s of sectionScores) {
        const label      = SUB_SKILL_LABEL[s.sub_skill] ?? s.sub_skill;
        const lastBand   = lastBands.get(s.sub_skill) ?? null;
        // Baseline at the 4.0 floor â€” with ?? 0 a student's first-ever band (always â‰¥4)
        // would trivially "beat" 0 and fire the personal-best bonus every time.
        const allTimeBest = allTimeBests.get(s.sub_skill) ?? BAND_MIN;
        if (lastBand !== null && s.band > lastBand) {
            momentumAwarded += 25;
            momentumBreakdown.push({ reason: `Improved â€” ${label}`, points: 25 });
        }
        if (s.band > allTimeBest) {
            momentumAwarded += 50;
            momentumBreakdown.push({ reason: `Personal Best â€” ${label}`, points: 50 });
        }
    }

    // â”€â”€ 6. DB transaction â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    const updatedMomentum = await prisma.$transaction(async (tx) => {
        // Atomic idempotency guard â€” if a concurrent call already marked this session
        // COMPLETED, updateMany returns count=0 and we throw to roll back every side effect
        // (assessment history rows, matrix updates, momentum increment) completely.
        const markResult = await tx.iASession.updateMany({
            where: { id: sessionId, status: { notIn: ['COMPLETED', 'MISSED'] as any } },
            data:  { status: 'COMPLETED' as any, scores: sectionScores as any, momentum_awarded: momentumAwarded, time_submitted_at: new Date() },
        });
        if (markResult.count === 0) throw new AlreadyCompletedError();

        for (const s of sectionScores) {
            const subScoreKey = SUB_SCORE_KEY_MAP[s.sub_skill] ?? null;

            await tx.assessmentHistory.create({
                data: {
                    student_id: studentId,
                    skill:      s.skill as any,
                    mode:       'INTERNAL_ASSESSMENT' as any,
                    band_score: s.band,
                    sub_scores: subScoreKey ? { [subScoreKey]: s.band } : {} as any,
                    ...provenance(),
                },
            });

            const existing         = await tx.studentCompetencyMatrix.findUnique({
                where:  { student_id_skill: { student_id: studentId, skill: s.skill as any } },
                select: { sub_scores: true, band_score: true },
            });
            const currentSubScores = (existing?.sub_scores as Record<string, any>) ?? {};
            let   updatedSubScores = { ...currentSubScores };

            if (subScoreKey) {
                const oldScore = currentSubScores[subScoreKey];
                updatedSubScores[subScoreKey] = applySmoothing(
                    typeof oldScore === 'number' && !isNaN(oldScore) ? oldScore : null,
                    s.band
                );
            }

            let newSkillBand: number;
            if (s.skill === 'READING' || s.skill === 'LISTENING') {
                const existingSkillBand = existing?.band_score ? parseFloat(String(existing.band_score)) : null;
                newSkillBand = applySmoothing(existingSkillBand, s.band);
            } else {
                const keys = s.skill === 'WRITING'
                    ? ['grammarScore', 'vocabularyScore', 'coherenceScore', 'taskResponseScore']
                    : ['grammarScore', 'vocabularyScore', 'fluencyScore', 'pronunciationScore'];
                const known = keys.map(k => updatedSubScores[k]).filter((v): v is number => typeof v === 'number' && !isNaN(v));
                newSkillBand = known.length > 0 ? Math.round((known.reduce((a, b) => a + b, 0) / known.length) * 2) / 2 : s.band;
            }
            newSkillBand = toBand(newSkillBand);

            await tx.studentCompetencyMatrix.upsert({
                where:  { student_id_skill: { student_id: studentId, skill: s.skill as any } },
                update: { band_score: newSkillBand, sub_scores: updatedSubScores as any, assessments_count: { increment: 1 }, last_updated: new Date() },
                create: { student_id: studentId, skill: s.skill as any, band_score: newSkillBand, sub_scores: updatedSubScores as any, assessments_count: 1 },
            });
        }

        const updated = await tx.instituteStudent.update({
            where:  { id: studentId },
            data:   { momentum_score: { increment: momentumAwarded } },
            select: { momentum_score: true },
        });
        return updated.momentum_score;
    });

    return {
        sectionScores,
        previousBands,
        momentumAwarded,
        momentumBreakdown,
        updatedMomentum,
        isFirstIA: priorCompletedCount === 0,
    };
}
