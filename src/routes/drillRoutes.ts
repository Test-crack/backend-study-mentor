import { Router } from 'express';
import { requireAuth } from '../middleware/auth';
import { ensureUser } from '../middleware/ensureUser';
import { authorize } from '../middleware/rbac';
import { UserRoleType } from '@prisma/client';
import {
    getDrillQuestions,
    saveDrillSession,
    completeApplyDrill,
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

// ── Legacy endpoints (kept for backward compatibility) ────────────────────────
// GET /api/drills/questions - Fetch N random questions (used by legacy path)
router.get('/questions', getDrillQuestions);

// POST /api/drills/session - Save completed session (legacy)
router.post('/session', saveDrillSession);

// POST /api/drills/apply-complete - Award +30 pts (legacy)
router.post('/apply-complete', completeApplyDrill);

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
