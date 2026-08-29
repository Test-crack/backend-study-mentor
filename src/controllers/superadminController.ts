// src/controllers/superadminController.ts
import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import prisma from '../lib/prisma';
import { sendInvite } from '../lib/sendInvite';
import { UserRoleType } from '@prisma/client';
import { paramStr } from '../utils/httpParams';
import { listExamConfigs, getExamConfig } from '../exam-engine';

const VALID_ROLES = Object.values(UserRoleType);
const VALID_BILLING_STATUSES = ['TRIAL', 'ACTIVE', 'CANCELLED'] as const;
type BillingStatus = (typeof VALID_BILLING_STATUSES)[number];

const TRIAL_DAYS = 30;
const trialEndDate = () => new Date(Date.now() + TRIAL_DAYS * 24 * 60 * 60 * 1000);

// ─── Exam config (A4 — VIEW-ONLY; drafting happens client-side, edits go via a dev) ──
// Scoring config stays file-sourced + code-reviewed. These endpoints only READ it, so a
// live UI can never change how real students are scored.

/** GET /api/superadmin/exams — list exams with status/label for the config explorer. */
export async function listExamsForConfig(_req: AuthRequest, res: Response) {
    try {
        const data = listExamConfigs().map((e: any) => ({
            exam_id: e.exam_id,
            status:  e.status,
            label:   e?.naming?.public_display_name ?? e.exam_id,
        }));
        return res.json({ data });
    } catch (err: any) {
        console.error('[superadmin] listExamsForConfig error:', err);
        return res.status(500).json({ error: 'Failed to list exams' });
    }
}

/** GET /api/superadmin/exams/:id/config — the full config entry (read-only) for viewing/drafting. */
export async function getExamConfigForView(req: AuthRequest, res: Response) {
    try {
        const examId = paramStr(req.params.id);
        const cfg = getExamConfig(examId);
        if (!cfg) return res.status(404).json({ error: `Unknown exam '${examId}'` });
        return res.json({ data: cfg });
    } catch (err: any) {
        console.error('[superadmin] getExamConfigForView error:', err);
        return res.status(500).json({ error: 'Failed to fetch exam config' });
    }
}

/** Valid exam ids come from the Exam registry table (data) — no hardcoded enum. */
async function validExamIds(): Promise<Set<string>> {
    const rows = await prisma.exam.findMany({ select: { id: true } });
    return new Set(rows.map((r) => r.id));
}

/** Normalize an exam-id list to unique non-empty strings; null if the shape is wrong. */
function parseExamTypes(input: unknown): string[] | null {
    if (!Array.isArray(input)) return null;
    const seen = new Set<string>();
    for (const raw of input) {
        if (typeof raw !== 'string' || !raw.trim()) return null;
        seen.add(raw.trim());
    }
    return [...seen];
}

// â”€â”€â”€ GET /api/superadmin/users â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export async function getAllUsers(req: AuthRequest, res: Response) {
    try {
        const { role, search, page = '1', limit = '50' } = req.query as Record<string, string>;

        const pageNum = Math.max(1, parseInt(page, 10) || 1);
        const limitNum = Math.min(100, parseInt(limit, 10) || 50);
        const skip = (pageNum - 1) * limitNum;

        let roleFilter: UserRoleType | undefined;
        if (role && VALID_ROLES.includes(role as UserRoleType)) {
            roleFilter = role as UserRoleType;
        }

        const searchFilter = search?.trim()
            ? {
                OR: [
                    { name: { contains: search, mode: 'insensitive' as const } },
                    { email: { contains: search, mode: 'insensitive' as const } },
                ]
            }
            : undefined;

        const where = {
            ...(roleFilter ? { role: roleFilter } : {}),
            ...(searchFilter ?? {}),
        };

        const [users, total] = await Promise.all([
            prisma.user.findMany({
                where,
                skip,
                take: limitNum,
                orderBy: { createdAt: 'desc' },
                select: {
                    id: true, name: true, email: true, role: true, createdAt: true, profileImage: true,
                    institute_students: { select: { institutes: { select: { id: true, name: true } } } },
                    institute_instructors: { select: { institutes: { select: { id: true, name: true } } } },
                    institute_admins: { select: { institutes: { select: { id: true, name: true } } } },
                    institute_owners: { select: { institutes: { select: { id: true, name: true } } } },
                },
            }),
            prisma.user.count({ where }),
        ]);

        const data = users.map((u) => {
            const inst =
                u.institute_students?.institutes ??
                u.institute_instructors?.institutes ??
                u.institute_admins?.institutes ??
                u.institute_owners?.institutes ??
                null;
            return {
                id: u.id, name: u.name, email: u.email, role: u.role,
                createdAt: u.createdAt, profileImage: u.profileImage,
                instituteId: inst?.id ?? null,
                instituteName: inst?.name ?? null,
            };
        });

        return res.json({
            data,
            meta: { total, page: pageNum, limit: limitNum, totalPages: Math.ceil(total / limitNum) },
        });
    } catch (err) {
        console.error('[SuperAdmin] getAllUsers error:', err);
        return res.status(500).json({ error: 'Failed to fetch users' });
    }
}

