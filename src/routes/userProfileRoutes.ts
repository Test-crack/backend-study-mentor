import { Router } from 'express';
import { getUserProfile, updateUserProfile } from '../controllers/userProfileController';

const router = Router();

// Middleware to log all requests
router.use((req, res, next) => {
  console.log(`[USER PROFILE ROUTES] ${req.method} ${req.url}`);
  console.log('Request body:', req.body);
  next();
});

// Route definitions
router.get('/', getUserProfile);       // Get user profile
router.put('/', updateUserProfile);    // Update user profile

export default router;
