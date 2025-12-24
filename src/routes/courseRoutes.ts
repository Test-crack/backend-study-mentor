import { Router } from 'express';
import { getCourses } from '../controllers/courseController';

const router = Router();

// GET /api/courses
router.get('/', getCourses);

export default router;
