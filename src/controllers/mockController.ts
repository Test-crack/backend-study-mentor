import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import prisma from '../lib/prisma';
import { gradeIAWritingPrompt, gradeIASpeakingPrompt, AIGradingError } from '../lib/iaGrading';

// ─── Constants ────────────────────────────────────────────────────────────────

const MOCK_IA_THRESHOLD     = 6;
const MOCK_EARNED_COST      = 1500;
const MOCK_EARNED_MIN_IAS   = 4;
const MOCK_EARNED_MIN_DAYS  = 14;
const MOCK_BAND_IMPROVEMENT = 0.5;
const MOCK_WINDOW_MS        = 72 * 60 * 60 * 1000;  // 72h to submit (session window)
const MOCK_TOTAL_MS         = 3  * 60 * 60 * 1000;  // 3-hour global test timer
const IST_OFFSET_MS         = 5.5 * 60 * 60 * 1000;

// Question counts per section
const MOCK_Q_LISTENING = 20;   // 20 MCQ from 1 audio (4 sub-skill groups × 5)
const MOCK_Q_READING   = 20;   // 20 MCQ from 1 passage (4 sub-skill groups × 5)
const MOCK_Q_WS_MCQ    = 4;    // MCQ per sub-skill for Writing/Speaking
const MOCK_Q_WS_PROMPT = 1;    // 1 AI prompt per sub-skill for Writing/Speaking
// → Writing/Speaking total = 4 sub-skills × (4 MCQ + 1 prompt) = 20 questions

const MOCK_SKILL_ORDER = ['LISTENING', 'READING', 'WRITING', 'SPEAKING'] as const;

const WRITING_SUB_SKILLS  = ['GRAMMAR', 'VOCABULARY', 'COHERENCE', 'TASK_RESPONSE'] as const;
const SPEAKING_SUB_SKILLS = ['GRAMMAR', 'VOCABULARY', 'FLUENCY',   'PRONUNCIATION'] as const;

const SUB_SCORE_KEY_MAP: Record<string, string> = {
    GRAMMAR:       'grammarScore',
    VOCABULARY:    'vocabularyScore',
    COHERENCE:     'coherenceScore',
    TASK_RESPONSE: 'taskResponseScore',
    FLUENCY:       'fluencyScore',
    PRONUNCIATION: 'pronunciationScore',
};

// ─── IST helpers ─────────────────────────────────────────────────────────────

function toISTDateString(d: Date): string {
    const ist = new Date(d.getTime() + IST_OFFSET_MS);
    return [
        ist.getUTCFullYear(),
        String(ist.getUTCMonth() + 1).padStart(2, '0'),
        String(ist.getUTCDate()).padStart(2, '0'),
    ].join('-');
}

function currentMonthYear(): string {
    return toISTDateString(new Date()).slice(0, 7);
}

// ─── Shared helpers ───────────────────────────────────────────────────────────

function shuffle<T>(arr: T[]): T[] {
    for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
}

function sanitize(qs: any[]): any[] {
    return qs.map(({ correct_answer: _ca, explanation: _ex, ...safe }) => safe);
}

function scaleToIELTS(score1to10: number): number {
    return Math.min(9.0, Math.max(0.0, Math.round((score1to10 - 1) * 2) / 2));
}

/**
 * Fetch questions for one mock skill section.
 *
 * LISTENING : 20 MCQ from 1 randomly-chosen audio group
 * READING   : 20 MCQ from 1 randomly-chosen passage group
 * WRITING   : 4 sub-skills × (4 MCQ + 1 WRITING_PROMPT)  = 20 questions
 * SPEAKING  : 4 sub-skills × (4 MCQ + 1 SPEAKING_PROMPT) = 20 questions
 */
async function fetchMockSectionQuestions(skill: string): Promise<{
    section_type: string;
    audio_url:    string | null;
    passage_text: string | null;
    passage_id:   string | null;
    questions:    any[];
}> {
    const base = { skill, is_active: true } as any;

    // ── LISTENING ─────────────────────────────────────────────────────────────
    if (skill === 'LISTENING') {
        const pool = await prisma.mockquestions.findMany({
            where:  { ...base, audio_url: { not: null } },
            select: { id: true, sub_skill: true, audio_url: true, question_type: true, prompt_text: true, options: true }
        });
        if (pool.length === 0) return { section_type: 'AUDIO', audio_url: null, passage_text: null, passage_id: null, questions: [] };
        const groups = [...new Set(pool.map(q => q.audio_url!))];
        const chosen = groups[Math.floor(Math.random() * groups.length)];
        const qs     = shuffle(pool.filter(q => q.audio_url === chosen)).slice(0, MOCK_Q_LISTENING);
        return { section_type: 'AUDIO', audio_url: chosen, passage_text: null, passage_id: null, questions: qs };
    }

    // ── READING ───────────────────────────────────────────────────────────────
    if (skill === 'READING') {
        const pool = await prisma.mockquestions.findMany({
            where:  { ...base, passage_id: { not: null } },
            select: { id: true, sub_skill: true, passage_id: true, passage_text: true, question_type: true, prompt_text: true, options: true }
        });
        if (pool.length === 0) return { section_type: 'PASSAGE', audio_url: null, passage_text: null, passage_id: null, questions: [] };
        const groups     = [...new Set(pool.map(q => q.passage_id!))];
        const chosen     = groups[Math.floor(Math.random() * groups.length)];
        const grouped    = shuffle(pool.filter(q => q.passage_id === chosen)).slice(0, MOCK_Q_READING);
        const passageTxt = pool.find(q => q.passage_id === chosen && q.passage_text)?.passage_text ?? null;
        return {
            section_type: 'PASSAGE', audio_url: null,
            passage_text: passageTxt, passage_id: chosen,
            questions: grouped.map(q => ({ id: q.id, sub_skill: q.sub_skill, question_type: q.question_type, prompt_text: q.prompt_text, options: q.options }))
        };
    }

    // ── WRITING / SPEAKING ────────────────────────────────────────────────────
    // 4 sub-skills × 4 MCQ + 4 sub-skills × 1 prompt = 20 questions
    const subSkills   = skill === 'WRITING' ? WRITING_SUB_SKILLS : SPEAKING_SUB_SKILLS;
    const promptType  = skill === 'WRITING' ? 'WRITING_PROMPT' : 'SPEAKING_PROMPT';

    const subSkillData = await Promise.all(subSkills.map(async ss => {
        const [mcqs, prompts] = await Promise.all([
            prisma.mockquestions.findMany({
                where:  { skill: skill as any, sub_skill: ss as any, question_type: 'MCQ', is_active: true },
                select: { id: true, sub_skill: true, question_type: true, prompt_text: true, options: true }
            }),
            prisma.mockquestions.findMany({
                where:  { skill: skill as any, sub_skill: ss as any, question_type: promptType, is_active: true },
                select: { id: true, sub_skill: true, question_type: true, prompt_text: true, options: true }
            })
        ]);
        return {
            sub_skill: ss,
            mcqs:    shuffle([...mcqs]).slice(0, MOCK_Q_WS_MCQ),
            prompts: shuffle([...prompts]).slice(0, MOCK_Q_WS_PROMPT),
        };
    }));

    const questions = [
        ...subSkillData.flatMap(d => d.mcqs),
        ...subSkillData.flatMap(d => d.prompts),
    ];
    return { section_type: 'MCQ_MIX', audio_url: null, passage_text: null, passage_id: null, questions };
}

