import { Router } from 'express';
import { getCourses, getCourseById, enrollUserInCourse, getModuleContent } from '../controllers/courseController';
import { requireAuth } from '../middleware/auth';
import { ensureUser } from '../middleware/ensureUser';

const router = Router();

// GET /api/courses
router.get('/', getCourses);

// GET /api/courses/:id
router.get('/:id', getCourseById);

//for testing direct enrollment, later we will do the enrollment over a webhook calll after successful payment --Sarthak
// POST /api/courses/enroll
router.post('/enroll', requireAuth, ensureUser, enrollUserInCourse);

// GET /api/courses/:courseId/module (Resumes at current module_index)
router.get('/:courseId/module', requireAuth, ensureUser, getModuleContent);

// GET /api/courses/:courseId/module/:orderIndex (Fetches specific module)
router.get('/:courseId/module/:orderIndex', requireAuth, ensureUser, getModuleContent);

export default router;
