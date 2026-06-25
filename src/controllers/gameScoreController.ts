import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import prisma from '../lib/prisma';
import { DrillSessionStatus } from '@prisma/client';
import { todayStartIST, currentISTDate } from '../lib/timezone';
import { computeDailyDCS } from '../lib/dcs';
import { getValidatedStreak } from '../lib/streak';
import { verifyLexiGridSession } from '../lib/lexiGridSession';

const WORDS_PER_SESSION     = 5;    // LexiGrid words per session
const FREE_SESSIONS_PER_DAY = 3;    // 3 drills free daily
const MAX_SESSIONS_PER_DAY  = 4;    // 3 free + 1 purchasable extra = 4 max per day
const EXTRA_SESSION_COST    = 300;  // 300 momentum pts to unlock the 4th drill
const DCS_EXTRA_THRESHOLD   = 40;   // DCS% required to unlock extra drill
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

        // Validate streak on every load — resets to 0 if student missed a day
        const daily_streak = await getValidatedStreak(student);

        // TIMESTAMPTZ boundary for drill_sessions.created_at
        const drillCutoff  = todayStartIST();
        // DATE boundary for student_game_scores.session_date
        const sessionToday = currentISTDate();

        const [drillSessions, lexiGridRecord, competencyMatrix] = await Promise.all([
            prisma.drillSession.findMany({
                where: { student_id: student.id, status: { in: [DrillSessionStatus.DRILL_DONE, DrillSessionStatus.APPLY_DONE] }, created_at: { gte: drillCutoff } },
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

        const drills_completed_today   = drillSessions.length;
        const lexigrid_completed_today = !!lexiGridRecord;
        // Dashboard unlocks when Drill 2 is accessed — still threshold of 2
        const dashboard_unlocked       = drills_completed_today >= 2;
        const extra_sessions_today     = drillSessions.filter(s => s.is_extra_session).length;
        const sessions_remaining       = MAX_SESSIONS_PER_DAY - drills_completed_today;

        // DCS needed for next_action decision and can_buy_extra gate
        const daily_dcs = await computeDailyDCS(student.id);
        const hasDCSForExtra = daily_dcs >= DCS_EXTRA_THRESHOLD;
        const hasMomForExtra = student.momentum_score >= EXTRA_SESSION_COST;

        // ── next_action decision tree ──────────────────────────────────────────
        // DRILL_1 → LEXIGRID gate → DRILL_2 → DRILL_3 (all free)
        // → EXTRA_DRILL_READY   (credit already purchased, not yet consumed)
        // → EXTRA_DRILL_AVAILABLE (eligible to purchase: DCS≥40% + 300 momentum pts)
        // → DRILL_LOCKED_LOW_DCS / DRILL_LOCKED_INSUFFICIENT_PTS
        const pendingCredit = student.extra_drill_credits > 0;

        let next_action: string;
        if (drills_completed_today === 0) {
            next_action = 'DRILL_1';
        } else if (drills_completed_today === 1 && !lexigrid_completed_today) {
            next_action = 'LEXIGRID';
        } else if (drills_completed_today === 1 && lexigrid_completed_today) {
            next_action = 'DRILL_2';
        } else if (drills_completed_today === 2) {
            next_action = 'DRILL_3';
        } else if (drills_completed_today >= MAX_SESSIONS_PER_DAY) {
            // All 4 drills done — hard cap reached for today
            next_action = 'DAILY_LIMIT_REACHED';
        } else if (drills_completed_today >= FREE_SESSIONS_PER_DAY) {
            if (pendingCredit) {
                // Student already paid — go straight to drill, no re-payment
                next_action = 'EXTRA_DRILL_READY';
            } else if (!hasDCSForExtra) {
                next_action = 'DRILL_LOCKED_LOW_DCS';
            } else if (!hasMomForExtra) {
                next_action = 'DRILL_LOCKED_INSUFFICIENT_PTS';
            } else {
                next_action = 'EXTRA_DRILL_AVAILABLE';
            }
        } else {
            next_action = 'DRILL_LOCKED_LOW_DCS'; // fallback
        }

        return res.json({
            success: true,
            drills_completed_today,
            lexigrid_completed_today,
            lexigrid_words_solved:    lexiGridRecord?.words_solved    ?? 0,
            lexigrid_momentum_earned: lexiGridRecord?.momentum_earned ?? 0,
            dashboard_unlocked,
            next_action,
            extra_sessions_today,
            sessions_remaining,
            momentum_score:     student.momentum_score,
            daily_streak,
            daily_dcs,
            target_band:        student.target_band ?? 7.0,
            current_band,
            extra_drill_credits: student.extra_drill_credits,
            can_buy_extra:      !pendingCredit && hasDCSForExtra && hasMomForExtra
                                && drills_completed_today >= FREE_SESSIONS_PER_DAY
                                && drills_completed_today < MAX_SESSIONS_PER_DAY,
            free_sessions:      FREE_SESSIONS_PER_DAY,
            extra_session_cost: EXTRA_SESSION_COST,
            dcs_threshold:      DCS_EXTRA_THRESHOLD
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

        const { game_type, words_solved, total_attempts, bonus_eligible, session_token } = req.body;

        if (!game_type || words_solved === undefined) {
            return res.status(400).json({ success: false, error: 'game_type and words_solved are required.' });
        }

        const wordsSolvedNum = Math.max(0, parseInt(words_solved));

        // Verify the session token for LexiGrid to prevent client-side score inflation.
        // 'missing' = offline/fallback session → allow but award zero momentum.
        // 'invalid' = tampered token → reject outright.
        if (game_type === 'LEXIGRID') {
            const tokenStatus = verifyLexiGridSession(session_token, student.id, wordsSolvedNum);
            if (tokenStatus === 'invalid') {
                console.warn(`[GameScore] Invalid LexiGrid session token for student ${student.id}`);
                return res.status(400).json({ success: false, error: 'Invalid session token.' });
            }
            if (tokenStatus === 'missing') {
                // Offline/fallback play — record the session but award no momentum
                const sessionToday = currentISTDate();
                await (prisma as any).studentGameScore.upsert({
                    where: { student_id_game_type_session_date: { student_id: student.id, game_type, session_date: sessionToday } },
                    create: { student_id: student.id, game_type, session_date: sessionToday, words_solved: wordsSolvedNum, total_words: WORDS_PER_SESSION, total_attempts: total_attempts ?? 0, bonus_eligible: false, momentum_earned: 0, completed: true },
                    update: { words_solved: wordsSolvedNum, total_words: WORDS_PER_SESSION, total_attempts: total_attempts ?? 0 },
                });
                return res.json({ success: true, momentum_earned: 0, momentum_score: student.momentum_score });
            }
        }

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
                student_id:      student.id,
                game_type,
                session_date:    sessionToday,
                words_solved:    wordsSolvedNum,
                total_words:     WORDS_PER_SESSION,
                total_attempts:  total_attempts ?? 0,
                bonus_eligible:  bonus_eligible ?? false,
                momentum_earned,
                completed,
                played_word_ids: req.body.played_word_ids ?? null,
            },
            update: {
                words_solved:    wordsSolvedNum,
                total_words:     WORDS_PER_SESSION,
                total_attempts:  total_attempts ?? 0,
                bonus_eligible:  bonus_eligible ?? false,
                momentum_earned,
                completed,
            }
        } as any);

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

        const drillsToday = await prisma.drillSession.count({
            where: { student_id: student.id, status: { in: [DrillSessionStatus.DRILL_DONE, DrillSessionStatus.APPLY_DONE] }, created_at: { gte: todayStartIST() } }
        });

        if (drillsToday < FREE_SESSIONS_PER_DAY) {
            return res.status(400).json({
                success: false,
                error: `Complete all ${FREE_SESSIONS_PER_DAY} free daily sessions first.`
            });
        }

        if (student.extra_drill_credits > 0) {
            return res.status(400).json({
                success: false,
                error: 'You already have an unused extra drill session. Use it before purchasing another.',
                extra_drill_credits: student.extra_drill_credits
            });
        }

        if (drillsToday >= MAX_SESSIONS_PER_DAY) {
            return res.status(400).json({
                success: false,
                error: 'Daily drill limit reached. No more sessions available today.'
            });
        }

        // DCS gate — student must score ≥ 40% today to unlock extra drill
        const daily_dcs = await computeDailyDCS(student.id);
        if (daily_dcs < DCS_EXTRA_THRESHOLD) {
            return res.status(400).json({
                success: false,
                error: `Your Daily Competency Score (${daily_dcs}%) must be ≥${DCS_EXTRA_THRESHOLD}% to unlock an extra drill.`,
                daily_dcs,
                required_dcs: DCS_EXTRA_THRESHOLD
            });
        }

        if (student.momentum_score < EXTRA_SESSION_COST) {
            return res.status(400).json({
                success: false,
                error: `Insufficient momentum. Need ${EXTRA_SESSION_COST} pts, have ${student.momentum_score}.`
            });
        }

        // Atomic purchase: guards live in the WHERE clause so two concurrent requests
        // that both pass the soft checks above cannot both decrement.
        // If count === 0 the DB rejected the write — stale read (race) or state changed.
        const result = await prisma.institute_students.updateMany({
            where: {
                id:                  student.id,
                momentum_score:      { gte: EXTRA_SESSION_COST },
                extra_drill_credits: 0,
            },
            data: {
                momentum_score:      { decrement: EXTRA_SESSION_COST },
                extra_drill_credits: { increment: 1 },
            },
        });

        if (result.count === 0) {
            return res.status(409).json({
                success: false,
                error:   'purchase_failed',
                message: 'Purchase failed — your balance or credit status changed. Please refresh and try again.',
            });
        }

        // updateMany does not return the updated row — fetch fresh values for the response.
        const fresh = await prisma.institute_students.findUnique({
            where:  { id: student.id },
            select: { momentum_score: true, extra_drill_credits: true },
        });

        return res.json({
            success:             true,
            momentum_score:      fresh!.momentum_score,
            extra_drill_credits: fresh!.extra_drill_credits,
            message:             `${EXTRA_SESSION_COST} pts spent. Extra drill session unlocked.`,
        });
    } catch (err) {
        console.error('[AuthorizeExtra] error:', err);
        return res.status(500).json({ success: false, error: 'Internal server error.' });
    }
}
