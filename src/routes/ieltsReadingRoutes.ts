import { Router } from 'express';
import { getTopics, getTopicById } from '../controllers/ieltsReadingController';

const router = Router();

// GET /api/ielts-reading/topics (List)
router.get('/topics', getTopics);

// GET /api/ielts-reading/topics/:id (Detail)
router.get('/topics/:id', getTopicById);

export default router;
