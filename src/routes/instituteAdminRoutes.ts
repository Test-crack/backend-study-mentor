// src/routes/instituteAdminRoutes.ts
import { Router } from 'express';
import { requireAuth } from '../middleware/auth';
import { ensureUser } from '../middleware/ensureUser';
import { authorize } from '../middleware/rbac';
import { UserRoleType } from '@prisma/client';
import * as ctrl from '../controllers/instituteAdminController';
import * as batch from '../controllers/batchController';

const router = Router();

// All routes: authenticated + INSTITUTE_ADMIN or INSTITUTE_OWNER
router.use(requireAuth);
router.use(ensureUser);
router.use(authorize(UserRoleType.INSTITUTE_ADMIN, UserRoleType.INSTITUTE_OWNER));

// Students
router.get('/students', ctrl.getStudents);
router.post('/students', ctrl.addStudent);
router.delete('/students/:userId', ctrl.removeStudent);
router.patch('/students/:userId/status', ctrl.updateStudentStatus);

// Tutors
router.get('/tutors', ctrl.getTutors);
router.post('/tutors', ctrl.addTutor);
router.delete('/tutors/:userId', ctrl.removeTutor);

// Batches — CRUD
router.get('/batches', batch.getBatches);
router.post('/batches', batch.createBatch);
router.get('/batches/:id', batch.getBatchDetail);
router.patch('/batches/:id', batch.updateBatch);
router.delete('/batches/:id', batch.deleteBatch);

// Batch members
router.post('/batches/:id/instructors', batch.addInstructorToBatch);
router.delete('/batches/:id/instructors/:userId', batch.removeInstructorFromBatch);
router.post('/batches/:id/students', batch.addStudentToBatch);
router.delete('/batches/:id/students/:userId', batch.removeStudentFromBatch);

export default router;