// â”€â”€â”€ GET /api/superadmin/institutes â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export async function getInstitutes(req: AuthRequest, res: Response) {
    try {
        const { search } = req.query as Record<string, string>;

        const where = search?.trim()
            ? { name: { contains: search, mode: 'insensitive' as const } }
            : undefined;

        const result = await prisma.institute.findMany({
            where,
            orderBy: { created_at: 'desc' },
            include: {
                institute_owners: {
                    include: {
                        User: {
                            select: { id: true, name: true, email: true, profileImage: true, phoneNo: true, countryCode: true },
                        },
                    },
                },
                exam_subscriptions: {
                    orderBy: { created_at: 'asc' },
                },
                _count: {
                    select: {
                        institute_students: true,
                        institute_instructors: true,
                    },
                },
            },
        });

        const data = result.map((inst) => ({
            id: inst.id,
            name: inst.name,
            address: inst.address,
            logoUrl: inst.logo_url,
            contactEmail: inst.contact_email,
            contactPhone: inst.contact_phone,
            isActive: inst.is_active,
            createdAt: inst.created_at,
            studentCount: inst._count.institute_students,
            instructorCount: inst._count.institute_instructors,
            owner: inst.institute_owners[0]
                ? {
                    id: inst.institute_owners[0].User.id,
                    name: inst.institute_owners[0].User.name,
                    email: inst.institute_owners[0].User.email,
                    profileImage: inst.institute_owners[0].User.profileImage,
                }
                : null,
            exams: inst.exam_subscriptions.map((s) => ({
                examType: s.exam_id,
                billingStatus: s.billing_status,
                trialEndsAt: s.trial_ends_at,
                seatCap: s.seat_cap,
            })),
        }));

        return res.json({ data });
    } catch (err) {
        console.error('[SuperAdmin] getInstitutes error:', err);
        return res.status(500).json({ error: 'Failed to fetch institutes' });
    }
}

// â”€â”€â”€ PATCH /api/superadmin/institutes/:id/status â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Body: { isActive: boolean }

export async function toggleInstituteStatus(req: AuthRequest, res: Response) {
    const id = paramStr(req.params.id);
    const { isActive } = req.body as { isActive: boolean };

    if (typeof isActive !== 'boolean') {
        return res.status(400).json({ error: 'isActive (boolean) is required in the request body.' });
    }

    try {
        const existing = await prisma.institute.findUnique({ where: { id } });
        if (!existing) {
            return res.status(404).json({ error: 'Institute not found.' });
        }

        const updated = await prisma.institute.update({
            where: { id },
            data: { is_active: isActive },
        });

        return res.json({
            data: {
                id: updated.id,
                name: updated.name,
                isActive: updated.is_active,
            },
        });
    } catch (err: any) {
        console.error('[SuperAdmin] toggleInstituteStatus error:', err);
        return res.status(500).json({ error: err.message ?? 'Failed to update institute status' });
    }
}

