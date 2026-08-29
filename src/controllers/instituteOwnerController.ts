// src/controllers/instituteOwnerController.ts
import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import prisma from '../lib/prisma';
import { sendInvite } from '../lib/sendInvite';
import { UserRoleType } from '@prisma/client';
import { todayStartIST } from '../lib/timezone';
import { paramStr } from '../utils/httpParams';
import {
    computeBatchDashboard,
    toISTDateString,
    todayISTString,
    daysBeforeIST,
    computeCurrentBand,
    computeBandTrend,
    avgBandFromScores,
    baselineBandByStudent,
    currentBandByStudent,
    meanOver,
    avgImprovementOver,
} from '../lib/batchDashboardQueries';
import { computeStudentFullProgress } from '../lib/studentProgressQueries';
import {
    computeReadingHistory, computeSpeakingHistory, computeWritingHistory,
} from '../lib/practiceHistoryQueries';
import { resolveAccessibleExamIds } from '../lib/sessionContext';
import { getExamConfig } from '../exam-engine';

// â”€â”€â”€ Helper: get institute for owner OR admin â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

async function getCallerInstitute(appUserId: string): Promise<string | null> {
    const ownerRow = await prisma.instituteOwner.findUnique({
        where: { user_id: appUserId },
        select: { institute_id: true },
    });
    if (ownerRow) return ownerRow.institute_id;
    const adminRow = await prisma.instituteAdmin.findUnique({
        where: { user_id: appUserId },
        select: { institute_id: true },
    });
    return adminRow?.institute_id ?? null;
}

// â”€â”€â”€ Helper: get institute owned exclusively by this user â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

async function getOwnedInstitute(appUserId: string): Promise<string | null> {
    const ownerRow = await prisma.instituteOwner.findUnique({
        where: { user_id: appUserId },
        select: { institute_id: true },
    });
    return ownerRow?.institute_id ?? null;
}

// â”€â”€â”€ Helper: resolve all institute_students for an institute â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

async function resolveInstituteStudents(instituteId: string): Promise<{
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
}> {
    const instStudents = await prisma.instituteStudent.findMany({
        where: { institute_id: instituteId, is_active: true },
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
    return { instStudents, instStudentIds: instStudents.map(s => s.id) };
}

// â”€â”€â”€ Helper: compute at-risk flags for a set of students â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

interface AtRiskFlag {
    student_id: string;
    flags: string[];
    primary_flag: string;
}

async function computeAtRiskFlags(
    instStudentIds: string[],
    instStudents: Array<{
        id: string;
        user_id: string;
        isDiagnosed: boolean;
        daily_streak: number;
        momentum_score: number;
    }>
): Promise<AtRiskFlag[]> {
    if (instStudentIds.length === 0) return [];

    const [missedIACounts, lastDrillByStudent, recentCompletedIAs] = await Promise.all([
        prisma.iASession.groupBy({
            by: ['student_id'],
            where: { student_id: { in: instStudentIds }, status: 'MISSED' as any },
            _count: { id: true },
        }),
        prisma.drillSession.groupBy({
            by: ['student_id'],
            where: { student_id: { in: instStudentIds } },
            _max: { created_at: true },
        }),
        prisma.iASession.findMany({
            where: { student_id: { in: instStudentIds }, status: 'COMPLETED' as any },
            orderBy: { ia_date: 'desc' },
            select: { student_id: true, scores: true },
        }),
    ]);

    const missedCount = new Map(
        missedIACounts.map(r => [r.student_id, (r._count as any).id as number])
    );
    const lastDrill = new Map(
        lastDrillByStudent.map(r => [r.student_id, (r._max as any).created_at as Date | null])
    );
    const recentIAsByStudent = new Map<string, Array<{ scores: unknown }>>();
    for (const ia of recentCompletedIAs) {
        const arr = recentIAsByStudent.get(ia.student_id) ?? [];
        if (arr.length < 2) arr.push(ia);
        recentIAsByStudent.set(ia.student_id, arr);
    }

    const nowMs = Date.now();
    const result: AtRiskFlag[] = [];

    for (const s of instStudents) {
        const flags: string[] = [];
        const missed      = missedCount.get(s.id) ?? 0;
        const ld          = lastDrill.get(s.id) ?? null;
        const daysInactive = ld
            ? Math.floor((nowMs - ld.getTime()) / (24 * 60 * 60 * 1000))
            : -1;

        if (!s.isDiagnosed)                              flags.push('Not yet diagnosed');
        if (daysInactive === -1)                         flags.push('Never drilled');
        else if (daysInactive >= 3)                      flags.push(`No activity for ${daysInactive} day${daysInactive !== 1 ? 's' : ''}`);
        if (missed >= 2)                                 flags.push(`Missed ${missed} internal assessments`);
        const last2IAs = recentIAsByStudent.get(s.id) ?? [];
        if (computeBandTrend(last2IAs) === 'down')       flags.push('Band score declining');

        if (flags.length > 0) {
            result.push({ student_id: s.id, flags, primary_flag: flags[0] });
        }
    }

    return result;
}

// â”€â”€â”€ GET /api/institute-owner/admins â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export async function getAdmins(req: AuthRequest, res: Response) {
    try {
        const appUserId = (req as any).appUserId as string;
        const instituteId = await getOwnedInstitute(appUserId);

        if (!instituteId) {
            return res.status(403).json({ error: 'You do not own any institute.' });
        }

        const admins = await prisma.instituteAdmin.findMany({
            where: { institute_id: instituteId },
            orderBy: { created_at: 'desc' },
            include: {
                User: {
                    select: { id: true, name: true, email: true, profileImage: true, createdAt: true },
                },
            },
        });

        const data = admins.map((a) => ({
            id: a.id,
            userId: a.User.id,
            name: a.User.name,
            email: a.User.email,
            profileImage: a.User.profileImage,
            addedAt: a.created_at,
        }));

        return res.json({ data, instituteId });
    } catch (err) {
        console.error('[InstituteOwner] getAdmins error:', err);
        return res.status(500).json({ error: 'Failed to fetch admins' });
    }
}

// â”€â”€â”€ POST /api/institute-owner/admins â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export async function addAdmin(req: AuthRequest, res: Response) {
    const { adminName, adminEmail } = req.body as { adminName: string; adminEmail: string };

    if (!adminName?.trim() || !adminEmail?.trim()) {
        return res.status(400).json({ error: 'adminName and adminEmail are required.' });
    }

    try {
        const appUserId = (req as any).appUserId as string;
        const instituteId = await getOwnedInstitute(appUserId);

        if (!instituteId) {
            return res.status(403).json({ error: 'You do not own any institute.' });
        }

        let dbUser = await prisma.user.findUnique({ where: { email: adminEmail } });
        if (dbUser && dbUser.role !== UserRoleType.INSTITUTE_ADMIN) {
            return res.status(409).json({ error: 'Email already linked with existing user. Contact - blinkgrid@gmail.com' });
        }

        // Create the auth user + send a role-specific branded invite email (Resend).
        // Redirect targets FRONTEND_URL/auth/callback (set-password flow), not /login.
        const { userId: supabaseUserId, emailSent } = await sendInvite({
            email: adminEmail, name: adminName, role: 'INSTITUTE_ADMIN', origin: req.get('origin') ?? undefined,
        });

        if (!dbUser) {
            dbUser = await prisma.user.create({
                data: {
                    email: adminEmail,
                    name: adminName,
                    role: UserRoleType.INSTITUTE_ADMIN,
                    supabaseuserid: supabaseUserId ?? `pending-${Date.now()}`,
                },
            });
        } else {
            dbUser = await prisma.user.update({
                where: { id: dbUser.id },
                data: {
                    role: UserRoleType.INSTITUTE_ADMIN,
                    name: dbUser.name ?? adminName,
                    ...(supabaseUserId ? { supabaseuserid: supabaseUserId } : {}),
                },
            });
        }

        await prisma.instituteAdmin.upsert({
            where: { user_id: dbUser.id },
            update: { institute_id: instituteId },
            create: { user_id: dbUser.id, institute_id: instituteId },
        });

        return res.status(201).json({
            data: {
                userId: dbUser.id,
                name: dbUser.name,
                email: dbUser.email,
                inviteEmailSent: emailSent,
            },
        });
    } catch (err: any) {
        console.error('[InstituteOwner] addAdmin error:', err);
        return res.status(500).json({ error: err.message ?? 'Failed to add admin' });
    }
}

// â”€â”€â”€ DELETE /api/institute-owner/admins/:userId â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export async function removeAdmin(req: AuthRequest, res: Response) {
    const userId = paramStr(req.params.userId);

    try {
        const appUserId = (req as any).appUserId as string;
        const instituteId = await getOwnedInstitute(appUserId);

        if (!instituteId) {
            return res.status(403).json({ error: 'You do not own any institute.' });
        }

        const adminRow = await prisma.instituteAdmin.findFirst({
            where: { user_id: userId, institute_id: instituteId },
        });

        if (!adminRow) {
            return res.status(404).json({ error: 'Admin not found in your institute.' });
        }

        await prisma.instituteAdmin.delete({ where: { id: adminRow.id } });

        await prisma.user.update({
            where: { id: userId },
            data: { role: UserRoleType.STUDENT },
        });

        return res.json({ data: { removed: true, userId } });
    } catch (err: any) {
        console.error('[InstituteOwner] removeAdmin error:', err);
        return res.status(500).json({ error: err.message ?? 'Failed to remove admin' });
    }
}

// GET /api/institute-{owner,admin}/my-exams — exams the caller's institute may
// currently use (ACTIVE/TRIAL subscriptions), for the exam-context switcher.
// Shared by both the owner and admin routers.

