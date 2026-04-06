import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import prisma from '../lib/prisma';
import { getStudentRecommendations } from '../services/recommendationService';

/**
 * Get personalized recommendations for the authenticated student.
 * GET /api/student/recommendations?page=1&limit=10
 */
export async function getRecommendations(req: AuthRequest, res: Response) {
    try {
        const appUserId = (req as any).appUserId as string;
        
        if (!appUserId) {
            return res.status(401).json({ success: false, error: 'Unauthorized user.' });
        }

        // Parse pagination params
        const page = parseInt(req.query.page as string) || 1;
        const limit = parseInt(req.query.limit as string) || 10;

        // Verify bounds
        if (page < 1 || limit < 1 || limit > 50) {
            return res.status(400).json({ success: false, error: 'Invalid pagination parameters. Limit max 50.' });
        }

        // Get student record mapped to this user ID
        const student = await prisma.institute_students.findUnique({
            where: { user_id: appUserId }
        });

        if (!student) {
             return res.status(404).json({ success: false, error: 'Student record not found.' });
        }

        // Fetch data using the service layer
        const result = await getStudentRecommendations(student.id, page, limit);

        return res.json(result);

    } catch (error) {
        console.error('[RecommendationController] getRecommendations error:', error);
        return res.status(500).json({ success: false, error: 'Internal server error while fetching recommendations.' });
    }
}
