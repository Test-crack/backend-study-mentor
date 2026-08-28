import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import prisma from '../lib/prisma';
import { DrillSessionStatus, SkillType, SubSkillType, RecommendationLevel } from '@prisma/client';

// Derived from Prisma enums â€” stays in sync automatically when schema changes
const VALID_SKILLS     = Object.values(SkillType) as string[];
const VALID_SUB_SKILLS = Object.values(SubSkillType) as string[];
const VALID_LEVELS     = Object.values(RecommendationLevel) as string[];
import { todayStartIST, currentISTDate, yesterdayISTDate } from '../lib/timezone';
import { paramStr } from '../utils/httpParams';
import { BAND_MIN } from '../lib/bandScale';
import { examWeaknessGap } from '../exam-engine';

interface DrillItem {
    skill: string;
    sub_skill: string;
    skill_band_score: number;
    sub_skill_score: number;
    weakness: number; // 0.6*(1-accuracy) + 0.4*(1-band/9); higher = needs more work
}

export async function getNextActionDrill(req: AuthRequest, res: Response) {
    try {
        const appUserId = (req as any).appUserId as string;

        if (!appUserId) {
            return res.status(401).json({ success: false, error: 'Unauthorized user.' });
        }

        const student = await prisma.instituteStudent.findUnique({
            where: { user_id: appUserId }
        });

        if (!student) {
            return res.status(404).json({ success: false, error: 'Student record not found.' });
        }

        // Fetch competency matrix for student
        const matrices = await prisma.studentCompetencyMatrix.findMany({
            where: { student_id: student.id }
        });

        // Cursor = total all-time completed drills. Persists across days without a DB column.
        // Each completion advances the cursor by 1; the next fetch starts one step ahead.
        const [totalCompleted, todayCompleted, drillAgg, todayDonePairs] = await Promise.all([
            prisma.drillSession.count({
                where: { student_id: student.id, status: { in: [DrillSessionStatus.DRILL_DONE, DrillSessionStatus.APPLY_DONE] } }
            }),
            prisma.drillSession.count({
                where: { student_id: student.id, status: { in: [DrillSessionStatus.DRILL_DONE, DrillSessionStatus.APPLY_DONE] }, created_at: { gte: todayStartIST() } }
            }),
            // Per-sub-skill drill accuracy â€” feeds the weakness score below.
            prisma.drillSession.groupBy({
                by:   ['skill', 'sub_skill'],
                where: { student_id: student.id, status: { in: [DrillSessionStatus.DRILL_DONE, DrillSessionStatus.APPLY_DONE] } },
                _sum: { correct_answers: true, total_questions: true },
            }),
            // Sub-skills already completed TODAY — excluded from today's recommendations
            // so a student is never re-offered a drill they've finished today.
            prisma.drillSession.findMany({
                where: { student_id: student.id, status: { in: [DrillSessionStatus.DRILL_DONE, DrillSessionStatus.APPLY_DONE] }, created_at: { gte: todayStartIST() } },
                select: { skill: true, sub_skill: true },
            }),
        ]);

        // accuracy per skill::sub_skill (0..1). Undrilled pairs have no entry â†’ treated as
        // accuracy 0 (max practice-gap weight) so they surface as high-priority.
        const accuracyByKey = new Map<string, number>();
        for (const g of drillAgg as any[]) {
            const total = g._sum.total_questions ?? 0;
            const acc   = total > 0 ? (g._sum.correct_answers ?? 0) / total : 0;
            accuracyByKey.set(`${g.skill}::${g.sub_skill}`, acc);
        }
        // Weakness per spec: 60% recent drill accuracy gap + 40% band gap (D4: gap
        // normalized on the [4,9] domain â€” band 4 = fully weak). Higher = weaker.
        const weaknessOf = (skill: string, sub: string, band: number) => {
            const acc = accuracyByKey.get(`${skill}::${sub}`) ?? 0;
            return 0.6 * (1 - acc) + 0.4 * examWeaknessGap('ielts', band);
        };

        const items: DrillItem[] = [];

        for (const matrix of matrices) {
            // Missing band defaults to the 4.0 floor (max gap) â€” ?? 0 would sit
            // below the valid domain and distort the weakness ranking.
            const skillBandScore = Number(matrix.band_score || BAND_MIN);
            const subScores = (matrix.sub_scores as Record<string, any>) || {};

            // Use DB enum values (uppercase) for sub_skill.
            // *Score-suffixed keys match what IA/diagnostic stores in sub_scores JSONB.
            if (matrix.skill === 'WRITING') {
                const subs: { sub: string; scoreKey: string }[] = [
                    { sub: 'GRAMMAR',       scoreKey: 'grammarScore' },
                    { sub: 'COHERENCE',     scoreKey: 'coherenceScore' },
                    { sub: 'VOCABULARY',    scoreKey: 'vocabularyScore' },
                    { sub: 'TASK_RESPONSE', scoreKey: 'taskResponseScore' },
                ];
                subs.forEach(({ sub, scoreKey }) => {
                    const subScore = Number(subScores[scoreKey] ?? skillBandScore);
                    items.push({ skill: 'WRITING', sub_skill: sub, skill_band_score: skillBandScore, sub_skill_score: subScore, weakness: weaknessOf('WRITING', sub, subScore) });
                });
            } else if (matrix.skill === 'SPEAKING') {
                const subs: { sub: string; scoreKey: string }[] = [
                    { sub: 'FLUENCY',       scoreKey: 'fluencyScore' },
                    { sub: 'GRAMMAR',       scoreKey: 'grammarScore' },
                    { sub: 'VOCABULARY',    scoreKey: 'vocabularyScore' },
                    { sub: 'PRONUNCIATION', scoreKey: 'pronunciationScore' },
                ];
                subs.forEach(({ sub, scoreKey }) => {
                    const subScore = Number(subScores[scoreKey] ?? skillBandScore);
                    items.push({ skill: 'SPEAKING', sub_skill: sub, skill_band_score: skillBandScore, sub_skill_score: subScore, weakness: weaknessOf('SPEAKING', sub, subScore) });
                });
            } else if (matrix.skill === 'READING') {
                items.push({ skill: 'READING', sub_skill: 'READING', skill_band_score: skillBandScore, sub_skill_score: skillBandScore, weakness: weaknessOf('READING', 'READING', skillBandScore) });
            } else if (matrix.skill === 'LISTENING') {
                items.push({ skill: 'LISTENING', sub_skill: 'LISTENING', skill_band_score: skillBandScore, sub_skill_score: skillBandScore, weakness: weaknessOf('LISTENING', 'LISTENING', skillBandScore) });
            }
        }

        // 1. Group items by skill
        const bySkill: Record<string, DrillItem[]> = {};
        for (const item of items) {
            if (!bySkill[item.skill]) bySkill[item.skill] = [];
            bySkill[item.skill].push(item);
        }

        // 2. Sort items inside each skill by weakness (weakest first)
        for (const skill in bySkill) {
            bySkill[skill].sort((a, b) => {
                if (b.weakness !== a.weakness) return b.weakness - a.weakness;
                return a.sub_skill_score - b.sub_skill_score; // deterministic tiebreak
            });
        }

        // 3. Prioritize skills: rank the skill queues by the weakness of their weakest sub-skill
        const skillQueues = Object.values(bySkill).sort((a, b) => {
            if (b[0].weakness !== a[0].weakness) return b[0].weakness - a[0].weakness;
            if (a[0].sub_skill_score !== b[0].sub_skill_score) return a[0].sub_skill_score - b[0].sub_skill_score;
            return a[0].skill.localeCompare(b[0].skill); // deterministic fallback
        });

        // 4. Interleave (Round Robin) to completely separate identical skills
        const interleaved: DrillItem[] = [];
        let hasMore = true;
        while (hasMore) {
            hasMore = false;
            for (const queue of skillQueues) {
                if (queue.length > 0) {
                    interleaved.push(queue.shift()!);
                    hasMore = true;
                }
            }
        }

        const MAX_DRILLS_PER_DAY = 4; // 3 free + 1 purchasable extra
        const remainingToday = Math.max(0, MAX_DRILLS_PER_DAY - todayCompleted);

        // Never re-offer a (skill, sub_skill) already completed TODAY. There are ~10
        // pairs and the daily cap is 4, so distinct pairs always remain — this makes
        // the "complete 2 drills to unlock" gate structurally reachable and prevents a
        // repeat from stranding the student on an already-finished drill's result card.
        const doneTodayKeys = new Set(
            (todayDonePairs as { skill: string; sub_skill: string }[])
                .map(d => `${d.skill}::${d.sub_skill}`)
        );
        const totalPairs = interleaved.length;
        const available  = interleaved.filter(it => !doneTodayKeys.has(`${it.skill}::${it.sub_skill}`));

        // Round-robin cursor over the still-available pairs. Persists across days —
        // each completion advances the cursor by 1, so students don't repeat the same
        // rotation position two days running.
        const N = available.length;
        const startIndex = N > 0 ? totalCompleted % N : 0;

        const recommended_drills: DrillItem[] = [];
        // i < N guarantees distinct picks within one response (no modulo wrap-around repeat).
        for (let i = 0; i < remainingToday && i < N; i++) {
            recommended_drills.push(available[(startIndex + i) % N]);
        }

        const message = recommended_drills.length > 0
            ? "Here are your prioritised drills."
            : todayCompleted >= MAX_DRILLS_PER_DAY
                ? "Daily limit reached. Come back tomorrow for your next drills!"
                : totalPairs === 0
                    ? "Complete your Initial Assessment (Diagnostics) to unlock personalised drills."
                    : "You have completed all available sub-skills for today!";

        return res.json({
            success: true,
            recommended_drills,
            daily_sessions_completed: todayCompleted,
            total_completed: totalCompleted,
            message,
        });

    } catch (error) {
        console.error('[DrillController] getNextActionDrill error:', error);
        return res.status(500).json({ success: false, error: 'Internal server error while fetching next action drill.' });
    }
}

