import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import prisma from '../lib/prisma';
import { getStudentRecommendations } from '../services/recommendationService';
import { BAND_MIN, bandToDifficulty } from '../lib/bandScale';

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

/**
 * GET /api/student/drill-recommendation?skill=WRITING&sub_skill=GRAMMAR
 *
 * Returns ONE recommendation item matched to the skill + sub-skill the student
 * just drilled, at their current competency level for that skill.
 *
 * Fallback chain:
 *   1. skill + sub_skill + level  (exact match)
 *   2. skill + level              (any sub-skill)
 *   3. skill only                 (any level)
 */
export async function getDrillRecommendation(req: AuthRequest, res: Response) {
    try {
        const appUserId = (req as any).appUserId as string;
        if (!appUserId) return res.status(401).json({ success: false, error: 'Unauthorized.' });

        const student = await prisma.institute_students.findUnique({ where: { user_id: appUserId } });
        if (!student) return res.status(404).json({ success: false, error: 'Student not found.' });

        const skill    = ((req.query.skill    as string) ?? '').toUpperCase();
        const subSkill = ((req.query.sub_skill as string) ?? '').toUpperCase();

        if (!skill) return res.status(400).json({ success: false, error: 'skill query param is required.' });

        // Derive level from competency matrix for this skill
        const matrix = await prisma.studentCompetencyMatrix.findUnique({
            where: { student_id_skill: { student_id: student.id, skill: skill as any } },
            select: { band_score: true }
        });
        // Missing band → 4.0 floor; level thresholds are the shared D3 even-thirds.
        const band  = parseFloat(String(matrix?.band_score ?? '')) || BAND_MIN;
        const level = bandToDifficulty(band);

        const VIDEO = 'VIDEO' as any;

        // 1 — exact: skill + sub_skill + level + VIDEO
        let items = await prisma.recommendationItem.findMany({
            where: { skill_type: skill as any, sub_skill: subSkill ? (subSkill as any) : undefined, level: level as any, type: VIDEO, is_active: true }
        });

        // 2 — skill + sub_skill (any level) + VIDEO
        if (items.length === 0 && subSkill) {
            items = await prisma.recommendationItem.findMany({
                where: { skill_type: skill as any, sub_skill: subSkill as any, type: VIDEO, is_active: true }
            });
        }

        // 3 — skill + level (any sub_skill) + VIDEO
        if (items.length === 0) {
            items = await prisma.recommendationItem.findMany({
                where: { skill_type: skill as any, level: level as any, type: VIDEO, is_active: true }
            });
        }

        // 4 — skill + VIDEO only
        if (items.length === 0) {
            items = await prisma.recommendationItem.findMany({
                where: { skill_type: skill as any, type: VIDEO, is_active: true }
            });
        }

        if (items.length === 0) {
            return res.json({ success: true, item: null });
        }

        // Pick one at random
        const item = items[Math.floor(Math.random() * items.length)];
        return res.json({ success: true, item, matched_level: level });

    } catch (error) {
        console.error('[getDrillRecommendation] error:', error);
        return res.status(500).json({ success: false, error: 'Internal server error.' });
    }
}