export async function getMyExams(req: AuthRequest, res: Response) {
    try {
        const appUserId = (req as any).appUserId as string;
        const instituteId = await getCallerInstitute(appUserId);
        if (!instituteId) return res.status(403).json({ success: false, error: 'Not a member of any institute.' });

        const examIds = await resolveAccessibleExamIds(instituteId);
        const data = examIds.map((id) => {
            const ex: any = getExamConfig(id);
            return { exam_id: id, label: ex?.naming?.public_display_name ?? id };
        });
        return res.json({ success: true, data });
    } catch (err) {
        console.error('[InstituteOwner] getMyExams error:', err);
        return res.status(500).json({ success: false, error: 'Internal server error.' });
    }
}

// â”€â”€â”€ GET /api/institute-owner/summary â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export async function getSummary(req: AuthRequest, res: Response) {
    try {
        const appUserId = (req as any).appUserId as string;
        const instituteId = await getCallerInstitute(appUserId);
        if (!instituteId) {
            return res.status(403).json({ success: false, error: 'Not a member of any institute.' });
        }

        const [institute, batches, allStudents, adminsCount, instructorRows, invitedNotStarted] = await Promise.all([
            prisma.institute.findUnique({ where: { id: instituteId }, select: { name: true } }),
            prisma.batch.findMany({
                where: { institute_id: instituteId },
                select: { id: true, name: true, status: true },
            }),
            resolveInstituteStudents(instituteId),
            prisma.instituteAdmin.count({ where: { institute_id: instituteId } }),
            // Tutors of this institute + their batch assignments (for unassigned count)
            prisma.instituteInstructor.findMany({
                where:  { institute_id: instituteId },
                select: { user_id: true, User: { select: { batch_instructors: { select: { batch_id: true } } } } },
            }),
            // Students invited but who never started (no diagnostic yet) â€” the honest
            // "needs attention" number that replaced the fictional approve/reject queue.
            prisma.instituteStudent.count({
                where: { institute_id: instituteId, isDiagnosed: false, is_active: true },
            }),
        ]);

        const batchIdSet = new Set((batches as any[]).map(b => b.id));
        const unassignedTutors = instructorRows.filter(
            r => !r.User.batch_instructors.some(a => batchIdSet.has(a.batch_id))
        ).length;

        const { instStudents, instStudentIds } = allStudents;

        const todayStart        = todayStartIST();
        const sevenDaysAgo      = daysBeforeIST(7);
        const currentMonthYear  = todayISTString().slice(0, 7);

        const [
            activeTodayRaw,
            unlockedTodayRaw,
            competencyRows,
            iaLast7,
            mockThisMonth,
            atRiskFlags,
        ] = await Promise.all([
            instStudentIds.length > 0
                ? prisma.drillSession.groupBy({
                    by: ['student_id'],
                    where: { student_id: { in: instStudentIds }, created_at: { gte: todayStart } },
                    _count: { id: true },
                })
                : Promise.resolve([]),
            instStudentIds.length > 0
                ? prisma.drillSession.groupBy({
                    by: ['student_id'],
                    where: { student_id: { in: instStudentIds }, created_at: { gte: todayStart } },
                    _count: { id: true },
                    having: { id: { _count: { gte: 2 } } },
                })
                : Promise.resolve([]),
            instStudentIds.length > 0
                ? prisma.studentCompetencyMatrix.findMany({
                    where: { student_id: { in: instStudentIds } },
                    select: { student_id: true, band_score: true },
                })
                : Promise.resolve([]),
            instStudentIds.length > 0
                ? prisma.iASession.count({
                    where: { student_id: { in: instStudentIds }, status: 'COMPLETED' as any, ia_date: { gte: sevenDaysAgo } },
                })
                : Promise.resolve(0),
            instStudentIds.length > 0
                ? prisma.mockSession.count({
                    where: { student_id: { in: instStudentIds }, status: 'COMPLETED' as any, month_year: currentMonthYear },
                })
                : Promise.resolve(0),
            computeAtRiskFlags(instStudentIds, instStudents),
        ]);

        // Average per-student first (mean of their skill bands), then average across students.
        // This avoids weighting students with more skills assessed more heavily.
        const bandsByStudent = new Map<string, number[]>();
        for (const r of competencyRows as Array<{ student_id: string; band_score: unknown }>) {
            const v = parseFloat(String(r.band_score ?? '0'));
            if (!isNaN(v) && v > 0) {
                const arr = bandsByStudent.get(r.student_id) ?? [];
                arr.push(v);
                bandsByStudent.set(r.student_id, arr);
            }
        }
        const perStudentBands = Array.from(bandsByStudent.values())
            .map(bands => bands.reduce((a, b) => a + b, 0) / bands.length);
        const avgBand = perStudentBands.length > 0
            ? Math.round(perStudentBands.reduce((a, b) => a + b, 0) / perStudentBands.length * 10) / 10
            : null;

        return res.json({
            success: true,
            data: {
                institute_name:              institute?.name ?? '',
                total_students:              instStudentIds.length,
                active_today:                (activeTodayRaw as any[]).length,
                platform_unlocked_today:     (unlockedTodayRaw as any[]).length,
                at_risk_count:               atRiskFlags.length,
                total_batches:               (batches as any[]).length,
                avg_band:                    avgBand,
                ia_completion_last_7_days:   { completed: iaLast7, total_eligible: instStudentIds.length },
                mock_completed_this_month:   mockThisMonth,
                admins_count:                adminsCount,
                instructor_count:            instructorRows.length,
                unassigned_tutor_count:      unassignedTutors,
                invited_not_started_count:   invitedNotStarted,
            },
        });
    } catch (err) {
        console.error('[InstituteOwner] getSummary error:', err);
        return res.status(500).json({ success: false, error: 'Internal server error.' });
    }
}

// â”€â”€â”€ GET /api/institute-owner/batches â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export async function getInstituteBatches(req: AuthRequest, res: Response) {
    try {
        const appUserId = (req as any).appUserId as string;
        const instituteId = await getCallerInstitute(appUserId);
        if (!instituteId) {
            return res.status(403).json({ success: false, error: 'Not a member of any institute.' });
        }

        const batches: any[] = await prisma.batch.findMany({
            where: {
                institute_id: instituteId,
            },
            include: {
                batch_students: { select: { user_id: true } },
                batch_instructors: {
                    include: { User: { select: { id: true, name: true, profileImage: true } } },
                },
            },
            orderBy: { created_at: 'desc' },
        });

        // Collect all user_ids across all batches
        const allUserIds = [...new Set(batches.flatMap((b: any) => b.batch_students.map((s: any) => s.user_id)))];

        const [instStudentsAll, todayDrillsAll, competencyAll, iaLast7All, atRiskFlagsAll] = await Promise.all([
            allUserIds.length > 0
                ? prisma.instituteStudent.findMany({
                    where: { user_id: { in: allUserIds } },
                    select: { id: true, user_id: true, isDiagnosed: true, daily_streak: true, momentum_score: true, target_band: true },
                })
                : Promise.resolve([]),
            allUserIds.length > 0
                ? (async () => {
                    const instIds = (await prisma.instituteStudent.findMany({
                        where: { user_id: { in: allUserIds } },
                        select: { id: true, user_id: true },
                    })).map(s => s.id);
                    if (instIds.length === 0) return [];
                    return prisma.drillSession.groupBy({
                        by: ['student_id'],
                        where: { student_id: { in: instIds }, created_at: { gte: todayStartIST() } },
                        _count: { id: true },
                    });
                })()
                : Promise.resolve([]),
            allUserIds.length > 0
                ? (async () => {
                    const instIds = (await prisma.instituteStudent.findMany({
                        where: { user_id: { in: allUserIds } },
                        select: { id: true },
                    })).map(s => s.id);
                    if (instIds.length === 0) return [];
                    return prisma.studentCompetencyMatrix.findMany({
                        where: { student_id: { in: instIds } },
                        select: { student_id: true, band_score: true },
                    });
                })()
                : Promise.resolve([]),
            allUserIds.length > 0
                ? (async () => {
                    const instIds = (await prisma.instituteStudent.findMany({
                        where: { user_id: { in: allUserIds } },
                        select: { id: true },
                    })).map(s => s.id);
                    if (instIds.length === 0) return [];
                    return prisma.iASession.groupBy({
                        by: ['student_id'],
                        where: {
                            student_id: { in: instIds },
                            status: 'COMPLETED' as any,
                            ia_date: { gte: daysBeforeIST(7) },
                        },
                        _count: { id: true },
                    });
                })()
                : Promise.resolve([]),
            (async () => {
                const instIds = allUserIds.length > 0
                    ? (await prisma.instituteStudent.findMany({
                        where: { user_id: { in: allUserIds } },
                        select: { id: true, user_id: true, isDiagnosed: true, daily_streak: true, momentum_score: true },
                    }))
                    : [];
                return computeAtRiskFlags(instIds.map(s => s.id), instIds);
            })(),
        ]);

        // Build instStudent maps
        const instByUserId = new Map((instStudentsAll as any[]).map((s: any) => [s.user_id, s]));
        const activeTodayByInstId = new Set((todayDrillsAll as any[]).map((r: any) => r.student_id));
        const competencyByInstId = new Map<string, number[]>();
        for (const row of (competencyAll as any[])) {
            const v = parseFloat(String(row.band_score ?? '0'));
            if (!isNaN(v) && v > 0) {
                const arr = competencyByInstId.get(row.student_id) ?? [];
                arr.push(v);
                competencyByInstId.set(row.student_id, arr);
            }
        }
        const iaCompletedByInstId = new Map((iaLast7All as any[]).map((r: any) => [r.student_id, (r._count as any).id as number]));
        const atRiskSet = new Set((atRiskFlagsAll as AtRiskFlag[]).map(r => r.student_id));

        const batchRows = batches.map((b: any) => {
            const batchUserIds: string[] = b.batch_students.map((s: any) => s.user_id);
            const batchInstIds = batchUserIds
                .map(uid => instByUserId.get(uid))
                .filter(Boolean)
                .map((s: any) => s.id);

            const studentCount  = batchUserIds.length;
            const activeToday   = batchInstIds.filter(id => activeTodayByInstId.has(id)).length;
            const atRiskCount   = batchInstIds.filter(id => atRiskSet.has(id)).length;

            // Average per-student bands first, then average across students
            const perStudentBands = batchInstIds
                .map(id => {
                    const vals = competencyByInstId.get(id) ?? [];
                    return vals.length > 0 ? vals.reduce((a, c) => a + c, 0) / vals.length : null;
                })
                .filter((v): v is number => v !== null);
            const avgBand = perStudentBands.length > 0
                ? Math.round(perStudentBands.reduce((a, c) => a + c, 0) / perStudentBands.length * 10) / 10
                : null;

            const iaCompleted = batchInstIds.reduce((sum, id) => sum + (iaCompletedByInstId.get(id) ?? 0), 0);
            const iaCompletionRate = studentCount > 0
                ? Math.round(iaCompleted / studentCount * 100)
                : 0;

            const instructors = b.batch_instructors.map((bi: any) => ({
                userId: bi.User.id,
                name:   bi.User.name,
                profileImage: bi.User.profileImage,
            }));

            return {
                id:                 b.id,
                name:               b.name,
                status:             b.status,
                max_students:       b.max_students ?? null,
                student_count:      studentCount,
                capacity_pct:       b.max_students ? Math.round(studentCount / b.max_students * 100) : null,
                active_today:       activeToday,
                at_risk_count:      atRiskCount,
                avg_band:           avgBand,
                ia_completion_rate: iaCompletionRate,
                instructors,
            };
        });

        return res.json({ success: true, data: batchRows });
    } catch (err) {
        console.error('[InstituteOwner] getInstituteBatches error:', err);
        return res.status(500).json({ success: false, error: 'Internal server error.' });
    }
}

