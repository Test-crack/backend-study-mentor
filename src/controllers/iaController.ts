import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import prisma from '../lib/prisma';
import { computeAverageDCS } from '../lib/dcs';
import { selectPrioritySubSkills } from '../lib/subskillSelector';
import { gradeIAWritingPrompt, gradeIASpeakingPrompt, AIGradingError } from '../lib/iaGrading';
import { detectAndMarkMissedIAs } from '../lib/iaMissDetector';
import { processIASession, AlreadyCompletedError, applySmoothing, SUB_SCORE_KEY_MAP, type SectionScore } from '../lib/iaProcessor';
import { examDifficulty } from '../exam-engine';

// â”€â”€â”€ Constants â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
const IA_DRILL_THRESHOLD = 6;   // total sessions required before any IA
const IA_MIN_DAYS = 2;   // calendar days since first drill required
const IA_DCS_THRESHOLD = 40;  // avg DCS % required to start the test
const IA_INTERVAL_DAYS = 3;   // IA schedule: first_drill + 3, +6, +9 â€¦
const IA_MIN_WINDOW_MS = 40 * 60 * 1000;  // block new session if <40 min remain in today's window (2 sections Ã— 20 min)
const MISS_PENALTY = 20;  // momentum deducted for a missed IA (must match iaMissDetector)
const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;

// â”€â”€â”€ IST date helpers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

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

/** Integer calendar-day difference: toStr âˆ’ fromStr (positive = future). */
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

// â”€â”€â”€ GET /api/ia/eligibility  (kept for backward compat) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Thin wrapper â€” delegates to the new status logic and surfaces only what the
// old Assessment.tsx eligibility gate expected.
export async function getIAEligibility(req: AuthRequest, res: Response) {
    return getIAStatus(req, res);
}

