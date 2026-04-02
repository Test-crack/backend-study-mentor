// src/routes/studentRoutes.ts
import { Router } from 'express';
import { requireAuth } from '../middleware/auth';
import { ensureUser } from '../middleware/ensureUser';
import { authorize } from '../middleware/rbac';
import { UserRoleType } from '@prisma/client';
import { getStudentBatches } from '../controllers/batchController';
import { getSpeakingHistory, getCompetencyScores } from '../controllers/studentController';

const router = Router();

router.use(requireAuth);
router.use(ensureUser);
router.use(authorize(UserRoleType.STUDENT));

// GET /api/student/batches  — enrolled batches with instructors
router.get('/batches', getStudentBatches);

// GET /api/student/speaking-history — Student's own past analytics
router.get('/speaking-history', getSpeakingHistory);

// GET /api/student/competency-scores — Student's competency matrix
router.get('/competency-scores', getCompetencyScores);

export default router;
