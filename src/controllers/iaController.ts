import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import prisma from '../lib/prisma';
import { computeAverageDCS } from '../lib/dcs';

// ─── Constants ────────────────────────────────────────────────────────────────
const IA_DRILL_THRESHOLD  = 6;   // total sessions required before any IA
const IA_MIN_DAYS         = 2;   // calendar days since first drill required
const IA_DCS_THRESHOLD    = 40;  // avg DCS % required to start the test
const IA_INTERVAL_DAYS    = 3;   // IA schedule: first_drill + 3, +6, +9 …
const IST_OFFSET_MS       = 5.5 * 60 * 60 * 1000;

// ─── IST date helpers ─────────────────────────────────────────────────────────

/** Returns YYYY-MM-DD for any Date value, evaluated in IST. */
function toISTDateString(d: Date): string {
    const ist = new Date(d.getTime() + IST_OFFSET_MS);
    return [
        ist.getUTCFullYear(),
        String(ist.getUTCMonth() + 1).padStart(2, '0'),
        String(ist.getUTCDate()).padStart(2, '0')
    ].join('-');
}

/** Add N calendar days to a YYYY-MM-DD string, returning a new YYYY-MM-DD string. */
function addCalendarDays(dateStr: string, days: number): string {
    const [y, m, d] = dateStr.split('-').map(Number);
    const result = new Date(Date.UTC(y, m - 1, d + days));
    return [
        result.getUTCFullYear(),
        String(result.getUTCMonth() + 1).padStart(2, '0'),
        String(result.getUTCDate()).padStart(2, '0')
    ].join('-');
}

/** Integer calendar-day difference: toStr − fromStr (positive = future). */
function daysBetween(fromStr: string, toStr: string): number {
    const parse = (s: string) => { const [y, m, d] = s.split('-').map(Number); return Date.UTC(y, m - 1, d); };
    return Math.round((parse(toStr) - parse(fromStr)) / 86_400_000);
}

/** Human-readable date label: "Wed, 7 May" */
function formatIADate(dateStr: string): string {
    const [y, m, d] = dateStr.split('-').map(Number);
    return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('en-IN', {
        weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC'
    });
}

// ─── GET /api/ia/eligibility  (kept for backward compat) ─────────────────────
// Thin wrapper — delegates to the new status logic and surfaces only what the
// old Assessment.tsx eligibility gate expected.
export async function getIAEligibility(req: AuthRequest, res: Response) {
    return getIAStatus(req, res);
}

