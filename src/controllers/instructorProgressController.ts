/**
 * Instructor Progress Controller
 *
 * Three read-only endpoints that aggregate the NEW system data
 * (IASession, mocksessions, DrillSession, StudentCompetencyMatrix, etc.)
 * for the instructor dashboard.
 *
 * All "today" / date boundaries use todayStartIST() from lib/timezone —
 * never new Date() or UTC midnight — because the platform is India-only.
 *
 * Authorization pattern for every endpoint:
 *   1. Verify instructor is assigned to the batch (ielts_batch_instructors)
 *   2. For student-scoped endpoints: also verify student is in the batch
 *
 * Zero N+1 queries — all per-student aggregation is done with a single
 * IN-clause query followed by in-memory grouping.
 */

import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import prisma from '../lib/prisma';
import { todayStartIST } from '../lib/timezone';

// ─── Local helpers ────────────────────────────────────────────────────────────

const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;

/** YYYY-MM-DD string for any UTC Date, evaluated in IST. */
function toISTDateString(d: Date): string {
    const ist = new Date(d.getTime() + IST_OFFSET_MS);
    return [
        ist.getUTCFullYear(),
        String(ist.getUTCMonth() + 1).padStart(2, '0'),
        String(ist.getUTCDate()).padStart(2, '0'),
    ].join('-');
}

/** Current IST calendar date as "YYYY-MM-DD". */
function todayISTString(): string {
    return toISTDateString(new Date());
}

/** Subtract N whole IST calendar days from todayStart. */
function daysBeforeIST(n: number): Date {
    return new Date(todayStartIST().getTime() - n * 24 * 60 * 60 * 1000);
}

/** Mean of all COMPLETED IA session's average band (scores[].band mean per session). */
function avgBandFromScores(scores: unknown): number {
    const arr = (scores as Array<{ band?: number }> | null) ?? [];
    const bands = arr.map(s => s.band ?? 0).filter(b => b > 0);
    return bands.length > 0 ? bands.reduce((a, b) => a + b, 0) / bands.length : 0;
}

/**
 * Compute band_trend from the last 2 COMPLETED IA sessions.
 * Returns null when < 2 completed IAs exist — never returns "flat" on 0 or 1 session.
 * Threshold: 0.25 to avoid noise from IELTS 0.5-rounding.
 */
function computeBandTrend(
    last2: Array<{ scores: unknown }>
): 'up' | 'flat' | 'down' | null {
    if (last2.length < 2) return null;
    const [newer, older] = last2.map(ia => avgBandFromScores(ia.scores));
    if (newer > older + 0.25) return 'up';
    if (newer < older - 0.25) return 'down';
    return 'flat';
}

/** Current band from competency matrix: mean of non-zero band_scores, rounded to 0.5. */
function computeCurrentBand(
    rows: Array<{ band_score: unknown }>
): number | null {
    const valid = rows
        .map(r => parseFloat(String(r.band_score ?? '0')))
        .filter(v => !isNaN(v) && v > 0);
    if (valid.length === 0) return null;
    const mean = valid.reduce((a, b) => a + b, 0) / valid.length;
    return Math.round(mean * 2) / 2;
}

// ─── Shared auth helper ───────────────────────────────────────────────────────

/**
 * Resolves the batch → students data needed by all three endpoints.
 * Returns null and sends a 403 if the instructor is not in the batch.
 *
 * Returned:
 *   instStudents  — institute_students rows (with user_id for joining User data)
 *   instStudentIds — the PKs used in IASession, DrillSession, etc.
 *   userIds        — User.id list for the batch students
 */
async function resolveBatchStudents(
    res: Response,
    appUserId: string,
    batchId: string
): Promise<{
    instStudents: Array<{
        id: string;
        user_id: string;
        target_band: number | null;
        momentum_score: number;
        daily_streak: number;
        isDiagnosed: boolean;
        last_streak_date: Date | null;
    }>;
    instStudentIds: string[];
    userIds: string[];
} | null> {
    // 1. Verify instructor membership
    const membership = await (prisma as any).ielts_batch_instructors.findFirst({
        where: { batch_id: batchId, user_id: appUserId },
    });
    if (!membership) {
        res.status(403).json({ success: false, error: 'Forbidden — not assigned to this batch.' });
        return null;
    }

    // 2. Get all students enrolled in the batch
    const batchStudentLinks: Array<{ user_id: string }> =
        await (prisma as any).ielts_batch_students.findMany({
            where: { batch_id: batchId },
            select: { user_id: true },
        });
    const userIds = batchStudentLinks.map((s: any) => s.user_id);

    if (userIds.length === 0) {
        return { instStudents: [], instStudentIds: [], userIds: [] };
    }

    // 3. Resolve institute_students PKs (the FK used in all learning tables)
    const instStudents = await prisma.institute_students.findMany({
        where: { user_id: { in: userIds } },
        select: {
            id: true,
            user_id: true,
            target_band: true,
            momentum_score: true,
            daily_streak: true,
            isDiagnosed: true,
            last_streak_date: true,
        },
    });

    return {
        instStudents,
        instStudentIds: instStudents.map(s => s.id),
        userIds,
    };
}

