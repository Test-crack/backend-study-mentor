import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import prisma from '../lib/prisma';
import { gradeIAWritingPrompt, gradeIASpeakingPrompt } from '../lib/iaGrading';

// ─── Constants ────────────────────────────────────────────────────────────────

const MOCK_IA_THRESHOLD      = 6;             // completed IAs required
const MOCK_EARNED_COST       = 1500;          // momentum points for extra mock
const MOCK_EARNED_MIN_IAS    = 4;             // IAs needed to unlock earned path
const MOCK_EARNED_MIN_DAYS   = 14;            // days on platform for earned path
const MOCK_BAND_IMPROVEMENT  = 0.5;          // minimum improvement from diagnostic
const MOCK_WINDOW_MS         = 72 * 60 * 60 * 1000; // 72-hour submission window
const IST_OFFSET_MS          = 5.5 * 60 * 60 * 1000;

// Per-section timer in ms (IELTS approximate durations)
const MOCK_SECTION_MS: Record<string, number> = {
    LISTENING: 30 * 60 * 1000,
    READING:   30 * 60 * 1000,
    WRITING:   40 * 60 * 1000,
    SPEAKING:  20 * 60 * 1000,
};

// Fixed IELTS order for all mock sessions
const MOCK_SKILL_ORDER = ['LISTENING', 'READING', 'WRITING', 'SPEAKING'] as const;

// Sub-score JSONB keys — same map as IA
const SUB_SCORE_KEY_MAP: Record<string, string> = {
    GRAMMAR:       'grammarScore',
    VOCABULARY:    'vocabularyScore',
    COHERENCE:     'coherenceScore',
    TASK_RESPONSE: 'taskResponseScore',
    FLUENCY:       'fluencyScore',
    PRONUNCIATION: 'pronunciationScore',
};

// ─── IST helpers (mirrors iaController) ──────────────────────────────────────

function toISTDateString(d: Date): string {
    const ist = new Date(d.getTime() + IST_OFFSET_MS);
    return [
        ist.getUTCFullYear(),
        String(ist.getUTCMonth() + 1).padStart(2, '0'),
        String(ist.getUTCDate()).padStart(2, '0'),
    ].join('-');
}

/** "YYYY-MM" in IST — used as the monthly deduplication key. */
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

