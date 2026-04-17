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

        // Fetch DrillSessions in the last 24 hours
        const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);
        const practicedSessions = await prisma.drillSession.findMany({
            where: {
                student_id: student.id,
                created_at: { gt: cutoff }
            }
        });

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

        // 24 Hour check (Case-insensitive)
        const recommended_drills = interleaved.filter(item => 
            !practicedSet.has(`${item.skill.toUpperCase()}-${item.sub_skill.toUpperCase().replace(/\s+/g, '_')}`)
        );

        return res.json({
            success: true,
            recommended_drills,
            message: recommended_drills.length > 0 ? "Drills available for today." : "You have completed all 10 recommended drills for today!"
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

        const countNum = parseInt(count as string) || 1; // Default to 1

        // Enforce max limit to prevent abuse
        if (countNum < 1 || countNum > 50) {
            return res.status(400).json({ success: false, error: 'Count must be between 1 and 50.' });
        }

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

        const { skill, subskill, prompts_completed, momentum_earned } = req.body;

        if (!skill || !subskill || prompts_completed === undefined || momentum_earned === undefined) {
            return res.status(400).json({ success: false, error: 'Missing required fields in session payload.' });
        }

        const session = await prisma.drillSession.create({
            data: {
                student_id: student.id,
                skill: skill,
                sub_skill: subskill,
                prompts_completed: parseInt(prompts_completed),
                momentum_earned: parseInt(momentum_earned)
                // drill_type and ai_feedback_json are optional/null now!
            }
        });

        return res.json({ success: true, data: session });

    } catch (error) {
        console.error('[DrillController] saveDrillSession error:', error);
        return res.status(500).json({ success: false, error: 'Internal server error while saving drill session.' });
    }
}
