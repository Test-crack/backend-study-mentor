// src/controllers/instituteAdminController.ts
import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import prisma from '../lib/prisma';
import { sendInvite } from '../lib/sendInvite';
import { UserRoleType } from '@prisma/client';
import { paramStr } from '../utils/httpParams';

// â”€â”€â”€ Helper: resolve the institute the caller is admin/owner of â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

async function getInstituteId(appUserId: string): Promise<string | null> {
    // Check if admin
    const adminRow = await prisma.instituteAdmin.findUnique({
        where: { user_id: appUserId },
        select: { institute_id: true },
    });
    if (adminRow) return adminRow.institute_id;

    // Check if owner
    const ownerRow = await prisma.instituteOwner.findUnique({
        where: { user_id: appUserId },
        select: { institute_id: true },
    });
    return ownerRow?.institute_id ?? null;
}

// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// STUDENTS
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

// GET /api/institute-admin/students
export async function getStudents(req: AuthRequest, res: Response) {
    try {
        const appUserId = (req as any).appUserId as string;
        const instituteId = await getInstituteId(appUserId);
        if (!instituteId) return res.status(403).json({ error: 'Not part of any institute.' });

        const { search } = req.query as Record<string, string>;

        const students = await prisma.instituteStudent.findMany({
            where: {
                institute_id: instituteId,
                ...(search?.trim()
                    ? {
                        User: {
                            OR: [
                                { name: { contains: search, mode: 'insensitive' } },
                                { email: { contains: search, mode: 'insensitive' } },
                            ],
                        },
                    }
                    : {}),
            },
            orderBy: { created_at: 'desc' },
            include: {
                User: {
                    select: { id: true, name: true, email: true, phoneNo: true, profileImage: true, createdAt: true },
                },
            },
        });

        const data = students.map((s) => ({
            id: s.id,
            userId: s.User.id,
            name: s.User.name,
            email: s.User.email,
            phone: s.User.phoneNo,
            profileImage: s.User.profileImage,
            enrolledAt: s.enrollment_date,
            isActive: s.is_active,
            createdAt: s.created_at,
        }));

        return res.json({ data, instituteId });
    } catch (err) {
        console.error('[InstituteAdmin] getStudents error:', err);
        return res.status(500).json({ error: 'Failed to fetch students' });
    }
}

