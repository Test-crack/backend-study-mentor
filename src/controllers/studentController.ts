import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import prisma from '../lib/prisma';
import { getValidatedStreak } from '../lib/streak';
import { AssessmentModeType, IASessionStatus, MockSessionStatus } from '@prisma/client';
import { currentISTDate } from '../lib/timezone';
import { detectAndMarkMissedIAs } from '../lib/iaMissDetector';

function todayISTString(): string {
    const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;
    const now = new Date(Date.now() + IST_OFFSET_MS);
    return [
        now.getUTCFullYear(),
        String(now.getUTCMonth() + 1).padStart(2, '0'),
        String(now.getUTCDate()).padStart(2, '0'),
    ].join('-');
}

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
        const examDate = (student as any).exam_date as Date | null | undefined;

        return res.json({
            success: true,
            data: matrix,
            target_band:   student.target_band ?? 7.0,
            exam_date:     examDate ? new Date(examDate).toISOString().slice(0, 10) : null,
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

/**
 * GET /api/student/mock-history
 * Returns all COMPLETED mock sessions, newest first.
 * Includes scores[] array, real_band_score (IELTS overall), and momentum_awarded.
 */
export async function getMockHistory(req: AuthRequest, res: Response) {
    try {
        const appUserId = (req as any).appUserId as string;
        if (!appUserId) return res.status(401).json({ success: false, error: 'Unauthorized.' });

        const student = await prisma.institute_students.findUnique({ where: { user_id: appUserId } });
        if (!student) return res.status(404).json({ success: false, error: 'Student not found.' });

        const sessions = await prisma.mocksessions.findMany({
            where: { student_id: student.id, status: MockSessionStatus.COMPLETED },
            orderBy: { created_at: 'desc' },
            select: {
                id: true,
                month_year: true,
                attempt_type: true,
                status: true,
                time_submitted_at: true,
                scores: true,
                real_band_score: true,
                momentum_awarded: true,
            },
        });

        return res.json({
            success: true,
            data: sessions.map(s => ({
                ...s,
                real_band_score: s.real_band_score != null ? parseFloat(String(s.real_band_score)) : null,
            })),
        });
    } catch (error) {
        console.error('[StudentController] getMockHistory error:', error);
        return res.status(500).json({ success: false, error: 'Internal server error.' });
    }
}

/**
 * GET /api/student/ia-history
 * Returns all COMPLETED IA sessions, newest first.
 * Each entry includes the full scores[] array (SectionScore) with AI feedback and momentum_awarded.
 */
export async function getIAHistory(req: AuthRequest, res: Response) {
    try {
        const appUserId = (req as any).appUserId as string;
        if (!appUserId) return res.status(401).json({ success: false, error: 'Unauthorized.' });

        const student = await prisma.institute_students.findUnique({ where: { user_id: appUserId } });
        if (!student) return res.status(404).json({ success: false, error: 'Student not found.' });

        const sessions = await prisma.iASession.findMany({
            where: {
                student_id: student.id,
                status: { in: [IASessionStatus.COMPLETED, IASessionStatus.MISSED] },
            },
            orderBy: { ia_date: 'desc' },
            select: {
                id: true,
                ia_number: true,
                ia_date: true,
                status: true,
                time_submitted_at: true,
                scores: true,
                momentum_awarded: true,
                carry_forward_subskills: true,
            },
        });

        return res.json({
            success: true,
            data: sessions.map(s => ({
                ...s,
                ia_date: s.ia_date instanceof Date
                    ? s.ia_date.toISOString().split('T')[0]
                    : s.ia_date,
            })),
        });
    } catch (error) {
        console.error('[StudentController] getIAHistory error:', error);
        return res.status(500).json({ success: false, error: 'Internal server error.' });
    }
}

/**
 * GET /api/student/pending-notifications
 * Returns today's pending/in-progress IA + this month's pending/in-progress Mock.
 * Used by the DailyNotices dashboard widget.
 */
export async function getPendingNotifications(req: AuthRequest, res: Response) {
    try {
        const appUserId = (req as any).appUserId as string;
        if (!appUserId) return res.status(401).json({ success: false, error: 'Unauthorized.' });

        const student = await prisma.institute_students.findUnique({ where: { user_id: appUserId } });
        if (!student) return res.status(404).json({ success: false, error: 'Student not found.' });

        const todayStr  = todayISTString();            // "YYYY-MM-DD"
        const monthYear = todayStr.slice(0, 7);        // "YYYY-MM"
        const todayDate = currentISTDate();            // midnight-UTC Date matching ia_date storage

        // Always sweep for stale sessions first — this is the primary trigger
        // for miss detection when the student only visits the dashboard (never the IA page).
        await detectAndMarkMissedIAs(student.id);

        const notifications: Record<string, any>[] = [];

        // ── IA — look up today's session via the unique (student_id, ia_date) key ──
        const iaSession = await prisma.iASession.findUnique({
            where: { student_id_ia_date: { student_id: student.id, ia_date: todayDate } },
            select: { id: true, ia_number: true, ia_date: true, status: true, answers: true, window_closes_at: true },
        });

        if (iaSession?.status === IASessionStatus.PENDING) {
            notifications.push({
                type:            'IA_PENDING',
                ia_number:       iaSession.ia_number,
                ia_date:         todayStr,
                window_closes_at: iaSession.window_closes_at,
            });
        } else if (iaSession?.status === IASessionStatus.IN_PROGRESS) {
            const answers = (iaSession.answers as Record<string, any>) ?? {};
            notifications.push({
                type:            'IA_IN_PROGRESS',
                ia_number:       iaSession.ia_number,
                session_id:      iaSession.id,
                ia_date:         todayStr,
                window_closes_at: iaSession.window_closes_at,
                answers_saved:   Object.keys(answers).length,
            });
        }

        // ── Recently missed IAs (last 7 days, newest first, max 3) ─────────────
        const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
        const recentMissed = await prisma.iASession.findMany({
            where: {
                student_id: student.id,
                status:     IASessionStatus.MISSED,
                ia_date:    { gte: sevenDaysAgo },
            },
            orderBy: { ia_date: 'desc' },
            take: 3,
            select: { id: true, ia_number: true, ia_date: true, momentum_awarded: true },
        });

        for (const missed of recentMissed) {
            const missedDateStr = missed.ia_date instanceof Date
                ? missed.ia_date.toISOString().split('T')[0]
                : String(missed.ia_date);
            notifications.push({
                type:               'IA_MISSED',
                ia_number:          missed.ia_number,
                ia_date:            missedDateStr,
                momentum_deducted:  Math.abs(missed.momentum_awarded ?? 20),
            });
        }

        // ── Mock — look up this month's PENDING or IN_PROGRESS session ──
        const mockSession = await prisma.mocksessions.findFirst({
            where: {
                student_id: student.id,
                month_year: monthYear,
                status:     { in: [MockSessionStatus.PENDING, MockSessionStatus.IN_PROGRESS] },
            },
            select: { id: true, month_year: true, attempt_type: true, status: true, answers: true, window_closes_at: true },
        });

        if (mockSession?.status === MockSessionStatus.PENDING) {
            notifications.push({
                type:            'MOCK_PENDING',
                month_year:      mockSession.month_year,
                attempt_type:    mockSession.attempt_type,
                window_closes_at: mockSession.window_closes_at,
            });
        } else if (mockSession?.status === MockSessionStatus.IN_PROGRESS) {
            const answers = (mockSession.answers as Record<string, any>) ?? {};
            notifications.push({
                type:            'MOCK_IN_PROGRESS',
                session_id:      mockSession.id,
                month_year:      mockSession.month_year,
                attempt_type:    mockSession.attempt_type,
                window_closes_at: mockSession.window_closes_at,
                answers_saved:   Object.keys(answers).length,
            });
        }

        return res.json({ success: true, notifications });
    } catch (error) {
        console.error('[StudentController] getPendingNotifications error:', error);
        return res.status(500).json({ success: false, error: 'Internal server error.' });
    }
}