// ─── GET /api/instructor/batches/:batchId/dashboard-summary ──────────────────

export async function getBatchDashboardSummary(req: AuthRequest, res: Response) {
    try {
        const appUserId = (req as any).appUserId as string;
        const { batchId } = req.params;

        const resolved = await resolveBatchStudents(res, appUserId, batchId);
        if (!resolved) return;
        const { instStudents, instStudentIds, userIds } = resolved;

        // Fetch User names/avatars for display
        const users = await prisma.user.findMany({
            where: { id: { in: userIds } },
            select: { id: true, name: true, profileImage: true },
        });
        const userById = new Map(users.map(u => [u.id, u]));

        // Map instStudent.id → User for downstream use
        const userByInstId = new Map(
            instStudents.map(s => [s.id, userById.get(s.user_id)])
        );

        if (instStudentIds.length === 0) {
            return res.json({
                success: true,
                data: {
                    engagement_today: { active_students: 0, avg_dcs: 0, streaks_alive: 0, platform_unlocked: 0, active_yesterday: 0, avg_dcs_yesterday: 0 },
                    at_risk: [],
                    band_overview: [],
                    period_summary: { ia_completed_last_7_days: 0, ia_total_students: 0, mock_completed_this_month: 0, mock_total_students: 0 },
                },
            });
        }

        // ── Date anchors (all IST) ────────────────────────────────────────────
        const todayStart    = todayStartIST();
        const yesterdayStart = daysBeforeIST(1);
        const sevenDaysAgo   = daysBeforeIST(7);
        const currentMonthYear = todayISTString().slice(0, 7); // "YYYY-MM"

        // ── Parallel data fetch — one query per concern, no N+1 ──────────────
        const [
            todayDrills,
            yesterdayDrills,
            missedIACounts,
            lastDrillByStudent,
            competencyRows,
            recentCompletedIAs,
            iaLast7Days,
            mockThisMonth,
            lexigridToday,
        ] = await Promise.all([
            // today's drills (for active/DCS/unlocked counts)
            prisma.drillSession.findMany({
                where: { student_id: { in: instStudentIds }, created_at: { gte: todayStart } },
                select: { student_id: true, correct_answers: true, total_questions: true },
            }),
            // yesterday's drills (for trend arrows)
            prisma.drillSession.findMany({
                where: { student_id: { in: instStudentIds }, created_at: { gte: yesterdayStart, lt: todayStart } },
                select: { student_id: true, correct_answers: true, total_questions: true },
            }),
            // missed IA count per student
            prisma.iASession.groupBy({
                by: ['student_id'],
                where: { student_id: { in: instStudentIds }, status: 'MISSED' as any },
                _count: { id: true },
            }),
            // last drill date per student (for days_inactive flag)
            prisma.drillSession.groupBy({
                by: ['student_id'],
                where: { student_id: { in: instStudentIds } },
                _max: { created_at: true },
            }),
            // band scores for all students
            prisma.studentCompetencyMatrix.findMany({
                where: { student_id: { in: instStudentIds } },
                select: { student_id: true, skill: true, band_score: true },
            }),
            // last 2 COMPLETED IAs per student (for band_trend)
            prisma.iASession.findMany({
                where: { student_id: { in: instStudentIds }, status: 'COMPLETED' as any },
                orderBy: { ia_date: 'desc' },
                select: { student_id: true, ia_date: true, scores: true },
            }),
            // IA completions last 7 rolling IST days
            prisma.iASession.count({
                where: {
                    student_id: { in: instStudentIds },
                    status: 'COMPLETED' as any,
                    ia_date: { gte: sevenDaysAgo },
                },
            }),
            // Mock completions this calendar month
            prisma.mocksessions.count({
                where: {
                    student_id: { in: instStudentIds },
                    status: 'COMPLETED' as any,
                    month_year: currentMonthYear,
                },
            }),
            // LexiGrid completions today (for activity grid)
            (prisma as any).studentGameScore.findMany({
                where: {
                    student_id:   { in: instStudentIds },
                    game_type:    'LEXIGRID',
                    session_date: { gte: todayStart },
                },
                select: { student_id: true, completed: true, words_solved: true },
            }),
        ]);

        // ── Engagement today ─────────────────────────────────────────────────
        // Group today's drills by student
        const todayDrillsByStudent = new Map<string, typeof todayDrills>();
        for (const d of todayDrills) {
            const arr = todayDrillsByStudent.get(d.student_id) ?? [];
            arr.push(d);
            todayDrillsByStudent.set(d.student_id, arr);
        }

        let totalCorrectToday = 0, totalQuestionsToday = 0;
        let activeTodayCount = 0, unlockedTodayCount = 0;
        for (const [sid, drills] of todayDrillsByStudent) {
            if (drills.length > 0) activeTodayCount++;
            if (drills.length >= 2) unlockedTodayCount++;
            for (const d of drills) {
                totalCorrectToday   += d.correct_answers;
                totalQuestionsToday += d.total_questions;
            }
        }
        const avgDcsToday = totalQuestionsToday > 0
            ? Math.round((totalCorrectToday / totalQuestionsToday) * 100)
            : 0;

        // Yesterday's engagement
        const yesterdayStudents = new Set(yesterdayDrills.map(d => d.student_id));
        let totalCorrectYest = 0, totalQuestionsYest = 0;
        for (const d of yesterdayDrills) {
            totalCorrectYest   += d.correct_answers;
            totalQuestionsYest += d.total_questions;
        }
        const avgDcsYesterday = totalQuestionsYest > 0
            ? Math.round((totalCorrectYest / totalQuestionsYest) * 100)
            : 0;

        const streaksAlive = instStudents.filter(s => s.daily_streak > 0).length;

        // ── Build lookup maps for per-student data ────────────────────────────
        const missedCountByStudentId = new Map(
            missedIACounts.map(r => [r.student_id, (r._count as any).id as number])
        );
        const lastDrillByStudentId = new Map(
            lastDrillByStudent.map(r => [r.student_id, (r._max as any).created_at as Date | null])
        );

        // Band data: group competency rows by student
        const competencyByStudentId = new Map<string, typeof competencyRows>();
        for (const row of competencyRows) {
            const arr = competencyByStudentId.get(row.student_id) ?? [];
            arr.push(row);
            competencyByStudentId.set(row.student_id, arr);
        }

        // Last IA dates from competency: get last COMPLETED IA per student
        const lastIAByStudentId = new Map<string, Date | null>();
        const recentIAsByStudent = new Map<string, typeof recentCompletedIAs>();
        for (const ia of recentCompletedIAs) {
            const arr = recentIAsByStudent.get(ia.student_id) ?? [];
            if (arr.length < 2) arr.push(ia);
            recentIAsByStudent.set(ia.student_id, arr);
            // Track last ia_date
            if (!lastIAByStudentId.has(ia.student_id)) {
                lastIAByStudentId.set(ia.student_id, ia.ia_date instanceof Date ? ia.ia_date : new Date(ia.ia_date));
            }
        }

        // ── at_risk list ──────────────────────────────────────────────────────
        const atRisk: Array<{
            student_id: string;
            name: string;
            avatar: string | null;
            flags: string[];
            primary_flag: string;
            days_inactive: number;
            missed_ia_count: number;
            current_band: number | null;
        }> = [];

        // Build LexiGrid lookup: student_id → { done, words }
        const lexiByStudentId = new Map<string, { done: boolean; words: number }>();
        for (const l of (lexigridToday as any[])) {
            lexiByStudentId.set(l.student_id, { done: l.completed, words: l.words_solved ?? 0 });
        }

        const nowMs = Date.now();

        for (const s of instStudents) {
            const flags: string[] = [];
            const user = userByInstId.get(s.id);
            const missedCount  = missedCountByStudentId.get(s.id) ?? 0;
            const lastDrill    = lastDrillByStudentId.get(s.id) ?? null;
            // Use -1 as "never drilled" sentinel — avoids "999 days" in flag text
            const daysInactive = lastDrill
                ? Math.floor((nowMs - lastDrill.getTime()) / (24 * 60 * 60 * 1000))
                : -1;

            if (!s.isDiagnosed)                              flags.push('Not yet diagnosed');
            if (daysInactive === -1)                         flags.push('Never drilled');
            else if (daysInactive >= 3)                      flags.push(`No activity for ${daysInactive} day${daysInactive !== 1 ? 's' : ''}`);
            if (missedCount >= 2)                            flags.push(`Missed ${missedCount} internal assessments`);
            if (s.daily_streak === 0 && daysInactive !== -1 && daysInactive > 1) flags.push('Streak broken');
            if (s.momentum_score < 100)                      flags.push('Low momentum');

            // Band declining: last 2 IAs trending down
            const last2IAs = recentIAsByStudent.get(s.id) ?? [];
            if (computeBandTrend(last2IAs) === 'down') flags.push('Band score declining');

            if (flags.length === 0) continue;

            const competency   = competencyByStudentId.get(s.id) ?? [];
            const current_band = computeCurrentBand(competency);

            atRisk.push({
                student_id:     s.id,
                name:           user?.name ?? 'Unknown',
                avatar:         (user as any)?.profileImage ?? null,
                flags,
                primary_flag:   flags[0],
                days_inactive:  daysInactive === 999 ? -1 : daysInactive,
                missed_ia_count: missedCount,
                current_band,
            });
        }

        // Sort: non-diagnosed first, then by days_inactive desc
        atRisk.sort((a, b) => {
            const aDiag = a.flags.includes('Not yet diagnosed') ? 1 : 0;
            const bDiag = b.flags.includes('Not yet diagnosed') ? 1 : 0;
            if (aDiag !== bDiag) return bDiag - aDiag;
            return b.days_inactive - a.days_inactive;
        });

        // Build at-risk lookup for activity grid
        const atRiskById = new Map(atRisk.map(r => [r.student_id, r]));

        // ── band_overview ─────────────────────────────────────────────────────
        const bandOverview = instStudents.map(s => {
            const user         = userByInstId.get(s.id);
            const competency   = competencyByStudentId.get(s.id) ?? [];
            const current_band = computeCurrentBand(competency);
            const target_band  = s.target_band ? parseFloat(String(s.target_band)) : null;
            const gap          = current_band !== null && target_band !== null
                ? Math.round((target_band - current_band) * 10) / 10
                : null;
            const lastIADate   = lastIAByStudentId.get(s.id) ?? null;
            const last2IAs     = recentIAsByStudent.get(s.id) ?? [];
            const drillsToday  = todayDrillsByStudent.get(s.id) ?? [];
            const lexi         = lexiByStudentId.get(s.id) ?? null;
            const riskEntry    = atRiskById.get(s.id) ?? null;

            return {
                student_id:          s.id,
                name:                user?.name ?? 'Unknown',
                avatar:              (user as any)?.profileImage ?? null,
                current_band,
                target_band,
                gap,
                last_ia_date:        lastIADate ? lastIADate.toISOString().split('T')[0] : null,
                band_trend:          computeBandTrend(last2IAs),
                // Per-student today fields — for the activity grid
                drilled_today:       drillsToday.length > 0,
                drills_count_today:  drillsToday.length,
                streak:              s.daily_streak,
                lexigrid_done_today: lexi?.done ?? false,
                lexigrid_words_today: lexi?.words ?? null,
                // At-risk signal embedded so grid can show a badge
                is_at_risk:          riskEntry !== null,
                risk_primary_flag:   riskEntry?.primary_flag ?? null,
            };
        });

        // Sort by gap descending (widest gap first), nulls last
        bandOverview.sort((a, b) => {
            if (a.gap === null && b.gap === null) return 0;
            if (a.gap === null) return 1;
            if (b.gap === null) return -1;
            return b.gap - a.gap;
        });

        return res.json({
            success: true,
            data: {
                engagement_today: {
                    active_students:  activeTodayCount,
                    avg_dcs:          avgDcsToday,
                    streaks_alive:    streaksAlive,
                    platform_unlocked: unlockedTodayCount,
                    active_yesterday: yesterdayStudents.size,
                    avg_dcs_yesterday: avgDcsYesterday,
                },
                at_risk:      atRisk,   // no cap — frontend paginates
                band_overview: bandOverview,
                period_summary: {
                    ia_completed_last_7_days: iaLast7Days,
                    ia_total_students:        instStudentIds.length,
                    mock_completed_this_month: mockThisMonth,
                    mock_total_students:       instStudentIds.length,
                },
            },
        });
    } catch (err) {
        console.error('[InstructorProgress] getBatchDashboardSummary error:', err);
        return res.status(500).json({ success: false, error: 'Internal server error.' });
    }
}

