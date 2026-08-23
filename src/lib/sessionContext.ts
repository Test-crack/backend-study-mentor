// SessionProvider seam (Track A). The single place that maps "who is this request"
// (DB user id + role, already resolved by ensureUser) to "which institute, and is it
// active". Centralising it here means a later move to JWT + Redis sessions is an
// adapter in this file, not a change at every controller/middleware call site.
import prisma from './prisma';
import { isSubscriptionAccessible } from './examAccess';

export interface InstituteMembership {
  instituteId: string;
  isActive: boolean;
}

/**
 * The institute an owner/admin belongs to (+ its active flag), or null if none.
 * Owner/Admin are 1:1 with an institute (user_id is unique on both tables).
 * Instructor/Student resolution (and multi-institute students) land with A1.
 */
export async function resolveInstitute(
  appUserId: string,
  role: string | null | undefined
): Promise<InstituteMembership | null> {
  const pick = { institutes: { select: { id: true, is_active: true } } } as const;

  if (role === 'INSTITUTE_OWNER') {
    const row = await prisma.instituteOwner.findUnique({ where: { user_id: appUserId }, select: pick });
    return row?.institutes ? { instituteId: row.institutes.id, isActive: row.institutes.is_active } : null;
  }
  if (role === 'INSTITUTE_ADMIN') {
    const row = await prisma.instituteAdmin.findUnique({ where: { user_id: appUserId }, select: pick });
    return row?.institutes ? { instituteId: row.institutes.id, isActive: row.institutes.is_active } : null;
  }
  return null;
}

/** Exam ids an institute may currently use (ACTIVE/TRIAL subscriptions). */
export async function resolveAccessibleExamIds(instituteId: string): Promise<string[]> {
  const subs = await prisma.instituteExamSubscription.findMany({
    where: { institute_id: instituteId },
    select: { exam_id: true, billing_status: true },
  });
  return subs.filter((s) => isSubscriptionAccessible(s.billing_status)).map((s) => s.exam_id);
}

export interface ExamContext {
  instituteId: string;
  examId: string | null; // null = no exam selected → unscoped (backward-compatible)
}

/**
 * Resolve the owner/admin exam context (Track A · A1). If requestedExamId is given it
 * MUST be an accessible subscription of the caller's institute (else ok:false → 403).
 * Absent → examId null so exam scoping can roll out incrementally without breaking
 * current (all-exam) views. This is the single authority for "may this user view this
 * exam's data" — the swap-point when auth moves to JWT+Redis.
 */
export async function resolveExamContext(
  appUserId: string,
  role: string | null | undefined,
  requestedExamId?: string | null
): Promise<{ ok: true; ctx: ExamContext } | { ok: false; reason: string }> {
  const membership = await resolveInstitute(appUserId, role);
  if (!membership) return { ok: false, reason: 'no-institute' };
  if (!membership.isActive) return { ok: false, reason: 'inactive-institute' };
  if (!requestedExamId) return { ok: true, ctx: { instituteId: membership.instituteId, examId: null } };
  const accessible = await resolveAccessibleExamIds(membership.instituteId);
  if (!accessible.includes(requestedExamId)) return { ok: false, reason: 'exam-not-subscribed' };
  return { ok: true, ctx: { instituteId: membership.instituteId, examId: requestedExamId } };
}
