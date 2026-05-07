import { Router } from 'express';
import { getIAEligibility, getIAStatus, getIAQuestions, saveIAAnswer, submitIA } from '../controllers/iaController';

const router = Router();

router.get('/eligibility', getIAEligibility); // backward compat — delegates to /status
router.get('/status',      getIAStatus);
router.get('/questions',   getIAQuestions);
router.post('/answer',     saveIAAnswer);
router.post('/submit',     submitIA);

export default router;
