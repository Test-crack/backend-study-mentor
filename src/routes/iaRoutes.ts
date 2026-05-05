import { Router } from 'express';
import { getIAEligibility, getIAStatus } from '../controllers/iaController';

const router = Router();

router.get('/eligibility', getIAEligibility); // backward compat — delegates to /status
router.get('/status',      getIAStatus);

export default router;
