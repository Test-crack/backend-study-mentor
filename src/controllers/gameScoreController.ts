import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import prisma from '../lib/prisma';

const FREE_SESSIONS_PER_DAY = 2;
const MAX_SESSIONS_PER_DAY  = 5;
const EXTRA_SESSION_COST    = 75;
const LEXIGRID_BASE_PTS     = 10;
const LEXIGRID_BONUS_PTS    = 5;

function todayStart(): Date {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
}

async function resolveStudent(appUserId: string) {
    return prisma.institute_students.findUnique({ where: { user_id: appUserId } });
}

// ─── GET /api/student/daily-drill-state ──────────────────────────────────────
export async function getDailyDrillState(req: AuthRequest, res: Response) {
    try {
        const appUserId = (req as any).appUserId as string;
        if (!appUserId) return res.status(401).json({ success: false, error: 'Unauthorized.' });

        const student = await resolveStudent(appUserId);
        if (!student) return res.status(404).json({ success: false, error: 'Student not found.' });

        const start = todayStart();

        const [drillSessions, lexiGridRecord] = await Promise.all([
            prisma.drillSession.findMany({
                where: { student_id: student.id, created_at: { gte: start } },
                select: { id: true, is_extra_session: true }
            }),
            prisma.studentGameScore.findFirst({
                where: {
                    student_id: student.id,
                    game_type: 'LEXIGRID',
                    session_date: { gte: start }
                }
            })
        ]);

        const drills_completed_today  = drillSessions.length;
        const lexigrid_completed_today = !!(lexiGridRecord?.completed);
        const dashboard_unlocked       = drills_completed_today >= FREE_SESSIONS_PER_DAY;
        const extra_sessions_today     = drillSessions.filter(s => s.is_extra_session).length;
        const sessions_remaining       = MAX_SESSIONS_PER_DAY - drills_completed_today;

        // Determine what the student should do next
        let next_action: string;
        if (drills_completed_today === 0) {
            next_action = 'DRILL_1';
        } else if (drills_completed_today === 1 && !lexigrid_completed_today) {
            next_action = 'LEXIGRID';
        } else if (drills_completed_today === 1 && lexigrid_completed_today) {
            next_action = 'DRILL_2';
        } else if (drills_completed_today >= MAX_SESSIONS_PER_DAY) {
            next_action = 'DAILY_LIMIT_REACHED';
        } else if (drills_completed_today >= FREE_SESSIONS_PER_DAY) {
            next_action = student.momentum_score >= EXTRA_SESSION_COST
                ? 'EXTRA_DRILL_AVAILABLE'
                : 'DRILL_LOCKED_INSUFFICIENT_PTS';
        } else {
            next_action = 'DAILY_LIMIT_REACHED';
        }

        return res.json({
            success: true,
            drills_completed_today,
            lexigrid_completed_today,
            dashboard_unlocked,
            next_action,
            extra_sessions_today,
            sessions_remaining,
            momentum_score: student.momentum_score,
            can_buy_extra: student.momentum_score >= EXTRA_SESSION_COST
                && drills_completed_today >= FREE_SESSIONS_PER_DAY
                && drills_completed_today < MAX_SESSIONS_PER_DAY,
            free_sessions: FREE_SESSIONS_PER_DAY,
            extra_session_cost: EXTRA_SESSION_COST
        });
    } catch (err) {
        console.error('[DailyDrillState] error:', err);
        return res.status(500).json({ success: false, error: 'Internal server error.' });
    }
}

