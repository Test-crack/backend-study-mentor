import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import prisma from '../lib/prisma';
import { todayStartIST, currentISTDate } from '../lib/timezone';

const FREE_SESSIONS_PER_DAY = 2;
const MAX_SESSIONS_PER_DAY  = 5;
const EXTRA_SESSION_COST    = 75;
const LEXIGRID_BASE_PTS     = 10;
const LEXIGRID_BONUS_PTS    = 5;

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

        // TIMESTAMPTZ boundary for drill_sessions.created_at
        const drillCutoff  = todayStartIST();
        // DATE boundary for student_game_scores.session_date
        const sessionToday = currentISTDate();

        // DEBUG — remove before prod
        console.log('[TZ] drillCutoff (IST midnight as UTC) :', drillCutoff.toISOString());
        console.log('[TZ] sessionToday (IST date as UTC 00:00):', sessionToday.toISOString());

        const [drillSessions, lexiGridRecord, competencyMatrix] = await Promise.all([
            prisma.drillSession.findMany({
                where: { student_id: student.id, created_at: { gte: drillCutoff } },
                select: { id: true, is_extra_session: true }
            }),
            prisma.studentGameScore.findFirst({
                where: {
                    student_id: student.id,
                    game_type:    'LEXIGRID',
                    session_date: sessionToday   // exact IST date match — no gte skew
                }
            }),
            prisma.studentCompetencyMatrix.findMany({
                where: { student_id: student.id },
                select: { band_score: true }
            })
        ]);

        const validBands = competencyMatrix
            .map(m => Number(m.band_score))
            .filter(s => s > 0);
        const current_band = validBands.length > 0
            ? Math.round((validBands.reduce((a, b) => a + b, 0) / validBands.length) * 2) / 2
            : 0;

        const drills_completed_today  = drillSessions.length;
        // A record existing for today = student played the session.
        // We don't gate on `completed` field because old rows written before the
        // completed-flag fix may have completed=false even though the session finished.
        const lexigrid_completed_today = !!lexiGridRecord;
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
            momentum_score:   student.momentum_score,
            daily_streak:     student.daily_streak,
            target_band:      student.target_band ?? 7.0,
            current_band,
            can_buy_extra: student.momentum_score >= EXTRA_SESSION_COST
                && drills_completed_today >= FREE_SESSIONS_PER_DAY
                && drills_completed_today < MAX_SESSIONS_PER_DAY,
            free_sessions:    FREE_SESSIONS_PER_DAY,
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

        const wordsSolvedNum = Math.max(0, parseInt(words_solved));

        // submitLexiGridSession is only ever called at end of a full 5-word session,
        // so any API call here means the session is complete regardless of score.
        const completed = true;

        // Momentum matches the frontend per-word award (15 pts/word) so that
        // syncMomentum(res.momentum_score) is consistent with the local addPoints calls.
        // Bonus (+5 pts) only applies if all 5 words were solved on first/second try.
        const POINTS_PER_WORD = 15;
        const momentum_earned = game_type === 'LEXIGRID'
            ? wordsSolvedNum * POINTS_PER_WORD + (bonus_eligible && wordsSolvedNum >= 5 ? LEXIGRID_BONUS_PTS : 0)
            : 0;

        // One record per student per game per IST calendar day
        const sessionToday = currentISTDate();

        // Check BEFORE upsert to guard against double-awarding momentum
        const existingRecord = await prisma.studentGameScore.findFirst({
            where: { student_id: student.id, game_type, session_date: sessionToday }
        });
        const wasAlreadyComplete = existingRecord?.completed ?? false;

        const record = await prisma.studentGameScore.upsert({
            where: {
                student_id_game_type_session_date: {
                    student_id:   student.id,
                    game_type,
                    session_date: sessionToday
                }
            },
            create: {
                student_id:     student.id,
                game_type,
                session_date:   sessionToday,
                words_solved:   wordsSolvedNum,
                total_attempts: total_attempts ?? 0,
                bonus_eligible: bonus_eligible ?? false,
                momentum_earned,
                completed,
                score_data:     req.body.score_data ?? null
            },
            update: {
                words_solved:   wordsSolvedNum,
                total_attempts: total_attempts ?? 0,
                bonus_eligible: bonus_eligible ?? false,
                momentum_earned,
                completed
            }
        });

        // Award momentum only on first submission — idempotent
        let updated_momentum = student.momentum_score;
        if (!wasAlreadyComplete && momentum_earned > 0) {
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
            next_action: 'DRILL_2'
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

        const drillsToday = await prisma.drillSession.count({
            where: { student_id: student.id, created_at: { gte: todayStartIST() } }
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
