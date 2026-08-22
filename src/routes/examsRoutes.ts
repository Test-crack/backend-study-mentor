// src/routes/examsRoutes.ts
import { Router } from 'express';
import { requireAuth } from '../middleware/auth';
import { ensureUser } from '../middleware/ensureUser';
import { getPublicExams, getExams } from '../controllers/examsController';

const router = Router();

// GET /api/exams/public — unauthenticated (marketing pages render before login)
router.get('/public', getPublicExams);

// GET /api/exams — authenticated; full projected config for the app
router.get('/', requireAuth, ensureUser, getExams);

export default router;
