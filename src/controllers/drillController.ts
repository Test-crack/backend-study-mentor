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
        const practicedSessions = await (prisma as any).drillSession.findMany({
            where: {
                student_id: student.id,
                created_at: { gt: cutoff }
            }
        });

        const practicedSet = new Set(practicedSessions.map((s: any) => `${s.skill}-${s.sub_skill}`));


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

        // 24 Hour check
        const recommended_drills = interleaved.filter(item => !practicedSet.has(`${item.skill}-${item.sub_skill}`));

        return res.json({
            recommended_drills,
            message: recommended_drills.length > 0 ? "Drills available for today." : "You have completed all 10 recommended drills for today!"
        });

    } catch (error) {
        console.error('[DrillController] getNextActionDrill error:', error);
        return res.status(500).json({ success: false, error: 'Internal server error while fetching next action drill.' });
    }
}
