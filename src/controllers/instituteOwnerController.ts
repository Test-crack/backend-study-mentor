// src/controllers/instituteOwnerController.ts
import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import prisma from '../lib/prisma';
import { supabaseAdmin } from '../lib/supabase';
import { UserRoleType } from '@prisma/client';

// ─── Helper: get the institute owned by the current user ─────────────────────

async function getOwnedInstitute(appUserId: string) {
    const ownerRow = await prisma.institute_owners.findUnique({
        where: { user_id: appUserId },
        select: { institute_id: true },
    });
    return ownerRow?.institute_id ?? null;
}

// ─── GET /api/institute-owner/admins ─────────────────────────────────────────
// Returns all institute_admins for the owner's institute

export async function getAdmins(req: AuthRequest, res: Response) {
    try {
        const appUserId = (req as any).appUserId as string;
        const instituteId = await getOwnedInstitute(appUserId);

        if (!instituteId) {
            return res.status(403).json({ error: 'You do not own any institute.' });
        }

        const admins = await prisma.institute_admins.findMany({
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

// ─── POST /api/institute-owner/admins ─────────────────────────────────────────
// Body: { adminName, adminEmail }
// Flow: invite via Supabase → upsert User → upsert institute_admins row

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

        // Pre-check for existing user
        let dbUser = await prisma.user.findUnique({ where: { email: adminEmail } });
        if (dbUser) {
            return res.status(409).json({ error: 'Email already linked with existing user. Contact - blinkgrid@gmail.com' });
        }

        // 1. Send Supabase invite email
        const { data: inviteData, error: inviteError } = await supabaseAdmin.auth.admin.inviteUserByEmail(
            adminEmail,
            {
                data: { full_name: adminName, role: 'INSTITUTE_ADMIN' },
                redirectTo: `${process.env.FRONTEND_URL ?? 'http://localhost:8080'}/login`,
            }
        );

        if (inviteError && !inviteError.message.includes('already been registered')) {
            throw inviteError;
        }

        const supabaseUserId = inviteData?.user?.id;

        // 2. Create User row
        dbUser = await prisma.user.create({
            data: {
                email: adminEmail,
                name: adminName,
                role: UserRoleType.INSTITUTE_ADMIN,
                supabaseuserid: supabaseUserId ?? `pending-${Date.now()}`,
            },
        });

        // 3. Upsert institute_admins row
        await prisma.institute_admins.upsert({
            where: { user_id: dbUser.id },
            update: { institute_id: instituteId },
            create: { user_id: dbUser.id, institute_id: instituteId },
        });

        return res.status(201).json({
            data: {
                userId: dbUser.id,
                name: dbUser.name,
                email: dbUser.email,
                inviteEmailSent: !inviteError,
            },
        });
    } catch (err: any) {
        console.error('[InstituteOwner] addAdmin error:', err);
        return res.status(500).json({ error: err.message ?? 'Failed to add admin' });
    }
}

// ─── DELETE /api/institute-owner/admins/:userId ───────────────────────────────
// Removes the admin from the institute (does NOT delete the User row)

export async function removeAdmin(req: AuthRequest, res: Response) {
    const { userId } = req.params;

    try {
        const appUserId = (req as any).appUserId as string;
        const instituteId = await getOwnedInstitute(appUserId);

        if (!instituteId) {
            return res.status(403).json({ error: 'You do not own any institute.' });
        }

        // Verify the admin belongs to this institute
        const adminRow = await prisma.institute_admins.findFirst({
            where: { user_id: userId, institute_id: instituteId },
        });

        if (!adminRow) {
            return res.status(404).json({ error: 'Admin not found in your institute.' });
        }

        await prisma.institute_admins.delete({ where: { id: adminRow.id } });

        // Downgrade user role back to STUDENT so they lose admin access
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
