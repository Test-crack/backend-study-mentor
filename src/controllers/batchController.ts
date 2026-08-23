// src/controllers/batchController.ts
import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import prisma from '../lib/prisma';

// â”€â”€â”€ Helper â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

async function resolveInstituteId(appUserId: string): Promise<string | null> {
    const admin = await prisma.instituteAdmin.findUnique({
        where: { user_id: appUserId }, select: { institute_id: true },
    });
    if (admin) return admin.institute_id;

    const owner = await prisma.instituteOwner.findUnique({
        where: { user_id: appUserId }, select: { institute_id: true },
    });
    return owner?.institute_id ?? null;
}

// â”€â”€â”€ Types expected after prisma db pull (snake_case models) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// batch, batch_instructors, batch_students

// â”€â”€â”€ GET /api/institute-admin/batches â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
export async function getBatches(req: AuthRequest, res: Response) {
    try {
        const appUserId = (req as any).appUserId as string;
        const instituteId = await resolveInstituteId(appUserId);
        if (!instituteId) return res.status(403).json({ error: 'Not part of any institute.' });

        const batches = await prisma.batch.findMany({
            where: { institute_id: instituteId, ...((req as any).ctx?.examId ? { exam_id: (req as any).ctx.examId } : {}) },
            orderBy: { created_at: 'desc' },
            include: {
                _count: {
                    select: {
                        batch_instructors: true,
                        batch_students: true,
                    },
                },
                batch_instructors: {
                    include: {
                        User: { select: { id: true, name: true, email: true, profileImage: true } },
                    },
                },
            },
        });

        const data = batches.map((b: any) => ({
            id: b.id,
            name: b.name,
            description: b.description,
            status: b.status,
            maxStudents: b.max_students,
            createdAt: b.created_at,
            instructorCount: b._count.batch_instructors,
            studentCount: b._count.batch_students,
            instructors: b.batch_instructors.map((bi: any) => ({
                userId: bi.User.id,
                name: bi.User.name,
                email: bi.User.email,
                profileImage: bi.User.profileImage,
            })),
        }));

        return res.json({ data });
    } catch (err) {
        console.error('[Batch] getBatches error:', err);
        return res.status(500).json({ error: 'Failed to fetch batches' });
    }
}

// â”€â”€â”€ POST /api/institute-admin/batches â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Body: { name, description?, maxStudents?, status? }
export async function createBatch(req: AuthRequest, res: Response) {
    const { name, description, maxStudents, status } = req.body as {
        name: string; description?: string; maxStudents?: number; status?: string;
    };

    if (!name?.trim()) return res.status(400).json({ error: 'Batch name is required.' });

    try {
        const appUserId = (req as any).appUserId as string;
        const instituteId = await resolveInstituteId(appUserId);
        if (!instituteId) return res.status(403).json({ error: 'Not part of any institute.' });

        // A new batch belongs to the selected exam context; absent context falls back to
        // the schema default ('ielts') so pre-A1c behavior is unchanged (bug fix #3).
        const examId = (req as any).ctx?.examId as string | undefined;
        const batch = await prisma.batch.create({
            data: {
                institute_id: instituteId,
                name: name.trim(),
                description: description?.trim() ?? null,
                max_students: maxStudents ?? null,
                status: status ?? 'ACTIVE',
                created_by: appUserId,
                ...(examId ? { exam_id: examId } : {}),
            },
        });

        return res.status(201).json({
            data: {
                id: batch.id,
                name: batch.name,
                description: batch.description,
                status: batch.status,
                maxStudents: batch.max_students,
                createdAt: batch.created_at,
                instructorCount: 0,
                studentCount: 0,
                instructors: [],
            },
        });
    } catch (err: any) {
        console.error('[Batch] createBatch error:', err);
        return res.status(500).json({ error: err.message ?? 'Failed to create batch' });
    }
}

