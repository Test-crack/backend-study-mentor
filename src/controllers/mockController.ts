import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import prisma from '../lib/prisma';
import { gradeIAWritingPrompt, gradeIASpeakingPrompt, AIGradingError } from '../lib/iaGrading';
import { applySmoothing } from '../lib/iaProcessor';
import { BAND_MIN, toBand, internalToBand } from '../lib/bandScale';
import { scoreComponent, scoreOverall, provenance } from '../exam-engine';
import { paramStr } from '../utils/httpParams';

// â”€â”€â”€ Constants â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

const MOCK_IA_THRESHOLD     = 6;
const MOCK_EARNED_COST      = 1500;
const MOCK_EARNED_MIN_IAS   = 4;
const MOCK_EARNED_MIN_DAYS  = 14;
const MOCK_BAND_IMPROVEMENT = 0.5;
const MOCK_WINDOW_MS        = 24 * 60 * 60 * 1000;  // 24h reattempt window
const IST_OFFSET_MS         = 5.5 * 60 * 60 * 1000;

// Per-section durations in ms
const SECTION_DURATIONS_MS: Record<string, number> = {
    LISTENING: 30 * 60 * 1000,
    READING:   60 * 60 * 1000,
    WRITING:   60 * 60 * 1000,
    SPEAKING:  15 * 60 * 1000,
};

// Question counts per section
const MOCK_Q_LISTENING = 20;
const MOCK_Q_READING   = 20;
const MOCK_Q_WS_MCQ    = 4;
const MOCK_Q_WS_PROMPT = 1;

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

// â”€â”€â”€ IST helpers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

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

// â”€â”€â”€ Shared helpers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

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
    return internalToBand(score1to10);
}