// ─── Eligibility helper ───────────────────────────────────────────────────────

interface EligibilityResult {
    isEligible:      boolean;
    reasons:         { key: string; message: string }[];
    totalIAs:        number;
    skillsCovered:   Set<string>;
    bandImproved:    boolean;
    bestImprovement: number;
    improvedSkill:   string | null;
    diagnosticBands: Map<string, number>;
    currentBands:    Map<string, number>;
}

async function checkEligibility(studentId: string): Promise<EligibilityResult> {
    const [completedIAs, diagnosticHistory, competency] = await Promise.all([
        prisma.iASession.findMany({
            where:  { student_id: studentId, status: 'COMPLETED' },
            select: { selected_subskills: true }
        }),
        prisma.assessmentHistory.findMany({
            where:   { student_id: studentId, mode: 'DIAGNOSTIC' },
            select:  { skill: true, band_score: true, created_at: true },
            orderBy: { created_at: 'desc' }
        }),
        prisma.studentCompetencyMatrix.findMany({
            where:  { student_id: studentId },
            select: { skill: true, band_score: true }
        })
    ]);

    const skillsCovered = new Set<string>();
    for (const ia of completedIAs) {
        for (const ss of (ia.selected_subskills as Array<{ skill: string; sub_skill: string }>) ?? []) {
            skillsCovered.add(ss.skill);
        }
    }

    const diagnosticBands = new Map<string, number>();
    for (const h of diagnosticHistory) {
        const s = String(h.skill);
        if (!diagnosticBands.has(s)) diagnosticBands.set(s, parseFloat(String(h.band_score)) || 0);
    }

    const currentBands = new Map<string, number>();
    for (const c of competency) {
        if (c.band_score) currentBands.set(String(c.skill), parseFloat(String(c.band_score)) || 0);
    }

    let bestImprovement = 0;
    let improvedSkill: string | null = null;
    for (const skill of MOCK_SKILL_ORDER) {
        const diag = diagnosticBands.get(skill) ?? null;
        const curr = currentBands.get(skill) ?? null;
        if (diag !== null && curr !== null && (curr - diag) > bestImprovement) {
            bestImprovement = curr - diag;
            improvedSkill   = skill;
        }
    }

    const totalIAs     = completedIAs.length;
    const bandImproved = bestImprovement >= MOCK_BAND_IMPROVEMENT;

    const reasons: { key: string; message: string }[] = [];
    if (totalIAs < MOCK_IA_THRESHOLD) {
        const rem = MOCK_IA_THRESHOLD - totalIAs;
        reasons.push({ key: 'ia_count', message: `Complete ${rem} more IA${rem !== 1 ? 's' : ''} (${totalIAs}/${MOCK_IA_THRESHOLD} done)` });
    }
    for (const skill of MOCK_SKILL_ORDER) {
        if (!skillsCovered.has(skill))
            reasons.push({ key: `ia_skill_${skill.toLowerCase()}`, message: `Complete at least 1 IA covering ${skill}` });
    }
    if (!bandImproved)
        reasons.push({ key: 'band_improvement', message: `Improve any skill band ≥ ${MOCK_BAND_IMPROVEMENT} from diagnostic (best so far: +${bestImprovement.toFixed(1)})` });

    return { isEligible: reasons.length === 0, reasons, totalIAs, skillsCovered, bandImproved, bestImprovement, improvedSkill, diagnosticBands, currentBands };
}

// ─── GET /api/mock/status ─────────────────────────────────────────────────────

