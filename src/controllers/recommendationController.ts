import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import prisma from '../lib/prisma';
import { getStudentRecommendations, getSpokenEnglishRecommendations, cefrToRecLevel } from '../services/recommendationService';
import { BAND_MIN } from '../lib/bandScale';
import { examDifficulty } from '../exam-engine';

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
        const student = await prisma.instituteStudent.findUnique({
            where: { user_id: appUserId }
        });

        if (!student) {
             return res.status(404).json({ success: false, error: 'Student record not found.' });
        }

        // Spoken English gets its speaking-only, sub-skill-grouped recommendations; every other exam
        // keeps the 4-skill band-based flow (scoped to its own exam_id so exams never cross-pollute).
        const result = student.exam_id === 'spoken_english'
            ? await getSpokenEnglishRecommendations(student.id, student.exam_id, page, limit)
            : await getStudentRecommendations(student.id, page, limit, student.exam_id);

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

        const student = await prisma.instituteStudent.findUnique({ where: { user_id: appUserId } });
        if (!student) return res.status(404).json({ success: false, error: 'Student not found.' });

        const skill    = ((req.query.skill    as string) ?? '').toUpperCase();
        const subSkill = ((req.query.sub_skill as string) ?? '').toUpperCase();

        if (!skill) return res.status(400).json({ success: false, error: 'skill query param is required.' });

        const examId = student.exam_id;

        // Derive the RecommendationLevel bucket. Spoken English uses the CEFR level of the specific
        // sub-skill (from the competency matrix subskillProfile); IELTS maps its band via D3 thirds.
        let level: string;
        if (examId === 'spoken_english') {
            const m = await prisma.studentCompetencyMatrix.findFirst({ where: { student_id: student.id, skill: 'SPEAKING' } });
            const sub: any = (m?.sub_scores as any) ?? {};
            const profile: any[] = Array.isArray(sub.subskillProfile) ? sub.subskillProfile : [];
            const ENUM_TO_ID: Record<string, string> = { VOCABULARY: 'range', GRAMMAR: 'accuracy', FLUENCY: 'fluency', INTERACTION: 'interaction', COHERENCE: 'coherence', PRONUNCIATION: 'phonology' };
            const row = profile.find((p) => p.id === ENUM_TO_ID[subSkill]);
            level = cefrToRecLevel(row?.level ?? sub.cefrLevel);
        } else {
            const matrix = await prisma.studentCompetencyMatrix.findUnique({
                where: { student_id_skill: { student_id: student.id, skill: skill as any } },
                select: { band_score: true }
            });
            // Missing band â†’ floor; level thresholds are the shared D3 even-thirds.
            const band = parseFloat(String(matrix?.band_score ?? '')) || BAND_MIN;
            level = examDifficulty('ielts', band);
        }

        const VIDEO = 'VIDEO' as any;

        // 1 â€” exact: skill + sub_skill + level + VIDEO
        let items = await prisma.recommendationItem.findMany({
            where: { exam_id: examId, skill_type: skill as any, sub_skill: subSkill ? (subSkill as any) : undefined, level: level as any, type: VIDEO, is_active: true }
        });

        // 2 â€” skill + sub_skill (any level) + VIDEO
        if (items.length === 0 && subSkill) {
            items = await prisma.recommendationItem.findMany({
                where: { exam_id: examId, skill_type: skill as any, sub_skill: subSkill as any, type: VIDEO, is_active: true }
            });
        }

        // 3 â€” skill + level (any sub_skill) + VIDEO
        if (items.length === 0) {
            items = await prisma.recommendationItem.findMany({
                where: { exam_id: examId, skill_type: skill as any, level: level as any, type: VIDEO, is_active: true }
            });
        }

        // 4 â€” skill + VIDEO only
        if (items.length === 0) {
            items = await prisma.recommendationItem.findMany({
                where: { exam_id: examId, skill_type: skill as any, type: VIDEO, is_active: true }
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