// â”€â”€â”€ GET /api/institute-owner/batches/:batchId/dashboard-summary â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export async function getOwnerBatchDashboardSummary(req: AuthRequest, res: Response) {
    try {
        const appUserId = (req as any).appUserId as string;
        const batchId = paramStr(req.params.batchId);

        const instituteId = await getCallerInstitute(appUserId);
        if (!instituteId) {
            return res.status(403).json({ success: false, error: 'Not a member of any institute.' });
        }

        // Verify batch belongs to this institute
        const batch = await prisma.batch.findFirst({
            where: { id: batchId, institute_id: instituteId },
            select: { id: true },
        });
        if (!batch) {
            return res.status(403).json({ success: false, error: 'Batch does not belong to your institute.' });
        }

        // Get batch students
        const batchStudentLinks: Array<{ user_id: string }> =
            await prisma.batchStudent.findMany({
                where: { batch_id: batchId },
                select: { user_id: true },
            });
        const userIds = batchStudentLinks.map(s => s.user_id);

        const [instStudents, users] = await Promise.all([
            userIds.length > 0
                ? prisma.instituteStudent.findMany({
                    where: { user_id: { in: userIds } },
                    select: { id: true, user_id: true, target_band: true, momentum_score: true, daily_streak: true, isDiagnosed: true, last_streak_date: true },
                })
                : Promise.resolve([]),
            userIds.length > 0
                ? prisma.user.findMany({
                    where: { id: { in: userIds } },
                    select: { id: true, name: true, profileImage: true },
                })
                : Promise.resolve([]),
        ]);

        const userById = new Map(users.map(u => [u.id, u]));
        const instStudentIds = instStudents.map(s => s.id);

        const data = await computeBatchDashboard(instStudentIds, instStudents, userById);

        return res.json({ success: true, data });
    } catch (err) {
        console.error('[InstituteOwner] getOwnerBatchDashboardSummary error:', err);
        return res.status(500).json({ success: false, error: 'Internal server error.' });
    }
}

// â”€â”€â”€ GET /api/institute-owner/students â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export async function getInstituteStudents(req: AuthRequest, res: Response) {
    try {
        const appUserId = (req as any).appUserId as string;
        const instituteId = await getCallerInstitute(appUserId);
        if (!instituteId) {
            return res.status(403).json({ success: false, error: 'Not a member of any institute.' });
        }

        const batchIdFilter  = req.query.batch_id as string | undefined;
        const atRiskFilter   = req.query.at_risk === 'true';

        // Batches of THIS institute — also the allow-list that validates
        // batchIdFilter, so a batch id from another institute selects nobody.
        const batches: any[] = await prisma.batch.findMany({
            where: { institute_id: instituteId },
            select: { id: true, name: true },
        });

        const batchById = new Map(batches.map((b: any) => [b.id, b]));

        const batchStudentLinks: Array<{ batch_id: string; user_id: string }> =
            await prisma.batchStudent.findMany({
                where: { batch_id: { in: batches.map((b: any) => b.id) } },
                select: { batch_id: true, user_id: true },
            });

        // Scope: a batch filter narrows to that batch's members; WITHOUT a filter
        // this is every active student in the institute, including those not yet
        // assigned to any batch. Deriving the roster from batch membership meant
        // an unbatched student was invisible here while getSummary still counted
        // them — the two surfaces disagreed, and the students hidden were the
        // newly-invited ones most likely to never start.
        const scopedUserIds = batchIdFilter
            ? [...new Set(batchStudentLinks.filter(l => l.batch_id === batchIdFilter).map(l => l.user_id))]
            : null;

        const instStudents = await prisma.instituteStudent.findMany({
            where: {
                institute_id: instituteId,
                is_active: true,
                ...(scopedUserIds ? { user_id: { in: scopedUserIds } } : {}),
            },
            select: {
                id: true, user_id: true, target_band: true, momentum_score: true,
                daily_streak: true, isDiagnosed: true, last_streak_date: true,
                exam_date: true,
            },
        });

        if (instStudents.length === 0) {
            return res.json({ success: true, data: [] });
        }

        const userIds = instStudents.map(s => s.user_id);
        // Resolved once. Each of the three aggregate queries below previously
        // re-fetched this same id list, so a single page load ran four identical
        // institute_students queries.
        const instIdsAll = instStudents.map(s => s.id);

        const [users, competencyRows, recentIAs, lastDrills] = await Promise.all([
            prisma.user.findMany({
                where: { id: { in: userIds } },
                select: { id: true, name: true, profileImage: true, email: true },
            }),
            prisma.studentCompetencyMatrix.findMany({
                where: { student_id: { in: instIdsAll } },
                select: { student_id: true, band_score: true },
            }),
            prisma.iASession.findMany({
                where: { student_id: { in: instIdsAll }, status: 'COMPLETED' as any },
                orderBy: { ia_date: 'desc' },
                select: { student_id: true, scores: true },
            }),
            prisma.drillSession.groupBy({
                by: ['student_id'],
                where: { student_id: { in: instIdsAll } },
                _max: { created_at: true },
            }),
        ]);

        const instByUserId  = new Map(instStudents.map(s => [s.user_id, s]));
        const userByUserId  = new Map(users.map(u => [u.id, u]));
        const competencyByInstId = new Map<string, Array<{ band_score: unknown }>>();
        for (const row of competencyRows) {
            const arr = competencyByInstId.get(row.student_id) ?? [];
            arr.push(row);
            competencyByInstId.set(row.student_id, arr);
        }
        const recentIAsByInstId = new Map<string, Array<{ scores: unknown }>>();
        for (const ia of recentIAs) {
            const arr = recentIAsByInstId.get(ia.student_id) ?? [];
            if (arr.length < 2) arr.push(ia);
            recentIAsByInstId.set(ia.student_id, arr);
        }
        const lastDrillByInstId = new Map(lastDrills.map(r => [r.student_id, (r._max as any).created_at as Date | null]));

        // Map userId â†’ batch info (use first batch if student in multiple).
        // batch_id is included because the frontend keys its batch filter by it;
        // without it the dropdown built its options from `undefined`.
        const batchByUserId = new Map<string, { batch_id: string; batch_name: string }>();
        for (const link of batchStudentLinks) {
            if (!batchByUserId.has(link.user_id)) {
                const b = batchById.get(link.batch_id) as any;
                batchByUserId.set(link.user_id, { batch_id: link.batch_id, batch_name: b?.name ?? '' });
            }
        }

        // Compute at-risk flags
        const instIds = instStudents.map(s => s.id);
        const atRiskFlags = await computeAtRiskFlags(instIds, instStudents);
        const atRiskByInstId = new Map(atRiskFlags.map(r => [r.student_id, r]));

        const nowMs = Date.now();

        let rows = userIds.map(uid => {
            const inst = instByUserId.get(uid);
            if (!inst) return null;
            const user        = userByUserId.get(uid);
            const competency  = competencyByInstId.get(inst.id) ?? [];
            const current_band = computeCurrentBand(competency);
            const target_band  = inst.target_band ? parseFloat(String(inst.target_band)) : null;
            const gap          = current_band !== null && target_band !== null
                ? Math.round((target_band - current_band) * 10) / 10
                : null;
            const last2IAs     = recentIAsByInstId.get(inst.id) ?? [];
            const band_trend   = computeBandTrend(last2IAs);
            const lastDrill    = lastDrillByInstId.get(inst.id) ?? null;
            const daysInactive = lastDrill
                ? Math.floor((nowMs - lastDrill.getTime()) / (24 * 60 * 60 * 1000))
                : -1;
            const riskEntry    = atRiskByInstId.get(inst.id) ?? null;
            // Unbatched students are in scope now, so absent batch info is a real
            // state ("not assigned yet"), not a lookup miss.
            const batchInfo    = batchByUserId.get(uid) ?? { batch_id: '', batch_name: '' };

            return {
                student_id:     inst.id,
                user_id:        uid,
                name:           user?.name ?? 'Unknown',
                avatar:         (user as any)?.profileImage ?? null,
                email:          user?.email ?? '',
                batch_id:       batchInfo.batch_id,
                batch_name:     batchInfo.batch_name,
                current_band,
                target_band,
                gap,
                band_trend,
                daily_streak:   inst.daily_streak,
                drilled_today:  daysInactive === 0,
                momentum_score: inst.momentum_score,
                is_at_risk:     riskEntry !== null,
                primary_flag:   riskEntry?.primary_flag ?? null,
                last_active:    lastDrill ? toISTDateString(lastDrill) : null,
                is_diagnosed:   inst.isDiagnosed,
                // Exam proximity was student-only until now: no staff surface
                // could tell which students sit the exam next.
                exam_date:      inst.exam_date ? toISTDateString(inst.exam_date) : null,
            };
        }).filter(Boolean) as Array<{
            student_id: string; user_id: string; name: string; avatar: string | null;
            email: string; batch_id: string; batch_name: string; current_band: number | null;
            target_band: number | null; gap: number | null; band_trend: 'up' | 'flat' | 'down' | null;
            daily_streak: number; drilled_today: boolean; momentum_score: number;
            is_at_risk: boolean; primary_flag: string | null; last_active: string | null;
            is_diagnosed: boolean; exam_date: string | null;
        }>;

        if (atRiskFilter) {
            rows = rows.filter(r => r.is_at_risk);
        }

        return res.json({ success: true, data: rows });
    } catch (err) {
        console.error('[InstituteOwner] getInstituteStudents error:', err);
        return res.status(500).json({ success: false, error: 'Internal server error.' });
    }
}