async function fetchMockSectionQuestions(skill: string, examId: string): Promise<{
    section_type: string;
    audio_url:    string | null;
    passage_text: string | null;
    passage_id:   string | null;
    questions:    any[];
}> {
    // exam_id scopes the question pool to the student's exam (A3) — zero-change for IELTS.
    const base = { skill, is_active: true, exam_id: examId } as any;

    if (skill === 'LISTENING') {
        const pool = await prisma.mockQuestion.findMany({
            where:  { ...base, audio_url: { not: null } },
            select: { id: true, sub_skill: true, audio_url: true, question_type: true, prompt_text: true, options: true }
        });
        if (pool.length === 0) return { section_type: 'AUDIO', audio_url: null, passage_text: null, passage_id: null, questions: [] };
        const groups = [...new Set(pool.map(q => q.audio_url!))];
        const chosen = groups[Math.floor(Math.random() * groups.length)];
        const qs     = shuffle(pool.filter(q => q.audio_url === chosen)).slice(0, MOCK_Q_LISTENING);
        return { section_type: 'AUDIO', audio_url: chosen, passage_text: null, passage_id: null, questions: qs };
    }

    if (skill === 'READING') {
        const pool = await prisma.mockQuestion.findMany({
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

    const subSkills   = skill === 'WRITING' ? WRITING_SUB_SKILLS : SPEAKING_SUB_SKILLS;
    const promptType  = skill === 'WRITING' ? 'WRITING_PROMPT' : 'SPEAKING_PROMPT';

    const subSkillData = await Promise.all(subSkills.map(async ss => {
        const [mcqs, prompts] = await Promise.all([
            prisma.mockQuestion.findMany({
                where:  { skill: skill as any, sub_skill: ss as any, question_type: 'MCQ', is_active: true, exam_id: examId },
                select: { id: true, sub_skill: true, question_type: true, prompt_text: true, options: true }
            }),
            prisma.mockQuestion.findMany({
                where:  { skill: skill as any, sub_skill: ss as any, question_type: promptType, is_active: true, exam_id: examId },
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

// â”€â”€â”€ Eligibility â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

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
        reasons.push({ key: 'band_improvement', message: `Improve any skill band â‰¥ ${MOCK_BAND_IMPROVEMENT} from diagnostic (best so far: +${bestImprovement.toFixed(1)})` });

    return { isEligible: reasons.length === 0, reasons, totalIAs, skillsCovered, bandImproved, bestImprovement, improvedSkill, diagnosticBands, currentBands };
}

// â”€â”€â”€ Section helpers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

/**
 * For a session, mark any IN_PROGRESS section rows whose expires_at has passed as EXPIRED.
 * Returns the updated set of section rows.
 */
async function lazySweepSectionExpiry(sessionId: string) {
    const now = new Date();
    await prisma.mockSectionAttempt.updateMany({
        where: { session_id: sessionId, status: 'IN_PROGRESS' as any, expires_at: { lt: now } },
        data:  { status: 'EXPIRED' as any }
    });
    return prisma.mockSectionAttempt.findMany({
        where:   { session_id: sessionId },
        orderBy: { created_at: 'asc' }
    });
}

function sectionIsTerminal(status: string) {
    return status === 'SUBMITTED' || status === 'EXPIRED';
}

// â”€â”€â”€ GET /api/mock/status â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export async function getMockStatus(req: AuthRequest, res: Response) {
    try {
        const appUserId = (req as any).appUserId as string;
        if (!appUserId) return res.status(401).json({ success: false, error: 'Unauthorized.' });

        const student = await prisma.instituteStudent.findUnique({ where: { user_id: appUserId } });
        if (!student) return res.status(404).json({ success: false, error: 'Student not found.' });

        // â”€â”€ Expiry sweep: sessions whose 24h window has closed â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
        const expiredSessions = await prisma.mockSession.findMany({
            where: { student_id: student.id, window_closes_at: { lt: new Date() }, status: { in: ['PENDING', 'IN_PROGRESS'] as any } },
            select: { id: true, answers: true, question_ids: true }
        });
        for (const exp of expiredSessions) {
            // Mark any lingering IN_PROGRESS sections as EXPIRED
            await prisma.mockSectionAttempt.updateMany({
                where: { session_id: exp.id, status: { in: ['IN_PROGRESS', 'NOT_STARTED'] as any } },
                data:  { status: 'EXPIRED' as any }
            });

            // Aggregate answers from section rows; fall back to session.answers for legacy rows
            const sectionRows = await prisma.mockSectionAttempt.findMany({ where: { session_id: exp.id } });
            let aggregatedAnswers: Record<string, string>;
            if (sectionRows.length > 0) {
                aggregatedAnswers = {};
                for (const row of sectionRows) {
                    Object.assign(aggregatedAnswers, row.answers as Record<string, string>);
                }
            } else {
                const raw = (exp.answers ?? {}) as Record<string, unknown>;
                aggregatedAnswers = Object.fromEntries(
                    Object.entries(raw).filter(([k, v]) => k !== '__meta' && String(v ?? '').trim() !== '')
                ) as Record<string, string>;
            }

            const hasRealAnswers = Object.values(aggregatedAnswers).some(v => {
                const t = String(v ?? '').trim();
                return t !== '' && t !== '[no transcript]';
            });

            if (hasRealAnswers) {
                try {
                    const full = await prisma.mockSession.findUnique({ where: { id: exp.id } });
                    if (full && (full.status === 'PENDING' || full.status === 'IN_PROGRESS')) {
                        await processMockSession(full, student, aggregatedAnswers);
                    }
                } catch (e: any) {
                    if (e instanceof MockAlreadyCompletedError) { /* concurrent */ }
                    else if (e instanceof AIGradingError) {
                        console.warn(`[Mock] auto-grade unavailable for ${exp.id}; will retry.`);
                    } else {
                        console.error(`[Mock] auto-grade failed for ${exp.id}:`, e);
                        await prisma.mockSession.updateMany({
                            where: { id: exp.id, status: { in: ['PENDING', 'IN_PROGRESS'] as any } },
                            data:  { status: 'ABANDONED' as any }
                        });
                    }
                }
            } else {
                await prisma.mockSession.updateMany({
                    where: { id: exp.id, status: { in: ['PENDING', 'IN_PROGRESS'] as any } },
                    data:  { status: 'ABANDONED' as any }
                });
            }
        }

        const eligibility = await checkEligibility(student.id);
        const monthYear   = currentMonthYear();

        const thisMonthSessions = await prisma.mockSession.findMany({
            where:  { student_id: student.id, month_year: monthYear },
            select: { id: true, attempt_type: true, status: true }
        });

        const standardSession = thisMonthSessions.find(s => s.attempt_type === 'STANDARD');
        const earnedSession   = thisMonthSessions.find(s => s.attempt_type === 'EARNED');
        const activeSession   = await prisma.mockSession.findFirst({
            where:  { student_id: student.id, status: { in: ['IN_PROGRESS', 'PENDING'] as any } },
            select: { id: true, status: true }
        });

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
            abandoned_count:           expiredSessions.length,
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

// â”€â”€â”€ GET /api/mock/questions â€” create or resume session, return overview â”€â”€â”€â”€â”€â”€
// Returns section statuses only; questions are fetched per-section via startMockSection.

export async function getMockQuestions(req: AuthRequest, res: Response) {
    try {
        const appUserId = (req as any).appUserId as string;
        if (!appUserId) return res.status(401).json({ success: false, error: 'Unauthorized.' });

        const student = await prisma.instituteStudent.findUnique({ where: { user_id: appUserId } });
        if (!student) return res.status(404).json({ success: false, error: 'Student not found.' });

        const attemptType = (req.query.attempt_type as string ?? 'STANDARD').toUpperCase() as 'STANDARD' | 'EARNED';
        const monthYear   = currentMonthYear();

        // â”€â”€ 1. Resume any active session â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
        const activeSession = await prisma.mockSession.findFirst({
            where: { student_id: student.id, status: { in: ['PENDING', 'IN_PROGRESS'] as any } }
        });

        if (activeSession) {
            // Lazy expiry sweep for sections
            const sections = await lazySweepSectionExpiry(activeSession.id);
            if (activeSession.status === 'PENDING') {
                await prisma.mockSession.update({
                    where: { id: activeSession.id },
                    data:  { status: 'IN_PROGRESS' as any, time_started_at: new Date() }
                });
            }
            return res.json({
                success:          true,
                session_id:       activeSession.id,
                resume:           true,
                attempt_type:     activeSession.attempt_type,
                window_closes_at: activeSession.window_closes_at.toISOString(),
                sections:         sections.map(s => ({
                    section:      s.section,
                    status:       s.status,
                    started_at:   s.started_at?.toISOString() ?? null,
                    expires_at:   s.expires_at?.toISOString() ?? null,
                    submitted_at: s.submitted_at?.toISOString() ?? null,
                }))
            });
        }

        // â”€â”€ 2. Validate eligibility â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
        const eligibility = await checkEligibility(student.id);
        if (!eligibility.isEligible) return res.status(403).json({ success: false, error: 'Not eligible for mock test.', reasons: eligibility.reasons });

        // â”€â”€ 3. Check monthly slot â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
        const existingSlot = await prisma.mockSession.findFirst({
            where: { student_id: student.id, month_year: monthYear, attempt_type: attemptType as any }
        });
        if (existingSlot) {
            const msg = existingSlot.status === 'ABANDONED'
                ? `Your ${attemptType.toLowerCase()} mock session expired. This month's slot is consumed.`
                : `${attemptType} mock already used this month.`;
            return res.status(409).json({ success: false, error: msg, slot_status: existingSlot.status });
        }

        // â”€â”€ 4. Earned: pre-validate (soft checks; balance enforced inside transaction) â”€â”€
        if (attemptType === 'EARNED') {
            const days = Math.floor((Date.now() - student.created_at.getTime()) / 86_400_000);
            if (eligibility.totalIAs < MOCK_EARNED_MIN_IAS) return res.status(403).json({ success: false, error: `Need ${MOCK_EARNED_MIN_IAS} IAs.` });
            if (days < MOCK_EARNED_MIN_DAYS)                 return res.status(403).json({ success: false, error: `Need ${MOCK_EARNED_MIN_DAYS} days on platform.` });
            // Balance check is re-validated atomically inside the transaction (prevents double-spend)
            if (student.momentum_score < MOCK_EARNED_COST)  return res.status(403).json({ success: false, error: `Need ${MOCK_EARNED_COST} momentum.` });
        }

        // â”€â”€ 5. Pre-fetch all 4 sections' question pools (validate before creating session) â”€â”€
        const [rawL, rawR, rawW, rawS] = await Promise.all([
            fetchMockSectionQuestions('LISTENING', student.exam_id),
            fetchMockSectionQuestions('READING', student.exam_id),
            fetchMockSectionQuestions('WRITING', student.exam_id),
            fetchMockSectionQuestions('SPEAKING', student.exam_id),
        ]);
        const rawSections = [rawL, rawR, rawW, rawS];
        const emptySections = MOCK_SKILL_ORDER.filter((_, i) => (rawSections[i]?.questions?.length ?? 0) === 0);
        if (emptySections.length > 0) {
            console.error(`[MockQuestions] Missing question pool for: ${emptySections.join(', ')}`);
            return res.status(503).json({
                success: false,
                error:   'The mock test is temporarily unavailable (question set incomplete). Please try again later.',
            });
        }

        const questionIdsConfig = MOCK_SKILL_ORDER.map((skill, i) => ({
            skill,
            ids: rawSections[i].questions.map((q: any) => q.id)
        }));

        const now            = Date.now();
        const windowClosesAt = new Date(now + MOCK_WINDOW_MS);

        // â”€â”€ 6. Create session + 4 NOT_STARTED section rows â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
        const session = await prisma.$transaction(async (tx) => {
            if (attemptType === 'EARNED') {
                // Re-read balance inside transaction to prevent double-spend on concurrent clicks
                const freshStudent = await tx.instituteStudent.findUnique({ where: { id: student.id }, select: { momentum_score: true } });
                if (!freshStudent || freshStudent.momentum_score < MOCK_EARNED_COST) {
                    throw Object.assign(new Error('Insufficient momentum'), { code: 'INSUFFICIENT_MOMENTUM' });
                }
                await tx.instituteStudent.update({ where: { id: student.id }, data: { momentum_score: { decrement: MOCK_EARNED_COST } } });
            }
            const newSession = await tx.mockSession.create({
                data: {
                    student_id:       student.id,
                    attempt_type:     attemptType as any,
                    month_year:       monthYear,
                    status:           'IN_PROGRESS' as any,
                    question_ids:     questionIdsConfig as any,
                    answers:          {} as any,
                    time_started_at:  new Date(now),
                    window_closes_at: windowClosesAt,
                }
            });
            await tx.mockSectionAttempt.createMany({
                data: MOCK_SKILL_ORDER.map(skill => ({
                    session_id: newSession.id,
                    section:    skill,
                    status:     'NOT_STARTED' as any,
                    answers:    {} as any,
                }))
            });
            return newSession;
        });

        return res.json({
            success:          true,
            session_id:       session.id,
            resume:           false,
            attempt_type:     attemptType,
            window_closes_at: windowClosesAt.toISOString(),
            sections: MOCK_SKILL_ORDER.map(skill => ({
                section:      skill,
                status:       'NOT_STARTED',
                started_at:   null,
                expires_at:   null,
                submitted_at: null,
            }))
        });

    } catch (err: any) {
        if (err?.code === 'P2002') {
            return res.status(409).json({ success: false, error: 'A mock for this slot already exists this month.' });
        }
        if (err?.code === 'INSUFFICIENT_MOMENTUM') {
            return res.status(403).json({ success: false, error: `Need ${MOCK_EARNED_COST} momentum.` });
        }
        console.error('[MockQuestions] error:', err);
        return res.status(500).json({ success: false, error: 'Internal server error.' });
    }
}

// â”€â”€â”€ GET /api/mock/session/:sessionId â€” lazy expiry + section state â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export async function getSessionState(req: AuthRequest, res: Response) {
    try {
        const appUserId = (req as any).appUserId as string;
        if (!appUserId) return res.status(401).json({ success: false, error: 'Unauthorized.' });

        const student = await prisma.instituteStudent.findUnique({ where: { user_id: appUserId } });
        if (!student) return res.status(404).json({ success: false, error: 'Student not found.' });

        const sessionId = paramStr(req.params.sessionId);
        const session = await prisma.mockSession.findUnique({ where: { id: sessionId } });
        if (!session || session.student_id !== student.id) return res.status(404).json({ success: false, error: 'Session not found.' });

        const sections = await lazySweepSectionExpiry(sessionId);

        return res.json({
            success:          true,
            session_id:       session.id,
            status:           session.status,
            attempt_type:     session.attempt_type,
            window_closes_at: session.window_closes_at.toISOString(),
            sections: sections.map(s => ({
                section:      s.section,
                status:       s.status,
                started_at:   s.started_at?.toISOString() ?? null,
                expires_at:   s.expires_at?.toISOString() ?? null,
                submitted_at: s.submitted_at?.toISOString() ?? null,
            }))
        });
    } catch (err) {
        console.error('[GetSessionState] error:', err);
        return res.status(500).json({ success: false, error: 'Internal server error.' });
    }
}

// â”€â”€â”€ POST /api/mock/sections/start â€” start a section, return its questions â”€â”€â”€â”€

export async function startMockSection(req: AuthRequest, res: Response) {
    try {
        const appUserId = (req as any).appUserId as string;
        if (!appUserId) return res.status(401).json({ success: false, error: 'Unauthorized.' });

        const student = await prisma.instituteStudent.findUnique({ where: { user_id: appUserId } });
        if (!student) return res.status(404).json({ success: false, error: 'Student not found.' });

        const { session_id, section } = req.body;
        if (!session_id || !section) return res.status(400).json({ success: false, error: 'session_id and section are required.' });

        const sectionUpper = String(section).toUpperCase();
        if (!MOCK_SKILL_ORDER.includes(sectionUpper as any)) return res.status(400).json({ success: false, error: 'Invalid section.' });

        const session = await prisma.mockSession.findUnique({ where: { id: session_id } });
        if (!session || session.student_id !== student.id) return res.status(404).json({ success: false, error: 'Session not found.' });
        if (session.status === 'COMPLETED' || session.status === 'ABANDONED') return res.status(400).json({ success: false, error: 'Session already finalised.' });
        if (new Date() > session.window_closes_at) return res.status(400).json({ success: false, error: 'Mock window has closed.' });

        // Lazy expiry check for this specific section
        const sectionRow = await prisma.mockSectionAttempt.findUnique({
            where: { session_id_section: { session_id, section: sectionUpper } }
        });
        if (!sectionRow) return res.status(404).json({ success: false, error: 'Section row not found.' });

        // Auto-expire if timer ran out
        if (sectionRow.status === 'IN_PROGRESS' && sectionRow.expires_at && new Date() > sectionRow.expires_at) {
            await prisma.mockSectionAttempt.update({
                where: { id: sectionRow.id },
                data:  { status: 'EXPIRED' as any }
            });
            return res.status(400).json({ success: false, error: 'Section timer has expired.', status: 'EXPIRED' });
        }
        if (sectionRow.status === 'SUBMITTED') return res.status(400).json({ success: false, error: 'Section already submitted.', status: 'SUBMITTED' });
        if (sectionRow.status === 'EXPIRED')   return res.status(400).json({ success: false, error: 'Section timer has expired.', status: 'EXPIRED' });

        const isResume = sectionRow.status === 'IN_PROGRESS';
        const durationMs = SECTION_DURATIONS_MS[sectionUpper] ?? 30 * 60 * 1000;

        let startedAt   = sectionRow.started_at;
        let expiresAt   = sectionRow.expires_at;

        if (!isResume) {
            // First start: stamp the timer
            startedAt = new Date();
            expiresAt = new Date(startedAt.getTime() + durationMs);
            await prisma.mockSectionAttempt.update({
                where: { id: sectionRow.id },
                data:  { status: 'IN_PROGRESS' as any, started_at: startedAt, expires_at: expiresAt }
            });
        }

        // Load questions from the session's saved config
        const questionIdsConfig = session.question_ids as Array<{ skill: string; ids: string[] }>;
        const cfg = questionIdsConfig.find(c => c.skill === sectionUpper);
        if (!cfg) return res.status(500).json({ success: false, error: 'Question config missing.' });

        const questionRows = await prisma.mockQuestion.findMany({
            where:  { id: { in: cfg.ids } },
            select: { id: true, skill: true, sub_skill: true, question_type: true, prompt_text: true, options: true, audio_url: true, passage_id: true, passage_text: true }
        });
        const questions   = sanitize(cfg.ids.map(id => questionRows.find(q => q.id === id)).filter(Boolean));
        const audioUrl    = questionRows.find(q => cfg.ids.includes(q.id) && q.audio_url)?.audio_url ?? null;
        const passageId   = questionRows.find(q => cfg.ids.includes(q.id) && q.passage_id)?.passage_id ?? null;
        const passageTxt  = questionRows.find(q => cfg.ids.includes(q.id) && q.passage_text)?.passage_text ?? null;
        const sectionType = audioUrl ? 'AUDIO' : passageId ? 'PASSAGE' : 'MCQ_MIX';

        const savedAnswers = (sectionRow.answers ?? {}) as Record<string, string>;

        return res.json({
            success:       true,
            section:       sectionUpper,
            status:        'IN_PROGRESS',
            resumed:       isResume,
            started_at:    startedAt!.toISOString(),
            expires_at:    expiresAt!.toISOString(),
            duration_ms:   durationMs,
            section_type:  sectionType,
            audio_url:     audioUrl,
            passage_text:  passageTxt,
            passage_id:    passageId,
            questions,
            saved_answers: savedAnswers,
        });
    } catch (err) {
        console.error('[StartMockSection] error:', err);
        return res.status(500).json({ success: false, error: 'Internal server error.' });
    }
}

// â”€â”€â”€ POST /api/mock/answer â€” save answer to section row â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export async function saveMockAnswer(req: AuthRequest, res: Response) {
    try {
        const appUserId = (req as any).appUserId as string;
        if (!appUserId) return res.status(401).json({ success: false, error: 'Unauthorized.' });

        const student = await prisma.instituteStudent.findUnique({ where: { user_id: appUserId } });
        if (!student) return res.status(404).json({ success: false, error: 'Student not found.' });

        const { session_id, section, question_id, answer } = req.body;
        if (!session_id || !section) return res.status(400).json({ success: false, error: 'session_id and section are required.' });

        const sectionUpper = String(section).toUpperCase();

        const session = await prisma.mockSession.findUnique({ where: { id: session_id } });
        if (!session || session.student_id !== student.id) return res.status(404).json({ success: false, error: 'Session not found.' });
        if (session.status === 'COMPLETED' || session.status === 'ABANDONED') return res.status(400).json({ success: false, error: 'Session already finalised.' });
        if (new Date() > session.window_closes_at) return res.status(400).json({ success: false, error: 'Mock window expired.' });

        if (!question_id || answer === undefined) return res.status(400).json({ success: false, error: 'question_id and answer are required.' });
        if (typeof answer !== 'string' && typeof answer !== 'number') return res.status(400).json({ success: false, error: 'answer must be a string or number.' });

        // Validate question belongs to this session+section
        const sectionConfig = (session.question_ids as Array<{ skill: string; ids: string[] }>)
            .find(c => c.skill === sectionUpper);
        if (!sectionConfig || !sectionConfig.ids.includes(String(question_id))) {
            return res.status(400).json({ success: false, error: 'Unknown question for this session/section.' });
        }

        // Guard: reject writes to locked or expired sections
        const sectionRow = await prisma.mockSectionAttempt.findUnique({
            where: { session_id_section: { session_id, section: sectionUpper } }
        });
        if (!sectionRow) return res.status(404).json({ success: false, error: 'Section row not found.' });
        if (String(sectionRow.status) === 'SUBMITTED' || String(sectionRow.status) === 'EXPIRED') {
            return res.status(400).json({ success: false, error: 'Section is already locked.' });
        }
        // Inline timer expiry check (lazy sweep may not have run)
        if (String(sectionRow.status) === 'IN_PROGRESS' && sectionRow.expires_at && new Date() > sectionRow.expires_at) {
            await prisma.mockSectionAttempt.update({ where: { id: sectionRow.id }, data: { status: 'EXPIRED' as any } });
            return res.status(400).json({ success: false, error: 'Section timer has expired.' });
        }

        // Atomic JSONB merge on section row
        await prisma.$executeRaw`
            UPDATE mock_section_attempts
            SET answers = COALESCE(answers, '{}'::jsonb) || jsonb_build_object(${String(question_id)}::text, ${String(answer)}::text)
            WHERE session_id = ${session_id}::uuid AND section = ${sectionUpper}
        `;
        return res.json({ success: true, saved: true });
    } catch (err) {
        console.error('[MockAnswer] error:', err);
        return res.status(500).json({ success: false, error: 'Internal server error.' });
    }
}

// â”€â”€â”€ POST /api/mock/submit â€” submit one section; grade when all sections done â”€â”€

export async function submitMock(req: AuthRequest, res: Response) {
    try {
        const appUserId = (req as any).appUserId as string;
        if (!appUserId) return res.status(401).json({ success: false, error: 'Unauthorized.' });

        const student = await prisma.instituteStudent.findUnique({ where: { user_id: appUserId } });
        if (!student) return res.status(404).json({ success: false, error: 'Student not found.' });

        const { session_id, section } = req.body;
        if (!session_id || !section) return res.status(400).json({ success: false, error: 'session_id and section are required.' });

        const sectionUpper = String(section).toUpperCase();

        const session = await prisma.mockSession.findUnique({ where: { id: session_id } });
        if (!session)                            return res.status(404).json({ success: false, error: 'Session not found.' });
        if (session.student_id !== student.id)   return res.status(403).json({ success: false, error: 'Forbidden.' });
        if (session.status === 'COMPLETED')      return res.json({ success: true, already_done: true, real_band_score: session.real_band_score != null ? Number(session.real_band_score) : null, scores: session.scores, momentum_awarded: session.momentum_awarded });
        if (session.status === 'ABANDONED')      return res.status(400).json({ success: false, error: 'Session window has expired.' });

        const sectionRow = await prisma.mockSectionAttempt.findUnique({
            where: { session_id_section: { session_id, section: sectionUpper } }
        });
        if (!sectionRow) return res.status(404).json({ success: false, error: 'Section not found.' });
        if (String(sectionRow.status) === 'NOT_STARTED') return res.status(400).json({ success: false, error: 'Section has not been started yet.' });
        if (sectionRow.status === 'SUBMITTED') {
            // Already submitted â€” idempotent, check if all done
        } else {
            // Mark section as SUBMITTED (allow slight grace past expires_at)
            await prisma.mockSectionAttempt.update({
                where: { id: sectionRow.id },
                data:  { status: 'SUBMITTED' as any, submitted_at: new Date() }
            });
        }

        // Check if all sections are terminal (SUBMITTED or EXPIRED)
        const allSections = await prisma.mockSectionAttempt.findMany({ where: { session_id } });
        const allTerminal = allSections.every(s => sectionIsTerminal(String(s.status)));

        if (!allTerminal) {
            // More sections remain â€” return dashboard update
            return res.json({
                success:              true,
                section_submitted:    true,
                all_sections_complete: false,
                sections: allSections.map(s => ({
                    section:      s.section,
                    status:       s.status,
                    started_at:   s.started_at?.toISOString() ?? null,
                    expires_at:   s.expires_at?.toISOString() ?? null,
                    submitted_at: s.submitted_at?.toISOString() ?? null,
                }))
            });
        }

        // All sections done â†’ grade the whole test
        const aggregatedAnswers: Record<string, string> = {};
        for (const row of allSections) {
            Object.assign(aggregatedAnswers, row.answers as Record<string, string>);
        }

        const result = await processMockSession(session, student, aggregatedAnswers);
        return res.json({ success: true, all_sections_complete: true, ...result });
    } catch (err) {
        if (err instanceof MockAlreadyCompletedError) {
            const s = await prisma.mockSession.findUnique({ where: { id: req.body?.session_id } });
            return res.json({ success: true, already_done: true, all_sections_complete: true, real_band_score: s?.real_band_score != null ? Number(s.real_band_score) : null, scores: s?.scores ?? null, momentum_awarded: s?.momentum_awarded ?? 0 });
        }
        if (err instanceof AIGradingError) {
            return res.status(502).json({ success: false, can_retry: true, error: 'AI grading is temporarily unavailable. Your answers are saved â€” please submit again in a moment.' });
        }
        console.error('[MockSubmit] error:', err);
        return res.status(500).json({ success: false, error: 'Internal server error.' });
    }
}

// â”€â”€â”€ Scoring engine (shared by submitMock and expiry auto-grade sweep) â”€â”€â”€â”€â”€â”€â”€â”€

type MockSubSkillScore = {
    sub_skill:  string;
    band:       number;
    correct:    number;
    total_mcq:  number;
    ai_band:    number | null;
    ai_feedback?: { rationale: string; key_observations: string[] };
};

type MockSkillScore = {
    skill:             string;
    band:              number;
    correct:           number;
    total:             number;
    ai_graded:         boolean;
    sub_skill_scores?: MockSubSkillScore[];
};

type MockSkillScoreResponse = MockSkillScore & {
    new_matrix_band:  number;
    diagnostic_band:  number | null;
    delta_from_diag:  number | null;
    prev_matrix_band: number | null;
};

class MockAlreadyCompletedError extends Error {}

async function processMockSession(
    session: any,
    student: { id: string },
    aggregatedAnswers?: Record<string, string>
) {
    const questionIdsConfig = session.question_ids as Array<{ skill: string; ids: string[] }>;
    const allIds = questionIdsConfig.flatMap(c => c.ids);
    const questions = await prisma.mockQuestion.findMany({
        where:  { id: { in: allIds } },
        select: { id: true, skill: true, sub_skill: true, question_type: true, correct_answer: true, prompt_text: true }
    });

    // Resolve answers: provided directly (new model) or from session (legacy)
    let answers: Record<string, string>;
    if (aggregatedAnswers) {
        answers = aggregatedAnswers;
    } else {
        // Legacy: answers on session row (pre-section-model sessions)
        answers = Object.fromEntries(
            Object.entries((session.answers ?? {}) as Record<string, unknown>).filter(([k]) => k !== '__meta')
        ) as Record<string, string>;
    }

    // AI grading for W/S prompts
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
            const key      = `${cfg.skill}:${subSkill}`;
            aiJobs.push((async (): Promise<AIJob> => {
                const result = q.question_type === 'WRITING_PROMPT'
                    ? await gradeIAWritingPrompt(subSkill, q.prompt_text, text)
                    : await gradeIASpeakingPrompt(subSkill, q.prompt_text, text);
                return { key, band: result.band, rationale: result.rationale, key_observations: result.key_observations };
            })());
        }
    }
    const aiResults       = await Promise.all(aiJobs);
    const aiByKey         = new Map<string, number>();
    const aiFeedbackByKey = new Map<string, { rationale: string; key_observations: string[] }>();
    for (const j of aiResults) {
        aiByKey.set(j.key, j.band);
        if (j.rationale) aiFeedbackByKey.set(j.key, { rationale: j.rationale, key_observations: j.key_observations });
    }

    // Score each skill
    const skillScores: MockSkillScore[] = [];

    for (let i = 0; i < questionIdsConfig.length; i++) {
        const cfg   = questionIdsConfig[i];
        const subQs = questions.filter(q => cfg.ids.includes(q.id));

        if (cfg.skill === 'LISTENING' || cfg.skill === 'READING') {
            const mcqQs = subQs.filter(q => q.question_type === 'MCQ' || q.question_type === 'TFNG');
            let correct = 0;
            for (const q of mcqQs) {
                const sa = (answers[q.id] ?? '').trim().toUpperCase();
                const ca = String(q.correct_answer ?? '').trim().toUpperCase().replace(/^["']|["']$/g, '');
                if (sa && ca && sa === ca) correct++;
            }
            const band = mcqQs.length > 0
                ? scoreComponent('ielts', cfg.skill.toLowerCase(), { unit: 'raw', correct, total: mcqQs.length }).value
                : BAND_MIN;
            skillScores.push({ skill: cfg.skill, band, correct, total: mcqQs.length, ai_graded: false });
        } else {
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

                const mcqScore1to10 = ssMCQ.length > 0 ? Math.min(10, 1 + (ssCorrect / ssMCQ.length) * 9) : null;
                const aiScore1to10  = aiByKey.get(`${cfg.skill}:${ss}`) ?? null;

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

            const avgBand = subSkillScores.length > 0
                ? toBand(subSkillScores.reduce((s, x) => s + x.band, 0) / subSkillScores.length)
                : BAND_MIN;

            skillScores.push({ skill: cfg.skill, band: avgBand, correct: totalCorrect, total: totalMCQ, ai_graded: true, sub_skill_scores: subSkillScores });
        }
    }

    // Pre-fetch matrix + diagnostic
    const [competencyPre, diagnosticHistory] = await Promise.all([
        prisma.studentCompetencyMatrix.findMany({ where: { student_id: student.id }, select: { skill: true, band_score: true, sub_scores: true } }),
        prisma.assessmentHistory.findMany({ where: { student_id: student.id, mode: 'DIAGNOSTIC' }, select: { skill: true, band_score: true, created_at: true }, orderBy: { created_at: 'desc' } })
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

    // Pre-compute W/S sub-skill updates
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
            const newSS = applySmoothing(curSS, ss.band);
            updatedSS[key] = newSS;
            newBands.push(newSS);
        }
        const newMatrixBand = newBands.length > 0
            ? Math.round((newBands.reduce((a, b) => a + b, 0) / newBands.length) * 2) / 2
            : s.band;
        wsUpdates.set(s.skill, { updatedSS, newMatrixBand });
    }

    // Build response + apply smoothing
    const skillScoresResponse: MockSkillScoreResponse[] = skillScores.map(s => {
        const prevBand = prevMatrixBands.get(s.skill) ?? null;
        const diagBand = diagnosticBands.get(s.skill) ?? null;
        let newMatrixBand: number;
        if (s.skill === 'WRITING' || s.skill === 'SPEAKING') {
            newMatrixBand = wsUpdates.get(s.skill)!.newMatrixBand;
        } else {
            newMatrixBand = applySmoothing(prevBand, s.band);
        }
        const deltaFromDiag = diagBand !== null ? Math.round((newMatrixBand - diagBand) * 10) / 10 : null;
        return { ...s, new_matrix_band: newMatrixBand, prev_matrix_band: prevBand, diagnostic_band: diagBand, delta_from_diag: deltaFromDiag };
    });

    // Real Band + momentum — headline via the engine (band_mean over the skill bands).
    const realBandScore = Number(
        scoreOverall('ielts', Object.fromEntries(skillScoresResponse.map(s => [s.skill, s.new_matrix_band]))).value
    );

    const prevOverall = Math.round(
        (MOCK_SKILL_ORDER.reduce((sum, sk) => sum + (prevMatrixBands.get(sk) ?? BAND_MIN), 0) / MOCK_SKILL_ORDER.length) * 2
    ) / 2;
    const thresholdCrossed = Math.floor(realBandScore / 0.5) > Math.floor(prevOverall / 0.5);

    const momentumBreakdown = [{ reason: 'Participation', points: 200 }];
    let momentumAwarded = 200;
    if (thresholdCrossed) {
        momentumAwarded += 500;
        momentumBreakdown.push({ reason: `New band threshold â€” crossed ${realBandScore.toFixed(1)}`, points: 500 });
    }

    // DB transaction
    const updatedMomentum = await prisma.$transaction(async (tx) => {
        const marked = await tx.mockSession.updateMany({
            where: { id: session.id, status: { in: ['IN_PROGRESS', 'PENDING'] as any } },
            data:  { status: 'COMPLETED' as any, scores: skillScores as any, real_band_score: realBandScore, momentum_awarded: momentumAwarded, time_submitted_at: new Date() }
        });
        if (marked.count === 0) throw new MockAlreadyCompletedError();

        for (const s of skillScoresResponse) {
            await tx.assessmentHistory.create({
                data: { student_id: student.id, skill: s.skill as any, mode: 'MOCK' as any, band_score: s.new_matrix_band, ...provenance() }
            });
            if (s.skill === 'WRITING' || s.skill === 'SPEAKING') {
                const { updatedSS } = wsUpdates.get(s.skill)!;
                await tx.studentCompetencyMatrix.upsert({
                    where:  { student_id_skill: { student_id: student.id, skill: s.skill as any } },
                    update: { band_score: s.new_matrix_band, sub_scores: updatedSS as any, assessments_count: { increment: 1 }, last_updated: new Date() },
                    create: { student_id: student.id, skill: s.skill as any, band_score: s.new_matrix_band, sub_scores: updatedSS as any, assessments_count: 1 }
                });
            } else {
                await tx.studentCompetencyMatrix.upsert({
                    where:  { student_id_skill: { student_id: student.id, skill: s.skill as any } },
                    update: { band_score: s.new_matrix_band, assessments_count: { increment: 1 }, last_updated: new Date() },
                    create: { student_id: student.id, skill: s.skill as any, band_score: s.new_matrix_band, assessments_count: 1 }
                });
            }
        }

        const updated = await tx.instituteStudent.update({
            where:  { id: student.id },
            data:   { momentum_score: { increment: momentumAwarded } },
            select: { momentum_score: true }
        });
        return updated.momentum_score;
    });

    return {
        real_band_score:    realBandScore,
        prev_real_band:     prevOverall,
        real_band_delta:    Math.round((realBandScore - prevOverall) * 10) / 10,
        threshold_crossed:  thresholdCrossed,
        momentum_awarded:   momentumAwarded,
        momentum_breakdown: momentumBreakdown,
        updated_momentum:   updatedMomentum,
        skill_scores:       skillScoresResponse,
    };
}