/**
 * Fetch N random drill questions for a given skill, subskill, and level.
 * GET /api/drills/questions?skill=WRITING&subskill=grammar&level=INTERMEDIATE&count=5
 */
export async function getDrillQuestions(req: AuthRequest, res: Response) {
    try {
        const { skill, subskill, level } = req.query;

        if (!skill || !subskill || !level) {
            return res.status(400).json({
                success: false,
                error: 'Missing required query parameters: skill, subskill, and level are required.'
            });
        }

        const QUESTIONS_PER_SESSION = 5;

        // Scope questions to the student's exam (A3) — zero-change for IELTS students.
        const drillStudent = await prisma.instituteStudent.findUnique({
            where: { user_id: (req as any).appUserId as string }, select: { exam_id: true },
        });
        const examId = drillStudent?.exam_id ?? 'ielts';

        const questions = await prisma.$queryRaw`
            SELECT id, skill, sub_skill, level, drill_type, prompt_text, options, correct_answer, explanation, is_active
            FROM drill_questions
            WHERE skill = ${skill}::"SkillType"
              AND sub_skill = ${subskill}::"SubSkillType"
              AND level = ${level}::"RecommendationLevel"
              AND exam_id = ${examId}
              AND is_active = true
              AND drill_type = 'MCQ'
            ORDER BY RANDOM()
            LIMIT ${QUESTIONS_PER_SESSION}
        `;

        if ((questions as any[]).length === 0) {
            return res.status(404).json({
                success: false,
                error: 'No drill questions found for the given skill, sub-skill, and level. Please check the seed data.'
            });
        }

        return res.json({
            success: true,
            data: questions
        });

    } catch (error) {
        console.error('[DrillController] getDrillQuestions error:', error);
        return res.status(500).json({ success: false, error: 'Internal server error while fetching drill questions.' });
    }
}