// â”€â”€â”€ GET /api/institute-owner/students/:studentId/full-progress â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export async function getOwnerStudentFullProgress(req: AuthRequest, res: Response) {
    try {
        const appUserId  = (req as any).appUserId as string;
        const studentId = paramStr(req.params.studentId); // studentId = User.id

        const instituteId = await getCallerInstitute(appUserId);
        if (!instituteId) {
            return res.status(403).json({ success: false, error: 'Not a member of any institute.' });
        }

        // Verify student belongs to the institute via any batch
        const instStudent = await prisma.instituteStudent.findFirst({
            where: { user_id: studentId, institute_id: instituteId },
            select: { id: true, user_id: true, target_band: true, momentum_score: true, daily_streak: true, isDiagnosed: true, exam_date: true },
        });
        if (!instStudent) {
            return res.status(403).json({ success: false, error: 'Student is not enrolled in your institute.' });
        }

        const studentUser = await prisma.user.findUnique({
            where:  { id: studentId },
            select: { id: true, name: true, email: true, profileImage: true },
        });

        const data = await computeStudentFullProgress(instStudent, studentUser);

        return res.json({ success: true, data });
    } catch (err) {
        console.error('[InstituteOwner] getOwnerStudentFullProgress error:', err);
        return res.status(500).json({ success: false, error: 'Internal server error.' });
    }
}

// ─── POST /api/institute-owner/students/:studentId/diagnostic/reset ───────────
// Body: { skill: 'LISTENING' | 'READING' | 'WRITING' | 'SPEAKING' | 'ALL' }
// Deletes the diagnostic AssessmentHistory row(s) + StudentCompetencyMatrix
// row(s) for the given skill(s) and flips isDiagnosed back to false. Only
// mode: 'DIAGNOSTIC' rows are touched — mock/IA history for the same skill
// is untouched.

const DIAGNOSTIC_SKILLS = ['LISTENING', 'READING', 'WRITING', 'SPEAKING'] as const;

export async function resetStudentDiagnostic(req: AuthRequest, res: Response) {
    try {
        const appUserId  = (req as any).appUserId as string;
        const studentId  = paramStr(req.params.studentId); // = User.id
        const skillInput = req.body?.skill as string;

        const skills = skillInput === 'ALL'
            ? [...DIAGNOSTIC_SKILLS]
            : DIAGNOSTIC_SKILLS.includes(skillInput as any) ? [skillInput] : null;
        if (!skills) {
            return res.status(400).json({ success: false, error: 'skill must be LISTENING, READING, WRITING, SPEAKING, or ALL.' });
        }

        const instituteId = await getCallerInstitute(appUserId);
        if (!instituteId) {
            return res.status(403).json({ success: false, error: 'Not a member of any institute.' });
        }

        const instStudent = await prisma.instituteStudent.findFirst({
            where:  { user_id: studentId, institute_id: instituteId },
            select: { id: true },
        });
        if (!instStudent) {
            return res.status(403).json({ success: false, error: 'Student is not enrolled in your institute.' });
        }

        await prisma.$transaction(async (tx) => {
            await tx.assessmentHistory.deleteMany({
                where: { student_id: instStudent.id, mode: 'DIAGNOSTIC', skill: { in: skills as any } },
            });
            await tx.studentCompetencyMatrix.deleteMany({
                where: { student_id: instStudent.id, skill: { in: skills as any } },
            });
            await tx.instituteStudent.update({
                where: { id: instStudent.id },
                // updated_at is explicit, not @updatedAt-managed — the frontend reads it
                // via /status to know a reset happened and clear its cached progress.
                data:  { isDiagnosed: false, updated_at: new Date() },
            });
        });

        console.log(`[DiagnosticReset] admin=${appUserId} student=${studentId} skill=${skillInput}`);
        return res.json({ success: true, data: { reset: skills } });
    } catch (err) {
        console.error('[InstituteOwner] resetStudentDiagnostic error:', err);
        return res.status(500).json({ success: false, error: 'Internal server error.' });
    }
}

// ─── Practice history (Reading / Speaking / Writing) ─────────────────────────
// GET /api/institute-owner/students/:studentId/{reading,speaking,writing}-history
//
// The standalone practice work behind the assessment results. These three
// computations live in lib/practiceHistoryQueries and are shared with the
// instructor endpoints — the only difference here is the authorisation scope:
// institute membership rather than batch assignment. Without these, an owner or
// admin could see every assessment result for a student but none of the practice
// that produced it, while a tutor could see both.

/**
 * Confirms the student is enrolled in the caller's institute.
 * Returns the institute id on success, or null once a response has been sent.
 */
async function assertInstituteOwnsStudent(
    req: AuthRequest,
    res: Response,
    studentUserId: string
): Promise<boolean> {
    const appUserId   = (req as any).appUserId as string;
    const instituteId = await getCallerInstitute(appUserId);
    if (!instituteId) {
        res.status(403).json({ success: false, error: 'Not a member of any institute.' });
        return false;
    }

    const instStudent = await prisma.instituteStudent.findFirst({
        where:  { user_id: studentUserId, institute_id: instituteId },
        select: { id: true },
    });
    if (!instStudent) {
        res.status(403).json({ success: false, error: 'Student is not enrolled in your institute.' });
        return false;
    }
    return true;
}

export async function getOwnerStudentReadingHistory(req: AuthRequest, res: Response) {
    try {
        const studentId = paramStr(req.params.studentId);
        if (!(await assertInstituteOwnsStudent(req, res, studentId))) return;
        return res.json({ success: true, data: await computeReadingHistory(studentId) });
    } catch (err) {
        console.error('[InstituteOwner] getOwnerStudentReadingHistory error:', err);
        return res.status(500).json({ success: false, error: 'Internal server error.' });
    }
}

export async function getOwnerStudentSpeakingHistory(req: AuthRequest, res: Response) {
    try {
        const studentId = paramStr(req.params.studentId);
        if (!(await assertInstituteOwnsStudent(req, res, studentId))) return;
        return res.json({ success: true, data: await computeSpeakingHistory(studentId) });
    } catch (err) {
        console.error('[InstituteOwner] getOwnerStudentSpeakingHistory error:', err);
        return res.status(500).json({ success: false, error: 'Internal server error.' });
    }
}

export async function getOwnerStudentWritingHistory(req: AuthRequest, res: Response) {
    try {
        const studentId = paramStr(req.params.studentId);
        if (!(await assertInstituteOwnsStudent(req, res, studentId))) return;
        return res.json({ success: true, data: await computeWritingHistory(studentId) });
    } catch (err) {
        console.error('[InstituteOwner] getOwnerStudentWritingHistory error:', err);
        return res.status(500).json({ success: false, error: 'Internal server error.' });
    }
}

// ─── GET /api/institute-owner/at-risk ────────────────────────────────────────

