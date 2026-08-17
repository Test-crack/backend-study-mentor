   /**
 * readingPracticeController.ts
 *
 * Handles all endpoints related to the IELTS Reading Practice feature.
 * Data is stored in the "IeltsReadingAssessment" table (new â€” freed up
 * after the old reading assessment table was renamed to IeltsSpeakingAssessment).
 *
 * Routes:
 *   POST /api/reading-practice/submit             â†’ student submits a session
 *   GET  /api/reading-practice/history            â†’ student's own history
 *   GET  /api/instructor/batches/:id/reading-analytics    â†’ instructor batch analytics
 *   GET  /api/institute-owner/batches/:id/reading-analytics â†’ owner batch analytics
 */

import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import prisma from '../lib/prisma';
import { paramStr } from '../utils/httpParams';

// â”€â”€â”€ Helpers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function computeGrade(accuracy: number): string {
    if (accuracy >= 90) return 'A+';
    if (accuracy >= 80) return 'A';
    if (accuracy >= 70) return 'B';
    if (accuracy >= 60) return 'C';
    if (accuracy >= 50) return 'D';
    return 'F';
}

function computeSpeedCategory(wpm: number): string {
    if (wpm >= 550) return 'Advanced';
    if (wpm >= 400) return 'Proficient';
    if (wpm >= 250) return 'Average';
    return 'Developing';
}

function generateFeedbackTips(accuracy: number, wpm: number, grade: string): string[] {
    const tips: string[] = [];
    if (accuracy < 60) tips.push('Focus on reading more carefully â€” comprehension matters more than speed.');
    if (accuracy >= 80 && wpm < 250) tips.push('Great accuracy! Try increasing your reading speed gradually.');
    if (wpm > 500 && accuracy < 70) tips.push('Reading fast but losing comprehension â€” slow down slightly.');
    if (grade === 'A+') tips.push('Outstanding! Keep practising to maintain this level.');
    if (grade === 'D' || grade === 'F') tips.push("Don't worry â€” regular practice improves both speed and retention.");
    if (tips.length === 0) tips.push('Good effort! Consistent practice is the key to improvement.');
    return tips;
}

// â”€â”€â”€ Endpoint 1: POST /api/reading-practice/submit â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

/**
 * Score a Reading Practice session and save to IeltsReadingAssessment.
 * Uses IeltsSpeedReadingExercise (correctAnswer field) to grade answers.
 */
