/**
 * batchDashboardQueries.ts
 *
 * Shared, controller-agnostic function that computes the batch dashboard summary.
 * Used by both the instructor controller (after instructor-membership auth check)
 * and the institute-owner controller (after institute-membership auth check).
 *
 * The output shape is bit-for-bit identical to what the instructor endpoint
 * previously computed inline.
 */

import prisma from './prisma';
import { todayStartIST } from './timezone';

// ─── Re-exported IST helpers (consumed by owner controller too) ───────────────

export const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;

/** YYYY-MM-DD string for any UTC Date, evaluated in IST. */
export function toISTDateString(d: Date): string {
    const ist = new Date(d.getTime() + IST_OFFSET_MS);
    return [
        ist.getUTCFullYear(),
        String(ist.getUTCMonth() + 1).padStart(2, '0'),
        String(ist.getUTCDate()).padStart(2, '0'),
    ].join('-');
}

/** Current IST calendar date as "YYYY-MM-DD". */
export function todayISTString(): string {
    return toISTDateString(new Date());
}

/** Subtract N whole IST calendar days from todayStart. */
export function daysBeforeIST(n: number): Date {
    return new Date(todayStartIST().getTime() - n * 24 * 60 * 60 * 1000);
}

/** Mean of all scores in a COMPLETED IA session's scores JSON. */
export function avgBandFromScores(scores: unknown): number {
    const arr = (scores as Array<{ band?: number }> | null) ?? [];
    const bands = arr.map(s => s.band ?? 0).filter(b => b > 0);
    return bands.length > 0 ? bands.reduce((a, b) => a + b, 0) / bands.length : 0;
}

/**
 * Compute band_trend from the last 2 COMPLETED IA sessions.
 * Returns null when < 2 completed IAs exist.
 * Threshold: 0.25 to avoid noise from IELTS 0.5-rounding.
 */
export function computeBandTrend(
    last2: Array<{ scores: unknown }>
): 'up' | 'flat' | 'down' | null {
    if (last2.length < 2) return null;
    const [newer, older] = last2.map(ia => avgBandFromScores(ia.scores));
    if (newer > older + 0.25) return 'up';
    if (newer < older - 0.25) return 'down';
    return 'flat';
}

/** Current band from competency matrix: mean of non-zero band_scores, rounded to 0.5. */
export function computeCurrentBand(
    rows: Array<{ band_score: unknown }>
): number | null {
    const valid = rows
        .map(r => parseFloat(String(r.band_score ?? '0')))
        .filter(v => !isNaN(v) && v > 0);
    if (valid.length === 0) return null;
    const mean = valid.reduce((a, b) => a + b, 0) / valid.length;
    return Math.round(mean * 2) / 2;
}

// ─── Shared input types ───────────────────────────────────────────────────────

export interface InstStudentRow {
    id: string;
    user_id: string;
    target_band: number | null;
    momentum_score: number;
    daily_streak: number;
    isDiagnosed: boolean;
    last_streak_date: Date | null;
}

export interface UserRow {
    id: string;
    name: string | null;
    profileImage: string | null;
}

export interface DashboardSummary {
    engagement_today: {
        active_students: number;
        avg_dcs: number;
        streaks_alive: number;
        platform_unlocked: number;
        active_yesterday: number;
        avg_dcs_yesterday: number;
    };
    at_risk: Array<{
        student_id: string;
        user_id: string;
        name: string;
        avatar: string | null;
        flags: string[];
        primary_flag: string;
        days_inactive: number;
        missed_ia_count: number;
        current_band: number | null;
    }>;
    band_overview: Array<{
        student_id: string;
        user_id: string;
        name: string;
        avatar: string | null;
        current_band: number | null;
        target_band: number | null;
        gap: number | null;
        last_ia_date: string | null;
        band_trend: 'up' | 'flat' | 'down' | null;
        drilled_today: boolean;
        drills_count_today: number;
        streak: number;
        lexigrid_done_today: boolean;
        lexigrid_words_today: number | null;
        is_at_risk: boolean;
        risk_primary_flag: string | null;
    }>;
    period_summary: {
        ia_completed_last_7_days: number;
        ia_total_students: number;
        mock_completed_this_month: number;
        mock_total_students: number;
    };
}