// â”€â”€â”€ GET /api/institute-admin/batches/:id â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
export async function getBatchDetail(req: AuthRequest, res: Response) {
    const id = req.params.id as string;

    try {
        const appUserId = (req as any).appUserId as string;
        const instituteId = await resolveInstituteId(appUserId);
        if (!instituteId) return res.status(403).json({ error: 'Not part of any institute.' });

        const batch = await prisma.batch.findFirst({
            where: { id, institute_id: instituteId },
            include: {
                batch_instructors: {
                    include: {
                        User: { select: { id: true, name: true, email: true, profileImage: true } },
                    },
                    orderBy: { assigned_at: 'asc' },
                },
                batch_students: {
                    include: {
                        User: { select: { id: true, name: true, email: true, profileImage: true, phoneNo: true } },
                    },
                    orderBy: { enrolled_at: 'asc' },
                },
            },
        });

        if (!batch) return res.status(404).json({ error: 'Batch not found.' });

        return res.json({
            data: {
                id: batch.id,
                name: batch.name,
                description: batch.description,
                status: batch.status,
                maxStudents: batch.max_students,
                createdAt: batch.created_at,
                instructors: batch.batch_instructors.map((bi: any) => ({
                    userId: bi.User.id,
                    name: bi.User.name,
                    email: bi.User.email,
                    profileImage: bi.User.profileImage,
                    assignedAt: bi.assigned_at,
                })),
                students: batch.batch_students.map((bs: any) => ({
                    userId: bs.User.id,
                    name: bs.User.name,
                    email: bs.User.email,
                    phone: bs.User.phoneNo,
                    profileImage: bs.User.profileImage,
                    enrolledAt: bs.enrolled_at,
                })),
            },
        });
    } catch (err: any) {
        console.error('[Batch] getBatchDetail error:', err);
        return res.status(500).json({ error: err.message ?? 'Failed to fetch batch detail' });
    }
}

// â”€â”€â”€ PATCH /api/institute-admin/batches/:id â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Body: { name?, description?, status?, maxStudents? }
export async function updateBatch(req: AuthRequest, res: Response) {
    const id = req.params.id as string;
    const { name, description, status, maxStudents } = req.body as {
        name?: string; description?: string; status?: string; maxStudents?: number | null;
    };

    try {
        const appUserId = (req as any).appUserId as string;
        const instituteId = await resolveInstituteId(appUserId);
        if (!instituteId) return res.status(403).json({ error: 'Not part of any institute.' });

        const existing = await prisma.batch.findFirst({
            where: { id, institute_id: instituteId },
        });
        if (!existing) return res.status(404).json({ error: 'Batch not found.' });

        const updated = await prisma.batch.update({
            where: { id },
            data: {
                ...(name !== undefined ? { name: name.trim() } : {}),
                ...(description !== undefined ? { description: description?.trim() ?? null } : {}),
                ...(status !== undefined ? { status } : {}),
                ...(maxStudents !== undefined ? { max_students: maxStudents } : {}),
                updated_at: new Date(),
            },
        });

        return res.json({
            data: { id: updated.id, name: updated.name, status: updated.status, maxStudents: updated.max_students },
        });
    } catch (err: any) {
        console.error('[Batch] updateBatch error:', err);
        return res.status(500).json({ error: err.message ?? 'Failed to update batch' });
    }
}

// â”€â”€â”€ DELETE /api/institute-admin/batches/:id â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
export async function deleteBatch(req: AuthRequest, res: Response) {
    const id = req.params.id as string;

    try {
        const appUserId = (req as any).appUserId as string;
        const instituteId = await resolveInstituteId(appUserId);
        if (!instituteId) return res.status(403).json({ error: 'Not part of any institute.' });

        const existing = await prisma.batch.findFirst({
            where: { id, institute_id: instituteId },
        });
        if (!existing) return res.status(404).json({ error: 'Batch not found.' });

        await prisma.batch.delete({ where: { id } });

        return res.json({ data: { deleted: true, id } });
    } catch (err: any) {
        console.error('[Batch] deleteBatch error:', err);
        return res.status(500).json({ error: err.message ?? 'Failed to delete batch' });
    }
}

