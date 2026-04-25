/**
 * Daily Competency Score (DCS)
 *
 * DCS = (total correct answers today / total questions today) × 100
 *
 * Ranges 0–100. Returns 0 if no drill sessions exist for today.
 *
 * Used in:
 *   - getDailyDrillState  → returned to frontend for display
 *   - authorizeExtraDrill → gating the 4th session (must be ≥ 75%)
 *   - IA eligibility check (future) → must be ≥ 40% average
 */

import prisma from './prisma';
import { todayStartIST } from './timezone';

export async function computeDailyDCS(studentId: string): Promise<number> {
    const sessions = await prisma.drillSession.findMany({
        where: {
            student_id: studentId,
            created_at: { gte: todayStartIST() }
        },
        select: { correct_answers: true, total_questions: true }
    });

    if (sessions.length === 0) return 0;

    const totalCorrect   = sessions.reduce((sum, s) => sum + s.correct_answers, 0);
    const totalQuestions = sessions.reduce((sum, s) => sum + s.total_questions, 0);

    return totalQuestions > 0 ? Math.round((totalCorrect / totalQuestions) * 100) : 0;
}
