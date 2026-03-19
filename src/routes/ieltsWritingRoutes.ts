import { Router } from 'express';
import { requireAuth } from '../middleware/auth';
import { ensureUser } from '../middleware/ensureUser';
import { getWritingTasks, submitWriting, getWritingHistory } from '../controllers/ieltsWritingController';

const router = Router();

// Routes
router.get('/', requireAuth, ensureUser, getWritingTasks);
router.post('/submit', requireAuth, ensureUser, submitWriting);
router.get('/history', requireAuth, ensureUser, getWritingHistory);

export default router;
