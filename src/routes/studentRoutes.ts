// src/routes/studentRoutes.ts
import { Router } from 'express';
import { requireAuth } from '../middleware/auth';
import { ensureUser } from '../middleware/ensureUser';
import { authorize } from '../middleware/rbac';
import { UserRoleType } from '@prisma/client';
import { getStudentBatches } from '../controllers/batchController';

const router = Router();

router.use(requireAuth);
router.use(ensureUser);
router.use(authorize(UserRoleType.STUDENT));

// GET /api/student/batches  — enrolled batches with instructors
router.get('/batches', getStudentBatches);

export default router;
