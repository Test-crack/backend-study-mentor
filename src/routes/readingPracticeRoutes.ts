/**
 * readingPracticeRoutes.ts
 *
 * Routes for the IELTS Reading Practice feature (student-facing).
 * Mounted at: /api/reading-practice
 *
 * POST /api/reading-practice/submit   — score + save a session
 * GET  /api/reading-practice/history  — student's own session history
 */

import { Router } from 'express';
import { requireAuth } from '../middleware/auth';
import { ensureUser } from '../middleware/ensureUser';
import { submitReadingPractice, getMyReadingHistory } from '../controllers/readingPracticeController';

const router = Router();

// All routes require authentication
router.use(requireAuth);
router.use(ensureUser);

router.post('/submit', submitReadingPractice);
router.get('/history', getMyReadingHistory);

export default router;
