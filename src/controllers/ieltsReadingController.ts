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
            prisma.ieltsSpeakingPractice.findMany({
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
            prisma.ieltsSpeakingPractice.count({ where })
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

        const topic = await prisma.ieltsSpeakingPractice.findUnique({
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

        // 4. Persistence — saves to IeltsSpeakingAssessment (renamed from IeltsReadingAssessment)
        const assessment = await prisma.ieltsSpeakingAssessment.create({
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

/**
 * GET /api/ielts-reading/speed-reading/reports
 * Fetch all speed reading reports - summary only (for main listing page)
 * Returns: id, category, title, source, wordCount. No text or questions.
 */
export const getSpeedReadingReports = async (_req: Request, res: Response) => {
    try {
        const reports = await prisma.ieltsSpeedReadingReport.findMany({
            select: {
                id: true,
                category: true,
                title: true,
                source: true,
                wordCount: true,
            },
            orderBy: { category: 'asc' }
        });

        res.json({
            success: true,
            data: reports
        });
    } catch (error) {
        console.error('Error fetching speed reading reports:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch speed reading reports'
        });
    }
};

/**
 * GET /api/ielts-reading/speed-reading/reports/:id
 * Fetch a single speed reading report with full text + related exercises
 */
export const getSpeedReadingReportById = async (req: Request, res: Response) => {
    try {
        const { id } = req.params;

        if (!id) {
            return res.status(400).json({ success: false, error: 'Report ID is required' });
        }

        const report = await prisma.ieltsSpeedReadingReport.findUnique({
            where: { id },
            include: {
                IeltsSpeedReadingExercise: {
                    select: {
                        id: true,
                        type: true,
                        question: true,
                        options: true,
                        correctAnswer: true,
                        explanation: true,
                    },
                    orderBy: { createdAt: 'asc' },
                },
            },
        });

        if (!report) {
            return res.status(404).json({ success: false, error: 'Speed reading report not found' });
        }

        // Map exercises to frontend-expected shape
        const questions = report.IeltsSpeedReadingExercise.map(ex => ({
            id: ex.id,
            type: ex.type,
            stem: ex.question,
            options: Array.isArray(ex.options) ? ex.options : [],
            answer: ex.correctAnswer,
            explanation: ex.explanation ?? undefined,
        }));

        res.json({
            success: true,
            data: {
                id: report.id,
                category: report.category,
                title: report.title,
                source: report.source,
                wordCount: report.wordCount,
                text: report.text,
                questions,
            },
        });
    } catch (error) {
        console.error('Error fetching speed reading report by ID:', error);
        res.status(500).json({ success: false, error: 'Failed to fetch speed reading report' });
    }
};
/**
 * POST /api/ielts-reading/speed-reading/submit
 * Evaluate a completed speed-reading + quiz session.
 * Computes metrics from submitted answers without writing to DB.
 */
export const submitSpeedReadingAssessment = async (req: Request, res: Response) => {
    try {
        const {
            reportId,
            readingTimeSeconds,
            wpm,
            answers,   // { questionId: string; selectedOption: string }[]
        } = req.body as {
            reportId: string;
            readingTimeSeconds: number;
            wpm: number;
            answers: { questionId: string; selectedOption: string }[];
        };

        if (!reportId || !Array.isArray(answers)) {
            return res.status(400).json({ success: false, error: 'reportId and answers are required' });
        }

        // Fetch the canonical exercises for this report
        const exercises = await prisma.ieltsSpeedReadingExercise.findMany({
            where: { reportId },
            orderBy: { createdAt: 'asc' },
        });

        if (exercises.length === 0) {
            return res.status(404).json({ success: false, error: 'No exercises found for this report' });
        }

        // ── Score answers ─────────────────────────────────────────────────────
        let correct = 0;
        const scoredAnswers = exercises.map(ex => {
            const userAnswer = answers.find(a => a.questionId === ex.id)?.selectedOption ?? '';
            const isCorrect = userAnswer.trim() === ex.correctAnswer.trim();
            if (isCorrect) correct++;
            return {
                questionId: ex.id,
                type: ex.type,
                stem: ex.question,
                options: Array.isArray(ex.options) ? ex.options : [],
                correctAnswer: ex.correctAnswer,
                userAnswer,
                isCorrect,
                explanation: ex.explanation ?? null,
            };
        });

        const total = exercises.length;
        const retentionScore = Math.round((correct / total) * 100);

        // ── Speed category (WPM bands) ────────────────────────────────────────
        const speedCategory =
            wpm < 250 ? 'Beginner' :
                wpm < 400 ? 'Developing' :
                    wpm < 550 ? 'Proficient' :
                        wpm < 700 ? 'Advanced' : 'Elite';

        // ── Letter grade from retention ───────────────────────────────────────
        const grade =
            retentionScore >= 90 ? 'A+' :
                retentionScore >= 80 ? 'A' :
                    retentionScore >= 70 ? 'B' :
                        retentionScore >= 60 ? 'C' :
                            retentionScore >= 50 ? 'D' : 'F';

        // ── Actionable feedback ───────────────────────────────────────────────
        const feedback: string[] = [];

        // Comprehension feedback
        if (retentionScore >= 80) {
            feedback.push('Excellent comprehension — your retention is well above the average reader. Challenge yourself with higher WPM on your next session.');
        } else if (retentionScore >= 60) {
            feedback.push('Good comprehension. Review the highlighted missed questions; understanding patterns in errors is the fastest route to improvement.');
        } else {
            feedback.push('Your comprehension needs attention. Try reducing your WPM by 50–100 to let the content sink in before pushing speed.');
        }

        // Speed feedback
        if (wpm >= 600) {
            feedback.push('Elite reading pace! The key goal now is sustaining ≥ 80% retention at this speed — that combination is rare and highly valuable.');
        } else if (wpm >= 400) {
            feedback.push(`Good pace at ${wpm} WPM. Incrementally target ${wpm + 50} WPM on your next session while keeping retention above 70%.`);
        } else {
            feedback.push(`At ${wpm} WPM you have significant room to grow. Increase by 25–50 WPM per session with deliberate practice.`);
        }

        // Ideal WPM suggestion (push gently if doing well, pull back if not)
        const idealWpmSuggestion =
            retentionScore >= 70
                ? Math.min(wpm + 50, 800)
                : Math.max(wpm - 50, 200);

        // ── Efficiency score (retention weighted by speed) ────────────────────
        // Normalise WPM to 0–100 scale (200 = 0, 800 = 100)
        const speedScore = Math.round(Math.min(Math.max((wpm - 200) / 6, 0), 100));
        const efficiencyScore = Math.round((retentionScore * 0.6) + (speedScore * 0.4));

        return res.json({
            success: true,
            data: {
                retentionScore,
                wpm,
                readingTimeSeconds,
                correct,
                total,
                grade,
                speedCategory,
                speedScore,
                efficiencyScore,
                feedback,
                idealWpmSuggestion,
                scoredAnswers,
            },
        });
    } catch (error) {
        console.error('Error evaluating speed reading session:', error);
        return res.status(500).json({ success: false, error: 'Failed to evaluate session' });
    }
};