/**
 * POST /api/drills/save-reflection
 * Body: { session_id, reflection_text }
 * Saves the student's reflection text to the DrillSession and awards +25 momentum.
 * Idempotent: if reflection_text is already saved, skips the momentum award.
 */
export async function saveReflection(req: AuthRequest, res: Response) {
    try {
        const appUserId = (req as any).appUserId as string;
        if (!appUserId) return res.status(401).json({ success: false, error: 'Unauthorized.' });

        const student = await prisma.instituteStudent.findUnique({ where: { user_id: appUserId } });
        if (!student) return res.status(404).json({ success: false, error: 'Student not found.' });

        const { session_id, reflection_text } = req.body;

        if (!session_id || !reflection_text?.trim()) {
            return res.status(400).json({ success: false, error: 'session_id and reflection_text are required.' });
        }

        const session = await prisma.drillSession.findUnique({ where: { id: session_id } });
        if (!session) return res.status(404).json({ success: false, error: 'Drill session not found.' });
        if (session.student_id !== student.id) return res.status(403).json({ success: false, error: 'Forbidden.' });

        // Idempotent: already saved â€” skip momentum award
        if (session.reflection_text) {
            return res.json({
                success: true,
                already_saved: true,
                momentum_earned: 0,
                momentum_score: student.momentum_score,
            });
        }

        const REFLECTION_BONUS = 25;
        // Guard on reflection_text still being empty so a concurrent retry can't
        // award +25 twice (the read-then-write check above races otherwise).
        const result = await prisma.$transaction(async (t) => {
            const marked = await t.drillSession.updateMany({
                where: { id: session_id, reflection_text: null },
                data:  { reflection_text: reflection_text.trim() },
            });
            if (marked.count === 0) return { awarded: false, momentumScore: student.momentum_score };
            const updated = await t.instituteStudent.update({
                where:  { id: student.id },
                data:   { momentum_score: { increment: REFLECTION_BONUS } },
                select: { momentum_score: true },
            });
            return { awarded: true, momentumScore: updated.momentum_score };
        });

        return res.json({
            success:         true,
            already_saved:   !result.awarded,
            momentum_earned: result.awarded ? REFLECTION_BONUS : 0,
            momentum_score:  result.momentumScore,
        });
    } catch (error) {
        console.error('[DrillController] saveReflection error:', error);
        return res.status(500).json({ success: false, error: 'Internal server error.' });
    }
}

