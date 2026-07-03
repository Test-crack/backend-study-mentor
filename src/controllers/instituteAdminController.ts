// src/controllers/instituteAdminController.ts
import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import prisma from '../lib/prisma';
import { supabaseAdmin } from '../lib/supabase';
import { UserRoleType } from '@prisma/client';

// ─── Helper: resolve the institute the caller is admin/owner of ──────────────

async function getInstituteId(appUserId: string): Promise<string | null> {
    // Check if admin
    const adminRow = await prisma.institute_admins.findUnique({
        where: { user_id: appUserId },
        select: { institute_id: true },
    });
    if (adminRow) return adminRow.institute_id;

    // Check if owner
    const ownerRow = await prisma.institute_owners.findUnique({
        where: { user_id: appUserId },
        select: { institute_id: true },
    });
    return ownerRow?.institute_id ?? null;
}

// ─────────────────────────────────────────────────────────────────────────────
// STUDENTS
// ─────────────────────────────────────────────────────────────────────────────

// GET /api/institute-admin/students
export async function getStudents(req: AuthRequest, res: Response) {
    try {
        const appUserId = (req as any).appUserId as string;
        const instituteId = await getInstituteId(appUserId);
        if (!instituteId) return res.status(403).json({ error: 'Not part of any institute.' });

        const { search } = req.query as Record<string, string>;

        const students = await prisma.institute_students.findMany({
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
            const existingEnrollment = await prisma.institute_students.findUnique({
                where: { user_id: dbUser.id },
            });
            if (existingEnrollment) {
                if (existingEnrollment.institute_id === instituteId) {
                    return res.status(409).json({ error: 'This student is already enrolled in your institute.' });
                }
                return res.status(409).json({ error: 'This student is already enrolled at another institute.' });
            }
        }

        // 2. Send Supabase invite email
        const { data: inviteData, error: inviteError } = await supabaseAdmin.auth.admin.inviteUserByEmail(
            email,
            {
                data: { full_name: name, role: 'STUDENT' },
                redirectTo: `${process.env.FRONTEND_URL ?? 'http://localhost:8080'}/login`,
            }
        );

        const alreadyRegistered = !!inviteError?.message?.includes('already been registered');
        if (inviteError && !alreadyRegistered) {
            throw inviteError;
        }

        const supabaseUserId = inviteData?.user?.id;

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

            await tx.institute_students.create({
                data: { user_id: user.id, institute_id: instituteId, is_active: true },
            });

            return user;
        });

        return res.status(201).json({
            data: {
                userId: savedUser.id,
                name:   savedUser.name,
                email:  savedUser.email,
                inviteEmailSent: !inviteError,
            },
        });
    } catch (err: any) {
        // Race condition: two concurrent requests both passed the duplicate check —
        // the second hits the unique constraint. Return 409 instead of a raw 500.
        if (err.code === 'P2002') {
            return res.status(409).json({ error: 'This student is already enrolled in your institute.' });
        }
        console.error('[InstituteAdmin] addStudent error:', err);
        return res.status(500).json({
            error: 'Enrollment failed. If an invite email was already sent, please retry — the student record was not saved.',
        });
    }
}

// DELETE /api/institute-admin/students/:userId
export async function removeStudent(req: AuthRequest, res: Response) {
    const { userId } = req.params;

    try {
        const appUserId = (req as any).appUserId as string;
        const instituteId = await getInstituteId(appUserId);
        if (!instituteId) return res.status(403).json({ error: 'Not part of any institute.' });

        const row = await prisma.institute_students.findFirst({
            where: { user_id: userId, institute_id: instituteId },
        });
        if (!row) return res.status(404).json({ error: 'Student not found in your institute.' });

        await prisma.institute_students.delete({ where: { id: row.id } });

        return res.json({ data: { removed: true, userId } });
    } catch (err: any) {
        console.error('[InstituteAdmin] removeStudent error:', err);
        return res.status(500).json({ error: err.message ?? 'Failed to remove student' });
    }
}