// ─── GET /api/instructor/batches/:batchId/students/:studentId/full-progress ───

export async function getStudentFullProgress(req: AuthRequest, res: Response) {
    try {
        const appUserId  = (req as any).appUserId as string;
        const { batchId, studentId } = req.params;  // studentId = User.id

        // Auth step 1: instructor in batch
        const instructorMembership = await (prisma as any).ielts_batch_instructors.findFirst({
            where: { batch_id: batchId, user_id: appUserId },
        });
        if (!instructorMembership) {
            return res.status(403).json({ success: false, error: 'Forbidden — not assigned to this batch.' });
        }

        // Auth step 2: student in batch
        const studentMembership = await (prisma as any).ielts_batch_students.findFirst({
            where: { batch_id: batchId, user_id: studentId },
        });
        if (!studentMembership) {
            return res.status(403).json({ success: false, error: 'Forbidden — student not in this batch.' });
        }

        // Resolve institute_students record
        const instStudent = await prisma.institute_students.findUnique({
            where:  { user_id: studentId },
            select: { id: true, user_id: true, target_band: true, momentum_score: true, daily_streak: true, isDiagnosed: true },
        });
        if (!instStudent) {
            return res.status(404).json({ success: false, error: 'Student record not found.' });
        }

        const studentUser = await prisma.user.findUnique({
            where:  { id: studentId },
            select: { id: true, name: true, email: true, profileImage: true },
        });

        // ── Date anchors ──────────────────────────────────────────────────────
        const todayStart     = todayStartIST();
        const fourteenDaysAgo = daysBeforeIST(14);
        const thirtyDaysAgo   = daysBeforeIST(30);

        // ── Parallel data fetch ───────────────────────────────────────────────
        const [
            competencyRows,
            iaSessions,
            mockSessions,
            allDrillsLifetime,
            drills30Days,
            lexiGridScores,
        ] = await Promise.all([
            prisma.studentCompetencyMatrix.findMany({
                where: { student_id: instStudent.id },
            }),
            prisma.iASession.findMany({
                where:   { student_id: instStudent.id },
                orderBy: { ia_date: 'desc' },
                select:  {
                    id: true, ia_number: true, ia_date: true, status: true,
                    selected_subskills: true, scores: true, momentum_awarded: true,
                    carry_forward_subskills: true, time_submitted_at: true,
                },
            }),
            prisma.mocksessions.findMany({
                where:   { student_id: instStudent.id },
                orderBy: { created_at: 'desc' },
                select:  {
                    id: true, month_year: true, attempt_type: true, status: true,
                    scores: true, real_band_score: true, momentum_awarded: true,
                    time_submitted_at: true,
                },
            }),
            // All-time drills — for avg_dcs_lifetime
            prisma.drillSession.findMany({
                where:  { student_id: instStudent.id },
                select: { correct_answers: true, total_questions: true, sub_skill: true, created_at: true },
            }),
            // Last 30 days — for calendar + last 14 DCS chart (superset)
            prisma.drillSession.findMany({
                where:  { student_id: instStudent.id, created_at: { gte: thirtyDaysAgo } },
                select: { correct_answers: true, total_questions: true, sub_skill: true, created_at: true },
            }),
            // LexiGrid last 14 days
            (prisma as any).studentGameScore.findMany({
                where: {
                    student_id:   instStudent.id,
                    game_type:    'LEXIGRID',
                    session_date: { gte: fourteenDaysAgo },
                },
                select: { words_solved: true, total_attempts: true, bonus_eligible: true, completed: true },
            }),
        ]);

        // ── avg_dcs_lifetime (single aggregation, reused in ia_eligibility) ──
        const lifetimeCorrect   = allDrillsLifetime.reduce((sum, d) => sum + d.correct_answers, 0);
        const lifetimeQuestions = allDrillsLifetime.reduce((sum, d) => sum + d.total_questions, 0);
        const avgDcsLifetime    = lifetimeQuestions > 0
            ? Math.round((lifetimeCorrect / lifetimeQuestions) * 100)
            : 0;

        // ── drill_stats.last_14_days ─────────────────────────────────────────
        // Build a Map<dateStr, {correct, total}> from the last 14 IST calendar days
        const drillsByDate = new Map<string, { correct: number; total: number }>();
        for (const d of drills30Days) {
            const dateStr = toISTDateString(d.created_at);
            const entry   = drillsByDate.get(dateStr) ?? { correct: 0, total: 0 };
            entry.correct += d.correct_answers;
            entry.total   += d.total_questions;
            drillsByDate.set(dateStr, entry);
        }

        // Generate 14 date entries newest→oldest, fill with null if no drills
        const last14Days: Array<{ date: string; dcs: number | null; count: number }> = [];
        for (let i = 13; i >= 0; i--) {
            const dateStr = toISTDateString(new Date(todayStart.getTime() - i * 24 * 60 * 60 * 1000));
            const entry   = drillsByDate.get(dateStr);
            last14Days.push({
                date:  dateStr,
                dcs:   entry && entry.total > 0 ? Math.round((entry.correct / entry.total) * 100) : null,
                count: entry ? (drills30Days.filter(d => toISTDateString(d.created_at) === dateStr).length) : 0,
            });
        }

        // ── drill_stats.sub_skill_counts ─────────────────────────────────────
        const subSkillMap = new Map<string, { count: number; correct: number; total: number }>();
        for (const d of allDrillsLifetime) {
            const key   = String(d.sub_skill);
            const entry = subSkillMap.get(key) ?? { count: 0, correct: 0, total: 0 };
            entry.count++;
            entry.correct += d.correct_answers;
            entry.total   += d.total_questions;
            subSkillMap.set(key, entry);
        }
        const subSkillCounts = Array.from(subSkillMap.entries())
            .map(([sub_skill, e]) => ({
                sub_skill,
                count:        e.count,
                avg_accuracy: e.total > 0 ? Math.round((e.correct / e.total) * 100) : 0,
            }))
            .sort((a, b) => b.count - a.count);

        // ── streak_calendar — last 30 IST calendar days ──────────────────────
        const activeDates = new Set(drills30Days.map(d => toISTDateString(d.created_at)));
        const streakCalendar: Array<{ date: string; active: boolean }> = [];
        for (let i = 29; i >= 0; i--) {
            const dateStr = toISTDateString(new Date(todayStart.getTime() - i * 24 * 60 * 60 * 1000));
            streakCalendar.push({ date: dateStr, active: activeDates.has(dateStr) });
        }

        // ── LexiGrid stats ────────────────────────────────────────────────────
        const lexiCompleted = (lexiGridScores as any[]).filter(s => s.completed);
        const lexiStats = {
            games_last_14:    lexiCompleted.length,
            avg_words_solved: lexiCompleted.length > 0
                ? Math.round(lexiCompleted.reduce((s: number, g: any) => s + (g.words_solved ?? 0), 0) / lexiCompleted.length * 10) / 10
                : 0,
            bonus_rate: lexiCompleted.length > 0
                ? Math.round(lexiCompleted.filter((g: any) => g.bonus_eligible).length / lexiCompleted.length * 100)
                : 0,
        };

        // ── ia_eligibility (reuses avgDcsLifetime — no second query) ─────────
        const firstDrill    = allDrillsLifetime.length > 0
            ? allDrillsLifetime.sort((a, b) => a.created_at.getTime() - b.created_at.getTime())[0]
            : null;
        const daysSinceFirst = firstDrill
            ? Math.floor((Date.now() - firstDrill.created_at.getTime()) / (24 * 60 * 60 * 1000))
            : 0;
        const prerequisitesMet =
            allDrillsLifetime.length >= 6 &&
            daysSinceFirst >= 2 &&
            avgDcsLifetime >= 40;

        // Next IA date: find first IA slot after today
        let nextIADate: string | null = null;
        if (firstDrill) {
            const firstDrillStr = toISTDateString(firstDrill.created_at);
            const todayStr      = todayISTString();
            for (let n = 1; n <= 60; n++) {
                const [y, m, d] = firstDrillStr.split('-').map(Number);
                const slot = new Date(Date.UTC(y, m - 1, d + n * 3));
                const slotStr = toISTDateString(slot);
                if (slotStr > todayStr) { nextIADate = slotStr; break; }
            }
        }

        // ── Serialize mock real_band_score (Decimal → number) ────────────────
        const serializedMocks = mockSessions.map(s => ({
            ...s,
            real_band_score: s.real_band_score != null ? parseFloat(String(s.real_band_score)) : null,
        }));

        // ── Serialize IA ia_date (Date → string) ─────────────────────────────
        const serializedIAs = iaSessions.map(s => ({
            ...s,
            ia_date: s.ia_date instanceof Date ? s.ia_date.toISOString().split('T')[0] : String(s.ia_date),
        }));

        const current_band = computeCurrentBand(competencyRows);

        return res.json({
            success: true,
            data: {
                student: {
                    id:     studentUser?.id,
                    name:   studentUser?.name ?? 'Unknown',
                    email:  studentUser?.email ?? '',
                    avatar: (studentUser as any)?.profileImage ?? null,
                },
                competency:     competencyRows.map(r => ({ ...r, band_score: parseFloat(String(r.band_score ?? '0')) })),
                target_band:    instStudent.target_band ? parseFloat(String(instStudent.target_band)) : null,
                current_band,
                momentum_score: instStudent.momentum_score,
                daily_streak:   instStudent.daily_streak,
                ia_sessions:    serializedIAs,
                mock_sessions:  serializedMocks,
                drill_stats: {
                    last_14_days:        last14Days,
                    sub_skill_counts:    subSkillCounts,
                    streak_calendar:     streakCalendar,
                    total_drills_all_time: allDrillsLifetime.length,
                    avg_dcs_lifetime:    avgDcsLifetime,
                },
                lexigrid_stats: lexiStats,
                ia_eligibility: {
                    prerequisites_met: prerequisitesMet,
                    avg_dcs:           avgDcsLifetime,   // reused — no second query
                    drills_completed:  allDrillsLifetime.length,
                    next_ia_date:      nextIADate,
                },
            },
        });
    } catch (err) {
        console.error('[InstructorProgress] getStudentFullProgress error:', err);
        return res.status(500).json({ success: false, error: 'Internal server error.' });
    }
}