export async function getInstituteAtRisk(req: AuthRequest, res: Response) {
    try {
        const appUserId = (req as any).appUserId as string;
        const instituteId = await getCallerInstitute(appUserId);
        if (!instituteId) {
            return res.status(403).json({ success: false, error: 'Not a member of any institute.' });
        }

        const batches: any[] = await prisma.batch.findMany({
            where: { institute_id: instituteId },
            select: { id: true, name: true },
        });

        const batchStudentLinks: Array<{ batch_id: string; user_id: string }> =
            await prisma.batchStudent.findMany({
                where: { batch_id: { in: batches.map((b: any) => b.id) } },
                select: { batch_id: true, user_id: true },
            });

        // Institute-scoped, not batch-scoped. A student with no batch assignment
        // is the single most at-risk case there is — invited, never started, and
        // nobody's explicit responsibility — so deriving this list from batch
        // membership excluded exactly the students it exists to surface.
        const instStudents = await prisma.instituteStudent.findMany({
            where:  { institute_id: instituteId, is_active: true },
            select: { id: true, user_id: true, isDiagnosed: true, daily_streak: true, momentum_score: true, target_band: true },
        });

        if (instStudents.length === 0) {
            return res.json({ success: true, data: [] });
        }

        const userIds = instStudents.map(s => s.user_id);
        const users = await prisma.user.findMany({
            where:  { id: { in: userIds } },
            select: { id: true, name: true, profileImage: true },
        });
        const userByUserId = new Map(users.map(u => [u.id, u]));

        const instIds = instStudents.map(s => s.id);
        const [atRiskFlags, missedIACounts, lastDrillByStudent] = await Promise.all([
            computeAtRiskFlags(instIds, instStudents),
            prisma.iASession.groupBy({
                by: ['student_id'],
                where: { student_id: { in: instIds }, status: 'MISSED' as any },
                _count: { id: true },
            }),
            prisma.drillSession.groupBy({
                by: ['student_id'],
                where: { student_id: { in: instIds } },
                _max: { created_at: true },
            }),
        ]);

        if (atRiskFlags.length === 0) {
            return res.json({ success: true, data: [] });
        }

        const missedCountByInstId = new Map(
            missedIACounts.map(r => [r.student_id, (r._count as any).id as number])
        );
        const lastDrillByInstId = new Map(
            lastDrillByStudent.map(r => [r.student_id, (r._max as any).created_at as Date | null])
        );
        const nowMs = Date.now();

        const atRiskInstIds = new Set(atRiskFlags.map(r => r.student_id));

        // Fetch competency for current_band
        const competencyRows = await prisma.studentCompetencyMatrix.findMany({
            where: { student_id: { in: [...atRiskInstIds] } },
            select: { student_id: true, band_score: true },
        });
        const competencyByInstId = new Map<string, Array<{ band_score: unknown }>>();
        for (const row of competencyRows) {
            const arr = competencyByInstId.get(row.student_id) ?? [];
            arr.push(row);
            competencyByInstId.set(row.student_id, arr);
        }

        // Build batch lookup: instStudentId â†’ { batch_id, batch_name }
        const instByUserId = new Map(instStudents.map(s => [s.user_id, s]));
        const batchById = new Map(batches.map((b: any) => [b.id, b]));
        const batchByInstId = new Map<string, { batch_id: string; batch_name: string }>();
        for (const link of batchStudentLinks) {
            const inst = instByUserId.get(link.user_id);
            if (inst && !batchByInstId.has(inst.id)) {
                const b = batchById.get(link.batch_id) as any;
                batchByInstId.set(inst.id, { batch_id: link.batch_id, batch_name: b?.name ?? '' });
            }
        }

        const result = atRiskFlags.map(r => {
            const inst        = instStudents.find(s => s.id === r.student_id);
            const user        = inst ? userByUserId.get(inst.user_id) : undefined;
            const competency  = competencyByInstId.get(r.student_id) ?? [];
            const batchInfo   = batchByInstId.get(r.student_id) ?? { batch_id: '', batch_name: '' };
            const ld          = lastDrillByInstId.get(r.student_id) ?? null;
            const daysInactive = ld ? Math.floor((nowMs - ld.getTime()) / 86_400_000) : -1;
            const missedIA     = missedCountByInstId.get(r.student_id) ?? 0;
            return {
                student_id:      r.student_id,
                user_id:         inst?.user_id ?? '',
                name:            user?.name ?? 'Unknown',
                avatar:          (user as any)?.profileImage ?? null,
                batch_id:        batchInfo.batch_id,
                batch_name:      batchInfo.batch_name,
                flags:           r.flags,
                primary_flag:    r.primary_flag,
                days_inactive:   daysInactive,
                missed_ia_count: missedIA,
                current_band:    computeCurrentBand(competency),
                target_band:     inst?.target_band ? parseFloat(String(inst.target_band)) : null,
            };
        });

        // Sort: not-diagnosed first
        result.sort((a, b) => {
            const ad = a.flags.includes('Not yet diagnosed') ? 1 : 0;
            const bd = b.flags.includes('Not yet diagnosed') ? 1 : 0;
            return bd - ad;
        });

        return res.json({ success: true, data: result });
    } catch (err) {
        console.error('[InstituteOwner] getInstituteAtRisk error:', err);
        return res.status(500).json({ success: false, error: 'Internal server error.' });
    }
}

// â”€â”€â”€ GET /api/institute-owner/instructors â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export async function getInstituteInstructors(req: AuthRequest, res: Response) {
    try {
        const appUserId = (req as any).appUserId as string;
        const instituteId = await getCallerInstitute(appUserId);
        if (!instituteId) {
            return res.status(403).json({ success: false, error: 'Not a member of any institute.' });
        }

        const batches: any[] = await prisma.batch.findMany({
            where: { institute_id: instituteId },
            include: {
                batch_instructors: {
                    include: { User: { select: { id: true, name: true, profileImage: true, email: true } } },
                },
                batch_students: { select: { user_id: true } },
            },
        });

        // Aggregate per instructor
        const instructorMap = new Map<string, {
            user_id: string;
            name: string | null;
            avatar: string | null;
            email: string;
            batches: Array<{ batch_id: string; batch_name: string; student_count: number }>;
            totalStudents: number;
        }>();

        for (const b of batches) {
            for (const bi of b.batch_instructors) {
                const uid = bi.User.id;
                if (!instructorMap.has(uid)) {
                    instructorMap.set(uid, {
                        user_id: uid,
                        name:    bi.User.name,
                        avatar:  bi.User.profileImage,
                        email:   bi.User.email,
                        batches: [],
                        totalStudents: 0,
                    });
                }
                const entry = instructorMap.get(uid)!;
                const studentCount = b.batch_students.length;
                entry.batches.push({
                    batch_id:      b.id,
                    batch_name:    b.name,
                    student_count: studentCount,
                });
                entry.totalStudents += studentCount;
            }
        }

        const result = Array.from(instructorMap.values()).map(e => ({
            user_id:        e.user_id,
            name:           e.name,
            avatar:         e.avatar,
            email:          e.email,
            batches:        e.batches,
            total_students: e.totalStudents,
        }));

        return res.json({ success: true, data: result });
    } catch (err) {
        console.error('[InstituteOwner] getInstituteInstructors error:', err);
        return res.status(500).json({ success: false, error: 'Internal server error.' });
    }
}