/**
 * PATCH /api/drills/session/:id/progress
 * Body: { answers: Record<string, string> }
 * Persists current answers mid-session (fire-and-forget from client).
 * Only updates STARTED sessions â€” silently skips anything already DRILL_DONE/APPLY_DONE.
 */
export async function saveDrillProgress(req: AuthRequest, res: Response) {
    try {
        const appUserId = (req as any).appUserId as string;
        if (!appUserId) return res.status(401).json({ success: false, error: 'Unauthorized.' });

        const student = await prisma.instituteStudent.findUnique({ where: { user_id: appUserId } });
        if (!student) return res.status(404).json({ success: false, error: 'Student not found.' });

        const id = paramStr(req.params.id);
        const session = await prisma.drillSession.findUnique({ where: { id } });
        if (!session)                          return res.status(404).json({ success: false, error: 'Drill session not found.' });
        if (session.student_id !== student.id) return res.status(403).json({ success: false, error: 'Forbidden.' });

        // Silently skip if session is already past STARTED â€” idempotent
        if (session.status !== DrillSessionStatus.STARTED) {
            return res.json({ success: true, skipped: true });
        }

        const { answers } = req.body;
        if (!answers || typeof answers !== 'object' || Array.isArray(answers)) {
            return res.status(400).json({ success: false, error: 'answers must be an object.' });
        }

        await prisma.drillSession.update({
            where: { id },
            data:  { answers }
        });

        return res.json({ success: true });
    } catch (error) {
        console.error('[DrillController] saveDrillProgress error:', error);
        return res.status(500).json({ success: false, error: 'Internal server error.' });
    }
}

// â”€â”€â”€ Task 3: Stateful Drill Session Endpoints â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

/**
 * POST /api/drills/start
 * Body: { skill, sub_skill, level, is_extra_session? }
 * Creates a new STARTED session + returns questions. Resumes today's STARTED session if one exists.
 */
