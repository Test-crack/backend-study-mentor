import { Router } from 'express';
import { requireAuth } from '../middleware/auth';
import { ensureUser } from '../middleware/ensureUser';
import { authorize } from '../middleware/rbac';
import { UserRoleType } from '@prisma/client';
import { getDrillQuestions, saveDrillSession, completeApplyDrill, saveReflection } from '../controllers/drillController';
import { authorizeExtraDrill } from '../controllers/gameScoreController';

const router = Router();

router.use(requireAuth);
router.use(ensureUser);
router.use(authorize(UserRoleType.STUDENT));

// GET /api/drills/questions - Fetch N random questions
router.get('/questions', getDrillQuestions);

// POST /api/drills/session - Save completed session
router.post('/session', saveDrillSession);

// POST /api/drills/authorize-extra - Spend 75 pts to unlock an extra drill session
router.post('/authorize-extra', authorizeExtraDrill);

// POST /api/drills/save-reflection - Save reflection text + award +25 pts
router.post('/save-reflection', saveReflection);

// POST /api/drills/apply-complete - Award +30 pts for completing the Apply Drill step
router.post('/apply-complete', completeApplyDrill);

export default router;