// â”€â”€â”€ POST /api/institute-admin/batches/:id/instructors â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Body: { userId }  â€” must be in institute_instructors
export async function addInstructorToBatch(req: AuthRequest, res: Response) {
    const batchId = req.params.id as string;
    const { userId } = req.body as { userId: string };

    if (!userId) return res.status(400).json({ error: 'userId is required.' });

    try {
        const appUserId = (req as any).appUserId as string;
        const instituteId = await resolveInstituteId(appUserId);
        if (!instituteId) return res.status(403).json({ error: 'Not part of any institute.' });

        // Verify batch belongs to this institute
        const batch = await prisma.batch.findFirst({ where: { id: batchId, institute_id: instituteId } });
        if (!batch) return res.status(404).json({ error: 'Batch not found.' });

        // Verify the user is an instructor in this institute
        const isInstructor = await prisma.instituteInstructor.findFirst({
            where: { user_id: userId, institute_id: instituteId },
        });
        if (!isInstructor) return res.status(400).json({ error: 'User is not a tutor in your institute.' });

        await prisma.batchInstructor.create({
            data: { batch_id: batchId, user_id: userId },
        });

        const user = await prisma.user.findUnique({
            where: { id: userId }, select: { id: true, name: true, email: true, profileImage: true },
        });

        return res.status(201).json({ data: { userId: user?.id, name: user?.name, email: user?.email, profileImage: user?.profileImage } });
    } catch (err: any) {
        if (err.code === 'P2002') return res.status(409).json({ error: 'This instructor is already assigned to the batch.' });
        console.error('[Batch] addInstructorToBatch error:', err);
        return res.status(500).json({ error: err.message ?? 'Failed to add instructor' });
    }
}

// â”€â”€â”€ DELETE /api/institute-admin/batches/:id/instructors/:userId â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
export async function removeInstructorFromBatch(req: AuthRequest, res: Response) {
    const batchId = req.params.id as string;
    const userId = req.params.userId as string;

    try {
        const appUserId = (req as any).appUserId as string;
        const instituteId = await resolveInstituteId(appUserId);
        if (!instituteId) return res.status(403).json({ error: 'Not part of any institute.' });

        const batch = await prisma.batch.findFirst({ where: { id: batchId, institute_id: instituteId } });
        if (!batch) return res.status(404).json({ error: 'Batch not found.' });

        const row = await prisma.batchInstructor.findFirst({ where: { batch_id: batchId, user_id: userId } });
        if (!row) return res.status(404).json({ error: 'Instructor not in this batch.' });

        await prisma.batchInstructor.delete({ where: { id: row.id } });

        return res.json({ data: { removed: true, userId } });
    } catch (err: any) {
        console.error('[Batch] removeInstructorFromBatch error:', err);
        return res.status(500).json({ error: err.message ?? 'Failed to remove instructor' });
    }
}

// â”€â”€â”€ POST /api/institute-admin/batches/:id/students â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Body: { userId }  â€” must be in institute_students
export async function addStudentToBatch(req: AuthRequest, res: Response) {
    const batchId = req.params.id as string;
    const { userId } = req.body as { userId: string };

    if (!userId) return res.status(400).json({ error: 'userId is required.' });

    try {
        const appUserId = (req as any).appUserId as string;
        const instituteId = await resolveInstituteId(appUserId);
        if (!instituteId) return res.status(403).json({ error: 'Not part of any institute.' });

        const batch = await prisma.batch.findFirst({ where: { id: batchId, institute_id: instituteId } });
        if (!batch) return res.status(404).json({ error: 'Batch not found.' });

        // Max students capacity check
        if (batch.max_students) {
            const currentCount = await prisma.batchStudent.count({ where: { batch_id: batchId } });
            if (currentCount >= batch.max_students) {
                return res.status(400).json({ error: `Batch is full (max ${batch.max_students} students).` });
            }
        }

        // Verify the user is a student in this institute
        const isStudent = await prisma.instituteStudent.findFirst({
            where: { user_id: userId, institute_id: instituteId },
        });
        if (!isStudent) return res.status(400).json({ error: 'User is not a student in your institute.' });

        await prisma.batchStudent.create({
            data: { batch_id: batchId, user_id: userId },
        });

        const user = await prisma.user.findUnique({
            where: { id: userId }, select: { id: true, name: true, email: true, profileImage: true, phoneNo: true },
        });

        return res.status(201).json({
            data: { userId: user?.id, name: user?.name, email: user?.email, phone: user?.phoneNo, profileImage: user?.profileImage },
        });
    } catch (err: any) {
        if (err.code === 'P2002') return res.status(409).json({ error: 'This student is already in the batch.' });
        console.error('[Batch] addStudentToBatch error:', err);
        return res.status(500).json({ error: err.message ?? 'Failed to add student' });
    }
}

