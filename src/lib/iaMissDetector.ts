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
import { processIASession, AlreadyCompletedError } from './iaProcessor';
import { AIGradingError } from './iaGrading';
import { computeAverageDCS } from './dcs';

// ── Constants (kept in sync with iaController.ts) ─────────────────────────────
const IST_OFFSET_MS    = 5.5 * 60 * 60 * 1000;
const IA_INTERVAL_DAYS = 3;
const MISS_PENALTY     = 20;
const IA_DCS_THRESHOLD = 40;  // avg DCS % required to be eligible to start an IA

/**
 * Marks one session/date MISSED and deducts the penalty in a SINGLE transaction,
 * so a crash can never leave a session flagged MISSED (-20) without the momentum
 * actually being deducted (the old code accumulated a total and deducted once at
 * the very end — an orphan-prone second step). Returns true if a penalty was applied.
 *
 * `mark(tx)` must return the number of rows it changed (0 = nothing to penalize).
 */
async function applyMissPenalty(
    studentId: string,
    mark: (tx: any) => Promise<number>,
): Promise<boolean> {
    return prisma.$transaction(async (tx) => {
        const changed = await mark(tx);
        if (changed <= 0) return false;
        const s   = await tx.institute_students.findUnique({ where: { id: studentId }, select: { momentum_score: true } });
        const ded = Math.min(MISS_PENALTY, s?.momentum_score ?? 0);
        if (ded > 0) {
            await tx.institute_students.update({ where: { id: studentId }, data: { momentum_score: { decrement: ded } } });
        }
        return true;
    });
}

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
        const dateStr = toISTDateString(
            stale.ia_date instanceof Date ? stale.ia_date : new Date(stale.ia_date as any)
        );

        if (stale.status === 'IN_PROGRESS') {
            // Count REAL answers — exclude __meta (timing metadata) and treat empty
            // strings / the '[no transcript]' sentinel as no answer, matching how
            // submitIA and processIASession judge emptiness. Prevents a genuinely
            // empty attempt from being auto-graded COMPLETED (+100) instead of MISSED.
            const savedAnswers = (stale.answers as Record<string, unknown>) ?? {};
            const realAnswerCount = Object.entries(savedAnswers).filter(([k, v]) => {
                if (k === '__meta') return false;
                const t = String(v ?? '').trim();
                return t !== '' && t !== '[no transcript]';
            }).length;

            if (realAnswerCount > 0) {
                // Case B: student answered questions but didn't hit submit → auto-grade
                try {
                    await processIASession(stale.id, studentId);
                    // Session is now COMPLETED — no momentum penalty
                } catch (err) {
                    if (err instanceof AlreadyCompletedError) {
                        continue; // concurrent call already graded it — session is COMPLETED, move on
                    }
                    if (err instanceof AIGradingError) {
                        // Infra failure (AI outage/quota) — NOT the student's fault. Leave the
                        // session IN_PROGRESS and untouched so a later sweep can grade it once
                        // the grader recovers. Never convert answered work into a MISSED penalty.
                        console.warn(`[iaMissDetector] AI grading unavailable for session ${stale.id}; will retry next sweep.`);
                        continue;
                    }
                    console.error(`[iaMissDetector] auto-grade failed for session ${stale.id}:`, err);
                    // Fall through: mark MISSED so it doesn't stay stuck IN_PROGRESS.
                    // Mark + deduct atomically (status guard also avoids a TOCTOU race where a
                    // concurrent submitIA already marked this COMPLETED between findMany and here).
                    const applied = await applyMissPenalty(studentId, (tx) =>
                        tx.iASession.updateMany({
                            where: { id: stale.id, status: { in: ['PENDING', 'IN_PROGRESS'] as any } },
                            data:  { status: 'MISSED' as any, carry_forward_subskills: stale.selected_subskills as any, momentum_awarded: -MISS_PENALTY },
                        }).then((r: any) => r.count)
                    );
                    if (applied) penalties.push({ ia_number: stale.ia_number, penalty: MISS_PENALTY, ia_date: dateStr });
                }
                continue;
            }
            // Case C: IN_PROGRESS but no answers → falls through to MISSED below
        }

        // Case A (PENDING) or Case C (IN_PROGRESS with no answers) → MISSED.
        // Mark + deduct atomically; status guard prevents overwriting a concurrent
        // submitIA that marked this COMPLETED between the findMany above and this write.
        const applied = await applyMissPenalty(studentId, (tx) =>
            tx.iASession.updateMany({
                where: { id: stale.id, status: { in: ['PENDING', 'IN_PROGRESS'] as any } },
                data: {
                    status:                  'MISSED' as any,
                    carry_forward_subskills: stale.selected_subskills as any,
                    momentum_awarded:        -MISS_PENALTY,
                },
            }).then((r: any) => r.count)
        );
        if (applied) penalties.push({ ia_number: stale.ia_number, penalty: MISS_PENALTY, ia_date: dateStr });
    }

    // ── Case D: scheduled dates with NO session row at all ───────────────────
    const [firstDrill, sixthDrill] = await Promise.all([
        prisma.drillSession.findFirst({
            where:   { student_id: studentId },
            orderBy: { created_at: 'asc' },
            select:  { created_at: true },
        }),
        // The 6th completed drill is the true eligibility gate — IAs only open after
        // IA_DRILL_THRESHOLD (6) drills are done.  Using this date prevents retroactively
        // marking sessions MISSED for days when the student was never eligible.
        prisma.drillSession.findFirst({
            where:   { student_id: studentId, status: { in: ['DRILL_DONE', 'APPLY_DONE'] as any } },
            orderBy: { created_at: 'asc' },
            skip:    5,   // 0-indexed: skip first 5 → land on the 6th
            select:  { created_at: true },
        }),
    ]);

    // DCS gate (M-11): the Start button requires avg DCS >= 40%. A student below that
    // threshold was never allowed to START an IA, so don't retroactively penalize them
    // for "missing" IAs they could not have taken. (Cases A/C above are real started
    // sessions, so they were eligible; only Case D — no session at all — needs this gate.)
    const avgDcs = await computeAverageDCS(studentId);
    const dcsEligible = avgDcs >= IA_DCS_THRESHOLD;

    if (firstDrill && dcsEligible) {
        const firstDrillStr = toISTDateString(firstDrill.created_at);

        // Only retroactively mark dates from the student's actual eligibility date onward.
        // That is the IST calendar date of their 6th completed drill — the real gate.
        const eligibilityFloor = sixthDrill
            ? toISTDateString(sixthDrill.created_at)
            : todayStr;  // fewer than 6 drills → student was never eligible → nothing to mark

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
                })).map(s => toISTDateString(
                    s.ia_date instanceof Date ? s.ia_date : new Date(s.ia_date as any)
                ))
            );

            // Create MISSED rows for every past scheduled date that has no session.
            // Each create + its penalty deduction commit atomically: if the create hits
            // the unique constraint (row already exists / race), the whole tx rolls back
            // and nothing is deducted (caught below). No orphaned penalties either way.
            for (const { iaNumber, dateStr } of scheduledPast) {
                if (existingDates.has(dateStr)) continue;

                try {
                    await applyMissPenalty(studentId, async (tx) => {
                        await tx.iASession.create({
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
                        return 1;
                    });
                    penalties.push({ ia_number: iaNumber, penalty: MISS_PENALTY, ia_date: dateStr });
                } catch {
                    // Unique constraint violation = row already exists (race); tx rolled back, safe to ignore
                }
            }
        }
    }

    return penalties;
}
