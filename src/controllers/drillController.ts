import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import prisma from '../lib/prisma';

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

        const MAX_DAILY_SESSIONS = 5;

        // Use calendar-day boundary so sessions reset at midnight, not on a rolling 24hr window
        const todayStart = new Date();
        todayStart.setHours(0, 0, 0, 0);

        const practicedSessions = await prisma.drillSession.findMany({
            where: {
                student_id: student.id,
                created_at: { gte: todayStart }
            }
        });

        if (practicedSessions.length >= MAX_DAILY_SESSIONS) {
            return res.json({
                success: true,
                recommended_drills: [],
                daily_sessions_completed: practicedSessions.length,
                daily_limit: MAX_DAILY_SESSIONS,
                message: "You've completed your maximum drill sessions for today. Great work!"
            });
        }

        // Store as ALL UPPERCASE for case-insensitive matching
        const practicedSet = new Set(practicedSessions.map(s => `${s.skill.toUpperCase()}-${s.sub_skill.toUpperCase()}`));


        const items: DrillItem[] = [];

        for (const matrix of matrices) {
            const skillBandScore = Number(matrix.band_score || 0);
            const subScores = (matrix.sub_scores as Record<string, any>) || {};

            if (matrix.skill === 'WRITING') {
                const subs = ['grammar', 'coherence', 'vocabulary', 'taskResponse'];
                subs.forEach(s => items.push({
                    skill: 'Writing',
                    sub_skill: s,
                    skill_band_score: skillBandScore,
                    sub_skill_score: Number(subScores[s] ?? skillBandScore)
                }));
            } else if (matrix.skill === 'SPEAKING') {
                const subs = ['fluency', 'grammar', 'vocabulary', 'pronunciation'];
                subs.forEach(s => items.push({
                    skill: 'Speaking',
                    sub_skill: s,
                    skill_band_score: skillBandScore,
                    sub_skill_score: Number(subScores[s] ?? skillBandScore)
                }));
            } else if (matrix.skill === 'READING') {
                items.push({
                    skill: 'Reading',
                    sub_skill: 'Reading',
                    skill_band_score: skillBandScore,
                    sub_skill_score: skillBandScore
                });
            } else if (matrix.skill === 'LISTENING') {
                items.push({
                    skill: 'Listening',
                    sub_skill: 'Listening',
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

        // Filter out sub-skills already practiced today (case-insensitive)
        const recommended_drills = interleaved.filter(item =>
            !practicedSet.has(`${item.skill.toUpperCase()}-${item.sub_skill.toUpperCase().replace(/\s+/g, '_')}`)
        );

        const sessionsLeft = MAX_DAILY_SESSIONS - practicedSessions.length;

        return res.json({
            success: true,
            recommended_drills,
            daily_sessions_completed: practicedSessions.length,
            daily_limit: MAX_DAILY_SESSIONS,
            sessions_remaining: sessionsLeft,
            message: recommended_drills.length > 0
                ? `${sessionsLeft} drill session${sessionsLeft !== 1 ? 's' : ''} remaining today.`
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
                data:  { momentum_score: { increment: momentum_earned } }
            })
        ]);

        return res.json({
            success: true,
            data: session,
            momentum_earned,
            momentum_score: updatedStudent.momentum_score
        });

    } catch (error) {
        console.error('[DrillController] saveDrillSession error:', error);
        return res.status(500).json({ success: false, error: 'Internal server error while saving drill session.' });
    }
}
