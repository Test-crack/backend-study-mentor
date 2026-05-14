import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import prisma from '../lib/prisma';
import { computeAverageDCS } from '../lib/dcs';
import { selectPrioritySubSkills } from '../lib/subskillSelector';
import { gradeIAWritingPrompt, gradeIASpeakingPrompt } from '../lib/iaGrading';

// ─── Constants ────────────────────────────────────────────────────────────────
const IA_DRILL_THRESHOLD = 6;   // total sessions required before any IA
const IA_MIN_DAYS = 2;   // calendar days since first drill required
const IA_DCS_THRESHOLD = 40;  // avg DCS % required to start the test
const IA_INTERVAL_DAYS = 3;   // IA schedule: first_drill + 3, +6, +9 …
const IA_MIN_WINDOW_MS = 20 * 60 * 1000;  // block new session if <20 min remain in today's window
const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;

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
            where: { student_id: student.id },
            orderBy: { created_at: 'asc' },
            select: { id: true, created_at: true }
        });

        const drills_completed = allSessions.length;

        // ── No drills at all → nothing to schedule ────────────────────────────
        if (drills_completed === 0) {
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

        // ── Schedule anchor: IST calendar date of the very first drill ────────
        const firstDrillDateStr = toISTDateString(allSessions[0].created_at);
        const todayStr = toISTDateString(new Date());

        // ── Miss detection: mark stale PENDING / IN_PROGRESS sessions MISSED ──
        const staleSessions = await prisma.iASession.findMany({
            where: {
                student_id: student.id,
                ia_date: { lt: new Date(todayStr) },
                status: { in: ['PENDING', 'IN_PROGRESS'] as any }
            },
            select: { id: true, selected_subskills: true }
        });
        if (staleSessions.length > 0) {
            await Promise.all(staleSessions.map(s =>
                prisma.iASession.update({
                    where: { id: s.id },
                    data: { status: 'MISSED' as any, carry_forward_subskills: s.selected_subskills as any }
                })
            ));
            await prisma.institute_students.update({
                where: { id: student.id },
                data: { momentum_score: { decrement: staleSessions.length * 20 } }
            });
        }

        // ── Prerequisites (non-DCS gates) ─────────────────────────────────────
        const days_since_first_drill = daysBetween(firstDrillDateStr, todayStr);
        const cond_drills = drills_completed >= IA_DRILL_THRESHOLD;
        const cond_days = days_since_first_drill >= IA_MIN_DAYS;
        const prerequisites_met = cond_drills && cond_days;

        // ── DCS ───────────────────────────────────────────────────────────────
        const avg_dcs = await computeAverageDCS(student.id);
        const cond_dcs = avg_dcs >= IA_DCS_THRESHOLD;

        // ── Build IA schedule: first_drill + 3, +6, +9 … up to 30 slots ──────
        // We generate enough to always find the next 2 future dates.
        const LOOKAHEAD = 30;
        const schedule = Array.from({ length: LOOKAHEAD }, (_, i) => {
            const n = i + 1;
            const date = addCalendarDays(firstDrillDateStr, n * IA_INTERVAL_DAYS);
            return { number: n, date };
        });

        // ── Classify today ────────────────────────────────────────────────────
        const todaySlot = schedule.find(s => s.date === todayStr) ?? null;
        const is_ia_day = todaySlot !== null;
        const current_ia_number = todaySlot?.number ?? null;
        const can_start_test = is_ia_day && prerequisites_met && cond_dcs;

        // ── Upcoming slots (strictly future) ─────────────────────────────────
        const futureSlots = schedule
            .filter(s => s.date > todayStr)
            .slice(0, 2)
            .map(s => ({
                number: s.number,
                date: s.date,
                date_formatted: formatIADate(s.date),
                days_away: daysBetween(todayStr, s.date)
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

        // When student can start today, preview which sub-skills will be targeted
        let suggested_subskills: { skill: string; sub_skill: string }[] | null = null;
        if (can_start_test) {
            try {
                const sel = await selectPrioritySubSkills(student.id);
                suggested_subskills = [sel.primary, sel.secondary];
            } catch { /* non-fatal — gate still opens without preview */ }
        }

        // Active in-progress session today → gate shows "Continue Assessment" instead of "Start"
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
            missed_count: staleSessions.length,
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

// ─── Shared helpers ───────────────────────────────────────────────────────────

const SECTION_IA_MS = 20 * 60 * 1000;  // 20 min per section; 2 sections = 40 min total
const SUB_SCORE_KEY_MAP: Record<string, string> = {
    GRAMMAR: 'grammarScore',
    VOCABULARY: 'vocabularyScore',
    COHERENCE: 'coherenceScore',
    TASK_RESPONSE: 'taskResponseScore',
    FLUENCY: 'fluencyScore',
    PRONUNCIATION: 'pronunciationScore',
};

/** UTC instant at IST midnight of today. */
function todayStartISTLocal(): Date {
    const nowIST = new Date(Date.now() + IST_OFFSET_MS);
    return new Date(Date.UTC(nowIST.getUTCFullYear(), nowIST.getUTCMonth(), nowIST.getUTCDate()) - IST_OFFSET_MS);
}

/** UTC instant at IST midnight of tomorrow — i.e. end of today. */
function todayEndIST(): Date {
    return new Date(todayStartISTLocal().getTime() + 24 * 60 * 60 * 1000);
}

function getDifficulty(band: number): 'BEGINNER' | 'INTERMEDIATE' | 'ADVANCED' {
    if (band < 5.5) return 'BEGINNER';
    if (band >= 7.0) return 'ADVANCED';
    return 'INTERMEDIATE';
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

/** Strip answer key and explanation — never send to frontend during active session. */
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
 *   LISTENING → pick one random audio_url group (all questions share the same audio)
 *   READING   → pick one random passage_id group (all questions share the same passage)
 *   Others    → 8 MCQ + 2 WRITING_PROMPT|SPEAKING_PROMPT; falls back gracefully when seeding is partial
 */
async function fetchSectionQuestions(
    skill: string,
    subSkill: string,
    difficulty: 'BEGINNER' | 'INTERMEDIATE' | 'ADVANCED'
): Promise<{ section_type: string; audio_url: string | null; passage_text: string | null; passage_id: string | null; questions: any[] }> {

    const base = { skill, sub_skill: subSkill, difficulty, is_active: true } as any;

    // ── LISTENING ─────────────────────────────────────────────────────────────
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

    // ── READING ───────────────────────────────────────────────────────────────
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

    // ── WRITING / SPEAKING sub-skills ─────────────────────────────────────────
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

// ─── GET /api/ia/questions ────────────────────────────────────────────────────
export async function getIAQuestions(req: AuthRequest, res: Response) {
    try {
        const appUserId = (req as any).appUserId as string;
        if (!appUserId) return res.status(401).json({ success: false, error: 'Unauthorized.' });

        const student = await prisma.institute_students.findUnique({ where: { user_id: appUserId } });
        if (!student) return res.status(404).json({ success: false, error: 'Student not found.' });

        const todayStr = toISTDateString(new Date());

        // ── 1. Validate this is an IA day for this student ────────────────────
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

        // ── 2. Check existing session ─────────────────────────────────────────
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

        // ── 3. Guard: block new session if too little time remains in window ────
        // Prevents the edge case where a student opens the test at 11:58 PM IST
        // (2 minutes left), can't possibly finish, and gets MISSED + -20 momentum.
        const timeRemainingInWindow = windowClosesAt.getTime() - Date.now();
        if (timeRemainingInWindow < IA_MIN_WINDOW_MS) {
            const minutesLeft = Math.floor(timeRemainingInWindow / 60000);
            return res.status(400).json({
                success: false,
                error:   'window_closing_soon',
                message: `Only ${minutesLeft} minute${minutesLeft !== 1 ? 's' : ''} remain in today's IA window — not enough time to start. Your next IA slot opens in a few days.`,
            });
        }

        // ── 4. New session: select sub-skills + fetch questions ───────────────
        const { primary, secondary } = await selectPrioritySubSkills(student.id);

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

        const selectedSubskills = [
            { skill: primary.skill, sub_skill: primary.sub_skill },
            { skill: secondary.skill, sub_skill: secondary.sub_skill }
        ];

        // ── 5. Create session row ─────────────────────────────────────────────
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

    } catch (err) {
        console.error('[IAQuestions] error:', err);
        return res.status(500).json({ success: false, error: 'Internal server error.' });
    }
}

// ─── POST /api/ia/submit ──────────────────────────────────────────────────────

// Stored in ia_sessions.scores JSONB
type SectionScore = {
    skill: string;
    sub_skill: string;
    band: number;
    correct: number;   // MCQ/TFNG correct count
    total: number;   // MCQ/TFNG total count (AI prompts not included here)
    ai_graded: boolean;
    ai_feedback?: {    // Present only if ai_graded = true
        rationale: string;
        key_observations: string[];
    };
};

// Returned in the API response (not stored)
type SectionScoreResponse = SectionScore & {
    previous_band:   number | null;
    delta:           number | null;
    /** Sub-skill score in the competency matrix after 0.4×old + 0.6×new smoothing (±2 cap). */
    new_matrix_band: number;
};

/** Mirrors the weighted update in the transaction so the API response can show the smoothed value. */
function computeNewMatrixBand(iaBand: number, prevBand: number | null): number {
    if (prevBand === null) return Math.min(9, Math.max(0, iaBand));
    let weighted = 0.4 * prevBand + 0.6 * iaBand;
    const deviation = weighted - prevBand;
    if (deviation >  2) weighted = prevBand + 2;
    if (deviation < -2) weighted = prevBand - 2;
    return Math.min(9, Math.max(0, Math.round(weighted * 2) / 2));
}

const SUB_SKILL_LABEL: Record<string, string> = {
    GRAMMAR: 'Grammar', VOCABULARY: 'Vocabulary', COHERENCE: 'Coherence',
    TASK_RESPONSE: 'Task Response', FLUENCY: 'Fluency', PRONUNCIATION: 'Pronunciation',
    READING: 'Reading', LISTENING: 'Listening',
};

export async function submitIA(req: AuthRequest, res: Response) {
    try {
        const appUserId = (req as any).appUserId as string;
        if (!appUserId) return res.status(401).json({ success: false, error: 'Unauthorized.' });

        const student = await prisma.institute_students.findUnique({ where: { user_id: appUserId } });
        if (!student) return res.status(404).json({ success: false, error: 'Student not found.' });

        const { session_id } = req.body;
        if (!session_id) return res.status(400).json({ success: false, error: 'session_id is required.' });

        // ── 1. Validate session ───────────────────────────────────────────────
        const session = await prisma.iASession.findUnique({ where: { id: session_id } });
        if (!session) return res.status(404).json({ success: false, error: 'Session not found.' });
        if (session.student_id !== student.id) return res.status(403).json({ success: false, error: 'Forbidden.' });
        if (session.status === 'COMPLETED') return res.json({ success: true, already_done: true });
        if (session.status === 'MISSED')    return res.status(400).json({ success: false, error: 'IA window has expired.' });
        if (new Date() > session.window_closes_at) {
            // Mark MISSED now — window lapsed between answer-save and submit
            await prisma.iASession.update({
                where: { id: session_id },
                data:  { status: 'MISSED' as any, carry_forward_subskills: session.selected_subskills as any }
            });
            return res.status(400).json({ success: false, error: 'IA window has closed. Session marked as missed.' });
        }

        // ── 2. Load question IDs, fetch questions (with prompt_text for AI) ──
        const questionIdsConfig = session.question_ids as Array<{ skill: string; sub_skill: string; ids: string[] }>;
        const allIds = questionIdsConfig.flatMap(c => c.ids);

        const questions = await prisma.iAQuestion.findMany({
            where: { id: { in: allIds } },
            select: { id: true, sub_skill: true, question_type: true, correct_answer: true, prompt_text: true }
        });

        // Strip __meta (section timing metadata — not a question answer)
        const answers = Object.fromEntries(
            Object.entries((session.answers ?? {}) as Record<string, unknown>).filter(([k]) => k !== '__meta')
        ) as Record<string, string>;

        // ── 3. Launch all AI grading jobs in parallel ─────────────────────────
        //
        // For each section: 8 MCQ questions (auto-scored) + up to 2 AI prompts
        // (WRITING_PROMPT or SPEAKING_PROMPT). Run all AI grading concurrently.
        type AIJob = { 
            sectionIdx: number; 
            band: number;
            rationale: string;
            key_observations: string[];
        };
        const aiJobPromises: Promise<AIJob>[] = [];

        for (let i = 0; i < questionIdsConfig.length; i++) {
            const cfg = questionIdsConfig[i];
            const subQs = questions.filter(q => cfg.ids.includes(q.id));
            const aiQs = subQs.filter(q =>
                q.question_type === 'WRITING_PROMPT' || q.question_type === 'SPEAKING_PROMPT'
            );
            for (const q of aiQs) {
                // Treat the '[no transcript]' sentinel (set when browser mic fails) as empty
                const rawText = (answers[q.id] ?? '').trim();
                const text = rawText === '[no transcript]' ? '' : rawText;
                const job = (async (): Promise<AIJob> => {
                    const result = q.question_type === 'WRITING_PROMPT'
                        ? await gradeIAWritingPrompt(cfg.sub_skill, q.prompt_text, text)
                        : await gradeIASpeakingPrompt(cfg.sub_skill, q.prompt_text, text);
                    return { 
                        sectionIdx: i, 
                        band: result.band,
                        rationale: result.rationale,
                        key_observations: result.key_observations
                    };
                })();
                aiJobPromises.push(job);
            }
        }

        const aiJobResults = await Promise.all(aiJobPromises);

        // Group AI results by section index (keep on 1-10 scale for weighted calculation)
        const aiBandsBySectionIdx = new Map<number, number[]>();
        const aiFeedbackBySectionIdx = new Map<number, { rationale: string; key_observations: string[] }[]>();
        
        for (const j of aiJobResults) {
            const bandsArr = aiBandsBySectionIdx.get(j.sectionIdx) ?? [];
            bandsArr.push(j.band); // Keep 1-10 scale
            aiBandsBySectionIdx.set(j.sectionIdx, bandsArr);
            
            const feedbackArr = aiFeedbackBySectionIdx.get(j.sectionIdx) ?? [];
            feedbackArr.push({ rationale: j.rationale, key_observations: j.key_observations });
            aiFeedbackBySectionIdx.set(j.sectionIdx, feedbackArr);
        }

        // ── 4. Score each sub-skill with weighted MCQ + AI scoring ────────────
        const sectionScores: SectionScore[] = [];

        for (let i = 0; i < questionIdsConfig.length; i++) {
            const cfg = questionIdsConfig[i];
            const subQs = questions.filter(q => cfg.ids.includes(q.id));
            const mcqQs = subQs.filter(q => q.question_type === 'MCQ' || q.question_type === 'TFNG');
            const aiQs = subQs.filter(q =>
                q.question_type === 'WRITING_PROMPT' || q.question_type === 'SPEAKING_PROMPT'
            );

            // MCQ scoring on 1-10 scale
            let correct = 0;
            for (const q of mcqQs) {
                const sa = (answers[q.id] ?? '').trim().toUpperCase();
                
                // Handle correct_answer which might be stored as JSON string
                let ca = '';
                if (q.correct_answer !== null && q.correct_answer !== undefined) {
                    // If it's already a string, use it
                    if (typeof q.correct_answer === 'string') {
                        ca = q.correct_answer.trim().toUpperCase();
                    } else {
                        // If it's a JSON object/value, stringify and parse
                        ca = String(q.correct_answer).trim().toUpperCase();
                    }
                    // Remove surrounding quotes if present (handles "\"C\"" case)
                    ca = ca.replace(/^["']|["']$/g, '');
                }
                
                if (sa && ca && sa === ca) correct++;
            }
            // MCQ score: (correct/total) × 10, clamped to 1-10
            const mcqScore = mcqQs.length > 0 
                ? Math.max(1, Math.min(10, (correct / mcqQs.length) * 10))
                : null;

            // AI scoring (already on 1-10 scale)
            const aiBands = aiBandsBySectionIdx.get(i) ?? [];
            const aiFeedbacks = aiFeedbackBySectionIdx.get(i) ?? [];
            const aiAvgScore = aiBands.length > 0 
                ? aiBands.reduce((a, b) => a + b, 0) / aiBands.length 
                : null;

            // Weighted combined score: MCQ weight = 1, AI weight = 2
            let combinedScore: number;
            if (mcqQs.length === 0 && aiQs.length === 0) {
                combinedScore = 1; // No questions (shouldn't happen)
            } else if (mcqScore === null) {
                // Only AI questions
                combinedScore = aiAvgScore ?? 1;
            } else if (aiAvgScore === null) {
                // Only MCQ questions
                combinedScore = mcqScore;
            } else {
                // Both MCQ and AI: weighted average
                const mcqWeight = mcqQs.length * 1;  // 1x weight per MCQ
                const aiWeight = aiQs.length * 2;     // 2x weight per AI question
                const totalWeight = mcqWeight + aiWeight;
                combinedScore = (mcqScore * mcqWeight + aiAvgScore * aiWeight) / totalWeight;
            }

            // Scale from 1-10 to 0-9 IELTS band scale
            // Formula: (score - 1) × (9/9) = (score - 1) × 1 = score - 1
            // Then round to nearest 0.5
            const ieltsRawBand = combinedScore - 1; // Now 0-9 scale
            const band = Math.min(9.0, Math.max(0.0, Math.round(ieltsRawBand * 2) / 2));

            // Aggregate AI feedback if present
            const aiFeedback = aiFeedbacks.length > 0 ? {
                rationale: aiFeedbacks.map(f => f.rationale).join(' | '),
                key_observations: aiFeedbacks.flatMap(f => f.key_observations)
            } : undefined;

            sectionScores.push({
                skill: cfg.skill,
                sub_skill: cfg.sub_skill,
                band,
                correct,
                total: mcqQs.length,
                ai_graded: aiQs.length > 0,
                ai_feedback: aiFeedback
            });
        }

        // ── 5. Pre-fetch competency matrix for delta display ──────────────────
        const uniqueSkills = [...new Set(sectionScores.map(s => s.skill))];
        const competencyPre = await prisma.studentCompetencyMatrix.findMany({
            where: { student_id: student.id, skill: { in: uniqueSkills as any } },
            select: { skill: true, band_score: true, sub_scores: true }
        });

        const previousBands = new Map<string, number | null>();
        for (const s of sectionScores) {
            const row = competencyPre.find(c => String(c.skill) === s.skill);
            
            // READING/LISTENING use band_score directly (no sub-scores)
            if (s.sub_skill === 'READING' || s.sub_skill === 'LISTENING') {
                previousBands.set(s.sub_skill, row?.band_score ? parseFloat(String(row.band_score)) : null);
            } else {
                // WRITING/SPEAKING use sub_scores JSONB
                const subScoreKey = SUB_SCORE_KEY_MAP[s.sub_skill];
                if (subScoreKey && row?.sub_scores) {
                    const ss = row.sub_scores as Record<string, number>;
                    previousBands.set(s.sub_skill, ss[subScoreKey] ?? null);
                } else {
                    previousBands.set(s.sub_skill, null);
                }
            }
        }

        // ── 6. Momentum calculation ────────────────────────────────────────────
        //
        // +100 base participation
        // +25  improved vs last IA band for this sub-skill
        // +50  new personal best ever for this sub-skill
        const [lastSession, allPastSessions] = await Promise.all([
            prisma.iASession.findFirst({
                where: { student_id: student.id, status: 'COMPLETED' },
                orderBy: { created_at: 'desc' },
                select: { scores: true }
            }),
            prisma.iASession.findMany({
                where: { student_id: student.id, status: 'COMPLETED' },
                select: { scores: true }
            })
        ]);

        const lastBands = new Map<string, number>();
        if (lastSession?.scores) {
            for (const s of lastSession.scores as SectionScore[]) {
                lastBands.set(s.sub_skill, s.band);
            }
        }

        const allTimeBests = new Map<string, number>();
        for (const ps of allPastSessions) {
            for (const s of (ps.scores ?? []) as SectionScore[]) {
                const prev = allTimeBests.get(s.sub_skill) ?? 0;
                if (s.band > prev) allTimeBests.set(s.sub_skill, s.band);
            }
        }

        const momentumBreakdown: { reason: string; points: number }[] = [
            { reason: 'Participation', points: 100 }
        ];
        let momentumAwarded = 100;

        for (const s of sectionScores) {
            const label = SUB_SKILL_LABEL[s.sub_skill] ?? s.sub_skill;
            const lastBand = lastBands.get(s.sub_skill) ?? null;
            const allTimeBest = allTimeBests.get(s.sub_skill) ?? 0;

            if (lastBand !== null && s.band > lastBand) {
                momentumAwarded += 25;
                momentumBreakdown.push({ reason: `Improved — ${label}`, points: 25 });
            }
            if (s.band > allTimeBest) {
                momentumAwarded += 50;
                momentumBreakdown.push({ reason: `Personal Best — ${label}`, points: 50 });
            }
        }

        // ── 7. DB transaction ─────────────────────────────────────────────────
        const updatedMomentum = await prisma.$transaction(async (tx) => {
            // a) Mark session COMPLETED
            await tx.iASession.update({
                where: { id: session_id },
                data: {
                    status: 'COMPLETED' as any,
                    scores: sectionScores as any,
                    momentum_awarded: momentumAwarded,
                    time_submitted_at: new Date()
                }
            });

            // b + c) Per tested sub-skill: AssessmentHistory + weighted CompetencyMatrix update
            for (const s of sectionScores) {
                const subScoreKey = SUB_SCORE_KEY_MAP[s.sub_skill] ?? null;

                // AssessmentHistory — one row per sub-skill tested
                await tx.assessmentHistory.create({
                    data: {
                        student_id: student.id,
                        skill: s.skill as any,
                        mode: 'INTERNAL_ASSESSMENT' as any,
                        band_score: s.band,
                        sub_scores: subScoreKey ? { [subScoreKey]: s.band } : {} as any
                    }
                });

                // CompetencyMatrix — weighted update with ±2 deviation cap
                const existing = await tx.studentCompetencyMatrix.findUnique({
                    where: { student_id_skill: { student_id: student.id, skill: s.skill as any } },
                    select: { sub_scores: true, band_score: true }
                });
                
                const currentSubScores = (existing?.sub_scores as Record<string, any>) ?? {};
                let updatedSubScores = { ...currentSubScores };

                if (subScoreKey) {
                    const oldScore = currentSubScores[subScoreKey];
                    
                    if (typeof oldScore === 'number' && !isNaN(oldScore)) {
                        // Weighted update: 0.4 * old + 0.6 * new
                        let weightedScore = 0.4 * oldScore + 0.6 * s.band;
                        
                        // Clamp deviation to ±2
                        const deviation = weightedScore - oldScore;
                        if (deviation > 2) {
                            weightedScore = oldScore + 2;
                        } else if (deviation < -2) {
                            weightedScore = oldScore - 2;
                        }
                        
                        // Round to nearest 0.5 and clamp to 0-9
                        weightedScore = Math.round(weightedScore * 2) / 2;
                        weightedScore = Math.min(9, Math.max(0, weightedScore));
                        
                        updatedSubScores[subScoreKey] = weightedScore;
                    } else {
                        // First time scoring this sub-skill - use new score directly
                        updatedSubScores[subScoreKey] = Math.min(9, Math.max(0, s.band));
                    }
                }

                // Recalculate skill-level band as mean of all 4 sub-skill scores
                // For WRITING/SPEAKING: grammarScore, vocabularyScore, coherenceScore/fluencyScore, taskResponseScore/pronunciationScore
                // For READING/LISTENING: use band_score directly (no sub-scores)
                let newSkillBand: number;
                
                if (s.skill === 'READING' || s.skill === 'LISTENING') {
                    // These skills don't have sub-scores, use the band directly
                    newSkillBand = s.band;
                } else {
                    // WRITING or SPEAKING - calculate from 4 sub-scores
                    const subScoreKeys = s.skill === 'WRITING' 
                        ? ['grammarScore', 'vocabularyScore', 'coherenceScore', 'taskResponseScore']
                        : ['grammarScore', 'vocabularyScore', 'fluencyScore', 'pronunciationScore'];
                    
                    const knownBands = subScoreKeys
                        .map(key => updatedSubScores[key])
                        .filter((v): v is number => typeof v === 'number' && !isNaN(v));
                    
                    if (knownBands.length > 0) {
                        const avg = knownBands.reduce((a, b) => a + b, 0) / knownBands.length;
                        newSkillBand = Math.round(avg * 2) / 2; // Round to nearest 0.5
                    } else {
                        newSkillBand = s.band; // Fallback
                    }
                }
                
                // Clamp to valid IELTS range (0-9)
                newSkillBand = Math.min(9, Math.max(0, newSkillBand));

                await tx.studentCompetencyMatrix.upsert({
                    where: { student_id_skill: { student_id: student.id, skill: s.skill as any } },
                    update: {
                        band_score: newSkillBand,
                        sub_scores: updatedSubScores as any,
                        assessments_count: { increment: 1 },
                        last_updated: new Date()
                    },
                    create: {
                        student_id: student.id,
                        skill: s.skill as any,
                        band_score: newSkillBand,
                        sub_scores: updatedSubScores as any,
                        assessments_count: 1
                    }
                });
            }

            // d) Update overall band score - calculated from StudentCompetencyMatrix
            // Note: Overall band is not stored in institute_students, it's derived from competency matrix
            
            // e) Award momentum to student
            const updated = await tx.institute_students.update({
                where: { id: student.id },
                data: { momentum_score: { increment: momentumAwarded } },
                select: { momentum_score: true }
            });
            return updated.momentum_score;
        });

        // ── 8. Build response with delta and breakdown ────────────────────────
        const sectionScoresResponse: SectionScoreResponse[] = sectionScores.map(s => {
            const prevBand      = previousBands.get(s.sub_skill) ?? null;
            const delta         = prevBand !== null ? Math.round((s.band - prevBand) * 10) / 10 : null;
            const newMatrixBand = computeNewMatrixBand(s.band, prevBand);
            return { ...s, previous_band: prevBand, delta, new_matrix_band: newMatrixBand };
        });

        return res.json({
            success: true,
            is_first_ia: allPastSessions.length === 0,
            momentum_awarded: momentumAwarded,
            momentum_breakdown: momentumBreakdown,
            updated_momentum: updatedMomentum,
            section_scores: sectionScoresResponse
        });
    } catch (err) {
        console.error('[IASubmit] error:', err);
        return res.status(500).json({ success: false, error: 'Internal server error.' });
    }
}

// ─── POST /api/ia/answer ──────────────────────────────────────────────────────
export async function saveIAAnswer(req: AuthRequest, res: Response) {
    try {
        const appUserId = (req as any).appUserId as string;
        if (!appUserId) return res.status(401).json({ success: false, error: 'Unauthorized.' });

        const student = await prisma.institute_students.findUnique({ where: { user_id: appUserId } });
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

        // Section-advance: student moved to the next section — stamp new section start time
        if (section_advance !== undefined) {
            current.__meta = {
                current_section: Number(section_advance),
                section_started_at: Date.now()
            };
            await prisma.iASession.update({
                where: { id: session_id },
                data: { answers: current as any }
            });
            return res.json({ success: true, saved: true });
        }

        // Normal answer save
        if (!question_id || answer === undefined) {
            return res.status(400).json({ success: false, error: 'question_id and answer are required.' });
        }
        current[question_id] = String(answer);

        await prisma.iASession.update({
            where: { id: session_id },
            data: { answers: current as any, status: 'IN_PROGRESS' }
        });

        return res.json({ success: true, saved: true });
    } catch (err) {
        console.error('[IAAnswer] error:', err);
        return res.status(500).json({ success: false, error: 'Internal server error.' });
    }
}
