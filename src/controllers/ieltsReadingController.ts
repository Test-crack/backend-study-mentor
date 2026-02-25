import { Request, Response } from 'express';
import prisma from '../lib/prisma'; // Use shared client

/**
 * GET /api/ielts-reading/topics
 * Fetch all IELTS reading practice topics with optional band filtering and pagination
 */
export const getTopics = async (req: Request, res: Response) => {
    try {
        const { band, page = '1', limit = '10' } = req.query;

        const pageNum = parseInt(page as string) || 1;
        const limitNum = parseInt(limit as string) || 10;
        const skip = (pageNum - 1) * limitNum;

        const where: any = {};
        if (band && typeof band === 'string' && band !== 'All') {
            where.band = {
                contains: band,
                mode: 'insensitive'
            };
        }

        const [topics, total] = await Promise.all([
            prisma.ieltsReadingPractice.findMany({
                where,
                select: {
                    id: true,
                    title: true,
                    type: true,
                    words: true,
                    phrases: true,
                    band: true,
                    createdAt: true
                },
                orderBy: {
                    createdAt: 'asc'
                },
                skip,
                take: limitNum
            }),
            prisma.ieltsReadingPractice.count({ where })
        ]);

        res.json({
            success: true,
            data: topics,
            pagination: {
                total,
                page: pageNum,
                limit: limitNum,
                totalPages: Math.ceil(total / limitNum)
            }
        });
    } catch (error) {
        console.error('Error fetching IELTS reading topics:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch IELTS reading topics'
        });
    }
};

/**
 * GET /api/ielts-reading/topics/:id
 * Fetch full IELTS reading practice topic details by ID
 */
export const getTopicById = async (req: Request, res: Response) => {
    try {
        const { id } = req.params;

        const topic = await prisma.ieltsReadingPractice.findUnique({
            where: { id }
        });

        if (!topic) {
            return res.status(404).json({
                success: false,
                error: 'Topic not found'
            });
        }

        res.json({
            success: true,
            data: topic
        });
    } catch (error) {
        console.error('Error fetching IELTS reading topic by ID:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch topic details'
        });
    }
};

/**
 * POST /api/ielts-reading/save-assessment
 * Save and analyze reading assessment results
 */
export const saveAssessment = async (req: Request, res: Response) => {
    try {
        const { topicId, userId, band, pass1, pass2 } = req.body;

        // Enhanced validation
        if (!topicId || !userId || !pass1 || !pass2) {
            return res.status(400).json({
                success: false,
                error: 'Missing required data: topicId, userId, pass1, or pass2'
            });
        }

        // Use req.appUserId if it was passed from middleware, fallback to body
        // This makes the transition to middleware smoother
        const finalUserId = (req as any).appUserId || userId;

        // 1. Calculate Weighted WPM (40/60) with safety fallbacks
        const wpm1 = pass1.wpm || 0;
        const wpm2 = pass2.wpm || 0;
        const weightedWpm = (wpm1 * 0.4) + (wpm2 * 0.6);

        // 2. Identify Most Frequent Fillers (Robust Flow)
        const fillerCounts: { [word: string]: number } = {};
        const combineFillers = (counts: { [word: string]: number }) => {
            if (!counts) return;
            Object.entries(counts).forEach(([word, count]) => {
                fillerCounts[word] = (fillerCounts[word] || 0) + count;
            });
        };
        combineFillers(pass1.fillerCounts);
        combineFillers(pass2.fillerCounts);

        const frequentFillers = Object.entries(fillerCounts)
            .sort(([, a], [, b]) => b - a)
            .slice(0, 3)
            .map(([word, count]) => ({ word, count }));

        // 3. Fluency Score Calculation (Robust Logic)
        let fluencyScore = 100;
        const totalFillers = Object.values(fillerCounts).reduce((a, b) => a + b, 0);
        const totalPauses = (pass1.pauses || 0) + (pass2.pauses || 0);

        fluencyScore -= Math.min(40, totalFillers * 5);
        fluencyScore -= Math.min(40, totalPauses * 5);

        // Final score adjustments for WPM speed (Natural pace ~130-160)
        if (weightedWpm < 100) fluencyScore -= 10;
        if (weightedWpm > 180) fluencyScore -= 5;

        // 4. Persistence
        const assessment = await prisma.ieltsReadingAssessment.create({
            data: {
                userId: finalUserId,
                topicId,
                band: band || "General",
                weightedWpm,
                fluencyScore: Math.max(0, fluencyScore),
                keywordsHit: pass2.coverage || 0,
                totalKeywords: pass2.totalKeywords || 0,
                pass1Data: pass1,
                pass2Data: pass2
            }
        });

        res.json({
            success: true,
            data: {
                id: assessment.id,
                weightedWpm: weightedWpm.toFixed(1),
                fluencyScore: assessment.fluencyScore,
                frequentFillers,
                keywordsHit: assessment.keywordsHit,
                totalKeywords: assessment.totalKeywords
            }
        });
    } catch (error) {
        console.error('Error saving IELTS reading assessment:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to save assessment results. Ensure IDs are valid UUIDs.'
        });
    }
};
