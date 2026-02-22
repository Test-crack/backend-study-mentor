import express from 'express';
import { createCheckoutSession, verifyPayment } from '../controllers/paymentController';
import { requireAuth } from '../middleware/auth';
import { ensureUser } from '../middleware/ensureUser';

const router = express.Router();

router.post('/checkout', requireAuth, ensureUser, createCheckoutSession);
router.post('/verify', requireAuth, ensureUser, verifyPayment);

export default router;
