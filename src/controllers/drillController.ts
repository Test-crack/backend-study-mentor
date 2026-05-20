import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import prisma from '../lib/prisma';
import { todayStartIST, currentISTDate, yesterdayISTDate } from '../lib/timezone';

interface DrillItem {
    skill: string;
    sub_skill: string;
    skill_band_score: number;
    sub_skill_score: number;
}

export async function getNextActionDrill(req: AuthRequest, res: Response) {
    try {
        const appUserId = (req as any).appUserId as string;

        if (!appUserId) {
            return res.status(401).json({ success: false, error: 'Unauthorized user.' });
        }

        const student = await prisma.institute_students.findUnique({
            where: { user_id: appUserId }
        });

        if (!student) {
            return res.status(404).json({ success: false, error: 'Student record not found.' });
        }

        // Fetch competency matrix for student
        const matrices = await prisma.studentCompetencyMatrix.findMany({
            where: { student_id: student.id }
        });

        const practicedSessions = await prisma.drillSession.findMany({
            where: {
                student_id: student.id,
                created_at: { gte: todayStartIST() }
            }
        });

        // DB enum values are already uppercase — build keys directly
        const practicedSet = new Set(practicedSessions.map(s => `${s.skill}-${s.sub_skill}`));


        const items: DrillItem[] = [];

        for (const matrix of matrices) {
            const skillBandScore = Number(matrix.band_score || 0);
            const subScores = (matrix.sub_scores as Record<string, any>) || {};

            // Use DB enum values for sub_skill (uppercase) so the practicedSet filter
            // matches correctly. Use the *Score-suffixed keys from sub_scores JSONB
            // (grammarScore, taskResponseScore, etc.) to match what IA/diagnostic stores.
            if (matrix.skill === 'WRITING') {
                const subs: { sub: string; scoreKey: string }[] = [
                    { sub: 'GRAMMAR',       scoreKey: 'grammarScore' },
                    { sub: 'COHERENCE',     scoreKey: 'coherenceScore' },
                    { sub: 'VOCABULARY',    scoreKey: 'vocabularyScore' },
                    { sub: 'TASK_RESPONSE', scoreKey: 'taskResponseScore' },
                ];
                subs.forEach(({ sub, scoreKey }) => items.push({
                    skill: 'WRITING',
                    sub_skill: sub,
                    skill_band_score: skillBandScore,
                    sub_skill_score: Number(subScores[scoreKey] ?? skillBandScore)
                }));
            } else if (matrix.skill === 'SPEAKING') {
                const subs: { sub: string; scoreKey: string }[] = [
                    { sub: 'FLUENCY',       scoreKey: 'fluencyScore' },
                    { sub: 'GRAMMAR',       scoreKey: 'grammarScore' },
                    { sub: 'VOCABULARY',    scoreKey: 'vocabularyScore' },
                    { sub: 'PRONUNCIATION', scoreKey: 'pronunciationScore' },
                ];
                subs.forEach(({ sub, scoreKey }) => items.push({
                    skill: 'SPEAKING',
                    sub_skill: sub,
                    skill_band_score: skillBandScore,
                    sub_skill_score: Number(subScores[scoreKey] ?? skillBandScore)
                }));
            } else if (matrix.skill === 'READING') {
                items.push({
                    skill: 'READING',
                    sub_skill: 'READING',
                    skill_band_score: skillBandScore,
                    sub_skill_score: skillBandScore
                });
            } else if (matrix.skill === 'LISTENING') {
                items.push({
                    skill: 'LISTENING',
                    sub_skill: 'LISTENING',
                    skill_band_score: skillBandScore,
                    sub_skill_score: skillBandScore
                });
            }
        }

        // 1. Group items by skill
        const bySkill: Record<string, DrillItem[]> = {};
        for (const item of items) {
            if (!bySkill[item.skill]) bySkill[item.skill] = [];
            bySkill[item.skill].push(item);
        }

        // 2. Sort items inside each skill perfectly by score
        for (const skill in bySkill) {
            bySkill[skill].sort((a, b) => {
                if (a.sub_skill_score !== b.sub_skill_score) return a.sub_skill_score - b.sub_skill_score;
                return a.skill_band_score - b.skill_band_score;
            });
        }

        // 3. Prioritize skills: rank the skill queues by the severity of their lowest score
        const skillQueues = Object.values(bySkill).sort((a, b) => {
            if (a[0].sub_skill_score !== b[0].sub_skill_score) return a[0].sub_skill_score - b[0].sub_skill_score;
            if (a[0].skill_band_score !== b[0].skill_band_score) return a[0].skill_band_score - b[0].skill_band_score;
            return a[0].skill.localeCompare(b[0].skill); // deterministic fallback
        });

        // 4. Interleave (Round Robin) to completely separate identical skills
        const interleaved: DrillItem[] = [];
        let hasMore = true;
        while (hasMore) {
            hasMore = false;
            for (const queue of skillQueues) {
                if (queue.length > 0) {
                    interleaved.push(queue.shift()!);
                    hasMore = true;
                }
            }
        }

        // Items now use DB enum values (uppercase) — keys match practicedSet directly
        const recommended_drills = interleaved.filter(item =>
            !practicedSet.has(`${item.skill}-${item.sub_skill}`)
        );

        return res.json({
            success: true,
            recommended_drills,
            daily_sessions_completed: practicedSessions.length,
            message: recommended_drills.length > 0
                ? "Here are your prioritised drills."
                : "You have completed all available sub-skills for today!"
        });

    } catch (error) {
        console.error('[DrillController] getNextActionDrill error:', error);
        return res.status(500).json({ success: false, error: 'Internal server error while fetching next action drill.' });
    }
}

