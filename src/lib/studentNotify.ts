// src/lib/studentNotify.ts
// Single producer entry point for ALL persisted event notifications, backed by
// the ONE recipient-generic user_notifications table (keyed by User.id).
//
// Only EVENTS go through here (IA_MISSED, STUDENT_IA_MISSED, future
// MOCK_GRADED / announcements…). Live CTAs (IA_PENDING / IN_PROGRESS /
// MOCK_PENDING…) are derived from session state at read time and never
// stored — see getStudentNotifications.
//
// Idempotent by design: callers pass a dedupe_key (e.g. "IA_MISSED:2026-07-16")
// and repeated calls upsert onto the same row. This matters because the miss-
// detection sweep runs on every dashboard load.
import prisma from './prisma';

export type StudentNotificationType = 'IA_MISSED';           // widen as new events land
export type UserNotificationType    = 'STUDENT_IA_MISSED';   // instructor/admin-facing events

/**
 * Convenience wrapper for student-facing events: resolves the student's
 * User.id and records into the same user_notifications table as every other
 * recipient. Best-effort: failures are logged and swallowed — a notification
 * must never break the flow that produced it (penalty transactions, grading…).
 */
export async function notifyStudent(
    studentId: string,
    type: StudentNotificationType | string,
    payload: Record<string, unknown>,
    dedupeKey: string,
): Promise<void> {
    try {
        const student = await prisma.institute_students.findUnique({
            where:  { id: studentId },
            select: { user_id: true },
        });
        if (!student) return;
        await notifyUser(student.user_id, type, payload, dedupeKey);
    } catch (err) {
        console.error(`[studentNotify] failed to record ${type} (${dedupeKey}) for ${studentId}:`, err);
    }
}

/**
 * Recipient-generic variant — one event notification for any User (instructor,
 * admin, owner…), persisted in user_notifications. Same idempotency + same
 * best-effort contract as notifyStudent.
 */
export async function notifyUser(
    userId: string,
    type: UserNotificationType | string,
    payload: Record<string, unknown>,
    dedupeKey: string,
): Promise<void> {
    try {
        await prisma.userNotification.upsert({
            where:  { user_id_dedupe_key: { user_id: userId, dedupe_key: dedupeKey } },
            create: { user_id: userId, type, payload: payload as any, dedupe_key: dedupeKey },
            update: {},
        });
    } catch (err) {
        console.error(`[studentNotify] failed to record ${type} (${dedupeKey}) for user ${userId}:`, err);
    }
}

/**
 * Fan a STUDENT_IA_MISSED event out to every instructor of every batch the
 * student belongs to. Dedupe is per (instructor, student, ia_date), so an
 * instructor who shares two batches with the student still gets ONE row.
 * Best-effort: any failure is logged and never propagates to the caller
 * (this runs inside the miss-detection sweep on dashboard loads).
 */
export async function notifyInstructorsOfMissedIA(
    studentId: string,
    iaNumber: number,
    iaDateStr: string,       // "YYYY-MM-DD"
    momentumDeducted: number,
): Promise<void> {
    try {
        const student = await prisma.institute_students.findUnique({
            where:  { id: studentId },
            select: { user_id: true, User: { select: { name: true, email: true } } },
        });
        if (!student) return;

        const memberships = await prisma.ielts_batch_students.findMany({
            where:  { user_id: student.user_id },
            select: { batch_id: true, ielts_batches: { select: { ielts_batch_instructors: { select: { user_id: true } } } } },
        });

        const dedupeKey   = `STUDENT_IA_MISSED:${student.user_id}:${iaDateStr}`;
        const studentName = student.User?.name || student.User?.email || 'A student';
        const seen = new Set<string>();

        for (const m of memberships) {
            for (const inst of m.ielts_batches.ielts_batch_instructors) {
                if (seen.has(inst.user_id)) continue;
                seen.add(inst.user_id);
                await notifyUser(inst.user_id, 'STUDENT_IA_MISSED', {
                    student_id:        studentId,
                    student_user_id:   student.user_id,
                    student_name:      studentName,
                    batch_id:          m.batch_id,
                    ia_number:         iaNumber,
                    ia_date:           iaDateStr,
                    momentum_deducted: momentumDeducted,
                }, dedupeKey);
            }
        }
    } catch (err) {
        console.error(`[studentNotify] instructor fan-out failed for student ${studentId} (${iaDateStr}):`, err);
    }
}
