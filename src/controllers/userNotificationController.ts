// src/controllers/userNotificationController.ts
// Recipient-generic notification endpoints over the user_notifications table.
// Keyed purely by the authenticated appUserId, so ANY role's router can mount
// them (instructors today via instructorRoutes; owners/admins later) — the
// mounting router's RBAC middleware decides who gets in.
//
// Student-facing notifications are a separate system (student_notifications +
// derived CTAs) — see getStudentNotifications in studentController.ts.
import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import prisma from '../lib/prisma';
import { paramStr } from '../utils/httpParams';

/**
 * GET /notifications?limit=20&cursor=<ISO created_at>
 * Response: { success, events, unread_count, next_cursor }
 * Events keep read_at / dismissed_at so the client decides display per surface.
 */
export async function getUserNotifications(req: AuthRequest, res: Response) {
    try {
        const appUserId = (req as any).appUserId as string;
        if (!appUserId) return res.status(401).json({ success: false, error: 'Unauthorized.' });

        const limit = Math.min(Math.max(parseInt(String(req.query.limit ?? '20'), 10) || 20, 1), 50);
        const cursorRaw = req.query.cursor ? new Date(String(req.query.cursor)) : null;
        const cursor = cursorRaw && !isNaN(cursorRaw.getTime()) ? cursorRaw : null;

        const [rows, unreadCount] = await Promise.all([
            prisma.userNotification.findMany({
                where: {
                    user_id: appUserId,
                    ...(cursor ? { created_at: { lt: cursor } } : {}),
                },
                orderBy: { created_at: 'desc' },
                take: limit + 1, // one extra to know if another page exists
                select: { id: true, type: true, payload: true, created_at: true, read_at: true, dismissed_at: true },
            }),
            prisma.userNotification.count({
                where: { user_id: appUserId, read_at: null, dismissed_at: null },
            }),
        ]);

        const hasMore = rows.length > limit;
        const events  = hasMore ? rows.slice(0, limit) : rows;

        return res.json({
            success:      true,
            events,
            unread_count: unreadCount,
            next_cursor:  hasMore ? events[events.length - 1].created_at.toISOString() : null,
        });
    } catch (error) {
        console.error('[UserNotificationController] getUserNotifications error:', error);
        return res.status(500).json({ success: false, error: 'Internal server error.' });
    }
}

/**
 * POST /notifications/read
 * Body: { all: true } or { ids: string[] } — stamps read_at where not yet set.
 */
export async function markUserNotificationsRead(req: AuthRequest, res: Response) {
    try {
        const appUserId = (req as any).appUserId as string;
        if (!appUserId) return res.status(401).json({ success: false, error: 'Unauthorized.' });

        const { all, ids } = (req.body ?? {}) as { all?: boolean; ids?: string[] };
        if (!all && (!Array.isArray(ids) || ids.length === 0)) {
            return res.status(400).json({ success: false, error: 'Provide { all: true } or { ids: [...] }.' });
        }

        const result = await prisma.userNotification.updateMany({
            where: {
                user_id: appUserId,
                read_at: null,
                ...(all ? {} : { id: { in: ids!.slice(0, 100) } }),
            },
            data: { read_at: new Date() },
        });

        return res.json({ success: true, marked: result.count });
    } catch (error) {
        console.error('[UserNotificationController] markUserNotificationsRead error:', error);
        return res.status(500).json({ success: false, error: 'Internal server error.' });
    }
}

/**
 * POST /notifications/:id/dismiss
 * Hides one event from prominent surfaces; stays in bell history. Dismissing
 * implies it was seen, so read_at is stamped too if still unread.
 */
export async function dismissUserNotification(req: AuthRequest, res: Response) {
    try {
        const appUserId = (req as any).appUserId as string;
        if (!appUserId) return res.status(401).json({ success: false, error: 'Unauthorized.' });

        const id = paramStr(req.params.id);
        const now = new Date();

        // updateMany so the user_id scope is part of the WHERE — nobody can
        // dismiss another user's notification.
        const result = await prisma.userNotification.updateMany({
            where: { id, user_id: appUserId, dismissed_at: null },
            data:  { dismissed_at: now },
        });
        await prisma.userNotification.updateMany({
            where: { id, user_id: appUserId, read_at: null },
            data:  { read_at: now },
        });

        if (result.count === 0) {
            return res.status(404).json({ success: false, error: 'Notification not found or already dismissed.' });
        }
        return res.json({ success: true });
    } catch (error) {
        console.error('[UserNotificationController] dismissUserNotification error:', error);
        return res.status(500).json({ success: false, error: 'Internal server error.' });
    }
}