/**
 * Fetch N random drill questions for a given skill, subskill, and level.
 * GET /api/drills/questions?skill=WRITING&subskill=grammar&level=INTERMEDIATE&count=5
 */
export async function getDrillQuestions(req: AuthRequest, res: Response) {
    try {
        const { skill, subskill, level, count } = req.query;

        if (!skill || !subskill || !level) {
            return res.status(400).json({ 
                success: false, 
                error: 'Missing required query parameters: skill, subskill, and level are required.' 
            });
        }

        const QUESTIONS_PER_SESSION = 5;
        const countNum = QUESTIONS_PER_SESSION;

        // Use Prisma's native $queryRaw for true randomness (ORDER BY RANDOM())
        // Postgres will automatically cast the template parameters to the appropriate Enum types
        const questions = await prisma.$queryRaw`
            SELECT id, skill, sub_skill, level, drill_type, prompt_text, options, correct_answer, explanation, is_active
            FROM drill_questions
            WHERE skill = ${skill}::"IeltsSkillType"
              AND sub_skill = ${subskill}::"IeltsSubSkillType"
              AND level = ${level}::"RecommendationLevel"
              AND is_active = true
            ORDER BY RANDOM()
            LIMIT ${countNum}
        `;

        return res.json({
            success: true,
            data: questions
        });

    } catch (error) {
        console.error('[DrillController] getDrillQuestions error:', error);
        return res.status(500).json({ success: false, error: 'Internal server error while fetching drill questions.' });
    }
}

/**
 * Save a completed Drill Session
 * POST /api/drills/session
 */