/**
 * Fetch 10 questions for one mock skill section.
 * No difficulty filter — all mock questions are exam-level.
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
            select: { id: true, audio_url: true, question_type: true, prompt_text: true, options: true }
        });
        if (pool.length === 0) return { section_type: 'AUDIO', audio_url: null, passage_text: null, passage_id: null, questions: [] };
        const groups  = [...new Set(pool.map(q => q.audio_url!))];
        const chosen  = groups[Math.floor(Math.random() * groups.length)];
        const qs      = shuffle(pool.filter(q => q.audio_url === chosen)).slice(0, 10);
        return { section_type: 'AUDIO', audio_url: chosen, passage_text: null, passage_id: null, questions: qs };
    }

    // ── READING ───────────────────────────────────────────────────────────────
    if (skill === 'READING') {
        const pool = await prisma.mockquestions.findMany({
            where:  { ...base, passage_id: { not: null } },
            select: { id: true, passage_id: true, passage_text: true, question_type: true, prompt_text: true, options: true }
        });
        if (pool.length === 0) return { section_type: 'PASSAGE', audio_url: null, passage_text: null, passage_id: null, questions: [] };
        const groups  = [...new Set(pool.map(q => q.passage_id!))];
        const chosen  = groups[Math.floor(Math.random() * groups.length)];
        const grouped = shuffle(pool.filter(q => q.passage_id === chosen)).slice(0, 10);
        const passageTxt = pool.find(q => q.passage_id === chosen && q.passage_text)?.passage_text ?? null;
        return {
            section_type: 'PASSAGE', audio_url: null,
            passage_text: passageTxt, passage_id: chosen,
            questions: grouped.map(q => ({ id: q.id, question_type: q.question_type, prompt_text: q.prompt_text, options: q.options }))
        };
    }

    // ── WRITING / SPEAKING ─────────────────────────────────────────────────────
    const promptType = skill === 'WRITING' ? 'WRITING_PROMPT' : 'SPEAKING_PROMPT';
    const [mcqs, prompts] = await Promise.all([
        prisma.mockquestions.findMany({
            where:  { ...base, question_type: 'MCQ' },
            select: { id: true, question_type: true, prompt_text: true, options: true }
        }),
        prisma.mockquestions.findMany({
            where:  { ...base, question_type: promptType },
            select: { id: true, question_type: true, prompt_text: true, options: true }
        })
    ]);
    const finalMCQ     = shuffle([...mcqs]).slice(0, 8);
    const finalPrompts = shuffle([...prompts]).slice(0, 2);
    return { section_type: 'MCQ_MIX', audio_url: null, passage_text: null, passage_id: null, questions: [...finalMCQ, ...finalPrompts] };
}

// ─── Eligibility helper — shared by status + questions ────────────────────────

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

    // Skills covered by completed IAs
    const skillsCovered = new Set<string>();
    for (const ia of completedIAs) {
        for (const ss of (ia.selected_subskills as Array<{ skill: string; sub_skill: string }>) ?? []) {
            skillsCovered.add(ss.skill);
        }
    }

    // Diagnostic bands (latest per skill)
    const diagnosticBands = new Map<string, number>();
    for (const h of diagnosticHistory) {
        const skill = String(h.skill);
        if (!diagnosticBands.has(skill)) {
            diagnosticBands.set(skill, parseFloat(String(h.band_score)) || 0);
        }
    }

    // Current competency matrix bands
    const currentBands = new Map<string, number>();
    for (const c of competency) {
        if (c.band_score) currentBands.set(String(c.skill), parseFloat(String(c.band_score)) || 0);
    }

    // Best improvement from diagnostic
    let bestImprovement = 0;
    let improvedSkill: string | null = null;
    for (const skill of MOCK_SKILL_ORDER) {
        const diag = diagnosticBands.get(skill) ?? null;
        const curr = currentBands.get(skill) ?? null;
        if (diag !== null && curr !== null) {
            const improvement = curr - diag;
            if (improvement > bestImprovement) { bestImprovement = improvement; improvedSkill = skill; }
        }
    }

    const totalIAs     = completedIAs.length;
    const bandImproved = bestImprovement >= MOCK_BAND_IMPROVEMENT;

    const reasons: { key: string; message: string }[] = [];
    if (totalIAs < MOCK_IA_THRESHOLD) {
        const rem = MOCK_IA_THRESHOLD - totalIAs;
        reasons.push({ key: 'ia_count', message: `Complete ${rem} more IA${rem !== 1 ? 's' : ''} (${totalIAs} / ${MOCK_IA_THRESHOLD} done)` });
    }
    for (const skill of MOCK_SKILL_ORDER) {
        if (!skillsCovered.has(skill)) {
            reasons.push({ key: `ia_skill_${skill.toLowerCase()}`, message: `Complete at least 1 IA covering ${skill}` });
        }
    }
    if (!bandImproved) {
        reasons.push({ key: 'band_improvement', message: `Improve any skill band by ≥ ${MOCK_BAND_IMPROVEMENT} from your diagnostic score (best so far: +${bestImprovement.toFixed(1)})` });
    }

    return {
        isEligible: reasons.length === 0,
        reasons,
        totalIAs,
        skillsCovered,
        bandImproved,
        bestImprovement,
        improvedSkill,
        diagnosticBands,
        currentBands,
    };
}

// ─── GET /api/mock/status ─────────────────────────────────────────────────────

export async function getMockStatus(req: AuthRequest, res: Response) {
    try {
        const appUserId = (req as any).appUserId as string;
        if (!appUserId) return res.status(401).json({ success: false, error: 'Unauthorized.' });

        const student = await prisma.institute_students.findUnique({ where: { user_id: appUserId } });
        if (!student) return res.status(404).json({ success: false, error: 'Student not found.' });

        const eligibility = await checkEligibility(student.id);

        const monthYear       = currentMonthYear();
        const thisMonthSessions = await prisma.mocksessions.findMany({
            where:  { student_id: student.id, month_year: monthYear },
            select: { id: true, attempt_type: true, status: true }
        });

        const standardSession = thisMonthSessions.find(s => s.attempt_type === 'STANDARD');
        const earnedSession   = thisMonthSessions.find(s => s.attempt_type === 'EARNED');
        const activeSession   = thisMonthSessions.find(s => s.status === 'IN_PROGRESS' || s.status === 'PENDING');

        const standardUsed   = !!standardSession && (standardSession.status === 'COMPLETED' || standardSession.status === 'IN_PROGRESS');
        const earnedUsed     = !!earnedSession   && (earnedSession.status   === 'COMPLETED' || earnedSession.status   === 'IN_PROGRESS');
        const hasActive      = !!activeSession;

        // Days on platform for earned eligibility
        const daysOnPlatform = Math.floor((Date.now() - student.created_at.getTime()) / 86_400_000);

        const earnedEligible =
            eligibility.isEligible &&
            student.momentum_score >= MOCK_EARNED_COST &&
            eligibility.totalIAs   >= MOCK_EARNED_MIN_IAS &&
            daysOnPlatform         >= MOCK_EARNED_MIN_DAYS;

        const earnedReasons: { key: string; message: string }[] = [];
        if (!eligibility.isEligible) earnedReasons.push({ key: 'eligibility', message: 'Complete standard eligibility first' });
        if (student.momentum_score < MOCK_EARNED_COST)     earnedReasons.push({ key: 'momentum', message: `Need ${MOCK_EARNED_COST} momentum (have ${student.momentum_score})` });
        if (eligibility.totalIAs   < MOCK_EARNED_MIN_IAS)  earnedReasons.push({ key: 'ia_count',  message: `Need ${MOCK_EARNED_MIN_IAS} IAs for earned mock (have ${eligibility.totalIAs})` });
        if (daysOnPlatform         < MOCK_EARNED_MIN_DAYS) earnedReasons.push({ key: 'days',      message: `Need ${MOCK_EARNED_MIN_DAYS} days on platform (have ${daysOnPlatform})` });

        return res.json({
            success:              true,
            is_eligible:          eligibility.isEligible,
            eligibility_reasons:  eligibility.reasons,
            can_start_mock:       eligibility.isEligible && !standardUsed && !hasActive,
            has_active_session:   hasActive,
            active_session_id:    activeSession?.id ?? null,
            standard_used_this_month: standardUsed,
            earned_used_this_month:   earnedUsed,
            earned_mock_eligible:     earnedEligible,
            can_start_earned:         earnedEligible && !earnedUsed && !hasActive,
            earned_mock_reasons:      earnedReasons,
            momentum_score:           student.momentum_score,
            earned_mock_cost:         MOCK_EARNED_COST,
            progress: {
                ia_completed:       eligibility.totalIAs,
                ia_required:        MOCK_IA_THRESHOLD,
                ia_per_skill:       Object.fromEntries(MOCK_SKILL_ORDER.map(s => [s, eligibility.skillsCovered.has(s)])),
                band_improved:      eligibility.bandImproved,
                best_improvement:   Math.round(eligibility.bestImprovement * 10) / 10,
                improved_skill:     eligibility.improvedSkill,
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

        const attemptType  = (req.query.attempt_type as string ?? 'STANDARD').toUpperCase() as 'STANDARD' | 'EARNED';
        const monthYear    = currentMonthYear();

        // ── 1. Check for existing active session (any type) → resume ──────────
        const activeSession = await prisma.mocksessions.findFirst({
            where: { student_id: student.id, status: { in: ['PENDING', 'IN_PROGRESS'] as any } }
        });

        if (activeSession) {
            // Resume — rebuild sections from saved question_ids
            const savedConfig = activeSession.question_ids as Array<{ skill: string; ids: string[] }>;
            const allIds      = savedConfig.flatMap(s => s.ids);
            const questionRows = await prisma.mockquestions.findMany({
                where:  { id: { in: allIds } },
                select: { id: true, skill: true, question_type: true, prompt_text: true, options: true, audio_url: true, passage_id: true, passage_text: true }
            });
            const sections = savedConfig.map(cfg => {
                const qs         = cfg.ids.map(id => questionRows.find(q => q.id === id)).filter(Boolean)
                                        .map(q => ({ id: q!.id, question_type: q!.question_type, prompt_text: q!.prompt_text, options: q!.options }));
                const audioUrl   = questionRows.find(q => cfg.ids.includes(q.id) && q.audio_url)?.audio_url ?? null;
                const passageId  = questionRows.find(q => cfg.ids.includes(q.id) && q.passage_id)?.passage_id ?? null;
                const passageTxt = questionRows.find(q => cfg.ids.includes(q.id) && q.passage_text)?.passage_text ?? null;
                return {
                    skill: cfg.skill,
                    section_type: audioUrl ? 'AUDIO' : passageId ? 'PASSAGE' : 'MCQ_MIX',
                    audio_url:    audioUrl,
                    passage_text: passageTxt,
                    passage_id:   passageId,
                    questions:    qs,
                };
            });

            // Per-section remaining time from __meta
            const allAnswers       = (activeSession.answers as Record<string, any>) ?? {};
            const meta             = (allAnswers.__meta ?? {}) as { current_section?: number; section_started_at?: number };
            const resumeSectionIdx = meta.current_section ?? 0;
            const sectionKey       = sections[resumeSectionIdx]?.skill ?? 'LISTENING';
            const sectionMs        = MOCK_SECTION_MS[sectionKey] ?? MOCK_SECTION_MS.LISTENING;
            const elapsed          = Date.now() - (meta.section_started_at ?? (activeSession.time_started_at?.getTime() ?? Date.now()));
            const timeRemaining    = Math.max(0, sectionMs - elapsed);

            // Mark IN_PROGRESS if still PENDING
            if (activeSession.status === 'PENDING') {
                const now = Date.now();
                allAnswers.__meta = { current_section: 0, section_started_at: now };
                await prisma.mocksessions.update({
                    where: { id: activeSession.id },
                    data:  { status: 'IN_PROGRESS', time_started_at: new Date(now), answers: allAnswers as any }
                });
            }

            return res.json({
                success:             true,
                session_id:          activeSession.id,
                resume:              true,
                attempt_type:        activeSession.attempt_type,
                current_section_idx: resumeSectionIdx,
                sections,
                saved_answers:       activeSession.answers,
                window_closes_at:    activeSession.window_closes_at.toISOString(),
                time_remaining_ms:   timeRemaining,
                section_timers:      MOCK_SECTION_MS,
            });
        }

        // ── 2. Validate eligibility ────────────────────────────────────────────
        const eligibility = await checkEligibility(student.id);
        if (!eligibility.isEligible) {
            return res.status(403).json({ success: false, error: 'Not eligible for mock test.', reasons: eligibility.reasons });
        }

        // ── 3. Check monthly slot availability ────────────────────────────────
        const existingSlot = await prisma.mocksessions.findFirst({
            where: { student_id: student.id, month_year: monthYear, attempt_type: attemptType as any }
        });
        if (existingSlot) {
            if (existingSlot.status === 'COMPLETED') {
                return res.status(409).json({ success: false, error: `${attemptType} mock already used this month.` });
            }
        }

        // ── 4. Earned mock: validate momentum + deduct atomically ─────────────
        if (attemptType === 'EARNED') {
            const daysOnPlatform = Math.floor((Date.now() - student.created_at.getTime()) / 86_400_000);
            if (student.momentum_score < MOCK_EARNED_COST)    return res.status(403).json({ success: false, error: `Need ${MOCK_EARNED_COST} momentum (have ${student.momentum_score}).` });
            if (eligibility.totalIAs < MOCK_EARNED_MIN_IAS)   return res.status(403).json({ success: false, error: `Need ${MOCK_EARNED_MIN_IAS} completed IAs for earned mock.` });
            if (daysOnPlatform < MOCK_EARNED_MIN_DAYS)         return res.status(403).json({ success: false, error: `Need ${MOCK_EARNED_MIN_DAYS} days on platform.` });
        }

        // ── 5. Fetch questions for all 4 sections in parallel ─────────────────
        const [rawL, rawR, rawW, rawS] = await Promise.all([
            fetchMockSectionQuestions('LISTENING'),
            fetchMockSectionQuestions('READING'),
            fetchMockSectionQuestions('WRITING'),
            fetchMockSectionQuestions('SPEAKING'),
        ]);
        const rawSections = [rawL, rawR, rawW, rawS];

        const questionIdsConfig = MOCK_SKILL_ORDER.map((skill, i) => ({
            skill,
            ids: rawSections[i].questions.map((q: any) => q.id)
        }));

        const now             = Date.now();
        const windowClosesAt  = new Date(now + MOCK_WINDOW_MS);
        const initialAnswers  = { __meta: { current_section: 0, section_started_at: now } };

        // ── 6. Create session (with momentum deduction for EARNED) ────────────
        const session = await prisma.$transaction(async (tx) => {
            if (attemptType === 'EARNED') {
                await tx.institute_students.update({
                    where: { id: student.id },
                    data:  { momentum_score: { decrement: MOCK_EARNED_COST } }
                });
            }
            return tx.mocksessions.create({
                data: {
                    student_id:      student.id,
                    attempt_type:    attemptType as any,
                    month_year:      monthYear,
                    status:          'IN_PROGRESS' as any,
                    question_ids:    questionIdsConfig as any,
                    answers:         initialAnswers as any,
                    time_started_at: new Date(now),
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
            time_remaining_ms:   MOCK_SECTION_MS.LISTENING,  // first section timer
            section_timers:      MOCK_SECTION_MS,
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
        if (session.status === 'COMPLETED' || session.status === 'ABANDONED') return res.status(400).json({ success: false, error: 'Session is already finalised.' });
        if (new Date() > session.window_closes_at) return res.status(400).json({ success: false, error: 'Mock window has expired.' });

        const current = (session.answers as Record<string, any>) ?? {};

        // Section-advance: stamp new section start time
        if (section_advance !== undefined) {
            current.__meta = { current_section: Number(section_advance), section_started_at: Date.now() };
            await prisma.mocksessions.update({ where: { id: session_id }, data: { answers: current as any } });
            return res.json({ success: true, saved: true });
        }

        // Normal answer save
        if (!question_id || answer === undefined) return res.status(400).json({ success: false, error: 'question_id and answer are required.' });
        current[question_id] = String(answer);
        await prisma.mocksessions.update({
            where: { id: session_id },
            data:  { answers: current as any, status: 'IN_PROGRESS' as any }
        });
        return res.json({ success: true, saved: true });
    } catch (err) {
        console.error('[MockAnswer] error:', err);
        return res.status(500).json({ success: false, error: 'Internal server error.' });
    }
}

// ─── POST /api/mock/submit ────────────────────────────────────────────────────

type MockSkillScore = {
    skill:      string;
    band:       number;   // raw mock score for this skill
    correct:    number;
    total:      number;
    ai_graded:  boolean;
};

type MockSkillScoreResponse = MockSkillScore & {
    new_matrix_band:    number;   // after Mock×0.60 + Matrix×0.40
    diagnostic_band:    number | null;
    delta_from_diag:    number | null;
    prev_matrix_band:   number | null;
};

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
        if (!session) return res.status(404).json({ success: false, error: 'Session not found.' });
        if (session.student_id !== student.id) return res.status(403).json({ success: false, error: 'Forbidden.' });
        if (session.status === 'COMPLETED') return res.json({ success: true, already_done: true });
        if (session.status === 'ABANDONED') return res.status(400).json({ success: false, error: 'Session window has expired.' });
        if (new Date() > session.window_closes_at) {
            await prisma.mocksessions.update({ where: { id: session_id }, data: { status: 'ABANDONED' as any } });
            return res.status(400).json({ success: false, error: 'Mock window has closed.' });
        }

        // ── 2. Load questions + strip __meta from answers ─────────────────────
        const questionIdsConfig = session.question_ids as Array<{ skill: string; ids: string[] }>;
        const allIds = questionIdsConfig.flatMap(c => c.ids);
        const questions = await prisma.mockquestions.findMany({
            where:  { id: { in: allIds } },
            select: { id: true, skill: true, sub_skill: true, question_type: true, correct_answer: true, prompt_text: true }
        });
        const answers = Object.fromEntries(
            Object.entries((session.answers ?? {}) as Record<string, unknown>)
                .filter(([k]) => k !== '__meta')
        ) as Record<string, string>;

        // ── 3. Launch all AI grading jobs in parallel (WRITING + SPEAKING prompts) ──
        type AIJob = { sectionIdx: number; band: number; rationale: string; key_observations: string[] };
        const aiJobs: Promise<AIJob>[] = [];

        for (let i = 0; i < questionIdsConfig.length; i++) {
            const cfg   = questionIdsConfig[i];
            const subQs = questions.filter(q => cfg.ids.includes(q.id));
            const aiQs  = subQs.filter(q => q.question_type === 'WRITING_PROMPT' || q.question_type === 'SPEAKING_PROMPT');
            for (const q of aiQs) {
                const rawText = (answers[q.id] ?? '').trim();
                const text    = rawText === '[no transcript]' ? '' : rawText;
                const subSkill = String(q.sub_skill ?? (cfg.skill === 'WRITING' ? 'TASK_RESPONSE' : 'FLUENCY'));
                aiJobs.push((async (): Promise<AIJob> => {
                    const result = q.question_type === 'WRITING_PROMPT'
                        ? await gradeIAWritingPrompt(subSkill, q.prompt_text, text)
                        : await gradeIASpeakingPrompt(subSkill, q.prompt_text, text);
                    return { sectionIdx: i, band: result.band, rationale: result.rationale, key_observations: result.key_observations };
                })());
            }
        }
        const aiResults = await Promise.all(aiJobs);
        const aiBands   = new Map<number, number[]>();
        for (const j of aiResults) {
            const arr = aiBands.get(j.sectionIdx) ?? [];
            arr.push(j.band);
            aiBands.set(j.sectionIdx, arr);
        }

        // ── 4. Score each skill section ────────────────────────────────────────
        const skillScores: MockSkillScore[] = [];
        for (let i = 0; i < questionIdsConfig.length; i++) {
            const cfg   = questionIdsConfig[i];
            const subQs = questions.filter(q => cfg.ids.includes(q.id));
            const mcqQs = subQs.filter(q => q.question_type === 'MCQ' || q.question_type === 'TFNG');
            const aiQs  = subQs.filter(q => q.question_type === 'WRITING_PROMPT' || q.question_type === 'SPEAKING_PROMPT');

            let correct = 0;
            for (const q of mcqQs) {
                const sa = (answers[q.id] ?? '').trim().toUpperCase();
                let   ca = '';
                if (q.correct_answer !== null && q.correct_answer !== undefined) {
                    ca = String(q.correct_answer).trim().toUpperCase().replace(/^["']|["']$/g, '');
                }
                if (sa && ca && sa === ca) correct++;
            }

            const mcqBand  = mcqQs.length > 0 ? Math.max(1, Math.min(10, (correct / mcqQs.length) * 10)) : null;
            const aiBands_ = aiBands.get(i) ?? [];
            const aiAvg    = aiBands_.length > 0 ? aiBands_.reduce((a, b) => a + b, 0) / aiBands_.length : null;

            let combinedScore: number;
            if (mcqBand === null && aiAvg === null) combinedScore = 1;
            else if (mcqBand === null) combinedScore = aiAvg!;
            else if (aiAvg  === null) combinedScore = mcqBand;
            else {
                const mw = mcqQs.length * 1;
                const aw = aiQs.length  * 2;
                combinedScore = (mcqBand * mw + aiAvg * aw) / (mw + aw);
            }

            // Scale from 1-10 to 0-9 IELTS, nearest 0.5
            const ieltsRaw = combinedScore - 1;
            const band = Math.min(9.0, Math.max(0.0, Math.round(ieltsRaw * 2) / 2));

            skillScores.push({ skill: cfg.skill, band, correct, total: mcqQs.length, ai_graded: aiQs.length > 0 });
        }

        // ── 5. Pre-fetch data needed for formula + display ─────────────────────
        const [competencyPre, diagnosticHistory] = await Promise.all([
            prisma.studentCompetencyMatrix.findMany({
                where:  { student_id: student.id },
                select: { skill: true, band_score: true }
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
            const skill = String(h.skill);
            if (!diagnosticBands.has(skill)) diagnosticBands.set(skill, parseFloat(String(h.band_score)) || 0);
        }

        // ── 6. Apply scoring formula: Mock×0.60 + CurrentMatrix×0.40 ──────────
        const skillScoresResponse: MockSkillScoreResponse[] = skillScores.map(s => {
            const prevBand = prevMatrixBands.get(s.skill) ?? null;
            const diagBand = diagnosticBands.get(s.skill) ?? null;

            let newBand: number;
            if (prevBand === null) {
                newBand = s.band; // first time — use mock score directly
            } else {
                newBand = s.band * 0.60 + prevBand * 0.40;
                newBand = Math.min(9, Math.max(0, Math.round(newBand * 2) / 2));
            }

            const deltaFromDiag = diagBand !== null ? Math.round((newBand - diagBand) * 10) / 10 : null;
            return { ...s, new_matrix_band: newBand, prev_matrix_band: prevBand, diagnostic_band: diagBand, delta_from_diag: deltaFromDiag };
        });

        // ── 7. Overall Real Band ───────────────────────────────────────────────
        const newBands      = skillScoresResponse.map(s => s.new_matrix_band);
        const realBandRaw   = newBands.reduce((a, b) => a + b, 0) / newBands.length;
        const realBandScore = Math.min(9, Math.max(0, Math.round(realBandRaw * 2) / 2));

        const prevAllBands  = [...prevMatrixBands.values()];
        const prevOverall   = prevAllBands.length > 0
            ? Math.round((prevAllBands.reduce((a, b) => a + b, 0) / prevAllBands.length) * 2) / 2
            : 0;
        const thresholdCrossed = Math.floor(realBandScore / 0.5) > Math.floor(prevOverall / 0.5);

        // ── 8. Momentum ────────────────────────────────────────────────────────
        const momentumBreakdown = [{ reason: 'Participation', points: 200 }];
        let momentumAwarded = 200;
        if (thresholdCrossed) {
            momentumAwarded += 500;
            momentumBreakdown.push({ reason: `New band threshold — crossed ${realBandScore.toFixed(1)}`, points: 500 });
        }

        // ── 9. DB transaction ──────────────────────────────────────────────────
        const updatedMomentum = await prisma.$transaction(async (tx) => {
            // a) Mark session completed
            await tx.mocksessions.update({
                where: { id: session_id },
                data:  {
                    status:            'COMPLETED' as any,
                    scores:            skillScores as any,
                    real_band_score:   realBandScore,
                    momentum_awarded:  momentumAwarded,
                    time_submitted_at: new Date()
                }
            });

            // b) AssessmentHistory per skill (mode = MOCK)
            for (const s of skillScoresResponse) {
                await tx.assessmentHistory.create({
                    data: {
                        student_id: student.id,
                        skill:      s.skill as any,
                        mode:       'MOCK' as any,
                        band_score: s.new_matrix_band,
                    }
                });
            }

            // c) CompetencyMatrix: update band_score per skill (Mock formula)
            for (const s of skillScoresResponse) {
                await tx.studentCompetencyMatrix.upsert({
                    where:  { student_id_skill: { student_id: student.id, skill: s.skill as any } },
                    update: { band_score: s.new_matrix_band, assessments_count: { increment: 1 }, last_updated: new Date() },
                    create: { student_id: student.id, skill: s.skill as any, band_score: s.new_matrix_band, assessments_count: 1 }
                });
            }

            // d) Momentum
            const updated = await tx.institute_students.update({
                where:  { id: student.id },
                data:   { momentum_score: { increment: momentumAwarded } },
                select: { momentum_score: true }
            });
            return updated.momentum_score;
        });

        return res.json({
            success:              true,
            real_band_score:      realBandScore,
            prev_real_band:       prevOverall,
            real_band_delta:      Math.round((realBandScore - prevOverall) * 10) / 10,
            threshold_crossed:    thresholdCrossed,
            momentum_awarded:     momentumAwarded,
            momentum_breakdown:   momentumBreakdown,
            updated_momentum:     updatedMomentum,
            skill_scores:         skillScoresResponse,
        });
    } catch (err) {
        console.error('[MockSubmit] error:', err);
        return res.status(500).json({ success: false, error: 'Internal server error.' });
    }
}