// POST /api/institute-admin/students
// Body: { studentName, studentEmail }
export async function addStudent(req: AuthRequest, res: Response) {
    const { studentName, studentEmail } = req.body as { studentName: string; studentEmail: string };

    if (!studentName?.trim() || !studentEmail?.trim()) {
        return res.status(400).json({ error: 'studentName and studentEmail are required.' });
    }

    try {
        const appUserId = (req as any).appUserId as string;
        const instituteId = await getInstituteId(appUserId);
        if (!instituteId) return res.status(403).json({ error: 'Not part of any institute.' });

        const email = studentEmail.trim().toLowerCase();
        const name  = studentName.trim();

        // 1. Check existing User record
        let dbUser = await prisma.user.findUnique({ where: { email } });
        if (dbUser) {
            if (dbUser.role !== UserRoleType.STUDENT) {
                return res.status(409).json({ error: 'Email already linked with a non-student account. Contact blinkgrid@gmail.com' });
            }

            // Check enrollment across ALL institutes (user_id is unique in institute_students)
            const existingEnrollment = await prisma.instituteStudent.findUnique({
                where: { user_id: dbUser.id },
            });
            if (existingEnrollment) {
                if (existingEnrollment.institute_id === instituteId) {
                    return res.status(409).json({ error: 'This student is already enrolled in your institute.' });
                }
                return res.status(409).json({ error: 'This student is already enrolled at another institute.' });
            }
        }

        // 2. Create the auth user + send a role-specific branded invite email (Resend).
        //    Redirect targets FRONTEND_URL/auth/callback (set-password flow), not /login.
        const { userId: supabaseUserId, emailSent } = await sendInvite({
            email, name, role: 'STUDENT', origin: req.get('origin') ?? undefined,
        });

        // 3 + 4. Atomic: create/link User row AND institute_students in one transaction.
        // If institute_students.create fails (e.g. race condition), the User write rolls back too.
        const savedUser = await prisma.$transaction(async (tx) => {
            let user = dbUser;
            if (!user) {
                user = await tx.user.create({
                    data: {
                        email,
                        name,
                        role: UserRoleType.STUDENT,
                        // pending-* self-heals on first login via ensureUser email-linking
                        supabaseuserid: supabaseUserId ?? `pending-${Date.now()}`,
                    },
                });
            } else if (supabaseUserId && user.supabaseuserid.startsWith('pending-')) {
                user = await tx.user.update({
                    where: { id: user.id },
                    data:  { supabaseuserid: supabaseUserId },
                });
            }

            await tx.instituteStudent.create({
                data: { user_id: user.id, institute_id: instituteId, is_active: true },
            });

            return user;
        });

        return res.status(201).json({
            data: {
                userId: savedUser.id,
                name:   savedUser.name,
                email:  savedUser.email,
                inviteEmailSent: emailSent,
            },
        });
    } catch (err: any) {
        // Race condition: two concurrent requests both passed the duplicate check â€”
        // the second hits the unique constraint. Return 409 instead of a raw 500.
        if (err.code === 'P2002') {
            return res.status(409).json({ error: 'This student is already enrolled in your institute.' });
        }
        console.error('[InstituteAdmin] addStudent error:', err);
        return res.status(500).json({
            error: 'Enrollment failed. If an invite email was already sent, please retry â€” the student record was not saved.',
        });
    }
}

// DELETE /api/institute-admin/students/:userId
export async function removeStudent(req: AuthRequest, res: Response) {
    const userId = paramStr(req.params.userId);

    try {
        const appUserId = (req as any).appUserId as string;
        const instituteId = await getInstituteId(appUserId);
        if (!instituteId) return res.status(403).json({ error: 'Not part of any institute.' });

        const row = await prisma.instituteStudent.findFirst({
            where: { user_id: userId, institute_id: instituteId },
        });
        if (!row) return res.status(404).json({ error: 'Student not found in your institute.' });

        await prisma.instituteStudent.delete({ where: { id: row.id } });

        return res.json({ data: { removed: true, userId } });
    } catch (err: any) {
        console.error('[InstituteAdmin] removeStudent error:', err);
        return res.status(500).json({ error: err.message ?? 'Failed to remove student' });
    }
}

// PATCH /api/institute-admin/students/:userId/status
// Body: { isActive: boolean }
export async function updateStudentStatus(req: AuthRequest, res: Response) {
    const userId = paramStr(req.params.userId);
    const { isActive } = req.body as { isActive: boolean };

    if (typeof isActive !== 'boolean') {
        return res.status(400).json({ error: 'isActive (boolean) is required.' });
    }

    try {
        const appUserId = (req as any).appUserId as string;
        const instituteId = await getInstituteId(appUserId);
        if (!instituteId) return res.status(403).json({ error: 'Not part of any institute.' });

        const row = await prisma.instituteStudent.findFirst({
            where: { user_id: userId, institute_id: instituteId },
        });
        if (!row) return res.status(404).json({ error: 'Student not found in your institute.' });

        await prisma.instituteStudent.update({
            where: { id: row.id },
            data: { is_active: isActive },
        });

        return res.json({ data: { updated: true, userId, isActive } });
    } catch (err: any) {
        console.error('[InstituteAdmin] updateStudentStatus error:', err);
        return res.status(500).json({ error: err.message ?? 'Failed to update student status' });
    }
}

// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// TUTORS (INSTRUCTORS)
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

