import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import prisma from '../lib/prisma';
import { getValidatedStreak } from '../lib/streak';
import { AssessmentModeType } from '@prisma/client';

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

        const validBands = matrix
            .map(m => Number(m.band_score))
            .filter(s => s > 0);
        const current_band = validBands.length > 0
            ? Math.round((validBands.reduce((a, b) => a + b, 0) / validBands.length) * 2) / 2
            : 0;

        const daily_streak = await getValidatedStreak(student);

        return res.json({
            success: true,
            data: matrix,
            target_band:   student.target_band ?? 7.0,
            current_band,
            momentum_score: student.momentum_score,
            daily_streak,
        });

    } catch (error) {
        console.error('[StudentController] getCompetencyScores error:', error);
        return res.status(500).json({ success: false, error: 'Internal server error while fetching competency scores.' });
    }
}

/**
 * GET /api/student/assessment-history
 * Returns all INTERNAL_ASSESSMENT and MOCK entries for the student, newest first.
 */
export async function getAssessmentHistory(req: AuthRequest, res: Response) {
    try {
        const appUserId = (req as any).appUserId as string;
        if (!appUserId) return res.status(401).json({ success: false, error: 'Unauthorized.' });

        const student = await prisma.institute_students.findUnique({ where: { user_id: appUserId } });
        if (!student) return res.status(404).json({ success: false, error: 'Student not found.' });

        const entries = await prisma.assessmentHistory.findMany({
            where: {
                student_id: student.id,
                mode: { in: [AssessmentModeType.INTERNAL_ASSESSMENT, AssessmentModeType.MOCK] },
            },
            orderBy: { created_at: 'desc' },
            select: {
                id: true,
                skill: true,
                mode: true,
                band_score: true,
                sub_scores: true,
                feedback_json: true,
                created_at: true,
            },
        });

        return res.json({
            success: true,
            data: entries.map(e => ({ ...e, band_score: parseFloat(String(e.band_score)) })),
        });
    } catch (error) {
        console.error('[StudentController] getAssessmentHistory error:', error);
        return res.status(500).json({ success: false, error: 'Internal server error.' });
    }
}

/**
 * GET /api/student/diagnostic-report
 * Returns the first DIAGNOSTIC entry per skill — the student's baseline scores.
 */
export async function getDiagnosticReport(req: AuthRequest, res: Response) {
    try {
        const appUserId = (req as any).appUserId as string;
        if (!appUserId) return res.status(401).json({ success: false, error: 'Unauthorized.' });

        const student = await prisma.institute_students.findUnique({ where: { user_id: appUserId } });
        if (!student) return res.status(404).json({ success: false, error: 'Student not found.' });

        const entries = await prisma.assessmentHistory.findMany({
            where: { student_id: student.id, mode: AssessmentModeType.DIAGNOSTIC },
            orderBy: { created_at: 'asc' },
            select: {
                id: true,
                skill: true,
                band_score: true,
                sub_scores: true,
                feedback_json: true,
                created_at: true,
            },
        });

        // Keep only the first (oldest) entry per skill — that is the initial diagnostic baseline
        const seenSkills = new Set<string>();
        const report = entries
            .filter(e => { if (seenSkills.has(e.skill)) return false; seenSkills.add(e.skill); return true; })
            .map(e => ({ ...e, band_score: parseFloat(String(e.band_score)) }));

        return res.json({ success: true, data: report });
    } catch (error) {
        console.error('[StudentController] getDiagnosticReport error:', error);
        return res.status(500).json({ success: false, error: 'Internal server error.' });
    }
}