// ─── GET /api/instructor/batches/:batchId/assessment-overview ─────────────────

export async function getBatchAssessmentOverview(req: AuthRequest, res: Response) {
    try {
        const appUserId = (req as any).appUserId as string;
        const { batchId } = req.params;

        const resolved = await resolveBatchStudents(res, appUserId, batchId);
        if (!resolved) return;
        const { instStudents, instStudentIds, userIds } = resolved;

        const users = await prisma.user.findMany({
            where:  { id: { in: userIds } },
            select: { id: true, name: true, profileImage: true },
        });
        const userById   = new Map(users.map(u => [u.id, u]));
        const userByInstId = new Map(instStudents.map(s => [s.id, userById.get(s.user_id)]));

        if (instStudentIds.length === 0) {
            return res.json({
                success: true,
                data: {
                    ia_overview: [],
                    mock_overview: [],
                    diagnostic_overview: [],
                    batch_ia_summary:   { avg_band: 0, completion_rate: 0, high_miss_count: 0 },
                    batch_mock_summary: { avg_real_band: 0, at_or_above_target: 0, no_mock_yet: 0 },
                },
            });
        }

        // ── Parallel fetch ────────────────────────────────────────────────────
        const [allIASessions, allMockSessions, diagnosticHistory, drillAggregates] = await Promise.all([
            prisma.iASession.findMany({
                where:  { student_id: { in: instStudentIds } },
                select: { student_id: true, status: true, ia_date: true, scores: true, time_submitted_at: true },
            }),
            prisma.mocksessions.findMany({
                where:  { student_id: { in: instStudentIds } },
                select: { student_id: true, status: true, real_band_score: true, time_submitted_at: true },
                orderBy: { created_at: 'desc' },
            }),
            // Diagnostic baseline: oldest entry per skill per student (mode = DIAGNOSTIC)
            prisma.assessmentHistory.findMany({
                where:   { student_id: { in: instStudentIds }, mode: 'DIAGNOSTIC' as any },
                orderBy: { created_at: 'asc' },
                select:  { student_id: true, skill: true, band_score: true, created_at: true },
            }),
            // Drill aggregates per student — for ia_eligible computation
            prisma.drillSession.groupBy({
                by:    ['student_id'],
                where: { student_id: { in: instStudentIds } },
                _count: { id: true },
                _sum:   { correct_answers: true, total_questions: true },
                _min:   { created_at: true },
            }),
        ]);

        // ── IA per-student aggregation ────────────────────────────────────────
        type IARow = { completed: number; missed: number; allBands: number[]; lastDate: string | null; lastBand: number | null };
        const iaMap = new Map<string, IARow>();

        for (const sid of instStudentIds) {
            iaMap.set(sid, { completed: 0, missed: 0, allBands: [], lastDate: null, lastBand: null });
        }

        // Sort by date ascending so "last" is set correctly
        const sortedIAs = [...allIASessions].sort(
            (a, b) => new Date(a.ia_date).getTime() - new Date(b.ia_date).getTime()
        );

        for (const ia of sortedIAs) {
            const row = iaMap.get(ia.student_id);
            if (!row) continue;
            if (ia.status === 'COMPLETED') {
                row.completed++;
                const band = avgBandFromScores(ia.scores);
                if (band > 0) {
                    row.allBands.push(band);
                    row.lastBand = band;
                }
                row.lastDate = ia.ia_date instanceof Date
                    ? ia.ia_date.toISOString().split('T')[0]
                    : String(ia.ia_date);
            } else if (ia.status === 'MISSED') {
                row.missed++;
            }
        }

        // ── Mock per-student aggregation ──────────────────────────────────────
        type MockRow = { count: number; latestBand: number | null; bestBand: number | null };
        const mockMap = new Map<string, MockRow>();
        for (const sid of instStudentIds) mockMap.set(sid, { count: 0, latestBand: null, bestBand: null });

        for (const mock of allMockSessions) {
            if (mock.status !== 'COMPLETED') continue;
            const row  = mockMap.get(mock.student_id);
            if (!row) continue;
            const band = mock.real_band_score != null ? parseFloat(String(mock.real_band_score)) : null;
            row.count++;
            if (band !== null) {
                if (row.latestBand === null) row.latestBand = band;   // first = latest (sorted desc)
                if (row.bestBand === null || band > row.bestBand) row.bestBand = band;
            }
        }

        // ── Diagnostic per-student: first entry per skill ─────────────────────
        type DiagRow = { isDiagnosed: boolean; bands: Record<string, number | null>; diagnosedAt: string | null };
        const diagMap = new Map<string, DiagRow>();
        for (const s of instStudents) {
            diagMap.set(s.id, { isDiagnosed: s.isDiagnosed, bands: { L: null, R: null, W: null, S: null }, diagnosedAt: null });
        }

        const skillKey: Record<string, string> = {
            LISTENING: 'L', READING: 'R', WRITING: 'W', SPEAKING: 'S'
        };
        const seenDiag = new Set<string>(); // "studentId:skill"

        for (const entry of diagnosticHistory) {
            const key = `${entry.student_id}:${entry.skill}`;
            if (seenDiag.has(key)) continue;
            seenDiag.add(key);
            const row = diagMap.get(entry.student_id);
            if (!row) continue;
            const abbr = skillKey[String(entry.skill)] ?? String(entry.skill);
            row.bands[abbr] = parseFloat(String(entry.band_score));
            if (!row.diagnosedAt) {
                row.diagnosedAt = entry.created_at instanceof Date
                    ? entry.created_at.toISOString().split('T')[0]
                    : String(entry.created_at);
            }
        }

        // ── Build drill eligibility lookup ────────────────────────────────────
        const nowMs = Date.now();
        const drillEligibleById = new Map<string, boolean>();
        for (const agg of drillAggregates) {
            const drillCount  = (agg._count as any).id as number;
            const firstDrillAt: Date | null = (agg._min as any).created_at;
            const daysSince    = firstDrillAt
                ? Math.floor((nowMs - firstDrillAt.getTime()) / (24 * 60 * 60 * 1000))
                : 0;
            const correct   = (agg._sum as any).correct_answers as number ?? 0;
            const total     = (agg._sum as any).total_questions as number ?? 0;
            const avgDcs    = total > 0 ? (correct / total) * 100 : 0;
            drillEligibleById.set(
                agg.student_id,
                drillCount >= 6 && daysSince >= 2 && avgDcs >= 40
            );
        }

        // ── Build output arrays ───────────────────────────────────────────────
        const iaOverview = instStudents.map(s => {
            const user = userByInstId.get(s.id);
            const row  = iaMap.get(s.id)!;
            const avg  = row.allBands.length > 0
                ? Math.round(row.allBands.reduce((a, b) => a + b, 0) / row.allBands.length * 10) / 10
                : null;
            const best = row.allBands.length > 0 ? Math.round(Math.max(...row.allBands) * 10) / 10 : null;
            return {
                student_id:   s.id,
                name:         user?.name ?? 'Unknown',
                avatar:       (user as any)?.profileImage ?? null,
                ia_completed: row.completed,
                ia_missed:    row.missed,
                last_ia_band: row.lastBand,
                best_ia_band: best,
                avg_ia_band:  avg,
                last_ia_date: row.lastDate,
                ia_eligible:  drillEligibleById.get(s.id) ?? false,
            };
        });

        const mockOverview = instStudents.map(s => {
            const user = userByInstId.get(s.id);
            const row  = mockMap.get(s.id)!;
            return {
                student_id:       s.id,
                name:             user?.name ?? 'Unknown',
                avatar:           (user as any)?.profileImage ?? null,
                mock_count:       row.count,
                latest_real_band: row.latestBand,
                best_real_band:   row.bestBand,
                target_band:      s.target_band ? parseFloat(String(s.target_band)) : null,
            };
        });

        const diagnosticOverview = instStudents.map(s => {
            const user = userByInstId.get(s.id);
            const row  = diagMap.get(s.id)!;
            return {
                student_id:    s.id,
                name:          user?.name ?? 'Unknown',
                avatar:        (user as any)?.profileImage ?? null,
                is_diagnosed:  row.isDiagnosed,
                baseline_bands: row.bands,
                diagnosed_at:  row.diagnosedAt,
            };
        });

        // Sort diagnostics: non-diagnosed first
        diagnosticOverview.sort((a, b) => Number(a.is_diagnosed) - Number(b.is_diagnosed));

        // ── Batch-level summaries ─────────────────────────────────────────────
        const allAvgBands   = iaOverview.map(r => r.avg_ia_band).filter((v): v is number => v !== null);
        const batchIAAvg    = allAvgBands.length > 0
            ? Math.round(allAvgBands.reduce((a, b) => a + b, 0) / allAvgBands.length * 10) / 10
            : 0;
        const completedAny  = iaOverview.filter(r => r.ia_completed > 0).length;
        const highMissCount = iaOverview.filter(r => r.ia_missed >= 2).length;

        const allRealBands  = mockOverview.map(r => r.latest_real_band).filter((v): v is number => v !== null);
        const batchMockAvg  = allRealBands.length > 0
            ? Math.round(allRealBands.reduce((a, b) => a + b, 0) / allRealBands.length * 10) / 10
            : 0;
        const atOrAbove     = mockOverview.filter(r =>
            r.latest_real_band !== null &&
            r.target_band !== null &&
            r.latest_real_band >= r.target_band
        ).length;
        const noMockYet     = mockOverview.filter(r => r.mock_count === 0).length;

        return res.json({
            success: true,
            data: {
                ia_overview:         iaOverview,
                mock_overview:       mockOverview,
                diagnostic_overview: diagnosticOverview,
                batch_ia_summary: {
                    avg_band:         batchIAAvg,
                    completion_rate:  instStudentIds.length > 0
                        ? Math.round(completedAny / instStudentIds.length * 100)
                        : 0,
                    high_miss_count:  highMissCount,
                },
                batch_mock_summary: {
                    avg_real_band:     batchMockAvg,
                    at_or_above_target: atOrAbove,
                    no_mock_yet:       noMockYet,
                },
            },
        });
    } catch (err) {
        console.error('[InstructorProgress] getBatchAssessmentOverview error:', err);
        return res.status(500).json({ success: false, error: 'Internal server error.' });
    }
}