export async function updateInstitute(req: AuthRequest, res: Response) {
    const id = paramStr(req.params.id);
    const { name, address, logoUrl, contactEmail, contactPhone } = req.body as {
        name?: string; address?: string; logoUrl?: string; contactEmail?: string; contactPhone?: string;
    };

    try {
        const existing = await prisma.institute.findUnique({ where: { id } });
        if (!existing) {
            return res.status(404).json({ error: 'Institute not found.' });
        }

        const updated = await prisma.institute.update({
            where: { id },
            data: {
                ...(name !== undefined ? { name: name.trim() } : {}),
                ...(address !== undefined ? { address: address.trim() || null } : {}),
                ...(logoUrl !== undefined ? { logo_url: logoUrl.trim() || null } : {}),
                ...(contactEmail !== undefined ? { contact_email: contactEmail.trim() || null } : {}),
                ...(contactPhone !== undefined ? { contact_phone: contactPhone.trim() || null } : {}),
            },
        });

        return res.json({
            data: {
                id: updated.id,
                name: updated.name,
                address: updated.address,
                logoUrl: updated.logo_url,
                contactEmail: updated.contact_email,
                contactPhone: updated.contact_phone,
            },
        });
    } catch (err: any) {
        console.error('[SuperAdmin] updateInstitute error:', err);
        return res.status(500).json({ error: err.message ?? 'Failed to update institute details' });
    }
}

// â”€â”€â”€ POST /api/superadmin/institutes â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Body: { instituteName, address?, ownerName, ownerEmail, ownerPhone?, examTypes[] }
// Flow:
//   1. Pre-check email/role clash + validate exams
//   2. Invite owner via Supabase (external — must be OUTSIDE the DB transaction)
//   3. In one DB transaction: upsert User (INSTITUTE_OWNER) → create Institute →
//      link InstituteOwner → create one InstituteExamSubscription per exam (TRIAL)

export async function createInstitute(req: AuthRequest, res: Response) {
    const { instituteName, address, ownerName, ownerEmail, ownerPhone, examTypes } = req.body as {
        instituteName: string;
        address?: string;
        ownerName: string;
        ownerEmail: string;
        ownerPhone?: string;
        examTypes?: unknown;
    };

    if (!instituteName?.trim() || !ownerName?.trim() || !ownerEmail?.trim()) {
        return res.status(400).json({ error: 'instituteName, ownerName, and ownerEmail are required.' });
    }

    const exams = parseExamTypes(examTypes);
    if (!exams || exams.length === 0) {
        return res.status(400).json({ error: 'At least one valid examType is required.' });
    }

    try {
        const valid = await validExamIds();
        const unknown = exams.filter((e) => !valid.has(e));
        if (unknown.length) {
            return res.status(400).json({ error: `Unknown exam id(s): ${unknown.join(', ')}.` });
        }

        // Pre-check for existing user and role clash
        const existingUser = await prisma.user.findUnique({ where: { email: ownerEmail } });
        if (existingUser && existingUser.role !== UserRoleType.INSTITUTE_OWNER) {
            return res.status(409).json({ error: 'Email already linked with existing user. Contact - blinkgrid@gmail.com' });
        }

        // 1. Create the auth user + send the owner a role-specific branded invite email
        //    (Resend). External call — kept OUTSIDE the DB transaction below.
        const { userId: supabaseUserId, emailSent } = await sendInvite({
            email: ownerEmail, name: ownerName, role: 'INSTITUTE_OWNER', institute: instituteName, origin: req.get('origin') ?? undefined,
        });

        // 2. All DB writes atomically — a partial failure leaves nothing behind.
        const result = await prisma.$transaction(async (tx) => {
            const dbUser = existingUser
                ? await tx.user.update({
                    where: { id: existingUser.id },
                    data: {
                        role: UserRoleType.INSTITUTE_OWNER,
                        name: existingUser.name ?? ownerName,
                        ...(ownerPhone?.trim() ? { phoneNo: ownerPhone.trim() } : {}),
                        ...(supabaseUserId ? { supabaseuserid: supabaseUserId } : {}),
                    },
                })
                : await tx.user.create({
                    data: {
                        email: ownerEmail,
                        name: ownerName,
                        role: UserRoleType.INSTITUTE_OWNER,
                        ...(ownerPhone?.trim() ? { phoneNo: ownerPhone.trim() } : {}),
                        supabaseuserid: supabaseUserId ?? `pending-${Date.now()}`,
                    },
                });

            const institute = await tx.institute.create({
                data: {
                    name: instituteName.trim(),
                    address: address?.trim() ?? null,
                    is_active: true,
                    created_by: (req as any).appUserId,
                },
            });

            await tx.instituteOwner.upsert({
                where: { user_id: dbUser.id },
                update: { institute_id: institute.id },
                create: { user_id: dbUser.id, institute_id: institute.id },
            });

            const trialEndsAt = trialEndDate();
            await tx.instituteExamSubscription.createMany({
                data: exams.map((examId) => ({
                    institute_id: institute.id,
                    exam_id: examId,
                    billing_status: 'TRIAL',
                    trial_ends_at: trialEndsAt,
                })),
            });

            return { dbUser, institute, trialEndsAt };
        });

        return res.status(201).json({
            data: {
                institute: {
                    id: result.institute.id,
                    name: result.institute.name,
                },
                owner: {
                    id: result.dbUser.id,
                    email: result.dbUser.email,
                    name: result.dbUser.name,
                },
                exams: exams.map((examType) => ({
                    examType,
                    billingStatus: 'TRIAL' as BillingStatus,
                    trialEndsAt: result.trialEndsAt,
                    seatCap: null,
                })),
                inviteEmailSent: emailSent,
            },
        });
    } catch (err: any) {
        console.error('[SuperAdmin] createInstitute error:', err);
        return res.status(500).json({ error: err.message ?? 'Failed to create institute' });
    }
}

