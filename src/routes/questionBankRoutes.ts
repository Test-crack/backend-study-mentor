// src/routes/questionBankRoutes.ts
//
// Read-only Question-Bank inventory for the superadmin dashboard. Authenticated
// + SUPERADMIN only, same guard chain as the verification/loadout panels.
import { Router } from 'express';
import { requireAuth } from '../middleware/auth';
import { ensureUser } from '../middleware/ensureUser';
import { authorize } from '../middleware/rbac';
import { UserRoleType } from '@prisma/client';
import * as questionBankController from '../controllers/questionBankController';

const router = Router();

router.use(requireAuth);
router.use(ensureUser);
router.use(authorize(UserRoleType.SUPERADMIN));

// GET /api/superadmin/question-bank/summary
// Counts per exam → component → skill → sub-skill → level.
router.get('/summary', questionBankController.getQuestionBankSummary);

export default router;
