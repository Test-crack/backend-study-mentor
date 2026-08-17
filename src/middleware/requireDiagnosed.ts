// src/middleware/requireDiagnosed.ts
import { Response, NextFunction } from 'express';
import prisma from '../lib/prisma';
import { AuthRequest } from './auth';

/**
 * Blocks gameplay endpoints (drills, IA, mock) until the student has completed the
 * one-time diagnostic. The frontend route guard is not sufficient on its own â€” an
 * un-diagnosed student could otherwise deep-link or call these APIs directly and
 * drive drills/IA/mock, populating the competency matrix without ever taking the
 * diagnostic. Must run AFTER requireAuth + ensureUser (needs req.appUserId).
 */
export async function requireDiagnosed(req: AuthRequest, res: Response, next: NextFunction) {
    try {
        const appUserId = (req as any).appUserId as string;
        if (!appUserId) return res.status(401).json({ success: false, error: 'Unauthorized.' });

        const student = await prisma.instituteStudent.findUnique({
            where:  { user_id: appUserId },
            select: { isDiagnosed: true },
        });
        if (!student) return res.status(404).json({ success: false, error: 'Student not found.' });
        if (!student.isDiagnosed) {
            return res.status(403).json({ success: false, error: 'diagnostic_required', message: 'Complete the diagnostic assessment first.' });
        }
        return next();
    } catch (err) {
        console.error('[requireDiagnosed] error:', err);
        return res.status(500).json({ success: false, error: 'Internal server error.' });
    }
}
