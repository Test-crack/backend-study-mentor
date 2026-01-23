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

router.put('/profile', instructorController.updateInstructorProfile);


router.get('/courses', instructorController.getInstructorCourses);
router.post('/courses', instructorController.createInstructorCourse);
router.put('/courses/:id', instructorController.updateInstructorCourse);
router.delete('/courses/:id', instructorController.deleteInstructorCourse);

// Module management routes
router.get('/courses/:courseId/modules', instructorController.getCourseModules);
router.post('/courses/:courseId/modules', instructorController.addCourseModule);
router.put('/courses/:courseId/modules/:moduleId', instructorController.updateCourseModule);
router.delete('/courses/:courseId/modules/:moduleId', instructorController.deleteCourseModule);

// Content management routes
router.get('/courses/:courseId/modules/:moduleId', instructorController.getInstructorModuleContent);
router.post('/courses/:courseId/modules/:moduleId/content', instructorController.addModuleContent);
router.put('/courses/:courseId/modules/:moduleId/content/:contentId', instructorController.updateModuleContent);
router.delete('/courses/:courseId/modules/:moduleId/content/:contentId', instructorController.deleteModuleContent);

export default router;