export async function startDrillSession(req: AuthRequest, res: Response) {
    try {
        const appUserId = (req as any).appUserId as string;
        if (!appUserId) return res.status(401).json({ success: false, error: 'Unauthorized.' });

        const student = await prisma.instituteStudent.findUnique({ where: { user_id: appUserId } });
        if (!student) return res.status(404).json({ success: false, error: 'Student not found.' });

        const { skill, sub_skill, level, is_extra_session } = req.body;
        if (!skill || !sub_skill || !level) {
            return res.status(400).json({ success: false, error: 'skill, sub_skill, and level are required.' });
        }

        const skillUp    = String(skill).toUpperCase();
        const subSkillUp = String(sub_skill).toUpperCase().replace(/\s+/g, '_');
        const levelUp    = String(level).toUpperCase();

        if (!VALID_SKILLS.includes(skillUp)) {
            return res.status(400).json({ success: false, error: `Invalid skill. Expected one of: ${VALID_SKILLS.join(', ')}.` });
        }
        if (!VALID_SUB_SKILLS.includes(subSkillUp)) {
            return res.status(400).json({ success: false, error: `Invalid sub_skill. Expected one of: ${VALID_SUB_SKILLS.join(', ')}.` });
        }
        if (!VALID_LEVELS.includes(levelUp)) {
            return res.status(400).json({ success: false, error: `Invalid level. Expected one of: ${VALID_LEVELS.join(', ')}.` });
        }
        const QUESTIONS_PER_SESSION = 5;

        // Resume today's STARTED session (same skill/sub_skill)
        const existing = await prisma.drillSession.findFirst({
            where: {
                student_id: student.id,
                skill:      skillUp as any,
                sub_skill:  subSkillUp as any,
                status:     DrillSessionStatus.STARTED,
                created_at: { gte: todayStartIST() },
            }
        });

        if (existing) {
            const questionIds = existing.question_ids as string[];
            const unordered   = await prisma.drillQuestion.findMany({
                where:  { id: { in: questionIds } },
                select: { id: true, skill: true, sub_skill: true, level: true, drill_type: true,
                          prompt_text: true, options: true, correct_answer: true, explanation: true, is_active: true }
            });
            const questions   = questionIds.map(id => unordered.find(q => q.id === id)).filter(Boolean);
            const savedAnswers = (existing.answers as Record<string, string>) ?? {};

            return res.json({
                success:      true,
                session_id:   existing.id,
                questions,
                resume:       true,
                saved_answers: savedAnswers,
                resume_index: Object.keys(savedAnswers).length,
            });
        }

        // Fetch fresh random questions
        const questions: any[] = await prisma.$queryRaw`
            SELECT id, skill, sub_skill, level, drill_type, prompt_text, options, correct_answer, explanation, is_active
            FROM drill_questions
            WHERE skill     = ${skillUp}::"SkillType"
              AND sub_skill = ${subSkillUp}::"SubSkillType"
              AND level     = ${levelUp}::"RecommendationLevel"
              AND is_active = true
              AND drill_type = 'MCQ'
            ORDER BY RANDOM()
            LIMIT ${QUESTIONS_PER_SESSION}
        `;

        if (questions.length === 0) {
            return res.status(404).json({ success: false, error: 'No drill questions found for the given parameters.' });
        }

        const questionIds  = questions.map((q: any) => q.id);
        const extraSession = is_extra_session === true || is_extra_session === 'true';
        const drillType    = questions[0]?.drill_type ?? 'MCQ';

        const session = await prisma.drillSession.create({
            data: {
                student_id:        student.id,
                skill:             skillUp as any,
                sub_skill:         subSkillUp as any,
                level:             levelUp as any,
                drill_type:        drillType,
                status:            DrillSessionStatus.STARTED,
                question_ids:      questionIds,
                answers:           {},
                prompts_completed: 0,
                correct_answers:   0,
                total_questions:   questions.length,
                momentum_earned:   0,
                is_extra_session:  extraSession,
            }
        } as any);

        return res.json({
            success:      true,
            session_id:   session.id,
            questions,
            resume:       false,
            saved_answers: {},
            resume_index: 0,
        });
    } catch (error) {
        console.error('[DrillController] startDrillSession error:', error);
        return res.status(500).json({ success: false, error: 'Internal server error.' });
    }
}

/**
 * GET /api/drills/active?skill=X&sub_skill=Y
 * Returns today's STARTED or DRILL_DONE session for the given skill/sub_skill.
 * STARTED: includes questions + saved_answers for resume.
 * DRILL_DONE: just session data so the client can jump to the result card.
 */
