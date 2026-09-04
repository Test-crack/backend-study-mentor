/**
 * practiceHistoryQueries.ts
 *
 * Shared, controller-agnostic per-student practice history: the standalone
 * Reading / Speaking / Writing practice work that sits behind the assessment
 * results.
 *
 * Extracted from instructorController so the institute-owner and institute-admin
 * portals can serve the SAME payload under their own authorisation. Previously
 * these computations were inline in three instructor handlers, which meant the
 * data was reachable only by a tutor assigned to the student's batch — an owner
 * looking at a student could see every assessment result but none of the
 * practice behind them.
 *
 * Follows the same split as batchDashboardQueries / studentProgressQueries:
 * NO auth and NO HTTP in here. Callers verify access first, then call these.
 *
 * `studentUserId` is User.id — these three legacy practice tables key off
 * User.id, not institute_students.id.
 */

import prisma from './prisma';

/** Newest-first cap. Matches the previous instructor behaviour. */
const HISTORY_LIMIT = 50;

const round = (v: number, dp: number) => parseFloat(v.toFixed(dp));

// ─── Reading ──────────────────────────────────────────────────────────────────

export async function computeReadingHistory(studentUserId: string) {
    const sessions = await prisma.ieltsReadingAssessment.findMany({
        where:   { userId: studentUserId },
        orderBy: { createdAt: 'desc' },
        take:    HISTORY_LIMIT,
    });

    const n = sessions.length;
    return {
        sessions,
        summary: {
            totalSessions: n,
            avgWpm:        n ? round(sessions.reduce((a, b) => a + b.wpm, 0) / n, 0) : 0,
            avgAccuracy:   n ? round(sessions.reduce((a, b) => a + b.accuracy, 0) / n, 1) : 0,
            bestScore:     n ? round(Math.max(...sessions.map(s => s.speedLearningScore)), 1) : 0,
        },
    };
}

// ─── Speaking ─────────────────────────────────────────────────────────────────

export async function computeSpeakingHistory(studentUserId: string) {
    const history = await prisma.ieltsSpeakingAssessment.findMany({
        where:   { userId: studentUserId },
        orderBy: { createdAt: 'desc' },
        take:    HISTORY_LIMIT,
        include: { IeltsSpeakingPractice: { select: { title: true } } },
    });

    const sessions = history.map(item => {
        // Filler counts live in two grading passes; combine before ranking so a
        // word said once per pass outranks a word said twice in one.
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
            id:            item.id,
            topicId:       item.topicId,
            topicTitle:    item.IeltsSpeakingPractice?.title || item.topicId,
            bandLevel:     item.band || 'All',
            fluencyScore:  item.fluencyScore,
            weightedWpm:   item.weightedWpm,
            keywordsHit:   item.keywordsHit,
            totalKeywords: item.totalKeywords,
            pass1Data:     item.pass1Data,
            pass2Data:     item.pass2Data,
            frequentFillers,
            createdAt:     item.createdAt,
        };
    });

    const n = sessions.length;
    return {
        sessions,
        summary: {
            totalSessions: n,
            avgFluency: n ? round(sessions.reduce((a, b) => a + b.fluencyScore, 0) / n, 1) : 0,
            avgWpm:     n ? round(sessions.reduce((a, b) => a + b.weightedWpm, 0) / n, 0) : 0,
            bestScore:  n ? round(Math.max(...sessions.map(s => s.fluencyScore)), 1) : 0,
        },
    };
}

// ─── Writing ──────────────────────────────────────────────────────────────────

export async function computeWritingHistory(studentUserId: string) {
    const sessions = await prisma.ieltsWritingAssessment.findMany({
        where:   { userId: studentUserId },
        orderBy: { createdAt: 'desc' },
        take:    HISTORY_LIMIT,
        include: { IeltsWritingTask: true },
    });

    // AI band only, deliberately — manual instructor grades do NOT override AI
    // scoring on this platform (product decision), so manualBandScore is not
    // consulted here even though the column exists.
    //
    // Unscored drafts are excluded from the mean rather than counted as 0:
    // averaging a missing score in as zero drags the figure below any band the
    // student actually received.
    const scored = sessions
        .map(s => parseFloat(s.aiBandScore || ''))
        .filter(v => !isNaN(v));

    return {
        sessions,
        summary: {
            totalSessions: sessions.length,
            avgScore: scored.length ? round(scored.reduce((a, b) => a + b, 0) / scored.length, 1) : 0,
        },
    };
}
