import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import prisma from '../lib/prisma';

/**
 * Get the authenticated student's speaking practice history
 * GET /api/student/speaking-history
 */
export async function getSpeakingHistory(req: AuthRequest, res: Response) {
    try {
        const appUserId = (req as any).appUserId as string;

        if (!appUserId) {
            return res.status(401).json({ success: false, error: 'Unauthorized user.' });
        }

        const history = await prisma.ieltsSpeakingAssessment.findMany({
            where: { userId: appUserId },
            orderBy: { createdAt: 'desc' },
            include: {
                IeltsSpeakingPractice: {
                    select: {
                        title: true
                    }
                }
            }
        });

        // Format and return the array, flattening nested objects smoothly
        const formattedData = history.map(item => {
            // Reconstruct frequent fillers from pass1Data & pass2Data
            const pass1Counts = (item.pass1Data as any)?.fillerCounts || {};
            const pass2Counts = (item.pass2Data as any)?.fillerCounts || {};
            const combined: Record<string, number> = { ...pass1Counts };
            for (const [word, count] of Object.entries(pass2Counts)) {
                combined[word] = (combined[word] || 0) + (count as number);
            }
            const frequentFillers = Object.entries(combined)
                .sort(([, a], [, b]) => b - a)
                .slice(0, 3)
                .map(([word, count]) => ({ word, count }));

            return {
                id: item.id,
                topicId: item.topicId,
                topicTitle: item.IeltsSpeakingPractice?.title || item.topicId,
                bandLevel: item.band || 'All',
                fluencyScore: item.fluencyScore,
                weightedWpm: item.weightedWpm,
                keywordsHit: item.keywordsHit,
                totalKeywords: item.totalKeywords,
                pass1Data: item.pass1Data,
                pass2Data: item.pass2Data,
                frequentFillers: frequentFillers,
                createdAt: item.createdAt,
            };
        });

        res.json({
            success: true,
            data: formattedData
        });

    } catch (error) {
        console.error('[StudentController] getSpeakingHistory error:', error);
        res.status(500).json({ success: false, error: 'Internal server error while fetching history.' });
    }
}

/**
 * Get the authenticated student's competency matrix (latest band scores)
 * GET /api/student/competency-scores
 */
export async function getCompetencyScores(req: AuthRequest, res: Response) {
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

        const matrix = await prisma.studentCompetencyMatrix.findMany({
            where: { student_id: student.id }
        });

        return res.json({
            success: true,
            data: matrix,
            target_band: student.target_band,
            momentum_score: student.momentum_score,
            daily_streak: student.daily_streak,
        });

    } catch (error) {
        console.error('[StudentController] getCompetencyScores error:', error);
        return res.status(500).json({ success: false, error: 'Internal server error while fetching competency scores.' });
    }
}