export async function getActiveDrillSession(req: AuthRequest, res: Response) {
    try {
        const appUserId = (req as any).appUserId as string;
        if (!appUserId) return res.status(401).json({ success: false, error: 'Unauthorized.' });

        const student = await prisma.instituteStudent.findUnique({ where: { user_id: appUserId } });
        if (!student) return res.status(404).json({ success: false, error: 'Student not found.' });

        const { skill, sub_skill } = req.query;
        if (!skill || !sub_skill) {
            return res.status(400).json({ success: false, error: 'skill and sub_skill query params are required.' });
        }

        const session = await prisma.drillSession.findFirst({
            where: {
                student_id: student.id,
                skill:      (skill as string).toUpperCase() as any,
                sub_skill:  (sub_skill as string).toUpperCase().replace(/\s+/g, '_') as any,
                status:     { in: [DrillSessionStatus.STARTED, DrillSessionStatus.DRILL_DONE] },
                created_at: { gte: todayStartIST() },
            },
            orderBy: { created_at: 'desc' }
        });

        if (!session) return res.json({ success: true, session: null });

        if (session.status === DrillSessionStatus.STARTED) {
            const questionIds  = session.question_ids as string[];
            const unordered    = await prisma.drillQuestion.findMany({
                where:  { id: { in: questionIds } },
                select: { id: true, skill: true, sub_skill: true, level: true, drill_type: true,
                          prompt_text: true, options: true, correct_answer: true, explanation: true, is_active: true }
            });
            const questions    = questionIds.map(id => unordered.find(q => q.id === id)).filter(Boolean);
            const savedAnswers = (session.answers as Record<string, string>) ?? {};

            return res.json({
                success:      true,
                session:      { ...session, saved_answers: savedAnswers },
                questions,
                resume_index: Object.keys(savedAnswers).length,
            });
        }

        return res.json({ success: true, session });
    } catch (error) {
        console.error('[DrillController] getActiveDrillSession error:', error);
        return res.status(500).json({ success: false, error: 'Internal server error.' });
    }
}

/**
 * POST /api/drills/session/:id/complete
 * Body: { answers, correct_answers, is_extra_session? }
 * Transitions STARTED â†’ DRILL_DONE and awards momentum. Idempotent if already DRILL_DONE.
 */
