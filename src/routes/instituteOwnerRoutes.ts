// src/routes/instituteOwnerRoutes.ts
import { Router } from 'express';
import { requireAuth } from '../middleware/auth';
import { ensureUser } from '../middleware/ensureUser';
import { authorize } from '../middleware/rbac';
import { UserRoleType } from '@prisma/client';
import * as instituteOwnerController from '../controllers/instituteOwnerController';
import { getBatchReadingAnalytics } from '../controllers/readingPracticeController';

const router = Router();

// All routes: authenticated + INSTITUTE_OWNER role only
router.use(requireAuth);
router.use(ensureUser);
router.use(authorize(UserRoleType.INSTITUTE_OWNER));

// Admins
// GET    /api/institute-owner/admins              — list all admins
// POST   /api/institute-owner/admins              — invite + add admin
// DELETE /api/institute-owner/admins/:userId      — remove admin
router.get('/admins', instituteOwnerController.getAdmins);
router.post('/admins', instituteOwnerController.addAdmin);
router.delete('/admins/:userId', instituteOwnerController.removeAdmin);

// Batches
// GET    /api/institute-owner/batches/:batchId/analytics
router.get('/batches/:batchId/analytics', instituteOwnerController.getBatchAnalytics);
// GET    /api/institute-owner/batches/:batchId/reading-analytics
router.get('/batches/:batchId/reading-analytics', getBatchReadingAnalytics);

export default router;