export async function getMockStatus(req: AuthRequest, res: Response) {
    try {
        const appUserId = (req as any).appUserId as string;
        if (!appUserId) return res.status(401).json({ success: false, error: 'Unauthorized.' });

        const student = await prisma.institute_students.findUnique({ where: { user_id: appUserId } });
        if (!student) return res.status(404).json({ success: false, error: 'Student not found.' });

        // ── Abandoned sweep: mark sessions whose 72-hour window has expired ──
        // No momentum penalty (unlike IA's -20). Student simply loses their monthly slot.
        // Runs on every status call so the dashboard always reflects current reality.
        const expiredSessions = await prisma.mocksessions.findMany({
            where: { student_id: student.id, window_closes_at: { lt: new Date() }, status: { in: ['PENDING', 'IN_PROGRESS'] as any } },
            select: { id: true }
        });
        const abandonedCount = expiredSessions.length;
        if (abandonedCount > 0) {
            // Status guard in WHERE prevents a TOCTOU race where a student submits
            // between the findMany above and this write, overwriting a COMPLETED session.
            await prisma.mocksessions.updateMany({
                where: { id: { in: expiredSessions.map(s => s.id) }, status: { in: ['PENDING', 'IN_PROGRESS'] as any } },
                data:  { status: 'ABANDONED' as any }
            });
        }

        const eligibility = await checkEligibility(student.id);
        const monthYear   = currentMonthYear();

        const thisMonthSessions = await prisma.mocksessions.findMany({
            where:  { student_id: student.id, month_year: monthYear },
            select: { id: true, attempt_type: true, status: true }
        });

        const standardSession = thisMonthSessions.find(s => s.attempt_type === 'STANDARD');
        const earnedSession   = thisMonthSessions.find(s => s.attempt_type === 'EARNED');
        // MK-B-07: query globally (no month_year filter) so a PENDING/IN_PROGRESS session
        // from last month whose 72-hour window is still open isn't invisible to the gate.
        // The abandoned sweep above has already expired stale sessions, so any remaining
        // PENDING/IN_PROGRESS is genuinely still active regardless of which month it's from.
        const activeSession   = await prisma.mocksessions.findFirst({
            where:  { student_id: student.id, status: { in: ['IN_PROGRESS', 'PENDING'] as any } },
            select: { id: true, status: true }
        });

        // ABANDONED counts as "used" — window expired, slot is forfeited for this attempt type.
        // Only PENDING is treated as "not yet started" (slot reserved but no test in progress).
        const standardUsed = !!standardSession && standardSession.status !== 'PENDING';
        const earnedUsed   = !!earnedSession   && earnedSession.status   !== 'PENDING';

        const daysOnPlatform = Math.floor((Date.now() - student.created_at.getTime()) / 86_400_000);
        const earnedEligible =
            eligibility.isEligible &&
            student.momentum_score >= MOCK_EARNED_COST &&
            eligibility.totalIAs   >= MOCK_EARNED_MIN_IAS &&
            daysOnPlatform         >= MOCK_EARNED_MIN_DAYS;

        const earnedReasons: { key: string; message: string }[] = [];
        if (!eligibility.isEligible)                           earnedReasons.push({ key: 'eligibility',  message: 'Complete standard eligibility first' });
        if (student.momentum_score < MOCK_EARNED_COST)         earnedReasons.push({ key: 'momentum',     message: `Need ${MOCK_EARNED_COST} momentum (have ${student.momentum_score})` });
        if (eligibility.totalIAs   < MOCK_EARNED_MIN_IAS)      earnedReasons.push({ key: 'ia_count',     message: `Need ${MOCK_EARNED_MIN_IAS} IAs for earned mock (have ${eligibility.totalIAs})` });
        if (daysOnPlatform         < MOCK_EARNED_MIN_DAYS)     earnedReasons.push({ key: 'days',         message: `Need ${MOCK_EARNED_MIN_DAYS} days on platform (have ${daysOnPlatform})` });

        return res.json({
            success:                   true,
            abandoned_count:           abandonedCount,
            is_eligible:               eligibility.isEligible,
            eligibility_reasons:       eligibility.reasons,
            can_start_mock:            eligibility.isEligible && !standardUsed && !activeSession,
            has_active_session:        !!activeSession,
            active_session_id:         activeSession?.id ?? null,
            standard_used_this_month:  standardUsed,
            standard_session_status:   standardSession?.status ?? null,
            earned_used_this_month:    earnedUsed,
            earned_session_status:     earnedSession?.status   ?? null,
            earned_mock_eligible:      earnedEligible,
            can_start_earned:          earnedEligible && !earnedUsed && !activeSession,
            earned_mock_reasons:       earnedReasons,
            momentum_score:            student.momentum_score,
            earned_mock_cost:          MOCK_EARNED_COST,
            progress: {
                ia_completed:    eligibility.totalIAs,
                ia_required:     MOCK_IA_THRESHOLD,
                ia_per_skill:    Object.fromEntries(MOCK_SKILL_ORDER.map(s => [s, eligibility.skillsCovered.has(s)])),
                band_improved:   eligibility.bandImproved,
                best_improvement: Math.round(eligibility.bestImprovement * 10) / 10,
                improved_skill:  eligibility.improvedSkill,
            }
        });
    } catch (err) {
        console.error('[MockStatus] error:', err);
        return res.status(500).json({ success: false, error: 'Internal server error.' });
    }
}

// ─── GET /api/mock/questions ──────────────────────────────────────────────────

