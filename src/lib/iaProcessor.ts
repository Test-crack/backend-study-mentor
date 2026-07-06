/**
 * IA Grading Core — shared by POST /api/ia/submit (HTTP path) and the
 * auto-submit sweep in iaMissDetector (for IN_PROGRESS sessions that expired
 * with answers saved but never explicitly submitted).
 *
 * Call `processIASession(sessionId, studentId)` to grade, update the competency
 * matrix, award momentum, and mark the session COMPLETED in one transaction.
 */

import prisma from './prisma';
import { gradeIAWritingPrompt, gradeIASpeakingPrompt } from './iaGrading';

// Thrown when processIASession is called on an already-COMPLETED session.
// Callers must catch this and return the stored result instead of erroring.
export class AlreadyCompletedError extends Error {
    constructor() { super('Session already graded'); this.name = 'AlreadyCompletedError'; }
}

/**
 * Single implementation of the competency-matrix smoothing rule:
 *   smoothed = 0.4 × oldBand + 0.6 × newBand, deviation capped at ±2, rounded to 0.5.
 *
 * Used for W/S sub-skill scores, R/L skill bands, and the response preview in iaController.
 * Having one copy means the ±2 cap and weights are always in sync.
 */
export function applySmoothing(oldBand: number | null, newBand: number): number {
    if (oldBand === null || isNaN(oldBand)) {
        return Math.min(9, Math.max(0, Math.round(newBand * 2) / 2));
    }
    let w = 0.4 * oldBand + 0.6 * newBand;
    const dev = w - oldBand;
    if (dev >  2) w = oldBand + 2;
    if (dev < -2) w = oldBand - 2;
    return Math.min(9, Math.max(0, Math.round(w * 2) / 2));
}

// ── Shared types (also imported by iaController for the HTTP response) ─────────

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

// ── Internal constants ────────────────────────────────────────────────────────

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

// ── Public result type ────────────────────────────────────────────────────────

export interface IAProcessResult {
    sectionScores:       SectionScore[];
    previousBands:       Map<string, number | null>;   // for delta display in HTTP response
    momentumAwarded:     number;
    momentumBreakdown:   { reason: string; points: number }[];
    updatedMomentum:     number;
    isFirstIA:           boolean;
}

// ── Core processor ────────────────────────────────────────────────────────────

/**
 * Grades a session, writes results to DB (COMPLETED), and returns scoring data.
 * The session must exist and belong to the given student.
 * Caller is responsible for validating status before calling (don't call on MISSED/COMPLETED).
 */
export async function processIASession(
    sessionId: string,
    studentId: string,
): Promise<IAProcessResult> {
    const session = await prisma.iASession.findUniqueOrThrow({ where: { id: sessionId } });
    // Fast-path: if already COMPLETED, don't re-run AI grading or momentum writes.
    if (session.status === 'COMPLETED') throw new AlreadyCompletedError();

    // ── 1. Load questions + strip __meta from saved answers ───────────────────
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

    // ── 2. Launch AI grading jobs in parallel ─────────────────────────────────
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

    // ── 3. Score each sub-skill (MCQ + AI weighted) ───────────────────────────
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
        // Map MCQ to the same 1–10 scale Gemini uses: 0 correct → 1 (IELTS 0), all correct → 10 (IELTS 9).
        // Using N/T * 10 would put 0 correct at score 0, out of the 1–10 scale and mismatched against
        // AI sub-scores when combined in a weighted average.  Math.max(1, N/T*10) fixes the floor but
        // collapses 0% and any score below 10% to score 1 — a different form of inflation.
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
            // Spec: AI grade weighted 2×, MCQ grade weighted 1× — weight the two
            // aggregate grades, NOT the question counts. (Previously used
            // mcqQs.length vs aiQs.length*2, which with 8 MCQ + 2 prompts made
            // MCQ ~67% — the exact inverse of the intended blend.)
            combinedScore = (mcqScore * 1 + aiAvgScore * 2) / 3;
        }

        const band = Math.min(9.0, Math.max(0.0, Math.round((combinedScore - 1) * 2) / 2));

        const aiFeedback = aiFeedbacks.length > 0 ? {
            rationale:        aiFeedbacks.map(f => f.rationale).join(' | '),
            key_observations: aiFeedbacks.flatMap(f => f.key_observations),
        } : undefined;

        sectionScores.push({ skill: cfg.skill, sub_skill: cfg.sub_skill, band, correct, total: mcqQs.length, ai_question_count: aiQs.length, ai_graded: aiQs.length > 0, ai_feedback: aiFeedback });
    }

    // ── 4. Pre-fetch competency matrix (for delta display in HTTP response) ────
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

    // ── 5. Momentum calculation ────────────────────────────────────────────────
    // Ordered newest→oldest so we can take the most recent band PER SUB-SKILL.
    // (A single "last session" is not enough: the 14-day exclusion guarantees
    // today's sub-skills were not in the immediately preceding IA, so an
    // improvement bonus keyed on that one session would never fire.)
    const allPastSessions = await prisma.iASession.findMany({
        where:   { student_id: studentId, status: 'COMPLETED' as any },
        orderBy: { created_at: 'desc' },
        select:  { scores: true },
    });

    const lastBands = new Map<string, number>();   // most recent band per sub-skill
    const allTimeBests = new Map<string, number>(); // best band ever per sub-skill
    for (const ps of allPastSessions) {
        for (const s of (ps.scores ?? []) as SectionScore[]) {
            // sessions are newest-first, so the first band seen for a sub-skill is the latest
            if (!lastBands.has(s.sub_skill)) lastBands.set(s.sub_skill, s.band);
            const prev = allTimeBests.get(s.sub_skill) ?? 0;
            if (s.band > prev) allTimeBests.set(s.sub_skill, s.band);
        }
    }

    const momentumBreakdown: { reason: string; points: number }[] = [{ reason: 'Participation', points: 100 }];
    let momentumAwarded = 100;
    for (const s of sectionScores) {
        const label      = SUB_SKILL_LABEL[s.sub_skill] ?? s.sub_skill;
        const lastBand   = lastBands.get(s.sub_skill) ?? null;
        const allTimeBest = allTimeBests.get(s.sub_skill) ?? 0;
        if (lastBand !== null && s.band > lastBand) {
            momentumAwarded += 25;
            momentumBreakdown.push({ reason: `Improved — ${label}`, points: 25 });
        }
        if (s.band > allTimeBest) {
            momentumAwarded += 50;
            momentumBreakdown.push({ reason: `Personal Best — ${label}`, points: 50 });
        }
    }

    // ── 6. DB transaction ─────────────────────────────────────────────────────
    const updatedMomentum = await prisma.$transaction(async (tx) => {
        // Atomic idempotency guard — if a concurrent call already marked this session
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
            newSkillBand = Math.min(9, Math.max(0, newSkillBand));

            await tx.studentCompetencyMatrix.upsert({
                where:  { student_id_skill: { student_id: studentId, skill: s.skill as any } },
                update: { band_score: newSkillBand, sub_scores: updatedSubScores as any, assessments_count: { increment: 1 }, last_updated: new Date() },
                create: { student_id: studentId, skill: s.skill as any, band_score: newSkillBand, sub_scores: updatedSubScores as any, assessments_count: 1 },
            });
        }

        const updated = await tx.institute_students.update({
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
        isFirstIA: allPastSessions.length === 0,
    };
}