export async function completeDrillSession(req: AuthRequest, res: Response) {
    try {
        const appUserId = (req as any).appUserId as string;
        if (!appUserId) return res.status(401).json({ success: false, error: 'Unauthorized.' });

        const student = await prisma.instituteStudent.findUnique({ where: { user_id: appUserId } });
        if (!student) return res.status(404).json({ success: false, error: 'Student not found.' });

        const id = paramStr(req.params.id);
        const session = await prisma.drillSession.findUnique({ where: { id } });
        if (!session)                          return res.status(404).json({ success: false, error: 'Drill session not found.' });
        if (session.student_id !== student.id) return res.status(403).json({ success: false, error: 'Forbidden.' });

        // Idempotent guard
        if (session.status === DrillSessionStatus.DRILL_DONE || session.status === DrillSessionStatus.APPLY_DONE) {
            return res.json({
                success:        true,
                already_done:   true,
                data:           session,
                momentum_earned: session.momentum_earned,
                momentum_score: student.momentum_score,
                daily_streak:   student.daily_streak,
            });
        }

        const { answers } = req.body;
        const answerMap = (answers ?? {}) as Record<string, string>;

        // â”€â”€ Server-side grading â€” never trust a client-supplied correct count â”€â”€
        // (Previously momentum = 15 + client_correct*10 with no clamp; a forged
        // correct_answers awarded unbounded momentum and inflated DCS past 100%.)
        const questionIds    = (session.question_ids as string[]) ?? [];
        const totalQuestions = questionIds.length || 5;
        let correctCount = 0;
        if (questionIds.length > 0) {
            const qRows = await prisma.drillQuestion.findMany({
                where:  { id: { in: questionIds } },
                select: { id: true, correct_answer: true },
            });
            for (const q of qRows) {
                const sa = String(answerMap[q.id] ?? '').trim().toUpperCase().replace(/^["']|["']$/g, '');
                const ca = String(q.correct_answer ?? '').trim().toUpperCase().replace(/^["']|["']$/g, '');
                if (sa && ca && sa === ca) correctCount++;
            }
        }
        correctCount = Math.min(correctCount, totalQuestions);

        const DRILL_BASE_PTS    = 15;
        const DRILL_PER_CORRECT = 10;
        const momentum_earned   = DRILL_BASE_PTS + correctCount * DRILL_PER_CORRECT;

        // â”€â”€ Enforce the daily sequence + cap server-side (UI is not trusted) â”€â”€â”€
        const FREE_DAILY_DRILLS = 3;
        const HARD_DAILY_CAP    = 4;
        const isExtra = session.is_extra_session === true; // trust DB flag only

        // The cap/gate check and the status flip run in ONE transaction, serialized per
        // student by a transaction-scoped advisory lock. Without this, two concurrent
        // completions of different STARTED sessions both read count<cap and both commit,
        // exceeding the cap / bypassing the LexiGrid gate. The lock releases at tx end.
        let capError: { status: number; error: string } | null = null;
        const tx = await prisma.$transaction(async (t) => {
            await t.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${student.id})::bigint)`;

            const drillsTodayBefore = await t.drillSession.count({
                where: { student_id: student.id, status: { in: [DrillSessionStatus.DRILL_DONE, DrillSessionStatus.APPLY_DONE] }, created_at: { gte: todayStartIST() } }
            });

            if (drillsTodayBefore >= HARD_DAILY_CAP) {
                capError = { status: 409, error: 'Daily drill limit reached. Come back tomorrow.' };
                return null;
            }
            if (isExtra) {
                if (student.extra_drill_credits <= 0) {
                    capError = { status: 402, error: 'No extra drill credit. Purchase one to continue.' };
                    return null;
                }
            } else {
                if (drillsTodayBefore >= FREE_DAILY_DRILLS) {
                    capError = { status: 409, error: 'You have used your free drills for today. Unlock an extra drill to continue.' };
                    return null;
                }
                // LexiGrid gate: the 2nd drill of the day requires LexiGrid done first.
                if (drillsTodayBefore === 1) {
                    const lexiToday = await t.studentGameScore.findFirst({
                        where:  { student_id: student.id, game_type: 'LEXIGRID', session_date: currentISTDate() },
                        select: { id: true },
                    });
                    if (!lexiToday) {
                        capError = { status: 409, error: 'Complete LexiGrid before starting your second drill.' };
                        return null;
                    }
                }
            }
            const consumeCredit = isExtra && student.extra_drill_credits > 0;

            // Guard STARTEDâ†’DRILL_DONE so a concurrent retry of the SAME session can't double-award.
            const marked = await t.drillSession.updateMany({
                where: { id, status: DrillSessionStatus.STARTED },
                data: {
                    status:             DrillSessionStatus.DRILL_DONE,
                    answers:            answerMap,
                    correct_answers:    correctCount,
                    prompts_completed:  totalQuestions,
                    total_questions:    totalQuestions,
                    momentum_earned,
                    drill_completed_at: new Date(),
                }
            });
            if (marked.count === 0) return { raced: true, momentumScore: student.momentum_score };

            const updated = await t.instituteStudent.update({
                where:  { id: student.id },
                data:   { momentum_score: { increment: momentum_earned } },
                select: { momentum_score: true },
            });
            if (consumeCredit) {
                await t.instituteStudent.updateMany({
                    where: { id: student.id, extra_drill_credits: { gt: 0 } },
                    data:  { extra_drill_credits: { decrement: 1 } },
                });
            }
            return { raced: false, momentumScore: updated.momentum_score };
        });

        if (capError) {
            const e = capError as { status: number; error: string };
            return res.status(e.status).json({ success: false, error: e.error });
        }
        if (!tx) return res.status(500).json({ success: false, error: 'Internal server error.' });

        if (tx.raced) {
            const fresh = await prisma.drillSession.findUnique({ where: { id } });
            return res.json({
                success: true, already_done: true, data: fresh,
                momentum_earned: fresh?.momentum_earned ?? 0,
                momentum_score:  tx.momentumScore,
                daily_streak:    student.daily_streak,
            });
        }

        const updatedSession = await prisma.drillSession.findUnique({ where: { id } });
        const updatedMomentumScore = tx.momentumScore;

        // Streak: fires once when today's completed-drill count reaches 2 (>=2, not ==2,
        // so a concurrent 1->3 jump can't skip it).
        const drillsToday = await prisma.drillSession.count({
            where: { student_id: student.id, status: { in: [DrillSessionStatus.DRILL_DONE, DrillSessionStatus.APPLY_DONE] }, created_at: { gte: todayStartIST() } }
        });

        let newDailyStreak = student.daily_streak;

        if (drillsToday >= 2) {
            const todayIST     = currentISTDate();
            const yesterdayIST = yesterdayISTDate();

            const fresh = await prisma.instituteStudent.findUnique({
                where:  { id: student.id },
                select: { daily_streak: true, last_streak_date: true }
            });
            const lastDate   = fresh?.last_streak_date ?? null;
            const prevStreak = fresh?.daily_streak ?? 0;

            if (!lastDate || lastDate.getTime() < todayIST.getTime()) {
                // Not yet counted today. Continue the run if the last credited day was
                // yesterday-or-later (spec: "â‰¥ yesterday"); otherwise restart at 1.
                const computed = (lastDate && lastDate.getTime() >= yesterdayIST.getTime()) ? prevStreak + 1 : 1;
                // Once-per-day guard: only the first request to cross 2 today flips the
                // streak. A concurrent completion finds last_streak_date already == today
                // (count 0) and reads the value instead of clobbering it back to 1.
                const guard = await prisma.instituteStudent.updateMany({
                    where: { id: student.id, OR: [{ last_streak_date: null }, { last_streak_date: { lt: todayIST } }] },
                    data:  { daily_streak: computed, last_streak_date: todayIST },
                });
                if (guard.count > 0) {
                    newDailyStreak = computed;
                } else {
                    const after = await prisma.instituteStudent.findUnique({ where: { id: student.id }, select: { daily_streak: true } });
                    newDailyStreak = after?.daily_streak ?? prevStreak;
                }
            } else {
                // Already credited today.
                newDailyStreak = prevStreak;
            }
        }

        return res.json({
            success:        true,
            data:           updatedSession,
            momentum_earned,
            momentum_score: updatedMomentumScore,
            daily_streak:   newDailyStreak,
        });
    } catch (error) {
        console.error('[DrillController] completeDrillSession error:', error);
        return res.status(500).json({ success: false, error: 'Internal server error.' });
    }
}

/**
 * POST /api/drills/session/:id/apply-done
 * Transitions DRILL_DONE â†’ APPLY_DONE and awards +30 momentum. Idempotent if already APPLY_DONE.
 */
export async function completeApplyDrillSession(req: AuthRequest, res: Response) {
    try {
        const appUserId = (req as any).appUserId as string;
        if (!appUserId) return res.status(401).json({ success: false, error: 'Unauthorized.' });

        const student = await prisma.instituteStudent.findUnique({ where: { user_id: appUserId } });
        if (!student) return res.status(404).json({ success: false, error: 'Student not found.' });

        const id = paramStr(req.params.id);
        const session = await prisma.drillSession.findUnique({ where: { id } });
        if (!session)                          return res.status(404).json({ success: false, error: 'Drill session not found.' });
        if (session.student_id !== student.id) return res.status(403).json({ success: false, error: 'Forbidden.' });

        if (session.status === DrillSessionStatus.APPLY_DONE) {
            return res.json({ success: true, already_done: true, momentum_earned: 0, momentum_score: student.momentum_score });
        }

        if (session.status !== DrillSessionStatus.DRILL_DONE) {
            return res.status(400).json({ success: false, error: 'Session must be in DRILL_DONE status to complete Apply Drill.' });
        }

        const APPLY_DRILL_BONUS = 30;
        // Guard the DRILL_DONEâ†’APPLY_DONE transition so a concurrent retry can't
        // award +30 twice: only increment momentum when this call is the one that
        // actually flips the status.
        const result = await prisma.$transaction(async (t) => {
            const marked = await t.drillSession.updateMany({
                where: { id, status: DrillSessionStatus.DRILL_DONE },
                data:  { status: DrillSessionStatus.APPLY_DONE, apply_completed_at: new Date() }
            });
            if (marked.count === 0) return { awarded: false, momentumScore: student.momentum_score };
            const updated = await t.instituteStudent.update({
                where:  { id: student.id },
                data:   { momentum_score: { increment: APPLY_DRILL_BONUS } },
                select: { momentum_score: true },
            });
            return { awarded: true, momentumScore: updated.momentum_score };
        });

        return res.json({
            success:         true,
            already_done:    !result.awarded,
            momentum_earned: result.awarded ? APPLY_DRILL_BONUS : 0,
            momentum_score:  result.momentumScore,
        });
    } catch (error) {
        console.error('[DrillController] completeApplyDrillSession error:', error);
        return res.status(500).json({ success: false, error: 'Internal server error.' });
    }
}