export async function saveDrillSession(req: AuthRequest, res: Response) {
    try {
        const appUserId = (req as any).appUserId as string;
        if (!appUserId) {
            return res.status(401).json({ success: false, error: 'Unauthorized user.' });
        }

        const student = await prisma.institute_students.findUnique({
            where: { user_id: appUserId }
        });

        if (!student) {
            return res.status(404).json({ success: false, error: 'Student record not found.' });
        }

        const { skill, subskill, prompts_completed, correct_answers, is_extra_session } = req.body;

        if (!skill || !subskill || prompts_completed === undefined || correct_answers === undefined) {
            return res.status(400).json({ success: false, error: 'Missing required fields: skill, subskill, prompts_completed, correct_answers.' });
        }

        const DRILL_BASE_PTS      = 15;
        const DRILL_PER_CORRECT   = 10;
        const correctCount        = Math.max(0, parseInt(correct_answers));
        const momentum_earned     = DRILL_BASE_PTS + correctCount * DRILL_PER_CORRECT;
        const extraSession        = is_extra_session === true || is_extra_session === 'true';

        // Consume one pre-authorized extra credit when the session is an extra drill.
        // This is idempotent: if credits = 0 (e.g., re-submit), no change.
        const consumeCredit = extraSession && student.extra_drill_credits > 0;

        const [session, updatedStudent] = await prisma.$transaction([
            prisma.drillSession.create({
                data: {
                    student_id:       student.id,
                    skill,
                    sub_skill:        subskill,
                    prompts_completed: parseInt(prompts_completed),
                    correct_answers:  correctCount,
                    total_questions:  5,
                    momentum_earned,
                    is_extra_session: extraSession
                }
            }),
            prisma.institute_students.update({
                where: { id: student.id },
                data:  {
                    momentum_score:     { increment: momentum_earned },
                    ...(consumeCredit ? { extra_drill_credits: { decrement: 1 } } : {})
                }
            })
        ]);

        // Streak: fires only when today's count crosses exactly 2 (the threshold).
        const drillCutoff = todayStartIST();
        const drillsToday = await prisma.drillSession.count({
            where: { student_id: student.id, created_at: { gte: drillCutoff } }
        });

        let newDailyStreak = updatedStudent.daily_streak;

        if (drillsToday === 2) {
            const todayIST     = currentISTDate();
            const yesterdayIST = yesterdayISTDate();

            const { daily_streak: prevStreak, last_streak_date: lastDate } =
                await prisma.institute_students.findUnique({
                    where: { id: student.id },
                    select: { daily_streak: true, last_streak_date: true }
                }) ?? { daily_streak: 0, last_streak_date: null };

            // last_streak_date is a DATE column — Prisma returns midnight UTC of that IST date.
            // It was yesterday (IST) if it falls within [yesterdayIST, todayIST).
            if (lastDate
                && lastDate.getTime() >= yesterdayIST.getTime()
                && lastDate.getTime() <  todayIST.getTime()) {
                newDailyStreak = prevStreak + 1;
            } else {
                newDailyStreak = 1;
            }

            await prisma.institute_students.update({
                where: { id: student.id },
                data: { daily_streak: newDailyStreak, last_streak_date: todayIST }
            });
        }

        return res.json({
            success: true,
            data: session,
            momentum_earned,
            momentum_score: updatedStudent.momentum_score,
            daily_streak: newDailyStreak,
        });

    } catch (error) {
        console.error('[DrillController] saveDrillSession error:', error);
        return res.status(500).json({ success: false, error: 'Internal server error while saving drill session.' });
    }
}

/**
 * POST /api/drills/apply-complete
 * Awards +30 momentum pts when the student completes the Apply Drill step.
 */
export async function completeApplyDrill(req: AuthRequest, res: Response) {
    try {
        const appUserId = (req as any).appUserId as string;
        if (!appUserId) return res.status(401).json({ success: false, error: 'Unauthorized.' });

        const student = await prisma.institute_students.findUnique({ where: { user_id: appUserId } });
        if (!student) return res.status(404).json({ success: false, error: 'Student not found.' });

        const APPLY_DRILL_BONUS = 30;
        const updated = await prisma.institute_students.update({
            where: { id: student.id },
            data: { momentum_score: { increment: APPLY_DRILL_BONUS } }
        });

        return res.json({
            success: true,
            momentum_earned: APPLY_DRILL_BONUS,
            momentum_score: updated.momentum_score
        });
    } catch (error) {
        console.error('[DrillController] completeApplyDrill error:', error);
        return res.status(500).json({ success: false, error: 'Internal server error.' });
    }
}