// â”€â”€â”€ DELETE /api/institute-admin/batches/:id/students/:userId â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
export async function removeStudentFromBatch(req: AuthRequest, res: Response) {
    const batchId = req.params.id as string;
    const userId = req.params.userId as string;

    try {
        const appUserId = (req as any).appUserId as string;
        const instituteId = await resolveInstituteId(appUserId);
        if (!instituteId) return res.status(403).json({ error: 'Not part of any institute.' });

        const batch = await prisma.batch.findFirst({ where: { id: batchId, institute_id: instituteId } });
        if (!batch) return res.status(404).json({ error: 'Batch not found.' });

        const row = await prisma.batchStudent.findFirst({ where: { batch_id: batchId, user_id: userId } });
        if (!row) return res.status(404).json({ error: 'Student not in this batch.' });

        await prisma.batchStudent.delete({ where: { id: row.id } });

        return res.json({ data: { removed: true, userId } });
    } catch (err: any) {
        console.error('[Batch] removeStudentFromBatch error:', err);
        return res.status(500).json({ error: err.message ?? 'Failed to remove student' });
    }
}


// â”€â”€â”€ GET /api/instructor/batches  â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Returns all batches where this instructor is assigned, including full student list
export async function getInstructorBatches(req: AuthRequest, res: Response) {
    try {
        const appUserId = (req as any).appUserId as string;

        const assignments = await prisma.batchInstructor.findMany({
            where: { user_id: appUserId },
            include: {
                batch: {
                    include: {
                        institutes: { select: { id: true, name: true } },
                        batch_instructors: {
                            include: {
                                User: { select: { id: true, name: true, email: true, profileImage: true } },
                            },
                        },
                        batch_students: {
                            include: {
                                User: { select: { id: true, name: true, email: true, profileImage: true, phoneNo: true } },
                            },
                            orderBy: { enrolled_at: 'asc' },
                        },
                        _count: {
                            select: { batch_instructors: true, batch_students: true },
                        },
                    },
                },
            },
        });

        const data = assignments.map((a: any) => {
            const b = a.batch;
            return {
                id: b.id,
                name: b.name,
                description: b.description,
                status: b.status,
                maxStudents: b.max_students,
                createdAt: b.created_at,
                institute: { id: b.institutes?.id ?? null, name: b.institutes?.name ?? null },
                instructorCount: b._count.batch_instructors,
                studentCount: b._count.batch_students,
                instructors: b.batch_instructors.map((bi: any) => ({
                    userId: bi.User.id,
                    name: bi.User.name,
                    email: bi.User.email,
                    profileImage: bi.User.profileImage,
                })),
                students: b.batch_students.map((bs: any) => ({
                    userId: bs.User.id,
                    name: bs.User.name,
                    email: bs.User.email,
                    phone: bs.User.phoneNo ?? null,
                    profileImage: bs.User.profileImage,
                    enrolledAt: bs.enrolled_at,
                })),
            };
        });

        return res.json({ data });
    } catch (err: any) {
        console.error('[Batch] getInstructorBatches error:', err);
        return res.status(500).json({ error: err.message ?? 'Failed to fetch batches' });
    }
}

// â”€â”€â”€ GET /api/student/batches  â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Returns all batches the student is enrolled in, with instructors listed
export async function getStudentBatches(req: AuthRequest, res: Response) {
    try {
        const appUserId = (req as any).appUserId as string;

        const enrollments = await prisma.batchStudent.findMany({
            where: { user_id: appUserId },
            include: {
                batch: {
                    include: {
                        institutes: { select: { id: true, name: true } },
                        batch_instructors: {
                            include: {
                                User: { select: { id: true, name: true, email: true, profileImage: true } },
                            },
                        },
                        _count: {
                            select: { batch_students: true },
                        },
                    },
                },
            },
        });

        const data = enrollments.map((e: any) => {
            const b = e.batch;
            return {
                id: b.id,
                name: b.name,
                description: b.description,
                status: b.status,
                maxStudents: b.max_students,
                enrolledAt: e.enrolled_at,
                institute: { id: b.institutes?.id ?? null, name: b.institutes?.name ?? null },
                studentCount: b._count.batch_students,
                instructors: b.batch_instructors.map((bi: any) => ({
                    userId: bi.User.id,
                    name: bi.User.name,
                    email: bi.User.email,
                    profileImage: bi.User.profileImage,
                })),
            };
        });

        return res.json({ data });
    } catch (err: any) {
        console.error('[Batch] getStudentBatches error:', err);
        return res.status(500).json({ error: err.message ?? 'Failed to fetch batches' });
    }
}
