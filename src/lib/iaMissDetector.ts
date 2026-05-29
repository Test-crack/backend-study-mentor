/**
 * IA Miss Detection — shared sweep called by both getIAStatus and
 * getPendingNotifications so missed sessions are always recorded regardless
 * of which page the student visits first.
 *
 * Two cases handled:
 *   A) Session is PENDING but its date is past → mark MISSED (never started).
 *   B) Session is IN_PROGRESS with real answers → auto-grade via processIASession → COMPLETED.
 *   C) Session is IN_PROGRESS with NO real answers → mark MISSED.
 *   D) Past scheduled IA date has NO session at all (student never opened the page)
 *      → create a MISSED session retroactively so history and notifications show it.
 *
 * Flat penalty: −20 momentum per missed IA (only for A, C, D — not B which becomes COMPLETED).
 * Momentum is clamped so student never goes below 0.
 */

import prisma from './prisma';
import { processIASession } from './iaProcessor';

// ── Constants (kept in sync with iaController.ts) ─────────────────────────────
const IST_OFFSET_MS    = 5.5 * 60 * 60 * 1000;
const IA_INTERVAL_DAYS = 3;
const MISS_PENALTY     = 20;

// ── Date helpers ──────────────────────────────────────────────────────────────

/** YYYY-MM-DD string for any Date, evaluated in IST. */
function toISTDateString(d: Date): string {
    const ist = new Date(d.getTime() + IST_OFFSET_MS);
    return [
        ist.getUTCFullYear(),
        String(ist.getUTCMonth() + 1).padStart(2, '0'),
        String(ist.getUTCDate()).padStart(2, '0'),
    ].join('-');
}

/** Add N calendar days to a YYYY-MM-DD string. */
function addCalendarDays(dateStr: string, days: number): string {
    const [y, m, d] = dateStr.split('-').map(Number);
    const r = new Date(Date.UTC(y, m - 1, d + days));
    return [
        r.getUTCFullYear(),
        String(r.getUTCMonth() + 1).padStart(2, '0'),
        String(r.getUTCDate()).padStart(2, '0'),
    ].join('-');
}

/**
 * End-of-window Date for a given IST date string "YYYY-MM-DD".
 * The IA window closes at IST midnight → UTC 18:30 of the same calendar date.
 */
function windowClosesAtForDate(dateStr: string): Date {
    return new Date(dateStr + 'T18:30:00.000Z');
}

// ── Public types ──────────────────────────────────────────────────────────────

export interface MissPenalty {
    ia_number: number;
    penalty:   number;
    ia_date:   string;   // "YYYY-MM-DD"
}

// ── Core sweep ────────────────────────────────────────────────────────────────

/**
 * Detects and records all missed IAs for a student.
 *
 * Case A — existing stale session:
 *   Find PENDING/IN_PROGRESS sessions whose ia_date < today → mark MISSED.
 *
 * Case B — scheduled date with no session:
 *   Reconstruct the IA schedule from the student's first drill.
 *   For every past IA date that has no IASession row → create MISSED row.
 *
 * Safe to call multiple times — already-MISSED sessions are excluded by the
 * status guard; retroactively created sessions use the unique
 * (student_id, ia_date) constraint so duplicates are silently skipped.
 */
