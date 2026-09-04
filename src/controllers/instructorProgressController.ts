/**
 * Instructor Progress Controller
 *
 * Three read-only endpoints that aggregate the NEW system data
 * (IASession, mocksessions, DrillSession, StudentCompetencyMatrix, etc.)
 * for the instructor dashboard.
 *
 * All "today" / date boundaries use todayStartIST() from lib/timezone â€”
 * never new Date() or UTC midnight â€” because the platform is India-only.
 *
 * Authorization pattern for every endpoint:
 *   1. Verify instructor is assigned to the batch (batch_instructors)
 *   2. For student-scoped endpoints: also verify student is in the batch
 *
 * Zero N+1 queries â€” all per-student aggregation is done with a single
 * IN-clause query followed by in-memory grouping.
 */

import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import prisma from '../lib/prisma';
import { todayStartIST } from '../lib/timezone';
import { computeBatchDashboard, avgBandFromScores } from '../lib/batchDashboardQueries';
import { computeStudentFullProgress } from '../lib/studentProgressQueries';
import { paramStr } from '../utils/httpParams';

// â”€â”€â”€ Shared auth helper â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

/**
 * Resolves the batch â†’ students data needed by all three endpoints.
 * Returns null and sends a 403 if the instructor is not in the batch.
 *
 * Returned:
 *   instStudents  â€” institute_students rows (with user_id for joining User data)
 *   instStudentIds â€” the PKs used in IASession, DrillSession, etc.
 *   userIds        â€” User.id list for the batch students
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
        exam_id: string;
    }>;
    instStudentIds: string[];
    userIds: string[];
} | null> {
    // 1. Verify instructor membership
    const membership = await prisma.batchInstructor.findFirst({
        where: { batch_id: batchId, user_id: appUserId },
    });
    if (!membership) {
        res.status(403).json({ success: false, error: 'Forbidden â€” not assigned to this batch.' });
        return null;
    }

    // 2. Get all students enrolled in the batch
    const batchStudentLinks: Array<{ user_id: string }> =
        await prisma.batchStudent.findMany({
            where: { batch_id: batchId },
            select: { user_id: true },
        });
    const userIds = batchStudentLinks.map((s: any) => s.user_id);

    if (userIds.length === 0) {
        return { instStudents: [], instStudentIds: [], userIds: [] };
    }

    // 3. Resolve institute_students PKs (the FK used in all learning tables)
    const instStudents = await prisma.instituteStudent.findMany({
        where: { user_id: { in: userIds } },
        select: {
            id: true,
            user_id: true,
            target_band: true,
            momentum_score: true,
            daily_streak: true,
            isDiagnosed: true,
            last_streak_date: true,
            exam_id: true,
        },
    });

    return {
        instStudents,
        instStudentIds: instStudents.map(s => s.id),
        userIds,
    };
}

// â”€â”€â”€ GET /api/instructor/batches/:batchId/dashboard-summary â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export async function getBatchDashboardSummary(req: AuthRequest, res: Response) {
    try {
        const appUserId = (req as any).appUserId as string;
        const batchId = paramStr(req.params.batchId);

        const resolved = await resolveBatchStudents(res, appUserId, batchId);
        if (!resolved) return;
        const { instStudents, instStudentIds, userIds } = resolved;

        // Fetch User names/avatars for display
        const users = await prisma.user.findMany({
            where: { id: { in: userIds } },
            select: { id: true, name: true, profileImage: true },
        });
        const userById = new Map(users.map(u => [u.id, u]));

        const data = await computeBatchDashboard(instStudentIds, instStudents, userById);

        return res.json({ success: true, data });
    } catch (err) {
        console.error('[InstructorProgress] getBatchDashboardSummary error:', err);
        return res.status(500).json({ success: false, error: 'Internal server error.' });
    }
}

// â”€â”€â”€ GET /api/instructor/batches/:batchId/students/:studentId/full-progress â”€â”€â”€

export async function getStudentFullProgress(req: AuthRequest, res: Response) {
    try {
        const appUserId  = (req as any).appUserId as string;
        const batchId = paramStr(req.params.batchId);
        const studentId = paramStr(req.params.studentId);  // studentId = User.id

        // Auth step 1: instructor in batch
        const instructorMembership = await prisma.batchInstructor.findFirst({
            where: { batch_id: batchId, user_id: appUserId },
        });
        if (!instructorMembership) {
            return res.status(403).json({ success: false, error: 'Forbidden â€” not assigned to this batch.' });
        }

        // Auth step 2: student in batch
        const studentMembership = await prisma.batchStudent.findFirst({
            where: { batch_id: batchId, user_id: studentId },
        });
        if (!studentMembership) {
            return res.status(403).json({ success: false, error: 'Forbidden â€” student not in this batch.' });
        }

        // Resolve institute_students record
        const instStudent = await prisma.instituteStudent.findUnique({
            where:  { user_id: studentId },
            select: { id: true, user_id: true, target_band: true, momentum_score: true, daily_streak: true, isDiagnosed: true, exam_date: true, exam_id: true },
        });
        if (!instStudent) {
            return res.status(404).json({ success: false, error: 'Student record not found.' });
        }

        const studentUser = await prisma.user.findUnique({
            where:  { id: studentId },
            select: { id: true, name: true, email: true, profileImage: true },
        });

        const data = await computeStudentFullProgress(instStudent, studentUser);

        return res.json({ success: true, data });
    } catch (err) {
        console.error('[InstructorProgress] getStudentFullProgress error:', err);
        return res.status(500).json({ success: false, error: 'Internal server error.' });
    }
}

// â”€â”€â”€ GET /api/instructor/batches/:batchId/assessment-overview â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export async function getBatchAssessmentOverview(req: AuthRequest, res: Response) {
    try {
        const appUserId = (req as any).appUserId as string;
        const batchId = paramStr(req.params.batchId);

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

        // â”€â”€ Parallel fetch â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
        const [allIASessions, allMockSessions, diagnosticHistory, drillAggregates] = await Promise.all([
            prisma.iASession.findMany({
                where:  { student_id: { in: instStudentIds } },
                select: { student_id: true, status: true, ia_date: true, scores: true, time_submitted_at: true },
            }),
            prisma.mockSession.findMany({
                where:  { student_id: { in: instStudentIds } },
                select: { student_id: true, status: true, real_band_score: true, time_submitted_at: true },
                orderBy: { created_at: 'desc' },
            }),
            // Diagnostic baseline: oldest entry per skill per student (mode = DIAGNOSTIC)
            // sub_scores is selected alongside band_score so a Spoken English row's
            // full CEFR sub-skill profile (cefrLabel + per-skill breakdown) is
            // available here too, not just the compact 0-6 ordinal band_score is
            // reduced to. See DiagnosticOverviewRow.sub_scores.
            prisma.assessmentHistory.findMany({
                where:   { student_id: { in: instStudentIds }, mode: 'DIAGNOSTIC' as any },
                orderBy: { created_at: 'asc' },
                select:  { student_id: true, skill: true, band_score: true, sub_scores: true, created_at: true },
            }),
            // Drill aggregates per student â€” for ia_eligible computation
            prisma.drillSession.groupBy({
                by:    ['student_id'],
                where: { student_id: { in: instStudentIds } },
                _count: { id: true },
                _sum:   { correct_answers: true, total_questions: true },
                _min:   { created_at: true },
            }),
        ]);

        // â”€â”€ IA per-student aggregation â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
        type IARow = { completed: number; missed: number; allBands: number[]; lastDate: string | null; lastBand: number | null };
        const iaMap = new Map<string, IARow>();

        for (const sid of instStudentIds) {
            iaMap.set(sid, { completed: 0, missed: 0, allBands: [], lastDate: null, lastBand: null });
        }

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

        // â”€â”€ Mock per-student aggregation â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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
                if (row.latestBand === null) row.latestBand = band;
                if (row.bestBand === null || band > row.bestBand) row.bestBand = band;
            }
        }

        // â”€â”€ Diagnostic per-student: first entry per skill â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
        type DiagRow = { isDiagnosed: boolean; bands: Record<string, number | null>; diagnosedAt: string | null; subScores: unknown | null };
        const diagMap = new Map<string, DiagRow>();
        for (const s of instStudents) {
            diagMap.set(s.id, { isDiagnosed: s.isDiagnosed, bands: { L: null, R: null, W: null, S: null }, diagnosedAt: null, subScores: null });
        }

        const skillKey: Record<string, string> = {
            LISTENING: 'L', READING: 'R', WRITING: 'W', SPEAKING: 'S'
        };
        const seenDiag = new Set<string>();

        for (const entry of diagnosticHistory) {
            const key = `${entry.student_id}:${entry.skill}`;
            if (seenDiag.has(key)) continue;
            seenDiag.add(key);
            const row = diagMap.get(entry.student_id);
            if (!row) continue;
            const abbr = skillKey[String(entry.skill)] ?? String(entry.skill);
            row.bands[abbr] = parseFloat(String(entry.band_score));
            // sub_scores only carries a real profile on the Speaking entry today
            // (Spoken English has one skill; IELTS's Speaking sub_scores, if any,
            // isn't a CEFR profile) â€” captured here regardless of skill so the row
            // stays generic if that changes.
            if (entry.sub_scores != null) row.subScores = entry.sub_scores;
            if (!row.diagnosedAt) {
                row.diagnosedAt = entry.created_at instanceof Date
                    ? entry.created_at.toISOString().split('T')[0]
                    : String(entry.created_at);
            }
        }

        // â”€â”€ Build drill eligibility lookup â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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

        // â”€â”€ Build output arrays â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
        const iaOverview = instStudents.map(s => {
            const user = userByInstId.get(s.id);
            const row  = iaMap.get(s.id)!;
            const avg  = row.allBands.length > 0
                ? Math.round(row.allBands.reduce((a, b) => a + b, 0) / row.allBands.length * 10) / 10
                : null;
            const best = row.allBands.length > 0 ? Math.round(Math.max(...row.allBands) * 10) / 10 : null;
            return {
                student_id:   s.id,
                user_id:      s.user_id,
                name:         user?.name ?? 'Unknown',
                avatar:       (user as any)?.profileImage ?? null,
                ia_completed: row.completed,
                ia_missed:    row.missed,
                last_ia_band: row.lastBand,
                best_ia_band: best,
                avg_ia_band:  avg,
                last_ia_date: row.lastDate,
                ia_eligible:  drillEligibleById.get(s.id) ?? false,
                exam_id:      s.exam_id,
            };
        });

        const mockOverview = instStudents.map(s => {
            const user = userByInstId.get(s.id);
            const row  = mockMap.get(s.id)!;
            return {
                student_id:       s.id,
                user_id:          s.user_id,
                name:             user?.name ?? 'Unknown',
                avatar:           (user as any)?.profileImage ?? null,
                mock_count:       row.count,
                latest_real_band: row.latestBand,
                best_real_band:   row.bestBand,
                target_band:      s.target_band ? parseFloat(String(s.target_band)) : null,
                exam_id:          s.exam_id,
            };
        });

        const diagnosticOverview = instStudents.map(s => {
            const user = userByInstId.get(s.id);
            const row  = diagMap.get(s.id)!;
            return {
                student_id:    s.id,
                user_id:       s.user_id,
                name:          user?.name ?? 'Unknown',
                avatar:        (user as any)?.profileImage ?? null,
                is_diagnosed:  row.isDiagnosed,
                baseline_bands: row.bands,
                diagnosed_at:  row.diagnosedAt,
                sub_scores:    row.subScores,
            };
        });

        diagnosticOverview.sort((a, b) => Number(a.is_diagnosed) - Number(b.is_diagnosed));

        // â”€â”€ Batch-level summaries â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
        // avg_band here is an IELTS 0-9 band average â€” a Spoken English row's
        // avg_ia_band/latest_real_band is a CEFR ordinal (0-6) stamped into the same
        // numeric column, so it's excluded from both averages below. completedAny/
        // highMissCount/mock counts are exam-agnostic (they count sessions, not
        // score values) and stay blended.
        const ieltsIaOverview   = iaOverview.filter(r => r.exam_id !== 'spoken_english');
        const ieltsMockOverview = mockOverview.filter(r => r.exam_id !== 'spoken_english');

        const allAvgBands   = ieltsIaOverview.map(r => r.avg_ia_band).filter((v): v is number => v !== null);
        const batchIAAvg    = allAvgBands.length > 0
            ? Math.round(allAvgBands.reduce((a, b) => a + b, 0) / allAvgBands.length * 10) / 10
            : 0;
        const completedAny  = iaOverview.filter(r => r.ia_completed > 0).length;
        const highMissCount = iaOverview.filter(r => r.ia_missed >= 2).length;

        const allRealBands  = ieltsMockOverview.map(r => r.latest_real_band).filter((v): v is number => v !== null);
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
