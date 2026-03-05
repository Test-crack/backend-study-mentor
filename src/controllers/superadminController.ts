// src/controllers/superadminController.ts
import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import prisma from '../lib/prisma';
import { supabaseAdmin } from '../lib/supabase';
import { UserRoleType } from '@prisma/client';

const VALID_ROLES = Object.values(UserRoleType);

// ─── GET /api/superadmin/users ───────────────────────────────────────────────

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
                select: { id: true, name: true, email: true, role: true, createdAt: true, profileImage: true },
            }),
            prisma.user.count({ where }),
        ]);

        return res.json({
            data: users,
            meta: { total, page: pageNum, limit: limitNum, totalPages: Math.ceil(total / limitNum) },
        });
    } catch (err) {
        console.error('[SuperAdmin] getAllUsers error:', err);
        return res.status(500).json({ error: 'Failed to fetch users' });
    }
}

// ─── GET /api/superadmin/institutes ─────────────────────────────────────────

export async function getInstitutes(req: AuthRequest, res: Response) {
    try {
        const { search } = req.query as Record<string, string>;

        const where = search?.trim()
            ? { name: { contains: search, mode: 'insensitive' as const } }
            : undefined;

        const result = await prisma.institutes.findMany({
            where,
            orderBy: { created_at: 'desc' },
            include: {
                institute_owners: {
                    include: {
                        User: {
                            select: { id: true, name: true, email: true, profileImage: true },
                        },
                    },
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
        }));

        return res.json({ data });
    } catch (err) {
        console.error('[SuperAdmin] getInstitutes error:', err);
        return res.status(500).json({ error: 'Failed to fetch institutes' });
    }
}

// ─── PATCH /api/superadmin/institutes/:id/status ──────────────────────────────
// Body: { isActive: boolean }

export async function toggleInstituteStatus(req: AuthRequest, res: Response) {
    const { id } = req.params;
    const { isActive } = req.body as { isActive: boolean };

    if (typeof isActive !== 'boolean') {
        return res.status(400).json({ error: 'isActive (boolean) is required in the request body.' });
    }

    try {
        const existing = await prisma.institutes.findUnique({ where: { id } });
        if (!existing) {
            return res.status(404).json({ error: 'Institute not found.' });
        }

        const updated = await prisma.institutes.update({
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

// ─── POST /api/superadmin/institutes ─────────────────────────────────────────
// Body: { instituteName, address?, ownerName, ownerEmail }
// Flow:
//   1. Invite owner via Supabase (sends magic link email)
//   2. Create User row in DB with INSTITUTE_OWNER role
//   3. Create institute row
//   4. Create institute_owners row linking them

export async function createInstitute(req: AuthRequest, res: Response) {
    const { instituteName, address, ownerName, ownerEmail } = req.body as {
        instituteName: string;
        address?: string;
        ownerName: string;
        ownerEmail: string;
    };

    if (!instituteName?.trim() || !ownerName?.trim() || !ownerEmail?.trim()) {
        return res.status(400).json({ error: 'instituteName, ownerName, and ownerEmail are required.' });
    }

    try {
        // 1. Send Supabase invite email to the new owner
        //    This creates a Supabase auth user and mails a magic link
        const { data: inviteData, error: inviteError } = await supabaseAdmin.auth.admin.inviteUserByEmail(
            ownerEmail,
            {
                data: { full_name: ownerName, role: 'INSTITUTE_OWNER' },
                redirectTo: `${process.env.FRONTEND_URL ?? 'http://localhost:8080'}/login`,
            }
        );

        if (inviteError) {
            // If user already exists in Supabase, that's fine — we'll link via email below
            if (!inviteError.message.includes('already been registered')) {
                throw inviteError;
            }
        }

        const supabaseUserId = inviteData?.user?.id;

        // 2. Upsert User row in our DB
        let dbUser = await prisma.user.findUnique({ where: { email: ownerEmail } });

        if (!dbUser) {
            dbUser = await prisma.user.create({
                data: {
                    email: ownerEmail,
                    name: ownerName,
                    role: UserRoleType.INSTITUTE_OWNER,
                    supabaseuserid: supabaseUserId ?? `pending-${Date.now()}`,
                },
            });
        } else {
            // Update role if existing user
            dbUser = await prisma.user.update({
                where: { id: dbUser.id },
                data: {
                    role: UserRoleType.INSTITUTE_OWNER,
                    name: dbUser.name ?? ownerName,
                    ...(supabaseUserId ? { supabaseuserid: supabaseUserId } : {}),
                },
            });
        }

        // 3. Create the institute
        const institute = await prisma.institutes.create({
            data: {
                name: instituteName.trim(),
                address: address?.trim() ?? null,
                is_active: true,
                created_by: (req as any).appUserId,
            },
        });

        // 4. Link owner to institute
        await prisma.institute_owners.upsert({
            where: { user_id: dbUser.id },
            update: { institute_id: institute.id },
            create: { user_id: dbUser.id, institute_id: institute.id },
        });

        return res.status(201).json({
            data: {
                institute: {
                    id: institute.id,
                    name: institute.name,
                },
                owner: {
                    id: dbUser.id,
                    email: dbUser.email,
                    name: dbUser.name,
                },
                inviteEmailSent: !inviteError,
            },
        });
    } catch (err: any) {
        console.error('[SuperAdmin] createInstitute error:', err);
        return res.status(500).json({ error: err.message ?? 'Failed to create institute' });
    }
}