// â”€â”€â”€ GET /api/institute-owner/assessment-overview â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export async function getInstituteAssessmentOverview(req: AuthRequest, res: Response) {
    try {
        const appUserId = (req as any).appUserId as string;
        const instituteId = await getCallerInstitute(appUserId);
        if (!instituteId) {
            return res.status(403).json({ success: false, error: 'Not a member of any institute.' });
        }

        const batchIdFilter  = req.query.batch_id as string | undefined;

        // Batches of THIS institute — also the allow-list validating batchIdFilter.
        const batches: any[] = await prisma.batch.findMany({
            where: { institute_id: instituteId },
            select: { id: true, name: true },
        });

        const batchById = new Map(batches.map((b: any) => [b.id, b]));

        const batchStudentLinks: Array<{ batch_id: string; user_id: string }> =
            await prisma.batchStudent.findMany({
                where: { batch_id: { in: batches.map((b: any) => b.id) } },
                select: { batch_id: true, user_id: true },
            });

        // Institute-scoped unless a batch filter is given — same rule as
        // getInstituteStudents / getInstituteAtRisk. It matters most here: the
        // headline this endpoint feeds is "who has never been diagnosed", and a
        // batch-derived roster silently omitted every student not yet assigned to
        // a batch, who are precisely the ones most likely never to have started.
        const scopedUserIds = batchIdFilter
            ? [...new Set(batchStudentLinks.filter(l => l.batch_id === batchIdFilter).map(l => l.user_id))]
            : null;

        const instStudents = await prisma.instituteStudent.findMany({
            where: {
                institute_id: instituteId,
                is_active: true,
                ...(scopedUserIds ? { user_id: { in: scopedUserIds } } : {}),
            },
            select: { id: true, user_id: true, target_band: true, isDiagnosed: true },
        });

        if (instStudents.length === 0) {
            return res.json({
                success: true,
                data: {
                    ia_overview: [],
                    mock_overview: [],
                    diagnostic_overview: [],
                    institute_ia_summary: { avg_band: 0, completion_rate: 0, high_miss_count: 0 },
                    institute_mock_summary: { avg_real_band: 0, at_or_above_target: 0, no_mock_yet: 0 },
                },
            });
        }

        const userIds        = instStudents.map(s => s.user_id);
        const instStudentIds = instStudents.map(s => s.id);
        const instByUserId   = new Map(instStudents.map(s => [s.user_id, s]));

        const users = await prisma.user.findMany({
            where: { id: { in: userIds } },
            select: { id: true, name: true, profileImage: true },
        });
        const userByUserId = new Map(users.map(u => [u.id, u]));

        // Build userByInstId
        const userByInstId = new Map(
            instStudents.map(s => [s.id, userByUserId.get(s.user_id)])
        );

        // Build batch lookup: instStudentId â†’ batch_name
        const batchByInstId = new Map<string, { batch_name: string }>();
        for (const link of batchStudentLinks) {
            const inst = instByUserId.get(link.user_id);
            if (inst && !batchByInstId.has(inst.id)) {
                const b = batchById.get(link.batch_id) as any;
                batchByInstId.set(inst.id, { batch_name: b?.name ?? '' });
            }
        }

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
            prisma.assessmentHistory.findMany({
                where:   { student_id: { in: instStudentIds }, mode: 'DIAGNOSTIC' as any },
                orderBy: { created_at: 'asc' },
                select:  { student_id: true, skill: true, band_score: true, created_at: true },
            }),
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
                if (band > 0) { row.allBands.push(band); row.lastBand = band; }
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

        // â”€â”€ Diagnostic per-student â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
        type DiagRow = { isDiagnosed: boolean; bands: Record<string, number | null>; diagnosedAt: string | null };
        const diagMap = new Map<string, DiagRow>();
        for (const s of instStudents) {
            diagMap.set(s.id, { isDiagnosed: s.isDiagnosed, bands: { L: null, R: null, W: null, S: null }, diagnosedAt: null });
        }
        const skillKey: Record<string, string> = { LISTENING: 'L', READING: 'R', WRITING: 'W', SPEAKING: 'S' };
        const seenDiag = new Set<string>();
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

        // â”€â”€ Drill eligibility â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
        const nowMs = Date.now();
        const drillEligibleById = new Map<string, boolean>();
        for (const agg of drillAggregates) {
            const drillCount  = (agg._count as any).id as number;
            const firstDrillAt: Date | null = (agg._min as any).created_at;
            const daysSince = firstDrillAt ? Math.floor((nowMs - firstDrillAt.getTime()) / (24 * 60 * 60 * 1000)) : 0;
            const correct   = (agg._sum as any).correct_answers as number ?? 0;
            const total     = (agg._sum as any).total_questions as number ?? 0;
            const avgDcs    = total > 0 ? (correct / total) * 100 : 0;
            drillEligibleById.set(agg.student_id, drillCount >= 6 && daysSince >= 2 && avgDcs >= 40);
        }

        // â”€â”€ Output arrays â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
        const iaOverview = instStudents.map(s => {
            const user = userByInstId.get(s.id);
            const row  = iaMap.get(s.id)!;
            const avg  = row.allBands.length > 0
                ? Math.round(row.allBands.reduce((a, b) => a + b, 0) / row.allBands.length * 10) / 10
                : null;
            const best = row.allBands.length > 0 ? Math.round(Math.max(...row.allBands) * 10) / 10 : null;
            const batchInfo = batchByInstId.get(s.id);
            return {
                student_id:   s.id, user_id: s.user_id,
                name:         user?.name ?? 'Unknown',
                avatar:       (user as any)?.profileImage ?? null,
                ia_completed: row.completed, ia_missed: row.missed,
                last_ia_band: row.lastBand, best_ia_band: best, avg_ia_band: avg,
                last_ia_date: row.lastDate,
                ia_eligible:  drillEligibleById.get(s.id) ?? false,
                batch_name:   batchInfo?.batch_name ?? '',
            };
        });

        const mockOverview = instStudents.map(s => {
            const user = userByInstId.get(s.id);
            const row  = mockMap.get(s.id)!;
            const batchInfo = batchByInstId.get(s.id);
            return {
                student_id:       s.id, user_id: s.user_id,
                name:             user?.name ?? 'Unknown',
                avatar:           (user as any)?.profileImage ?? null,
                mock_count:       row.count,
                latest_real_band: row.latestBand,
                best_real_band:   row.bestBand,
                target_band:      s.target_band ? parseFloat(String(s.target_band)) : null,
                batch_name:       batchInfo?.batch_name ?? '',
            };
        });

        const diagnosticOverview = instStudents.map(s => {
            const user = userByInstId.get(s.id);
            const row  = diagMap.get(s.id)!;
            const batchInfo = batchByInstId.get(s.id);
            return {
                student_id:    s.id, user_id: s.user_id,
                name:          user?.name ?? 'Unknown',
                avatar:        (user as any)?.profileImage ?? null,
                is_diagnosed:  row.isDiagnosed,
                baseline_bands: row.bands,
                diagnosed_at:  row.diagnosedAt,
                batch_name:    batchInfo?.batch_name ?? '',
            };
        });
        diagnosticOverview.sort((a, b) => Number(a.is_diagnosed) - Number(b.is_diagnosed));

        // Institute-level summaries
        const allAvgBands = iaOverview.map(r => r.avg_ia_band).filter((v): v is number => v !== null);
        const instIAAvg   = allAvgBands.length > 0 ? Math.round(allAvgBands.reduce((a, b) => a + b, 0) / allAvgBands.length * 10) / 10 : 0;
        const completedAny  = iaOverview.filter(r => r.ia_completed > 0).length;
        const highMissCount = iaOverview.filter(r => r.ia_missed >= 2).length;
        const allRealBands  = mockOverview.map(r => r.latest_real_band).filter((v): v is number => v !== null);
        const instMockAvg   = allRealBands.length > 0 ? Math.round(allRealBands.reduce((a, b) => a + b, 0) / allRealBands.length * 10) / 10 : 0;
        const atOrAbove     = mockOverview.filter(r =>
            r.latest_real_band !== null && r.target_band !== null && r.latest_real_band >= r.target_band
        ).length;
        const noMockYet = mockOverview.filter(r => r.mock_count === 0).length;

        return res.json({
            success: true,
            data: {
                ia_overview:         iaOverview,
                mock_overview:       mockOverview,
                diagnostic_overview: diagnosticOverview,
                institute_ia_summary: {
                    avg_band:        instIAAvg,
                    completion_rate: instStudentIds.length > 0 ? Math.round(completedAny / instStudentIds.length * 100) : 0,
                    high_miss_count: highMissCount,
                },
                institute_mock_summary: {
                    avg_real_band:     instMockAvg,
                    at_or_above_target: atOrAbove,
                    no_mock_yet:       noMockYet,
                },
            },
        });
    } catch (err) {
        console.error('[InstituteOwner] getInstituteAssessmentOverview error:', err);
        return res.status(500).json({ success: false, error: 'Internal server error.' });
    }
}

// â”€â”€â”€ GET /api/institute-owner/analytics/cohort-progress â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export async function getAnalyticsCohortProgress(req: AuthRequest, res: Response) {
    try {
        const appUserId = (req as any).appUserId as string;
        const instituteId = await getCallerInstitute(appUserId);
        if (!instituteId) {
            return res.status(403).json({ success: false, error: 'Not a member of any institute.' });
        }

        const { instStudentIds } = await resolveInstituteStudents(instituteId);
        if (instStudentIds.length === 0) {
            return res.json({ success: true, data: { monthly_points: [] } });
        }

        const sixMonthsAgo = daysBeforeIST(180);

        const [iaSessions, mockSessions] = await Promise.all([
            prisma.iASession.findMany({
                where: { student_id: { in: instStudentIds }, status: 'COMPLETED' as any, ia_date: { gte: sixMonthsAgo } },
                select: { ia_date: true, scores: true },
            }),
            prisma.mockSession.findMany({
                where: { student_id: { in: instStudentIds }, status: 'COMPLETED' as any, created_at: { gte: sixMonthsAgo } },
                select: { month_year: true, real_band_score: true },
            }),
        ]);

        // Group by YYYY-MM
        const iaByMonth = new Map<string, number[]>();
        for (const ia of iaSessions) {
            const monthStr = toISTDateString(ia.ia_date instanceof Date ? ia.ia_date : new Date(ia.ia_date as any)).slice(0, 7);
            const band = avgBandFromScores(ia.scores);
            if (band > 0) {
                const arr = iaByMonth.get(monthStr) ?? [];
                arr.push(band);
                iaByMonth.set(monthStr, arr);
            }
        }

        const mockByMonth = new Map<string, number[]>();
        for (const m of mockSessions) {
            const band = m.real_band_score != null ? parseFloat(String(m.real_band_score)) : null;
            if (band !== null && band > 0) {
                const arr = mockByMonth.get(m.month_year) ?? [];
                arr.push(band);
                mockByMonth.set(m.month_year, arr);
            }
        }

        // Build 6 monthly data points
        const todayStr = todayISTString();
        const [ty, tm] = todayStr.split('-').map(Number);
        const monthlyPoints: Array<{
            month: string;
            avg_ia_band: number | null;
            avg_real_band: number | null;
            ia_count: number;
            mock_count: number;
        }> = [];

        for (let i = 5; i >= 0; i--) {
            let month = tm - i;
            let year  = ty;
            while (month <= 0) { month += 12; year--; }
            const monthStr = `${year}-${String(month).padStart(2, '0')}`;
            const iaBands  = iaByMonth.get(monthStr) ?? [];
            const mkBands  = mockByMonth.get(monthStr) ?? [];
            monthlyPoints.push({
                month:          monthStr,
                avg_ia_band:    iaBands.length > 0 ? Math.round(iaBands.reduce((a, b) => a + b, 0) / iaBands.length * 10) / 10 : null,
                avg_real_band:  mkBands.length > 0 ? Math.round(mkBands.reduce((a, b) => a + b, 0) / mkBands.length * 10) / 10 : null,
                ia_count:       iaBands.length,
                mock_count:     mkBands.length,
            });
        }

        return res.json({ success: true, data: { monthly_points: monthlyPoints } });
    } catch (err) {
        console.error('[InstituteOwner] getAnalyticsCohortProgress error:', err);
        return res.status(500).json({ success: false, error: 'Internal server error.' });
    }
}