// GET /api/institute-admin/tutors
export async function getTutors(req: AuthRequest, res: Response) {
    try {
        const appUserId = (req as any).appUserId as string;
        const instituteId = await getInstituteId(appUserId);
        if (!instituteId) return res.status(403).json({ error: 'Not part of any institute.' });

        const { search } = req.query as Record<string, string>;

        const tutors = await prisma.instituteInstructor.findMany({
            where: {
                institute_id: instituteId,
                ...(search?.trim()
                    ? {
                        User: {
                            OR: [
                                { name: { contains: search, mode: 'insensitive' } },
                                { email: { contains: search, mode: 'insensitive' } },
                            ],
                        },
                    }
                    : {}),
            },
            orderBy: { created_at: 'desc' },
            include: {
                User: {
                    select: { id: true, name: true, email: true, phoneNo: true, profileImage: true, createdAt: true },
                },
            },
        });

        const data = tutors.map((t) => ({
            id: t.id,
            userId: t.User.id,
            name: t.User.name,
            email: t.User.email,
            phone: t.User.phoneNo,
            profileImage: t.User.profileImage,
            specialization: t.specialization,
            bio: t.bio,
            createdAt: t.created_at,
        }));

        return res.json({ data, instituteId });
    } catch (err) {
        console.error('[InstituteAdmin] getTutors error:', err);
        return res.status(500).json({ error: 'Failed to fetch tutors' });
    }
}

// POST /api/institute-admin/tutors
// Body: { tutorName, tutorEmail, specialization? }
export async function addTutor(req: AuthRequest, res: Response) {
    const { tutorName, tutorEmail, specialization } = req.body as {
        tutorName: string;
        tutorEmail: string;
        specialization?: string;
    };

    if (!tutorName?.trim() || !tutorEmail?.trim()) {
        return res.status(400).json({ error: 'tutorName and tutorEmail are required.' });
    }

    try {
        const appUserId = (req as any).appUserId as string;
        const instituteId = await getInstituteId(appUserId);
        if (!instituteId) return res.status(403).json({ error: 'Not part of any institute.' });

        const email = tutorEmail.trim().toLowerCase();
        const name  = tutorName.trim();

        let dbUser = await prisma.user.findUnique({ where: { email } });
        if (dbUser) {
            if (dbUser.role !== UserRoleType.INSTRUCTOR) {
                return res.status(409).json({ error: 'Email already linked with existing user. Contact - blinkgrid@gmail.com' });
            }
            // institute_instructors.user_id is globally unique â€” a tutor belongs to ONE
            // institute. Check across ALL institutes (not just this one) so we can't
            // silently re-point another institute's tutor into ours via the upsert.
            const existing = await prisma.instituteInstructor.findUnique({
                where: { user_id: dbUser.id },
            });
            if (existing) {
                return res.status(409).json({
                    error: existing.institute_id === instituteId
                        ? 'This tutor is already onboarded in your institute.'
                        : 'This tutor is already onboarded at another institute.',
                });
            }
        }

        // 1. Create the auth user + send a role-specific branded invite email (Resend).
        const { userId: supabaseUserId, emailSent } = await sendInvite({
            email, name, role: 'INSTRUCTOR', origin: req.get('origin') ?? undefined,
        });

        // 2 + 3. Atomic: create User row AND institute_instructors in one transaction.
        const savedUser = await prisma.$transaction(async (tx) => {
            let user = dbUser;
            if (!user) {
                user = await tx.user.create({
                    data: {
                        email,
                        name,
                        role: UserRoleType.INSTRUCTOR,
                        supabaseuserid: supabaseUserId ?? `pending-${Date.now()}`,
                    },
                });
            } else if (supabaseUserId && user.supabaseuserid.startsWith('pending-')) {
                user = await tx.user.update({
                    where: { id: user.id },
                    data:  { supabaseuserid: supabaseUserId },
                });
            }

            await tx.instituteInstructor.upsert({
                where: { user_id: user!.id },
                update: { institute_id: instituteId, specialization: specialization ?? null },
                create: {
                    user_id: user!.id,
                    institute_id: instituteId,
                    specialization: specialization ?? null,
                },
            });

            return user!;
        });

        return res.status(201).json({
            data: {
                userId: savedUser.id,
                name:   savedUser.name,
                email:  savedUser.email,
                inviteEmailSent: emailSent,
            },
        });
    } catch (err: any) {
        if (err.code === 'P2002') {
            return res.status(409).json({ error: 'This tutor is already onboarded in your institute.' });
        }
        console.error('[InstituteAdmin] addTutor error:', err);
        return res.status(500).json({
            error: 'Onboarding failed. If an invite email was already sent, please retry â€” the tutor record was not saved.',
        });
    }
}