export async function submitReadingPractice(
    req: AuthRequest & { appUserId?: string },
    res: Response
) {
    try {
        const userId = (req as any).appUserId as string;
        if (!userId) return res.status(401).json({ success: false, error: 'Unauthenticated' });

        const {
            reportId,
            passageTitle,
            category,
            wordCount,
            readingTimeSeconds,
            wpm,
            answers,
        } = req.body as {
            reportId: string;
            passageTitle: string;
            category: string;
            wordCount: number;
            readingTimeSeconds: number;
            wpm: number;
            answers: { questionId: string; selectedOption: string }[];
        };

        if (!reportId || !Array.isArray(answers) || !readingTimeSeconds) {
            return res.status(400).json({ success: false, error: 'Missing required fields: reportId, answers, readingTimeSeconds' });
        }

        // Fetch the passage + its exercises to score answers
        const report = await prisma.ieltsSpeedReadingReport.findUnique({
            where: { id: reportId },
            include: {
                IeltsSpeedReadingExercise: {
                    orderBy: { createdAt: 'asc' },
                },
            },
        });

        if (!report) {
            return res.status(404).json({ success: false, error: 'Reading passage not found' });
        }

        // Score answers against IeltsSpeedReadingExercise.correctAnswer
        let correctCount = 0;
        const scoredAnswers = report.IeltsSpeedReadingExercise.map(ex => {
            const userAns = answers.find(a => a.questionId === ex.id);
            const userAnswer = userAns?.selectedOption ?? '';
            const isCorrect = userAnswer.trim() === ex.correctAnswer.trim();
            if (isCorrect) correctCount++;
            return {
                questionId: ex.id,
                stem: ex.question,
                userAnswer,
                correctAnswer: ex.correctAnswer,
                isCorrect,
                explanation: ex.explanation ?? null,
            };
        });

        const totalQuestions = report.IeltsSpeedReadingExercise.length || answers.length;
        const accuracy = totalQuestions > 0
            ? parseFloat(((correctCount / totalQuestions) * 100).toFixed(2))
            : 0;

        // Derived metrics (same formula as speed-reading submit)
        const idealWpm = 300;
        const speedFactor = Math.min(1, wpm / idealWpm);
        const retentionScore = parseFloat(((accuracy / 100) * speedFactor * 100).toFixed(2));
        const speedScore = Math.round(Math.min(Math.max((wpm - 200) / 6, 0), 100));
        const efficiencyScore = parseFloat(((retentionScore * 0.6) + (speedScore * 0.4)).toFixed(2));
        const speedComponent = Math.min(100, (wpm / idealWpm) * 100);
        const speedLearningScore = parseFloat(((0.6 * accuracy) + (0.4 * speedComponent)).toFixed(2));
        const grade = computeGrade(accuracy);
        const speedCategory = computeSpeedCategory(wpm);
        const feedbackTips = generateFeedbackTips(accuracy, wpm, grade);

        // Save to "IeltsReadingAssessment"
        const saved = await prisma.ieltsReadingAssessment.create({
            data: {
                userId,
                reportId,
                passageTitle: passageTitle ?? report.title,
                category: category ?? report.category,
                wordCount: wordCount ?? report.wordCount,
                readingTimeSeconds,
                wpm,
                accuracy,
                retentionScore,
                efficiencyScore,
                speedLearningScore,
                grade,
                speedCategory,
                totalQuestions,
                correctAnswers: correctCount,
                scoredAnswers,
                feedbackTips,
            },
        });

        return res.json({
            success: true,
            data: {
                id: saved.id,
                grade,
                wpm,
                retentionScore,
                efficiencyScore,
                speedLearningScore,
                accuracy,
                correct: correctCount,
                total: totalQuestions,
                readingTimeSeconds,
                speedCategory,
                speedScore,
                idealWpmSuggestion: retentionScore >= 70
                    ? Math.min(Math.round(wpm + 50), 800)
                    : Math.max(Math.round(wpm - 50), 200),
                scoredAnswers,
                feedback: feedbackTips,
            },
        });
    } catch (err: any) {
        console.error('[submitReadingPractice]', err);
        return res.status(500).json({ success: false, error: err.message || 'Internal server error' });
    }
}

// â”€â”€â”€ Endpoint 2: GET /api/reading-practice/history â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

/**
 * Fetch the authenticated student's own reading practice session history.
 */
export async function getMyReadingHistory(
    req: AuthRequest & { appUserId?: string },
    res: Response
) {
    try {
        const userId = (req as any).appUserId as string;
        if (!userId) return res.status(401).json({ success: false, error: 'Unauthenticated' });

        const limit = req.query.limit ? parseInt(req.query.limit as string) : 50;
        const category = req.query.category as string | undefined;

        const history = await prisma.ieltsReadingAssessment.findMany({
            where: {
                userId,
                ...(category ? { category } : {}),
            },
            orderBy: { createdAt: 'desc' },
            take: limit,
            select: {
                id: true,
                reportId: true,
                passageTitle: true,
                category: true,
                wordCount: true,
                readingTimeSeconds: true,
                wpm: true,
                accuracy: true,
                retentionScore: true,
                efficiencyScore: true,
                speedLearningScore: true,
                grade: true,
                totalQuestions: true,
                correctAnswers: true,
                createdAt: true,
            },
        });

        return res.json({ success: true, data: history });
    } catch (err: any) {
        console.error('[getMyReadingHistory]', err);
        return res.status(500).json({ success: false, error: err.message || 'Internal server error' });
    }
}

// â”€â”€â”€ Endpoint 3 & 4: Batch Reading Analytics (Instructor + Owner) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

/**
 * Shared handler â€” batch-level reading analytics aggregated from IeltsReadingAssessment.
 * Used by both:
 *   GET /api/instructor/batches/:batchId/reading-analytics
 *   GET /api/institute-owner/batches/:batchId/reading-analytics
 */