// â”€â”€â”€ PUT /api/superadmin/institutes/:id/exams â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Body: { examTypes: ExamType[] }  — sets the full list of exams for an institute.
// Diff semantics (Hard Rule #5 — never hard-delete):
//   • exam in list, no row       → create (TRIAL)
//   • exam in list, row CANCELLED → reactivate to TRIAL
//   • exam NOT in list, row live  → CANCELLED (row preserved)
export async function setInstituteExams(req: AuthRequest, res: Response) {
    const id = paramStr(req.params.id);
    const exams = parseExamTypes((req.body as any)?.examTypes);
    if (!exams) {
        return res.status(400).json({ error: 'examTypes must be an array of valid exam ids.' });
    }

    try {
        const valid = await validExamIds();
        const unknown = exams.filter((e) => !valid.has(e));
        if (unknown.length) {
            return res.status(400).json({ error: `Unknown exam id(s): ${unknown.join(', ')}.` });
        }

        const institute = await prisma.institute.findUnique({
            where: { id },
            include: { exam_subscriptions: true },
        });
        if (!institute) return res.status(404).json({ error: 'Institute not found.' });

        const wanted = new Set(exams);
        const existingByType = new Map(institute.exam_subscriptions.map((s) => [s.exam_id, s]));

        await prisma.$transaction(async (tx) => {
            // Add or reactivate
            for (const examId of exams) {
                const row = existingByType.get(examId);
                if (!row) {
                    await tx.instituteExamSubscription.create({
                        data: { institute_id: id, exam_id: examId, billing_status: 'TRIAL', trial_ends_at: trialEndDate() },
                    });
                } else if (row.billing_status === 'CANCELLED') {
                    await tx.instituteExamSubscription.update({
                        where: { id: row.id },
                        data: { billing_status: 'TRIAL', trial_ends_at: trialEndDate() },
                    });
                }
            }
            // Cancel exams no longer wanted (preserve the row)
            for (const row of institute.exam_subscriptions) {
                if (!wanted.has(row.exam_id) && row.billing_status !== 'CANCELLED') {
                    await tx.instituteExamSubscription.update({
                        where: { id: row.id },
                        data: { billing_status: 'CANCELLED' },
                    });
                }
            }
        });

        const refreshed = await prisma.instituteExamSubscription.findMany({
            where: { institute_id: id },
            orderBy: { created_at: 'asc' },
        });

        return res.json({
            data: refreshed.map((s) => ({
                examType: s.exam_id,
                billingStatus: s.billing_status,
                trialEndsAt: s.trial_ends_at,
                seatCap: s.seat_cap,
            })),
        });
    } catch (err: any) {
        console.error('[SuperAdmin] setInstituteExams error:', err);
        return res.status(500).json({ error: err.message ?? 'Failed to update institute exams' });
    }
}