// â”€â”€â”€ GET /api/institute-owner/analytics/batch-comparison â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export async function getAnalyticsBatchComparison(req: AuthRequest, res: Response) {
    try {
        const appUserId = (req as any).appUserId as string;
        const instituteId = await getCallerInstitute(appUserId);
        if (!instituteId) {
            return res.status(403).json({ success: false, error: 'Not a member of any institute.' });
        }

        const batches: any[] = await prisma.batch.findMany({
            where: { institute_id: instituteId },
            include: {
                batch_students: { select: { user_id: true } },
            },
        });

        const allUserIds = [...new Set(batches.flatMap((b: any) => b.batch_students.map((s: any) => s.user_id)))];
        if (allUserIds.length === 0) {
            return res.json({ success: true, data: [] });
        }

        const instStudents = await prisma.instituteStudent.findMany({
            where: { user_id: { in: allUserIds } },
            select: { id: true, user_id: true, isDiagnosed: true, daily_streak: true, momentum_score: true },
        });

        const allInstIds = instStudents.map(s => s.id);
        const instByUserId = new Map(instStudents.map(s => [s.user_id, s]));

        const [competencyRows, diagnosticHistory, drillsTodayRaw, iaLast7Raw, atRiskFlagsAll] = await Promise.all([
            prisma.studentCompetencyMatrix.findMany({
                where: { student_id: { in: allInstIds } },
                select: { student_id: true, band_score: true },
            }),
            prisma.assessmentHistory.findMany({
                where:   { student_id: { in: allInstIds }, mode: 'DIAGNOSTIC' as any },
                orderBy: { created_at: 'asc' },   // ascending — baselineBandByStudent needs oldest-first
                select:  { student_id: true, skill: true, band_score: true },
            }),
            prisma.drillSession.groupBy({
                by: ['student_id'],
                where: { student_id: { in: allInstIds }, created_at: { gte: todayStartIST() } },
                _count: { id: true },
            }),
            prisma.iASession.groupBy({
                by: ['student_id'],
                where: { student_id: { in: allInstIds }, status: 'COMPLETED' as any, ia_date: { gte: daysBeforeIST(7) } },
                _count: { id: true },
            }),
            computeAtRiskFlags(allInstIds, instStudents),
        ]);

        // Canonical per-student bands — baseline is first-entry-per-skill, current
        // is the per-student mean. See lib/batchDashboardQueries for why both are
        // computed per student before any group aggregation.
        const currentByInstId  = currentBandByStudent(competencyRows);
        const baselineByInstId = baselineBandByStudent(diagnosticHistory as any);

        const activeTodaySet    = new Set((drillsTodayRaw as any[]).map((r: any) => r.student_id));
        const iaCompletedMap    = new Map((iaLast7Raw as any[]).map((r: any) => [r.student_id, (r._count as any).id as number]));
        const atRiskSet         = new Set((atRiskFlagsAll as AtRiskFlag[]).map(r => r.student_id));

        const result = batches.map((b: any) => {
            const batchUserIds: string[] = b.batch_students.map((s: any) => s.user_id);
            const batchInstIds = batchUserIds.map(uid => instByUserId.get(uid)).filter(Boolean).map((s: any) => s.id);

            const studentCount = batchUserIds.length;
            const activeToday  = batchInstIds.filter(id => activeTodaySet.has(id)).length;

            const avgBandRaw      = meanOver(batchInstIds, currentByInstId);
            const diagBaselineRaw = meanOver(batchInstIds, baselineByInstId);
            const improvementRaw  = avgImprovementOver(batchInstIds, baselineByInstId, currentByInstId);

            const avgBand      = avgBandRaw      !== null ? Math.round(avgBandRaw * 10) / 10 : null;
            const diagBaseline = diagBaselineRaw !== null ? Math.round(diagBaselineRaw * 10) / 10 : null;
            // Per-student deltas averaged, NOT avgBand - diagBaseline: those two
            // means cover different populations, so their difference describes a
            // cohort that does not exist.
            const improvementDelta = improvementRaw !== null ? Math.round(improvementRaw * 10) / 10 : null;

            const iaCompleted = batchInstIds.reduce((sum, id) => sum + (iaCompletedMap.get(id) ?? 0), 0);
            const iaCompletionRate = studentCount > 0 ? Math.round(iaCompleted / studentCount * 100) : 0;

            const engagementRate = studentCount > 0 ? Math.round(activeToday / studentCount * 100) : 0;
            const atRiskCount    = batchInstIds.filter(id => atRiskSet.has(id)).length;
            const atRiskPct      = studentCount > 0 ? Math.round(atRiskCount / studentCount * 100) : 0;

            return {
                batch_id:          b.id,
                batch_name:        b.name,
                student_count:     studentCount,
                avg_band:          avgBand,
                diagnostic_baseline: diagBaseline,
                improvement_delta: improvementDelta,
                ia_completion_rate: iaCompletionRate,
                engagement_rate:   engagementRate,
                at_risk_pct:       atRiskPct,
            };
        });

        return res.json({ success: true, data: result });
    } catch (err) {
        console.error('[InstituteOwner] getAnalyticsBatchComparison error:', err);
        return res.status(500).json({ success: false, error: 'Internal server error.' });
    }
}

// â”€â”€â”€ GET /api/institute-owner/analytics/instructor-effectiveness â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export async function getAnalyticsInstructorEffectiveness(req: AuthRequest, res: Response) {
    try {
        const appUserId = (req as any).appUserId as string;
        const instituteId = await getCallerInstitute(appUserId);
        if (!instituteId) {
            return res.status(403).json({ success: false, error: 'Not a member of any institute.' });
        }

        const batches: any[] = await prisma.batch.findMany({
            where: { institute_id: instituteId },
            include: {
                batch_instructors: {
                    include: { User: { select: { id: true, name: true, profileImage: true } } },
                },
                batch_students: { select: { user_id: true } },
            },
        });

        // Build instructor â†’ instStudentIds mapping
        const instructorStudents = new Map<string, { user: any; instIds: string[]; batchCount: number }>();

        const allUserIds = [...new Set(batches.flatMap((b: any) => b.batch_students.map((s: any) => s.user_id)))];
        const instStudents = allUserIds.length > 0
            ? await prisma.instituteStudent.findMany({
                where: { user_id: { in: allUserIds } },
                select: { id: true, user_id: true, isDiagnosed: true, daily_streak: true, momentum_score: true, target_band: true },
            })
            : [];
        const instByUserId = new Map(instStudents.map(s => [s.user_id, s]));

        for (const b of batches) {
            const batchInstIds = (b.batch_students as any[])
                .map((s: any) => instByUserId.get(s.user_id))
                .filter(Boolean)
                .map((s: any) => s.id);

            for (const bi of b.batch_instructors) {
                const uid = bi.User.id;
                if (!instructorStudents.has(uid)) {
                    instructorStudents.set(uid, { user: bi.User, instIds: [], batchCount: 0 });
                }
                const existing = instructorStudents.get(uid)!;
                const newIds = batchInstIds.filter((id: string) => !existing.instIds.includes(id));
                existing.instIds.push(...newIds);
                existing.batchCount += 1;
            }
        }

        if (instructorStudents.size === 0) {
            return res.json({ success: true, data: [] });
        }

        const allInstIds = [...new Set([...instructorStudents.values()].flatMap(e => e.instIds))];

        const [competencyRows, diagnosticHistory, iaCompletedRaw, iaScheduledRaw, atRiskFlagsAll] = await Promise.all([
            prisma.studentCompetencyMatrix.findMany({
                where: { student_id: { in: allInstIds } },
                select: { student_id: true, band_score: true },
            }),
            prisma.assessmentHistory.findMany({
                where:   { student_id: { in: allInstIds }, mode: 'DIAGNOSTIC' as any },
                orderBy: { created_at: 'asc' },   // ascending — baselineBandByStudent needs oldest-first
                select:  { student_id: true, skill: true, band_score: true },
            }),
            prisma.iASession.groupBy({
                by: ['student_id'],
                where: { student_id: { in: allInstIds }, status: 'COMPLETED' as any },
                _count: { id: true },
            }),
            // Denominator for a real completion rate: every IA the student was
            // scheduled for, whatever its status. Without this, "rate" was
            // completed-sessions / student-count, which is an average count per
            // student and exceeds 100% as soon as anyone sits a second IA.
            prisma.iASession.groupBy({
                by: ['student_id'],
                where: { student_id: { in: allInstIds } },
                _count: { id: true },
            }),
            computeAtRiskFlags(allInstIds, instStudents),
        ]);

        // Canonical per-student bands — baseline is first-entry-per-skill (NOT the
        // mean of every diagnostic row, which blended retakes into the starting
        // point and disagreed with the student deep-dive).
        // avgBandByInstId doubles as the "at target" comparison below, so current
        // band has one definition in this handler.
        const avgBandByInstId  = currentBandByStudent(competencyRows);
        const baselineByInstId = baselineBandByStudent(diagnosticHistory as any);

        const iaMap = new Map((iaCompletedRaw as any[]).map((r: any) => [r.student_id, (r._count as any).id as number]));
        const iaTotalMap = new Map((iaScheduledRaw as any[]).map((r: any) => [r.student_id, (r._count as any).id as number]));
        const atRiskSet = new Set((atRiskFlagsAll as AtRiskFlag[]).map(r => r.student_id));

        const instById = new Map(instStudents.map(s => [s.id, s]));

        const result = Array.from(instructorStudents.entries()).map(([uid, { user, instIds, batchCount }]) => {
            const studentCount = instIds.length;
            // Per-student deltas averaged over students who have BOTH a baseline
            // and a current band — see avgImprovementOver for why this is not
            // groupMeanCurrent - groupMeanBaseline.
            const improvementRaw = avgImprovementOver(instIds, baselineByInstId, avgBandByInstId);
            const avgImprovement = improvementRaw !== null ? Math.round(improvementRaw * 10) / 10 : null;

            // Completion rate = completed IAs / scheduled IAs, as a percent.
            // Previously completed / studentCount, which is a per-student average
            // count and produced values like 171% and 994%.
            const iaCompleted = instIds.reduce((sum, id) => sum + (iaMap.get(id) ?? 0), 0);
            const iaScheduled = instIds.reduce((sum, id) => sum + (iaTotalMap.get(id) ?? 0), 0);
            const iaRate = iaScheduled > 0 ? Math.round((iaCompleted / iaScheduled) * 100) : 0;

            const atRiskCount = instIds.filter(id => atRiskSet.has(id)).length;

            // Students whose current average band has reached their own target.
            // Only counted where BOTH a band and a target exist — a student with
            // no target is not "below target", they are unmeasured.
            const studentsAtTarget = instIds.filter(id => {
                const band = avgBandByInstId.get(id);
                const target = instById.get(id)?.target_band;
                return band != null && target != null && band >= target;
            }).length;

            const streaks = instIds.map(id => instById.get(id)?.daily_streak ?? 0);
            const avgStreak = streaks.length > 0
                ? Math.round(streaks.reduce((a, b) => a + b, 0) / streaks.length)
                : 0;

            return {
                user_id:          uid,
                name:             user.name,
                avatar:           user.profileImage,
                batch_count:      batchCount,
                student_count:    studentCount,
                avg_band_improvement: avgImprovement,
                ia_completion_rate:  iaRate,
                at_risk_count:    atRiskCount,
                students_at_target: studentsAtTarget,
                avg_student_streak: avgStreak,
            };
        });

        return res.json({ success: true, data: result });
    } catch (err) {
        console.error('[InstituteOwner] getAnalyticsInstructorEffectiveness error:', err);
        return res.status(500).json({ success: false, error: 'Internal server error.' });
    }
}