// ─── GET /api/ia/status ───────────────────────────────────────────────────────
// Single source of truth for everything /student/internal and the dashboard
// IA widget need.
//
// Response shape:
//   has_schedule       — student has done ≥ 1 drill (schedule exists)
//   prerequisites_met  — 6 drills + 2 days (DCS is NOT a prerequisite gate here)
//   avg_dcs            — per-sub-skill weighted average DCS, integer 0-100
//   dcs_eligible       — avg_dcs ≥ 40 (gates the start-test button on IA day)
//   is_ia_day          — today (IST) is a scheduled IA date
//   current_ia_number  — 1-based index of today's IA slot (null if not IA day)
//   can_start_test     — is_ia_day && prerequisites_met && dcs_eligible
//   next_ia            — next future IA slot { number, date, date_formatted, days_away }
//   upcoming_ias       — next 2 future slots (for dashboard widget)
//   progress           — raw numbers for the not-eligible detail screen
export async function getIAStatus(req: AuthRequest, res: Response) {
    try {
        const appUserId = (req as any).appUserId as string;
        if (!appUserId) return res.status(401).json({ success: false, error: 'Unauthorized.' });

        const student = await prisma.institute_students.findUnique({ where: { user_id: appUserId } });
        if (!student) return res.status(404).json({ success: false, error: 'Student not found.' });

        // ── All drill sessions (cheapest single query) ────────────────────────
        const allSessions = await prisma.drillSession.findMany({
            where:   { student_id: student.id },
            orderBy: { created_at: 'asc' },
            select:  { id: true, created_at: true }
        });

        const drills_completed = allSessions.length;

        // ── No drills at all → nothing to schedule ────────────────────────────
        if (drills_completed === 0) {
            return res.json({
                success:           true,
                has_schedule:      false,
                prerequisites_met: false,
                avg_dcs:           0,
                dcs_eligible:      false,
                is_ia_day:         false,
                current_ia_number: null,
                can_start_test:    false,
                next_ia:           null,
                upcoming_ias:      [],
                progress: {
                    drills_completed:       0,
                    drills_required:        IA_DRILL_THRESHOLD,
                    days_since_first_drill: 0,
                    min_days_required:      IA_MIN_DAYS,
                    avg_dcs:                0,
                    dcs_required:           IA_DCS_THRESHOLD,
                    cond_drills:            false,
                    cond_days:              false,
                    cond_dcs:               false
                }
            });
        }

        // ── Schedule anchor: IST calendar date of the very first drill ────────
        const firstDrillDateStr = toISTDateString(allSessions[0].created_at);
        const todayStr          = toISTDateString(new Date());

        // ── Prerequisites (non-DCS gates) ─────────────────────────────────────
        const days_since_first_drill = daysBetween(firstDrillDateStr, todayStr);
        const cond_drills = drills_completed >= IA_DRILL_THRESHOLD;
        const cond_days   = days_since_first_drill >= IA_MIN_DAYS;
        const prerequisites_met = cond_drills && cond_days;

        // ── DCS ───────────────────────────────────────────────────────────────
        const avg_dcs    = await computeAverageDCS(student.id);
        const cond_dcs   = avg_dcs >= IA_DCS_THRESHOLD;

        // ── Build IA schedule: first_drill + 3, +6, +9 … up to 30 slots ──────
        // We generate enough to always find the next 2 future dates.
        const LOOKAHEAD = 30;
        const schedule = Array.from({ length: LOOKAHEAD }, (_, i) => {
            const n    = i + 1;
            const date = addCalendarDays(firstDrillDateStr, n * IA_INTERVAL_DAYS);
            return { number: n, date };
        });

        // ── Classify today ────────────────────────────────────────────────────
        const todaySlot        = schedule.find(s => s.date === todayStr) ?? null;
        const is_ia_day        = todaySlot !== null;
        const current_ia_number = todaySlot?.number ?? null;
        const can_start_test   = is_ia_day && prerequisites_met && cond_dcs;

        // ── Upcoming slots (strictly future) ─────────────────────────────────
        const futureSlots = schedule
            .filter(s => s.date > todayStr)
            .slice(0, 2)
            .map(s => ({
                number:         s.number,
                date:           s.date,
                date_formatted: formatIADate(s.date),
                days_away:      daysBetween(todayStr, s.date)
            }));

        const next_ia = futureSlots[0] ?? null;

        // ── Reasons array (for not-eligible detail screen) ────────────────────
        const reasons: { key: string; message: string }[] = [];
        if (!cond_drills) {
            const rem = IA_DRILL_THRESHOLD - drills_completed;
            reasons.push({ key: 'drills', message: `Complete ${rem} more drill session${rem !== 1 ? 's' : ''} (${drills_completed} / ${IA_DRILL_THRESHOLD} done)` });
        }
        if (!cond_days) {
            const rem = IA_MIN_DAYS - days_since_first_drill;
            reasons.push({ key: 'days', message: `Wait ${rem} more day${rem !== 1 ? 's' : ''} since your first drill (${days_since_first_drill} / ${IA_MIN_DAYS} days)` });
        }
        if (!cond_dcs) {
            reasons.push({ key: 'dcs', message: `Raise your average drill accuracy to ${IA_DCS_THRESHOLD}% — currently ${avg_dcs}%` });
        }

        return res.json({
            success:            true,
            has_schedule:       true,
            first_drill_date:   firstDrillDateStr,
            prerequisites_met,
            avg_dcs,
            dcs_required:       IA_DCS_THRESHOLD,
            dcs_eligible:       cond_dcs,
            is_ia_day,
            current_ia_number,
            can_start_test,
            next_ia,
            upcoming_ias:       futureSlots,
            reasons,
            progress: {
                drills_completed,
                drills_required:        IA_DRILL_THRESHOLD,
                days_since_first_drill,
                min_days_required:      IA_MIN_DAYS,
                avg_dcs,
                dcs_required:           IA_DCS_THRESHOLD,
                cond_drills,
                cond_days,
                cond_dcs
            }
        });
    } catch (err) {
        console.error('[IAStatus] error:', err);
        return res.status(500).json({ success: false, error: 'Internal server error.' });
    }
}