// ─── POST /api/student/game-score ────────────────────────────────────────────
// Body: { game_type, words_solved, total_attempts, bonus_eligible }
export async function saveGameScore(req: AuthRequest, res: Response) {
    try {
        const appUserId = (req as any).appUserId as string;
        if (!appUserId) return res.status(401).json({ success: false, error: 'Unauthorized.' });

        const student = await resolveStudent(appUserId);
        if (!student) return res.status(404).json({ success: false, error: 'Student not found.' });

        const { game_type, words_solved, total_attempts, bonus_eligible } = req.body;

        if (!game_type || words_solved === undefined) {
            return res.status(400).json({ success: false, error: 'game_type and words_solved are required.' });
        }

        const REQUIRED_WORDS = 5;
        const completed       = words_solved >= REQUIRED_WORDS;
        let momentum_earned   = 0;

        if (game_type === 'LEXIGRID' && completed) {
            momentum_earned = LEXIGRID_BASE_PTS + (bonus_eligible ? LEXIGRID_BONUS_PTS : 0);
        }

        const start = todayStart();

        // Upsert — one record per student per game per calendar day
        const record = await prisma.studentGameScore.upsert({
            where: {
                student_id_game_type_session_date: {
                    student_id: student.id,
                    game_type,
                    session_date: start
                }
            },
            create: {
                student_id: student.id,
                game_type,
                session_date: start,
                words_solved,
                total_attempts: total_attempts ?? 0,
                bonus_eligible: bonus_eligible ?? false,
                momentum_earned,
                completed,
                score_data: req.body.score_data ?? null
            },
            update: {
                words_solved,
                total_attempts: total_attempts ?? 0,
                bonus_eligible: bonus_eligible ?? false,
                momentum_earned,
                completed
            }
        });

        // Award momentum only on first-time completion
        let updated_momentum = student.momentum_score;
        if (completed && momentum_earned > 0) {
            const updatedStudent = await prisma.institute_students.update({
                where: { id: student.id },
                data: { momentum_score: { increment: momentum_earned } }
            });
            updated_momentum = updatedStudent.momentum_score;
        }

        return res.json({
            success: true,
            data: record,
            momentum_earned,
            momentum_score: updated_momentum,
            next_action: completed ? 'DRILL_2' : 'CONTINUE_LEXIGRID'
        });
    } catch (err) {
        console.error('[GameScore] saveGameScore error:', err);
        return res.status(500).json({ success: false, error: 'Internal server error.' });
    }
}

// ─── POST /api/drills/authorize-extra ────────────────────────────────────────
// Deducts 75 pts to authorise one extra drill beyond the free daily limit.
export async function authorizeExtraDrill(req: AuthRequest, res: Response) {
    try {
        const appUserId = (req as any).appUserId as string;
        if (!appUserId) return res.status(401).json({ success: false, error: 'Unauthorized.' });

        const student = await resolveStudent(appUserId);
        if (!student) return res.status(404).json({ success: false, error: 'Student not found.' });

        if (student.momentum_score < EXTRA_SESSION_COST) {
            return res.status(400).json({
                success: false,
                error: `Insufficient momentum. Need ${EXTRA_SESSION_COST} pts, have ${student.momentum_score}.`
            });
        }

        const start = todayStart();
        const drillsToday = await prisma.drillSession.count({
            where: { student_id: student.id, created_at: { gte: start } }
        });

        if (drillsToday < FREE_SESSIONS_PER_DAY) {
            return res.status(400).json({
                success: false,
                error: 'Complete your free daily sessions before purchasing extra sessions.'
            });
        }

        if (drillsToday >= MAX_SESSIONS_PER_DAY) {
            return res.status(400).json({
                success: false,
                error: 'Daily drill limit reached. No more sessions available today.'
            });
        }

        const updated = await prisma.institute_students.update({
            where: { id: student.id },
            data: { momentum_score: { decrement: EXTRA_SESSION_COST } }
        });

        return res.json({
            success: true,
            momentum_score: updated.momentum_score,
            sessions_remaining: MAX_SESSIONS_PER_DAY - drillsToday - 1,
            message: `${EXTRA_SESSION_COST} pts spent. Extra drill session unlocked.`
        });
    } catch (err) {
        console.error('[AuthorizeExtra] error:', err);
        return res.status(500).json({ success: false, error: 'Internal server error.' });
    }
}