// PATCH /api/institute-admin/students/:userId/status
// Body: { isActive: boolean }
export async function updateStudentStatus(req: AuthRequest, res: Response) {
    const { userId } = req.params;
    const { isActive } = req.body as { isActive: boolean };

    if (typeof isActive !== 'boolean') {
        return res.status(400).json({ error: 'isActive (boolean) is required.' });
    }

    try {
        const appUserId = (req as any).appUserId as string;
        const instituteId = await getInstituteId(appUserId);
        if (!instituteId) return res.status(403).json({ error: 'Not part of any institute.' });

        const row = await prisma.institute_students.findFirst({
            where: { user_id: userId, institute_id: instituteId },
        });
        if (!row) return res.status(404).json({ error: 'Student not found in your institute.' });

        await prisma.institute_students.update({
            where: { id: row.id },
            data: { is_active: isActive },
        });

        return res.json({ data: { updated: true, userId, isActive } });
    } catch (err: any) {
        console.error('[InstituteAdmin] updateStudentStatus error:', err);
        return res.status(500).json({ error: err.message ?? 'Failed to update student status' });
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// TUTORS (INSTRUCTORS)
// ─────────────────────────────────────────────────────────────────────────────

// GET /api/institute-admin/tutors
export async function getTutors(req: AuthRequest, res: Response) {
    try {
        const appUserId = (req as any).appUserId as string;
        const instituteId = await getInstituteId(appUserId);
        if (!instituteId) return res.status(403).json({ error: 'Not part of any institute.' });

        const { search } = req.query as Record<string, string>;

        const tutors = await prisma.institute_instructors.findMany({
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

        let dbUser = await prisma.user.findUnique({ where: { email: tutorEmail } });
        if (dbUser) {
            if (dbUser.role !== UserRoleType.INSTRUCTOR) {
                return res.status(409).json({ error: 'Email already linked with existing user. Contact - blinkgrid@gmail.com' });
            }
            const alreadyEnrolled = await prisma.institute_instructors.findFirst({
                where: { user_id: dbUser.id, institute_id: instituteId },
            });
            if (alreadyEnrolled) {
                return res.status(409).json({ error: 'This tutor is already onboarded in your institute.' });
            }
        }

        // 1. Send Supabase invite email
        const { data: inviteData, error: inviteError } = await supabaseAdmin.auth.admin.inviteUserByEmail(
            tutorEmail,
            {
                data: { full_name: tutorName, role: 'INSTRUCTOR' },
                redirectTo: `${process.env.FRONTEND_URL ?? 'http://localhost:8080'}/login`,
            }
        );

        if (inviteError && !inviteError.message.includes('already been registered')) {
            throw inviteError;
        }

        const supabaseUserId = inviteData?.user?.id;

        // 2 + 3. Atomic: create User row AND institute_instructors in one transaction.
        const savedUser = await prisma.$transaction(async (tx) => {
            let user = dbUser;
            if (!user) {
                user = await tx.user.create({
                    data: {
                        email: tutorEmail,
                        name: tutorName,
                        role: UserRoleType.INSTRUCTOR,
                        supabaseuserid: supabaseUserId ?? `pending-${Date.now()}`,
                    },
                });
            }

            await tx.institute_instructors.upsert({
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
                inviteEmailSent: !inviteError,
            },
        });
    } catch (err: any) {
        if (err.code === 'P2002') {
            return res.status(409).json({ error: 'This tutor is already onboarded in your institute.' });
        }
        console.error('[InstituteAdmin] addTutor error:', err);
        return res.status(500).json({
            error: 'Onboarding failed. If an invite email was already sent, please retry — the tutor record was not saved.',
        });
    }
}

// DELETE /api/institute-admin/tutors/:userId
export async function removeTutor(req: AuthRequest, res: Response) {
    const { userId } = req.params;

    try {
        const appUserId = (req as any).appUserId as string;
        const instituteId = await getInstituteId(appUserId);
        if (!instituteId) return res.status(403).json({ error: 'Not part of any institute.' });

        const row = await prisma.institute_instructors.findFirst({
            where: { user_id: userId, institute_id: instituteId },
        });
        if (!row) return res.status(404).json({ error: 'Tutor not found in your institute.' });

        await prisma.institute_instructors.delete({ where: { id: row.id } });

        // Downgrade role back to STUDENT
        await prisma.user.update({
            where: { id: userId },
            data: { role: UserRoleType.STUDENT },
        });

        return res.json({ data: { removed: true, userId } });
    } catch (err: any) {
        console.error('[InstituteAdmin] removeTutor error:', err);
        return res.status(500).json({ error: err.message ?? 'Failed to remove tutor' });
    }
}
