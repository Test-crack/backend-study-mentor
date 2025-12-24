import { Router } from 'express';
import { getCourses, getCourseById } from '../controllers/courseController';

const router = Router();

// GET /api/courses
router.get('/', getCourses);

// GET /api/courses/:id
router.get('/:id', getCourseById);

export default router;
