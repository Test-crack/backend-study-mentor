// src/routes/instituteAdminRoutes.ts
import { Router } from 'express';
import { requireAuth } from '../middleware/auth';
import { ensureUser } from '../middleware/ensureUser';
import { authorize } from '../middleware/rbac';
import { UserRoleType } from '@prisma/client';
import * as ctrl from '../controllers/instituteAdminController';

const router = Router();

// All routes: authenticated + INSTITUTE_ADMIN or INSTITUTE_OWNER
router.use(requireAuth);
router.use(ensureUser);
router.use(authorize(UserRoleType.INSTITUTE_ADMIN, UserRoleType.INSTITUTE_OWNER));

// Students
// GET    /api/institute-admin/students          — list all students
// POST   /api/institute-admin/students          — invite + enroll student
// DELETE /api/institute-admin/students/:userId  — remove student
// PATCH  /api/institute-admin/students/:userId/status  — activate/deactivate
router.get('/students', ctrl.getStudents);
router.post('/students', ctrl.addStudent);
router.delete('/students/:userId', ctrl.removeStudent);
router.patch('/students/:userId/status', ctrl.updateStudentStatus);

// Tutors
// GET    /api/institute-admin/tutors            — list all tutors
// POST   /api/institute-admin/tutors            — invite + onboard tutor
// DELETE /api/institute-admin/tutors/:userId    — remove tutor
router.get('/tutors', ctrl.getTutors);
router.post('/tutors', ctrl.addTutor);
router.delete('/tutors/:userId', ctrl.removeTutor);

export default router;