export async function getMockQuestions(req: AuthRequest, res: Response) {
    try {
        const appUserId = (req as any).appUserId as string;
        if (!appUserId) return res.status(401).json({ success: false, error: 'Unauthorized.' });

        const student = await prisma.institute_students.findUnique({ where: { user_id: appUserId } });
        if (!student) return res.status(404).json({ success: false, error: 'Student not found.' });

        const attemptType = (req.query.attempt_type as string ?? 'STANDARD').toUpperCase() as 'STANDARD' | 'EARNED';
        const monthYear   = currentMonthYear();

        // ── 1. Resume any active session (any type) ───────────────────────────
        const activeSession = await prisma.mocksessions.findFirst({
            where: { student_id: student.id, status: { in: ['PENDING', 'IN_PROGRESS'] as any } }
        });

        if (activeSession) {
            const savedConfig = activeSession.question_ids as Array<{ skill: string; ids: string[] }>;
            const allIds      = savedConfig.flatMap(s => s.ids);
            const questionRows = await prisma.mockquestions.findMany({
                where:  { id: { in: allIds } },
                select: { id: true, skill: true, sub_skill: true, question_type: true, prompt_text: true, options: true, audio_url: true, passage_id: true, passage_text: true }
            });
            const sections = savedConfig.map(cfg => {
                const qs         = cfg.ids.map(id => questionRows.find(q => q.id === id)).filter(Boolean)
                    .map(q => ({ id: q!.id, sub_skill: q!.sub_skill, question_type: q!.question_type, prompt_text: q!.prompt_text, options: q!.options }));
                const audioUrl   = questionRows.find(q => cfg.ids.includes(q.id) && q.audio_url)?.audio_url ?? null;
                const passageId  = questionRows.find(q => cfg.ids.includes(q.id) && q.passage_id)?.passage_id ?? null;
                const passageTxt = questionRows.find(q => cfg.ids.includes(q.id) && q.passage_text)?.passage_text ?? null;
                return { skill: cfg.skill, section_type: audioUrl ? 'AUDIO' : passageId ? 'PASSAGE' : 'MCQ_MIX', audio_url: audioUrl, passage_text: passageTxt, passage_id: passageId, questions: qs };
            });

            const allAnswers   = (activeSession.answers as Record<string, any>) ?? {};
            const meta         = (allAnswers.__meta ?? {}) as { current_section?: number };
            const resumeIdx    = meta.current_section ?? 0;

            // Global timer: elapsed since test started
            const elapsed       = Date.now() - (activeSession.time_started_at?.getTime() ?? Date.now());
            const timeRemaining = Math.max(0, MOCK_TOTAL_MS - elapsed);

            if (activeSession.status === 'PENDING') {
                allAnswers.__meta = { current_section: 0 };
                await prisma.mocksessions.update({
                    where: { id: activeSession.id },
                    data:  { status: 'IN_PROGRESS', time_started_at: new Date(), answers: allAnswers as any }
                });
            }

            return res.json({
                success:             true,
                session_id:          activeSession.id,
                resume:              true,
                attempt_type:        activeSession.attempt_type,
                current_section_idx: resumeIdx,
                sections,
                saved_answers:       activeSession.answers,
                window_closes_at:    activeSession.window_closes_at.toISOString(),
                time_remaining_ms:   timeRemaining,
                total_time_ms:       MOCK_TOTAL_MS,
            });
        }

        // ── 2. Validate eligibility ────────────────────────────────────────────
        const eligibility = await checkEligibility(student.id);
        if (!eligibility.isEligible) return res.status(403).json({ success: false, error: 'Not eligible for mock test.', reasons: eligibility.reasons });

        // ── 3. Check monthly slot ─────────────────────────────────────────────
        // Must handle every terminal status here. Previously only COMPLETED was checked,
        // so an ABANDONED slot fell through to prisma.create() → P2002 unique constraint
        // crash, permanently locking the student out for the month (MK-B-01).
        const existingSlot = await prisma.mocksessions.findFirst({
            where: { student_id: student.id, month_year: monthYear, attempt_type: attemptType as any }
        });
        if (existingSlot) {
            // All non-null statuses consume the monthly slot — no retries.
            // ABANDONED = the 72-hour window expired without submission; slot is forfeited.
            // COMPLETED = submitted normally.  IN_PROGRESS/PENDING = resume path above handles.
            const msg = existingSlot.status === 'ABANDONED'
                ? `Your ${attemptType.toLowerCase()} mock session expired without submission. This month's slot is consumed — a new slot opens on the 1st.`
                : `${attemptType} mock already used this month.`;
            return res.status(409).json({ success: false, error: msg, slot_status: existingSlot.status });
        }

        // ── 4. Earned: validate + deduct momentum atomically ──────────────────
        if (attemptType === 'EARNED') {
            const days = Math.floor((Date.now() - student.created_at.getTime()) / 86_400_000);
            if (student.momentum_score < MOCK_EARNED_COST)  return res.status(403).json({ success: false, error: `Need ${MOCK_EARNED_COST} momentum.` });
            if (eligibility.totalIAs < MOCK_EARNED_MIN_IAS) return res.status(403).json({ success: false, error: `Need ${MOCK_EARNED_MIN_IAS} IAs.` });
            if (days < MOCK_EARNED_MIN_DAYS)                 return res.status(403).json({ success: false, error: `Need ${MOCK_EARNED_MIN_DAYS} days on platform.` });
        }

        // ── 5. Fetch all 4 sections in parallel ───────────────────────────────
        const [rawL, rawR, rawW, rawS] = await Promise.all([
            fetchMockSectionQuestions('LISTENING'),
            fetchMockSectionQuestions('READING'),
            fetchMockSectionQuestions('WRITING'),
            fetchMockSectionQuestions('SPEAKING'),
        ]);
        const rawSections = [rawL, rawR, rawW, rawS];

        // Validate every section is populated BEFORE creating the session. An empty or
        // underfilled section would grade as band 0, get blended into the student's
        // matrix, blank-screen the client, and consume the monthly slot — for what is
        // really a content-availability problem. Fail cleanly without consuming the slot.
        const emptySections = MOCK_SKILL_ORDER.filter((_, i) => (rawSections[i]?.questions?.length ?? 0) === 0);
        if (emptySections.length > 0) {
            console.error(`[MockQuestions] Missing question pool for: ${emptySections.join(', ')}`);
            return res.status(503).json({
                success: false,
                error:   'The mock test is temporarily unavailable (question set incomplete). Please try again later — no attempt has been used.',
            });
        }

        const questionIdsConfig = MOCK_SKILL_ORDER.map((skill, i) => ({
            skill,
            ids: rawSections[i].questions.map((q: any) => q.id)
        }));

        const now            = Date.now();
        const windowClosesAt = new Date(now + MOCK_WINDOW_MS);
        const initialAnswers = { __meta: { current_section: 0 } };

        // ── 6. Create session ─────────────────────────────────────────────────
        const session = await prisma.$transaction(async (tx) => {
            if (attemptType === 'EARNED') {
                await tx.institute_students.update({ where: { id: student.id }, data: { momentum_score: { decrement: MOCK_EARNED_COST } } });
            }
            return tx.mocksessions.create({
                data: {
                    student_id:       student.id,
                    attempt_type:     attemptType as any,
                    month_year:       monthYear,
                    status:           'IN_PROGRESS' as any,
                    question_ids:     questionIdsConfig as any,
                    answers:          initialAnswers as any,
                    time_started_at:  new Date(now),
                    window_closes_at: windowClosesAt,
                }
            });
        });

        const sections = MOCK_SKILL_ORDER.map((skill, i) => ({
            skill,
            ...rawSections[i],
            questions: sanitize(rawSections[i].questions),
        }));

        return res.json({
            success:             true,
            session_id:          session.id,
            resume:              false,
            attempt_type:        attemptType,
            current_section_idx: 0,
            sections,
            saved_answers:       {},
            window_closes_at:    windowClosesAt.toISOString(),
            time_remaining_ms:   MOCK_TOTAL_MS,
            total_time_ms:       MOCK_TOTAL_MS,
        });

    } catch (err) {
        console.error('[MockQuestions] error:', err);
        return res.status(500).json({ success: false, error: 'Internal server error.' });
    }
}