export async function detectAndMarkMissedIAs(studentId: string): Promise<MissPenalty[]> {
    const todayStr = toISTDateString(new Date());
    const todayDate = new Date(todayStr);           // UTC midnight of today's IST date

    const penalties: MissPenalty[] = [];
    let totalDeduction = 0;

    // ── Cases A / B / C: stale sessions that exist but were never submitted ─────
    const staleSessions = await prisma.iASession.findMany({
        where: {
            student_id: studentId,
            ia_date:    { lt: todayDate },
            status:     { in: ['PENDING', 'IN_PROGRESS'] as any },
        },
        orderBy: { ia_date: 'asc' },
        select:  { id: true, selected_subskills: true, ia_date: true, ia_number: true, status: true, answers: true },
    });

    for (const stale of staleSessions) {
        const dateStr = stale.ia_date instanceof Date
            ? stale.ia_date.toISOString().split('T')[0]
            : String(stale.ia_date);

        if (stale.status === 'IN_PROGRESS') {
            // Count real answers — exclude __meta which is just session timing metadata
            const savedAnswers = (stale.answers as Record<string, unknown>) ?? {};
            const realAnswerCount = Object.keys(savedAnswers).filter(k => k !== '__meta').length;

            if (realAnswerCount > 0) {
                // Case B: student answered questions but didn't hit submit → auto-grade
                try {
                    await processIASession(stale.id, studentId);
                    // Session is now COMPLETED — no momentum penalty
                } catch (err) {
                    console.error(`[iaMissDetector] auto-grade failed for session ${stale.id}:`, err);
                    // Fall through: mark MISSED so it doesn't stay stuck IN_PROGRESS
                    await prisma.iASession.update({
                        where: { id: stale.id },
                        data:  { status: 'MISSED' as any, carry_forward_subskills: stale.selected_subskills as any, momentum_awarded: -MISS_PENALTY },
                    });
                    penalties.push({ ia_number: stale.ia_number, penalty: MISS_PENALTY, ia_date: dateStr });
                    totalDeduction += MISS_PENALTY;
                }
                continue;
            }
            // Case C: IN_PROGRESS but no answers → falls through to MISSED below
        }

        // Case A (PENDING) or Case C (IN_PROGRESS with no answers) → MISSED
        await prisma.iASession.update({
            where: { id: stale.id },
            data: {
                status:                  'MISSED' as any,
                carry_forward_subskills: stale.selected_subskills as any,
                momentum_awarded:        -MISS_PENALTY,
            },
        });
        penalties.push({ ia_number: stale.ia_number, penalty: MISS_PENALTY, ia_date: dateStr });
        totalDeduction += MISS_PENALTY;
    }

    // ── Case D: scheduled dates with NO session row at all ───────────────────
    const [firstDrill, firstEverSession] = await Promise.all([
        prisma.drillSession.findFirst({
            where:   { student_id: studentId },
            orderBy: { created_at: 'asc' },
            select:  { created_at: true },
        }),
        // The earliest IA session (any status) marks the first date the student
        // was eligible and the gate opened. Dates before this are pre-eligibility —
        // the student couldn't have taken them even if scheduled.
        prisma.iASession.findFirst({
            where:   { student_id: studentId },
            orderBy: { ia_date: 'asc' },
            select:  { ia_date: true },
        }),
    ]);

    if (firstDrill) {
        const firstDrillStr = toISTDateString(firstDrill.created_at);

        // Only retroactively mark dates from the student's first-ever IA session onward.
        // Dates before that are pre-eligibility — the gate wouldn't have opened anyway.
        const eligibilityFloor = firstEverSession
            ? (firstEverSession.ia_date instanceof Date
                ? firstEverSession.ia_date.toISOString().split('T')[0]
                : String(firstEverSession.ia_date))
            : todayStr;   // no session ever → nothing to retroactively mark

        // Build list of every past scheduled IA date on or after the eligibility floor
        const scheduledPast: { iaNumber: number; dateStr: string }[] = [];
        for (let n = 1; ; n++) {
            const dateStr = addCalendarDays(firstDrillStr, n * IA_INTERVAL_DAYS);
            if (dateStr >= todayStr) break;
            if (dateStr < eligibilityFloor) continue;   // skip pre-eligibility slots
            scheduledPast.push({ iaNumber: n, dateStr });
        }

        if (scheduledPast.length > 0) {
            // Fetch all existing sessions for these dates in one query
            const existingDates = new Set(
                (await prisma.iASession.findMany({
                    where: {
                        student_id: studentId,
                        ia_date:    { in: scheduledPast.map(s => new Date(s.dateStr)) },
                    },
                    select: { ia_date: true },
                })).map(s =>
                    s.ia_date instanceof Date
                        ? s.ia_date.toISOString().split('T')[0]
                        : String(s.ia_date)
                )
            );

            // Create MISSED rows for every past scheduled date that has no session
            for (const { iaNumber, dateStr } of scheduledPast) {
                if (existingDates.has(dateStr)) continue;

                try {
                    await prisma.iASession.create({
                        data: {
                            student_id:              studentId,
                            ia_number:               iaNumber,
                            ia_date:                 new Date(dateStr),
                            status:                  'MISSED' as any,
                            selected_subskills:      [] as any,
                            carry_forward_subskills: [] as any,
                            question_ids:            [] as any,
                            answers:                 {} as any,
                            momentum_awarded:        -MISS_PENALTY,
                            window_closes_at:        windowClosesAtForDate(dateStr),
                        },
                    });
                    penalties.push({ ia_number: iaNumber, penalty: MISS_PENALTY, ia_date: dateStr });
                    totalDeduction += MISS_PENALTY;
                } catch {
                    // Unique constraint violation = row already exists (race condition); safe to ignore
                }
            }
        }
    }

    // ── Deduct momentum (clamped to 0) ────────────────────────────────────────
    if (totalDeduction > 0) {
        const current = await prisma.institute_students.findUnique({
            where:  { id: studentId },
            select: { momentum_score: true },
        });
        const safeDeduction = Math.min(totalDeduction, current?.momentum_score ?? 0);
        if (safeDeduction > 0) {
            await prisma.institute_students.update({
                where: { id: studentId },
                data:  { momentum_score: { decrement: safeDeduction } },
            });
        }
    }

    return penalties;
}
