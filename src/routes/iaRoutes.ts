import { Router } from 'express';
import multer from 'multer';
import { requireAuth } from '../middleware/auth';
import { getIAEligibility, getIAStatus, getIAQuestions, saveIAAnswer, submitIA } from '../controllers/iaController';
import { getSpokenEnglishIA, submitSpokenEnglishIA } from '../controllers/spokenEnglishIAController';

const router = Router();

// Spoken English IA answers are audio (one file per prompt, fieldname = question id).
const upload = multer({ dest: 'uploads/', limits: { fileSize: 15 * 1024 * 1024, files: 12 } });

router.use(requireAuth);

router.get('/eligibility', getIAEligibility); // backward compat — delegates to /status
router.get('/status',      getIAStatus);
router.get('/questions',   getIAQuestions);
router.post('/answer',     saveIAAnswer);
router.post('/submit',     submitIA);

// Spoken English (parallel viva-graded IA). Scheduling still comes from /status above.
router.get('/se/questions', getSpokenEnglishIA);
router.post('/se/submit',   upload.any(), submitSpokenEnglishIA);

export default router;
