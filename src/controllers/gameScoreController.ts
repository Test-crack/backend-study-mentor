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
const SKIP_GATE_COST        = 150;  // Momentum pts to skip the LexiGrid gate (must match frontend)

async function resolveStudent(appUserId: string) {
    return prisma.instituteStudent.findUnique({ where: { user_id: appUserId } });
}

// â”€â”€â”€ GET /api/student/daily-drill-state â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
export async function getDailyDrillState(req: AuthRequest, res: Response) {
    try {
        const appUserId = (req as any).appUserId as string;
        if (!appUserId) return res.status(401).json({ success: false, error: 'Unauthorized.' });

        const student = await resolveStudent(appUserId);
        if (!student) return res.status(404).json({ success: false, error: 'Student not found.' });

        // Validate streak on every load â€” resets to 0 if student missed a day
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
                    session_date: sessionToday   // exact IST date match â€” no gte skew
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
        // 0 here is a deliberate "no data yet" sentinel (out of the [4,9] band domain) â€”
        // unreachable in practice since the diagnostic populates all 4 skills before
        // the dashboard is accessible. Never fabricate a floor band for missing data.
        const current_band = validBands.length > 0
            ? Math.round((validBands.reduce((a, b) => a + b, 0) / validBands.length) * 2) / 2
            : 0;

        const drills_completed_today   = drillSessions.length;
        const lexigrid_completed_today = !!lexiGridRecord;
        // Dashboard unlocks when Drill 2 is accessed â€” still threshold of 2
        const dashboard_unlocked       = drills_completed_today >= 2;
        const extra_sessions_today     = drillSessions.filter(s => s.is_extra_session).length;
        const sessions_remaining       = MAX_SESSIONS_PER_DAY - drills_completed_today;

        // DCS needed for next_action decision and can_buy_extra gate
        const daily_dcs = await computeDailyDCS(student.id);
        const hasDCSForExtra = daily_dcs >= DCS_EXTRA_THRESHOLD;
        const hasMomForExtra = student.momentum_score >= EXTRA_SESSION_COST;

        // â”€â”€ next_action decision tree â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
        // DRILL_1 â†’ LEXIGRID gate â†’ DRILL_2 â†’ DRILL_3 (all free)
        // â†’ EXTRA_DRILL_READY   (credit already purchased, not yet consumed)
        // â†’ EXTRA_DRILL_AVAILABLE (eligible to purchase: DCSâ‰¥40% + 300 momentum pts)
        // â†’ DRILL_LOCKED_LOW_DCS / DRILL_LOCKED_INSUFFICIENT_PTS
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
            // All 4 drills done â€” hard cap reached for today
            next_action = 'DAILY_LIMIT_REACHED';
        } else if (drills_completed_today >= FREE_SESSIONS_PER_DAY) {
            if (pendingCredit) {
                // Student already paid â€” go straight to drill, no re-payment
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

// â”€â”€â”€ POST /api/student/game-score â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Body: { game_type, words_solved, total_attempts, bonus_eligible }
export async function saveGameScore(req: AuthRequest, res: Response) {
    try {
        const appUserId = (req as any).appUserId as string;
        if (!appUserId) return res.status(401).json({ success: false, error: 'Unauthorized.' });

        const student = await resolveStudent(appUserId);
        if (!student) return res.status(404).json({ success: false, error: 'Student not found.' });

        const { game_type, words_solved, total_attempts, bonus_eligible, session_token, status } = req.body;

        // â”€â”€â”€ Skip Gate branch â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
        // Frontend sends { game_type: 'LEXIGRID', status: 'skipped', momentum_spent: 150 }
        // when the student spends momentum to bypass the LexiGrid gate.
        // We ignore momentum_spent from the client and use the server constant instead.
        if (status === 'skipped') {
            if (game_type !== 'LEXIGRID') {
                return res.status(400).json({ success: false, error: 'Only the LEXIGRID gate can be skipped.' });
            }

            const sessionToday = currentISTDate();

            // Interactive transaction â€” guarantees atomicity:
            //   â€¢ Idempotency check is read-consistent with the writes
            //   â€¢ If the momentum deduct guard fails (count=0), an error is thrown
            //     which auto-rolls back the game-score INSERT, preventing a free skip
            //   â€¢ If a concurrent request races and creates the record first, the
            //     INSERT will throw a unique-constraint violation, rolling back the
            //     deduct â€” no double-spend
            const result = await prisma.$transaction(async (tx) => {
                // Idempotency: any existing record for today means the gate is already
                // open (either already skipped or already played normally). In both
                // cases just return the current balance â€” do NOT deduct again.
                const existing = await tx.studentGameScore.findFirst({
                    where: { student_id: student.id, game_type: 'LEXIGRID', session_date: sessionToday },
                    select: { id: true, words_solved: true },
                });

                if (existing) {
                    const fresh = await tx.instituteStudent.findUnique({
                        where:  { id: student.id },
                        select: { momentum_score: true },
                    });
                    return { already_done: true, momentum_score: fresh!.momentum_score };
                }

                // Atomic deduct â€” WHERE guard prevents double-spend under any race.
                // count=0 means the student does not have enough momentum right now.
                const deducted = await tx.instituteStudent.updateMany({
                    where: { id: student.id, momentum_score: { gte: SKIP_GATE_COST } },
                    data:  { momentum_score: { decrement: SKIP_GATE_COST } },
                });

                if (deducted.count === 0) {
                    // Throw to trigger transaction rollback â€” caught below as 400
                    throw Object.assign(new Error('INSUFFICIENT_MOMENTUM'), { isAppError: true, statusCode: 400 });
                }

                // Record the skip â€” completed:true is what getDailyDrillState checks
                // to determine lexigrid_completed_today and flip next_action to DRILL_2.
                // words_solved=0 and momentum_earned=0 distinguish a skip from a play.
                await tx.studentGameScore.create({
                    data: {
                        student_id:      student.id,
                        game_type:       'LEXIGRID',
                        session_date:    sessionToday,
                        words_solved:    0,
                        total_words:     WORDS_PER_SESSION,
                        total_attempts:  0,
                        bonus_eligible:  false,
                        momentum_earned: 0,
                        completed:       true,
                        skipped:         true,
                    },
                } as any);

                const fresh = await tx.instituteStudent.findUnique({
                    where:  { id: student.id },
                    select: { momentum_score: true },
                });

                return { already_done: false, momentum_score: fresh!.momentum_score };
            });

            return res.json({
                success:        true,
                skipped:        true,
                already_done:   result.already_done,
                momentum_score: result.momentum_score,
            });
        }
        // â”€â”€â”€ End skip branch â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

        if (!game_type || words_solved === undefined) {
            return res.status(400).json({ success: false, error: 'game_type and words_solved are required.' });
        }

        const wordsSolvedNum = Math.max(0, parseInt(words_solved));

        // Verify the session token for LexiGrid to prevent client-side score inflation.
        // 'missing' = offline/fallback session â†’ allow but award zero momentum.
        // 'invalid' = tampered token â†’ reject outright.
        if (game_type === 'LEXIGRID') {
            const tokenStatus = verifyLexiGridSession(session_token, student.id, wordsSolvedNum);
            if (tokenStatus === 'invalid') {
                console.warn(`[GameScore] Invalid LexiGrid session token for student ${student.id}`);
                return res.status(400).json({ success: false, error: 'Invalid session token.' });
            }
            if (tokenStatus === 'missing') {
                // Offline/fallback play â€” record the session but award no momentum.
                const sessionToday = currentISTDate();
                try {
                    await (prisma as any).studentGameScore.create({
                        data: { student_id: student.id, game_type, session_date: sessionToday, words_solved: wordsSolvedNum, total_words: WORDS_PER_SESSION, total_attempts: total_attempts ?? 0, bonus_eligible: false, momentum_earned: 0, completed: true },
                    });
                } catch (e: any) {
                    if (e?.code !== 'P2002') throw e;
                    // A record already exists today â€” refresh stats only if it is NOT yet
                    // completed, so an offline replay can't clobber the day's real gate score.
                    await (prisma as any).studentGameScore.updateMany({
                        where: { student_id: student.id, game_type, session_date: sessionToday, completed: false },
                        data:  { words_solved: wordsSolvedNum, total_words: WORDS_PER_SESSION, total_attempts: total_attempts ?? 0 },
                    });
                }
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
        // Bonus requires all 5 words solved within 2 attempts each. Enforce a server-side
        // plausibility bound on total_attempts so the client can't just assert the bonus:
        // "â‰¤2 tries for each of 5 words" â‡’ at most 10 attempts total.
        const attemptsUsed  = Math.max(0, parseInt(total_attempts ?? '0'));
        const bonusEarned   = (bonus_eligible === true || bonus_eligible === 'true')
            && wordsSolvedNum >= WORDS_PER_SESSION
            && attemptsUsed <= WORDS_PER_SESSION * 2;
        const momentum_earned = game_type === 'LEXIGRID'
            ? wordsSolvedNum * POINTS_PER_WORD + (bonusEarned ? LEXIGRID_BONUS_PTS : 0)
            : 0;

        // One record per student per game per IST calendar day
        const sessionToday = currentISTDate();
        const dailyKey = { student_id_game_type_session_date: { student_id: student.id, game_type, session_date: sessionToday } };

        // Race-safe first-completion claim: the request that WINS the INSERT is the
        // day's first completion and is the only one allowed to award momentum. A
        // concurrent duplicate (e.g. the localStorage pending-submit retry firing while
        // the original request is still in flight) hits the unique constraint, falls to
        // the update branch, and awards nothing â€” no double-award. (Previously a
        // check-then-upsert-then-increment could double-award under that race.)
        let isFirstCompletion = false;
        try {
            await prisma.studentGameScore.create({
                data: {
                    student_id:      student.id,
                    game_type,
                    session_date:    sessionToday,
                    words_solved:    wordsSolvedNum,
                    total_words:     WORDS_PER_SESSION,
                    total_attempts:  total_attempts ?? 0,
                    bonus_eligible:  bonusEarned,
                    momentum_earned,
                    completed,
                    played_word_ids: req.body.played_word_ids ?? null,
                } as any,
            });
            isFirstCompletion = true;
        } catch (e: any) {
            if (e?.code !== 'P2002') throw e;
            // A record for today already exists. Only refresh stats if it is NOT yet
            // completed â€” a standalone replay must not overwrite the day's real gate
            // score with a (possibly worse, momentum-0) replay. Awards no momentum either way.
            await prisma.studentGameScore.updateMany({
                where: { student_id: student.id, game_type, session_date: sessionToday, completed: false },
                data: {
                    words_solved:    wordsSolvedNum,
                    total_words:     WORDS_PER_SESSION,
                    total_attempts:  total_attempts ?? 0,
                    bonus_eligible:  bonusEarned,
                    played_word_ids: req.body.played_word_ids ?? undefined,
                } as any,
            });
        }

        // Award momentum only to the request that won the insert â€” idempotent under retries.
        let updated_momentum = student.momentum_score;
        if (isFirstCompletion && momentum_earned > 0) {
            const updatedStudent = await prisma.instituteStudent.update({
                where: { id: student.id },
                data:  { momentum_score: { increment: momentum_earned } },
            });
            updated_momentum = updatedStudent.momentum_score;
        }

        const record = await prisma.studentGameScore.findUnique({ where: dailyKey });

        return res.json({
            success: true,
            data: record,
            momentum_earned,
            momentum_score: updated_momentum,
        });
    } catch (err: any) {
        if (err?.message === 'INSUFFICIENT_MOMENTUM') {
            return res.status(400).json({
                success: false,
                error:   `Insufficient momentum. You need ${SKIP_GATE_COST} pts to skip the LexiGrid gate.`,
                required: SKIP_GATE_COST,
            });
        }
        // Concurrent skip double-tap: the second request's INSERT hits the unique
        // (student, game, date) constraint and rolls back its own deduct. The gate is
        // already open â€” return a clean already_done with the current balance, not a 500.
        if (err?.code === 'P2002') {
            const fresh = await prisma.instituteStudent.findUnique({
                where: { user_id: (req as any).appUserId as string }, select: { momentum_score: true },
            });
            return res.json({ success: true, already_done: true, momentum_score: fresh?.momentum_score ?? 0 });
        }
        console.error('[GameScore] saveGameScore error:', err);
        return res.status(500).json({ success: false, error: 'Internal server error.' });
    }
}

// â”€â”€â”€ POST /api/drills/authorize-extra â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Deducts EXTRA_DRILL_COST (300) pts to authorise one extra drill beyond the free daily limit.
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

        // DCS gate â€” student must score â‰¥ 40% today to unlock extra drill
        const daily_dcs = await computeDailyDCS(student.id);
        if (daily_dcs < DCS_EXTRA_THRESHOLD) {
            return res.status(400).json({
                success: false,
                error: `Your Daily Competency Score (${daily_dcs}%) must be â‰¥${DCS_EXTRA_THRESHOLD}% to unlock an extra drill.`,
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
        // If count === 0 the DB rejected the write â€” stale read (race) or state changed.
        const result = await prisma.instituteStudent.updateMany({
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
                message: 'Purchase failed â€” your balance or credit status changed. Please refresh and try again.',
            });
        }

        // updateMany does not return the updated row â€” fetch fresh values for the response.
        const fresh = await prisma.instituteStudent.findUnique({
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
