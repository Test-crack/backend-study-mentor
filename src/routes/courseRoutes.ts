import { Router } from 'express';
import { getCourses, getCourseById, enrollUserInCourse } from '../controllers/courseController';

const router = Router();

// GET /api/courses
router.get('/', getCourses);

// GET /api/courses/:id
router.get('/:id', getCourseById);

//for testing direct enrollment, later we will do the enrollment over a webhook calll after successful payment --Sarthak
// POST /api/courses/enroll
router.post('/enroll', enrollUserInCourse);

export default router;