// â”€â”€â”€ GET /api/institute-owner/analytics/engagement-trends â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export async function getAnalyticsEngagementTrends(req: AuthRequest, res: Response) {
    try {
        const appUserId = (req as any).appUserId as string;
        const instituteId = await getCallerInstitute(appUserId);
        if (!instituteId) {
            return res.status(403).json({ success: false, error: 'Not a member of any institute.' });
        }

        const { instStudents, instStudentIds } = await resolveInstituteStudents(instituteId);
        if (instStudentIds.length === 0) {
            return res.json({ success: true, data: [] });
        }

        const eightWeeksAgo = daysBeforeIST(56);

        const drillSessions = await prisma.drillSession.findMany({
            where: { student_id: { in: instStudentIds }, created_at: { gte: eightWeeksAgo } },
            select: { student_id: true, correct_answers: true, total_questions: true, created_at: true },
        });

        // Get ISO week start (Monday) for a date
        function getISOWeekStart(d: Date): string {
            const istDate = new Date(d.getTime() + 5.5 * 60 * 60 * 1000);
            const day = istDate.getUTCDay(); // 0 = Sun
            const diff = (day === 0 ? -6 : 1 - day);
            const mon = new Date(istDate.getTime() + diff * 24 * 60 * 60 * 1000);
            return `${mon.getUTCFullYear()}-${String(mon.getUTCMonth() + 1).padStart(2, '0')}-${String(mon.getUTCDate()).padStart(2, '0')}`;
        }

        // Group drills by ISO week
        const weekMap = new Map<string, { students: Set<string>; correct: number; total: number }>();
        for (const d of drillSessions) {
            const week = getISOWeekStart(d.created_at);
            const entry = weekMap.get(week) ?? { students: new Set(), correct: 0, total: 0 };
            entry.students.add(d.student_id);
            entry.correct += d.correct_answers;
            entry.total   += d.total_questions;
            weekMap.set(week, entry);
        }

        // Build 8 weekly points newestâ†’oldest
        const todayStart = todayStartIST();
        const weeklyPoints: Array<{
            week_start: string;
            engagement_rate: number;
            avg_dcs: number | null;
            active_students: number;
        }> = [];

        for (let i = 7; i >= 0; i--) {
            const weekStartMs = todayStart.getTime() - (i * 7 + todayStart.getDay()) * 24 * 60 * 60 * 1000;
            const weekStart   = getISOWeekStart(new Date(weekStartMs - (7 * 24 * 60 * 60 * 1000 * i)));
            // Re-derive cleanly: go back i*7 days from today and find that Monday
            const anchor = new Date(todayStart.getTime() - i * 7 * 24 * 60 * 60 * 1000);
            const weekKey = getISOWeekStart(anchor);
            const entry   = weekMap.get(weekKey);
            const active  = entry?.students.size ?? 0;
            const engRate = instStudentIds.length > 0 ? Math.round(active / instStudentIds.length * 100) : 0;
            const avgDcs  = entry && entry.total > 0
                ? Math.round(entry.correct / entry.total * 100)
                : null;
            weeklyPoints.push({ week_start: weekKey, engagement_rate: engRate, avg_dcs: avgDcs, active_students: active });
        }

        return res.json({ success: true, data: weeklyPoints });
    } catch (err) {
        console.error('[InstituteOwner] getAnalyticsEngagementTrends error:', err);
        return res.status(500).json({ success: false, error: 'Internal server error.' });
    }
}

// â”€â”€â”€ GET /api/institute-owner/analytics/goal-achievement â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export async function getAnalyticsGoalAchievement(req: AuthRequest, res: Response) {
    try {
        const appUserId = (req as any).appUserId as string;
        const instituteId = await getCallerInstitute(appUserId);
        if (!instituteId) {
            return res.status(403).json({ success: false, error: 'Not a member of any institute.' });
        }

        const batches: any[] = await prisma.batch.findMany({
            where: { institute_id: instituteId },
            include: { batch_students: { select: { user_id: true } } },
        });

        const allUserIds = [...new Set(batches.flatMap((b: any) => b.batch_students.map((s: any) => s.user_id)))];
        if (allUserIds.length === 0) {
            return res.json({ success: true, data: { below: 0, near: 0, at_or_above: 0, exam_ready: 0, by_batch: [] } });
        }

        const instStudents = await prisma.instituteStudent.findMany({
            where: { user_id: { in: allUserIds } },
            select: { id: true, user_id: true, target_band: true },
        });

        const instStudentIds = instStudents.map(s => s.id);
        const instByUserId   = new Map(instStudents.map(s => [s.user_id, s]));

        const [competencyRows, completedMocks] = await Promise.all([
            prisma.studentCompetencyMatrix.findMany({
                where: { student_id: { in: instStudentIds } },
                select: { student_id: true, band_score: true },
            }),
            prisma.mockSession.groupBy({
                by: ['student_id'],
                where: { student_id: { in: instStudentIds }, status: 'COMPLETED' as any },
                _count: { id: true },
            }),
        ]);

        const competencyByInstId = new Map<string, Array<{ band_score: unknown }>>();
        for (const row of competencyRows) {
            const arr = competencyByInstId.get(row.student_id) ?? [];
            arr.push(row);
            competencyByInstId.set(row.student_id, arr);
        }
        const mockCountByInstId = new Map((completedMocks as any[]).map((r: any) => [r.student_id, (r._count as any).id as number]));

        // Classify each student
        let below = 0, near = 0, atOrAbove = 0, examReady = 0;

        const byBatch = batches.map((b: any) => {
            const batchUserIds: string[] = b.batch_students.map((s: any) => s.user_id);
            let bBelow = 0, bNear = 0, bAtOrAbove = 0, bExamReady = 0;

            for (const uid of batchUserIds) {
                const inst = instByUserId.get(uid);
                if (!inst) continue;
                const competency    = competencyByInstId.get(inst.id) ?? [];
                const current_band  = computeCurrentBand(competency);
                const target_band   = inst.target_band ? parseFloat(String(inst.target_band)) : null;
                const gap           = current_band !== null && target_band !== null ? target_band - current_band : null;
                const hasMock       = (mockCountByInstId.get(inst.id) ?? 0) > 0;

                if (gap === null) { bBelow++; continue; }
                if (gap > 0.5)       { bBelow++; }
                else if (gap > 0)    { bNear++; }
                else                 { bAtOrAbove++; if (hasMock) bExamReady++; }
            }

            below     += bBelow;
            near      += bNear;
            atOrAbove += bAtOrAbove;
            examReady += bExamReady;

            return {
                batch_id:   b.id,
                batch_name: b.name,
                below:      bBelow,
                near:       bNear,
                at_or_above: bAtOrAbove,
                exam_ready:  bExamReady,
            };
        });

        return res.json({
            success: true,
            data: { below, near, at_or_above: atOrAbove, exam_ready: examReady, by_batch: byBatch },
        });
    } catch (err) {
        console.error('[InstituteOwner] getAnalyticsGoalAchievement error:', err);
        return res.status(500).json({ success: false, error: 'Internal server error.' });
    }
}

// â”€â”€â”€ GET /api/institute-owner/analytics/subskill-heatmap â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export async function getAnalyticsSubskillHeatmap(req: AuthRequest, res: Response) {
    try {
        const appUserId = (req as any).appUserId as string;
        const instituteId = await getCallerInstitute(appUserId);
        if (!instituteId) {
            return res.status(403).json({ success: false, error: 'Not a member of any institute.' });
        }

        const { instStudentIds } = await resolveInstituteStudents(instituteId);
        if (instStudentIds.length === 0) {
            return res.json({ success: true, data: [] });
        }

        const drillAggs = await prisma.drillSession.groupBy({
            by:    ['skill', 'sub_skill'],
            where: { student_id: { in: instStudentIds } },
            _count: { id: true },
            _sum:   { correct_answers: true, total_questions: true },
        });

        const heatmap = drillAggs.map(row => {
            const correct = (row._sum as any).correct_answers as number ?? 0;
            const total   = (row._sum as any).total_questions as number ?? 0;
            return {
                skill:        String(row.skill),
                sub_skill:    String(row.sub_skill),
                drill_count:  (row._count as any).id as number,
                avg_accuracy: total > 0 ? Math.round(correct / total * 100) : 0,
            };
        }).sort((a, b) => {
            if (a.skill !== b.skill) return a.skill.localeCompare(b.skill);
            return a.avg_accuracy - b.avg_accuracy; // worst sub-skills first within skill
        });

        return res.json({ success: true, data: heatmap });
    } catch (err) {
        console.error('[InstituteOwner] getAnalyticsSubskillHeatmap error:', err);
        return res.status(500).json({ success: false, error: 'Internal server error.' });
    }
}