// â”€â”€â”€ PATCH /api/superadmin/institutes/:id/exams/:examType â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Body: { billingStatus: 'TRIAL' | 'ACTIVE' | 'CANCELLED' }
export async function setExamStatus(req: AuthRequest, res: Response) {
    const id = paramStr(req.params.id);
    const examId = paramStr(req.params.examType);
    const { billingStatus } = req.body as { billingStatus?: string };

    if (!billingStatus || !VALID_BILLING_STATUSES.includes(billingStatus as BillingStatus)) {
        return res.status(400).json({ error: `billingStatus must be one of ${VALID_BILLING_STATUSES.join(', ')}.` });
    }

    try {
        const row = await prisma.instituteExamSubscription.findUnique({
            where: { institute_id_exam_id: { institute_id: id, exam_id: examId } },
        });
        if (!row) return res.status(404).json({ error: 'This institute does not offer that exam.' });

        const updated = await prisma.instituteExamSubscription.update({
            where: { id: row.id },
            data: {
                billing_status: billingStatus,
                // Moving to ACTIVE clears the trial deadline; moving back to TRIAL restarts it.
                ...(billingStatus === 'ACTIVE' ? { trial_ends_at: null } : {}),
                ...(billingStatus === 'TRIAL' ? { trial_ends_at: trialEndDate() } : {}),
            },
        });

        return res.json({
            data: {
                examType: updated.exam_id,
                billingStatus: updated.billing_status,
                trialEndsAt: updated.trial_ends_at,
                seatCap: updated.seat_cap,
            },
        });
    } catch (err: any) {
        console.error('[SuperAdmin] setExamStatus error:', err);
        return res.status(500).json({ error: err.message ?? 'Failed to update exam status' });
    }
}

// â”€â”€â”€ GET /api/superadmin/subscriptions â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Flat list of every institute × exam subscription, for the Subscriptions page.
// Query: ?status=TRIAL|ACTIVE|CANCELLED  ?search=<institute name>
export async function getSubscriptions(req: AuthRequest, res: Response) {
    try {
        const { status, search } = req.query as Record<string, string>;

        const where: any = {};
        if (status && VALID_BILLING_STATUSES.includes(status as BillingStatus)) {
            where.billing_status = status;
        }
        if (search?.trim()) {
            where.institutes = { name: { contains: search, mode: 'insensitive' as const } };
        }

        const rows = await prisma.instituteExamSubscription.findMany({
            where,
            orderBy: [{ institutes: { name: 'asc' } }, { exam_id: 'asc' }],
            include: {
                institutes: {
                    select: {
                        id: true, name: true, is_active: true,
                        _count: { select: { institute_students: true } },
                    },
                },
            },
        });

        const data = rows.map((s) => ({
            id: s.id,
            instituteId: s.institute_id,
            instituteName: s.institutes.name,
            instituteActive: s.institutes.is_active,
            examType: s.exam_id,
            billingStatus: s.billing_status,
            trialEndsAt: s.trial_ends_at,
            seatCap: s.seat_cap,
            studentCount: s.institutes._count.institute_students,
            createdAt: s.created_at,
        }));

        const summary = {
            total: data.length,
            active: data.filter((d) => d.billingStatus === 'ACTIVE').length,
            trial: data.filter((d) => d.billingStatus === 'TRIAL').length,
            cancelled: data.filter((d) => d.billingStatus === 'CANCELLED').length,
        };

        return res.json({ data, summary });
    } catch (err: any) {
        console.error('[SuperAdmin] getSubscriptions error:', err);
        return res.status(500).json({ error: err.message ?? 'Failed to fetch subscriptions' });
    }
}
