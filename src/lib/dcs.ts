/**
 * Competency Score helpers
 *
 * computeDailyDCS   — today's sessions only
 *                     Used for: extra-drill gate (must be ≥ 75%)
 *
 * computeAverageDCS — all-time sessions
 *                     Used for: IA eligibility gate (must be ≥ 40%)
 *
 * Both return an integer 0–100.
 */

import prisma from './prisma';
import { todayStartIST } from './timezone';

function scoreFromSessions(sessions: { correct_answers: number; total_questions: number }[]): number {
    if (sessions.length === 0) return 0;
    const totalCorrect   = sessions.reduce((sum, s) => sum + s.correct_answers, 0);
    const totalQuestions = sessions.reduce((sum, s) => sum + s.total_questions, 0);
    return totalQuestions > 0 ? Math.round((totalCorrect / totalQuestions) * 100) : 0;
}

export async function computeDailyDCS(studentId: string): Promise<number> {
    const sessions = await prisma.drillSession.findMany({
        where: { student_id: studentId, created_at: { gte: todayStartIST() } },
        select: { correct_answers: true, total_questions: true }
    });
    return scoreFromSessions(sessions);
}

/**
 * Average DCS across all sub-skills practised.
 *
 * Steps:
 *   1. Group all drill sessions by sub_skill.
 *   2. Compute a DCS (correct / total × 100) for each sub-skill independently.
 *   3. Return the mean of those per-sub-skill DCS values, rounded to the nearest integer.
 *
 * This matches the v3 spec: "Average DCS ≥ 40% across priority sub-skills."
 * Grouping first ensures a sub-skill with many sessions doesn't drown out one
 * with few sessions — every practised sub-skill counts equally in the final average.
 */
export async function computeAverageDCS(studentId: string): Promise<number> {
    const sessions = await prisma.drillSession.findMany({
        where:  { student_id: studentId },
        select: { sub_skill: true, correct_answers: true, total_questions: true }
    });

    if (sessions.length === 0) return 0;

    // Group by sub_skill
    const bySubSkill = new Map<string, { correct: number; total: number }>();
    for (const s of sessions) {
        const key = s.sub_skill.toUpperCase();
        const cur = bySubSkill.get(key) ?? { correct: 0, total: 0 };
        bySubSkill.set(key, {
            correct: cur.correct + s.correct_answers,
            total:   cur.total   + s.total_questions
        });
    }

    // DCS per sub-skill, then average
    const subSkillDCSValues = Array.from(bySubSkill.values())
        .filter(v => v.total > 0)
        .map(v => (v.correct / v.total) * 100);

    if (subSkillDCSValues.length === 0) return 0;

    const avg = subSkillDCSValues.reduce((sum, v) => sum + v, 0) / subSkillDCSValues.length;
    return Math.round(avg);
}
