import { Router } from 'express';
import { getCourses, getCourseById, enrollUserInCourse, getModuleContent } from '../controllers/courseController';
import {
  markContentComplete,
  trackContentAccessEndpoint,
  getCourseResumeData,
  completeCourse,
} from '../controllers/courseController';
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

/**
 * Get resume data for a course
 * GET /api/courses/:courseId/resume
 */
router.get('/:courseId/resume', requireAuth, ensureUser, getCourseResumeData);

// GET /api/courses/:courseId/module/:orderIndex (Fetches specific module)
router.get('/:courseId/module/:orderIndex', requireAuth, ensureUser, getModuleContent);


/**
 * Mark a content item as completed
 * POST /api/courses/:courseId/modules/:moduleIndex/content/:contentItemId/complete
 */
router.post(
  '/:courseId/modules/:moduleIndex/content/:contentItemId/complete',
  requireAuth,
  ensureUser,
  markContentComplete
);

/**
 * Track content access (mark as IN_PROGRESS)
 * POST /api/courses/:courseId/modules/:moduleIndex/content/:contentItemId/access
 */
router.post(
  '/:courseId/modules/:moduleIndex/content/:contentItemId/access',
  requireAuth,
  ensureUser,
  trackContentAccessEndpoint
);

/**
 * Mark course as completed
 * POST /api/courses/:courseId/complete
 */
router.post('/:courseId/complete', requireAuth, ensureUser, completeCourse);

export default router;