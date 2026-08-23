// SessionProvider seam (Track A). The single place that maps "who is this request"
// (DB user id + role, already resolved by ensureUser) to "which institute, and is it
// active". Centralising it here means a later move to JWT + Redis sessions is an
// adapter in this file, not a change at every controller/middleware call site.
import prisma from './prisma';

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