// ─── POST /api/mock/answer ────────────────────────────────────────────────────

export async function saveMockAnswer(req: AuthRequest, res: Response) {
    try {
        const appUserId = (req as any).appUserId as string;
        if (!appUserId) return res.status(401).json({ success: false, error: 'Unauthorized.' });

        const student = await prisma.institute_students.findUnique({ where: { user_id: appUserId } });
        if (!student) return res.status(404).json({ success: false, error: 'Student not found.' });

        const { session_id, question_id, answer, section_advance } = req.body;
        if (!session_id) return res.status(400).json({ success: false, error: 'session_id is required.' });

        const session = await prisma.mocksessions.findUnique({ where: { id: session_id } });
        if (!session || session.student_id !== student.id) return res.status(404).json({ success: false, error: 'Session not found.' });
        if (session.status === 'COMPLETED' || session.status === 'ABANDONED') return res.status(400).json({ success: false, error: 'Session already finalised.' });
        if (new Date() > session.window_closes_at) return res.status(400).json({ success: false, error: 'Mock window expired.' });

        if (section_advance !== undefined) {
            // Atomic JSONB merge of just the __meta key — read-modify-write of the whole
            // answers object would let a concurrent answer save clobber this (and vice versa).
            const nav = JSON.stringify({ current_section: Number(section_advance) });
            await prisma.$executeRaw`
                UPDATE mocksessions
                SET answers = COALESCE(answers, '{}'::jsonb) || jsonb_build_object('__meta', ${nav}::jsonb)
                WHERE id = ${session_id}::uuid
            `;
            return res.json({ success: true, saved: true });
        }

        if (!question_id || answer === undefined) return res.status(400).json({ success: false, error: 'question_id and answer are required.' });
        if (typeof answer !== 'string' && typeof answer !== 'number') {
            return res.status(400).json({ success: false, error: 'answer must be a string or number.' });
        }
        // Atomic single-key JSONB merge — two overlapping saves each preserve the other's
        // answer instead of last-writer-wins clobbering the whole object.
        await prisma.$executeRaw`
            UPDATE mocksessions
            SET answers = COALESCE(answers, '{}'::jsonb) || jsonb_build_object(${String(question_id)}::text, ${String(answer)}::text)
            WHERE id = ${session_id}::uuid
        `;
        // Flip PENDING → IN_PROGRESS once (touches status only; never the answers blob).
        await prisma.mocksessions.updateMany({
            where: { id: session_id, status: 'PENDING' as any },
            data:  { status: 'IN_PROGRESS' as any },
        });
        return res.json({ success: true, saved: true });
    } catch (err) {
        console.error('[MockAnswer] error:', err);
        return res.status(500).json({ success: false, error: 'Internal server error.' });
    }
}

// ─── POST /api/mock/submit ────────────────────────────────────────────────────

type MockSubSkillScore = {
    sub_skill:  string;
    band:       number;  // 0-9 IELTS, combined MCQ+AI
    correct:    number;
    total_mcq:  number;
    ai_band:    number | null;  // 0-9 IELTS equivalent of AI score
    ai_feedback?: { rationale: string; key_observations: string[] };
};

type MockSkillScore = {
    skill:             string;
    band:              number;  // overall skill band (avg of sub-skills for W/S, direct MCQ for L/R)
    correct:           number;
    total:             number;
    ai_graded:         boolean;
    sub_skill_scores?: MockSubSkillScore[];  // only W/S
};

type MockSkillScoreResponse = MockSkillScore & {
    new_matrix_band:  number;
    diagnostic_band:  number | null;
    delta_from_diag:  number | null;
    prev_matrix_band: number | null;
};

class MockAlreadyCompletedError extends Error {}

