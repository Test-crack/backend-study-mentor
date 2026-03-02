import { Router } from 'express';
import { getTopics, getTopicById, saveAssessment, getSpeedReadingReports, getSpeedReadingReportById, submitSpeedReadingAssessment } from '../controllers/ieltsReadingController';
import { requireAuth } from '../middleware/auth';
import { ensureUser } from '../middleware/ensureUser';

const router = Router();

// GET /api/ielts-reading/topics (List) - Public for browsing
router.get('/topics', getTopics);

// GET /api/ielts-reading/topics/:id (Detail) - Public for browsing
router.get('/topics/:id', getTopicById);

// POST /api/ielts-reading/save-assessment - Protected
router.post('/save-assessment', requireAuth, ensureUser, saveAssessment);

// Speed Reading Routes
router.get('/speed-reading/reports', getSpeedReadingReports);           // GET all reports (summary)
router.get('/speed-reading/reports/:id', getSpeedReadingReportById);   // GET single report (full with exercises)
router.post('/speed-reading/submit', submitSpeedReadingAssessment);    // POST score a session

export default router;
