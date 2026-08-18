// src/routes/superadminRoutes.ts
import { Router } from 'express';
import { requireAuth } from '../middleware/auth';
import { ensureUser } from '../middleware/ensureUser';
import { authorize } from '../middleware/rbac';
import { UserRoleType } from '@prisma/client';
import * as superadminController from '../controllers/superadminController';

const router = Router();

// All superadmin routes: authenticated + SUPERADMIN role only
router.use(requireAuth);
router.use(ensureUser);
router.use(authorize(UserRoleType.SUPERADMIN));

// Users
// GET /api/superadmin/users?role=STUDENT&search=john&page=1&limit=50
router.get('/users', superadminController.getAllUsers);

// Institutes
// GET   /api/superadmin/institutes?search=ace
// POST  /api/superadmin/institutes            { instituteName, address?, ownerName, ownerEmail, ownerPhone?, examTypes[] }
// PATCH /api/superadmin/institutes/:id/status { isActive: boolean }
// PATCH /api/superadmin/institutes/:id        { name?, address?, logoUrl?, contactEmail?, contactPhone? }
router.get('/institutes', superadminController.getInstitutes);
router.post('/institutes', superadminController.createInstitute);
router.patch('/institutes/:id/status', superadminController.toggleInstituteStatus);
router.patch('/institutes/:id', superadminController.updateInstitute);

// Institute exam subscriptions
// PUT   /api/superadmin/institutes/:id/exams              { examTypes: ExamType[] }
// PATCH /api/superadmin/institutes/:id/exams/:examType    { billingStatus }
router.put('/institutes/:id/exams', superadminController.setInstituteExams);
router.patch('/institutes/:id/exams/:examType', superadminController.setExamStatus);

// Subscriptions (flat view across all institutes)
// GET /api/superadmin/subscriptions?status=TRIAL&search=ace
router.get('/subscriptions', superadminController.getSubscriptions);

export default router;