// Track A · A1 — attach the owner/admin exam context to the request.
//
// Reads the selected exam from the `X-Exam-Id` header. Absent header => examId null
// (unscoped = current behaviour), so per-exam scoping rolls out incrementally without
// breaking today's all-exam views. A header naming an exam the institute has no
// accessible subscription to => 403 (deny-by-default). Run AFTER requireAuth +
// ensureUser (+ requireActiveInstitute). Only owner/admin get a context; other roles
// pass through with no ctx.
import { Response, NextFunction } from 'express';
import { AuthRequest } from './auth';
import { resolveExamContext, type ExamContext } from '../lib/sessionContext';

// Widen AuthRequest locally so handlers can read req.ctx without a global type change yet.
export type ExamScopedRequest = AuthRequest & { ctx?: ExamContext };

export async function attachExamContext(req: ExamScopedRequest, res: Response, next: NextFunction) {
  try {
    const role = (req as any).userRole as string | undefined;
    if (role !== 'INSTITUTE_OWNER' && role !== 'INSTITUTE_ADMIN') return next();

    const requested = (req.header('x-exam-id') || '').trim() || null;
    const result = await resolveExamContext((req as any).appUserId as string, role, requested);
    if (!result.ok) {
      if (result.reason === 'exam-not-subscribed') {
        return res.status(403).json({ message: 'You do not have access to the selected exam.' });
      }
      // no-institute / inactive-institute are already caught by requireActiveInstitute;
      // reaching here is an edge — deny safely.
      return res.status(403).json({ message: 'Institute context unavailable.' });
    }
    req.ctx = result.ctx;
    next();
  } catch (err) {
    console.error('attachExamContext error:', err);
    res.status(500).json({ message: 'Internal server error' });
  }
}
