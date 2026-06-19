/**
 * studentProgressQueries.ts
 *
 * Shared, controller-agnostic function that computes the full progress view
 * for a single student. Used by both the instructor controller and the
 * institute-owner controller (after their respective auth checks).
 *
 * The output shape is bit-for-bit identical to what the instructor endpoint
 * previously computed inline.
 */

import prisma from './prisma';
import { todayStartIST } from './timezone';
import {
    toISTDateString,
    todayISTString,
    daysBeforeIST,
    computeCurrentBand,
    avgBandFromScores,
} from './batchDashboardQueries';

// ─── Input shapes ─────────────────────────────────────────────────────────────

export interface InstStudentMinimal {
    id: string;
    user_id: string;
    target_band: number | null;
    momentum_score: number;
    daily_streak: number;
    isDiagnosed: boolean;
}

export interface StudentUserRow {
    id: string;
    name: string | null;
    email: string;
    profileImage: string | null;
}

// ─── Core computation ────────────────────────────────────────────────────────

/**
 * Fetches and computes the full progress view for a single student.
 * Authentication (instructor / owner membership) must be verified before calling.
 */
export async function computeStudentFullProgress(
    instStudent: InstStudentMinimal,
    studentUser: StudentUserRow | null
): Promise<object> {
    // ── Date anchors ──────────────────────────────────────────────────────
    const todayStart      = todayStartIST();
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
        // All-time drills — for avg_dcs_lifetime + sub-skill breakdown
        prisma.drillSession.findMany({
            where:  { student_id: instStudent.id },
            select: { correct_answers: true, total_questions: true, skill: true, sub_skill: true, created_at: true },
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

    // ── avg_dcs_lifetime ──────────────────────────────────────────────────
    const lifetimeCorrect   = allDrillsLifetime.reduce((sum, d) => sum + d.correct_answers, 0);
    const lifetimeQuestions = allDrillsLifetime.reduce((sum, d) => sum + d.total_questions, 0);
    const avgDcsLifetime    = lifetimeQuestions > 0
        ? Math.round((lifetimeCorrect / lifetimeQuestions) * 100)
        : 0;

    // ── drill_stats.last_14_days ─────────────────────────────────────────
    const drillsByDate = new Map<string, { correct: number; total: number }>();
    for (const d of drills30Days) {
        const dateStr = toISTDateString(d.created_at);
        const entry   = drillsByDate.get(dateStr) ?? { correct: 0, total: 0 };
        entry.correct += d.correct_answers;
        entry.total   += d.total_questions;
        drillsByDate.set(dateStr, entry);
    }

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
    const subSkillMap = new Map<string, { skill: string; sub_skill: string; count: number; correct: number; total: number }>();
    for (const d of allDrillsLifetime) {
        const key   = `${String(d.skill)}::${String(d.sub_skill)}`;
        const entry = subSkillMap.get(key) ?? { skill: String(d.skill), sub_skill: String(d.sub_skill), count: 0, correct: 0, total: 0 };
        entry.count++;
        entry.correct += d.correct_answers;
        entry.total   += d.total_questions;
        subSkillMap.set(key, entry);
    }
    const subSkillCounts = Array.from(subSkillMap.values())
        .map(e => ({
            skill:        e.skill,
            sub_skill:    e.sub_skill,
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

    // ── ia_eligibility ────────────────────────────────────────────────────
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

    return {
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
            last_14_days:          last14Days,
            sub_skill_counts:      subSkillCounts,
            streak_calendar:       streakCalendar,
            total_drills_all_time: allDrillsLifetime.length,
            avg_dcs_lifetime:      avgDcsLifetime,
        },
        lexigrid_stats: lexiStats,
        ia_eligibility: {
            prerequisites_met: prerequisitesMet,
            avg_dcs:           avgDcsLifetime,
            drills_completed:  allDrillsLifetime.length,
            next_ia_date:      nextIADate,
        },
    };
}
