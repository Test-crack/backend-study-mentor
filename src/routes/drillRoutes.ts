import { Router } from 'express';
import { requireAuth } from '../middleware/auth';
import { ensureUser } from '../middleware/ensureUser';
import { authorize } from '../middleware/rbac';
import { requireDiagnosed } from '../middleware/requireDiagnosed';
import { UserRoleType } from '@prisma/client';
import {
    getDrillQuestions,
    saveReflection,
    startDrillSession,
    getActiveDrillSession,
    completeDrillSession,
    completeApplyDrillSession,
    saveDrillProgress,
} from '../controllers/drillController';
import { authorizeExtraDrill } from '../controllers/gameScoreController';

const router = Router();

router.use(requireAuth);
router.use(ensureUser);
router.use(authorize(UserRoleType.STUDENT));
router.use(requireDiagnosed); // no drills until the one-time diagnostic is done

// GET /api/drills/questions - Fetch N random questions (read-only, no momentum)
router.get('/questions', getDrillQuestions);

// NOTE: the legacy POST /api/drills/session (saveDrillSession) and
// POST /api/drills/apply-complete (completeApplyDrill) routes were removed —
// both awarded momentum with no idempotency/gating and were unlimited faucets.
// All drill completion now goes through the stateful session endpoints below.

// ── Stateful session endpoints (Task 3) ───────────────────────────────────────
// POST /api/drills/start - Create STARTED session + return questions (supports resume)
router.post('/start', startDrillSession);

// GET /api/drills/active - Return today's STARTED/DRILL_DONE session for resume
router.get('/active', getActiveDrillSession);

// POST /api/drills/session/:id/complete - Transition STARTED → DRILL_DONE + award momentum
router.post('/session/:id/complete', completeDrillSession);

// POST /api/drills/session/:id/apply-done - Transition DRILL_DONE → APPLY_DONE + award +30 pts
router.post('/session/:id/apply-done', completeApplyDrillSession);

// PATCH /api/drills/session/:id/progress - Persist answers mid-session (fire-and-forget)
router.patch('/session/:id/progress', saveDrillProgress);

// ── Shared endpoints ──────────────────────────────────────────────────────────
// POST /api/drills/authorize-extra - Spend 150 pts to unlock an extra drill session
router.post('/authorize-extra', authorizeExtraDrill);

// POST /api/drills/save-reflection - Save reflection text + award +25 pts
router.post('/save-reflection', saveReflection);

export default router;
