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
// PUT   /api/superadmin/institutes/:id/exams              { examTypes: string[] (exam ids) }
// PATCH /api/superadmin/institutes/:id/exams/:examType    { billingStatus }
router.put('/institutes/:id/exams', superadminController.setInstituteExams);
router.patch('/institutes/:id/exams/:examType', superadminController.setExamStatus);

// Subscriptions (flat view across all institutes)
// GET /api/superadmin/subscriptions?status=TRIAL&search=ace
router.get('/subscriptions', superadminController.getSubscriptions);

// Exam config explorer (A4 — READ-ONLY; scoring config is file-sourced + code-reviewed)
// GET /api/superadmin/exams              — list exams (status/label)
// GET /api/superadmin/exams/:id/config   — full config entry (view / draft template)
router.get('/exams', superadminController.listExamsForConfig);
router.get('/exams/authored', superadminController.listAuthoredExams);   // before :id routes
router.get('/exams/:id/config', superadminController.getExamConfigForView);

// Config verification (Stage 0) — structural + plain-English interpretation, READ-ONLY.
// GET  /api/superadmin/exams/:id/verify  — verify a loaded exam
// POST /api/superadmin/config/verify     — verify a pasted candidate { exam, scales? }
router.get('/exams/:id/verify', superadminController.verifyExistingExamConfig);
router.post('/config/verify', superadminController.verifyCandidateConfig);

// Exam authoring lifecycle (Stage 0/1) — DRAFT → verify-gated PUBLISH → LIVE (immutable).
// Built-ins (source='file') are file-locked and rejected by every write below.
// POST   /api/superadmin/exams              — create a draft
// GET    /api/superadmin/exams/:id/draft    — fetch a draft to resume editing
// PUT    /api/superadmin/exams/:id/draft    — replace a draft's config
// POST   /api/superadmin/exams/:id/publish  — publish (draft → live/reserved)
// POST   /api/superadmin/exams/:id/disable  — take a published exam out of service
// DELETE /api/superadmin/exams/:id          — delete a draft
router.post('/exams', superadminController.createExamDraft);
router.get('/exams/:id/draft', superadminController.getExamDraft);
router.put('/exams/:id/draft', superadminController.updateExamDraft);
router.post('/exams/:id/publish', superadminController.publishExam);
router.post('/exams/:id/disable', superadminController.disableExam);
router.delete('/exams/:id', superadminController.deleteExamDraft);

export default router;