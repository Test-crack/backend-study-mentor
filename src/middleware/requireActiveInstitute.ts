// Track A · A0 — server-side enforcement of institute deactivation.
//
// Closes the gap where Institute.is_active was checked ONLY in the frontend
// (RequireActiveInstitute), so a direct API call bypassed the gate. Run this AFTER
// requireAuth + ensureUser (needs req.appUserId + req.userRole).
//
// A0 scope: gate INSTITUTE_OWNER / INSTITUTE_ADMIN — exactly what the frontend gates
// today — so behaviour matches, just enforced on the server. SUPERADMIN and other
// roles pass through (instructor/student context gating lands in A1). Deny-by-default
// for an owner/admin whose institute is missing or inactive.
import { Response, NextFunction } from 'express';
import { AuthRequest } from './auth';
import { resolveInstitute } from '../lib/sessionContext';

export async function requireActiveInstitute(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const role = (req as any).userRole as string | undefined;
    if (role !== 'INSTITUTE_OWNER' && role !== 'INSTITUTE_ADMIN') return next();

    const membership = await resolveInstitute((req as any).appUserId as string, role);
    if (!membership) {
      return res.status(403).json({ message: 'No institute is associated with this account.' });
    }
    if (!membership.isActive) {
      return res.status(403).json({ message: 'Your institute has been deactivated. Please contact support.' });
    }
    (req as any).instituteId = membership.instituteId;
    next();
  } catch (err) {
    console.error('requireActiveInstitute error:', err);
    res.status(500).json({ message: 'Internal server error' });
  }
}
