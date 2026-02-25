import { Router } from 'express';
import { getTopics, getTopicById, saveAssessment } from '../controllers/ieltsReadingController';
import { requireAuth } from '../middleware/auth';
import { ensureUser } from '../middleware/ensureUser';

const router = Router();

// GET /api/ielts-reading/topics (List) - Public for browsing
router.get('/topics', getTopics);

// GET /api/ielts-reading/topics/:id (Detail) - Public for browsing
router.get('/topics/:id', getTopicById);

// POST /api/ielts-reading/save-assessment - Protected
router.post('/save-assessment', requireAuth, ensureUser, saveAssessment);

export default router;
