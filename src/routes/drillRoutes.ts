import { Router } from 'express';
import { requireAuth } from '../middleware/auth';
import { ensureUser } from '../middleware/ensureUser';
import { authorize } from '../middleware/rbac';
import { UserRoleType } from '@prisma/client';
import { getDrillQuestions, saveDrillSession } from '../controllers/drillController';

const router = Router();

router.use(requireAuth);
router.use(ensureUser);
router.use(authorize(UserRoleType.STUDENT));

// GET /api/drills/questions - Fetch N random questions
router.get('/questions', getDrillQuestions);

// POST /api/drills/session - Save completed session
router.post('/session', saveDrillSession);

export default router;