// ─── Core computation (no auth, no HTTP) ─────────────────────────────────────

/**
 * Runs all parallel queries and computes the batch dashboard summary.
 * Callers must pass instStudentIds, instStudents, and a userById map
 * (keyed by User.id, not institute_student.id).
 *
 * Returns the empty-batch shape when instStudentIds is empty.
 */
export async function computeBatchDashboard(
    instStudentIds: string[],
    instStudents: InstStudentRow[],
    userById: Map<string, UserRow>
): Promise<DashboardSummary> {
    // Map instStudent.id → User for downstream use
    const userByInstId = new Map(
        instStudents.map(s => [s.id, userById.get(s.user_id)])
    );

    if (instStudentIds.length === 0) {
        return {
            engagement_today: { active_students: 0, avg_dcs: 0, streaks_alive: 0, platform_unlocked: 0, active_yesterday: 0, avg_dcs_yesterday: 0 },
            at_risk: [],
            band_overview: [],
            period_summary: { ia_completed_last_7_days: 0, ia_total_students: 0, mock_completed_this_month: 0, mock_total_students: 0 },
        };
    }

    // ── Date anchors (all IST) ────────────────────────────────────────────
    const todayStart      = todayStartIST();
    const yesterdayStart  = daysBeforeIST(1);
    const sevenDaysAgo    = daysBeforeIST(7);
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
        // today's completed drills (for active/DCS/unlocked counts — STARTED excluded)
        prisma.drillSession.findMany({
            where: { student_id: { in: instStudentIds }, status: { in: ['DRILL_DONE', 'APPLY_DONE'] as any[] }, created_at: { gte: todayStart } },
            select: { student_id: true, correct_answers: true, total_questions: true },
        }),
        // yesterday's completed drills (for trend arrows — STARTED excluded)
        prisma.drillSession.findMany({
            where: { student_id: { in: instStudentIds }, status: { in: ['DRILL_DONE', 'APPLY_DONE'] as any[] }, created_at: { gte: yesterdayStart, lt: todayStart } },
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
        // session_date is a DATE column (stores IST date) — Postgres casts DATE to TIMESTAMPTZ
        // at midnight UTC when comparing, so new Date(todayISTString()) = "YYYY-MM-DDT00:00:00Z"
        // gives an exact DATE match without the IST drift that a raw TIMESTAMPTZ range would cause.
        (prisma as any).studentGameScore.findMany({
            where: {
                student_id:   { in: instStudentIds },
                game_type:    'LEXIGRID',
                session_date: new Date(todayISTString()),
            },
            select: { student_id: true, completed: true, words_solved: true },
        }),
    ]);

    // ── Engagement today ─────────────────────────────────────────────────
    const todayDrillsByStudent = new Map<string, typeof todayDrills>();
    for (const d of todayDrills) {
        const arr = todayDrillsByStudent.get(d.student_id) ?? [];
        arr.push(d);
        todayDrillsByStudent.set(d.student_id, arr);
    }

    let totalCorrectToday = 0, totalQuestionsToday = 0;
    let activeTodayCount = 0, unlockedTodayCount = 0;
    for (const [, drills] of todayDrillsByStudent) {
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

    // Recent IA data: last 2 per student + last ia_date
    const lastIAByStudentId = new Map<string, Date | null>();
    const recentIAsByStudent = new Map<string, typeof recentCompletedIAs>();
    for (const ia of recentCompletedIAs) {
        const arr = recentIAsByStudent.get(ia.student_id) ?? [];
        if (arr.length < 2) arr.push(ia);
        recentIAsByStudent.set(ia.student_id, arr);
        if (!lastIAByStudentId.has(ia.student_id)) {
            lastIAByStudentId.set(ia.student_id, ia.ia_date instanceof Date ? ia.ia_date : new Date(ia.ia_date as any));
        }
    }

    // LexiGrid lookup: student_id → { done, words }
    const lexiByStudentId = new Map<string, { done: boolean; words: number }>();
    for (const l of (lexigridToday as any[])) {
        lexiByStudentId.set(l.student_id, { done: l.completed, words: l.words_solved ?? 0 });
    }

    const nowMs = Date.now();

    // ── at_risk list ──────────────────────────────────────────────────────
    const atRisk: DashboardSummary['at_risk'] = [];

    for (const s of instStudents) {
        const flags: string[] = [];
        const user         = userByInstId.get(s.id);
        const missedCount  = missedCountByStudentId.get(s.id) ?? 0;
        const lastDrill    = lastDrillByStudentId.get(s.id) ?? null;
        const daysInactive = lastDrill
            ? Math.floor((nowMs - lastDrill.getTime()) / (24 * 60 * 60 * 1000))
            : -1;

        if (!s.isDiagnosed)                              flags.push('Not yet diagnosed');
        if (daysInactive === -1)                         flags.push('Never drilled');
        else if (daysInactive >= 3)                      flags.push(`No activity for ${daysInactive} day${daysInactive !== 1 ? 's' : ''}`);
        if (missedCount >= 2)                            flags.push(`Missed ${missedCount} internal assessments`);
        if (s.daily_streak === 0 && daysInactive !== -1 && daysInactive > 1) flags.push('Streak broken');
        if (s.momentum_score < 100)                      flags.push('Low momentum');

        const last2IAs = recentIAsByStudent.get(s.id) ?? [];
        if (computeBandTrend(last2IAs) === 'down') flags.push('Band score declining');

        if (flags.length === 0) continue;

        const competency   = competencyByStudentId.get(s.id) ?? [];
        const current_band = computeCurrentBand(competency);

        atRisk.push({
            student_id:      s.id,
            user_id:         s.user_id,
            name:            user?.name ?? 'Unknown',
            avatar:          (user as any)?.profileImage ?? null,
            flags,
            primary_flag:    flags[0],
            days_inactive:   daysInactive,
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

    const atRiskById = new Map(atRisk.map(r => [r.student_id, r]));

    // ── band_overview ─────────────────────────────────────────────────────
    const bandOverview: DashboardSummary['band_overview'] = instStudents.map(s => {
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
            student_id:           s.id,
            user_id:              s.user_id,
            name:                 user?.name ?? 'Unknown',
            avatar:               (user as any)?.profileImage ?? null,
            current_band,
            target_band,
            gap,
            last_ia_date:         lastIADate ? lastIADate.toISOString().split('T')[0] : null,
            band_trend:           computeBandTrend(last2IAs),
            drilled_today:        drillsToday.length > 0,
            drills_count_today:   drillsToday.length,
            streak:               s.daily_streak,
            lexigrid_done_today:  lexi?.done ?? false,
            lexigrid_words_today: lexi?.words ?? null,
            is_at_risk:           riskEntry !== null,
            risk_primary_flag:    riskEntry?.primary_flag ?? null,
        };
    });

    // Sort by gap descending (widest gap first), nulls last
    bandOverview.sort((a, b) => {
        if (a.gap === null && b.gap === null) return 0;
        if (a.gap === null) return 1;
        if (b.gap === null) return -1;
        return b.gap - a.gap;
    });

    return {
        engagement_today: {
            active_students:   activeTodayCount,
            avg_dcs:           avgDcsToday,
            streaks_alive:     streaksAlive,
            platform_unlocked: unlockedTodayCount,
            active_yesterday:  yesterdayStudents.size,
            avg_dcs_yesterday: avgDcsYesterday,
        },
        at_risk:      atRisk,
        band_overview: bandOverview,
        period_summary: {
            ia_completed_last_7_days: iaLast7Days,
            ia_total_students:        instStudentIds.length,
            mock_completed_this_month: mockThisMonth,
            mock_total_students:       instStudentIds.length,
        },
    };
}
