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

        const history = await prisma.ieltsReadingAssessment.findMany({
            where: { userId: appUserId },
            orderBy: { createdAt: 'desc' },
            include: {
                Topic: {
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
                topicTitle: (item as any).Topic?.title || item.topicId,
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