// DELETE /api/institute-admin/tutors/:userId
export async function removeTutor(req: AuthRequest, res: Response) {
    const userId = paramStr(req.params.userId);

    try {
        const appUserId = (req as any).appUserId as string;
        const instituteId = await getInstituteId(appUserId);
        if (!instituteId) return res.status(403).json({ error: 'Not part of any institute.' });

        const row = await prisma.instituteInstructor.findFirst({
            where: { user_id: userId, institute_id: instituteId },
        });
        if (!row) return res.status(404).json({ error: 'Tutor not found in your institute.' });

        // Remove only the institute link. Do NOT touch User.role â€” unconditionally
        // downgrading to STUDENT stripped the person's platform role (and, with the
        // former cross-institute poach, let one institute strip a rival's tutor role).
        // Institute membership and platform role are separate concerns (mirrors removeStudent).
        await prisma.instituteInstructor.delete({ where: { id: row.id } });

        return res.json({ data: { removed: true, userId } });
    } catch (err: any) {
        console.error('[InstituteAdmin] removeTutor error:', err);
        return res.status(500).json({ error: err.message ?? 'Failed to remove tutor' });
    }
}

// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// INSTITUTE PROFILE (Settings page)
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

// GET /api/institute-admin/institute
export async function getInstituteProfile(req: AuthRequest, res: Response) {
    try {
        const appUserId = (req as any).appUserId as string;
        const instituteId = await getInstituteId(appUserId);
        if (!instituteId) return res.status(403).json({ error: 'Not part of any institute.' });

        const institute = await prisma.institute.findUnique({
            where:  { id: instituteId },
            select: { id: true, name: true, address: true, logo_url: true, is_active: true, created_at: true },
        });
        if (!institute) return res.status(404).json({ error: 'Institute not found.' });

        return res.json({
            data: {
                id:        institute.id,
                name:      institute.name,
                address:   institute.address,
                logoUrl:   institute.logo_url,
                isActive:  institute.is_active,
                createdAt: institute.created_at,
            },
        });
    } catch (err: any) {
        console.error('[InstituteAdmin] getInstituteProfile error:', err);
        return res.status(500).json({ error: err.message ?? 'Failed to fetch institute profile' });
    }
}

// PATCH /api/institute-admin/institute â€” name / address / logoUrl only.
// is_active is deliberately NOT editable here (that is a platform-level switch).
export async function updateInstituteProfile(req: AuthRequest, res: Response) {
    try {
        const appUserId = (req as any).appUserId as string;
        const instituteId = await getInstituteId(appUserId);
        if (!instituteId) return res.status(403).json({ error: 'Not part of any institute.' });

        const { name, address, logoUrl } = (req.body ?? {}) as { name?: string; address?: string; logoUrl?: string };

        const trimmedName = typeof name === 'string' ? name.trim() : undefined;
        if (trimmedName !== undefined && trimmedName.length === 0) {
            return res.status(400).json({ error: 'Institute name cannot be empty.' });
        }
        if (trimmedName === undefined && address === undefined && logoUrl === undefined) {
            return res.status(400).json({ error: 'Nothing to update.' });
        }

        const updated = await prisma.institute.update({
            where: { id: instituteId },
            data: {
                ...(trimmedName !== undefined ? { name: trimmedName } : {}),
                ...(address     !== undefined ? { address: address || null } : {}),
                ...(logoUrl     !== undefined ? { logo_url: logoUrl || null } : {}),
                updated_at: new Date(),
            },
            select: { id: true, name: true, address: true, logo_url: true },
        });

        return res.json({
            data: { id: updated.id, name: updated.name, address: updated.address, logoUrl: updated.logo_url },
        });
    } catch (err: any) {
        console.error('[InstituteAdmin] updateInstituteProfile error:', err);
        return res.status(500).json({ error: err.message ?? 'Failed to update institute profile' });
    }
}

// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// ONBOARDING STATUS ("Needs attention" â€” the honest replacement for the old
// mock approve/reject queue: invites activate immediately, so what an admin
// actually needs to see is who was invited but never started, and which tutors
// have no batch yet.)
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

// GET /api/institute-admin/onboarding-status
export async function getOnboardingStatus(req: AuthRequest, res: Response) {
    try {
        const appUserId = (req as any).appUserId as string;
        const instituteId = await getInstituteId(appUserId);
        if (!instituteId) return res.status(403).json({ error: 'Not part of any institute.' });

        const [pendingStudents, tutors, batches] = await Promise.all([
            // Students who never completed the diagnostic â€” invited but not started.
            prisma.instituteStudent.findMany({
                where:   { institute_id: instituteId, isDiagnosed: false, is_active: true },
                orderBy: { created_at: 'desc' },
                take:    50,
                include: { User: { select: { id: true, name: true, email: true, profileImage: true } } },
            }),
            prisma.instituteInstructor.findMany({
                where:   { institute_id: instituteId },
                include: {
                    User: {
                        select: {
                            id: true, name: true, email: true, profileImage: true,
                            ielts_batch_instructors: { select: { batch_id: true } },
                        },
                    },
                },
            }),
            (prisma as any).ieltsBatch.findMany({
                where:  { institute_id: instituteId },
                select: { id: true },
            }),
        ]);

        const batchIdSet = new Set((batches as any[]).map(b => b.id));
        const unassignedTutors = tutors
            .filter(t => !t.User.ielts_batch_instructors.some(a => batchIdSet.has(a.batch_id)))
            .map(t => ({
                userId:       t.User.id,
                name:         t.User.name,
                email:        t.User.email,
                profileImage: t.User.profileImage,
                invitedAt:    t.created_at,
            }));

        return res.json({
            data: {
                students_not_started: pendingStudents.map(s => ({
                    userId:       s.User.id,
                    name:         s.User.name,
                    email:        s.User.email,
                    profileImage: s.User.profileImage,
                    invitedAt:    s.created_at,
                })),
                tutors_unassigned: unassignedTutors,
            },
        });
    } catch (err: any) {
        console.error('[InstituteAdmin] getOnboardingStatus error:', err);
        return res.status(500).json({ error: err.message ?? 'Failed to fetch onboarding status' });
    }
}

// POST /api/institute-admin/students/:userId/resend-invite
// Re-issues the invite/recovery email for a student who never got started.
export async function resendStudentInvite(req: AuthRequest, res: Response) {
    try {
        const appUserId = (req as any).appUserId as string;
        const instituteId = await getInstituteId(appUserId);
        if (!instituteId) return res.status(403).json({ error: 'Not part of any institute.' });

        const userId = paramStr(req.params.userId);
        const row = await prisma.instituteStudent.findFirst({
            where:   { user_id: userId, institute_id: instituteId },
            include: { User: { select: { name: true, email: true } }, institutes: { select: { name: true } } },
        });
        if (!row) return res.status(404).json({ error: 'Student not found in your institute.' });

        const result = await sendInvite({
            email:     row.User.email,
            name:      row.User.name ?? '',
            role:      'STUDENT',
            institute: row.institutes.name,
            origin:    req.get('origin') ?? undefined,
        });

        return res.json({ data: { emailSent: result.emailSent } });
    } catch (err: any) {
        console.error('[InstituteAdmin] resendStudentInvite error:', err);
        return res.status(500).json({ error: err.message ?? 'Failed to resend invite' });
    }
}
