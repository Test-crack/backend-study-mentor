import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

/**
 * GET /api/ielts-reading/topics
 * Fetch all IELTS reading practice topics with optional band filtering and pagination
 * Returns only necessary fields for the list view
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

        // Fetch topics with field selection for performance
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