// â”€â”€â”€ GET /api/ia/status â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Single source of truth for everything /student/internal and the dashboard
// IA widget need.
//
// Response shape:
//   has_schedule       â€” student has done â‰¥ 1 drill (schedule exists)
//   prerequisites_met  â€” 6 drills + 2 days (DCS is NOT a prerequisite gate here)
//   avg_dcs            â€” per-sub-skill weighted average DCS, integer 0-100
//   dcs_eligible       â€” avg_dcs â‰¥ 40 (gates the start-test button on IA day)
//   is_ia_day          â€” today (IST) is a scheduled IA date
//   current_ia_number  â€” 1-based index of today's IA slot (null if not IA day)
//   can_start_test     â€” is_ia_day && prerequisites_met && dcs_eligible
//   next_ia            â€” next future IA slot { number, date, date_formatted, days_away }
//   upcoming_ias       â€” next 2 future slots (for dashboard widget)
//   progress           â€” raw numbers for the not-eligible detail screen
export async function getIAStatus(req: AuthRequest, res: Response) {
    try {
        const appUserId = (req as any).appUserId as string;
        if (!appUserId) return res.status(401).json({ success: false, error: 'Unauthorized.' });

        const student = await prisma.instituteStudent.findUnique({ where: { user_id: appUserId } });
        if (!student) return res.status(404).json({ success: false, error: 'Student not found.' });

        // â”€â”€ All drill sessions (cheapest single query) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
        const allSessions = await prisma.drillSession.findMany({
            where: { student_id: student.id },
            orderBy: { created_at: 'asc' },
            select: { id: true, created_at: true, status: true }
        });

        // Prerequisite gate counts COMPLETED drills only â€” a STARTED-but-abandoned
        // session must not make the IA look startable (getIAQuestions would then 403).
        const drills_completed = allSessions.filter(
            s => s.status === 'DRILL_DONE' || s.status === 'APPLY_DONE'
        ).length;

        // â”€â”€ No drill sessions at all â†’ nothing to schedule (need an anchor date) â”€
        if (allSessions.length === 0) {
            return res.json({
                success: true,
                missed_count: 0,
                has_schedule: false,
                prerequisites_met: false,
                avg_dcs: 0,
                dcs_eligible: false,
                is_ia_day: false,
                current_ia_number: null,
                can_start_test: false,
                next_ia: null,
                upcoming_ias: [],
                progress: {
                    drills_completed: 0,
                    drills_required: IA_DRILL_THRESHOLD,
                    days_since_first_drill: 0,
                    min_days_required: IA_MIN_DAYS,
                    avg_dcs: 0,
                    dcs_required: IA_DCS_THRESHOLD,
                    cond_drills: false,
                    cond_days: false,
                    cond_dcs: false
                }
            });
        }

        // â”€â”€ Schedule anchor: IST calendar date of the very first drill â”€â”€â”€â”€â”€â”€â”€â”€
        const firstDrillDateStr = toISTDateString(allSessions[0].created_at);
        const todayStr = toISTDateString(new Date());

        // â”€â”€ Miss detection (shared with getPendingNotifications) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
        const penaltiesApplied = await detectAndMarkMissedIAs(student.id);

        // â”€â”€ Prerequisites (non-DCS gates) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
        const days_since_first_drill = daysBetween(firstDrillDateStr, todayStr);
        const cond_drills = drills_completed >= IA_DRILL_THRESHOLD;
        const cond_days = days_since_first_drill >= IA_MIN_DAYS;
        const prerequisites_met = cond_drills && cond_days;

        // â”€â”€ DCS â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
        const avg_dcs = await computeAverageDCS(student.id);
        const cond_dcs = avg_dcs >= IA_DCS_THRESHOLD;

        // â”€â”€ IA schedule: first_drill + 3, +6, +9 â€¦ computed DYNAMICALLY â”€â”€â”€â”€â”€â”€â”€
        // Any day that is a positive multiple of the interval since the first drill is
        // an IA day. Computing this (rather than a fixed N-slot array) means IAs remain
        // available indefinitely â€” a previous 30-slot / 90-day ceiling made is_ia_day
        // false past day 90 while the miss detector kept penalizing, so long-term
        // students bled âˆ’20 every 3 days with no way to comply.
        const daysSinceForSchedule = daysBetween(firstDrillDateStr, todayStr);
        const is_ia_day = daysSinceForSchedule > 0 && daysSinceForSchedule % IA_INTERVAL_DAYS === 0;
        const current_ia_number = is_ia_day ? daysSinceForSchedule / IA_INTERVAL_DAYS : null;
        const can_start_test = is_ia_day && prerequisites_met && cond_dcs;

        // â”€â”€ Upcoming slots (next two strictly-future IA dates) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
        const nextN = Math.floor(daysSinceForSchedule / IA_INTERVAL_DAYS) + 1;
        const futureSlots = [nextN, nextN + 1].map(n => {
            const date = addCalendarDays(firstDrillDateStr, n * IA_INTERVAL_DAYS);
            return {
                number: n,
                date,
                date_formatted: formatIADate(date),
                days_away: daysBetween(todayStr, date)
            };
        });

        const next_ia = futureSlots[0] ?? null;

        // â”€â”€ Reasons array (for not-eligible detail screen) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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
            reasons.push({ key: 'dcs', message: `Raise your average drill accuracy to ${IA_DCS_THRESHOLD}% â€” currently ${avg_dcs}%` });
        }

        // When student can start today, preview which sub-skills will be targeted
        let suggested_subskills: { skill: string; sub_skill: string }[] | null = null;
        if (can_start_test) {
            try {
                const sel = await selectPrioritySubSkills(student.id);
                suggested_subskills = [sel.primary, sel.secondary];
            } catch { /* non-fatal â€” gate still opens without preview */ }
        }

        // Active in-progress session today â†’ gate shows "Continue Assessment" instead of "Start"
        // Also check for completed session to show scores
        const todayActiveSession = is_ia_day
            ? await prisma.iASession.findFirst({
                where: { student_id: student.id, ia_date: new Date(todayStr), status: { in: ['PENDING', 'IN_PROGRESS'] as any } }
            })
            : null;

        const todayCompletedSession = is_ia_day
            ? await prisma.iASession.findFirst({
                where: { student_id: student.id, ia_date: new Date(todayStr), status: 'COMPLETED' as any },
                select: { scores: true, momentum_awarded: true }
            })
            : null;

        return res.json({
            success: true,
            missed_count: penaltiesApplied.length,
            penalties_applied: penaltiesApplied,
            has_active_session: !!todayActiveSession,
            has_completed_session: !!todayCompletedSession,
            completed_session_scores: todayCompletedSession?.scores ?? null,
            completed_session_momentum: todayCompletedSession?.momentum_awarded ?? null,
            has_schedule: true,
            first_drill_date: firstDrillDateStr,
            prerequisites_met,
            avg_dcs,
            dcs_required: IA_DCS_THRESHOLD,
            dcs_eligible: cond_dcs,
            is_ia_day,
            current_ia_number,
            can_start_test,
            suggested_subskills,
            next_ia,
            upcoming_ias: futureSlots,
            reasons,
            progress: {
                drills_completed,
                drills_required: IA_DRILL_THRESHOLD,
                days_since_first_drill,
                min_days_required: IA_MIN_DAYS,
                avg_dcs,
                dcs_required: IA_DCS_THRESHOLD,
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

// â”€â”€â”€ Shared helpers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

const SECTION_IA_MS = 20 * 60 * 1000;  // 20 min per section; 2 sections = 40 min total
// SUB_SCORE_KEY_MAP imported from iaProcessor â€” single source of truth

/** UTC instant at IST midnight of today. */
function todayStartISTLocal(): Date {
    const nowIST = new Date(Date.now() + IST_OFFSET_MS);
    return new Date(Date.UTC(nowIST.getUTCFullYear(), nowIST.getUTCMonth(), nowIST.getUTCDate()) - IST_OFFSET_MS);
}

/** UTC instant at IST midnight of tomorrow â€” i.e. end of today. */
function todayEndIST(): Date {
    return new Date(todayStartISTLocal().getTime() + 24 * 60 * 60 * 1000);
}

// Difficulty from the exam's config-declared proficiency cuts (Phase 6 Part 2).
function getDifficulty(band: number): 'BEGINNER' | 'INTERMEDIATE' | 'ADVANCED' {
    return examDifficulty('ielts', band) as 'BEGINNER' | 'INTERMEDIATE' | 'ADVANCED';
}

function getBandForSubSkill(
    skill: string,
    subSkill: string,
    competency: Array<{ skill: string; band_score: any; sub_scores: any }>
): number {
    const row = competency.find(r => r.skill === skill);
    if (!row) return 5.0;
    const key = SUB_SCORE_KEY_MAP[subSkill];
    if (key) {
        const val = (row.sub_scores as any)?.[key];
        if (val != null) return parseFloat(String(val)) || 5.0;
    }
    return parseFloat(String(row.band_score ?? '5.0')) || 5.0;
}

/** Strip answer key and explanation â€” never send to frontend during active session. */
function sanitizeQuestions(qs: any[]): any[] {
    return qs.map(q => {
        const { correct_answer: _ca, explanation: _ex, ...safe } = q;
        return safe;
    });
}

/** Shuffle array in-place (Fisher-Yates). */
function shuffle<T>(arr: T[]): T[] {
    for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
}

/**
 * Fetch 10 questions for a given (skill, sub_skill) pair.
 * Smart grouping:
 *   LISTENING â†’ pick one random audio_url group (all questions share the same audio)
 *   READING   â†’ pick one random passage_id group (all questions share the same passage)
 *   Others    â†’ 8 MCQ + 2 WRITING_PROMPT|SPEAKING_PROMPT; falls back gracefully when seeding is partial
 */
async function fetchSectionQuestions(
    skill: string,
    subSkill: string,
    difficulty: 'BEGINNER' | 'INTERMEDIATE' | 'ADVANCED'
): Promise<{ section_type: string; audio_url: string | null; passage_text: string | null; passage_id: string | null; questions: any[] }> {

    const base = { skill, sub_skill: subSkill, difficulty, is_active: true } as any;

    // â”€â”€ LISTENING â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    if (subSkill === 'LISTENING') {
        const pool = await prisma.iAQuestion.findMany({
            where: { ...base, audio_url: { not: null } },
            select: { id: true, audio_url: true, question_type: true, prompt_text: true, options: true }
        });
        if (pool.length === 0) {
            // Cross-difficulty fallback
            const fallback = await prisma.iAQuestion.findMany({
                where: { skill: 'LISTENING' as any, sub_skill: 'LISTENING' as any, is_active: true, audio_url: { not: null } },
                select: { id: true, audio_url: true, question_type: true, prompt_text: true, options: true }
            });
            if (fallback.length === 0) return { section_type: 'AUDIO', audio_url: null, passage_text: null, passage_id: null, questions: [] };
            const groups = [...new Set(fallback.map(q => q.audio_url!))];
            const chosen = groups[Math.floor(Math.random() * groups.length)];
            const qs = shuffle(fallback.filter(q => q.audio_url === chosen)).slice(0, 10);
            return { section_type: 'AUDIO', audio_url: chosen, passage_text: null, passage_id: null, questions: qs };
        }
        const groups = [...new Set(pool.map(q => q.audio_url!))];
        const chosen = groups[Math.floor(Math.random() * groups.length)];
        const qs = shuffle(pool.filter(q => q.audio_url === chosen)).slice(0, 10);
        return { section_type: 'AUDIO', audio_url: chosen, passage_text: null, passage_id: null, questions: qs };
    }

    // â”€â”€ READING â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    if (subSkill === 'READING') {
        const pool = await prisma.iAQuestion.findMany({
            where: { ...base, passage_id: { not: null } },
            select: { id: true, passage_id: true, passage_text: true, question_type: true, prompt_text: true, options: true }
        });
        if (pool.length === 0) {
            const fallback = await prisma.iAQuestion.findMany({
                where: { skill: 'READING' as any, sub_skill: 'READING' as any, is_active: true, passage_id: { not: null } },
                select: { id: true, passage_id: true, passage_text: true, question_type: true, prompt_text: true, options: true }
            });
            if (fallback.length === 0) return { section_type: 'PASSAGE', audio_url: null, passage_text: null, passage_id: null, questions: [] };
            const groups = [...new Set(fallback.map(q => q.passage_id!))];
            const chosen = groups[Math.floor(Math.random() * groups.length)];
            return buildPassageSection(fallback, chosen);
        }
        const groups = [...new Set(pool.map(q => q.passage_id!))];
        const chosen = groups[Math.floor(Math.random() * groups.length)];
        return buildPassageSection(pool, chosen);
    }

    // â”€â”€ WRITING / SPEAKING sub-skills â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    // 8 MCQ + 2 WRITING_PROMPT | SPEAKING_PROMPT
    const promptType = skill === 'WRITING' ? 'WRITING_PROMPT' : 'SPEAKING_PROMPT';

    const [mcqs, prompts] = await Promise.all([
        prisma.iAQuestion.findMany({
            where: { ...base, question_type: 'MCQ' },
            select: { id: true, question_type: true, prompt_text: true, options: true }
        }),
        prisma.iAQuestion.findMany({
            where: { ...base, question_type: promptType },
            select: { id: true, question_type: true, prompt_text: true, options: true }
        })
    ]);

    // Fallback: if not enough MCQ for this difficulty, pull from other difficulties
    let finalMCQ = shuffle([...mcqs]).slice(0, 8);
    if (finalMCQ.length < 8) {
        const extra = await prisma.iAQuestion.findMany({
            where: {
                skill: skill as any, sub_skill: subSkill as any, question_type: 'MCQ', is_active: true,
                id: { notIn: finalMCQ.map(q => q.id) }
            },
            select: { id: true, question_type: true, prompt_text: true, options: true }
        });
        finalMCQ = [...finalMCQ, ...shuffle(extra)].slice(0, 8);
    }

    let finalPrompts = shuffle([...prompts]).slice(0, 2);
    if (finalPrompts.length < 2) {
        const extra = await prisma.iAQuestion.findMany({
            where: {
                skill: skill as any, sub_skill: subSkill as any, question_type: promptType as any, is_active: true,
                id: { notIn: finalPrompts.map(q => q.id) }
            },
            select: { id: true, question_type: true, prompt_text: true, options: true }
        });
        finalPrompts = [...finalPrompts, ...shuffle(extra)].slice(0, 2);
    }

    return {
        section_type: 'MCQ_MIX',
        audio_url: null,
        passage_text: null,
        passage_id: null,
        questions: [...finalMCQ, ...finalPrompts]
    };
}

function buildPassageSection(
    pool: Array<{ id: string; passage_id: string | null; passage_text: string | null; question_type: string; prompt_text: string; options: any }>,
    chosenPassageId: string
) {
    const grouped = shuffle(pool.filter(q => q.passage_id === chosenPassageId)).slice(0, 10);
    const passageText = pool.find(q => q.passage_id === chosenPassageId && q.passage_text)?.passage_text ?? null;
    return {
        section_type: 'PASSAGE',
        audio_url: null,
        passage_text: passageText,
        passage_id: chosenPassageId,
        questions: grouped.map(q => ({ id: q.id, question_type: q.question_type, prompt_text: q.prompt_text, options: q.options }))
    };
}

// â”€â”€â”€ GET /api/ia/questions â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
export async function getIAQuestions(req: AuthRequest, res: Response) {
    try {
        const appUserId = (req as any).appUserId as string;
        if (!appUserId) return res.status(401).json({ success: false, error: 'Unauthorized.' });

        const student = await prisma.instituteStudent.findUnique({ where: { user_id: appUserId } });
        if (!student) return res.status(404).json({ success: false, error: 'Student not found.' });

        const todayStr = toISTDateString(new Date());

        // â”€â”€ 1. Validate this is an IA day for this student â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
        const allDrills = await prisma.drillSession.findMany({
            where: { student_id: student.id }, orderBy: { created_at: 'asc' }, select: { created_at: true }
        });
        if (allDrills.length === 0) return res.status(400).json({ success: false, error: 'No drill history found.' });

        const firstDrillStr = toISTDateString(allDrills[0].created_at);
        const daysSinceFirst = daysBetween(firstDrillStr, todayStr);
        const isScheduledDay = daysSinceFirst > 0 && daysSinceFirst % IA_INTERVAL_DAYS === 0;

        if (!isScheduledDay) {
            return res.status(400).json({ success: false, error: 'not_ia_day', message: 'Today is not a scheduled IA day.' });
        }

        const ia_number = daysSinceFirst / IA_INTERVAL_DAYS;
        const windowClosesAt = todayEndIST();

        // â”€â”€ 2. Check existing session â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
        const existing = await prisma.iASession.findUnique({
            where: { student_id_ia_date: { student_id: student.id, ia_date: new Date(todayStr) } }
        });

        if (existing) {
            if (existing.status === 'COMPLETED' || existing.status === 'MISSED') {
                return res.json({ success: true, already_done: true, status: existing.status });
            }

            if (existing.status === 'IN_PROGRESS' || existing.status === 'PENDING') {
                // Resume: fetch questions by saved IDs in order
                const savedConfig = existing.question_ids as Array<{ skill: string; sub_skill: string; ids: string[] }>;
                const allIds = savedConfig.flatMap(s => s.ids);
                const questionRows = await prisma.iAQuestion.findMany({
                    where: { id: { in: allIds } },
                    select: { id: true, skill: true, sub_skill: true, question_type: true, prompt_text: true, options: true, audio_url: true, passage_id: true, passage_text: true }
                });

                // Rebuild sections preserving original order
                const sections = savedConfig.map(cfg => {
                    const qs = cfg.ids
                        .map(id => questionRows.find(q => q.id === id))
                        .filter(Boolean)
                        .map(q => ({ id: q!.id, question_type: q!.question_type, prompt_text: q!.prompt_text, options: q!.options }));
                    const audioUrl = questionRows.find(q => cfg.ids.includes(q.id) && q.audio_url)?.audio_url ?? null;
                    const passageId = questionRows.find(q => cfg.ids.includes(q.id) && q.passage_id)?.passage_id ?? null;
                    const passageTxt = questionRows.find(q => cfg.ids.includes(q.id) && q.passage_text)?.passage_text ?? null;
                    const sectionType = audioUrl ? 'AUDIO' : passageId ? 'PASSAGE' : 'MCQ_MIX';
                    return { skill: cfg.skill, sub_skill: cfg.sub_skill, section_type: sectionType, audio_url: audioUrl, passage_text: passageTxt, passage_id: passageId, questions: qs };
                });

                // Per-section timing: read __meta written by section-advance events
                const allAnswers = (existing.answers as Record<string, any>) ?? {};
                const meta = (allAnswers.__meta ?? {}) as { current_section?: number; section_started_at?: number };
                const resumeSectionIdx = meta.current_section ?? 0;
                const sectionStartedAt = meta.section_started_at ?? (existing.time_started_at?.getTime() ?? Date.now());
                const elapsed = Date.now() - sectionStartedAt;
                const timeRemaining = Math.max(0, SECTION_IA_MS - elapsed);

                // Mark IN_PROGRESS and initialise __meta if still PENDING (first open)
                if (existing.status === 'PENDING') {
                    const now = Date.now();
                    allAnswers.__meta = { current_section: 0, section_started_at: now };
                    await prisma.iASession.update({
                        where: { id: existing.id },
                        data: { status: 'IN_PROGRESS', time_started_at: new Date(now), answers: allAnswers as any }
                    });
                }

                return res.json({
                    success: true,
                    session_id: existing.id,
                    ia_number,
                    resume: true,
                    current_section_idx: resumeSectionIdx,
                    selected_subskills: existing.selected_subskills,
                    sections,
                    saved_answers: existing.answers,
                    window_closes_at: windowClosesAt.toISOString(),
                    time_remaining_ms: timeRemaining
                });
            }
        }

        // â”€â”€ 3. Guard: block new session if too little time remains in window â”€â”€â”€â”€
        // Prevents the edge case where a student opens the test at 11:58 PM IST
        // (2 minutes left), can't possibly finish, and gets MISSED + -20 momentum.
        const timeRemainingInWindow = windowClosesAt.getTime() - Date.now();
        if (timeRemainingInWindow < IA_MIN_WINDOW_MS) {
            const minutesLeft = Math.floor(timeRemainingInWindow / 60000);
            return res.status(400).json({
                success: false,
                error:   'window_closing_soon',
                message: `Only ${minutesLeft} minute${minutesLeft !== 1 ? 's' : ''} remain in today's IA window â€” not enough time to start. Your next IA slot opens in a few days.`,
            });
        }

        // â”€â”€ 3b. Prerequisites + DCS gate (new sessions only â€” resume always allowed) â”€â”€â”€â”€â”€â”€
        const [completedDrillCount, avgDcsForGate] = await Promise.all([
            prisma.drillSession.count({
                where: { student_id: student.id, status: { in: ['DRILL_DONE', 'APPLY_DONE'] as any } }
            }),
            computeAverageDCS(student.id),
        ]);
        if (completedDrillCount < IA_DRILL_THRESHOLD) {
            return res.status(403).json({
                success: false, error: 'prerequisites_not_met',
                message: `Complete at least ${IA_DRILL_THRESHOLD} drill sessions before starting an IA. You have ${completedDrillCount}.`
            });
        }
        if (daysSinceFirst < IA_MIN_DAYS) {
            return res.status(403).json({
                success: false, error: 'prerequisites_not_met',
                message: `At least ${IA_MIN_DAYS} days must pass after your first drill before starting an IA. Currently: ${daysSinceFirst} day(s).`
            });
        }
        if (avgDcsForGate < IA_DCS_THRESHOLD) {
            return res.status(403).json({
                success: false, error: 'dcs_not_met',
                message: `Your average drill accuracy must be at least ${IA_DCS_THRESHOLD}% to start an IA. Currently: ${avgDcsForGate}%.`
            });
        }

        // â”€â”€ 4. New session: carry-forward + 2-week uniqueness + select â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

        // 4a. Sub-skills from COMPLETED sessions in the last 14 IST calendar days â€” don't repeat
        const cutoff14 = new Date(addCalendarDays(toISTDateString(new Date()), -14));
        const recentCompleted = await prisma.iASession.findMany({
            where: { student_id: student.id, status: 'COMPLETED' as any, ia_date: { gte: cutoff14 } },
            select: { selected_subskills: true },
        });
        const recentlyTestedSet = new Set<string>(
            recentCompleted.flatMap(s => (s.selected_subskills as any[] ?? []).map((x: any) => x.sub_skill))
        );

        // 4b. Carry-forward from most recent MISSED session (only if not recently completed)
        const lastMissed = await prisma.iASession.findFirst({
            where: { student_id: student.id, status: 'MISSED' as any },
            orderBy: { ia_date: 'desc' },
            select: { carry_forward_subskills: true },
        });
        const carryForward: { skill: string; sub_skill: string }[] = (
            (lastMissed?.carry_forward_subskills as any[] ?? []) as { skill: string; sub_skill: string }[]
        ).filter(s => !recentlyTestedSet.has(s.sub_skill));

        // 4c. Build final 2-subskill list: carry-forward has priority
        let selectedSubskills: { skill: string; sub_skill: string }[];

        if (carryForward.length >= 2) {
            selectedSubskills = carryForward.slice(0, 2);
        } else if (carryForward.length === 1) {
            const exclude = new Set([...recentlyTestedSet, carryForward[0].sub_skill]);
            const fresh = await selectPrioritySubSkills(student.id, exclude);
            selectedSubskills = [carryForward[0], { skill: fresh.primary.skill, sub_skill: fresh.primary.sub_skill }];
        } else {
            const fresh = await selectPrioritySubSkills(student.id, recentlyTestedSet);
            selectedSubskills = [
                { skill: fresh.primary.skill, sub_skill: fresh.primary.sub_skill },
                { skill: fresh.secondary.skill, sub_skill: fresh.secondary.sub_skill },
            ];
        }

        // Dedup guard â€” if both resolve to same sub_skill (edge case), force a fresh pick
        if (selectedSubskills[0].sub_skill === selectedSubskills[1].sub_skill) {
            const exclude = new Set([...recentlyTestedSet, selectedSubskills[0].sub_skill]);
            const fallback = await selectPrioritySubSkills(student.id, exclude);
            selectedSubskills[1] = { skill: fallback.primary.skill, sub_skill: fallback.primary.sub_skill };
        }

        const [primary, secondary] = selectedSubskills;

        const competency = await prisma.studentCompetencyMatrix.findMany({
            where: { student_id: student.id },
            select: { skill: true, band_score: true, sub_scores: true }
        });
        const competencyPlain = competency.map(r => ({ skill: String(r.skill), band_score: r.band_score, sub_scores: r.sub_scores }));

        const diff1 = getDifficulty(getBandForSubSkill(primary.skill, primary.sub_skill, competencyPlain));
        const diff2 = getDifficulty(getBandForSubSkill(secondary.skill, secondary.sub_skill, competencyPlain));

        const [rawSection1, rawSection2] = await Promise.all([
            fetchSectionQuestions(primary.skill, primary.sub_skill, diff1),
            fetchSectionQuestions(secondary.skill, secondary.sub_skill, diff2)
        ]);

        // Build structured question_ids for session persistence
        const questionIdsConfig = [
            { skill: primary.skill, sub_skill: primary.sub_skill, ids: rawSection1.questions.map((q: any) => q.id) },
            { skill: secondary.skill, sub_skill: secondary.sub_skill, ids: rawSection2.questions.map((q: any) => q.id) }
        ];

        // â”€â”€ 5. Create session row â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
        const session = await prisma.iASession.create({
            data: {
                student_id: student.id,
                ia_number,
                ia_date: new Date(todayStr),
                status: 'IN_PROGRESS',
                selected_subskills: selectedSubskills as any,
                question_ids: questionIdsConfig as any,
                answers: { __meta: { current_section: 0, section_started_at: Date.now() } } as any,
                time_started_at: new Date(),
                window_closes_at: windowClosesAt,
                carry_forward_subskills: [] as any
            }
        });

        const sections = [
            { skill: primary.skill, sub_skill: primary.sub_skill, ...rawSection1, questions: sanitizeQuestions(rawSection1.questions) },
            { skill: secondary.skill, sub_skill: secondary.sub_skill, ...rawSection2, questions: sanitizeQuestions(rawSection2.questions) }
        ];

        return res.json({
            success: true,
            session_id: session.id,
            ia_number,
            resume: false,
            selected_subskills: selectedSubskills,
            sections,
            saved_answers: {},
            window_closes_at: windowClosesAt.toISOString(),
            current_section_idx: 0,
            time_remaining_ms: SECTION_IA_MS
        });

    } catch (err: any) {
        // Concurrent first-open of the same IA day: two requests both create and the
        // loser hits the unique (student_id, ia_date) constraint. Return a 409 so the
        // client refetches and picks up the winner's session via the resume path,
        // instead of a confusing 500.
        if (err?.code === 'P2002') {
            return res.status(409).json({ success: false, error: 'IA session already started â€” please refresh.' });
        }
        console.error('[IAQuestions] error:', err);
        return res.status(500).json({ success: false, error: 'Internal server error.' });
    }
}

// â”€â”€â”€ POST /api/ia/submit â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

// SectionScore is now imported from lib/iaProcessor

// Returned in the API response (not stored)
type SectionScoreResponse = SectionScore & {
    previous_band:   number | null;
    delta:           number | null;
    new_matrix_band: number;
};


const SUB_SKILL_LABEL: Record<string, string> = {
    GRAMMAR: 'Grammar', VOCABULARY: 'Vocabulary', COHERENCE: 'Coherence',
    TASK_RESPONSE: 'Task Response', FLUENCY: 'Fluency', PRONUNCIATION: 'Pronunciation',
    READING: 'Reading', LISTENING: 'Listening',
};

export async function submitIA(req: AuthRequest, res: Response) {
    try {
        const appUserId = (req as any).appUserId as string;
        if (!appUserId) return res.status(401).json({ success: false, error: 'Unauthorized.' });

        const student = await prisma.instituteStudent.findUnique({ where: { user_id: appUserId } });
        if (!student) return res.status(404).json({ success: false, error: 'Student not found.' });

        const { session_id } = req.body;
        if (!session_id) return res.status(400).json({ success: false, error: 'session_id is required.' });

        // â”€â”€ 1. Validate session â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
        const session = await prisma.iASession.findUnique({ where: { id: session_id } });
        if (!session) return res.status(404).json({ success: false, error: 'Session not found.' });
        if (session.student_id !== student.id) return res.status(403).json({ success: false, error: 'Forbidden.' });
        if (session.status === 'COMPLETED') return res.json({ success: true, already_done: true });
        if (session.status === 'MISSED')    return res.status(400).json({ success: false, error: 'IA window has expired.' });
        if (new Date() > session.window_closes_at) {
            // Window lapsed between answer-save and submit. Spec 4.6: if the student
            // produced real answers, auto-grade them (COMPLETED, no penalty); only a
            // genuinely empty attempt is MISSED. Previously this ALWAYS marked MISSED,
            // silently discarding a student's work if they clicked Submit a moment late.
            const ans = (session.answers ?? {}) as Record<string, unknown>;
            const hasRealAnswers = Object.entries(ans).some(([k, v]) => {
                if (k === '__meta') return false;
                const t = String(v ?? '').trim();
                return t !== '' && t !== '[no transcript]';
            });
            if (!hasRealAnswers) {
                // Empty attempt â†’ MISSED with the standard penalty (clamped at 0), matching the miss detector.
                await prisma.$transaction(async (tx) => {
                    const marked = await tx.iASession.updateMany({
                        where: { id: session_id, status: { notIn: ['COMPLETED', 'MISSED'] as any } },
                        data:  { status: 'MISSED' as any, momentum_awarded: -MISS_PENALTY, carry_forward_subskills: session.selected_subskills as any },
                    });
                    if (marked.count === 0) return;
                    const s = await tx.instituteStudent.findUnique({ where: { id: student.id }, select: { momentum_score: true } });
                    const deduction = Math.min(MISS_PENALTY, s?.momentum_score ?? 0);
                    if (deduction > 0) {
                        await tx.instituteStudent.update({ where: { id: student.id }, data: { momentum_score: { decrement: deduction } } });
                    }
                });
                return res.status(400).json({ success: false, error: 'IA window has closed. Session marked as missed.' });
            }
            // else: real answers exist â†’ fall through to processIASession, which grades
            // and marks COMPLETED with no penalty even though the window is technically closed.
        }

        // â”€â”€ 2â€“7. Grade, save, update competency matrix & momentum â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
        const {
            sectionScores,
            previousBands,
            momentumAwarded,
            momentumBreakdown,
            updatedMomentum,
            isFirstIA,
        } = await processIASession(session_id, student.id);

        // â”€â”€ 8. Build response â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
        const sectionScoresResponse = sectionScores.map(s => {
            const prevBand      = previousBands.get(s.sub_skill) ?? null;
            const delta         = prevBand !== null ? Math.round((s.band - prevBand) * 10) / 10 : null;
            const newMatrixBand = applySmoothing(prevBand, s.band);
            return { ...s, previous_band: prevBand, delta, new_matrix_band: newMatrixBand };
        });

        return res.json({
            success:            true,
            is_first_ia:        isFirstIA,
            momentum_awarded:   momentumAwarded,
            momentum_breakdown: momentumBreakdown,
            updated_momentum:   updatedMomentum,
            section_scores:     sectionScoresResponse,
        });

    } catch (err) {
        if (err instanceof AlreadyCompletedError) {
            // Race condition: a concurrent submit (or miss-detector sweep) graded this
            // session just ahead of this call.  Return the stored result so the client
            // can display scores normally rather than hitting a 500.
            const stored = await prisma.iASession.findUnique({
                where:  { id: req.body.session_id },
                select: { scores: true, momentum_awarded: true },
            });
            return res.json({
                success:          true,
                already_done:     true,
                section_scores:   stored?.scores           ?? [],
                momentum_awarded: stored?.momentum_awarded ?? 0,
            });
        }
        if (err instanceof AIGradingError) {
            // Infra failure during grading. processIASession throws before its COMPLETED
            // transaction, so the session is still IN_PROGRESS and remains submittable
            // within today's window. Tell the client to retry â€” never penalize or fabricate.
            return res.status(502).json({
                success:   false,
                can_retry: true,
                error:     'AI grading is temporarily unavailable. Your answers are saved â€” please submit again in a moment.',
            });
        }
        console.error('[IASubmit] error:', err);
        return res.status(500).json({ success: false, error: 'Internal server error.' });
    }
}

// â”€â”€â”€ POST /api/ia/answer â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
export async function saveIAAnswer(req: AuthRequest, res: Response) {
    try {
        const appUserId = (req as any).appUserId as string;
        if (!appUserId) return res.status(401).json({ success: false, error: 'Unauthorized.' });

        const student = await prisma.instituteStudent.findUnique({ where: { user_id: appUserId } });
        if (!student) return res.status(404).json({ success: false, error: 'Student not found.' });

        const { session_id, question_id, answer, section_advance } = req.body;
        if (!session_id) return res.status(400).json({ success: false, error: 'session_id is required.' });

        const session = await prisma.iASession.findUnique({ where: { id: session_id } });
        if (!session || session.student_id !== student.id) {
            return res.status(404).json({ success: false, error: 'Session not found.' });
        }
        if (session.status === 'COMPLETED' || session.status === 'MISSED') {
            return res.status(400).json({ success: false, error: 'Session is already finalised.' });
        }
        if (new Date() > session.window_closes_at) {
            return res.status(400).json({ success: false, error: 'IA window has expired.' });
        }

        const current = (session.answers as Record<string, any>) ?? {};
        const meta    = (current.__meta as { current_section?: number; section_started_at?: number }) ?? {};
        const sectionConfig = (session.question_ids as any[]) ?? [];
        const SECTION_GRACE_MS = 5 * 1000; // small clock-skew allowance

        // Section-advance: student moved to the next section â€” stamp new section start time.
        // Must be strictly forward: re-stamping the same or an earlier section would reset
        // the 20-minute timer and grant unlimited time. Reject non-monotonic / NaN values.
        if (section_advance !== undefined) {
            const prevSection = Number(meta.current_section ?? -1);
            const nextSection = Number(section_advance);
            if (!Number.isInteger(nextSection) || nextSection < 0 || nextSection >= Math.max(sectionConfig.length, 1) || nextSection <= prevSection) {
                return res.status(400).json({ success: false, error: 'Invalid section advance.' });
            }
            // Atomic JSONB merge of just the __meta key â€” a full read-modify-write of the
            // answers object would let a concurrent answer save clobber the timer stamp.
            const metaObj = JSON.stringify({ current_section: nextSection, section_started_at: Date.now() });
            await prisma.$executeRaw`
                UPDATE "ia_sessions"
                SET answers = COALESCE(answers, '{}'::jsonb) || jsonb_build_object('__meta', ${metaObj}::jsonb)
                WHERE id = ${session_id}::uuid
            `;
            return res.json({ success: true, saved: true });
        }

        // Normal answer save
        if (!question_id || answer === undefined) {
            return res.status(400).json({ success: false, error: 'question_id and answer are required.' });
        }

        // Reject question ids that aren't part of this session â€” stops unbounded JSON
        // growth and keeps realAnswerCount honest for the miss detector.
        const sectionIdx = sectionConfig.findIndex((c: any) => Array.isArray(c?.ids) && c.ids.includes(question_id));
        if (sectionIdx === -1) {
            return res.status(400).json({ success: false, error: 'Unknown question for this session.' });
        }

        // Enforce the 20-minute per-section timer server-side. If the question belongs
        // to the currently-active section and that section's 20 min have elapsed, reject â€”
        // the client timer alone can be paused/bypassed.
        if (sectionIdx === Number(meta.current_section) && meta.section_started_at) {
            const elapsed = Date.now() - Number(meta.section_started_at);
            if (elapsed > SECTION_IA_MS + SECTION_GRACE_MS) {
                return res.status(400).json({ success: false, error: 'Section time has expired.' });
            }
        }

        // Atomic single-key JSONB merge â€” two overlapping saves each preserve the
        // other's answer instead of last-writer-wins clobbering the whole object.
        await prisma.$executeRaw`
            UPDATE "ia_sessions"
            SET answers = COALESCE(answers, '{}'::jsonb) || jsonb_build_object(${String(question_id)}::text, ${String(answer)}::text)
            WHERE id = ${session_id}::uuid
        `;
        // Flip PENDING â†’ IN_PROGRESS once (touches status only; never the answers blob).
        await prisma.iASession.updateMany({
            where: { id: session_id, status: 'PENDING' as any },
            data:  { status: 'IN_PROGRESS' as any },
        });

        return res.json({ success: true, saved: true });
    } catch (err) {
        console.error('[IAAnswer] error:', err);
        return res.status(500).json({ success: false, error: 'Internal server error.' });
    }
}
