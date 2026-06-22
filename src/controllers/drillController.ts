import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import prisma from '../lib/prisma';
import { DrillSessionStatus, IeltsSkillType, IeltsSubSkillType, RecommendationLevel } from '@prisma/client';

// Derived from Prisma enums — stays in sync automatically when schema changes
const VALID_SKILLS     = Object.values(IeltsSkillType) as string[];
const VALID_SUB_SKILLS = Object.values(IeltsSubSkillType) as string[];
const VALID_LEVELS     = Object.values(RecommendationLevel) as string[];
import { todayStartIST, currentISTDate, yesterdayISTDate } from '../lib/timezone';

interface DrillItem {
    skill: string;
    sub_skill: string;
    skill_band_score: number;
    sub_skill_score: number;
}

export async function getNextActionDrill(req: AuthRequest, res: Response) {
    try {
        const appUserId = (req as any).appUserId as string;

        if (!appUserId) {
            return res.status(401).json({ success: false, error: 'Unauthorized user.' });
        }

        const student = await prisma.institute_students.findUnique({
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
        const [totalCompleted, todayCompleted] = await Promise.all([
            prisma.drillSession.count({
                where: { student_id: student.id, status: { in: [DrillSessionStatus.DRILL_DONE, DrillSessionStatus.APPLY_DONE] } }
            }),
            prisma.drillSession.count({
                where: { student_id: student.id, status: { in: [DrillSessionStatus.DRILL_DONE, DrillSessionStatus.APPLY_DONE] }, created_at: { gte: todayStartIST() } }
            })
        ]);


        const items: DrillItem[] = [];

        for (const matrix of matrices) {
            const skillBandScore = Number(matrix.band_score || 0);
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
                subs.forEach(({ sub, scoreKey }) => items.push({
                    skill: 'WRITING',
                    sub_skill: sub,
                    skill_band_score: skillBandScore,
                    sub_skill_score: Number(subScores[scoreKey] ?? skillBandScore)
                }));
            } else if (matrix.skill === 'SPEAKING') {
                const subs: { sub: string; scoreKey: string }[] = [
                    { sub: 'FLUENCY',       scoreKey: 'fluencyScore' },
                    { sub: 'GRAMMAR',       scoreKey: 'grammarScore' },
                    { sub: 'VOCABULARY',    scoreKey: 'vocabularyScore' },
                    { sub: 'PRONUNCIATION', scoreKey: 'pronunciationScore' },
                ];
                subs.forEach(({ sub, scoreKey }) => items.push({
                    skill: 'SPEAKING',
                    sub_skill: sub,
                    skill_band_score: skillBandScore,
                    sub_skill_score: Number(subScores[scoreKey] ?? skillBandScore)
                }));
            } else if (matrix.skill === 'READING') {
                items.push({
                    skill: 'READING',
                    sub_skill: 'READING',
                    skill_band_score: skillBandScore,
                    sub_skill_score: skillBandScore
                });
            } else if (matrix.skill === 'LISTENING') {
                items.push({
                    skill: 'LISTENING',
                    sub_skill: 'LISTENING',
                    skill_band_score: skillBandScore,
                    sub_skill_score: skillBandScore
                });
            }
        }

        // 1. Group items by skill
        const bySkill: Record<string, DrillItem[]> = {};
        for (const item of items) {
            if (!bySkill[item.skill]) bySkill[item.skill] = [];
            bySkill[item.skill].push(item);
        }

        // 2. Sort items inside each skill perfectly by score
        for (const skill in bySkill) {
            bySkill[skill].sort((a, b) => {
                if (a.sub_skill_score !== b.sub_skill_score) return a.sub_skill_score - b.sub_skill_score;
                return a.skill_band_score - b.skill_band_score;
            });
        }

        // 3. Prioritize skills: rank the skill queues by the severity of their lowest score
        const skillQueues = Object.values(bySkill).sort((a, b) => {
            if (a[0].sub_skill_score !== b[0].sub_skill_score) return a[0].sub_skill_score - b[0].sub_skill_score;
            if (a[0].skill_band_score !== b[0].skill_band_score) return a[0].skill_band_score - b[0].skill_band_score;
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

        // Round-robin cursor: slice the ordered array starting at (totalCompleted % N).
        // This persists across days — each completion advances the cursor by 1 globally,
        // so students never repeat the same rotation position two days in a row.
        const N = interleaved.length;
        const MAX_DRILLS_PER_DAY = 4; // 3 free + 1 purchasable extra
        const remainingToday = Math.max(0, MAX_DRILLS_PER_DAY - todayCompleted);
        const startIndex     = N > 0 ? totalCompleted % N : 0;

        const recommended_drills: DrillItem[] = [];
        for (let i = 0; i < remainingToday && N > 0; i++) {
            recommended_drills.push(interleaved[(startIndex + i) % N]);
        }

        const message = recommended_drills.length > 0
            ? "Here are your prioritised drills."
            : todayCompleted >= MAX_DRILLS_PER_DAY
                ? "Daily limit reached. Come back tomorrow for your next drills!"
                : N === 0
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

        const questions = await prisma.$queryRaw`
            SELECT id, skill, sub_skill, level, drill_type, prompt_text, options, correct_answer, explanation, is_active
            FROM drill_questions
            WHERE skill = ${skill}::"IeltsSkillType"
              AND sub_skill = ${subskill}::"IeltsSubSkillType"
              AND level = ${level}::"RecommendationLevel"
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
 * Save a completed Drill Session
 * POST /api/drills/session
 */
export async function saveDrillSession(req: AuthRequest, res: Response) {
    try {
        const appUserId = (req as any).appUserId as string;
        if (!appUserId) {
            return res.status(401).json({ success: false, error: 'Unauthorized user.' });
        }

        const student = await prisma.institute_students.findUnique({
            where: { user_id: appUserId }
        });

        if (!student) {
            return res.status(404).json({ success: false, error: 'Student record not found.' });
        }

        const { skill, subskill, prompts_completed, correct_answers, is_extra_session } = req.body;

        if (!skill || !subskill || prompts_completed === undefined || correct_answers === undefined) {
            return res.status(400).json({ success: false, error: 'Missing required fields: skill, subskill, prompts_completed, correct_answers.' });
        }

        const DRILL_BASE_PTS    = 15;
        const DRILL_PER_CORRECT = 10;
        const correctCount      = Math.max(0, parseInt(correct_answers));
        const momentum_earned   = DRILL_BASE_PTS + correctCount * DRILL_PER_CORRECT;
        const extraSession      = is_extra_session === true || is_extra_session === 'true';

        // Idempotency guard: if a DRILL_DONE/APPLY_DONE session already exists today
        // for the same skill+sub_skill, skip momentum and return the existing record.
        const existingToday = await prisma.drillSession.findFirst({
            where: {
                student_id: student.id,
                skill,
                sub_skill:  subskill,
                status:     { in: [DrillSessionStatus.DRILL_DONE, DrillSessionStatus.APPLY_DONE] },
                created_at: { gte: todayStartIST() },
            }
        });
        if (existingToday) {
            return res.json({
                success:         true,
                already_submitted: true,
                data:            existingToday,
                momentum_earned: 0,
                momentum_score:  student.momentum_score,
                daily_streak:    student.daily_streak,
            });
        }

        // Consume one pre-authorized extra credit when the session is an extra drill.
        const consumeCredit = extraSession && student.extra_drill_credits > 0;

        const [session, updatedStudent] = await prisma.$transaction([
            prisma.drillSession.create({
                data: {
                    student_id:       student.id,
                    skill,
                    sub_skill:        subskill,
                    prompts_completed: parseInt(prompts_completed),
                    correct_answers:  correctCount,
                    total_questions:  5,
                    momentum_earned,
                    is_extra_session: extraSession
                }
            }),
            prisma.institute_students.update({
                where: { id: student.id },
                data:  {
                    momentum_score:     { increment: momentum_earned },
                    ...(consumeCredit ? { extra_drill_credits: { decrement: 1 } } : {})
                }
            })
        ]);

        // Streak: fires only when today's completed count crosses exactly 2.
        const drillCutoff = todayStartIST();
        const drillsToday = await prisma.drillSession.count({
            where: {
                student_id: student.id,
                status:     { in: [DrillSessionStatus.DRILL_DONE, DrillSessionStatus.APPLY_DONE] },
                created_at: { gte: drillCutoff },
            }
        });

        let newDailyStreak = updatedStudent.daily_streak;

        if (drillsToday === 2) {
            const todayIST     = currentISTDate();
            const yesterdayIST = yesterdayISTDate();

            const { daily_streak: prevStreak, last_streak_date: lastDate } =
                await prisma.institute_students.findUnique({
                    where: { id: student.id },
                    select: { daily_streak: true, last_streak_date: true }
                }) ?? { daily_streak: 0, last_streak_date: null };

            // last_streak_date is a DATE column — Prisma returns midnight UTC of that IST date.
            // It was yesterday (IST) if it falls within [yesterdayIST, todayIST).
            if (lastDate
                && lastDate.getTime() >= yesterdayIST.getTime()
                && lastDate.getTime() <  todayIST.getTime()) {
                newDailyStreak = prevStreak + 1;
            } else {
                newDailyStreak = 1;
            }

            await prisma.institute_students.update({
                where: { id: student.id },
                data: { daily_streak: newDailyStreak, last_streak_date: todayIST }
            });
        }

        return res.json({
            success: true,
            data: session,
            momentum_earned,
            momentum_score: updatedStudent.momentum_score,
            daily_streak: newDailyStreak,
        });

    } catch (error) {
        console.error('[DrillController] saveDrillSession error:', error);
        return res.status(500).json({ success: false, error: 'Internal server error while saving drill session.' });
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

        const student = await prisma.institute_students.findUnique({ where: { user_id: appUserId } });
        if (!student) return res.status(404).json({ success: false, error: 'Student not found.' });

        const { session_id, reflection_text } = req.body;

        if (!session_id || !reflection_text?.trim()) {
            return res.status(400).json({ success: false, error: 'session_id and reflection_text are required.' });
        }

        const session = await prisma.drillSession.findUnique({ where: { id: session_id } });
        if (!session) return res.status(404).json({ success: false, error: 'Drill session not found.' });
        if (session.student_id !== student.id) return res.status(403).json({ success: false, error: 'Forbidden.' });

        // Idempotent: already saved — skip momentum award
        if (session.reflection_text) {
            return res.json({
                success: true,
                already_saved: true,
                momentum_earned: 0,
                momentum_score: student.momentum_score,
            });
        }

        const REFLECTION_BONUS = 25;
        const [, updated] = await prisma.$transaction([
            prisma.drillSession.update({
                where: { id: session_id },
                data:  { reflection_text: reflection_text.trim() },
            }),
            prisma.institute_students.update({
                where: { id: student.id },
                data:  { momentum_score: { increment: REFLECTION_BONUS } },
            }),
        ]);

        return res.json({
            success: true,
            momentum_earned: REFLECTION_BONUS,
            momentum_score: updated.momentum_score,
        });
    } catch (error) {
        console.error('[DrillController] saveReflection error:', error);
        return res.status(500).json({ success: false, error: 'Internal server error.' });
    }
}

/**
 * POST /api/drills/apply-complete
 * Awards +30 momentum pts when the student completes the Apply Drill step.
 */
export async function completeApplyDrill(req: AuthRequest, res: Response) {
    try {
        const appUserId = (req as any).appUserId as string;
        if (!appUserId) return res.status(401).json({ success: false, error: 'Unauthorized.' });

        const student = await prisma.institute_students.findUnique({ where: { user_id: appUserId } });
        if (!student) return res.status(404).json({ success: false, error: 'Student not found.' });

        const APPLY_DRILL_BONUS = 30;
        const updated = await prisma.institute_students.update({
            where: { id: student.id },
            data: { momentum_score: { increment: APPLY_DRILL_BONUS } }
        });

        return res.json({
            success: true,
            momentum_earned: APPLY_DRILL_BONUS,
            momentum_score: updated.momentum_score
        });
    } catch (error) {
        console.error('[DrillController] completeApplyDrill error:', error);
        return res.status(500).json({ success: false, error: 'Internal server error.' });
    }
}

/**
 * PATCH /api/drills/session/:id/progress
 * Body: { answers: Record<string, string> }
 * Persists current answers mid-session (fire-and-forget from client).
 * Only updates STARTED sessions — silently skips anything already DRILL_DONE/APPLY_DONE.
 */
export async function saveDrillProgress(req: AuthRequest, res: Response) {
    try {
        const appUserId = (req as any).appUserId as string;
        if (!appUserId) return res.status(401).json({ success: false, error: 'Unauthorized.' });

        const student = await prisma.institute_students.findUnique({ where: { user_id: appUserId } });
        if (!student) return res.status(404).json({ success: false, error: 'Student not found.' });

        const { id } = req.params;
        const session = await prisma.drillSession.findUnique({ where: { id } });
        if (!session)                          return res.status(404).json({ success: false, error: 'Drill session not found.' });
        if (session.student_id !== student.id) return res.status(403).json({ success: false, error: 'Forbidden.' });

        // Silently skip if session is already past STARTED — idempotent
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

// ─── Task 3: Stateful Drill Session Endpoints ────────────────────────────────

/**
 * POST /api/drills/start
 * Body: { skill, sub_skill, level, is_extra_session? }
 * Creates a new STARTED session + returns questions. Resumes today's STARTED session if one exists.
 */
export async function startDrillSession(req: AuthRequest, res: Response) {
    try {
        const appUserId = (req as any).appUserId as string;
        if (!appUserId) return res.status(401).json({ success: false, error: 'Unauthorized.' });

        const student = await prisma.institute_students.findUnique({ where: { user_id: appUserId } });
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
            WHERE skill     = ${skillUp}::"IeltsSkillType"
              AND sub_skill = ${subSkillUp}::"IeltsSubSkillType"
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

        const student = await prisma.institute_students.findUnique({ where: { user_id: appUserId } });
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
 * Transitions STARTED → DRILL_DONE and awards momentum. Idempotent if already DRILL_DONE.
 */
export async function completeDrillSession(req: AuthRequest, res: Response) {
    try {
        const appUserId = (req as any).appUserId as string;
        if (!appUserId) return res.status(401).json({ success: false, error: 'Unauthorized.' });

        const student = await prisma.institute_students.findUnique({ where: { user_id: appUserId } });
        if (!student) return res.status(404).json({ success: false, error: 'Student not found.' });

        const { id } = req.params;
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

        const { answers, correct_answers, is_extra_session } = req.body;

        const DRILL_BASE_PTS    = 15;
        const DRILL_PER_CORRECT = 10;
        const correctCount      = Math.max(0, parseInt(correct_answers ?? '0'));
        const momentum_earned   = DRILL_BASE_PTS + correctCount * DRILL_PER_CORRECT;
        const extraSession      = session.is_extra_session; // trust DB flag only — ignore client body
        const consumeCredit     = extraSession && student.extra_drill_credits > 0;
        const totalQuestions    = (session.question_ids as string[] ?? []).length || 5;

        const [updatedSession, updatedStudent] = await prisma.$transaction([
            prisma.drillSession.update({
                where: { id },
                data: {
                    status:             DrillSessionStatus.DRILL_DONE,
                    answers:            answers ?? {},
                    correct_answers:    correctCount,
                    prompts_completed:  totalQuestions,
                    total_questions:    totalQuestions,
                    momentum_earned,
                    drill_completed_at: new Date(),
                }
            }),
            prisma.institute_students.update({
                where: { id: student.id },
                data: {
                    momentum_score: { increment: momentum_earned },
                    ...(consumeCredit ? { extra_drill_credits: { decrement: 1 } } : {})
                }
            })
        ]);

        // Streak: fires when today's DRILL_DONE count crosses exactly 2
        const drillCutoff = todayStartIST();
        const drillsToday = await prisma.drillSession.count({
            where: { student_id: student.id, status: { in: [DrillSessionStatus.DRILL_DONE, DrillSessionStatus.APPLY_DONE] }, created_at: { gte: drillCutoff } }
        });

        let newDailyStreak = updatedStudent.daily_streak;

        if (drillsToday === 2) {
            const todayIST     = currentISTDate();
            const yesterdayIST = yesterdayISTDate();

            const { daily_streak: prevStreak, last_streak_date: lastDate } =
                await prisma.institute_students.findUnique({
                    where:  { id: student.id },
                    select: { daily_streak: true, last_streak_date: true }
                }) ?? { daily_streak: 0, last_streak_date: null };

            if (lastDate
                && lastDate.getTime() >= yesterdayIST.getTime()
                && lastDate.getTime() <  todayIST.getTime()) {
                newDailyStreak = prevStreak + 1;
            } else {
                newDailyStreak = 1;
            }

            await prisma.institute_students.update({
                where: { id: student.id },
                data:  { daily_streak: newDailyStreak, last_streak_date: todayIST }
            });
        }

        return res.json({
            success:        true,
            data:           updatedSession,
            momentum_earned,
            momentum_score: updatedStudent.momentum_score,
            daily_streak:   newDailyStreak,
        });
    } catch (error) {
        console.error('[DrillController] completeDrillSession error:', error);
        return res.status(500).json({ success: false, error: 'Internal server error.' });
    }
}

/**
 * POST /api/drills/session/:id/apply-done
 * Transitions DRILL_DONE → APPLY_DONE and awards +30 momentum. Idempotent if already APPLY_DONE.
 */
export async function completeApplyDrillSession(req: AuthRequest, res: Response) {
    try {
        const appUserId = (req as any).appUserId as string;
        if (!appUserId) return res.status(401).json({ success: false, error: 'Unauthorized.' });

        const student = await prisma.institute_students.findUnique({ where: { user_id: appUserId } });
        if (!student) return res.status(404).json({ success: false, error: 'Student not found.' });

        const { id } = req.params;
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
        const [, updated] = await prisma.$transaction([
            prisma.drillSession.update({
                where: { id },
                data:  { status: DrillSessionStatus.APPLY_DONE, apply_completed_at: new Date() }
            }),
            prisma.institute_students.update({
                where: { id: student.id },
                data:  { momentum_score: { increment: APPLY_DRILL_BONUS } }
            })
        ]);

        return res.json({
            success:        true,
            momentum_earned: APPLY_DRILL_BONUS,
            momentum_score: updated.momentum_score,
        });
    } catch (error) {
        console.error('[DrillController] completeApplyDrillSession error:', error);
        return res.status(500).json({ success: false, error: 'Internal server error.' });
    }
}