export async function submitMock(req: AuthRequest, res: Response) {
    try {
        const appUserId = (req as any).appUserId as string;
        if (!appUserId) return res.status(401).json({ success: false, error: 'Unauthorized.' });

        const student = await prisma.institute_students.findUnique({ where: { user_id: appUserId } });
        if (!student) return res.status(404).json({ success: false, error: 'Student not found.' });

        const { session_id } = req.body;
        if (!session_id) return res.status(400).json({ success: false, error: 'session_id is required.' });

        // ── 1. Validate session ────────────────────────────────────────────────
        const session = await prisma.mocksessions.findUnique({ where: { id: session_id } });
        if (!session)                            return res.status(404).json({ success: false, error: 'Session not found.' });
        if (session.student_id !== student.id)   return res.status(403).json({ success: false, error: 'Forbidden.' });
        if (session.status === 'COMPLETED')      return res.json({
            success: true,
            already_done:    true,
            real_band_score: session.real_band_score,
            scores:          session.scores,
            momentum_awarded: session.momentum_awarded,
        });
        if (session.status === 'ABANDONED')      return res.status(400).json({ success: false, error: 'Session window has expired.' });
        // MK-B-11: the 3-hour session length is enforced client-side only (frontend timer).
        // Server-side, the only hard gate is the 72-hour window_closes_at. This is intentional:
        // students may pause and resume within the window; the frontend prevents starting new
        // sections once the 3-hour clock runs out, but the server accepts a late submit rather
        // than silently discarding completed work.
        if (new Date() > session.window_closes_at) {
            await prisma.mocksessions.update({ where: { id: session_id }, data: { status: 'ABANDONED' as any } });
            return res.status(400).json({ success: false, error: 'Mock window has closed.' });
        }

        // ── 2. Load questions + strip __meta ──────────────────────────────────
        const questionIdsConfig = session.question_ids as Array<{ skill: string; ids: string[] }>;
        const allIds = questionIdsConfig.flatMap(c => c.ids);
        const questions = await prisma.mockquestions.findMany({
            where:  { id: { in: allIds } },
            select: { id: true, skill: true, sub_skill: true, question_type: true, correct_answer: true, prompt_text: true }
        });
        const answers = Object.fromEntries(
            Object.entries((session.answers ?? {}) as Record<string, unknown>).filter(([k]) => k !== '__meta')
        ) as Record<string, string>;

        // ── 3. Launch AI grading for W/S prompts in parallel ─────────────────
        // Track by sectionIdx:sub_skill key for per-sub-skill retrieval
        type AIJob = { key: string; band: number; rationale: string; key_observations: string[] };
        const aiJobs: Promise<AIJob>[] = [];

        for (let i = 0; i < questionIdsConfig.length; i++) {
            const cfg = questionIdsConfig[i];
            if (cfg.skill !== 'WRITING' && cfg.skill !== 'SPEAKING') continue;

            const subQs = questions.filter(q => cfg.ids.includes(q.id));
            const aiQs  = subQs.filter(q => q.question_type === 'WRITING_PROMPT' || q.question_type === 'SPEAKING_PROMPT');
            for (const q of aiQs) {
                const rawText  = (answers[q.id] ?? '').trim();
                const text     = rawText === '[no transcript]' ? '' : rawText;
                const subSkill = String(q.sub_skill ?? (cfg.skill === 'WRITING' ? 'TASK_RESPONSE' : 'FLUENCY'));
                // Key by skill name, not loop index — index-keyed lookups break if the
                // questionIdsConfig array order ever differs between creation and submission.
                const key      = `${cfg.skill}:${subSkill}`;
                aiJobs.push((async (): Promise<AIJob> => {
                    const result = q.question_type === 'WRITING_PROMPT'
                        ? await gradeIAWritingPrompt(subSkill, q.prompt_text, text)
                        : await gradeIASpeakingPrompt(subSkill, q.prompt_text, text);
                    return { key, band: result.band, rationale: result.rationale, key_observations: result.key_observations };
                })());
            }
        }
        const aiResults           = await Promise.all(aiJobs);
        const aiByKey             = new Map<string, number>();
        const aiFeedbackByKey     = new Map<string, { rationale: string; key_observations: string[] }>();
        for (const j of aiResults) {
            aiByKey.set(j.key, j.band);
            if (j.rationale) aiFeedbackByKey.set(j.key, { rationale: j.rationale, key_observations: j.key_observations });
        }

        // ── 4. Score each skill ────────────────────────────────────────────────
        const skillScores: MockSkillScore[] = [];

        for (let i = 0; i < questionIdsConfig.length; i++) {
            const cfg   = questionIdsConfig[i];
            const subQs = questions.filter(q => cfg.ids.includes(q.id));

            if (cfg.skill === 'LISTENING' || cfg.skill === 'READING') {
                // ── L/R: pure MCQ scoring → direct IELTS band ─────────────────
                const mcqQs = subQs.filter(q => q.question_type === 'MCQ' || q.question_type === 'TFNG');
                let correct = 0;
                for (const q of mcqQs) {
                    const sa = (answers[q.id] ?? '').trim().toUpperCase();
                    const ca = String(q.correct_answer ?? '').trim().toUpperCase().replace(/^["']|["']$/g, '');
                    if (sa && ca && sa === ca) correct++;
                }
                const band = mcqQs.length > 0
                    ? Math.min(9.0, Math.max(0.0, Math.round((correct / mcqQs.length) * 9 * 2) / 2))
                    : 0;
                skillScores.push({ skill: cfg.skill, band, correct, total: mcqQs.length, ai_graded: false });

            } else {
                // ── W/S: 4 sub-skills, each MCQ + 1 AI prompt (w1=1, w2=2) ────
                const subSkills = cfg.skill === 'WRITING' ? WRITING_SUB_SKILLS : SPEAKING_SUB_SKILLS;
                const subSkillScores: MockSubSkillScore[] = [];
                let totalCorrect = 0;
                let totalMCQ     = 0;

                for (const ss of subSkills) {
                    const ssQs  = subQs.filter(q => String(q.sub_skill) === ss);
                    const ssMCQ = ssQs.filter(q => q.question_type === 'MCQ' || q.question_type === 'TFNG');

                    let ssCorrect = 0;
                    for (const q of ssMCQ) {
                        const sa = (answers[q.id] ?? '').trim().toUpperCase();
                        const ca = String(q.correct_answer ?? '').trim().toUpperCase().replace(/^["']|["']$/g, '');
                        if (sa && ca && sa === ca) ssCorrect++;
                    }
                    totalCorrect += ssCorrect;
                    totalMCQ     += ssMCQ.length;

                    // MCQ → 1-10 scale. Same proportional mapping as iaProcessor:
                    // 0 correct → 1 (IELTS 0), all correct → 10 (IELTS 9).
                    const mcqScore1to10 = ssMCQ.length > 0
                        ? Math.min(10, 1 + (ssCorrect / ssMCQ.length) * 9)
                        : null;

                    // AI → 1-10 scale (from iaGrading)
                    const aiScore1to10 = aiByKey.get(`${cfg.skill}:${ss}`) ?? null;

                    // Combine with w1=1, w2=2
                    let combined1to10: number;
                    if      (mcqScore1to10 === null && aiScore1to10 === null) combined1to10 = 1;
                    else if (mcqScore1to10 === null)                           combined1to10 = aiScore1to10!;
                    else if (aiScore1to10 === null)                            combined1to10 = mcqScore1to10;
                    else    combined1to10 = (mcqScore1to10 * 1 + aiScore1to10 * 2) / 3;

                    const ssBand      = scaleToIELTS(combined1to10);
                    const aiIELTS     = aiScore1to10 !== null ? scaleToIELTS(aiScore1to10) : null;
                    const feedbackKey = `${cfg.skill}:${ss}`;

                    subSkillScores.push({
                        sub_skill:   ss,
                        band:        ssBand,
                        correct:     ssCorrect,
                        total_mcq:   ssMCQ.length,
                        ai_band:     aiIELTS,
                        ai_feedback: aiFeedbackByKey.get(feedbackKey),
                    });
                }

                // Overall skill band = avg of 4 sub-skill bands, rounded to 0.5
                const avgBand = subSkillScores.length > 0
                    ? Math.round((subSkillScores.reduce((s, x) => s + x.band, 0) / subSkillScores.length) * 2) / 2
                    : 0;

                skillScores.push({ skill: cfg.skill, band: avgBand, correct: totalCorrect, total: totalMCQ, ai_graded: true, sub_skill_scores: subSkillScores });
            }
        }

        // ── 5. Pre-fetch matrix + diagnostic for delta calculation ────────────
        const [competencyPre, diagnosticHistory] = await Promise.all([
            prisma.studentCompetencyMatrix.findMany({
                where:  { student_id: student.id },
                select: { skill: true, band_score: true, sub_scores: true }
            }),
            prisma.assessmentHistory.findMany({
                where:   { student_id: student.id, mode: 'DIAGNOSTIC' },
                select:  { skill: true, band_score: true, created_at: true },
                orderBy: { created_at: 'desc' }
            })
        ]);

        const prevMatrixBands = new Map<string, number>();
        for (const c of competencyPre) {
            if (c.band_score) prevMatrixBands.set(String(c.skill), parseFloat(String(c.band_score)) || 0);
        }
        const diagnosticBands = new Map<string, number>();
        for (const h of diagnosticHistory) {
            const s = String(h.skill);
            if (!diagnosticBands.has(s)) diagnosticBands.set(s, parseFloat(String(h.band_score)) || 0);
        }

        // ── 6. Pre-compute W/S sub-skill updates (single source of truth) ────────
        // MK-B-10: the formula was duplicated — once for the response object and once in
        // the DB transaction. A SUB_SCORE_KEY_MAP miss would silently diverge the two.
        // Compute here once; both the response builder and the transaction consume this map.
        type WSUpdate = { updatedSS: Record<string, number>; newMatrixBand: number };
        const wsUpdates = new Map<string, WSUpdate>();
        for (const s of skillScores) {
            if (s.skill !== 'WRITING' && s.skill !== 'SPEAKING') continue;
            const matrixRow  = competencyPre.find(c => String(c.skill) === s.skill);
            const existingSS = (matrixRow?.sub_scores as Record<string, number>) ?? {};
            const updatedSS  = { ...existingSS };
            const newBands:   number[] = [];
            for (const ss of (s.sub_skill_scores ?? [])) {
                const key   = SUB_SCORE_KEY_MAP[ss.sub_skill];
                if (!key) continue;
                const curSS = existingSS[key] ?? null;
                const newSS = curSS !== null
                    ? Math.min(9, Math.max(0, Math.round((ss.band * 0.60 + curSS * 0.40) * 2) / 2))
                    : Math.min(9, Math.max(0, ss.band));
                updatedSS[key] = newSS;
                newBands.push(newSS);
            }
            const newMatrixBand = newBands.length > 0
                ? Math.round((newBands.reduce((a, b) => a + b, 0) / newBands.length) * 2) / 2
                : s.band;
            wsUpdates.set(s.skill, { updatedSS, newMatrixBand });
        }

        // ── 7. Apply scoring formula + build response ─────────────────────────
        // new_band = mock_band × 0.60 + current_matrix_band × 0.40
        const skillScoresResponse: MockSkillScoreResponse[] = skillScores.map(s => {
            const prevBand = prevMatrixBands.get(s.skill) ?? null;
            const diagBand = diagnosticBands.get(s.skill) ?? null;

            let newMatrixBand: number;
            if (s.skill === 'WRITING' || s.skill === 'SPEAKING') {
                newMatrixBand = wsUpdates.get(s.skill)!.newMatrixBand;
            } else {
                // L/R: direct skill-level formula
                newMatrixBand = prevBand !== null
                    ? Math.min(9, Math.max(0, Math.round((s.band * 0.60 + prevBand * 0.40) * 2) / 2))
                    : Math.min(9, Math.max(0, s.band));
            }

            const deltaFromDiag = diagBand !== null ? Math.round((newMatrixBand - diagBand) * 10) / 10 : null;
            return { ...s, new_matrix_band: newMatrixBand, prev_matrix_band: prevBand, diagnostic_band: diagBand, delta_from_diag: deltaFromDiag };
        });

        // ── 8. Real Band + momentum ───────────────────────────────────────────
        const allNewBands  = skillScoresResponse.map(s => s.new_matrix_band);
        const realBandRaw  = allNewBands.reduce((a, b) => a + b, 0) / allNewBands.length;
        const realBandScore = Math.min(9, Math.max(0, Math.round(realBandRaw * 2) / 2));

        // Always divide by all 4 skills so prevOverall is on the same scale as realBandScore.
        // Using prevMatrixBands.size as the denominator gave a falsely high prevOverall for
        // new students (e.g. size=1 → prevOverall = that one skill's band), making the delta
        // appear negative and incorrectly triggering or suppressing the 500-pt threshold bonus.
        const prevOverall = Math.round(
            (MOCK_SKILL_ORDER.reduce((sum, sk) => sum + (prevMatrixBands.get(sk) ?? 0), 0) / MOCK_SKILL_ORDER.length) * 2
        ) / 2;
        const thresholdCrossed = Math.floor(realBandScore / 0.5) > Math.floor(prevOverall / 0.5);

        const momentumBreakdown = [{ reason: 'Participation', points: 200 }];
        let momentumAwarded = 200;
        if (thresholdCrossed) {
            momentumAwarded += 500;
            momentumBreakdown.push({ reason: `New band threshold — crossed ${realBandScore.toFixed(1)}`, points: 500 });
        }

        // ── 9. DB transaction ─────────────────────────────────────────────────
        const updatedMomentum = await prisma.$transaction(async (tx) => {
            // a) Session complete — status guard prevents concurrent double-award
            const marked = await tx.mocksessions.updateMany({
                where: { id: session_id, status: { in: ['IN_PROGRESS', 'PENDING'] as any } },
                data:  {
                    status:            'COMPLETED' as any,
                    scores:            skillScores as any,
                    real_band_score:   realBandScore,
                    momentum_awarded:  momentumAwarded,
                    time_submitted_at: new Date()
                }
            });
            // If count === 0 the session was completed by a concurrent request — abort cleanly
            if (marked.count === 0) throw new MockAlreadyCompletedError();

            // b) AssessmentHistory + CompetencyMatrix per skill
            for (const s of skillScoresResponse) {
                await tx.assessmentHistory.create({
                    data: { student_id: student.id, skill: s.skill as any, mode: 'MOCK' as any, band_score: s.new_matrix_band }
                });

                if (s.skill === 'WRITING' || s.skill === 'SPEAKING') {
                    // MK-B-10: use the pre-computed record — not recomputed here.
                    const { updatedSS } = wsUpdates.get(s.skill)!;
                    await tx.studentCompetencyMatrix.upsert({
                        where:  { student_id_skill: { student_id: student.id, skill: s.skill as any } },
                        update: { band_score: s.new_matrix_band, sub_scores: updatedSS as any, assessments_count: { increment: 1 }, last_updated: new Date() },
                        create: { student_id: student.id, skill: s.skill as any, band_score: s.new_matrix_band, sub_scores: updatedSS as any, assessments_count: 1 }
                    });
                } else {
                    // L/R: update band_score only
                    await tx.studentCompetencyMatrix.upsert({
                        where:  { student_id_skill: { student_id: student.id, skill: s.skill as any } },
                        update: { band_score: s.new_matrix_band, assessments_count: { increment: 1 }, last_updated: new Date() },
                        create: { student_id: student.id, skill: s.skill as any, band_score: s.new_matrix_band, assessments_count: 1 }
                    });
                }
            }

            // c) Momentum
            const updated = await tx.institute_students.update({
                where:  { id: student.id },
                data:   { momentum_score: { increment: momentumAwarded } },
                select: { momentum_score: true }
            });
            return updated.momentum_score;
        });

        return res.json({
            success:             true,
            real_band_score:     realBandScore,
            prev_real_band:      prevOverall,
            real_band_delta:     Math.round((realBandScore - prevOverall) * 10) / 10,
            threshold_crossed:   thresholdCrossed,
            momentum_awarded:    momentumAwarded,
            momentum_breakdown:  momentumBreakdown,
            updated_momentum:    updatedMomentum,
            skill_scores:        skillScoresResponse,
        });
    } catch (err) {
        if (err instanceof MockAlreadyCompletedError) {
            const s = await prisma.mocksessions.findUnique({ where: { id: req.body?.session_id } });
            return res.json({
                success: true, already_done: true,
                real_band_score:  s?.real_band_score ?? null,
                scores:           s?.scores ?? null,
                momentum_awarded: s?.momentum_awarded ?? 0,
            });
        }
        // AI grading failed (infra). The status transaction never ran, so the session
        // stays IN_PROGRESS and remains submittable within its 72h window. Tell the
        // client to retry rather than fabricating a band or consuming the slot.
        if (err instanceof AIGradingError) {
            return res.status(502).json({
                success:   false,
                can_retry: true,
                error:     'AI grading is temporarily unavailable. Your answers are saved — please submit again in a moment.',
            });
        }
        console.error('[MockSubmit] error:', err);
        return res.status(500).json({ success: false, error: 'Internal server error.' });
    }
}
