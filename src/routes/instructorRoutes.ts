// src/routes/instructorRoutes.ts
import { Router } from 'express';
import { requireAuth } from '../middleware/auth';
import { ensureUser } from '../middleware/ensureUser';
import { authorize } from '../middleware/rbac';
import { UserRoleType } from '@prisma/client';
import * as instructorController from '../controllers/instructorController';

const router = Router();

// All instructor routes require authentication, existence check, and INSTRUCTOR role
router.use(requireAuth);
router.use(ensureUser);
router.use(authorize(UserRoleType.INSTRUCTOR, UserRoleType.ADMIN));

router.get('/courses', instructorController.getInstructorCourses);
router.post('/courses', instructorController.createInstructorCourse);

export default router;