export async function getBatchReadingAnalytics(req: AuthRequest, res: Response) {
    try {
        const batchId = paramStr(req.params.batchId);

        const isUuid = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(batchId);
        let batch: any = null;

        if (isUuid) {
            batch = await prisma.batch.findUnique({
                where: { id: batchId },
                include: {
                    batch_students: {
                        include: {
                            User: {
                                select: { id: true, name: true, profileImage: true },
                            },
                        },
                    },
                },
            });
        } else {
            const allBatches = await prisma.batch.findMany({
                include: {
                    batch_students: {
                        include: {
                            User: {
                                select: { id: true, name: true, profileImage: true },
                            },
                        },
                    },
                },
            });
            batch = allBatches.find(b => (b.name || '').toLowerCase().replace(/\s+/g, '-') === batchId);
        }

        if (!batch) {
            return res.status(404).json({ success: false, error: 'Batch not found' });
        }

        const studentIds = batch.batch_students.map((bs: any) => bs.User.id);

        if (studentIds.length === 0) {
            return res.json({
                success: true,
                data: {
                    batchName: batch.name,
                    summary: { totalStudents: 0, avgWPM: 0, avgAccuracy: 0, avgSpeedLearningScore: 0, totalSessions: 0 },
                    wpmTrends: [],
                    studentLeaderboard: [],
                },
            });
        }

        // Fetch last 90 days of reading sessions for all batch students
        const since = new Date();
        since.setDate(since.getDate() - 90);

        const sessions = await prisma.ieltsReadingAssessment.findMany({
            where: {
                userId: { in: studentIds },
                createdAt: { gte: since },
            },
            orderBy: { createdAt: 'asc' },
        });

        // Per-student rollup
        type StudentRollup = { wpmSum: number; accSum: number; scoreSum: number; count: number; best: number };
        const sm: Record<string, StudentRollup> = {};
        studentIds.forEach((id: string) => { sm[id] = { wpmSum: 0, accSum: 0, scoreSum: 0, count: 0, best: 0 }; });

        sessions.forEach(s => {
            if (!sm[s.userId]) return;
            sm[s.userId].wpmSum += s.wpm;
            sm[s.userId].accSum += s.accuracy;
            sm[s.userId].scoreSum += s.speedLearningScore;
            sm[s.userId].count++;
            if (s.speedLearningScore > sm[s.userId].best) sm[s.userId].best = s.speedLearningScore;
        });

        // Leaderboard sorted by avgWPM
        const studentLeaderboard = batch.batch_students
            .map((bs: any) => {
                const r = sm[bs.User.id];
                if (!r || r.count === 0) return null;
                return {
                    studentId: bs.User.id,
                    name: bs.User.name ?? 'Unknown',
                    avatar: bs.User.profileImage ?? undefined,
                    avgWPM: parseFloat((r.wpmSum / r.count).toFixed(0)),
                    avgAccuracy: parseFloat((r.accSum / r.count).toFixed(1)),
                    bestSpeedLearningScore: parseFloat(r.best.toFixed(1)),
                    totalSessions: r.count,
                };
            })
            .filter((x: any): x is NonNullable<typeof x> => x !== null)
            .sort((a: any, b: any) => b.avgWPM - a.avgWPM);

        // Batch-level summary
        const totalSessions = sessions.length;
        const avgWPM = totalSessions ? sessions.reduce((a, b) => a + b.wpm, 0) / totalSessions : 0;
        const avgAccuracy = totalSessions ? sessions.reduce((a, b) => a + b.accuracy, 0) / totalSessions : 0;
        const avgSpeedLearningScore = totalSessions ? sessions.reduce((a, b) => a + b.speedLearningScore, 0) / totalSessions : 0;

        // Day-bucketed WPM trend
        const trendMap: Record<string, { wpmSum: number; accSum: number; count: number }> = {};
        sessions.forEach(s => {
            const day = s.createdAt.toISOString().split('T')[0];
            if (!trendMap[day]) trendMap[day] = { wpmSum: 0, accSum: 0, count: 0 };
            trendMap[day].wpmSum += s.wpm;
            trendMap[day].accSum += s.accuracy;
            trendMap[day].count++;
        });

        const wpmTrends = Object.entries(trendMap).map(([date, v]) => ({
            date,
            avgWpm: parseFloat((v.wpmSum / v.count).toFixed(0)),
            avgAccuracy: parseFloat((v.accSum / v.count).toFixed(1)),
        }));

        return res.json({
            success: true,
            data: {
                batchName: batch.name,
                summary: {
                    totalStudents: studentIds.length,
                    avgWPM: parseFloat(avgWPM.toFixed(0)),
                    avgAccuracy: parseFloat(avgAccuracy.toFixed(1)),
                    avgSpeedLearningScore: parseFloat(avgSpeedLearningScore.toFixed(1)),
                    totalSessions,
                },
                wpmTrends,
                studentLeaderboard,
            },
        });
    } catch (err: any) {
        console.error('[getBatchReadingAnalytics]', err);
        return res.status(500).json({ success: false, error: err.message || 'Internal server error' });
    }
}
